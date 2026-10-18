import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateDisbursementModal } from '../components/CreateDisbursementModal';
import { useSessionStore } from '@/lib/session';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';

// Mock session store
vi.mock('@/lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/session')>();
  const { create } = await import('zustand');
  const isolatedStore = create((set) => ({
    user: null,
    permissions: new Set<string>(),
    activeEntity: 'ATA',
    unreadCount: 0,
    isAuthenticated: true,
    isLoading: false,

    setSession: ({ user, permissions, activeEntity, unreadCount }: any) => {
      const permSet = permissions instanceof Set ? permissions : new Set(permissions);
      set({
        user,
        permissions: permSet,
        activeEntity: activeEntity || 'ATA',
        unreadCount: unreadCount ?? 0,
        isAuthenticated: true,
        isLoading: false,
      });
    },
    setActiveEntity: (entity: any) => set({ activeEntity: entity }),
    setUnreadCount: (count: any) => set({ unreadCount: count }),
    clearSession: () => set({
      user: null,
      permissions: new Set<string>(),
      activeEntity: null,
      unreadCount: 0,
      isAuthenticated: false,
      isLoading: false,
    }),
    setLoading: (isLoading: any) => set({ isLoading }),
  }));

  return {
    ...actual,
    useSessionStore: isolatedStore,
  };
});

let activeQueryClients: QueryClient[] = [];

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  activeQueryClients.push(queryClient);

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

