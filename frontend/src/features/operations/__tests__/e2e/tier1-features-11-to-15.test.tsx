import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  type WorkRequest,
  type Task,
  computeBoardOrder,
  evaluateAdvancementGate,
} from './e2e-contracts';
import { PhaseKanbanHarness } from './e2e-test-harness';
import { setupTestSession } from './e2e-test-utils';

describe('Tier 1: Feature Coverage (Features 11–15)', () => {
  beforeEach(() => {
    setupTestSession({ role: 'Admin' }, [
      'workflow:view',
      'workflow:edit',
      'workflow:transition_request',
      'workflow:phase_transition',
      'workflow:qa_review',
    ]);
  });

  const baseWr: WorkRequest = {
    id: 'wr-kanban-1',
    title: 'SEC Annual Compliance Package',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'pre_processing',
    priority: 'High',
    archived: false,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    tasks: [
      {
        id: 'task-1',
        workRequestId: 'wr-kanban-1',
        title: 'Draft GIS Form',
        status: 'Completed',
        phase: 'pre_processing',
        qaStatus: 'none',
        displayOrder: 1000,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'task-2',
        workRequestId: 'wr-kanban-1',
        title: 'Obtain Board Specimen Signatures',
        status: 'In Progress',
        phase: 'pre_processing',
        qaStatus: 'none',
        displayOrder: 2000,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      },
    ],
  };

  // ------------------------------------------------------------------------
  // Feature 11: Phase Kanban Board (4 Columns)
  // ------------------------------------------------------------------------
  describe('Feature 11: Phase Kanban Board (4 Columns)', () => {
    it('test_f11_01_phase_kanban_renders_four_columns: renders all four phase column headers', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} />);

      expect(screen.getByTestId('phase-column-pre_processing')).toBeInTheDocument();
      expect(screen.getByTestId('phase-column-processing')).toBeInTheDocument();
      expect(screen.getByTestId('phase-column-quality_assurance')).toBeInTheDocument();
      expect(screen.getByTestId('phase-column-completion')).toBeInTheDocument();
    });

    it('test_f11_02_phase_header_gate_progress: displays fraction of completed tasks in phase', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} />);

      const progressBadge = screen.getByTestId('gate-progress-pre_processing');
      expect(progressBadge).toHaveTextContent('1/2 completed');
    });

    it('test_f11_03_phase_header_tooltip_incomplete_tasks: identifies incomplete tasks blocking advance', () => {
      const gateCheck = evaluateAdvancementGate('pre_processing', 'processing', baseWr.tasks ?? []);
      expect(gateCheck.allowed).toBe(false);
      expect(gateCheck.incompleteTasks).toHaveLength(1);
      expect(gateCheck.incompleteTasks[0]?.title).toBe('Obtain Board Specimen Signatures');
    });

    it('test_f11_04_tasks_rendered_in_correct_phase_column: renders card inside proper phase column container', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} />);

      const preProcCol = screen.getByTestId('phase-column-pre_processing');
      expect(preProcCol).toContainElement(screen.getByTestId('task-card-task-1'));
      expect(preProcCol).toContainElement(screen.getByTestId('task-card-task-2'));
    });

    it('test_f11_05_completion_column_shows_completed_deliverables: renders deliverable card in completion phase', () => {
      const completedWr: WorkRequest = {
        ...baseWr,
        phase: 'completion',
        tasks: [
          {
            id: 'task-done',
            workRequestId: 'wr-kanban-1',
            title: 'Filed Final SEC Report',
            status: 'Completed',
            phase: 'completion',
            qaStatus: 'passed',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={completedWr} />);
      const compCol = screen.getByTestId('phase-column-completion');
      expect(compCol).toContainElement(screen.getByTestId('task-card-task-done'));
    });
  });

  // ------------------------------------------------------------------------
  // Feature 12: Scoped Swimlane D&D (Cross-Phase Restricted)
  // ------------------------------------------------------------------------
  describe('Feature 12: Scoped Swimlane D&D (Cross-Phase Restricted)', () => {
    it('test_f12_01_intra_phase_drag_and_drop_allowed: fires onTaskDrop when dropped within same phase column', () => {
      const handleTaskDrop = vi.fn();
      render(<PhaseKanbanHarness workRequest={baseWr} onTaskDrop={handleTaskDrop} />);

      const card = screen.getByTestId('task-card-task-1');
      const dropzone = screen.getByTestId('dropzone-pre_processing');

      // Drag start on task-1
      fireEvent.dragStart(card, {
        dataTransfer: {
          setData: vi.fn(),
          getData: () => 'task-1',
        },
      });

      // Drop in pre_processing dropzone
      fireEvent.drop(dropzone, {
        dataTransfer: { getData: () => 'task-1' },
      });

      expect(handleTaskDrop).toHaveBeenCalledWith('task-1', 'In Progress', expect.any(Number));
    });

    it('test_f12_02_cross_phase_drag_strictly_prohibited: does not fire onTaskDrop when dropped in another phase', () => {
      const handleTaskDrop = vi.fn();
      render(<PhaseKanbanHarness workRequest={baseWr} onTaskDrop={handleTaskDrop} />);

      const card = screen.getByTestId('task-card-task-1');
      const foreignDropzone = screen.getByTestId('dropzone-processing');

      fireEvent.dragStart(card, {
        dataTransfer: {
          setData: vi.fn(),
          getData: () => 'task-1',
        },
      });

      // Attempt drop into processing column
      fireEvent.drop(foreignDropzone, {
        dataTransfer: { getData: () => 'task-1' },
      });

      expect(handleTaskDrop).not.toHaveBeenCalled();
    });

    it('test_f12_03_cross_phase_drop_target_indicator_disabled: dragOver sets dropEffect to none across phases', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} />);

      const card = screen.getByTestId('task-card-task-1');
      const foreignColumn = screen.getByTestId('phase-column-processing');

      fireEvent.dragStart(card, {
        dataTransfer: { setData: vi.fn() },
      });

      const dataTransfer = { dropEffect: 'move' };
      fireEvent.dragOver(foreignColumn, { dataTransfer });
      expect(dataTransfer.dropEffect).toBe('none');
    });

    it('test_f12_04_midpoint_board_order_first_element: computes order next / 2 when moving to top', () => {
      const newOrder = computeBoardOrder('first', { after: 1000 });
      expect(newOrder).toBe(500);
    });

    it('test_f12_05_midpoint_board_order_between_elements: computes (before + after) / 2', () => {
      const newOrder = computeBoardOrder('between', { before: 1000, after: 2000 });
      expect(newOrder).toBe(1500);
    });
  });

  // ------------------------------------------------------------------------
  // Feature 13: Manager Transition Request Trigger
  // ------------------------------------------------------------------------
  describe('Feature 13: Manager Transition Request Trigger', () => {
    it('test_f13_01_manager_trigger_visible_to_manager: renders trigger button when canRequestTransition is true', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} canRequestTransition={true} />);

      const trigger = screen.getByTestId('manager-transition-trigger');
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent('Notify Admin — ready for review');
    });

    it('test_f13_02_manager_trigger_disabled_when_gate_incomplete: trigger button disabled when task incomplete', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} canRequestTransition={true} />);

      const trigger = screen.getByTestId('manager-transition-trigger');
      expect(trigger).toBeDisabled();
    });

    it('test_f13_03_manager_trigger_tooltip_lists_incomplete_tasks: displays tooltip with blocker detail', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} canRequestTransition={true} />);

      const tooltip = screen.getByTestId('gate-prerequisite-tooltip');
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent('Advancement locked');
    });

    it('test_f13_04_manager_trigger_enabled_when_all_tasks_complete: button enables when all active tasks completed', () => {
      const readyWr: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 'task-1',
            workRequestId: 'wr-kanban-1',
            title: 'Draft GIS Form',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
          {
            id: 'task-2',
            workRequestId: 'wr-kanban-1',
            title: 'Obtain Board Specimen Signatures',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 2000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={readyWr} canRequestTransition={true} />);
      const trigger = screen.getByTestId('manager-transition-trigger');
      expect(trigger).not.toBeDisabled();
    });

    it('test_f13_05_manager_trigger_submits_operations_request: clicking enabled button invokes request callback', () => {
      const onRequest = vi.fn();
      const readyWr: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 'task-1',
            workRequestId: 'wr-kanban-1',
            title: 'Task 1',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={readyWr} canRequestTransition={true} onRequestTransition={onRequest} />);
      const trigger = screen.getByTestId('manager-transition-trigger');
      fireEvent.click(trigger);
      expect(onRequest).toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------------
  // Feature 14: Admin Direct Advance & Fulfill/Reject
  // ------------------------------------------------------------------------
  describe('Feature 14: Admin Direct Advance & Fulfill/Reject', () => {
    it('test_f14_01_admin_direct_advance_button_visible_to_admin: renders Advance button when canAdvance is true', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} canAdvance={true} />);

      const advanceBtn = screen.getByTestId('admin-advance-button');
      expect(advanceBtn).toBeInTheDocument();
      expect(advanceBtn).toHaveTextContent('Advance');
    });

    it('test_f14_02_admin_advance_from_preprocessing_to_processing: direct advance triggers next phase transition', () => {
      const onAdvance = vi.fn();
      render(<PhaseKanbanHarness workRequest={baseWr} canAdvance={true} onAdvance={onAdvance} />);

      const advanceBtn = screen.getByTestId('admin-advance-button');
      fireEvent.click(advanceBtn);
      expect(onAdvance).toHaveBeenCalledWith('processing');
    });

    it('test_f14_03_admin_advance_from_processing_to_qa: advancing from processing requests quality_assurance', () => {
      const onAdvance = vi.fn();
      const processingWr: WorkRequest = {
        ...baseWr,
        phase: 'processing',
      };

      render(<PhaseKanbanHarness workRequest={processingWr} canAdvance={true} onAdvance={onAdvance} />);
      const advanceBtn = screen.getByTestId('admin-advance-button');
      fireEvent.click(advanceBtn);
      expect(onAdvance).toHaveBeenCalledWith('quality_assurance');
    });

    it('test_f14_04_admin_advance_blocked_if_gate_incomplete_409: gate evaluation returns GATE_PREREQUISITE_FAILED', () => {
      const incompleteTasks: Task[] = [
        {
          id: 't-1',
          workRequestId: 'wr-1',
          title: 'Unfinished processing',
          status: 'In Progress',
          phase: 'processing',
          qaStatus: 'none',
          displayOrder: 1000,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ];

      const result = evaluateAdvancementGate('processing', 'quality_assurance', incompleteTasks);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('GATE_PREREQUISITE_FAILED');
    });

    it('test_f14_05_admin_cannot_skip_intermediate_phases: jumping from pre_processing to completion returns INVALID_PHASE_TRANSITION', () => {
      const result = evaluateAdvancementGate('pre_processing', 'completion', []);
      expect(result.allowed).toBe(false);
      expect(result.code).toBe('INVALID_PHASE_TRANSITION');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 15: QA Review Controls (Per-Task Toggles)
  // ------------------------------------------------------------------------
  describe('Feature 15: QA Review Controls (Per-Task Toggles)', () => {
    const qaWr: WorkRequest = {
      ...baseWr,
      phase: 'quality_assurance',
      tasks: [
        {
          id: 'qa-task-1',
          workRequestId: 'wr-kanban-1',
          title: 'Review Audited Tax Calculations',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'none',
          displayOrder: 1000,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'qa-task-2',
          workRequestId: 'wr-kanban-1',
          title: 'Verify Client Tax Exemption Certificates',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'none',
          displayOrder: 2000,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    };

    it('test_f15_01_qa_controls_visible_only_in_qa_phase: QA pass/fail toggle switches render in quality_assurance', () => {
      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);

      expect(screen.getByTestId('qa-pass-qa-task-1')).toBeInTheDocument();
      expect(screen.getByTestId('qa-fail-qa-task-1')).toBeInTheDocument();
    });

    it('test_f15_02_qa_toggle_pass: clicking Pass button activates passed state style', () => {
      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);

      const passBtn = screen.getByTestId('qa-pass-qa-task-1');
      fireEvent.click(passBtn);

      expect(passBtn).toHaveClass('bg-green-600');
    });

    it('test_f15_03_qa_toggle_fail: clicking Fail button activates failed state style', () => {
      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);

      const failBtn = screen.getByTestId('qa-fail-qa-task-2');
      fireEvent.click(failBtn);

      expect(failBtn).toHaveClass('bg-red-600');
    });

    it('test_f15_04_qa_header_counter_badge: updates passed and failed counts in QA column badge', () => {
      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);

      fireEvent.click(screen.getByTestId('qa-pass-qa-task-1'));
      fireEvent.click(screen.getByTestId('qa-fail-qa-task-2'));

      const counter = screen.getByTestId('qa-eval-counter-badge');
      expect(counter).toHaveTextContent('1 Passed, 1 Failed');
    });

    it('test_f15_05_qa_submit_evaluations_blocking_mutation: clicking Submit QA Review gathers task evaluations', () => {
      const onQaSubmit = vi.fn();
      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} onQaSubmit={onQaSubmit} />);

      fireEvent.click(screen.getByTestId('qa-pass-qa-task-1'));
      fireEvent.click(screen.getByTestId('qa-fail-qa-task-2'));

      const submitBtn = screen.getByTestId('submit-qa-review-button');
      fireEvent.click(submitBtn);

      expect(onQaSubmit).toHaveBeenCalledWith([
        { taskId: 'qa-task-1', qaStatus: 'passed' },
        { taskId: 'qa-task-2', qaStatus: 'failed' },
      ]);
    });
  });
});
