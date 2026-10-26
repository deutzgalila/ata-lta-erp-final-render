/**
 * Tests for Parcel 1: Work Request Creation Gate
 * Covers CONTRACT.md Policy R1, R2, and HTTP endpoints.
 */

jest.mock('../../../services/supabaseClient', () => {
  const { supabaseAdmin } = require('../../../../tests/fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('../../../../tests/helpers/testServer');
const { registerUser, seedDefaults, resetMock } = require('../../../../tests/fixtures/supabaseMock');

describe('Parcel 1: Work Request Creation Admission Gate', () => {
  let adminToken;
  let managerToken;
  let employeeToken;
  let client;

  beforeEach(async () => {
    resetMock();
    seedDefaults();

    adminToken = registerUser({
      email: 'admin-gate@ata-lta.ph',
      name: 'Admin Gate',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    });

    managerToken = registerUser({
      email: 'manager-gate@ata-lta.ph',
      name: 'Manager Gate',
      role: 'Manager',
      entities: ['ATA', 'LTA'],
    });

    employeeToken = registerUser({
      email: 'staff-gate@ata-lta.ph',
      name: 'Staff Gate',
      role: 'Operations', // Employee role (not Admin or Manager)
      entities: ['ATA', 'LTA'],
    });

    // Create client via admin
    const clientRes = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        name: 'Gate Client Corp',
        tin: '111-222-333-000',
        entity: 'ATA',
      })
      .expect(201);
    client = clientRes.body.data;
  });

  describe('Policy R1: Creation Gate & Role Enforcement', () => {
    it('Admin creates an approved work request with review attribution and no fake phase op req', async () => {
      const res = await request(app)
        .post('/v1/work-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Admin Created WR',
          clientId: client.id,
          entity: 'ATA',
          dueDate: '2026-12-31',
        })
        .expect(201);

      const wr = res.body.data;
      expect(wr.title).toBe('Admin Created WR');
      expect(wr.creationApprovalStatus).toBe('approved');
      expect(wr.reviewedBy).toBeTruthy();
      expect(wr.reviewedAt).toBeTruthy();
      expect(wr.rejectionReason).toBeNull();
      expect(wr.phase).toBe('pre_processing'); // Preserved initial phase, not auto-advanced
    });

    it('Manager creates a pending work request without auto-advancing phase', async () => {
      const res = await request(app)
        .post('/v1/work-requests')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Manager Created Pending WR',
          clientId: client.id,
          entity: 'ATA',
          dueDate: '2026-12-31',
        })
        .expect(201);

      const wr = res.body.data;
      expect(wr.title).toBe('Manager Created Pending WR');
      expect(wr.creationApprovalStatus).toBe('pending');
      expect(wr.reviewedBy).toBeNull();
      expect(wr.reviewedAt).toBeNull();
      expect(wr.rejectionReason).toBeNull();
      expect(wr.canReviewCreation).toBe(false);
      expect(wr.canResubmit).toBe(false);
      expect(wr.phase).toBe('pre_processing');
    });

    it('denies work request creation to regular employees', async () => {
      const res = await request(app)
        .post('/v1/work-requests')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Employee WR',
          clientId: client.id,
          entity: 'ATA',
          dueDate: '2026-12-31',
        })
        .expect(403);

      expect(res.body.title).toBe('Forbidden');
    });

    it('strips client-forged approval fields on creation', async () => {
      const res = await request(app)
        .post('/v1/work-requests')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Manager Attempting Spoof',
          clientId: client.id,
          entity: 'ATA',
          dueDate: '2026-12-31',
          creationApprovalStatus: 'approved',
          reviewedBy: 'some-fake-id',
          reviewedAt: '2026-01-01T00:00:00Z',
        })
        .expect(201);

      const wr = res.body.data;
      // Must ignore the forged 'approved' status and force 'pending' for Manager
      expect(wr.creationApprovalStatus).toBe('pending');
      expect(wr.reviewedBy).toBeNull();
      expect(wr.reviewedAt).toBeNull();
    });
  });

  describe('Policy R2: Visibility Gating', () => {
    let pendingWrId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/v1/work-requests')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Hidden Pending WR',
          clientId: client.id,
          entity: 'ATA',
          dueDate: '2026-12-31',
        })
        .expect(201);
      pendingWrId = res.body.data.id;
    });

    it('excludes pending work requests from ordinary listWorkRequests', async () => {
      const listRes = await request(app)
        .get('/v1/work-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      const found = listRes.body.data.find((w) => w.id === pendingWrId);
      expect(found).toBeUndefined();
    });

    it('excludes pending work requests from counts', async () => {
      const countsRes = await request(app)
        .get('/v1/work-requests/counts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      // Pending WR should not increment active/all count
      expect(countsRes.body.data.active).toBe(0);
      expect(countsRes.body.data.all).toBe(0);
    });

    it('returns 404 for pending work requests on normal getWorkRequestById for regular employees', async () => {
      await request(app)
        .get(`/v1/work-requests/${pendingWrId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(404);
    });

    it('returns 404 for pending work requests on normal getWorkRequestById for non-review context', async () => {
      await request(app)
        .get(`/v1/work-requests/${pendingWrId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(404);
    });
  });

  describe('Policy R2 & HTTP Contract: Creation Approvals Endpoints', () => {
    let pendingWr;

    beforeEach(async () => {
      const res = await request(app)
        .post('/v1/work-requests')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Manager WR for Review',
          clientId: client.id,
          entity: 'ATA',
          dueDate: '2026-12-31',
        })
        .expect(201);
      pendingWr = res.body.data;
    });

    it('GET /creation-approvals: Admin lists all pending submissions with canReviewCreation: true', async () => {
      const res = await request(app)
        .get('/v1/operations/work-requests/creation-approvals?status=pending&scope=all')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((w) => w.id === pendingWr.id);
      expect(found).toBeDefined();
      expect(found.creationApprovalStatus).toBe('pending');
      expect(found.canReviewCreation).toBe(true);
      expect(found.canResubmit).toBe(false);
      expect(Array.isArray(found.tasks)).toBe(true);
    });

    it('GET /creation-approvals: Manager sees own submissions with canResubmit: false while pending', async () => {
      const res = await request(app)
        .get('/v1/operations/work-requests/creation-approvals?status=pending&scope=mine')
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      const found = res.body.data.find((w) => w.id === pendingWr.id);
      expect(found).toBeDefined();
      expect(found.canReviewCreation).toBe(false);
      expect(found.canResubmit).toBe(false);
    });

    it('GET /creation-approvals: rejects ordinary employees with 403', async () => {
      await request(app)
        .get('/v1/operations/work-requests/creation-approvals')
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(403);
    });

    it('POST /creation-approval: Admin approves pending WR', async () => {
      const res = await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/creation-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          decision: 'approve',
          expectedVersion: pendingWr.version,
        })
        .expect(200);

      expect(res.body.data.creationApprovalStatus).toBe('approved');
      expect(res.body.data.reviewedBy).toBeTruthy();
      expect(res.body.data.reviewedAt).toBeTruthy();
      expect(res.body.data.version).toBe(pendingWr.version + 1);

      // Now it appears in ordinary list
      const listRes = await request(app)
        .get('/v1/work-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);
      const found = listRes.body.data.find((w) => w.id === pendingWr.id);
      expect(found).toBeDefined();
    });

    it('POST /creation-approval: Admin rejects pending WR (requires reason)', async () => {
      // Rejection without reason fails
      await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/creation-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          decision: 'reject',
          expectedVersion: pendingWr.version,
        })
        .expect(400);

      // Rejection with reason succeeds
      const res = await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/creation-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          decision: 'reject',
          reason: 'Scope is too vague',
          expectedVersion: pendingWr.version,
        })
        .expect(200);

      expect(res.body.data.creationApprovalStatus).toBe('rejected');
      expect(res.body.data.rejectionReason).toBe('Scope is too vague');
      expect(res.body.data.version).toBe(pendingWr.version + 1);
    });

    it('POST /creation-approval: Manager cannot approve/reject WR (403)', async () => {
      await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/creation-approval`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          decision: 'approve',
          expectedVersion: pendingWr.version,
        })
        .expect(403);
    });

    it('POST /creation-approval: returns 409 on version conflict', async () => {
      await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/creation-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          decision: 'approve',
          expectedVersion: 999, // Stale version
        })
        .expect(409);
    });

    it('POST /resubmit-creation: Creator corrects and resubmits rejected WR', async () => {
      // First reject it
      const rejectRes = await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/creation-approval`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          decision: 'reject',
          reason: 'Needs clearer deliverables',
          expectedVersion: pendingWr.version,
        })
        .expect(200);

      const rejectedWr = rejectRes.body.data;
      expect(rejectedWr.creationApprovalStatus).toBe('rejected');

      // Resubmit by non-creator fails (403)
      await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/resubmit-creation`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          expectedVersion: rejectedWr.version,
        })
        .expect(403);

      // Resubmit by creator with updated description succeeds
      const resubmitRes = await request(app)
        .post(`/v1/operations/work-requests/${pendingWr.id}/resubmit-creation`)
        .set('Authorization', `Bearer ${managerToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          expectedVersion: rejectedWr.version,
          data: {
            description: 'Updated with detailed deliverable list',
          },
        })
        .expect(200);

      const resubmitted = resubmitRes.body.data;
      expect(resubmitted.creationApprovalStatus).toBe('pending');
      expect(resubmitted.description).toBe('Updated with detailed deliverable list');
      expect(resubmitted.rejectionReason).toBeNull();
      expect(resubmitted.version).toBe(rejectedWr.version + 1);
    });
  });
});
