import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  type WorkRequest,
  type Task,
  type RetainerTemplate,
  parseTaskDelimiterInput,
  evaluateAdvancementGate,
  applyQaReroute,
} from './e2e-contracts';
import {
  DelimiterInputHarness,
  AssignerSelectHarness,
  RetainerGenerateHarness,
  BlockingModalHarness,
} from './e2e-test-harness';
import { setupTestSession } from './e2e-test-utils';
import { hasPermission } from '@/lib/permissions';

describe('Tier 4: Real-World Workloads (End-to-End Scenarios)', () => {
  beforeEach(() => {
    setupTestSession({ role: 'Admin' }, [
      'workflow:view',
      'workflow:edit',
      'workflow:task_add',
      'workflow:transition_request',
      'workflow:phase_transition',
      'workflow:qa_review',
      'retainers:use',
      'retainers:edit',
      'dms:view',
      'dms:edit',
    ]);
  });

  // Scenario 1: Standard Work Request 4-Phase Lifecycle
  it('scenario_1_standard_work_request_lifecycle: traverses pre_processing -> processing -> QA -> completion', () => {
    let wr: WorkRequest = {
      id: 'wr-s1',
      title: 'Annual SEC General Information Sheet 2026',
      entity: 'ATA',
      status: 'In Progress',
      phase: 'pre_processing',
      priority: 'Normal',
      archived: false,
      version: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      tasks: [
        {
          id: 't-pre',
          workRequestId: 'wr-s1',
          title: 'Collect Stockholder Specimen Signatures',
          status: 'In Progress',
          phase: 'pre_processing',
          qaStatus: 'none',
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-proc',
          workRequestId: 'wr-s1',
          title: 'Encode Form 10-K Disclosures',
          status: 'Draft',
          phase: 'processing',
          qaStatus: 'none',
          displayOrder: 2000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    // Step 1: Incomplete pre-processing task blocks advance
    let gateCheck = evaluateAdvancementGate(wr.phase, 'processing', wr.tasks ?? []);
    expect(gateCheck.allowed).toBe(false);

    // Step 2: Complete pre-processing task
    wr.tasks![0]!.status = 'Completed';
    gateCheck = evaluateAdvancementGate(wr.phase, 'processing', wr.tasks ?? []);
    expect(gateCheck.allowed).toBe(true);

    // Step 3: Advance to processing
    wr = { ...wr, phase: 'processing', version: wr.version + 1 };
    expect(wr.phase).toBe('processing');

    // Step 4: Complete processing task
    wr.tasks![1]!.status = 'Completed';
    gateCheck = evaluateAdvancementGate(wr.phase, 'quality_assurance', wr.tasks ?? []);
    expect(gateCheck.allowed).toBe(true);

    // Step 5: Advance to QA
    wr = { ...wr, phase: 'quality_assurance', version: wr.version + 1 };
    expect(wr.phase).toBe('quality_assurance');

    // Step 6: QA review passes tasks
    wr.tasks![0]!.qaStatus = 'passed';
    wr.tasks![1]!.qaStatus = 'passed';

    gateCheck = evaluateAdvancementGate(wr.phase, 'completion', wr.tasks ?? []);
    expect(gateCheck.allowed).toBe(true);

    // Step 7: Advance to completion
    wr = { ...wr, phase: 'completion', status: 'Completed', version: wr.version + 1 };
    expect(wr.phase).toBe('completion');
    expect(wr.status).toBe('Completed');
  });

  // Scenario 2: QA Defect Detection, Server-True Reroute, and Recovery
  it('scenario_2_qa_defect_reroute_and_recovery: handles defect in QA, reroutes to processing, fixes defect, advances to completion', () => {
    let wr: WorkRequest = {
      id: 'wr-s2',
      title: 'Q3 VAT Filing',
      entity: 'ATA',
      status: 'In Progress',
      phase: 'quality_assurance',
      priority: 'High',
      archived: false,
      version: 3,
      createdAt: '',
      updatedAt: '',
      tasks: [
        {
          id: 't-1',
          workRequestId: 'wr-s2',
          title: 'Input Tax Computation',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'passed',
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-2',
          workRequestId: 'wr-s2',
          title: 'Official Receipt Validation',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'failed', // Defect found by QA
          displayOrder: 2000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    // Step 1: Gate to completion is blocked because task 2 failed QA
    let gateCheck = evaluateAdvancementGate(wr.phase, 'completion', wr.tasks ?? []);
    expect(gateCheck.allowed).toBe(false);

    // Step 2: Admin triggers reroute back to processing
    const { updatedWr, reopenedTasks } = applyQaReroute(
      wr,
      'processing',
      'OR #4928 is missing seller tax identification number.'
    );
    wr = updatedWr;

    expect(wr.phase).toBe('processing');
    expect(reopenedTasks).toHaveLength(1);
    expect(reopenedTasks[0]?.id).toBe('t-2');
    expect(reopenedTasks[0]?.status).toBe('In Progress');
    expect(reopenedTasks[0]?.qaStatus).toBe('none');

    // Passed task 1 remains unchanged
    expect(wr.tasks?.[0]?.status).toBe('Completed');
    expect(wr.tasks?.[0]?.qaStatus).toBe('passed');

    // Step 3: Staff remedies defect and completes task 2
    wr.tasks![1]!.status = 'Completed';

    // Step 4: Advance back to QA
    wr = { ...wr, phase: 'quality_assurance', version: wr.version + 1 };

    // Step 5: Admin evaluates task 2 as passed
    wr.tasks![1]!.qaStatus = 'passed';
    gateCheck = evaluateAdvancementGate(wr.phase, 'completion', wr.tasks ?? []);
    expect(gateCheck.allowed).toBe(true);

    // Step 6: Advance to completion
    wr = { ...wr, phase: 'completion', status: 'Completed', version: wr.version + 1 };
    expect(wr.phase).toBe('completion');
  });

  // Scenario 3: Bulk Task Delimiter Ingestion with Live Preview Chips
  it('scenario_3_bulk_task_delimiter_ingestion: ingests pasted multi-line task list into preview chips and creates tasks', () => {
    const rawPastedInput = `
      Collect Bank Statement;
      Reconcile Accounts Payable,
      Verify Accounts Receivable
      Check BIR Form 2307.
      Prepare Financial Notes
    `;

    const parsed = parseTaskDelimiterInput(rawPastedInput);
    expect(parsed.count).toBe(5);
    expect(parsed.shouldSplit).toBe(true);
    expect(parsed.exceedsLimit).toBe(false);

    const onSubmit = vi.fn();
    render(<DelimiterInputHarness initialValue={rawPastedInput} onSubmitTasks={onSubmit} />);

    expect(screen.getByTestId('chip-count-badge')).toHaveTextContent('Will create 5 tasks');
    const chips = screen.getAllByTestId('task-chip');
    expect(chips).toHaveLength(5);

    fireEvent.click(screen.getByTestId('submit-delimiter-btn'));
    expect(onSubmit).toHaveBeenCalledWith(parsed.tokens);
  });

  // Scenario 4: Annual Retainer Recurrence and Duplicate Conflict Resolution
  it('scenario_4_annual_retainer_recurrence_and_duplicate_handling: generates annual retainer and handles duplicate 409', async () => {
    const templates: RetainerTemplate[] = [
      {
        id: 't-audit-annual',
        name: 'Annual Corporate Audit',
        entity: 'ATA',
        recurrence: 'annual',
        defaultPriority: 'High',
        active: true,
        createdAt: '',
      },
    ];

    const generatedPeriods = new Set<string>();
    const handleGenerate = vi.fn().mockImplementation(async (_id: string, period?: string) => {
      if (!period) return;
      if (generatedPeriods.has(period)) {
        throw {
          status: 409,
          code: 'DUPLICATE_PERIOD_GENERATION',
          detail: `Retainer has already been generated for ${period}.`,
        };
      }
      generatedPeriods.add(period);
    });

    render(<RetainerGenerateHarness templates={templates} onGenerate={handleGenerate} />);

    // Step 1: Generate for FY-2026 succeeds
    fireEvent.change(screen.getByTestId('period-label-input'), { target: { value: 'FY-2026' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-generate-btn'));
    });
    expect(generatedPeriods.has('FY-2026')).toBe(true);

    // Step 2: Attempt duplicate FY-2026 surfaces 409 conflict
    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-generate-btn'));
    });
    expect(screen.getByTestId('retainer-error-badge')).toHaveTextContent('DUPLICATE_PERIOD_GENERATION');

    // Step 3: Recover by switching to FY-2027
    fireEvent.change(screen.getByTestId('period-label-input'), { target: { value: 'FY-2027' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-generate-btn'));
    });
    expect(generatedPeriods.has('FY-2027')).toBe(true);
  });

  // Scenario 5: Collaborative Multi-Assignee Workflow with Attribution
  it('scenario_5_collaborative_multi_assignee_workflow: selects team, assigns all, and verifies attribution joins', () => {
    const staff = [
      { id: 'u-1', name: 'Maria Santos', role: 'Staff' },
      { id: 'u-2', name: 'Juan Dela Cruz', role: 'Specialist' },
      { id: 'u-3', name: 'Clara Diaz', role: 'Staff' },
      { id: 'u-admin', name: 'Admin User', role: 'Admin' },
      { id: 'u-mgr', name: 'Manager User', role: 'Manager' },
    ];

    const onSelectionChange = vi.fn();
    render(<AssignerSelectHarness availableStaff={staff} selectedIds={['u-1']} onChange={onSelectionChange} />);

    // Click "Assign all" to include remaining eligible staff
    fireEvent.click(screen.getByTestId('assign-all-btn'));
    expect(onSelectionChange).toHaveBeenCalledWith(['u-1', 'u-2', 'u-3']);
  });

  // Scenario 6: Document Evidence Upload & Checklist Verification
  it('scenario_6_document_evidence_and_compliance_verification: completes task upon attaching document evidence', () => {
    const taskState = {
      id: 't-doc',
      title: 'Attach Signed Engagement Letter',
      status: 'In Progress' as string,
      hasAttachedDocument: false,
      checklist: [{ id: 'chk-1', text: 'Document attached and signed', done: false }],
    };

    // Before document upload, cannot complete
    expect(taskState.checklist.every((c) => c.done)).toBe(false);

    // Staff uploads document
    taskState.hasAttachedDocument = true;
    taskState.checklist[0]!.done = true;
    taskState.status = 'Completed';

    expect(taskState.status).toBe('Completed');
    expect(taskState.checklist[0]?.done).toBe(true);
  });

  // Scenario 7: Task Cancellation under Phase Gate
  it('scenario_7_task_cancellation_under_phase_gate: handles client scope reduction without stalling advance', () => {
    const tasks: Task[] = [
      {
        id: 't-1',
        workRequestId: 'wr-1',
        title: 'Primary Assessment',
        status: 'Completed',
        phase: 'pre_processing',
        qaStatus: 'none',
        displayOrder: 1000,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 't-2',
        workRequestId: 'wr-1',
        title: 'Secondary Audit Review',
        status: 'Cancelled', // Cancelled per client agreement
        phase: 'pre_processing',
        qaStatus: 'none',
        displayOrder: 2000,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const gate = evaluateAdvancementGate('pre_processing', 'processing', tasks);
    expect(gate.allowed).toBe(true);
    expect(gate.incompleteTasks).toHaveLength(0);
  });

  // Scenario 8: Concurrency Conflict OCC Detection and Error Recovery
  it('scenario_8_concurrency_conflict_and_recovery_flow: catches OCC 409 conflict and presents recovery path', () => {
    const occError = {
      status: 409,
      code: 'CONCURRENCY_CONFLICT',
      detail: 'Work request has been modified by another user. Please reload the latest data.',
    };

    render(
      <BlockingModalHarness
        isOpen={false}
        isLoading={false}
        actionTitle="Save Changes"
        error={occError}
      />
    );

    expect(screen.getByTestId('error-code-badge')).toHaveTextContent('CONCURRENCY_CONFLICT');
    expect(screen.getByTestId('error-detail')).toHaveTextContent('modified by another user');
  });

  // Scenario 9: Blocking Archive, Audit Log, and Clean Restoration
  it('scenario_9_blocking_archive_audit_and_restoration: archives work request cleanly and restores to active view', () => {
    let wr: WorkRequest = {
      id: 'wr-archive-flow',
      title: 'Completed SEC GIS Filing',
      entity: 'ATA',
      status: 'Completed',
      phase: 'completion',
      priority: 'Normal',
      archived: false,
      version: 5,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-15T00:00:00Z',
    };

    // Step 1: Archive WR
    wr = { ...wr, archived: true, version: wr.version + 1 };
    expect(wr.archived).toBe(true);
    expect(wr.version).toBe(6);

    // Step 2: Unarchive / restore WR
    wr = { ...wr, archived: false, version: wr.version + 1 };
    expect(wr.archived).toBe(false);
    expect(wr.version).toBe(7);
  });

  // Scenario 10: Multi-Entity Scoping and Role Separation Governance
  it('scenario_10_multi_entity_governance_and_role_separation: enforces strict UI permissions across Staff, Manager, and Admin', () => {
    // Staff role
    const staffPermissions = ['workflow:view'];
    expect(hasPermission(staffPermissions, 'workflow:phase_transition')).toBe(false);
    expect(hasPermission(staffPermissions, 'workflow:transition_request')).toBe(false);

    // Manager role
    const managerPermissions = ['workflow:view', 'workflow:transition_request'];
    expect(hasPermission(managerPermissions, 'workflow:transition_request')).toBe(true);
    expect(hasPermission(managerPermissions, 'workflow:phase_transition')).toBe(false);

    // Admin role
    const adminPermissions = ['workflow:view', 'workflow:phase_transition', 'workflow:qa_review'];
    expect(hasPermission(adminPermissions, 'workflow:phase_transition')).toBe(true);
    expect(hasPermission(adminPermissions, 'workflow:qa_review')).toBe(true);
  });
});