describe('CreateDisbursementModal Upload Retention on Retry (R7 / V8 & R5)', () => {
  const originalFetch = global.fetch;

  const setAdminSession = () => {
    (useSessionStore.getState() as any).setSession({
      user: {
        id: 'u-admin-1',
        email: 'admin@ata-lta.ph',
        name: 'Admin User',
        role: 'Admin',
        departments: ['Administration'],
        entities: ['ATA'],
      },
      permissions: [
        'disbursement:view',
        'disbursement:create',
        'disbursement:edit',
        'disbursement:approve',
        'disbursement:mark_released',
      ],
      activeEntity: 'ATA',
    });
  };

  beforeEach(() => {
    setAdminSession();
    useBlockingModalStore.getState().reset();
  });

  afterEach(() => {
    activeQueryClients.forEach((qc) => {
      qc.cancelQueries();
      qc.clear();
    });
    activeQueryClients = [];
    vi.restoreAllMocks();
    useBlockingModalStore.getState().reset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('retains completed upload reservation across submission attempts on retry after failed voucher creation', async () => {
    let uploadReservationCount = 0;
    let uploadBinaryCount = 0;
    let completeCount = 0;
    const createPayloads: Record<string, unknown>[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);

      if (u.includes('/disbursements/receipt-uploads/') && u.includes('/complete')) {
        completeCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              receiptS3Key: 'entities/ATA/disbursements/receipts/res-1.pdf',
              receiptFilename: 'receipt.pdf',
            },
          }),
        };
      }

      if (u.includes('/disbursements/receipt-uploads')) {
        uploadReservationCount++;
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              uploadId: 'res-upload-1',
              uploadUrl: 'https://storage.test/upload-binary',
              objectKey: 'entities/ATA/disbursements/receipts/res-1.pdf',
              expiresAt: '2026-10-18T18:00:00.000Z',
            },
          }),
        };
      }

      if (u.includes('upload-binary') && init?.method === 'PUT') {
        uploadBinaryCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => '',
        };
      }

      if (u.includes('/disbursements') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        createPayloads.push(body);

        // Fail first attempt with 409 Conflict (e.g. concurrent conflict or validation error)
        if (createPayloads.length === 1) {
          return {
            ok: false,
            status: 409,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              type: 'https://errors.ata-lta.com/conflict',
              title: 'Conflict',
              status: 409,
              detail: 'Disbursement draft generation collision. Please retry.',
              code: 'DISBURSEMENT_CONFLICT',
            }),
          };
        }

        // Second attempt succeeds
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              id: 'disb-success-101',
              status: 'Draft',
              ...body,
            },
          }),
        };
      }

      // Default GET mocks
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: [] }),
      };
    });

    const { wrapper } = createHarness();
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <CreateDisbursementModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        defaultWorkRequestId="11111111-1111-1111-1111-111111111111"
      />,
      { wrapper }
    );

    // Fill form
    fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '2500' } });
    fireEvent.change(screen.getByTestId('textarea-description'), {
      target: { value: 'Filing fees with receipt upload' },
    });

    // Attach receipt
    const dropzone = screen.getByTestId('receipt-dropzone');
    const testFile = new File(['dummy-receipt-bytes'], 'receipt.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [testFile] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-attached-filename')).toHaveTextContent('receipt.pdf');
    });

    // First submit -> upload succeeds, create fails
    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(createPayloads.length).toBe(1);
    });

    expect(uploadReservationCount).toBe(1);
    expect(uploadBinaryCount).toBe(1);
    expect(completeCount).toBe(1);
    expect(createPayloads[0]!.receiptS3Key).toBe('entities/ATA/disbursements/receipts/res-1.pdf');
    expect(createPayloads[0]!.receiptFilename).toBe('receipt.pdf');

    // Modal remains open with form intact
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('receipt-attached-filename')).toHaveTextContent('receipt.pdf');

    // Second submit (Retry!) -> must REUSE completed reservation without re-uploading
    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(createPayloads.length).toBe(2);
    });

    // CRITICAL R7 / V8 ASSERTION:
    // Upload reservation, binary PUT, and complete endpoints MUST NOT have been called again!
    expect(uploadReservationCount).toBe(1);
    expect(uploadBinaryCount).toBe(1);
    expect(completeCount).toBe(1);

    // Second payload reuses the same completed key and filename
    expect(createPayloads[1]!.receiptS3Key).toBe('entities/ATA/disbursements/receipts/res-1.pdf');
    expect(createPayloads[1]!.receiptFilename).toBe('receipt.pdf');

    // Upon successful create, modal closes and triggers onSuccess
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('resets retained upload state and re-uploads when user selects a different file', async () => {
    let uploadReservationCount = 0;
    let uploadBinaryCount = 0;
    let completeCount = 0;
    const createPayloads: Record<string, unknown>[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);

      if (u.includes('/disbursements/receipt-uploads/') && u.includes('/complete')) {
        completeCount++;
        const currentFile = completeCount === 1 ? 'fileA.pdf' : 'fileB.pdf';
        const currentKey = completeCount === 1 ? 'keys/fileA.pdf' : 'keys/fileB.pdf';
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              receiptS3Key: currentKey,
              receiptFilename: currentFile,
            },
          }),
        };
      }

      if (u.includes('/disbursements/receipt-uploads')) {
        uploadReservationCount++;
        const currentKey = uploadReservationCount === 1 ? 'keys/fileA.pdf' : 'keys/fileB.pdf';
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              uploadId: `res-upload-${uploadReservationCount}`,
              uploadUrl: `https://storage.test/upload-binary-${uploadReservationCount}`,
              objectKey: currentKey,
              expiresAt: '2026-10-18T18:00:00.000Z',
            },
          }),
        };
      }

      if (u.includes('upload-binary') && init?.method === 'PUT') {
        uploadBinaryCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => '',
        };
      }

      if (u.includes('/disbursements') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        createPayloads.push(body);

        if (createPayloads.length === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ title: 'Bad Request', detail: 'Invalid parameters' }),
          };
        }

        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: { id: 'disb-ok', status: 'Draft', ...body } }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: [] }),
      };
    });

    const { wrapper } = createHarness();
    render(
      <CreateDisbursementModal
        isOpen={true}
        onClose={vi.fn()}
        defaultWorkRequestId="11111111-1111-1111-1111-111111111111"
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '1800' } });
    fireEvent.change(screen.getByTestId('textarea-description'), { target: { value: 'Test description' } });

    // Drop File A
    const dropzone = screen.getByTestId('receipt-dropzone');
    const fileA = new File(['content-a'], 'fileA.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [fileA] } });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-attached-filename')).toHaveTextContent('fileA.pdf');
    });

    // Submit File A -> fails
    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(createPayloads.length).toBe(1);
    });
    expect(uploadReservationCount).toBe(1);
    expect(createPayloads[0]!.receiptFilename).toBe('fileA.pdf');

    // User chooses a DIFFERENT file (File B)
    const fileB = new File(['content-b'], 'fileB.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [fileB] } });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-attached-filename')).toHaveTextContent('fileB.pdf');
    });

    // Submit File B -> must trigger a NEW upload for File B!
    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(createPayloads.length).toBe(2);
    });

    // R7 Requirement: selecting different file must re-upload
    expect(uploadReservationCount).toBe(2);
    expect(uploadBinaryCount).toBe(2);
    expect(completeCount).toBe(2);
    expect(createPayloads[1]!.receiptS3Key).toBe('keys/fileB.pdf');
    expect(createPayloads[1]!.receiptFilename).toBe('fileB.pdf');
  });

  it('resets retained upload state when user clicks remove receipt button', async () => {
    let uploadReservationCount = 0;
    const createPayloads: Record<string, unknown>[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);

      if (u.includes('/disbursements/receipt-uploads/') && u.includes('/complete')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              receiptS3Key: 'keys/fileA.pdf',
              receiptFilename: 'fileA.pdf',
            },
          }),
        };
      }

      if (u.includes('/disbursements/receipt-uploads')) {
        uploadReservationCount++;
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: {
              uploadId: 'res-upload-1',
              uploadUrl: 'https://storage.test/upload-binary-1',
              objectKey: 'keys/fileA.pdf',
              expiresAt: '2026-10-18T18:00:00.000Z',
            },
          }),
        };
      }

      if (u.includes('upload-binary') && init?.method === 'PUT') {
        return { ok: true, status: 200, headers: new Headers(), text: async () => '' };
      }

      if (u.includes('/disbursements') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        createPayloads.push(body);

        if (createPayloads.length === 1) {
          return {
            ok: false,
            status: 400,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ title: 'Bad Request' }),
          };
        }

        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ data: { id: 'disb-ok', status: 'Draft', ...body } }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: [] }),
      };
    });

    const { wrapper } = createHarness();
    render(
      <CreateDisbursementModal
        isOpen={true}
        onClose={vi.fn()}
        defaultWorkRequestId="11111111-1111-1111-1111-111111111111"
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '990' } });
    fireEvent.change(screen.getByTestId('textarea-description'), { target: { value: 'Courier receipt' } });

    // Drop file & submit -> fails
    const dropzone = screen.getByTestId('receipt-dropzone');
    const fileA = new File(['content-a'], 'fileA.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [fileA] } });

    await waitFor(() => {
      expect(screen.getByTestId('receipt-attached-filename')).toHaveTextContent('fileA.pdf');
    });

    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(createPayloads.length).toBe(1);
    });

    // User removes receipt
    fireEvent.click(screen.getByTestId('remove-receipt-btn'));

    await waitFor(() => {
      expect(screen.queryByTestId('receipt-attached-filename')).not.toBeInTheDocument();
    });

    // User submits again without receipt -> triggers in-app confirmation
    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('no-receipt-confirm-dialog')).toBeInTheDocument();
    });

    // Confirm creation without receipt
    fireEvent.click(screen.getByTestId('btn-confirm-no-receipt'));

    await waitFor(() => {
      expect(createPayloads.length).toBe(2);
    });

    // Dispatched second payload must have null for both receipt fields
    expect(createPayloads[1]!.receiptS3Key).toBeNull();
    expect(createPayloads[1]!.receiptFilename).toBeNull();
    // No additional upload reservation was created
    expect(uploadReservationCount).toBe(1);
  });

  it('never permits submitting receiptFilename without a verified receiptS3Key (R5 / F9 rejection of filename-only create fallback)', async () => {
    let dispatchedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/disbursements') && init?.method === 'POST') {
        dispatchedBody = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 201,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            data: { id: 'disb-no-receipt', status: 'Draft', ...dispatchedBody },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: [] }),
      };
    });

    const { wrapper } = createHarness();
    render(
      <CreateDisbursementModal
        isOpen={true}
        onClose={vi.fn()}
        defaultWorkRequestId="11111111-1111-1111-1111-111111111111"
      />,
      { wrapper }
    );

    fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '500' } });
    fireEvent.change(screen.getByTestId('textarea-description'), { target: { value: 'No receipt voucher' } });

    // Submit with no file attached
    fireEvent.click(screen.getByTestId('submit-create-disbursement-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('no-receipt-confirm-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-confirm-no-receipt'));

    await waitFor(() => {
      expect(dispatchedBody).not.toBeNull();
    });

    // Invariant: receiptFilename must be null when receiptS3Key is null
    expect(dispatchedBody!.receiptS3Key).toBeNull();
    expect(dispatchedBody!.receiptFilename).toBeNull();
  });
});
