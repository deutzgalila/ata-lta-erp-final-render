/**
 * Test Suite: requiredLinkType.test.js
 *
 * Verifies end-to-end support for task `requiredLinkType` ('billing' | 'documents' | null):
 * 1. `phaseTaskSchema` and `generateTaskOverrideSchema` accept `requiredLinkType` and `required_link_type`.
 * 2. `createWorkRequest` (via `createWorkRequestGraph`) persists `required_link_type` onto `tasks`
 *    and returns `requiredLinkType` on `apiTasks` (including for delimiter-split tasks).
 * 3. `generateRetainerTemplate` forwards `requiredLinkType` from template tasks and overrides
 *    into `createWorkRequestGraph`.
 */

jest.mock('../../../services/supabaseClient', () => {
  const { supabaseAdmin } = require('../../../../tests/fixtures/supabaseMock');
  return { supabaseAdmin };
});

const {
  phaseTaskSchema,
  createWorkRequestSchema,
  generateTaskOverrideSchema,
  generateRetainerTemplateSchema,
} = require('../schema');

const {
  createWorkRequest,
  generateRetainerTemplate,
} = require('../service');

const {
  registerUser,
  seedDefaults,
  resetMock,
  mockTables,
} = require('../../../../tests/fixtures/supabaseMock');

