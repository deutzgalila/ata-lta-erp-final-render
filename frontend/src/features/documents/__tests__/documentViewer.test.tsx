import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import type { DmsDocument } from '../api/types';
import { useSessionStore } from '@/lib/session';

// Mock TanStack hooks from useDocuments
const mockMutateAsyncUpdate = vi.fn();
const mockMutateAsyncUpload = vi.fn();
let mockDownloadData: { url: string; fileName: string; contentType?: string } | undefined = {
  url: 'https://storage.test/docs/doc-101.pdf',
  fileName: 'test-document.pdf',
};

vi.mock('../api/useDocuments', () => ({
  useDocumentDownloadUrl: () => ({
    data: mockDownloadData,
    isLoading: false,
  }),
  useUpdateDocument: () => ({
    mutateAsync: mockMutateAsyncUpdate,
    isPending: false,
  }),
  useUploadDocument: () => ({
    mutateAsync: mockMutateAsyncUpload,
    isPending: false,
  }),
}));

describe('DocumentViewerModal (UAT2-14)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.restoreAllMocks();
    mockMutateAsyncUpdate.mockReset();
    mockMutateAsyncUpload.mockReset();
    mockDownloadData = {
      url: 'https://storage.test/docs/doc-101.pdf',
      fileName: 'test-document.pdf',
    };

    useSessionStore.setState({
      user: {
        id: 'usr-100',
        name: 'Jane Doe',
        email: 'jane@ata-lta.com',
        role: 'manager',
        departments: ['DMS', 'Operations'],
        entities: ['ATA'],
      },
      permissions: new Set(['dms:view', 'dms:edit']),
      activeEntity: 'ATA',
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const baseDoc: DmsDocument = {
    id: 'doc-101',
    file_name: 'compliance_report_2026.pdf',
    original_name: 'Compliance Report 2026.pdf',
    work_request_id: 'wr-1',
    linked_task_id: null,
    client_id: 'cli-1',
    document_type: 'Annual Compliance Report',
    category: 'SEC',
    uploader_id: 'usr-100',
    description: 'Corporate filings and custody',
    entity_id: 'ATA',
    status: 'active',
    document_lifecycle: 'collected',
    archived: false,
    file_size: 1024 * 500, // 500 KB
    content_type: 'application/pdf',
    storage_path: 'entities/ATA/documents/doc-101.pdf',
    external_url: null,
    comments: [
      {
        id: 'comm-1',
        userId: 'usr-100',
        userName: 'Jane Doe',
        date: '2026-10-01T10:00:00.000Z',
        text: 'Initial review complete.',
      },
    ],
    versions: [],
    created_at: '2026-10-01T09:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
  };

  it('renders enlarged windowed modal with correct header, category badge, and styling', () => {
    const handleClose = vi.fn();

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={handleClose}
        document={baseDoc}
      />,
      { wrapper }
    );

    // Modal dialog content rendered
    const modalContent = screen.getByTestId('document-viewer-modal');
    expect(modalContent).toBeDefined();

    // Verify windowed enlarged layout classes
    expect(modalContent.className).toContain('max-w-6xl');
    expect(modalContent.className).toContain('w-[95vw]');
    expect(modalContent.className).toContain('h-[88vh]');

    // Title and category badge
    expect(screen.getByText('Compliance Report 2026.pdf')).toBeDefined();
    expect(screen.getByText('SEC')).toBeDefined();

    // Toggle button present
    const toggleBtn = screen.getByTestId('toggle-fullpage-preview');
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.textContent).toContain('Full Page');
  });

  it('toggles full-page view mode (full-viewport overlay) when toggle button is clicked', () => {
    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
      />,
      { wrapper }
    );

    const toggleBtn = screen.getByTestId('toggle-fullpage-preview');
    const modalContent = screen.getByTestId('document-viewer-modal');

    // Initially windowed
    expect(modalContent.className).toContain('max-w-6xl');
    expect(modalContent.className).not.toContain('w-screen');

    // Click to enter full page
    fireEvent.click(toggleBtn);

    // Now full-viewport overlay mode
    expect(toggleBtn.textContent).toContain('Exit Full Page');
    expect(modalContent.className).toContain('w-screen');
    expect(modalContent.className).toContain('h-screen');
    expect(modalContent.className).toContain('max-w-none');
    expect(modalContent.className).toContain('fixed');
    expect(modalContent.className).toContain('inset-0');

    // Click again to exit full page
    fireEvent.click(toggleBtn);
    expect(toggleBtn.textContent).toContain('Full Page');
    expect(modalContent.className).toContain('max-w-6xl');
    expect(modalContent.className).not.toContain('w-screen');
  });

  it('exits full-page overlay mode when Escape key is pressed', () => {
    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
      />,
      { wrapper }
    );

    const toggleBtn = screen.getByTestId('toggle-fullpage-preview');
    const modalContent = screen.getByTestId('document-viewer-modal');

    // Enter full page
    fireEvent.click(toggleBtn);
    expect(modalContent.className).toContain('w-screen');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    // Restores windowed mode
    expect(modalContent.className).toContain('max-w-6xl');
    expect(modalContent.className).not.toContain('w-screen');
  });

  it('renders inline iframe for PDF preview', () => {
    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
      />,
      { wrapper }
    );

    const pdfIframe = screen.getByTestId('doc-preview-pdf') as HTMLIFrameElement;
    expect(pdfIframe).toBeDefined();
    expect(pdfIframe.src).toBe('https://storage.test/docs/doc-101.pdf');
  });

  it('renders inline image preview for image documents', () => {
    const imageDoc: DmsDocument = {
      ...baseDoc,
      file_name: 'site_photo.png',
      original_name: 'Site Photo.png',
      content_type: 'image/png',
    };
    mockDownloadData = {
      url: 'https://storage.test/docs/site_photo.png',
      fileName: 'site_photo.png',
    };

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={imageDoc}
      />,
      { wrapper }
    );

    const img = screen.getByTestId('doc-preview-image') as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toBe('https://storage.test/docs/site_photo.png');
    expect(img.alt).toBe('Site Photo.png');
  });

  it('renders inline text viewer for text documents', () => {
    const textDoc: DmsDocument = {
      ...baseDoc,
      file_name: 'notes.txt',
      original_name: 'Notes.txt',
      content_type: 'text/plain',
    };
    mockDownloadData = {
      url: 'https://storage.test/docs/notes.txt',
      fileName: 'notes.txt',
    };

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={textDoc}
      />,
      { wrapper }
    );

    const textIframe = screen.getByTestId('doc-preview-text') as HTMLIFrameElement;
    expect(textIframe).toBeDefined();
    expect(textIframe.src).toBe('https://storage.test/docs/notes.txt');
  });

  it('renders download card for Word documents (.docx)', () => {
    const wordDoc: DmsDocument = {
      ...baseDoc,
      file_name: 'contract.docx',
      original_name: 'Contract.docx',
      content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={wordDoc}
      />,
      { wrapper }
    );

    expect(screen.getByText(/Word Document \(\.docx\) preview is ready for download/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Download to View/i })).toBeDefined();
  });

  it('renders download card for unsupported/generic binary files', () => {
    const zipDoc: DmsDocument = {
      ...baseDoc,
      file_name: 'archive.zip',
      original_name: 'Archive.zip',
      content_type: 'application/zip',
    };

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={zipDoc}
      />,
      { wrapper }
    );

    expect(screen.getByText(/This file type does not support inline preview/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Download File/i })).toBeDefined();
  });

  it('renders download button in header when downloadUrl is available', () => {
    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
      />,
      { wrapper }
    );

    const downloadBtn = screen.getByTestId('download-doc-btn');
    expect(downloadBtn).toBeDefined();
    const anchor = downloadBtn.closest('a');
    expect(anchor).toBeDefined();
    expect(anchor?.href).toBe('https://storage.test/docs/doc-101.pdf');
  });

  it('handles comments: displays existing and posts new comment', async () => {
    mockMutateAsyncUpdate.mockResolvedValueOnce({
      ...baseDoc,
      comments: [
        ...baseDoc.comments,
        {
          id: 'comm-2',
          userId: 'usr-100',
          userName: 'Jane Doe',
          date: '2026-10-05T12:00:00.000Z',
          text: 'Verified BIR stamped copy.',
        },
      ],
    });

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
      />,
      { wrapper }
    );

    // Initial comment visible
    expect(screen.getByText('Initial review complete.')).toBeDefined();
    expect(screen.getByTestId('comment-item-comm-1')).toBeDefined();

    // Type new comment
    const textarea = screen.getByTestId('new-comment-textarea');
    fireEvent.change(textarea, { target: { value: 'Verified BIR stamped copy.' } });

    // Submit new comment
    const postBtn = screen.getByTestId('post-comment-btn');
    fireEvent.click(postBtn);

    await waitFor(() => {
      expect(mockMutateAsyncUpdate).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockMutateAsyncUpdate.mock.calls[0]![0];
    expect(callArgs.id).toBe('doc-101');
    expect(callArgs.data.comments).toHaveLength(2);
    expect(callArgs.data.comments![1]!.text).toBe('Verified BIR stamped copy.');
  });

  it('enforces 50 MB file size limit and displays error banner when exceeded', async () => {
    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
      />,
      { wrapper }
    );

    const fileInput = screen.getByTestId('viewer-file-input');

    // 52 MB file (exceeds 50 MB limit)
    const largeFile = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 52 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    // Surfaces 50 MB error banner
    await waitFor(() => {
      expect(screen.getByText(/File size exceeds maximum allowed limit of 50 MB/i)).toBeDefined();
    });

    // Upload mutation NOT called
    expect(mockMutateAsyncUpload).not.toHaveBeenCalled();
  });

  it('triggers document upload when valid file (<50 MB) is selected', async () => {
    const uploadedResult = {
      ...baseDoc,
      file_name: 'updated.pdf',
      original_name: 'updated.pdf',
    };
    mockMutateAsyncUpload.mockResolvedValueOnce(uploadedResult);
    const onUploadSuccess = vi.fn();

    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
        onUploadSuccess={onUploadSuccess}
      />,
      { wrapper }
    );

    const fileInput = screen.getByTestId('viewer-file-input');
    const validFile = new File(['content'], 'updated.pdf', { type: 'application/pdf' });
    Object.defineProperty(validFile, 'size', { value: 1024 * 1024 * 5 }); // 5 MB

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(mockMutateAsyncUpload).toHaveBeenCalledTimes(1);
    });

    expect(onUploadSuccess).toHaveBeenCalledWith(uploadedResult);
  });

  it('respects readOnly mode by hiding upload button and comment form', () => {
    render(
      <DocumentViewerModal
        isOpen={true}
        onClose={vi.fn()}
        document={baseDoc}
        readOnly={true}
      />,
      { wrapper }
    );

    // Replace / Upload button hidden
    expect(screen.queryByTestId('upload-doc-btn')).toBeNull();

    // Comment form hidden
    expect(screen.queryByTestId('new-comment-textarea')).toBeNull();
    expect(screen.queryByTestId('post-comment-btn')).toBeNull();
  });
});
