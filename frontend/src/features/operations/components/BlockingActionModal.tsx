/* eslint-disable react-refresh/only-export-components */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { ApiError, queryClient } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// 1. State Types & Store
// ============================================================================

export type BlockingModalStatus = 'idle' | 'loading' | 'success' | 'error';

export interface BlockingErrorDetails {
  code?: string; // Verbatim RFC 7807 problem code (e.g. 'PHASE_PREREQUISITE')
  detail: string; // Verbatim RFC 7807 problem detail
  status?: number; // HTTP status code (e.g. 409, 400, 403, 504)
  title?: string; // RFC 7807 title (e.g. 'Conflict', 'Bad Request')
  raw?: unknown; // Original error object
}

export interface BlockingProgressDetails {
  current: number;
  total: number;
  label?: string;
}

export interface BlockingModalState {
  isOpen: boolean;
  status: BlockingModalStatus;
  title: string;
  message: string;
  actionName?: string;

  // Success presentation
  successTitle?: string;
  successMessage?: string | ((data: unknown) => string);

  // RFC 7807 Error details
  error: BlockingErrorDetails | null;

  // Batch progress
  progress: BlockingProgressDetails | null;

  // Watchdog timeout config
  timeoutMs: number;

  // Recovery handlers
  onRetry: (() => Promise<void> | void) | null;
  onDismiss: (() => void) | null;

  // Mutex lock
  isLocked: boolean;

  // Actions
  openLoading: (params: {
    title: string;
    message: string;
    actionName?: string;
    timeoutMs?: number;
    successTitle?: string;
    successMessage?: string | ((data: unknown) => string);
    onRetry?: (() => Promise<void> | void) | null;
    onDismiss?: (() => void) | null;
  }) => boolean;
  setProgress: (progress: BlockingProgressDetails | null) => void;
  setSuccess: (data?: unknown) => void;
  setError: (error: BlockingErrorDetails) => void;
  close: () => void;
  reset: () => void;
}

export const useBlockingModalStore = create<BlockingModalState>((set, get) => ({
  isOpen: false,
  status: 'idle',
  title: '',
  message: '',
  actionName: undefined,
  successTitle: undefined,
  successMessage: undefined,
  error: null,
  progress: null,
  timeoutMs: 30000,
  onRetry: null,
  onDismiss: null,
  isLocked: false,

  openLoading: (params) => {
    if (get().isLocked) {
      return false;
    }
    set({
      isOpen: true,
      status: 'loading',
      title: params.title,
      message: params.message,
      actionName: params.actionName,
      timeoutMs: params.timeoutMs ?? 30000,
      successTitle: params.successTitle,
      successMessage: params.successMessage,
      error: null,
      progress: null,
      onRetry: params.onRetry ?? null,
      onDismiss: params.onDismiss ?? null,
      isLocked: true,
    });
    return true;
  },

  setProgress: (progress) => {
    set({ progress });
  },

  setSuccess: (data) => {
    const { successMessage } = get();
    const resolvedMessage =
      typeof successMessage === 'function' ? successMessage(data) : successMessage;

    set({
      status: 'success',
      message: resolvedMessage || 'Operation completed successfully.',
      isLocked: false,
    });
  },

  setError: (error) => {
    set({
      status: 'error',
      error,
      isLocked: false,
    });
  },

  close: () => {
    set({
      isOpen: false,
      status: 'idle',
      error: null,
      progress: null,
      isLocked: false,
      onRetry: null,
      onDismiss: null,
    });
  },

  reset: () => {
    set({
      isOpen: false,
      status: 'idle',
      title: '',
      message: '',
      actionName: undefined,
      successTitle: undefined,
      successMessage: undefined,
      error: null,
      progress: null,
      timeoutMs: 30000,
      onRetry: null,
      onDismiss: null,
      isLocked: false,
    });
  },
}));

// ============================================================================
// 2. RFC 7807 Error Extractor
// ============================================================================

export function extractRfc7807Error(err: unknown): BlockingErrorDetails {
  if (err instanceof ApiError) {
    let title = 'Action Failed';
    if (err.status === 409) title = 'Conflict';
    else if (err.status === 400) title = 'Bad Request';
    else if (err.status === 403) title = 'Permission Denied';
    else if (err.status === 404) title = 'Not Found';
    else if (err.status === 504 || err.code === 'WATCHDOG_TIMEOUT') title = 'Gateway Timeout';
    else if (err.status >= 500) title = 'Server Error';

    return {
      status: err.status,
      code: err.code,
      detail: err.detail || err.message || `HTTP ${err.status}`,
      title,
      raw: err,
    };
  }

  if (err instanceof Error) {
    return {
      detail: err.message,
      title: 'Unexpected Error',
      raw: err,
    };
  }

  return {
    detail: 'An unknown error occurred during the transaction.',
    title: 'Unknown Error',
    raw: err,
  };
}

// ============================================================================
// 3. Headless Blocking Action Runner
// ============================================================================

export interface RunBlockingActionOptions<T> {
  title: string;
  message: string;
  actionName?: string;
  apiCall: (signal: AbortSignal) => Promise<T>;
  timeoutMs?: number; // default: 30,000 ms
  successTitle?: string;
  successMessage?: string | ((data: T) => string);
  invalidateQueries?: Array<readonly unknown[]>; // Query keys to invalidate on success
  onSuccess?: (data: T) => Promise<void> | void;
  onAfterConfirm?: (data: T) => Promise<void> | void;
  onRetry?: () => Promise<void> | void;
  onDismiss?: () => void;
}

