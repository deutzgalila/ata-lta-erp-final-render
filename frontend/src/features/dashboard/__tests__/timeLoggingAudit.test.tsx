import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAssignedTasks } from '../api/useAssignedTasks';
import { useTimeEntriesList } from '../api/useTimeEntries';
import { useSessionStore } from '@/lib/session';
import { workDate } from '@/lib/workDate';
import * as api from '@/lib/api';

const session = (id = 'worker', role = 'Staff') => useSessionStore.getState().setSession({
  user: { id, role, email: 'dev-docs@ata-lta.ph', name: 'Worker', departments: ['Operations'], entities: ['ATA', 'LTA'] },
  permissions: ['timelog:view', 'timelog:create', ...(role === 'Admin' ? ['timelog:edit_all'] : [])],
  activeEntity: 'ATA',
});
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
afterEach(() => vi.restoreAllMocks());

describe('Time logging audit regressions', () => {
  it('requests embedded tasks and every page, retaining lead and both co-assignee formats', async () => {
    session();
    const spy = vi.spyOn(api, 'apiRequest').mockImplementation(async (path) => {
      const url = new URL(path, 'http://test');
      // Match the real list contract: tasks are absent without this flag.
      expect(url.searchParams.get('includeTasks')).toBe('true');
      return { data: [{ id: 'wr', title: 'Work', tasks: url.searchParams.get('page') === '1'
        ? [{ id: 'lead', assigneeId: 'worker' }, { id: 'other', assigneeId: 'other' }]
        : [{ id: 'co', task_assignees: [{ user_id: 'worker' }] }, { id: 'co2', taskAssignees: [{ userId: 'worker' }] }],
      }], meta: { totalPages: 2 } } as never;
    });
    const { result } = renderHook(useAssignedTasks, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.tasks.map((task) => task.taskId)).toEqual(['lead', 'co', 'co2']);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never invents a fixture or offers unassigned tasks to an admin', async () => {
    session('admin', 'Admin');
    vi.spyOn(api, 'apiRequest').mockResolvedValue({ data: [{ id: 'wr', tasks: [{ id: 'other', assigneeId: 'worker' }] }] });
    const { result } = renderHook(useAssignedTasks, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.tasks).toEqual([]);
  });

  it('does not discover tasks before a user is signed in', () => {
    useSessionStore.setState({ user: null });
    const spy = vi.spyOn(api, 'apiRequest');
    const { result } = renderHook(useAssignedTasks, { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(spy).not.toHaveBeenCalled();
  });

  it('partitions cached time rows by entity and viewer', async () => {
    session();
    const spy = vi.spyOn(api, 'apiRequest').mockImplementation(async () => ({ data: [{
      id: `${useSessionStore.getState().user?.id}-${useSessionStore.getState().activeEntity}`,
      user_id: 'worker', task_id: 'task', entry_date: '2026-10-11', duration_minutes: 30,
    }] }) as never);
    const { result } = renderHook(() => useTimeEntriesList(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('worker-ATA'));
    act(() => useSessionStore.getState().setActiveEntity('LTA'));
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('worker-LTA'));
    act(() => session('other'));
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('other-ATA'));
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('uses Manila midnight instead of UTC midnight', () => {
    expect(workDate(new Date('2026-10-10T15:59:59Z'))).toBe('2026-10-10');
    expect(workDate(new Date('2026-10-10T16:00:00Z'))).toBe('2026-10-11');
  });
});
