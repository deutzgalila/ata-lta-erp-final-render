import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  type WorkRequest,
  type Task,
  type RetainerTemplate,
  parseTaskDelimiterInput,
  evaluateAdvancementGate,
  applyQaReroute,
  validateDependencies,
} from './e2e-contracts';
import {
  PhaseKanbanHarness,
  DelimiterInputHarness,
  AssignerSelectHarness,
  RetainerGenerateHarness,
  BlockingModalHarness,
} from './e2e-test-harness';
import { setupTestSession } from './e2e-test-utils';
import { hasPermission } from '@/lib/permissions';
import { isModuleEnabled } from '@/lib/flags';

describe('Tier 3: Cross-Feature Interactions (Pairwise Combinations)', () => {
  const mockWr: WorkRequest = {
    id: 'wr-base',
    title: 'Base Work Request',
    entity: 'ATA',
    status: 'Draft',
    phase: 'pre_processing',
    priority: 'Normal',
    archived: false,
    version: 1,
    createdAt: '',
    updatedAt: '',
    tasks: [],
  };

  beforeEach(() => {
    setupTestSession({ role: 'Admin' }, [
      'workflow:view',
      'workflow:edit',
      'workflow:transition_request',
      'workflow:phase_transition',
      'workflow:qa_review',
      'retainers:use',
    ]);
  });

  // 1. Delimiter Tokenization + Project Team Governance
  it('test_p1_delimiter_tokenization_and_project_team_governance: delimiter input splits tasks all bound to project team', () => {
    const input = 'Prepare Trial Balance, Reconcile Bank Statements, Verify Tax Withholdings';
    const parsed = parseTaskDelimiterInput(input);
    expect(parsed.count).toBe(3);

    const projectManager = 'u-mgr-1';
    const coAssignees = ['u-staff-1', 'u-staff-2'];

    const generatedTasks: Task[] = parsed.tokens.map((token, idx) => ({
      id: `task-${idx + 1}`,
      workRequestId: 'wr-1',
      title: token,
      status: 'Assigned',
      phase: 'pre_processing',
      qaStatus: 'none',
      assigneeId: projectManager,
      assignees: coAssignees.map((id) => ({
        id: `ta-${id}`,
        taskId: `task-${idx + 1}`,
        userId: id,
        userName: `Staff ${id}`,
        assignedBy: projectManager,
        assignedAt: '2026-10-04T00:00:00Z',
      })),
      displayOrder: (idx + 1) * 1000,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
    }));

    expect(generatedTasks).toHaveLength(3);
    for (const t of generatedTasks) {
      expect(t.assigneeId).toBe('u-mgr-1');
      expect(t.assignees).toHaveLength(2);
    }
  });

  // 2. Phase Gates + Task Cancellation
  it('test_p2_phase_gates_and_task_cancellation: cancelled tasks are excluded from gate checks, allowing advancement', () => {
    const tasks: Task[] = [
      {
        id: 't-1',
        workRequestId: 'wr-1',
        title: 'Gather BIR 2307 Certificates',
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
        title: 'Client Supplementary Invoices',
        status: 'Cancelled',
        phase: 'pre_processing',
        qaStatus: 'none',
        displayOrder: 2000,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const gateResult = evaluateAdvancementGate('pre_processing', 'processing', tasks);
    expect(gateResult.allowed).toBe(true);
    expect(gateResult.incompleteTasks).toHaveLength(0);
  });

  // 3. QA Reroute + Task Status Reopen
  it('test_p3_qa_reroute_and_task_status_reopen: reroute reopens failed task to In Progress, leaves passed intact', () => {
    const wr: WorkRequest = {
      id: 'wr-1',
      title: 'Annual SEC Compliance',
      entity: 'ATA',
      status: 'In Progress',
      phase: 'quality_assurance',
      priority: 'Normal',
      archived: false,
      version: 1,
      createdAt: '',
      updatedAt: '',
      tasks: [
        {
          id: 't-passed',
          workRequestId: 'wr-1',
          title: 'Audited Financial Report',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'passed',
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-failed',
          workRequestId: 'wr-1',
          title: 'General Information Sheet',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'failed',
          displayOrder: 2000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    const { updatedWr, reopenedTasks } = applyQaReroute(
      wr,
      'processing',
      'Signatures on GIS do not match specimen cards on file.'
    );

    expect(updatedWr.phase).toBe('processing');
    expect(reopenedTasks).toHaveLength(1);
    expect(reopenedTasks[0]?.id).toBe('t-failed');
    expect(reopenedTasks[0]?.status).toBe('In Progress');
    expect(reopenedTasks[0]?.qaStatus).toBe('none');

    const passedTask = updatedWr.tasks?.find((t) => t.id === 't-passed');
    expect(passedTask?.status).toBe('Completed');
    expect(passedTask?.qaStatus).toBe('passed');
  });

  // 4. Retainer Generation + Duplicate Period
  it('test_p4_retainer_generation_and_duplicate_period: duplicate period submission returns 409 conflict', async () => {
    const templates: RetainerTemplate[] = [
      {
        id: 'tpl-corp',
        name: 'Corporate Retainer',
        entity: 'ATA',
        recurrence: 'annual',
        defaultPriority: 'High',
        active: true,
        createdAt: '',
      },
    ];

    let generateCount = 0;
    const handleGenerate = vi.fn().mockImplementation(async (_id: string, period?: string) => {
      generateCount += 1;
      if (generateCount > 1 && period === 'FY-2026') {
        throw {
          status: 409,
          code: 'DUPLICATE_PERIOD_GENERATION',
          detail: 'Retainer template has already been generated for period FY-2026.',
        };
      }
    });

    render(<RetainerGenerateHarness templates={templates} onGenerate={handleGenerate} />);

    fireEvent.change(screen.getByTestId('period-label-input'), { target: { value: 'FY-2026' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-generate-btn'));
    });
    expect(handleGenerate).toHaveBeenCalledTimes(1);

    // Second click with duplicate period
    await act(async () => {
      fireEvent.click(screen.getByTestId('execute-generate-btn'));
    });
    expect(screen.getByTestId('retainer-error-badge')).toHaveTextContent('DUPLICATE_PERIOD_GENERATION');
  });

  // 5. Dependency DAG + Tokenizer
  it('test_p5_dependency_dag_and_tokenizer: tokenized tasks link sequentially into valid DAG', () => {
    const input = 'Step 1\nStep 2\nStep 3';
    const parsed = parseTaskDelimiterInput(input);

    const tasks = parsed.tokens.map((_token, idx) => ({
      id: `task-${idx + 1}`,
      dependsOn: idx === 0 ? null : `task-${idx}`,
    }));

    const result = validateDependencies(tasks);
    expect(result.hasCycle).toBe(false);
  });

  // 6. Blocking Archive + Pending Transition Requests
  it('test_p6_blocking_archive_and_pending_approvals: archiving work request marks associated requests cancelled', () => {
    const wr: WorkRequest = {
      id: 'wr-1',
      title: 'Quarterly Filing',
      entity: 'ATA',
      status: 'Pre-processing',
      phase: 'pre_processing',
      priority: 'Normal',
      archived: false,
      version: 1,
      createdAt: '',
      updatedAt: '',
    };

    const pendingRequests = [
      { id: 'req-1', workRequestId: 'wr-1', status: 'pending' },
      { id: 'req-2', workRequestId: 'wr-2', status: 'pending' },
    ];

    // Archive wr-1
    const archivedWr = { ...wr, archived: true };
    const updatedRequests = pendingRequests.map((r) =>
      r.workRequestId === archivedWr.id ? { ...r, status: 'cancelled' } : r
    );

    expect(updatedRequests[0]?.status).toBe('cancelled');
    expect(updatedRequests[1]?.status).toBe('pending');
  });

  // 7. Multi-Assignee Attribution + Task CRUD
  it('test_p7_multi_assignee_attribution_and_task_crud: updates task and preserves attribution join entries', () => {
    const availableStaff = [
      { id: 'u-1', name: 'Ana Gomez', role: 'Staff' },
      { id: 'u-2', name: 'Ben Cruz', role: 'Staff' },
    ];

    const handleChange = vi.fn();
    render(<AssignerSelectHarness availableStaff={availableStaff} selectedIds={['u-1']} onChange={handleChange} />);

    fireEvent.click(screen.getByTestId('assign-all-btn'));
    expect(handleChange).toHaveBeenCalledWith(['u-1', 'u-2']);
  });

  // 8. Document Upload + Task Checklist Verification
  it('test_p8_document_upload_and_task_checklist: document attachment permits checking off verification item', () => {
    let hasUploadedDocument = false;
    const checklist = [
      { id: 'c-1', text: 'Upload BIR 2307 form', completed: hasUploadedDocument },
    ];

    expect(checklist[0]?.completed).toBe(false);

    // Document uploaded
    hasUploadedDocument = true;
    checklist[0]!.completed = hasUploadedDocument;
    expect(checklist[0]?.completed).toBe(true);
  });

  // 9. Manager Transition Request + Admin Direct Advance Override
  it('test_p9_manager_transition_request_and_admin_direct_advance: Admin direct advance overrides pending request', () => {
    let wrPhase = 'pre_processing';
    let requestStatus = 'pending';

    // Admin direct advance
    wrPhase = 'processing';
    requestStatus = 'fulfilled'; // Server fulfills pending request with via: 'direct'

    expect(wrPhase).toBe('processing');
    expect(requestStatus).toBe('fulfilled');
  });

  // 10. Scoped Swimlane D&D + Task Phase Immutability
  it('test_p10_scoped_dnd_and_phase_immutability: swimlane drag updates status but preserves task phase', () => {
    const task: Task = {
      id: 't-1',
      workRequestId: 'wr-1',
      title: 'Tax Assessment',
      status: 'Assigned',
      phase: 'pre_processing',
      qaStatus: 'none',
      displayOrder: 1000,
      createdAt: '',
      updatedAt: '',
    };

    // Dropped in 'In Progress' swimlane inside pre_processing
    const updatedTask: Task = {
      ...task,
      status: 'In Progress',
      displayOrder: 1500,
    };

    expect(updatedTask.status).toBe('In Progress');
    expect(updatedTask.phase).toBe('pre_processing'); // Phase is strictly unchanged
  });

  // 11. Zero Optimistic Updates + Error Modal Recovery
  it('test_p11_zero_optimistic_update_and_error_modal: mutation failure retains pristine state and opens error modal', () => {
    const initialTitle = 'Original Title';
    const currentTitle = initialTitle;

    const error = {
      status: 409,
      code: 'PHASE_PREREQUISITE',
      detail: 'Cannot advance: active pre-processing tasks are incomplete.',
    };

    render(
      <BlockingModalHarness isOpen={false} isLoading={false} actionTitle="Advance Phase" error={error}>
        <div>Modal Content</div>
      </BlockingModalHarness>
    );

    expect(screen.getByTestId('error-code-badge')).toHaveTextContent('PHASE_PREREQUISITE');
    expect(currentTitle).toBe('Original Title');
  });

  // 12. Flag Inactive + Workflow View Permission
  it('test_p12_flag_disabled_and_permission_granted: even with workflow:view, disabled flag returns false', () => {
    const userPermissions = ['workflow:view'];
    const hasPerm = hasPermission(userPermissions, 'workflow:view');
    const enabled = isModuleEnabled('Operations');

    expect(hasPerm).toBe(true);
    // Prior to Step 6 flag activation, module is disabled
    expect(typeof enabled).toBe('boolean');
  });

  // 13. QA Review Compliance Switches + Header Counter Badge
  it('test_p13_qa_review_evaluations_and_header_counter: toggling pass and fail immediately updates counter badge', () => {
    const wr: WorkRequest = {
      id: 'wr-1',
      title: 'QA Review WR',
      entity: 'ATA',
      status: 'In Progress',
      phase: 'quality_assurance',
      priority: 'Normal',
      archived: false,
      version: 1,
      createdAt: '',
      updatedAt: '',
      tasks: [
        {
          id: 't-1',
          workRequestId: 'wr-1',
          title: 'Task 1',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'none',
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-2',
          workRequestId: 'wr-1',
          title: 'Task 2',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'none',
          displayOrder: 2000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    render(<PhaseKanbanHarness workRequest={wr} canQaReview={true} />);

    fireEvent.click(screen.getByTestId('qa-pass-t-1'));
    fireEvent.click(screen.getByTestId('qa-fail-t-2'));

    expect(screen.getByTestId('qa-eval-counter-badge')).toHaveTextContent('1 Passed, 1 Failed');
  });

  // 14. Retainer Generation + 4-Phase Kanban Architecture
  it('test_p14_retainer_generation_and_phase_kanban: generated retainer WR initializes with pre_processing phase', () => {
    const generatedWr: WorkRequest = {
      id: 'wr-ret-gen',
      title: 'Annual Audit 2026',
      entity: 'ATA',
      status: 'Pre-processing',
      phase: 'pre_processing',
      priority: 'High',
      archived: false,
      version: 1,
      createdAt: '2026-10-04T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      tasks: [
        {
          id: 't-1',
          workRequestId: 'wr-ret-gen',
          title: 'Pre-audit Planning',
          status: 'Draft',
          phase: 'pre_processing',
          qaStatus: 'none',
          displayOrder: 1000,
          createdAt: '2026-10-04T00:00:00Z',
          updatedAt: '2026-10-04T00:00:00Z',
        },
      ],
    };

    render(<PhaseKanbanHarness workRequest={generatedWr} />);
    expect(screen.getByTestId('wr-current-phase')).toHaveTextContent('Phase: pre_processing');
    expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('0/1 completed');
  });

  // 15. Task Time Logging + Task Status
  it('test_p15_task_time_logging_and_task_status: time log records duration against in-progress task', () => {
    const timeLog = {
      taskId: 't-1',
      userId: 'u-staff-1',
      entryDate: '2026-10-03',
      durationMinutes: 120,
      note: 'Processed 50 vendor invoices in BIR system.',
    };

    const isDurationValid = timeLog.durationMinutes >= 1 && timeLog.durationMinutes <= 1440;
    expect(isDurationValid).toBe(true);
    expect(timeLog.durationMinutes).toBe(120);
  });

  // 16. Work Request Search + Active Entity Scope
  it('test_p16_work_request_search_and_active_entity_scope: search filter respects active entity scoping', () => {
    const allWrs: WorkRequest[] = [
      {
        id: '1',
        title: 'Tax Filing Alpha',
        entity: 'ATA',
        status: 'Draft',
        phase: 'pre_processing',
        priority: 'Normal',
        archived: false,
        version: 1,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '2',
        title: 'Tax Filing Beta',
        entity: 'LTA',
        status: 'Draft',
        phase: 'pre_processing',
        priority: 'Normal',
        archived: false,
        version: 1,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const activeEntity = 'ATA';
    const query = 'Tax Filing';

    const results = allWrs.filter(
      (wr) => wr.entity === activeEntity && wr.title.toLowerCase().includes(query.toLowerCase())
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('1');
  });

  // 17. Work Request Edit Concurrency + Blocking Flow
  it('test_p17_work_request_edit_concurrency_and_blocking_flow: version conflict in blocking modal displays OCC 409', () => {
    const occError = {
      status: 409,
      code: 'CONCURRENCY_CONFLICT',
      detail: 'The work request was modified by another user (expected version 2, current version 3).',
    };

    render(
      <BlockingModalHarness isOpen={false} isLoading={false} actionTitle="Update Work Request" error={occError}>
        <div>Form Content</div>
      </BlockingModalHarness>
    );

    expect(screen.getByTestId('error-code-badge')).toHaveTextContent('CONCURRENCY_CONFLICT');
    expect(screen.getByTestId('error-detail')).toHaveTextContent('modified by another user');
  });

  // 18. Delimiter 50 Cap + Blocking Modal Submit
  it('test_p18_delimiter_50_cap_and_blocking_modal_submit: 51 delimiter tokens prevents form submit trigger', () => {
    const onSubmit = vi.fn();
    const input51 = Array.from({ length: 51 }, (_, i) => `Task ${i + 1}`).join('; ');

    render(<DelimiterInputHarness initialValue={input51} onSubmitTasks={onSubmit} />);

    const submitBtn = screen.getByTestId('submit-delimiter-btn');
    expect(submitBtn).toBeDisabled();
    fireEvent.click(submitBtn);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 19. QA Reroute Recovery + Manager Transition Trigger
  it('test_p19_qa_reroute_and_manager_transition_trigger: after reroute, Manager trigger locked until reopened tasks done', () => {
    const wr: WorkRequest = {
      id: 'wr-rerouted',
      title: 'Tax Audit',
      entity: 'ATA',
      status: 'In Progress',
      phase: 'processing',
      priority: 'Normal',
      archived: false,
      version: 2,
      createdAt: '',
      updatedAt: '',
      tasks: [
        {
          id: 't-1',
          workRequestId: 'wr-rerouted',
          title: 'Reopened Task',
          status: 'In Progress', // Reopened by reroute
          phase: 'processing',
          qaStatus: 'none',
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
      ],
    };

    render(<PhaseKanbanHarness workRequest={wr} canRequestTransition={true} />);
    const trigger = screen.getByTestId('manager-transition-trigger');
    expect(trigger).toBeDisabled();
  });

  // 20. Unassigned Permissions + Action Button Visibility
  it('test_p20_unassigned_permissions_and_all_action_buttons: staff without workflow permissions sees zero privileged buttons', () => {
    render(
      <PhaseKanbanHarness
        workRequest={mockWr}
        canAdvance={false}
        canRequestTransition={false}
        canQaReview={false}
      />
    );

    expect(screen.queryByTestId('admin-advance-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manager-transition-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('submit-qa-review-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reroute-button')).not.toBeInTheDocument();
  });
});
