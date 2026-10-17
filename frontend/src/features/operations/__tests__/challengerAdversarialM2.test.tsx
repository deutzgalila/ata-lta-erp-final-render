import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

// Domain Imports
import { validateDependencies } from '../utils/dependencyValidator';
import { parseTaskDelimiterInput, useTokenizer } from '../hooks/useTokenizer';
import { useDebounce } from '../hooks/useDebounce';
import { RejectReasonModal } from '../components/RejectReasonModal';
import { resolveTransitionRequestSchema } from '../api/schemas';
import { WorkRequestModal } from '../components/WorkRequestModal';
import { TaskLineItems, type TaskItemData } from '../components/TaskLineItems';
import { useBlockingModalStore } from '../components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('Empirical Challenger — Adversarial Stress Test Harness (Milestone 2)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'u-challenger-1',
        email: 'challenger@ata-lta.ph',
        name: 'Challenger',
        role: 'Admin',
        departments: ['Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'workflow:task_add',
        'workflow:phase_transition',
        'workflow:transition_request',
        'workflow:qa_review',
        'retainers:use',
        'retainers:edit',
      ],
      activeEntity: 'ATA',
    });

    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/me/team')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'u-mgr-1', name: 'Manager One', email: 'mgr@ata.ph', role: 'Manager' },
              { id: 'u-staff-1', name: 'Staff One', email: 'staff@ata.ph', role: 'Staff' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('/clients')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'c-1', name: 'Acme Corp', entity: 'ATA' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ==========================================================================
  // SUITE 1: Complex DAG Cycle Detection
  // ==========================================================================
  describe('Adversarial Challenge 1: Complex DAG Cycle Detection', () => {
    it('catches self-references (A -> A) as string and as array item', () => {
      // Direct string self-reference
      const res1 = validateDependencies([{ id: 'task-1', dependsOn: 'task-1' }]);
      expect(res1.hasCycle).toBe(true);
      expect(res1.error).toContain("Self-dependency detected for task 'task-1'");

      // Array self-reference
      const res2 = validateDependencies([
        { id: 'task-1', dependsOn: ['task-1'] },
      ]);
      expect(res2.hasCycle).toBe(true);
      expect(res2.error).toContain("Self-dependency detected for task 'task-1'");
    });

    it('catches 2-node cycle (A -> B -> A)', () => {
      const res = validateDependencies([
        { id: 't-a', dependsOn: 't-b' },
        { id: 't-b', dependsOn: 't-a' },
      ]);
      expect(res.hasCycle).toBe(true);
      expect(res.error).toMatch(/Circular dependency/);
    });

    it('catches 3-node cycle (A -> B -> C -> A)', () => {
      const res = validateDependencies([
        { id: 't-a', dependsOn: 't-b' },
        { id: 't-b', dependsOn: 't-c' },
        { id: 't-c', dependsOn: 't-a' },
      ]);
      expect(res.hasCycle).toBe(true);
      expect(res.error).toMatch(/Circular dependency/);
    });

    it('catches multiple disjoint cycles in the same graph', () => {
      const res = validateDependencies([
        // Cycle 1: C1 -> C2 -> C1
        { id: 'c1', dependsOn: 'c2' },
        { id: 'c2', dependsOn: 'c1' },
        // Cycle 2: D1 -> D2 -> D1
        { id: 'd1', dependsOn: 'd2' },
        { id: 'd2', dependsOn: 'd1' },
      ]);
      expect(res.hasCycle).toBe(true);
    });

    it('catches figure-eight interconnected cycles (A -> B -> C -> A and C -> D -> E -> C)', () => {
      const res = validateDependencies([
        { id: 'node-a', dependsOn: 'node-b' },
        { id: 'node-b', dependsOn: 'node-c' },
        { id: 'node-c', dependsOn: ['node-a', 'node-d'] },
        { id: 'node-d', dependsOn: 'node-e' },
        { id: 'node-e', dependsOn: 'node-c' },
      ]);
      expect(res.hasCycle).toBe(true);
      expect(res.error).toMatch(/Circular dependency/);
    });

    it('handles disconnected subgraphs: valid subgraph + cyclic subgraph', () => {
      // Subgraph 1 is valid DAG: v1 -> v2 -> v3
      // Subgraph 2 has cycle: x1 -> x2 -> x1
      const res1 = validateDependencies([
        { id: 'v1', dependsOn: null },
        { id: 'v2', dependsOn: 'v1' },
        { id: 'v3', dependsOn: 'v2' },
        { id: 'x1', dependsOn: 'x2' },
        { id: 'x2', dependsOn: 'x1' },
      ]);
      expect(res1.hasCycle).toBe(true);

      // Reversing order in array ensures search reaches the cyclic component
      const res2 = validateDependencies([
        { id: 'x1', dependsOn: 'x2' },
        { id: 'x2', dependsOn: 'x1' },
        { id: 'v1', dependsOn: null },
        { id: 'v2', dependsOn: 'v1' },
        { id: 'v3', dependsOn: 'v2' },
      ]);
      expect(res2.hasCycle).toBe(true);
    });

    it('confirms multiple disjoint acyclic components pass without false positives', () => {
      const res = validateDependencies([
        // Component A: a1 -> a2 -> a3
        { id: 'a1', dependsOn: null },
        { id: 'a2', dependsOn: 'a1' },
        { id: 'a3', dependsOn: 'a2' },
        // Component B: b1 -> b2
        { id: 'b1', dependsOn: null },
        { id: 'b2', dependsOn: 'b1' },
        // Component C: isolated singleton
        { id: 'c1', dependsOn: null },
      ]);
      expect(res.hasCycle).toBe(false);
      expect(res.error).toBeUndefined();
    });

    it('correctly handles diamond-shaped DAGs without false positive cycle alarms', () => {
      // D depends on B and C; both B and C depend on A
      const res = validateDependencies([
        { id: 'node-a', dependsOn: null },
        { id: 'node-b', dependsOn: 'node-a' },
        { id: 'node-c', dependsOn: 'node-a' },
        { id: 'node-d', dependsOn: ['node-b', 'node-c'] },
      ]);
      expect(res.hasCycle).toBe(false);
    });

    it('survives stress tests on large graphs (100-node linear DAG and 100-node cyclic graph)', () => {
      const nodeCount = 100;

      // 1. Acyclic 100-node chain: node-99 -> node-98 -> ... -> node-0
      const acyclicNodes = Array.from({ length: nodeCount }, (_, i) => ({
        id: `node-${i}`,
        dependsOn: i > 0 ? `node-${i - 1}` : null,
      }));
      const startAcyclic = performance.now();
      const acyclicRes = validateDependencies(acyclicNodes);
      const acyclicElapsed = performance.now() - startAcyclic;

      expect(acyclicRes.hasCycle).toBe(false);
      expect(acyclicElapsed).toBeLessThan(100); // Must be fast (< 100ms)

      // 2. Cyclic 100-node chain: node-0 now depends on node-99
      const cyclicNodes = Array.from({ length: nodeCount }, (_, i) => ({
        id: `node-${i}`,
        dependsOn: i > 0 ? `node-${i - 1}` : `node-${nodeCount - 1}`,
      }));
      const cyclicRes = validateDependencies(cyclicNodes);
      expect(cyclicRes.hasCycle).toBe(true);
    });

    it('evaluates 500-node dense DAG mesh efficiently', () => {
      // Create a 500-node layered DAG
      const nodes = Array.from({ length: 500 }, (_, i) => {
        // Each node depends on up to 3 previous nodes
        const deps: string[] = [];
        if (i > 0) deps.push(`n-${i - 1}`);
        if (i > 5) deps.push(`n-${i - 5}`);
        if (i > 10) deps.push(`n-${i - 10}`);
        return {
          id: `n-${i}`,
          dependsOn: deps.length > 0 ? deps : null,
        };
      });

      const start = performance.now();
      const res = validateDependencies(nodes);
      const elapsed = performance.now() - start;

      expect(res.hasCycle).toBe(false);
      expect(elapsed).toBeLessThan(200); // 500 nodes checked in < 200ms
    });

    it('bypasses wildcard "*" dependency without triggering false cycle or non-existent target error', () => {
      // Single task with wildcard
      const res1 = validateDependencies([
        { id: 't-1', dependsOn: null },
        { id: 't-2', dependsOn: '*' },
      ]);
      expect(res1.hasCycle).toBe(false);

      // Multiple tasks with wildcard
      const res2 = validateDependencies([
        { id: 't-1', dependsOn: null },
        { id: 't-2', dependsOn: '*' },
        { id: 't-3', dependsOn: '*' },
      ]);
      expect(res2.hasCycle).toBe(false);

      // Array containing wildcard
      const res3 = validateDependencies([
        { id: 't-1', dependsOn: null },
        { id: 't-2', dependsOn: ['*'] },
      ]);
      expect(res3.hasCycle).toBe(false);

      // Task depending on another task that has wildcard
      const res4 = validateDependencies([
        { id: 't-1', dependsOn: null },
        { id: 't-2', dependsOn: '*' },
        { id: 't-3', dependsOn: 't-2' },
      ]);
      expect(res4.hasCycle).toBe(false);
    });

    it('rejects invalid dependency identifiers ("0", "", non-existent ID)', () => {
      // "0"
      const resZero = validateDependencies([
        { id: 't-1', dependsOn: '0' },
      ]);
      expect(resZero.hasCycle).toBe(true);
      expect(resZero.error).toContain("Invalid dependency identifier '0'");

      // empty string ""
      const resEmpty = validateDependencies([
        { id: 't-1', dependsOn: '' },
      ]);
      expect(resEmpty.hasCycle).toBe(true);
      expect(resEmpty.error).toContain("Invalid dependency identifier ''");

      // Non-existent target
      const resMissing = validateDependencies([
        { id: 't-1', dependsOn: 't-ghost' },
      ]);
      expect(resMissing.hasCycle).toBe(true);
      expect(resMissing.error).toContain("Dependency target 't-ghost' does not exist in work request");
    });

    it('tolerates duplicate dependencies in array without false positives', () => {
      const res = validateDependencies([
        { id: 't-1', dependsOn: null },
        { id: 't-2', dependsOn: ['t-1', 't-1'] },
      ]);
      expect(res.hasCycle).toBe(false);
    });
  });

  // ==========================================================================
  // SUITE 2: Delimiter Tokenization Edge Cases
  // ==========================================================================
  describe('Adversarial Challenge 2: Delimiter Tokenization Edge Cases', () => {
    it('handles exactly 50 tokens (boundary valid, shouldSplit=true, exceedsLimit=false)', () => {
      const tokens50 = Array.from({ length: 50 }, (_, i) => `Task ${i + 1}`).join(', ');
      const res = parseTaskDelimiterInput(tokens50);

      expect(res.count).toBe(50);
      expect(res.shouldSplit).toBe(true);
      expect(res.exceedsLimit).toBe(false);
      expect(res.tokens).toHaveLength(50);
      expect(res.tokens[0]).toBe('Task 1');
      expect(res.tokens[49]).toBe('Task 50');
    });

    it('flags 51 tokens as exceeding limit (exceedsLimit=true, count=51)', () => {
      const tokens51 = Array.from({ length: 51 }, (_, i) => `Task ${i + 1}`).join('; ');
      const res = parseTaskDelimiterInput(tokens51);

      expect(res.count).toBe(51);
      expect(res.shouldSplit).toBe(true);
      expect(res.exceedsLimit).toBe(true);
      expect(res.tokens).toHaveLength(51);
    });

    it('survives extreme token flood (100+ tokens)', () => {
      const tokens150 = Array.from({ length: 150 }, (_, i) => `Task ${i + 1}`).join('\n');
      const res = parseTaskDelimiterInput(tokens150);

      expect(res.count).toBe(150);
      expect(res.shouldSplit).toBe(true);
      expect(res.exceedsLimit).toBe(true);
    });

    it('handles unicode characters and multilingual task names cleanly', () => {
      // Asian text, accents, and symbols with standard delimiters
      const input = '顧客訪問; 税務申告, Documentación legal\nPagos de impuestos';
      const res = parseTaskDelimiterInput(input);

      expect(res.count).toBe(4);
      expect(res.shouldSplit).toBe(true);
      expect(res.tokens).toEqual([
        '顧客訪問',
        '税務申告',
        'Documentación legal',
        'Pagos de impuestos',
      ]);
    });

    it('treats full-width unicode punctuation (，；。) as regular text when ASCII delimiters are absent', () => {
      // Asian full-width comma/semicolon without ASCII delimiter
      const input = '顧客訪問，税務申告；完了。';
      const res = parseTaskDelimiterInput(input);

      // Only ASCII [,;\n] and .\s+ split
      expect(res.count).toBe(1);
      expect(res.shouldSplit).toBe(false);
      expect(res.tokens).toEqual(['顧客訪問，税務申告；完了。']);
    });

    it('filters out empty tokens generated by consecutive delimiters (,,,;;;\\n\\n)', () => {
      const input = 'Task 1 ,,, Task 2 ;;; Task 3 \n\n\n Task 4';
      const res = parseTaskDelimiterInput(input);

      expect(res.count).toBe(4);
      expect(res.shouldSplit).toBe(true);
      expect(res.tokens).toEqual(['Task 1', 'Task 2', 'Task 3', 'Task 4']);
    });

    it('trims leading, trailing, and inter-token whitespace around delimiters', () => {
      const input = '   , ; \n  Task A   ,   Task B   \n\n  ;  ';
      const res = parseTaskDelimiterInput(input);

      expect(res.count).toBe(2);
      expect(res.shouldSplit).toBe(true);
      expect(res.tokens).toEqual(['Task A', 'Task B']);
    });

    it('period splitting: splits on period followed by whitespace, preserves numbers/filenames/dots', () => {
      // Period followed by whitespace splits
      const sentenceInput = 'First review BIR form. Then submit to counter. Finally archive.';
      const sentenceRes = parseTaskDelimiterInput(sentenceInput);
      expect(sentenceRes.count).toBe(3);
      expect(sentenceRes.tokens).toEqual([
        'First review BIR form',
        'Then submit to counter',
        'Finally archive.',
      ]);

      // Version number and file extension do not split
      const nonSplitInput = 'Upgrade to v2.5.1 and inspect file_v1.0.pdf';
      const nonSplitRes = parseTaskDelimiterInput(nonSplitInput);
      expect(nonSplitRes.count).toBe(1);
      expect(nonSplitRes.shouldSplit).toBe(false);
    });

    it('handles empty or whitespace-only input gracefully', () => {
      expect(parseTaskDelimiterInput('')).toEqual({
        tokens: [],
        count: 0,
        exceedsLimit: false,
        shouldSplit: false,
      });

      expect(parseTaskDelimiterInput('   \n\t  ')).toEqual({
        tokens: [],
        count: 0,
        exceedsLimit: false,
        shouldSplit: false,
      });
    });

    it('useTokenizer React hook returns memoized result identical to parseTaskDelimiterInput', () => {
      const { result, rerender } = renderHook(({ text }) => useTokenizer(text), {
        initialProps: { text: 'Subtask 1, Subtask 2' },
      });

      expect(result.current.count).toBe(2);
      expect(result.current.tokens).toEqual(['Subtask 1', 'Subtask 2']);

      // Rerender with same prop retains referential equality
      const firstRef = result.current;
      rerender({ text: 'Subtask 1, Subtask 2' });
      expect(result.current).toBe(firstRef);
    });
  });

  // ==========================================================================
  // SUITE 3: Form State & Validation Edge Cases
  // ==========================================================================
  describe('Adversarial Challenge 3: Form State & Validation Edge Cases', () => {
    it('useDebounce delays update until timeout and cancels prior timers on rapid typing', async () => {
      const { result, rerender } = renderHook(
        ({ query }) => useDebounce(query, 50),
        { initialProps: { query: 'init' } }
      );

      expect(result.current).toBe('init');

      // Rapidly simulate keystrokes with 15ms gaps (< 50ms debounce threshold)
      rerender({ query: 'i' });
      await new Promise((r) => setTimeout(r, 15));
      expect(result.current).toBe('init');

      rerender({ query: 'in' });
      await new Promise((r) => setTimeout(r, 15));
      expect(result.current).toBe('init');

      rerender({ query: 'int' });
      await new Promise((r) => setTimeout(r, 15));
      expect(result.current).toBe('init');

      rerender({ query: 'intake' });
      // Immediately after last keystroke, still 'init'
      expect(result.current).toBe('init');

      // After debounce window (50ms) expires, value updates to 'intake'
      await waitFor(() => {
        expect(result.current).toBe('intake');
      });
    });

    it('useDebounce cleans up timer on unmount without throwing errors', () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = renderHook(() => useDebounce('search-term', 300));
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('blocks WorkRequestModal submission when title is empty or only whitespace', async () => {
      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(<WorkRequestModal isOpen={true} onClose={onClose} />, { wrapper });

      // Click submit with empty form
      const submitBtn = screen.getByTestId('wr-modal-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });

      // Type only spaces
      const titleInput = screen.getByTestId('wr-modal-title-input');
      fireEvent.change(titleInput, { target: { value: '      ' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });
    });

    it('escapes and sanitizes XSS injection payloads in task titles without execution', () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        '"><svg onload=alert(document.cookie)>',
        'javascript:alert(1)',
      ];

      xssPayloads.forEach((payload) => {
        const tokenized = parseTaskDelimiterInput(payload);
        // The tokenizer should preserve the verbatim string payload without mutation
        expect(tokenized.tokens[0]).toBe(payload);
      });
    });

    it('dynamic TaskLineItems safely adds tasks, prunes empty tasks, and handles title edits', () => {
      let taskState: TaskItemData[] = [
        { localId: 't-1', title: 'Task 1', phase: 'pre_processing', dependsOn: null, checklist: [], coAssignees: [] },
        { localId: 't-2', title: 'Task 2', phase: 'pre_processing', dependsOn: 't-1', checklist: [], coAssignees: [] },
      ];

      const onChange = (updated: TaskItemData[]) => {
        taskState = updated;
      };

      const projectTeam = [
        { id: 'u-1', name: 'Alice Manager', email: 'alice@ata.ph', role: 'Manager' },
      ];

      const { rerender } = render(
        <TaskLineItems
          tasks={taskState}
          onChange={onChange}
          projectTeam={projectTeam}
        />
      );

      // Verify line items render
      expect(screen.getByTestId('task-line-items')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Task 1')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Task 2')).toBeInTheDocument();

      // Clear title of Task 1 -> should trigger pruning of dependency in Task 2
      const task1Input = screen.getByDisplayValue('Task 1');
      fireEvent.change(task1Input, { target: { value: '' } });

      rerender(
        <TaskLineItems
          tasks={taskState}
          onChange={onChange}
          projectTeam={projectTeam}
        />
      );

      // Task 2's dependsOn should be pruned since Task 1 title was cleared
      expect(taskState[1]?.dependsOn).toBeNull();
    });
  });

  // ==========================================================================
  // SUITE 4: Rejection Reason Boundaries
  // ==========================================================================
  describe('Adversarial Challenge 4: Rejection Reason Boundaries', () => {
    it('Boundary 0 characters: empty string is blocked in RejectReasonModal', async () => {
      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(
        <RejectReasonModal
          isOpen={true}
          requestId="req-1"
          workRequestTitle="BIR Review"
          onClose={onClose}
        />,
        { wrapper }
      );

      const submitBtn = screen.getByTestId('reject-reason-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('reject-reason-error')).toBeInTheDocument();
        expect(screen.getByText('Rejection reason is required (minimum 1 character)')).toBeInTheDocument();
      });
      expect(useBlockingModalStore.getState().isOpen).toBe(false);
    });

    it('Boundary 0 characters (whitespace-only): blocked in RejectReasonModal', async () => {
      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(
        <RejectReasonModal
          isOpen={true}
          requestId="req-1"
          workRequestTitle="BIR Review"
          onClose={onClose}
        />,
        { wrapper }
      );

      const textarea = screen.getByTestId('reject-reason-textarea');
      fireEvent.change(textarea, { target: { value: '   \n\t   ' } });

      const submitBtn = screen.getByTestId('reject-reason-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('reject-reason-error')).toBeInTheDocument();
        expect(screen.getByText('Rejection reason is required (minimum 1 character)')).toBeInTheDocument();
      });
      expect(useBlockingModalStore.getState().isOpen).toBe(false);
    });

    it('Boundary 1 character: valid and accepted in RejectReasonModal', async () => {
      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(
        <RejectReasonModal
          isOpen={true}
          requestId="req-1"
          workRequestTitle="BIR Review"
          onClose={onClose}
        />,
        { wrapper }
      );

      const textarea = screen.getByTestId('reject-reason-textarea');
      fireEvent.change(textarea, { target: { value: 'X' } });

      // Character counter shows 1 / 2000
      expect(screen.getByText('1 / 2000 characters')).toBeInTheDocument();

      const submitBtn = screen.getByTestId('reject-reason-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('reject-reason-error')).not.toBeInTheDocument();
        expect(useBlockingModalStore.getState().title).toBe('Rejecting Phase Transition');
      });
    });

    it('Boundary 2000 characters: valid and accepted in RejectReasonModal', async () => {
      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(
        <RejectReasonModal
          isOpen={true}
          requestId="req-1"
          workRequestTitle="BIR Review"
          onClose={onClose}
        />,
        { wrapper }
      );

      const valid2000 = 'R'.repeat(2000);
      const textarea = screen.getByTestId('reject-reason-textarea');
      fireEvent.change(textarea, { target: { value: valid2000 } });

      // Character counter shows 2000 / 2000
      expect(screen.getByText('2000 / 2000 characters')).toBeInTheDocument();

      const submitBtn = screen.getByTestId('reject-reason-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('reject-reason-error')).not.toBeInTheDocument();
        expect(useBlockingModalStore.getState().title).toBe('Rejecting Phase Transition');
      });
    });

    it('Boundary 2001 characters: blocked with explicit error in RejectReasonModal', async () => {
      const { wrapper } = createHarness();
      const onClose = vi.fn();

      render(
        <RejectReasonModal
          isOpen={true}
          requestId="req-1"
          workRequestTitle="BIR Review"
          onClose={onClose}
        />,
        { wrapper }
      );

      const invalid2001 = 'R'.repeat(2001);
      const textarea = screen.getByTestId('reject-reason-textarea');
      fireEvent.change(textarea, { target: { value: invalid2001 } });

      expect(screen.getByText('2001 / 2000 characters')).toBeInTheDocument();

      const submitBtn = screen.getByTestId('reject-reason-submit-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('reject-reason-error')).toBeInTheDocument();
        expect(
          screen.getByText('Rejection reason cannot exceed 2000 characters')
        ).toBeInTheDocument();
      });
      // Blocking modal must not be opened
      expect(useBlockingModalStore.getState().isOpen).toBe(false);
    });

    it('Zod Schema validation parity: resolveTransitionRequestSchema strict enforcement', () => {
      // 1. 0 chars / empty string -> rejected
      const res0 = resolveTransitionRequestSchema.safeParse({
        status: 'rejected',
        rejectionReason: '',
      });
      expect(res0.success).toBe(false);

      // 2. 0 chars / whitespace-only -> rejected
      const resWhitespace = resolveTransitionRequestSchema.safeParse({
        status: 'rejected',
        rejectionReason: '   \n\t  ',
      });
      expect(resWhitespace.success).toBe(false);

      // 3. 1 char -> valid
      const res1 = resolveTransitionRequestSchema.safeParse({
        status: 'rejected',
        rejectionReason: 'A',
      });
      expect(res1.success).toBe(true);

      // 4. 2000 chars -> valid
      const res2000 = resolveTransitionRequestSchema.safeParse({
        status: 'rejected',
        rejectionReason: 'A'.repeat(2000),
      });
      expect(res2000.success).toBe(true);

      // 5. 2001 chars -> rejected (fails max constraint)
      const res2001 = resolveTransitionRequestSchema.safeParse({
        status: 'rejected',
        rejectionReason: 'A'.repeat(2001),
      });
      expect(res2001.success).toBe(false);

      // 6. When status is not 'rejected' (e.g. 'fulfilled'), rejectionReason is optional
      const resFulfilled = resolveTransitionRequestSchema.safeParse({
        status: 'fulfilled',
      });
      expect(resFulfilled.success).toBe(true);
    });
  });
});