describe('Task requiredLinkType Schema & Service Support', () => {
  const ENTITY_ID = 'ent-ata';
  const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
  const MANAGER_ID = '22222222-2222-4222-8222-222222222222';
  const STAFF_ID = '33333333-3333-4333-8333-333333333333';

  let managerUser;

  beforeEach(() => {
    resetMock();
    seedDefaults();

    managerUser = {
      id: MANAGER_ID,
      email: 'manager@ata-lta.ph',
      name: 'Manager Lead',
      role: 'Manager',
      departments: ['Management', 'Operations'],
      entities: ['ATA', 'LTA'],
    };
    registerUser(managerUser);
    mockTables.users.get(MANAGER_ID).user_departments = [
      { departments: { name: 'Management' } },
      { departments: { name: 'Operations' } },
    ];

    registerUser({
      id: STAFF_ID,
      email: 'staff@ata-lta.ph',
      name: 'Operations Staff',
      role: 'Operations',
      departments: ['Operations'],
      entities: ['ATA', 'LTA'],
    });
    mockTables.users.get(STAFF_ID).user_departments = [
      { departments: { name: 'Operations' } },
    ];

    mockTables.clients.set(CLIENT_ID, {
      id: CLIENT_ID,
      entity_id: ENTITY_ID,
      name: 'Test Client Corp',
      status: 'Active',
      version: 1,
    });
  });

  describe('1. Zod Schemas (phaseTaskSchema & generateTaskOverrideSchema)', () => {
    it('accepts requiredLinkType: "billing" | "documents" | null in phaseTaskSchema', () => {
      for (const linkType of ['billing', 'documents', null]) {
        const parsed = phaseTaskSchema.parse({
          title: 'Test Task',
          requiredLinkType: linkType,
        });
        expect(parsed.requiredLinkType).toBe(linkType);
      }

      const parsedSnake = phaseTaskSchema.parse({
        title: 'Test Task Snake',
        required_link_type: 'billing',
      });
      expect(parsedSnake.required_link_type).toBe('billing');
    });

    it('preserves requiredLinkType through createWorkRequestSchema phases', () => {
      const parsed = createWorkRequestSchema.parse({
        title: 'WR with Linked Tasks',
        phases: {
          pre_processing: {
            tasks: [{ title: 'Collect Docs', requiredLinkType: 'documents' }],
          },
          processing: {
            tasks: [{ title: 'Issue Invoice', requiredLinkType: 'billing' }],
          },
        },
      });
      expect(parsed.phases.pre_processing.tasks[0].requiredLinkType).toBe('documents');
      expect(parsed.phases.processing.tasks[0].requiredLinkType).toBe('billing');
    });

    it('accepts requiredLinkType: "billing" | "documents" | null in generateTaskOverrideSchema', () => {
      for (const linkType of ['billing', 'documents', null]) {
        const parsed = generateTaskOverrideSchema.parse({
          local_id: 't_1',
          requiredLinkType: linkType,
        });
        expect(parsed.requiredLinkType).toBe(linkType);
      }

      const parsedGen = generateRetainerTemplateSchema.parse({
        period_label: '2026-Q1',
        overrides: {
          assignedTo: MANAGER_ID,
          tasks: [
            { local_id: 't_1', requiredLinkType: 'billing' },
            { local_id: 't_2', required_link_type: 'documents' },
          ],
        },
      });
      expect(parsedGen.overrides.tasks[0].requiredLinkType).toBe('billing');
      expect(parsedGen.overrides.tasks[1].required_link_type).toBe('documents');
    });
  });

  describe('2. createWorkRequestGraph persistence & response mapping', () => {
    it('persists required_link_type onto tasks and returns requiredLinkType on apiTasks (including delimiter-split tasks)', async () => {
      const result = await createWorkRequest({
        entityId: ENTITY_ID,
        user: managerUser,
        data: {
          title: 'Graph Creation Test WR',
          clientId: CLIENT_ID,
          assignedTo: MANAGER_ID,
          coAssignees: [STAFF_ID],
          phases: {
            pre_processing: {
              tasks: [
                {
                  local_id: 't_doc',
                  title: 'Upload BIR Form; Upload SEC GIS',
                  assignees: [STAFF_ID],
                  requiredLinkType: 'documents',
                },
                {
                  local_id: 't_std',
                  title: 'Standard Checklist Review',
                  assignees: [STAFF_ID],
                  requiredLinkType: null,
                },
              ],
            },
            processing: {
              tasks: [
                {
                  local_id: 't_bill',
                  title: 'Generate Billing Statement',
                  assignees: [STAFF_ID],
                  depends_on: 't_doc',
                  required_link_type: 'billing',
                },
              ],
            },
          },
        },
      });

      expect(result.tasks).toHaveLength(4);

      const splitFirst = result.tasks.find((t) => t.localId === 't_doc');
      const splitSecond = result.tasks.find((t) => t.localId === 't_doc_s1');
      const standardTask = result.tasks.find((t) => t.localId === 't_std');
      const billingTask = result.tasks.find((t) => t.localId === 't_bill');

      expect(splitFirst.requiredLinkType).toBe('documents');
      expect(splitSecond.requiredLinkType).toBe('documents');
      expect(standardTask.requiredLinkType).toBeNull();
      expect(billingTask.requiredLinkType).toBe('billing');

      // Verify DB rows in mockTables.tasks
      expect(mockTables.tasks.get(splitFirst.id).required_link_type).toBe('documents');
      expect(mockTables.tasks.get(splitSecond.id).required_link_type).toBe('documents');
      expect(mockTables.tasks.get(standardTask.id).required_link_type).toBeNull();
      expect(mockTables.tasks.get(billingTask.id).required_link_type).toBe('billing');
    });
  });

  describe('3. generateRetainerTemplate forwarding of requiredLinkType', () => {
    it('forwards requiredLinkType from template tasks and overrides into createWorkRequestGraph', async () => {
      const templateId = 'tpl-link-type-test';
      mockTables.retainer_templates.set(templateId, {
        id: templateId,
        entity_id: ENTITY_ID,
        name: 'Monthly Retainer Template',
        description: 'Retainer with typed tasks',
        client_id: CLIENT_ID,
        priority: 'Normal',
        recurrence: 'none',
        tasks: [
          {
            local_id: 'tpl_t1',
            title: 'Gather Source Documents',
            phase: 'pre_processing',
            default_assignees: [STAFF_ID],
            requiredLinkType: 'documents',
          },
          {
            local_id: 'tpl_t2',
            title: 'Draft Billing Invoice',
            phase: 'processing',
            default_assignees: [STAFF_ID],
            requiredLinkType: null,
          },
          {
            local_id: 'tpl_t3',
            title: 'Task to Override to Standard',
            phase: 'processing',
            default_assignees: [STAFF_ID],
            requiredLinkType: 'billing',
          },
        ],
      });

      const generated = await generateRetainerTemplate({
        entityId: ENTITY_ID,
        templateId,
        user: managerUser,
        data: {
          period_label: '2026-10',
          overrides: {
            assignedTo: MANAGER_ID,
            coAssignees: [STAFF_ID],
            tasks: [
              // Override tpl_t2 from null to 'billing'
              {
                local_id: 'tpl_t2',
                requiredLinkType: 'billing',
              },
              // Override tpl_t3 from 'billing' back to null (standard task)
              {
                local_id: 'tpl_t3',
                requiredLinkType: null,
              },
            ],
          },
        },
      });

      expect(generated.tasks).toHaveLength(3);
      const t1 = generated.tasks.find((t) => t.localId === 'tpl_t1');
      const t2 = generated.tasks.find((t) => t.localId === 'tpl_t2');
      const t3 = generated.tasks.find((t) => t.localId === 'tpl_t3');

      expect(t1.requiredLinkType).toBe('documents');
      expect(t2.requiredLinkType).toBe('billing');
      expect(t3.requiredLinkType).toBeNull();

      expect(mockTables.tasks.get(t1.id).required_link_type).toBe('documents');
      expect(mockTables.tasks.get(t2.id).required_link_type).toBe('billing');
      expect(mockTables.tasks.get(t3.id).required_link_type).toBeNull();
    });
  });
});
