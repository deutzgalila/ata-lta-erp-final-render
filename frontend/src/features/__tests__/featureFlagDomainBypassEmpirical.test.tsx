import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkRequestList } from '@/features/operations/components/WorkRequestList';
import { InvoiceList } from '@/features/billing/components/InvoiceList';
import { DisbursementsTable } from '@/features/disbursements/components/DisbursementsTable';
import { useEntityRealtimeSync, clearChannelRegistryForTesting } from '@/lib/realtime/useEntityRealtimeSync';
import { supabase } from '@/lib/supabase';
import { useSessionStore } from '@/lib/session';
import { renderHook } from '@testing-library/react';

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

describe('Empirical Verification: Feature Flag Toggling and Domain Mount Clean Bypass', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    localStorage.clear();
    clearChannelRegistryForTesting();
    vi.restoreAllMocks();

    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Operations', 'Billing', 'Disbursements'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'billing:view',
        'billing:create',
        'disbursements:view',
        'disbursements:approve',
      ],
      activeEntity: 'ALL',
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/clients')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      }
      if (u.includes('/me/team')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      }
      if (u.includes('/work-requests')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [], meta: { total: 0 } }),
        } as Response);
      }
      if (u.includes('/invoices')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [], meta: { total: 0 } }),
        } as Response);
      }
      if (u.includes('/disbursements')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [], meta: { total: 0 } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as Response);
    });
  });

  afterEach(async () => {
    cleanup();
    await supabase.removeAllChannels();
    clearChannelRegistryForTesting();
    localStorage.clear();
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Criterion: Feature Flag Disabled via localStorage Override', () => {
    it('cleanly bypasses WorkRequestList subscriptions without errors when flag is "false"', () => {
      localStorage.setItem('erp_feature_override_realtime_sync', 'false');
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      expect(() => {
        render(<WorkRequestList />, { wrapper });
      }).not.toThrow();

      expect(channelSpy).not.toHaveBeenCalledWith('cdc_work_requests');
      expect(channelSpy).not.toHaveBeenCalledWith('cdc_tasks');
      expect(channelSpy).toHaveBeenCalledTimes(0);
      expect(screen.getByTestId('wr-search-input')).toBeInTheDocument();
    });

    it('cleanly bypasses InvoiceList subscriptions without errors when flag is "false"', () => {
      localStorage.setItem('erp_feature_override_realtime_sync', 'false');
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      expect(() => {
        render(<InvoiceList />, { wrapper });
      }).not.toThrow();

      expect(channelSpy).not.toHaveBeenCalledWith('cdc_invoices');
      expect(channelSpy).toHaveBeenCalledTimes(0);
      expect(screen.getByTestId('invoice-search-input')).toBeInTheDocument();
    });

    it('cleanly bypasses DisbursementsTable subscriptions without errors when flag is "false"', () => {
      localStorage.setItem('erp_feature_override_realtime_sync', 'false');
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      expect(() => {
        render(<DisbursementsTable onSelectDisbursement={vi.fn()} />, { wrapper });
      }).not.toThrow();

      expect(channelSpy).not.toHaveBeenCalledWith('cdc_disbursements');
      expect(channelSpy).toHaveBeenCalledTimes(0);
      expect(screen.getByTestId('search-disbursements-input')).toBeInTheDocument();
    });

    it('handles uppercase and whitespace formatted "  FALSE  " override correctly', () => {
      localStorage.setItem('erp_feature_override_realtime_sync', '  FALSE  ');
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      render(<WorkRequestList />, { wrapper });
      render(<InvoiceList />, { wrapper });
      render(<DisbursementsTable onSelectDisbursement={vi.fn()} />, { wrapper });

      expect(channelSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('Criterion: Feature Flag Disabled via Environment Variable', () => {
    it('cleanly bypasses all 3 domain mounts when VITE_ENABLE_REALTIME_SYNC is "false"', () => {
      vi.stubEnv('VITE_ENABLE_REALTIME_SYNC', 'false');
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      expect(() => {
        render(<WorkRequestList />, { wrapper });
        render(<InvoiceList />, { wrapper });
        render(<DisbursementsTable onSelectDisbursement={vi.fn()} />, { wrapper });
      }).not.toThrow();

      expect(channelSpy).not.toHaveBeenCalledWith('cdc_work_requests');
      expect(channelSpy).not.toHaveBeenCalledWith('cdc_tasks');
      expect(channelSpy).not.toHaveBeenCalledWith('cdc_invoices');
      expect(channelSpy).not.toHaveBeenCalledWith('cdc_disbursements');
      expect(channelSpy).toHaveBeenCalledTimes(0);
    });
  });

  describe('Criterion: Dynamic Toggling & Mount/Unmount Stability', () => {
    it('subscribes when flag is "true" and does not subscribe when flag is "false"', () => {
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      // Case A: Flag enabled
      localStorage.setItem('erp_feature_override_realtime_sync', 'true');
      const view1 = render(<WorkRequestList />, { wrapper });
      expect(channelSpy).toHaveBeenCalledWith('cdc_work_requests');
      expect(channelSpy).toHaveBeenCalledWith('cdc_tasks');
      expect(channelSpy).toHaveBeenCalledTimes(2);

      // Unmount cleanly
      view1.unmount();
      cleanup();
      clearChannelRegistryForTesting();
      channelSpy.mockClear();

      // Case B: Flag disabled
      localStorage.setItem('erp_feature_override_realtime_sync', 'false');
      const view2 = render(<WorkRequestList />, { wrapper });
      expect(channelSpy).toHaveBeenCalledTimes(0);
      view2.unmount();
      cleanup();
    });

    it('unmounting with feature flag disabled executes cleanly without invoking removeChannel', () => {
      localStorage.setItem('erp_feature_override_realtime_sync', 'false');
      const removeSpy = vi.spyOn(supabase, 'removeChannel');
      const { wrapper } = createHarness();

      const view1 = render(<WorkRequestList />, { wrapper });
      const view2 = render(<InvoiceList />, { wrapper });
      const view3 = render(<DisbursementsTable onSelectDisbursement={vi.fn()} />, { wrapper });

      expect(() => {
        view1.unmount();
        view2.unmount();
        view3.unmount();
      }).not.toThrow();

      expect(removeSpy).toHaveBeenCalledTimes(0);
    });

    it('useEntityRealtimeSync respects options.enabled === false regardless of feature flag', () => {
      localStorage.setItem('erp_feature_override_realtime_sync', 'true');
      const channelSpy = vi.spyOn(supabase, 'channel');
      const { wrapper } = createHarness();

      const { unmount } = renderHook(
        () => useEntityRealtimeSync({ table: 'work_requests', enabled: false }),
        { wrapper }
      );

      expect(channelSpy).toHaveBeenCalledTimes(0);
      expect(() => unmount()).not.toThrow();
    });
  });
});
