import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  BlockingActionModal,
  useBlockingModalStore,
  runBlockingAction,
  extractRfc7807Error,
} from '../components/BlockingActionModal';
import { ApiError, queryClient } from '@/lib/api';

describe('BlockingActionModal & Headless Mutation Flow', () => {
  beforeEach(() => {
    useBlockingModalStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering & States', () => {
    it('renders nothing when isOpen is false', () => {
      render(React.createElement(BlockingActionModal));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders loading state with spinner, title, message, and progress', () => {
      useBlockingModalStore.getState().openLoading({
        title: 'Archiving Work Request',
        message: 'Please wait while changes are being persisted to the server...',
      });
      useBlockingModalStore.getState().setProgress({
        current: 2,
        total: 5,
        label: 'Processing Tasks',
      });

      render(React.createElement(BlockingActionModal));

      expect(screen.getByText('Archiving Work Request')).toBeInTheDocument();
      expect(
        screen.getByText('Please wait while changes are being persisted to the server...')
      ).toBeInTheDocument();
      expect(screen.getByText('Processing Tasks')).toBeInTheDocument();
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
    });

    it('is non-dismissible during loading state (Escape key is prevented)', () => {
      useBlockingModalStore.getState().openLoading({
        title: 'Advancing Phase',
        message: 'Validating phase gates...',
      });

      render(React.createElement(BlockingActionModal));

      // Attempt escape key press
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });

      // Modal remains open and in loading state
      expect(useBlockingModalStore.getState().isOpen).toBe(true);
      expect(useBlockingModalStore.getState().status).toBe('loading');
    });

    it('renders success state with OK button that closes the modal', () => {
      useBlockingModalStore.getState().openLoading({
        title: 'Creating Work Request',
        message: 'Saving graph...',
        successTitle: 'Work Request Created',
        successMessage: 'Work request has been created successfully.',
      });

      useBlockingModalStore.getState().setSuccess();

      render(React.createElement(BlockingActionModal));

      expect(screen.getByText('Work Request Created')).toBeInTheDocument();
      expect(screen.getByText('Work request has been created successfully.')).toBeInTheDocument();

      const okBtn = screen.getByRole('button', { name: /ok/i });
      fireEvent.click(okBtn);

      expect(useBlockingModalStore.getState().isOpen).toBe(false);
      expect(useBlockingModalStore.getState().status).toBe('idle');
    });

    it('surfaces verbatim RFC 7807 error.code in header badge and error.detail in body', () => {
      useBlockingModalStore.getState().openLoading({
        title: 'Advancing Phase',
        message: 'Advancing...',
      });

      useBlockingModalStore.getState().setError({
        status: 409,
        title: 'Conflict',
        code: 'PHASE_PREREQUISITE',
        detail: 'Cannot create active processing task: 2 active pre-processing task(s) are incomplete',
      });

      render(React.createElement(BlockingActionModal));

      // Verifies verbatim error.code in badge
      const badge = screen.getByTestId('error-code-badge');
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe('PHASE_PREREQUISITE');

      // Verifies verbatim error.detail in body
      const detailBody = screen.getByTestId('error-detail-body');
      expect(detailBody).toBeInTheDocument();
      expect(detailBody.textContent).toBe(
        'Cannot create active processing task: 2 active pre-processing task(s) are incomplete'
      );
    });

    it('handles Dismiss action in error state', () => {
      const dismissSpy = vi.fn();

      useBlockingModalStore.getState().openLoading({
        title: 'QA Review',
        message: 'Submitting...',
        onDismiss: dismissSpy,
      });

      useBlockingModalStore.getState().setError({
        status: 400,
        code: 'VALIDATION_ERROR',
        detail: 'Reroute reason is required',
      });

      render(React.createElement(BlockingActionModal));

      const dismissBtn = screen.getByTestId('error-dismiss-btn');
      fireEvent.click(dismissBtn);

      expect(dismissSpy).toHaveBeenCalledTimes(1);
      expect(useBlockingModalStore.getState().isOpen).toBe(false);
    });

    it('handles Retry action in error state', async () => {
      const retrySpy = vi.fn().mockResolvedValue(undefined);

      useBlockingModalStore.getState().openLoading({
        title: 'Generating Retainer',
        message: 'Generating...',
        onRetry: retrySpy,
      });

      useBlockingModalStore.getState().setError({
        status: 504,
        code: 'WATCHDOG_TIMEOUT',
        detail: 'Operation timed out',
      });

      render(React.createElement(BlockingActionModal));

      const retryBtn = screen.getByTestId('error-retry-btn');
      fireEvent.click(retryBtn);

      expect(retrySpy).toHaveBeenCalledTimes(1);
      expect(useBlockingModalStore.getState().isOpen).toBe(false);
    });
  });

  describe('extractRfc7807Error Helper', () => {
    it('extracts status, code, and detail from ApiError', () => {
      const err = new ApiError(
        409,
        'Conflict',
        'Gate prerequisite failed: tasks incomplete',
        'GATE_PREREQUISITE_FAILED'
      );

      const extracted = extractRfc7807Error(err);
      expect(extracted.status).toBe(409);
      expect(extracted.code).toBe('GATE_PREREQUISITE_FAILED');
      expect(extracted.detail).toBe('Gate prerequisite failed: tasks incomplete');
      expect(extracted.title).toBe('Conflict');
    });

    it('handles standard Error instances', () => {
      const err = new Error('Network connection drop');
      const extracted = extractRfc7807Error(err);
      expect(extracted.detail).toBe('Network connection drop');
      expect(extracted.title).toBe('Unexpected Error');
    });
  });

  describe('runBlockingAction Headless Runner', () => {
    it('executes apiCall, invalidates query keys on success, and closes modal', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
      const mockResult = { id: 'wr-123', status: 'Archived' };

      const promise = runBlockingAction({
        title: 'Archiving WR',
        message: 'Archiving in database...',
        apiCall: async () => mockResult,
        invalidateQueries: [['operations', 'workRequests']],
      });

      // While in-flight, modal is in loading state
      expect(useBlockingModalStore.getState().status).toBe('loading');
      expect(useBlockingModalStore.getState().title).toBe('Archiving WR');

      const result = await promise;
      expect(result).toEqual(mockResult);

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['operations', 'workRequests'],
      });
      expect(useBlockingModalStore.getState().isOpen).toBe(false);
    });

    it('catches ApiError, surfaces verbatim error in store, and throws error', async () => {
      const apiError = new ApiError(
        409,
        'Conflict',
        'Cannot transition to completion directly',
        'INVALID_PHASE_TRANSITION'
      );

      await expect(
        runBlockingAction({
          title: 'Direct Advance',
          message: 'Advancing...',
          apiCall: async () => {
            throw apiError;
          },
        })
      ).rejects.toThrow();

      const state = useBlockingModalStore.getState();
      expect(state.status).toBe('error');
      expect(state.error?.code).toBe('INVALID_PHASE_TRANSITION');
      expect(state.error?.detail).toBe('Cannot transition to completion directly');
      expect(state.error?.status).toBe(409);
    });

    it('prevents concurrent actions via mutex lock', async () => {
      // Simulate an active blocking action
      useBlockingModalStore.getState().openLoading({
        title: 'First Action',
        message: 'In progress...',
      });

      await expect(
        runBlockingAction({
          title: 'Second Action',
          message: 'Attempting parallel call...',
          apiCall: async () => 'data',
        })
      ).rejects.toThrow('Another operation is already in progress. Please wait.');
    });

    it('triggers 30-second watchdog timeout if apiCall hangs', async () => {
      vi.useFakeTimers();

      try {
        const hangingAction = runBlockingAction({
          title: 'Long Running Action',
          message: 'Waiting...',
          timeoutMs: 30000,
          apiCall: () => new Promise(() => {}), // never resolves
        });

        // Advance timers by 30 seconds
        vi.advanceTimersByTime(30000);

        await expect(hangingAction).rejects.toSatisfy((err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(504);
          expect(apiErr.code).toBe('WATCHDOG_TIMEOUT');
          expect(apiErr.detail).toContain('The operation timed out after 30 seconds');
          return true;
        });

        const state = useBlockingModalStore.getState();
        expect(state.status).toBe('error');
        expect(state.error?.code).toBe('WATCHDOG_TIMEOUT');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
