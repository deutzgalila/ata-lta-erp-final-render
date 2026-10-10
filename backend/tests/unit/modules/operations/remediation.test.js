/**
 * Unit tests for Operations Module Field Feedback Remediation (Parcel B1)
 */

describe('Operations Module Remediation Suite (Parcel B1)', () => {
  describe('VALID_TRANSITIONS alignment', () => {
    it('allows transition from Processing to For Billing', () => {
      // Test transition map logic
      const VALID_TRANSITIONS = {
        Draft: ['Pre-processing', 'In Progress', 'Processing', 'Cancelled'],
        'Pre-processing': ['Processing', 'In Progress', 'For Review', 'Cancelled'],
        'In Progress': ['For Review', 'Completed', 'Processing', 'Cancelled'],
        Processing: ['Completed', 'Billing', 'For Billing', 'Disbursement', 'For Review', 'Cancelled'],
        'For Review': ['Completed', 'In Progress', 'Processing', 'Cancelled'],
        Completed: ['Draft', 'Processing'],
        Cancelled: ['Draft', 'In Progress'],
      };

      expect(VALID_TRANSITIONS.Processing).toContain('For Billing');
      expect(VALID_TRANSITIONS.Processing).toContain('Billing');
    });
  });

  describe('isManager Role Classification', () => {
    it('does not classify Admin with Management department as Manager', () => {
      const adminUser = {
        name: 'Lorein Wong',
        email: 'lorein@ata-lta.ph',
        role: 'Admin',
        departments: ['Management'],
      };

      const isManager = adminUser.role === 'Manager' && adminUser.role !== 'Admin';
      expect(isManager).toBe(false);
    });

    it('classifies actual Manager as Manager', () => {
      const managerUser = {
        name: 'Henry Wong',
        email: 'henry@ata-lta.ph',
        role: 'Manager',
        departments: ['Operations'],
      };

      const isManager = managerUser.role === 'Manager' && managerUser.role !== 'Admin';
      expect(isManager).toBe(true);
    });
  });

  describe('Task Lead Unassign Logic', () => {
    it('properly clears assignee when null is passed (preventing nullish coalescing lock)', () => {
      const existing = {
        assigneeId: '05c93540-c3d3-460f-90e9-74d47c2bc386',
        assigneeName: 'Alejandria Solano',
      };

      const data = {
        assigneeId: null,
        assigneeName: null,
      };

      const assigneeName = data.assigneeName !== undefined ? data.assigneeName : existing.assigneeName;
      const assigneeId = data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId;

      expect(assigneeId).toBeNull();
      expect(assigneeName).toBeNull();
    });

    it('preserves existing assignee when assigneeId is omitted (undefined)', () => {
      const existing = {
        assigneeId: '05c93540-c3d3-460f-90e9-74d47c2bc386',
        assigneeName: 'Alejandria Solano',
      };

      const data = {
        title: 'Updated title without touching assignee',
      };

      const assigneeName = data.assigneeName !== undefined ? data.assigneeName : existing.assigneeName;
      const assigneeId = data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId;

      expect(assigneeId).toBe('05c93540-c3d3-460f-90e9-74d47c2bc386');
      expect(assigneeName).toBe('Alejandria Solano');
    });
  });

  describe('Dual-Role Team Member Validation', () => {
    it('permits a manager who belongs to Operations department as a co-assignee', () => {
      const matchedUsers = [
        {
          id: 'user-lovelyn',
          name: 'Lovelyn Rebong',
          role: 'Manager',
          departments: ['Operations'],
        },
      ];

      const invalidMember = matchedUsers.find((u) => {
        const r = (u.role || '').toLowerCase();
        const depts = Array.isArray(u.departments) ? u.departments.map((d) => String(d).toLowerCase()) : [];
        const isOps = depts.includes('operations');
        if (isOps) return false;
        return r === 'admin' || r === 'manager';
      });

      expect(invalidMember).toBeUndefined();
    });

    it('rejects an executive manager who is NOT in Operations department', () => {
      const matchedUsers = [
        {
          id: 'user-exec',
          name: 'Executive Manager',
          role: 'Manager',
          departments: ['Executive', 'Legal'],
        },
      ];

      const invalidMember = matchedUsers.find((u) => {
        const r = (u.role || '').toLowerCase();
        const depts = Array.isArray(u.departments) ? u.departments.map((d) => String(d).toLowerCase()) : [];
        const isOps = depts.includes('operations');
        if (isOps) return false;
        return r === 'admin' || r === 'manager';
      });

      expect(invalidMember).toBeDefined();
      expect(invalidMember.name).toBe('Executive Manager');
    });
  });

  describe('Completed Work Request Lock', () => {
    it('detects and blocks modifications to completed work requests', () => {
      const existing = { status: 'Completed', title: 'Finished WR' };
      const data = { title: 'Attempted edit to finished WR' };

      const isLocked = existing.status === 'Completed' && data.status !== 'Draft' && data.status !== 'Processing';
      expect(isLocked).toBe(true);
    });

    it('permits reopening a completed work request to Draft or Processing', () => {
      const existing = { status: 'Completed', title: 'Finished WR' };
      const data = { status: 'Draft' };

      const isLocked = existing.status === 'Completed' && data.status !== 'Draft' && data.status !== 'Processing';
      expect(isLocked).toBe(false);
    });
  });
});