export async function runBlockingAction<T>(options: RunBlockingActionOptions<T>): Promise<T> {
  const store = useBlockingModalStore.getState();

  // Concurrency guard: reject or block if another blocking mutation is active
  if (store.isLocked) {
    throw new Error('Another operation is already in progress. Please wait.');
  }

  const abortController = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30000;

  const acquired = store.openLoading({
    title: options.title,
    message: options.message,
    actionName: options.actionName,
    timeoutMs,
    successTitle: options.successTitle,
    successMessage: options.successMessage as string | ((data: unknown) => string) | undefined,
    onRetry: options.onRetry,
    onDismiss: options.onDismiss,
  });

  if (!acquired) {
    throw new Error('Unable to acquire blocking modal lock.');
  }

  let timerId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      abortController.abort();
      const timeoutError = new ApiError(
        504,
        'Gateway Timeout',
        `The operation timed out after ${timeoutMs / 1000} seconds. The server may still be processing your request. Please inspect current records before re-submitting.`,
        'WATCHDOG_TIMEOUT'
      );
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    const apiPromise = options.apiCall(abortController.signal);
    const result = await Promise.race([apiPromise, timeoutPromise]);

    if (timerId) clearTimeout(timerId);

    // 1. Invalidate caches immediately upon successful persistence
    if (options.invalidateQueries && options.invalidateQueries.length > 0) {
      await Promise.all(
        options.invalidateQueries.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
    }

    // 2. Run custom success hook if provided
    if (options.onSuccess) {
      await options.onSuccess(result);
    }

    // 3. Handle success modal or immediate close
    if (options.successTitle || options.successMessage) {
      store.setSuccess(result);
    } else {
      store.close();
    }

    return result;
  } catch (err: unknown) {
    if (timerId) clearTimeout(timerId);

    // Extract verbatim RFC 7807 error details
    const errorDetails = extractRfc7807Error(err);
    store.setError(errorDetails);

    throw err;
  }
}

// ============================================================================
// 4. Modal Component
// ============================================================================

export function BlockingActionModal() {
  const {
    isOpen,
    status,
    title,
    message,
    successTitle,
    successMessage,
    error,
    progress,
    close,
    onRetry,
    onDismiss,
  } = useBlockingModalStore();

  if (!isOpen) return null;

  return (
    <DialogPrimitive.Root open={isOpen}>
      <DialogPrimitive.Portal>
        {/* Non-dismissible backdrop: pointer events blocked, backdrop blur */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity duration-200" />

        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%]',
            'gap-4 rounded-xl border border-[#f0f0f5] bg-white p-6 shadow-2xl duration-200',
            'focus:outline-none'
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            // Escape only allowed when in error or success state, never during loading
            if (status === 'loading') {
              e.preventDefault();
            } else {
              close();
            }
          }}
        >
          {/* 1. LOADING STATE */}
          {status === 'loading' && (
            <div className="flex flex-col items-center text-center py-4 space-y-4" aria-busy="true">
              <div className="relative flex items-center justify-center p-3">
                <Loader2 className="h-10 w-10 animate-spin text-[#2563eb]" />
              </div>
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-lg font-semibold text-[#1e293b]">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-[#64748b] leading-relaxed">
                  {message}
                </DialogPrimitive.Description>
              </div>

              {progress && (
                <div className="w-full space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs text-[#64748b]">
                    <span>{progress.label || 'Progress'}</span>
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2563eb] transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (progress.current / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. SUCCESS STATE */}
          {status === 'success' && (
            <div className="flex flex-col items-center text-center py-2 space-y-4">
              <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-lg font-semibold text-[#1e293b]">
                  {successTitle || 'Operation Successful'}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-[#64748b]">
                  {typeof successMessage === 'function'
                    ? 'Completed successfully.'
                    : successMessage || 'The action was persisted successfully.'}
                </DialogPrimitive.Description>
              </div>
              <div className="w-full pt-2">
                <Button className="w-full" onClick={close}>
                  OK
                </Button>
              </div>
            </div>
          )}

          {/* 3. ERROR STATE (RFC 7807 Verbatim Surfacing) */}
          {status === 'error' && error && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#f1f5f9] pb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
                  <DialogPrimitive.Title className="text-base font-semibold text-[#1e293b]">
                    {error.title || 'Action Failed'}
                  </DialogPrimitive.Title>
                </div>
                {/* Header Badge displaying error.code verbatim */}
                {error.code && (
                  <Badge
                    variant="destructive"
                    data-testid="error-code-badge"
                    className="font-mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 shrink-0"
                  >
                    {error.code}
                  </Badge>
                )}
              </div>

              {/* Body message container displaying error.detail verbatim */}
              <div className="rounded-lg bg-red-50/60 border border-red-200/80 p-3.5">
                <p
                  data-testid="error-detail-body"
                  className="text-sm text-red-950 font-medium leading-relaxed break-words whitespace-pre-wrap"
                >
                  {error.detail}
                </p>
              </div>

              {/* Technical context for status code */}
              {error.status && (
                <div className="text-xs text-[#94a3b8] flex justify-between px-1">
                  <span>HTTP Status: {error.status}</span>
                  {error.code && <span>Code: {error.code}</span>}
                </div>
              )}

              {/* Recovery Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="error-dismiss-btn"
                  onClick={() => {
                    if (onDismiss) onDismiss();
                    close();
                  }}
                >
                  Dismiss
                </Button>
                {onRetry && (
                  <Button
                    variant="default"
                    size="sm"
                    data-testid="error-retry-btn"
                    onClick={async () => {
                      close();
                      await onRetry();
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
