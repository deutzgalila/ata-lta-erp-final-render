import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ConflictResolutionModal,
  isConcurrencyConflictError,
} from '../ConflictResolutionModal';
import { ApiError } from '@/lib/api';

describe('ConflictResolutionModal (RFC 7807 OCC UI)', () => {
  describe('Helper: isConcurrencyConflictError', () => {
    it('identifies HTTP 409 status as concurrency conflict', () => {
      expect(isConcurrencyConflictError({ status: 409 })).toBe(true);
    });

    it('identifies CONCURRENCY_CONFLICT and ERR_CONCURRENCY_CONFLICT error codes', () => {
      expect(isConcurrencyConflictError({ code: 'CONCURRENCY_CONFLICT' })).toBe(true);
      expect(isConcurrencyConflictError({ code: 'ERR_CONCURRENCY_CONFLICT' })).toBe(true);
      expect(isConcurrencyConflictError(new ApiError(409, 'Conflict', 'Conflict message', 'CONCURRENCY_CONFLICT'))).toBe(true);
    });

    it('returns false for non-conflict errors or primitives', () => {
      expect(isConcurrencyConflictError(null)).toBe(false);
      expect(isConcurrencyConflictError(undefined)).toBe(false);
      expect(isConcurrencyConflictError('error')).toBe(false);
      expect(isConcurrencyConflictError({ status: 400, code: 'VALIDATION_ERROR' })).toBe(false);
      expect(isConcurrencyConflictError({ status: 500 })).toBe(false);
    });
  });

  describe('Modal Rendering & Warning Banner', () => {
    it('renders nothing when isOpen is false', () => {
      render(
        <ConflictResolutionModal
          isOpen={false}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByTestId('conflict-resolution-modal')).not.toBeInTheDocument();
    });

    it('renders modal with warning banner, title, and RFC 7807 error details when open', () => {
      const error = new ApiError(
        409,
        'Conflict',
        'The record was modified by another user. Please reload the latest version before editing.',
        'ERR_CONCURRENCY_CONFLICT'
      );

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          error={error}
          entityTitle="SEC Annual Report 2026"
          entityType="Work Request"
        />
      );

      expect(screen.getByTestId('conflict-resolution-modal')).toBeInTheDocument();
      expect(screen.getByText('Record Out of Sync')).toBeInTheDocument();
      expect(screen.getByTestId('conflict-warning-banner')).toBeInTheDocument();

      // Error code badge
      const badge = screen.getByTestId('error-code-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('ERR_CONCURRENCY_CONFLICT');

      // Error detail message
      const detailMsg = screen.getByTestId('conflict-detail-message');
      expect(detailMsg).toBeInTheDocument();
      expect(detailMsg).toHaveTextContent('The record was modified by another user. Please reload the latest version before editing.');
    });
  });

  describe('Side-by-Side Comparison Diff', () => {
    it('renders attempted local status vs current authoritative server status', () => {
      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          attemptedStatus="Completed"
          currentStatus="In Progress"
          expectedVersion={2}
          serverVersion={3}
        />
      );

      expect(screen.getByTestId('conflict-comparison-view')).toBeInTheDocument();
      expect(screen.getByText('Your Attempted Changes')).toBeInTheDocument();
      expect(screen.getByText('Authoritative Server Record')).toBeInTheDocument();

      const localValues = screen.getAllByTestId('conflict-local-value');
      const serverValues = screen.getAllByTestId('conflict-server-value');

      expect(localValues[0]).toHaveTextContent('Completed');
      expect(serverValues[0]).toHaveTextContent('In Progress');

      // Version row
      expect(localValues[1]).toHaveTextContent('Version 2');
      expect(serverValues[1]).toHaveTextContent('Version 3');
    });

    it('renders explicit comparisons list when provided', () => {
      const comparisons = [
        { label: 'Status', localValue: 'For Billing', serverValue: 'Completed' },
        { label: 'Priority', localValue: 'Urgent', serverValue: 'Normal' },
      ];

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          comparisons={comparisons}
        />
      );

      const localValues = screen.getAllByTestId('conflict-local-value');
      const serverValues = screen.getAllByTestId('conflict-server-value');

      expect(localValues[0]).toHaveTextContent('For Billing');
      expect(serverValues[0]).toHaveTextContent('Completed');
      expect(localValues[1]).toHaveTextContent('Urgent');
      expect(serverValues[1]).toHaveTextContent('Normal');
    });

    it('renders localValues and serverValues records correctly', () => {
      render(
        <ConflictResolutionModal
          open={true}
          onClose={vi.fn()}
          localValues={{ status: 'Received', assignee: 'Alice' }}
          serverValues={{ status: 'Processing', assignee: 'Bob' }}
        />
      );

      expect(screen.getByTestId('conflict-comparison-view')).toBeInTheDocument();
      const localValues = screen.getAllByTestId('conflict-local-value');
      const serverValues = screen.getAllByTestId('conflict-server-value');

      expect(localValues.length).toBe(2);
      expect(serverValues.length).toBe(2);
    });
  });

  describe('Resolution Actions', () => {
    it('invokes onRefreshAndKeepLatest callback and closes when clicked', async () => {
      const onRefreshMock = vi.fn().mockResolvedValue(undefined);
      const onCloseMock = vi.fn();

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onCloseMock}
          onRefreshAndKeepLatest={onRefreshMock}
        />
      );

      const refreshBtn = screen.getByTestId('conflict-refresh-btn');
      expect(refreshBtn).toHaveTextContent('Refresh & Keep Latest');

      fireEvent.click(refreshBtn);

      expect(onRefreshMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onCloseMock).toHaveBeenCalledTimes(1));
    });

    it('invokes onRefreshLatest fallback when onRefreshAndKeepLatest is omitted', async () => {
      const onRefreshLatestMock = vi.fn().mockResolvedValue(undefined);
      const onCloseMock = vi.fn();

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onCloseMock}
          onRefreshLatest={onRefreshLatestMock}
        />
      );

      const refreshBtn = screen.getByTestId('conflict-refresh-btn');
      fireEvent.click(refreshBtn);

      expect(onRefreshLatestMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(onCloseMock).toHaveBeenCalledTimes(1));
    });

    it('invokes onCancel and onClose callbacks when Cancel button is clicked', () => {
      const onCancelMock = vi.fn();
      const onCloseMock = vi.fn();

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onCloseMock}
          onCancel={onCancelMock}
        />
      );

      const cancelBtn = screen.getByTestId('conflict-cancel-btn');
      expect(cancelBtn).toHaveTextContent('Cancel');

      fireEvent.click(cancelBtn);

      expect(onCancelMock).toHaveBeenCalledTimes(1);
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it('disables buttons and displays loading indicator when isRefreshing or isLoading is true', () => {
      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          isRefreshing={true}
        />
      );

      const refreshBtn = screen.getByTestId('conflict-refresh-btn');
      const cancelBtn = screen.getByTestId('conflict-cancel-btn');

      expect(refreshBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
      expect(refreshBtn).toHaveTextContent('Refreshing...');
    });
  });

  describe('Adversarial Stress Testing (Challenger Stage 2_2)', () => {
    it('handles empty localValues and empty serverValues gracefully without throwing', () => {
      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          localValues={{}}
          serverValues={{}}
        />
      );
      expect(screen.getByTestId('conflict-resolution-modal')).toBeInTheDocument();
      expect(screen.getByTestId('conflict-comparison-view')).toBeInTheDocument();
      // No rows should be present, but headers and structure intact
      expect(screen.queryByTestId('conflict-local-value')).not.toBeInTheDocument();
    });

    it('handles asymmetric localValues and serverValues keys with fallback dashes', () => {
      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          localValues={{ localOnlyField: 'Local Val' }}
          serverValues={{ serverOnlyField: 'Server Val' }}
        />
      );
      const localValues = screen.getAllByTestId('conflict-local-value');
      const serverValues = screen.getAllByTestId('conflict-server-value');
      expect(localValues).toHaveLength(2);
      expect(serverValues).toHaveLength(2);

      expect(screen.getByText('Local Val')).toBeInTheDocument();
      expect(screen.getByText('Server Val')).toBeInTheDocument();
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    });

    it('handles undefined error and undefined errorMessage using safe system defaults', () => {
      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          error={undefined}
          errorMessage={undefined}
        />
      );
      expect(screen.getByTestId('error-code-badge')).toHaveTextContent('CONCURRENCY_CONFLICT');
      expect(screen.getByTestId('conflict-detail-message')).toHaveTextContent(
        'The record was modified by another user. Please reload the latest version before editing.'
      );
    });

    it('handles generic non-ApiError instances without detail field', () => {
      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          error={new Error('Generic network conflict')}
        />
      );
      expect(screen.getByTestId('error-code-badge')).toHaveTextContent('CONCURRENCY_CONFLICT');
      expect(screen.getByTestId('conflict-detail-message')).toHaveTextContent('Generic network conflict');
    });

    it('handles extreme text lengths (5,000+ chars) in title, error message, and diff values without crashing', () => {
      const longTitle = 'A'.repeat(500);
      const longDetail = 'ConflictDetail_'.repeat(300); // 4500 chars
      const longLocal = 'LocalDiffValue_'.repeat(200); // 3000 chars
      const longServer = 'ServerDiffValue_'.repeat(200); // 3200 chars

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={vi.fn()}
          title={longTitle}
          errorMessage={longDetail}
          localValues={{ longPayload: longLocal }}
          serverValues={{ longPayload: longServer }}
        />
      );

      expect(screen.getByTestId('conflict-resolution-modal')).toBeInTheDocument();
      expect(screen.getByText(longTitle)).toBeInTheDocument();
      expect(screen.getByTestId('conflict-detail-message')).toHaveTextContent(longDetail);
      expect(screen.getByTestId('conflict-local-value')).toHaveTextContent(longLocal);
      expect(screen.getByTestId('conflict-server-value')).toHaveTextContent(longServer);
    });

    it('survives rapid clicking of Refresh & Keep Latest and Cancel buttons', async () => {
      const onRefreshMock = vi.fn().mockResolvedValue(undefined);
      const onCloseMock = vi.fn();
      const onCancelMock = vi.fn();

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onCloseMock}
          onRefreshAndKeepLatest={onRefreshMock}
          onCancel={onCancelMock}
        />
      );

      const refreshBtn = screen.getByTestId('conflict-refresh-btn');
      const cancelBtn = screen.getByTestId('conflict-cancel-btn');

      // 20 rapid clicks on refresh button
      for (let i = 0; i < 20; i++) {
        fireEvent.click(refreshBtn);
      }

      // 20 rapid clicks on cancel button
      for (let i = 0; i < 20; i++) {
        fireEvent.click(cancelBtn);
      }

      expect(onRefreshMock).toHaveBeenCalled();
      expect(onCancelMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });

    it('survives rapid interleaved clicking of Refresh & Keep Latest and Cancel without unhandled state corruption', async () => {
      const onRefreshMock = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 10)));
      const onCloseMock = vi.fn();
      const onCancelMock = vi.fn();

      render(
        <ConflictResolutionModal
          isOpen={true}
          onClose={onCloseMock}
          onRefreshAndKeepLatest={onRefreshMock}
          onCancel={onCancelMock}
        />
      );

      const refreshBtn = screen.getByTestId('conflict-refresh-btn');
      const cancelBtn = screen.getByTestId('conflict-cancel-btn');

      // Interleaved rapid clicks
      for (let i = 0; i < 10; i++) {
        fireEvent.click(refreshBtn);
        fireEvent.click(cancelBtn);
      }

      await waitFor(() => {
        expect(onRefreshMock).toHaveBeenCalled();
        expect(onCancelMock).toHaveBeenCalled();
        expect(onCloseMock).toHaveBeenCalled();
      });
    });

    it('prevents click dispatch when isRefreshing is true', () => {
      const onRefreshMock = vi.fn();
      const onCancelMock = vi.fn();

      render(
        <ConflictResolutionModal
          isOpen={true}
          isRefreshing={true}
          onRefreshAndKeepLatest={onRefreshMock}
          onCancel={onCancelMock}
        />
      );

      const refreshBtn = screen.getByTestId('conflict-refresh-btn');
      const cancelBtn = screen.getByTestId('conflict-cancel-btn');

      expect(refreshBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();

      fireEvent.click(refreshBtn);
      fireEvent.click(cancelBtn);

      expect(onRefreshMock).not.toHaveBeenCalled();
      expect(onCancelMock).not.toHaveBeenCalled();
    });
  });
});

