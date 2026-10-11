import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentUploadModal } from '../components/DocumentUploadModal';

const mockMutateAsyncUpload = vi.fn();

vi.mock('../api/useDocuments', () => ({
  useUploadDocument: () => ({
    mutateAsync: mockMutateAsyncUpload,
    isPending: false,
  }),
}));

describe('DocumentUploadModal - External URL & Task Linking', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.restoreAllMocks();
    mockMutateAsyncUpload.mockReset();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it('renders Google Drive sharing hint in External Link mode', () => {
    render(
      <DocumentUploadModal
        isOpen={true}
        onClose={vi.fn()}
      />,
      { wrapper }
    );

    // Switch to External Link mode
    const externalTab = screen.getByTestId('mode-tab-external');
    fireEvent.click(externalTab);

    // Verify Google Drive hint text is displayed
    const hint = screen.getByTestId('external-url-gdrive-hint');
    expect(hint).toBeDefined();
    expect(hint.textContent).toContain('Anyone with the link can view');
  });

  it('passes defaultTaskId as linkedTaskId in external URL mode with accurate MIME detection', async () => {
    mockMutateAsyncUpload.mockResolvedValueOnce({
      id: 'doc-new',
      linked_task_id: 'task-777',
      external_url: 'https://docs.google.com/spreadsheets/d/1testSheetId/edit',
    });

    const onSuccess = vi.fn();

    render(
      <DocumentUploadModal
        isOpen={true}
        onClose={vi.fn()}
        defaultTaskId="task-777"
        defaultWorkRequestId="wr-999"
        onSuccess={onSuccess}
      />,
      { wrapper }
    );

    // Switch to External mode
    fireEvent.click(screen.getByTestId('mode-tab-external'));

    // Fill external URL
    const urlInput = screen.getByTestId('external-url-input');
    fireEvent.change(urlInput, {
      target: { value: 'https://docs.google.com/spreadsheets/d/1testSheetId/edit' },
    });

    // Fill Display Name
    const nameInput = screen.getByTestId('document-name-input');
    fireEvent.change(nameInput, {
      target: { value: 'Financial Projection.xlsx' },
    });

    // Submit
    const submitBtn = screen.getByTestId('upload-submit-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutateAsyncUpload).toHaveBeenCalledTimes(1);
    });

    const payload = mockMutateAsyncUpload.mock.calls[0]![0];
    expect(payload.metadata.linkedTaskId).toBe('task-777');
    expect(payload.metadata.workRequestId).toBe('wr-999');
    expect(payload.metadata.externalUrl).toBe('https://docs.google.com/spreadsheets/d/1testSheetId/edit');
    expect(payload.metadata.contentType).toBe('application/vnd.google-apps.spreadsheet');
    expect(payload.file.type).toBe('application/vnd.google-apps.spreadsheet');
  });

  it('detects PDF MIME type for Google Drive file link with PDF extension', async () => {
    mockMutateAsyncUpload.mockResolvedValueOnce({
      id: 'doc-pdf',
      linked_task_id: 'task-123',
    });

    render(
      <DocumentUploadModal
        isOpen={true}
        onClose={vi.fn()}
        defaultTaskId="task-123"
      />,
      { wrapper }
    );

    fireEvent.click(screen.getByTestId('mode-tab-external'));

    fireEvent.change(screen.getByTestId('external-url-input'), {
      target: { value: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view' },
    });
    fireEvent.change(screen.getByTestId('document-name-input'), {
      target: { value: 'Contract Agreement.pdf' },
    });

    fireEvent.click(screen.getByTestId('upload-submit-button'));

    await waitFor(() => {
      expect(mockMutateAsyncUpload).toHaveBeenCalledTimes(1);
    });

    const payload = mockMutateAsyncUpload.mock.calls[0]![0];
    expect(payload.metadata.linkedTaskId).toBe('task-123');
    expect(payload.metadata.contentType).toBe('application/pdf');
    expect(payload.file.type).toBe('application/pdf');
  });

  it('resets linkedTaskId when reopened without defaultTaskId prop', async () => {
    mockMutateAsyncUpload.mockResolvedValue({
      id: 'doc-standalone',
      linked_task_id: null,
    });

    const { rerender } = render(
      <DocumentUploadModal
        isOpen={true}
        onClose={vi.fn()}
        defaultTaskId="task-prior"
      />,
      { wrapper }
    );

    // Reopen modal without defaultTaskId
    rerender(
      <DocumentUploadModal
        isOpen={true}
        onClose={vi.fn()}
        defaultTaskId={undefined}
      />
    );

    fireEvent.click(screen.getByTestId('mode-tab-external'));
    fireEvent.change(screen.getByTestId('external-url-input'), {
      target: { value: 'https://sec.gov.ph/files/doc.pdf' },
    });
    fireEvent.change(screen.getByTestId('document-name-input'), {
      target: { value: 'Independent Report.pdf' },
    });

    fireEvent.click(screen.getByTestId('upload-submit-button'));

    await waitFor(() => {
      expect(mockMutateAsyncUpload).toHaveBeenCalledTimes(1);
    });

    const payload = mockMutateAsyncUpload.mock.calls[0]![0];
    expect(payload.metadata.linkedTaskId).toBeUndefined();
  });
});

