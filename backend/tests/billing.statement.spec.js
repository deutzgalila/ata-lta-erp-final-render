jest.mock('../src/services/supabaseClient', () => ({
  supabaseAdmin: require('./fixtures/supabaseMock').supabaseAdmin,
}));
jest.mock('../src/services/pdfService', () => ({
  generatePdf: jest.fn(async () => Buffer.from('pdf')),
}));
jest.mock('../src/services/storageService', () => {
  const actual = jest.requireActual('../src/services/storageService');
  return { ...actual, uploadBuffer: jest.fn(actual.uploadBuffer) };
});
const request = require('supertest');
const { app } = require('./helpers/testServer');
const {
  registerUser,
  seedDefaults,
  resetMock,
  mockTables,
  mockStorageObjects,
} = require('./fixtures/supabaseMock');
const { generatePdf } = require('../src/services/pdfService');
const { uploadBuffer } = require('../src/services/storageService');
const { buildStatementDocument } = require('../src/modules/billing/statementDocument');
const clientId = '11111111-1111-1111-1111-111111111111';
const workRequestId = '33333333-3333-3333-3333-333333333333';
let admin, accounting, invoice;
const api = (token) =>
  request(app)
    .patch(`/v1/invoices/${invoice.id}`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Active-Entity', 'ATA');
beforeEach(async () => {
  resetMock();
  seedDefaults();
  jest.clearAllMocks();
  mockTables.clients.set(clientId, {
    id: clientId,
    entity_id: 'ent-ata',
    name: 'Manila Trading',
    address: 'Manila',
  });
  mockTables.work_requests.set(workRequestId, {
    id: workRequestId,
    entity_id: 'ent-ata',
    client_id: clientId,
    title: 'Audit',
    status: 'In Progress',
  });
  admin = registerUser({ email: 'admin@example.test', role: 'Admin', entities: ['ATA'] });
  accounting = registerUser({
    email: 'accounting@example.test',
    role: 'Accounting',
    entities: ['ATA'],
  });
  const res = await request(app)
    .post('/v1/invoices')
    .set('Authorization', `Bearer ${admin}`)
    .set('X-Active-Entity', 'ATA')
    .send({
      clientId,
      workRequestId,
      invoiceNumber: 'ATA-100',
      issueDate: '2026-10-19',
      dueDate: '2026-11-19',
      lineItems: [{ description: 'Audit', amount: 1500 }],
    })
    .expect(201);
  invoice = res.body.data;
  mockTables.invoices.get(invoice.id).status = 'Sent';
});
it('persists admin line item and statement edits on a released invoice without mutating the client', async () => {
  const before = JSON.stringify(mockTables.clients.get(clientId));
  const details = {
    notedBy: 'Reyes & Cruz',
    preparedBy: 'M. Santos',
    receivedBy: 'L. Tan',
    bankBranch: 'BDO Manila',
    cash: '',
  };
  const res = await api(admin)
    .send({
      lineItems: [{ description: 'Revised audit', amount: 1800 }],
      printDetails: details,
      expectedVersion: invoice.version,
    })
    .expect(200);
  expect(res.body.data.total).toBe(1800);
  expect(res.body.data.balance).toBe(1800);
  expect(res.body.data.print_details).toEqual(details);
  expect(res.body.data.version).toBe(invoice.version + 1);
  expect(JSON.stringify(mockTables.clients.get(clientId))).toBe(before);
});
it('rejects non-admin statement edits, including a mixed authorized address payload', async () => {
  await api(accounting)
    .send({
      address: 'New address',
      printDetails: { notedBy: 'Spoofed' },
      expectedVersion: invoice.version,
    })
    .expect(403);
  expect(mockTables.invoices.get(invoice.id).print_details).toBeUndefined();
});
it('continues to restrict released financial edits for non-admins', async () => {
  await api(accounting)
    .send({ lineItems: [{ description: 'Changed', amount: 2 }], expectedVersion: invoice.version })
    .expect(409);
});
it('rejects missing and stale versions without changing line items or statement details', async () => {
  await api(admin)
    .send({ printDetails: { notedBy: 'Changed' } })
    .expect(400);
  await api(admin)
    .send({
      printDetails: { notedBy: 'Changed' },
      lineItems: [{ description: 'Changed', amount: 99 }],
      expectedVersion: invoice.version + 1,
    })
    .expect(409);
  expect(mockTables.invoices.get(invoice.id).total).toBe(1500);
  expect(mockTables.invoices.get(invoice.id).print_details).toBeUndefined();
  expect(
    [...mockTables.invoice_line_items.values()].find((li) => li.invoice_id === invoice.id)
      .description
  ).toBe('Audit');
});
it('rejects lowering a total below recorded payments', async () => {
  mockTables.invoices.get(invoice.id).amount_paid = 1000;
  await api(admin)
    .send({
      lineItems: [{ description: 'Changed', amount: 500 }],
      expectedVersion: invoice.version,
    })
    .expect(400);
  expect(mockTables.invoices.get(invoice.id).total).toBe(1500);
});
it.each(['true', 'false'])(
  'generates the canonical PDF with includeCompanyDetails=%s and a stable invoice-number storage path',
  async (toggle) => {
    const stored = mockTables.invoices.get(invoice.id);
    stored.print_details = {
      preparedBy: 'M. Santos',
      receivedBy: 'L. Tan',
      bankBranch: '<script>bad</script>',
    };
    const getPdf = () =>
      request(app)
        .get(`/v1/invoices/${invoice.id}/pdf?includeCompanyDetails=${toggle}`)
        .set('Authorization', `Bearer ${admin}`)
        .set('X-Active-Entity', 'ATA');
    await getPdf().expect(200);
    const html = generatePdf.mock.calls[0][0].html;
    expect(html).toContain('M. Santos');
    expect(html).toContain('L. Tan');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html.includes('<img')).toBe(toggle === 'true');
    expect(html.includes('A.T.A. BUSINESS CONSULTANCY')).toBe(toggle === 'true');
    expect(html).toContain('margin: 15mm 20mm');
    if (toggle === 'true') expect(html).toContain('data:image/jpeg;base64,');
    await getPdf().expect(200);
    const suffix = toggle === 'true' ? '' : '-no-company-details';
    const expectedPath = `entities/ATA/invoices/${invoice.id}/pdf/ATA-100${suffix}.pdf`;
    expect(uploadBuffer.mock.calls[0][0].path).toBe(expectedPath);
    expect(uploadBuffer.mock.calls[1][0].path).toBe(expectedPath);
    expect(mockStorageObjects.size).toBe(1);
  }
);
it.each([true, false])(
  'replaces regenerated files while preserving the other branding variant (first branded=%s)',
  async (firstBranded) => {
    const brandedPath = `entities/ATA/invoices/${invoice.id}/pdf/ATA-100.pdf`;
    const plainPath = `entities/ATA/invoices/${invoice.id}/pdf/ATA-100-no-company-details.pdf`;
    const firstPath = firstBranded ? brandedPath : plainPath;
    const otherPath = firstBranded ? plainPath : brandedPath;
    const getPdf = (includeCompanyDetails) =>
      request(app)
        .get(
          `/v1/invoices/${invoice.id}/pdf${includeCompanyDetails ? '' : '?includeCompanyDetails=false'}`
        )
        .set('Authorization', `Bearer ${admin}`)
        .set('X-Active-Entity', 'ATA');
    generatePdf
      .mockResolvedValueOnce(Buffer.from('first version'))
      .mockResolvedValueOnce(Buffer.from('other variant'))
      .mockResolvedValueOnce(Buffer.from('replacement'));
    await getPdf(firstBranded).expect(200);
    await getPdf(!firstBranded).expect(200);
    await getPdf(firstBranded).expect(200);
    expect(mockStorageObjects.size).toBe(2);
    expect(mockStorageObjects.get(firstPath).buffer).toEqual(Buffer.from('replacement'));
    expect(mockStorageObjects.get(otherPath).buffer).toEqual(Buffer.from('other variant'));
  }
);
it('validates the PDF toggle', async () => {
  await request(app)
    .get(`/v1/invoices/${invoice.id}/pdf?includeCompanyDetails=maybe`)
    .set('Authorization', `Bearer ${admin}`)
    .set('X-Active-Entity', 'ATA')
    .expect(400);
});
it.each(['ATA', 'LTA'])('escapes statement values and omits branding for %s', (entity) => {
  const html = buildStatementDocument(
    {
      ...invoice,
      entity_code: entity,
      clients: { name: '<svg onload=alert(1)>' },
      print_details: { notedBy: '<img src=x>', receivedBy: 'L. Tan' },
    },
    { includeCompanyDetails: false }
  );
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<svg');
  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).toContain('L. Tan');
});
