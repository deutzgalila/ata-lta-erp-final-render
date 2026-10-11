import type { UserProfile } from '@/lib/session';
import type { Task, WorkRequest } from '../api/types';

/**
 * Checks if the user is an assigned employee on this specific task
 * (either primary lead assignee or in the co-assignees / task_assignees list).
 */
export function isTaskAssignee(user: UserProfile | null | undefined, task: Task | null | undefined): boolean {
  if (!user?.id || !task) return false;
  if ((task.assigneeId || (task as Task & { assignee_id?: string }).assignee_id) === user.id) return true;
  const aliases = task as Task & {
    coAssignees?: unknown; co_assignees?: unknown;
    relationalAssignees?: unknown; relational_assignees?: unknown;
  };
  const lists = [task.assignees, task.taskAssignees, task.task_assignees,
    aliases.coAssignees, aliases.co_assignees, aliases.relationalAssignees, aliases.relational_assignees];
  if (lists.some((list) => Array.isArray(list) && list.some((entry: unknown) => {
    if (typeof entry === 'string') return entry === user.id;
    if (!entry || typeof entry !== 'object') return false;
    const member = entry as { userId?: string; user_id?: string; id?: string };
    return member.userId === user.id || member.user_id === user.id || member.id === user.id;
  }))) return true;
  return false;
}

/**
 * Checks if a user is part of the parent Work Request:
 * - Lead manager/assignee on the WR
 * - Listed in the WR's co-assignees
 * - OR assigned to ANY task within this Work Request
 */
export function isWrTeamMember(
  user: UserProfile | null | undefined,
  workRequest: WorkRequest | null | undefined,
  tasks: Task[] = []
): boolean {
  if (!user?.id || !workRequest) return false;
  if (workRequest.assignedTo === user.id) return true;
  if (Array.isArray(workRequest.coAssignees) && workRequest.coAssignees.includes(user.id)) return true;
  if (tasks.some((t) => isTaskAssignee(user, t))) return true;
  return false;
}

/**
 * Checks if a user is an Admin
 */
export function isUserAdmin(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'Admin' || user.email === 'lorein@ata-lta.ph';
}

/**
 * Checks if a Manager also belongs to the Operations department
 */
export function isManagerWithOperations(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'Manager' && Array.isArray(user.departments) && user.departments.includes('Operations');
}

/**
 * Only the assigned employee (or Admin) can mark task as In Progress or Complete.
 */
export function canMutateTaskStatus(user: UserProfile | null | undefined, task: Task | null | undefined): boolean {
  if (!user || !task) return false;
  if (isUserAdmin(user)) return true;
  return isTaskAssignee(user, task);
}

/**
 * Time is always attributed to the caller, who must be assigned (including Admins).
 */
export function canLogTaskTime(user: UserProfile | null | undefined, task: Task | null | undefined): boolean {
  if (!user || !task) return false;
  return isTaskAssignee(user, task);
}

/**
 * Only the assigned employee (or Admin) can upload documents to this task.
 */
export function canUploadTaskDocument(user: UserProfile | null | undefined, task: Task | null | undefined): boolean {
  if (!user || !task) return false;
  if (isUserAdmin(user)) return true;
  return isTaskAssignee(user, task);
}

/**
 * Linking Billing (Invoices):
 * Allowed for:
 * 1. Admin
 * 2. Assigned employee on the task
 * 3. Accounting users who are part of the Work Request
 */
export function canLinkInvoice(
  user: UserProfile | null | undefined,
  task: Task | null | undefined,
  workRequest: WorkRequest | null | undefined,
  tasks: Task[] = []
): boolean {
  if (!user) return false;
  if (isUserAdmin(user)) return true;
  if (isTaskAssignee(user, task)) return true;
  const isAccounting = Array.isArray(user.departments) && user.departments.includes('Accounting');
  if (isAccounting && isWrTeamMember(user, workRequest, tasks)) return true;
  return false;
}

/**
 * Linking Disbursement:
 * Allowed for:
 * 1. Admin
 * 2. Assigned employee on the task (who holds disbursement permission)
 */
export function canLinkDisbursement(
  user: UserProfile | null | undefined,
  task: Task | null | undefined,
  hasDisbursementPermission: boolean
): boolean {
  if (!user || !task) return false;
  if (isUserAdmin(user)) return true;
  return isTaskAssignee(user, task) && hasDisbursementPermission;
}

/**
 * Linking Transmittal:
 * Allowed for:
 * 1. Admin
 * 2. Assigned employee on the task
 * 3. Documentation users who are part of the Work Request
 */
export function canLinkTransmittal(
  user: UserProfile | null | undefined,
  task: Task | null | undefined,
  workRequest: WorkRequest | null | undefined,
  tasks: Task[] = []
): boolean {
  if (!user) return false;
  if (isUserAdmin(user)) return true;
  if (isTaskAssignee(user, task)) return true;
  const isDocumentation = Array.isArray(user.departments) && user.departments.includes('Documentation');
  if (isDocumentation && isWrTeamMember(user, workRequest, tasks)) return true;
  return false;
}

/**
 * Request Invoice from Accounting:
 * Allowed for Operations, HR, Management, or assigned employee when invoice is needed.
 */
export function canRequestInvoice(
  user: UserProfile | null | undefined,
  task: Task | null | undefined,
  workRequest: WorkRequest | null | undefined,
  tasks: Task[] = []
): boolean {
  if (!user || !task) return false;
  if (isUserAdmin(user)) return false; // Admin links directly
  const isAccounting = Array.isArray(user.departments) && user.departments.includes('Accounting');
  if (isAccounting) return false; // Accounting links directly

  const hasAllowedDept = (user.departments || []).some((d) =>
    ['Operations', 'HR', 'Management'].includes(d)
  ) || user.role === 'Manager' || user.role === 'Staff';

  return isTaskAssignee(user, task) || (hasAllowedDept && isWrTeamMember(user, workRequest, tasks));
}

/**
 * Request Transmittal from Documentation:
 * Allowed for Operations, HR, Management, or assigned employee when transmittal is needed.
 */
export function canRequestTransmittal(
  user: UserProfile | null | undefined,
  task: Task | null | undefined,
  workRequest: WorkRequest | null | undefined,
  tasks: Task[] = []
): boolean {
  if (!user || !task) return false;
  if (isUserAdmin(user)) return false; // Admin links directly
  const isDoc = Array.isArray(user.departments) && user.departments.includes('Documentation');
  if (isDoc) return false; // Documentation links directly

  const hasAllowedDept = (user.departments || []).some((d) =>
    ['Operations', 'HR', 'Management'].includes(d)
  ) || user.role === 'Manager' || user.role === 'Staff';

  return isTaskAssignee(user, task) || (hasAllowedDept && isWrTeamMember(user, workRequest, tasks));
}
