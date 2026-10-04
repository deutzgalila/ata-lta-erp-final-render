import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useUsersList,
  useUserDetail,
  createUserAction,
  updateUserAction,
  disableUserAction,
} from '../api/useUsers';
import {
  useRetainerTemplatesList,
  createRetainerTemplateAction,
  updateRetainerTemplateAction,
  deleteRetainerTemplateAction,
} from '../api/useRetainerTemplates';
import {
  useRetainerGenerationsList,
  useAuditCount,
} from '../api/useRetainerGenerations';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';
import type { AdminUser, RetainerTemplate, AuditLogResponse } from '../api/types';

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

const mockUsers: AdminUser[] = [
  {
    id: 'u-1',
    name: 'Juan Dela Cruz',
    email: 'juan@ata-lta.ph',
    role: 'Admin',
    departments: ['Management', 'Accounting', 'Operations', 'Documentation', 'HR'],
    entities: ['ATA', 'LTA'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u-2',
    name: 'Maria Santos',
    email: 'maria@ata-lta.ph',
    role: 'Operations',
    departments: ['Operations'],
    entities: ['ATA'],
    isActive: true,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

const mockTemplates: RetainerTemplate[] = [
  {
    id: 'tpl-1',
    entity_id: 'ent-ata',
    name: 'Annual Tax Compliance Retainer',
    description: 'Yearly BIR statutory returns',
    client_id: 'c-1',
    schedule: 'annual',
    priority: 'Normal',
    pf_amount: 35000,
    recurrence: 'annual',
    tasks: [
      {
        local_id: 'task_1',
        title: 'Review Trial Balance',
        phase: 'pre_processing',
        default_assignees: ['u-2'],
      },
      {
        local_id: 'task_2',
        title: 'Compute Withholding Taxes',
        phase: 'processing',
        depends_on_local_id: 'task_1',
      },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockAuditLogs: AuditLogResponse = {
  data: [
    {
      id: 'aud-1',
      action: 'retainer-template.generated',
      tableName: 'retainer_template_generations',
      recordId: 'rec-1',
      entity: 'ATA',
      userId: 'u-1',
      details: {
        templateId: 'tpl-1',
        periodLabel: 'FY-2026-SMOKE',
        workRequestId: 'wr-1',
      },
      createdAt: '2026-10-04T08:00:00Z',
    },
  ],
  meta: {
    total: 1,
    limit: 20,
    offset: 0,
    hasMore: false,
  },
};

describe('Admin Data Layer: TanStack Query Hooks & Blocking Mutations', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'u-1',
        email: 'juan@ata-lta.ph',
        name: 'Juan Dela Cruz',
        role: 'Admin',
        departments: ['Management', 'Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: ['users:view', 'users:manage', 'retainers:use', 'retainers:edit'],
      activeEntity: 'ALL',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    useBlockingModalStore.getState().reset();
  });

  describe('User Query Hooks', () => {
    it('useUsersList fetches users array from /v1/admin/users', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockUsers }),
      } as Response);

      const { wrapper } = createHarness();
      const { result } = renderHook(() => useUsersList(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.length).toBe(2);
      expect(result.current.data?.[0]?.name).toBe('Juan Dela Cruz');
    });

    it('useUserDetail fetches individual user details', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockUsers[1] }),
      } as Response);

      const { wrapper } = createHarness();
      const { result } = renderHook(() => useUserDetail('u-2'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.id).toBe('u-2');
      expect(result.current.data?.role).toBe('Operations');
    });
  });

  describe('User Mutation Actions (runBlockingAction)', () => {
    it('createUserAction executes POST and handles success', async () => {
      const newUser: AdminUser = {
        id: 'u-3',
        name: 'Pedro Reyes',
        email: 'pedro@ata-lta.ph',
        role: 'Documentation',
        departments: ['Documentation'],
        entities: ['LTA'],
        isActive: true,
        createdAt: '2026-10-04T00:00:00Z',
        updatedAt: '2026-10-04T00:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: newUser }),
      } as Response);

      const res = await createUserAction({
        name: 'Pedro Reyes',
        email: 'pedro@ata-lta.ph',
        role: 'Documentation',
        departments: ['Documentation'],
        entities: ['LTA'],
      });

      expect(res.id).toBe('u-3');
      expect(res.email).toBe('pedro@ata-lta.ph');
    });

    it('createUserAction surfaces USER_LIMIT_REACHED error verbatim', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          status: 403,
          title: 'Forbidden',
          detail: 'Maximum number of user accounts (15) reached. Contact the administrator to disable an existing account before adding a new one.',
          code: 'USER_LIMIT_REACHED',
        }),
      } as Response);

      await expect(
        createUserAction({
          name: 'Extra User',
          email: 'extra@ata-lta.ph',
          role: 'HR',
          entities: ['ATA'],
        })
      ).rejects.toThrow();

      const modalState = useBlockingModalStore.getState();
      expect(modalState.error?.code).toBe('USER_LIMIT_REACHED');
      expect(modalState.error?.detail).toContain('Maximum number of user accounts (15) reached');
    });

    it('updateUserAction executes PUT and invalidates cache', async () => {
      const updatedUser: AdminUser = {
        ...mockUsers[1]!,
        name: 'Maria Santos-Valdez',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedUser }),
      } as Response);

      const res = await updateUserAction('u-2', {
        name: 'Maria Santos-Valdez',
      });

      expect(res.name).toBe('Maria Santos-Valdez');
    });

    it('disableUserAction executes DELETE to soft-disable user', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as Response);

      await disableUserAction('u-2', 'Maria Santos');
      const modalState = useBlockingModalStore.getState();
      expect(modalState.status).toBe('success');
      expect(modalState.successTitle).toBe('User Disabled');
    });
  });

  describe('Retainer Template Query & Mutation Hooks', () => {
    it('useRetainerTemplatesList fetches template list from /v1/operations/templates', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockTemplates }),
      } as Response);

      const { wrapper } = createHarness();
      const { result } = renderHook(() => useRetainerTemplatesList(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.length).toBe(1);
      expect(result.current.data?.[0]?.name).toBe('Annual Tax Compliance Retainer');
    });

    it('createRetainerTemplateAction executes POST and stores blueprint', async () => {
      const newTemplate: RetainerTemplate = {
        id: 'tpl-2',
        entity_id: 'ent-ata',
        name: 'Monthly Payroll Retainer',
        description: null,
        client_id: null,
        schedule: 'monthly',
        priority: 'Normal',
        pf_amount: 15000,
        recurrence: 'none',
        tasks: [{ title: 'Process Timesheets', phase: 'pre_processing' }],
        created_at: '2026-10-04T00:00:00Z',
        updated_at: '2026-10-04T00:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: newTemplate }),
      } as Response);

      const res = await createRetainerTemplateAction({
        name: 'Monthly Payroll Retainer',
        schedule: 'monthly',
        pfAmount: 15000,
        tasks: [{ title: 'Process Timesheets', phase: 'pre_processing' }],
      });

      expect(res.id).toBe('tpl-2');
      expect(res.name).toBe('Monthly Payroll Retainer');
    });

    it('updateRetainerTemplateAction executes PUT', async () => {
      const updatedTemplate: RetainerTemplate = {
        ...mockTemplates[0]!,
        name: 'Updated Compliance Retainer',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedTemplate }),
      } as Response);

      const res = await updateRetainerTemplateAction('tpl-1', {
        name: 'Updated Compliance Retainer',
      });

      expect(res.name).toBe('Updated Compliance Retainer');
    });

    it('deleteRetainerTemplateAction executes DELETE', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as Response);

      await deleteRetainerTemplateAction('tpl-1', 'Annual Tax Compliance Retainer');
      const modalState = useBlockingModalStore.getState();
      expect(modalState.status).toBe('success');
      expect(modalState.successTitle).toBe('Template Deleted');
    });
  });

  describe('Retainer Generation Logs Query Hooks', () => {
    it('useRetainerGenerationsList queries /admin/audit with table=retainer_template_generations', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockAuditLogs,
      } as Response);

      const { wrapper } = createHarness();
      const { result } = renderHook(() => useRetainerGenerationsList({ page: 1, limit: 20 }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.data.length).toBe(1);
      expect(result.current.data?.meta.total).toBe(1);
    });

    it('useAuditCount queries /admin/audit/count', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { total: 777 } }),
      } as Response);

      const { wrapper } = createHarness();
      const { result } = renderHook(() => useAuditCount(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.total).toBe(777);
    });
  });
});
