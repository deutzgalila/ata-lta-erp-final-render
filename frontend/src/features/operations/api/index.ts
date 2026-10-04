// Query Key Factory
export { operationsKeys } from './queryKeys';

// Domain Types and Schemas
export * from './types';
export * from './schemas';

// Work Request Queries & Mutations
export {
  useWorkRequests,
  useWorkRequestList,
  useWorkRequestDetail,
  useWorkRequestCounts,
  useWorkRequestRelated,
  useWorkRequestMutations,
} from './useWorkRequests';

// Task Queries & Mutations
export {
  useWorkRequestTasks,
  useTaskDetail,
  useTaskMutations,
  type CreateTaskVariables,
  type UpdateTaskVariables,
  type DeleteTaskVariables,
  type ReorderTasksVariables,
  type AddTimeLogsVariables,
} from './useTasks';

// Phase Transitions & Operations Requests
export {
  useOperationsRequests,
  useOperationsRequestCounts,
  usePhaseTransitions,
  type AdvancePhaseVariables,
  type RequestTransitionVariables,
  type FulfillRequestVariables,
  type RejectRequestVariables,
} from './usePhaseTransitions';

// QA Review & Reroute
export {
  useQaReview,
  type QaReviewVariables,
  type RerouteVariables,
} from './useQaReview';

// Retainer Templates & Generation
export {
  useRetainerTemplates,
  useRetainerMutations,
  useRetainers,
  type GenerateRetainerVariables,
} from './useRetainers';

// Documents (DMS)
export {
  useDocuments,
  useDocumentDownloadUrl,
  useDocumentMutations,
  type UploadDocumentVariables,
  type UpdateCommentsVariables,
} from './useDocuments';

// Supporting Clients & Team
export {
  useClients,
  type ClientSummary,
  type ClientListResponse,
  type ClientFilters,
} from './useClients';

export {
  useTeam,
  getManagers,
  getEligibleStaff,
  type TeamMember,
} from './useTeam';
