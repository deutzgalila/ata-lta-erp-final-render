import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RotateCcw,
  Check,
  X,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RejectReasonModal } from './RejectReasonModal';
import { runBlockingAction } from './BlockingActionModal';
import {
  useOperationsRequests,
  useOperationsRequestCounts,
  usePhaseTransitions,
} from '../api/usePhaseTransitions';
import { useWorkRequestDetail } from '../api/useWorkRequests';
import { operationsKeys } from '../api/queryKeys';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import type { Phase } from '../api/types';

export interface PendingApprovalsInboxProps {
  onNavigateToWr?: (wrId: string) => void;
}

export function PendingApprovalsInbox({ onNavigateToWr }: PendingApprovalsInboxProps) {
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'rejected' | 'fulfilled' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);

  const activeEntity = useSessionStore((state) => state.activeEntity);
  const permissions = useSessionStore((state) => state.permissions);
  const currentUserId = useSessionStore((state) => state.user?.id);

  const canApprove = hasPermission(permissions, 'workflow:phase_transition');
  const canRequest = hasPermission(permissions, 'workflow:transition_request');

  // Queries
  const { data: rawRequests, isLoading } = useOperationsRequests({
    status: activeSubTab === 'all' ? undefined : activeSubTab,
    type: 'wr_phase_transition',
  });
  const requests = useMemo(() => {
    if (Array.isArray(rawRequests)) return rawRequests;
    return rawRequests?.data ?? [];
  }, [rawRequests]);

  const { data: counts } = useOperationsRequestCounts();
  const pendingCount = counts?.pending ?? 0;

  // Mutations
  const { fulfillRequest, cancelRequest, requestTransition } = usePhaseTransitions();

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const title = r.work_requests?.title || (r as unknown as { workRequestTitle?: string }).workRequestTitle || '';
      const requester = r.requester?.name || r.requestedByName || '';
      const notes = r.notes || '';
      const q = search.toLowerCase();
      return (
        title.toLowerCase().includes(q) ||
        requester.toLowerCase().includes(q) ||
        notes.toLowerCase().includes(q)
      );
    });
  }, [requests, search]);

  // Selected request
  const selectedRequest = useMemo(() => {
    if (!selectedRequestId && filteredRequests.length > 0) {
      return filteredRequests[0] || null;
    }
    return filteredRequests.find((r) => r.id === selectedRequestId) || filteredRequests[0] || null;
  }, [filteredRequests, selectedRequestId]);

  const wrId = selectedRequest?.work_request_id || (selectedRequest as unknown as { workRequestId?: string })?.workRequestId;
  const { data: wrDetail } = useWorkRequestDetail(wrId || '', { enabled: Boolean(wrId) });

  // Gate Prerequisite Evaluation
  const gateEvaluation = useMemo(() => {
    if (!wrDetail || !selectedRequest) return null;

    const fromPhase = selectedRequest.from_phase || (selectedRequest as unknown as { fromPhase?: Phase })?.fromPhase;
    const tasks = wrDetail.tasks || [];
    const activeTasks = tasks.filter((t) => t.status !== 'Cancelled');

    if (fromPhase === 'pre_processing') {
      const preTasks = activeTasks.filter((t) => t.phase === 'pre_processing');
      const incomplete = preTasks.filter((t) => t.status !== 'Completed');
      return {
        passed: incomplete.length === 0,
        total: preTasks.length,
        completedCount: preTasks.length - incomplete.length,
        incompleteTasks: incomplete,
        gateName: 'Pre-processing Gate',
      };
    } else if (fromPhase === 'processing') {
      const procTasks = activeTasks.filter((t) => t.phase === 'processing');
      const incomplete = procTasks.filter((t) => t.status !== 'Completed');
      return {
        passed: incomplete.length === 0,
        total: procTasks.length,
        completedCount: procTasks.length - incomplete.length,
        incompleteTasks: incomplete,
        gateName: 'Processing Gate',
      };
    } else if (fromPhase === 'quality_assurance') {
      const incomplete = activeTasks.filter((t) => t.status !== 'Completed');
      const unpassed = activeTasks.filter((t) => t.qaStatus !== 'passed');
      const blockers = [...new Set([...incomplete, ...unpassed])];
      return {
        passed: blockers.length === 0,
        total: activeTasks.length,
        completedCount: activeTasks.length - blockers.length,
        incompleteTasks: blockers,
        gateName: 'QA & Compliance Gate',
      };
    }

    return null;
  }, [wrDetail, selectedRequest]);

  // Handle Approve & Advance
  const handleApprove = async () => {
    if (!selectedRequest) return;
    const reqId = selectedRequest.id;

    await runBlockingAction({
      title: 'Approving Phase Transition',
      message: 'Fulfilling request and advancing work request phase...',
      apiCall: async () => {
        return await fulfillRequest(reqId);
      },
      successTitle: 'Phase Transition Approved',
      successMessage: 'Work request phase has been advanced successfully.',
      invalidateQueries: [
        operationsKeys.requests(),
        operationsKeys.requestCounts(activeEntity),
        operationsKeys.workRequests(),
        ...(wrId ? [operationsKeys.workRequestDetail(wrId), operationsKeys.tasks(wrId)] : []),
      ],
    });
  };

  // Handle Withdraw
  const handleWithdraw = async () => {
    if (!selectedRequest) return;
    const reqId = selectedRequest.id;

    await runBlockingAction({
      title: 'Withdrawing Request',
      message: 'Cancelling transition request...',
      apiCall: async () => {
        return await cancelRequest(reqId);
      },
      successTitle: 'Request Withdrawn',
      successMessage: 'Transition request has been withdrawn.',
      invalidateQueries: [
        operationsKeys.requests(),
        operationsKeys.requestCounts(activeEntity),
      ],
    });
  };

  // Handle Resubmit
  const handleResubmit = async () => {
    if (!selectedRequest || !wrId) return;

    const fromPhase = selectedRequest.from_phase || (selectedRequest as unknown as { fromPhase?: Phase })?.fromPhase || 'pre_processing';
    const toPhase = selectedRequest.to_phase || (selectedRequest as unknown as { toPhase?: Phase })?.toPhase || 'processing';

    await runBlockingAction({
      title: 'Resubmitting Transition Request',
      message: 'Submitting updated phase transition request...',
      apiCall: async () => {
        return await requestTransition({
          workRequestId: wrId,
          from_phase: fromPhase,
          to_phase: toPhase,
          notes: resubmitNotes.trim() || undefined,
        });
      },
      successTitle: 'Transition Resubmitted',
      successMessage: 'New phase transition request has been queued for review.',
      invalidateQueries: [
        operationsKeys.requests(),
        operationsKeys.requestCounts(activeEntity),
      ],
      onSuccess: () => {
        setIsResubmitting(false);
        setResubmitNotes('');
        setActiveSubTab('pending');
      },
    });
  };

  return (
    <div className="flex flex-col h-[700px] border border-slate-200 rounded-lg bg-white overflow-hidden" data-testid="pending-approvals-inbox">
      {/* Top Bar with Sub-Tabs */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-1.5" data-testid="inbox-subtabs">
          <Button
            type="button"
            variant={activeSubTab === 'pending' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setActiveSubTab('pending')}
            className="text-xs gap-1.5"
            data-testid="tab-pending"
          >
            <span>Pending</span>
            {pendingCount > 0 && (
              <Badge variant="secondary" size="compact" className="bg-amber-100 text-amber-800 font-bold px-1.5" data-testid="pending-badge-count">
                {pendingCount}
              </Badge>
            )}
          </Button>
          <Button
            type="button"
            variant={activeSubTab === 'rejected' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setActiveSubTab('rejected')}
            className="text-xs"
            data-testid="tab-rejected"
          >
            Rejected
          </Button>
          <Button
            type="button"
            variant={activeSubTab === 'fulfilled' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setActiveSubTab('fulfilled')}
            className="text-xs"
            data-testid="tab-fulfilled"
          >
            Fulfilled
          </Button>
          <Button
            type="button"
            variant={activeSubTab === 'all' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setActiveSubTab('all')}
            className="text-xs"
            data-testid="tab-all"
          >
            All History
          </Button>
        </div>

        <div className="w-56 relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queue..."
            className="h-8 pl-8 text-xs bg-white"
          />
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Queue Cards (40% width) */}
        <div className="w-[380px] border-r border-slate-200 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading transition queue...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              No {activeSubTab} transition requests found.
            </div>
          ) : (
            filteredRequests.map((req) => {
              const isSelected = selectedRequest?.id === req.id;
              const reqTitle =
                req.work_requests?.title ||
                (req as unknown as { workRequestTitle?: string }).workRequestTitle ||
                'Work Request';
              const submitter = req.requester?.name || req.requestedByName || 'Staff';
              const fromP = req.from_phase || (req as unknown as { fromPhase?: Phase }).fromPhase || 'pre_processing';
              const toP = req.to_phase || (req as unknown as { toPhase?: Phase }).toPhase || 'processing';

              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedRequestId(req.id)}
                  className={`p-3 cursor-pointer transition-colors space-y-1.5 ${
                    isSelected
                      ? 'bg-blue-50/80 border-l-4 border-l-blue-600'
                      : 'hover:bg-slate-100/70 border-l-4 border-l-transparent'
                  }`}
                  data-testid={`approval-item-${req.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-slate-900 truncate max-w-[240px]">
                      {reqTitle}
                    </span>
                    <Badge
                      variant={
                        req.status === 'pending'
                          ? 'warning'
                          : req.status === 'fulfilled'
                            ? 'success'
                            : req.status === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                      }
                      size="compact"
                      className="text-[10px] uppercase tracking-wide"
                    >
                      {req.status}
                    </Badge>
                  </div>

                  {/* Route Badge */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <span className="font-medium capitalize">{fromP.replace('_', ' ')}</span>
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                    <span className="font-medium capitalize text-blue-700">{toP.replace('_', ' ')}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                    <span>By {submitter}</span>
                    <span>{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Diff & Validation Inspector (60% width) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
          {selectedRequest ? (
            <>
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-900">
                      {selectedRequest.work_requests?.title ||
                        (selectedRequest as unknown as { workRequestTitle?: string }).workRequestTitle ||
                        'Work Request'}
                    </h3>
                    {wrId && onNavigateToWr && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => onNavigateToWr(wrId)}
                        className="text-xs text-blue-600 h-6 px-1.5"
                      >
                        Open Details
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Requested by{' '}
                    <span className="font-medium text-slate-700">
                      {selectedRequest.requester?.name || selectedRequest.requestedByName || 'Staff'}
                    </span>{' '}
                    on {selectedRequest.createdAt ? new Date(selectedRequest.createdAt).toLocaleString() : ''}
                  </div>
                </div>

                <Badge
                  variant={
                    selectedRequest.status === 'pending'
                      ? 'warning'
                      : selectedRequest.status === 'fulfilled'
                        ? 'success'
                        : selectedRequest.status === 'rejected'
                          ? 'destructive'
                          : 'secondary'
                  }
                  size="default"
                  className="capitalize"
                  data-testid="request-detail-status"
                >
                  {selectedRequest.status}
                </Badge>
              </div>

              {/* Side-by-side Phase Transition Flow */}
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Phase Transition Flow
                </h4>
                <div className="flex items-center justify-center gap-4 py-3">
                  <div className="px-4 py-2 bg-white rounded-md border border-slate-200 text-xs font-semibold text-slate-700 capitalize shadow-xs">
                    {(selectedRequest.from_phase || (selectedRequest as unknown as { fromPhase?: Phase }).fromPhase || 'pre_processing').replace('_', ' ')}
                  </div>
                  <ArrowRight className="h-5 w-5 text-blue-600" />
                  <div className="px-4 py-2 bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 capitalize shadow-xs">
                    {(selectedRequest.to_phase || (selectedRequest as unknown as { toPhase?: Phase }).toPhase || 'processing').replace('_', ' ')}
                  </div>
                </div>
                {selectedRequest.notes && (
                  <div className="text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                    <span className="font-semibold text-slate-700">Submitter Notes: </span>
                    {selectedRequest.notes}
                  </div>
                )}
              </div>

              {/* Gate Prerequisite Inspector */}
              <div className="space-y-3" data-testid="gate-inspector">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Phase Gate Checklist Inspector
                </h4>

                {gateEvaluation ? (
                  <div className="space-y-3">
                    <div
                      className={`p-3 rounded-md border flex items-center justify-between text-xs ${
                        gateEvaluation.passed
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                      data-testid="gate-status-banner"
                    >
                      <div className="flex items-center gap-2">
                        {gateEvaluation.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                        )}
                        <span className="font-medium">
                          {gateEvaluation.passed
                            ? `All ${gateEvaluation.total} prerequisite gate tasks are Completed.`
                            : `Prerequisite gate incomplete: ${gateEvaluation.incompleteTasks.length} blocker task(s) remaining.`}
                        </span>
                      </div>
                      <Badge
                        variant={gateEvaluation.passed ? 'success' : 'warning'}
                        size="compact"
                      >
                        {gateEvaluation.completedCount} / {gateEvaluation.total} Done
                      </Badge>
                    </div>

                    {/* Blocker Tasks List */}
                    {gateEvaluation.incompleteTasks.length > 0 && (
                      <div className="space-y-1.5 bg-slate-50 p-3 rounded-md border border-slate-200 text-xs">
                        <span className="font-semibold text-slate-700 block">
                          Incomplete Gate Tasks (Blockers):
                        </span>
                        <ul className="space-y-1 pl-4 list-disc text-slate-600">
                          {gateEvaluation.incompleteTasks.map((t) => (
                            <li key={t.id} className="text-xs">
                              <span className="font-medium text-slate-800">{t.title}</span> —{' '}
                              <Badge variant="outline" size="compact" className="text-[10px]">
                                {t.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    Loading work request tasks for gate inspection...
                  </div>
                )}
              </div>

              {/* Rejection Details (if rejected) */}
              {selectedRequest.status === 'rejected' && (
                <div
                  className="p-3.5 bg-red-50 border border-red-200 rounded-md space-y-1.5 text-xs text-red-800"
                  data-testid="rejection-history-card"
                >
                  <div className="flex items-center gap-2 font-bold text-red-900">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Rejection Reason:</span>
                  </div>
                  <p className="whitespace-pre-wrap pl-6">
                    {selectedRequest.rejection_reason || selectedRequest.rejectionReason || 'No reason provided.'}
                  </p>
                  {selectedRequest.fulfilledAt && (
                    <div className="text-[10px] text-red-600/80 pl-6">
                      Resolved on {new Date(selectedRequest.fulfilledAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <div>
                  {selectedRequest.status === 'pending' &&
                    selectedRequest.requested_by === currentUserId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleWithdraw}
                        className="text-xs text-slate-500 hover:text-red-600"
                        data-testid="withdraw-btn"
                      >
                        Withdraw Request
                      </Button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Admin Approve / Reject actions for Pending */}
                  {selectedRequest.status === 'pending' && canApprove && (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setIsRejectModalOpen(true)}
                        className="text-xs gap-1"
                        data-testid="reject-btn"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleApprove}
                        className="text-xs gap-1 bg-emerald-600 hover:bg-emerald-700"
                        data-testid="approve-btn"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve & Advance
                      </Button>
                    </>
                  )}

                  {/* Resubmit action for Rejected requests */}
                  {selectedRequest.status === 'rejected' && canRequest && (
                    <>
                      {isResubmitting ? (
                        <div className="w-full space-y-2">
                          <textarea
                            value={resubmitNotes}
                            onChange={(e) => setResubmitNotes(e.target.value)}
                            placeholder="Add explanation or audit notes for resubmission..."
                            rows={2}
                            className="w-full text-xs p-2 border border-slate-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            data-testid="resubmit-notes-input"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => setIsResubmitting(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              onClick={handleResubmit}
                              data-testid="confirm-resubmit-btn"
                            >
                              Confirm Resubmit
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsResubmitting(true)}
                          className="text-xs gap-1 text-blue-600"
                          data-testid="resubmit-btn"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Resubmit Transition
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Select a request from the queue to inspect details and gate tasks.
            </div>
          )}
        </div>
      </div>

      {/* Reject Reason Modal */}
      {selectedRequest && (
        <RejectReasonModal
          isOpen={isRejectModalOpen}
          requestId={selectedRequest.id}
          workRequestTitle={
            selectedRequest.work_requests?.title ||
            (selectedRequest as unknown as { workRequestTitle?: string }).workRequestTitle
          }
          onClose={() => setIsRejectModalOpen(false)}
        />
      )}
    </div>
  );
}
