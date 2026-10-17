import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentFilterBar } from '../components/DocumentFilterBar';
import { DocumentTable } from '../components/DocumentTable';
import { DocumentLifecycleModal } from '../components/DocumentLifecycleModal';
import type { DmsDocument } from '../api/types';

describe('Documents DMS UI Components', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  const mockDoc: DmsDocument = {
    id: 'doc-101',
    file_name: 'sec_gis_2026.pdf',
    original_name: 'SEC GIS 2026.pdf',
    work_request_id: null,
    linked_task_id: null,
    client_id: null,
    document_type: 'General Information Sheet',
    category: 'SEC',
    uploader_id: 'user-1',
    description: 'Annual corporate filing',
    entity_id: 'ATA',
    status: 'active',
    document_lifecycle: 'collected',
    archived: false,
    file_size: 1024 * 1024 * 2,
    content_type: 'application/pdf',
    storage_path: 'entities/ATA/general/documents/doc-101/sec_gis_2026.pdf',
    external_url: null,
    comments: [],
    versions: [],
    created_at: '2026-10-04T08:00:00.000Z',
    updated_at: '2026-10-04T08:00:00.000Z',
  };

  describe('DocumentFilterBar', () => {
    it('renders search input, category selector, and reset button', () => {
      const handleReset = vi.fn();
      const handleSearchChange = vi.fn();

      render(
        <DocumentFilterBar
          search="test"
          onSearchChange={handleSearchChange}
          category=""
          onCategoryChange={vi.fn()}
          lifecycle=""
          onLifecycleChange={vi.fn()}
          onReset={handleReset}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Search by name/i);
      expect(searchInput).toBeDefined();

      const resetButton = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetButton);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('DocumentTable', () => {
    it('renders document items with category badge and lifecycle pill', () => {
      const handleView = vi.fn();
      const handleDownload = vi.fn();

      render(
        <DocumentTable
          documents={[mockDoc]}
          isLoading={false}
          total={1}
          page={1}
          limit={50}
          onPageChange={vi.fn()}
          onView={handleView}
          onDownload={handleDownload}
          onTransition={vi.fn()}
          onArchive={vi.fn()}
          onUnarchive={vi.fn()}
          onDelete={vi.fn()}
          canHandover={true}
          canEdit={true}
          canDelete={true}
        />,
        { wrapper }
      );

      expect(screen.getByText('SEC GIS 2026.pdf')).toBeDefined();
      expect(screen.getByText('SEC Filings')).toBeDefined();
      expect(screen.getByText('Collected')).toBeDefined();
    });

    it('renders empty state when no documents are found', () => {
      render(
        <DocumentTable
          documents={[]}
          isLoading={false}
          total={0}
          page={1}
          limit={50}
          onPageChange={vi.fn()}
          onView={vi.fn()}
          onDownload={vi.fn()}
          onTransition={vi.fn()}
          onArchive={vi.fn()}
          onUnarchive={vi.fn()}
          onDelete={vi.fn()}
        />,
        { wrapper }
      );

      expect(screen.getByText(/no documents found/i)).toBeDefined();
    });
  });

  describe('DocumentLifecycleModal', () => {
    it('renders stages and enables advancing physical custody', async () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      render(
        <DocumentLifecycleModal
          isOpen={true}
          onClose={handleClose}
          document={mockDoc}
          onConfirm={handleConfirm}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Update Physical Lifecycle/i)).toBeDefined();
      expect(screen.getByText(/Current Stage:/i)).toBeDefined();

      const updateButton = screen.getByRole('button', { name: /Update Lifecycle/i });
      expect(updateButton).toBeDefined();
    });
  });
});
