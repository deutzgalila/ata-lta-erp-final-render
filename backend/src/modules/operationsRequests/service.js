/**
 * Operations Requests service.
 * Business logic for operations request CRUD and workflow transitions.
 */

const { supabaseAdmin } = require('../../services/supabaseClient');
const auditService = require('../../services/auditService');
const AppError = require('../../lib/AppError');
const { buildPermissionSet, hasPermission } = require('../../lib/permissions');
const { checkAdvancementGate, PHASE_SEQUENCE, PHASE_STATUS_MAP } = require('../operations/service');
const { notify } = require('../../services/notify');

/**
 * List operations requests for the active entity.
 * @param {object} params
 * @param {string} params.entityId
 * @param {object} [params.filters]
 * @returns {Promise<{ data: object[], count: number }>}
 */
const listRequests = async ({ entityId, filters = {} }) => {
  const {
    status,
    type,
    workRequestId,
    clientId,
    linkedTaskId,
    requestedBy,
    page = 1,
    limit = 50,
  } = filters;

  let query = supabaseAdmin
    .from('operations_requests')
    .select('*, clients(name), work_requests(title)', { count: 'exact' })
    .or('status.eq.pending,status.eq.fulfilled,status.eq.rejected');

  if (entityId && entityId !== 'ALL') {
    query = query.eq('entity_id', entityId);
  }

  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);
  if (workRequestId) query = query.eq('work_request_id', workRequestId);
  if (clientId) query = query.eq('client_id', clientId);
  if (linkedTaskId) query = query.eq('linked_task_id', linkedTaskId);
  if (requestedBy) query = query.eq('requested_by', requestedBy);

  const offset = (page - 1) * limit;
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to fetch operations requests',
    });
  }

  return { data: (data || []).map(parseRequestPayload), count: count || 0 };
};

const parseRequestPayload = (row) => {
  if (!row) return row;
  if (row.notes && typeof row.notes === 'string' && row.notes.startsWith('{')) {
    try {
      const parsed = JSON.parse(row.notes);
      return {
        ...row,
        payload: parsed,
        from_phase: parsed.from_phase,
        to_phase: parsed.to_phase,
      };
    } catch (_err) {
      // Ignore JSON parse error on non-JSON notes
    }
  }
  return row;
};

// In-flight mutex map to guarantee idempotency against concurrent double-submits
const inFlightRequests = new Map();

/**
 * Create a new operations request.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.userId
 * @param {object} params.data
 * @returns {Promise<object>}
 */
const createRequest = async ({ entityId, userId, data }) => {
  const reqType =
    data.type === 'wr_phase_transition' || data.request_type === 'wr_phase_transition'
      ? 'wr_phase_transition'
      : (data.type || data.request_type);

  const targetWorkRequestId =
    data.payload?.work_request_id ||
    data.payload?.workRequestId ||
    data.workRequestId ||
    data.work_request_id;

  const dedupeKey = `${entityId}:${userId}:${reqType}:${targetWorkRequestId || ''}:${data.linkedTaskId || ''}`;

  if (inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey);
  }

  const creationPromise = (async () => {
    try {
      // Deduplication guard against rapid double-clicks (within 5 seconds)
      const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
      let dupQuery = supabaseAdmin
        .from('operations_requests')
        .select('*, clients(name), work_requests(title)')
        .eq('entity_id', entityId)
        .eq('type', reqType)
        .eq('requested_by', userId)
        .eq('status', 'pending')
        .gte('created_at', fiveSecondsAgo);

      if (targetWorkRequestId) dupQuery = dupQuery.eq('work_request_id', targetWorkRequestId);
      if (data.linkedTaskId) dupQuery = dupQuery.eq('linked_task_id', data.linkedTaskId);

      const { data: existingDups } = await dupQuery.limit(1);
      if (existingDups && existingDups.length > 0) {
        return parseRequestPayload(existingDups[0]);
      }

      let fromPhase = null;
      let toPhase = null;
      let targetWr = null;

      if (reqType === 'wr_phase_transition') {
        if (!targetWorkRequestId) {
          throw new AppError({
            statusCode: 400,
            title: 'Bad Request',
            detail: 'work_request_id is required for wr_phase_transition',
          });
        }

        const { data: wr, error: wrErr } = await supabaseAdmin
          .from('work_requests')
          .select('id, title, entity_id, client_id, status, phase, requested_by')
          .eq('id', targetWorkRequestId)
          .is('deleted_at', null)
          .maybeSingle();

        if (wrErr || !wr) {
          throw new AppError({
            statusCode: 404,
            title: 'Not Found',
            detail: `Work request ${targetWorkRequestId} not found`,
          });
        }

        targetWr = wr;
        const currentWrPhase = wr.phase || 'pre_processing';
        const requestedFromPhase =
          data.payload?.from_phase ||
          data.payload?.fromPhase ||
          data.fromPhase ||
          data.from_phase;

        if (requestedFromPhase && currentWrPhase !== requestedFromPhase) {
          throw new AppError({
            statusCode: 409,
            title: 'Conflict',
            detail: `Work request current phase "${currentWrPhase}" does not match requested from_phase "${requestedFromPhase}"`,
            code: 'PHASE_MISMATCH',
          });
        }

        fromPhase = requestedFromPhase || currentWrPhase;
        const requestedToPhase =
          data.payload?.to_phase ||
          data.payload?.toPhase ||
          data.toPhase ||
          data.to_phase;

        if (requestedToPhase) {
          toPhase = requestedToPhase;
        } else {
          const fromIdx = PHASE_SEQUENCE.indexOf(fromPhase);
          toPhase = PHASE_SEQUENCE[fromIdx + 1];
        }

        // Validate advancement gate (§3.4)
        await checkAdvancementGate({
          workRequestId: targetWorkRequestId,
          fromPhase,
          toPhase,
        });
      }

      const rowNotes =
        reqType === 'wr_phase_transition'
          ? JSON.stringify({
              from_phase: fromPhase,
              to_phase: toPhase,
              work_request_id: targetWorkRequestId,
              user_notes: data.notes || null,
            })
          : (data.notes || null);

      const row = {
        entity_id: entityId || (targetWr ? targetWr.entity_id : null),
        type: reqType,
        work_request_id: targetWorkRequestId || null,
        client_id: (targetWr ? targetWr.client_id : null) || data.clientId || data.client_id || null,
        linked_task_id: data.linkedTaskId || data.linked_task_id || null,
        requested_by: userId,
        amount: data.amount ?? null,
        status: 'pending',
        notes: rowNotes,
        rejection_reason: null,
        fulfilled_by: null,
        fulfilled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: request, error } = await supabaseAdmin
        .from('operations_requests')
        .insert(row)
        .select()
        .single();

      if (error) {
        throw new AppError({
          statusCode: 500,
          title: 'Database Error',
          detail: `Failed to create operations request: ${error.message || String(error)}`,
        });
      }

      await auditService.log({
        action: 'operations_request.create',
        table: 'operations_requests',
        recordId: request.id,
        entity: entityId,
        userId,
        details: { type: reqType, amount: data.amount, status: 'pending' },
      });

      if (reqType === 'wr_phase_transition' && targetWr) {
        const { data: admins } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('role', 'Admin')
          .eq('is_active', true);

        const adminUserIds = (admins || []).map((a) => a.id);
        try {
          await notify(adminUserIds, 'wr.transition_request.received', {
            request_id: request.id,
            work_request_id: targetWorkRequestId,
            from_phase: fromPhase,
            to_phase: toPhase,
            requested_by: userId,
            wr_title: targetWr.title,
          });
        } catch (_notifErr) {
          // Notify error never fails business operation
        }
      }

      return parseRequestPayload(request);
    } finally {
      inFlightRequests.delete(dedupeKey);
    }
  })();

  inFlightRequests.set(dedupeKey, creationPromise);
  return creationPromise;
};

/**
 * Get a single operations request by ID.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @returns {Promise<object>}
 */
const getRequestById = async ({ entityId, id }) => {
  const { data, error } = await supabaseAdmin
    .from('operations_requests')
    .select(
      '*, clients(name), work_requests(title), requester:requested_by(name), fulfiller:fulfilled_by(name)'
    )
    .eq('id', id)
    .eq('entity_id', entityId)
    .or('status.eq.pending,status.eq.fulfilled,status.eq.rejected')
    .single();

  if (error || !data) {
    throw new AppError({
      statusCode: 404,
      title: 'Not Found',
      detail: `Operations request ${id} not found`,
    });
  }

  return parseRequestPayload(data);
};

/**
 * Update an operations request.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @param {string} params.userId
 * @param {object} params.data
 * @returns {Promise<object>}
 */
const updateRequest = async ({ entityId, id, userId, data }) => {
  const existing = await getRequestById({ entityId, id });

  if (existing.status !== 'pending') {
    throw new AppError({
      statusCode: 409,
      title: 'Conflict',
      detail: `Cannot edit operations request in "${existing.status}" status. Only pending requests can be updated.`,
    });
  }

  // Atomic transition for the two terminal statuses.
  if (data.status === 'fulfilled') {
    const isTransition = existing.type === 'wr_phase_transition';
    let fromPhase = null;
    let toPhase = null;
    let wrId = existing.work_request_id;

    if (isTransition) {
      let meta = {};
      try {
        meta = JSON.parse(existing.notes || '{}');
      } catch (_err) {
        // Ignore JSON parse error on non-JSON notes
      }
      fromPhase = meta.from_phase || existing.from_phase;
      toPhase = meta.to_phase || existing.to_phase;
      wrId = existing.work_request_id || meta.work_request_id;

      if (wrId && fromPhase && toPhase) {
        await checkAdvancementGate({
          workRequestId: wrId,
          fromPhase,
          toPhase,
        });
      }
    }

    const { data: rows, error: rpcError } = await supabaseAdmin.rpc('operations_request_fulfill', {
      p_id: id,
      p_fulfilled_by: data.fulfilledBy || userId,
      p_entity_id: entityId,
    });

    if (rpcError) {
      throw new AppError({
        statusCode: 500,
        title: 'Database Error',
        detail: 'Failed to fulfill operations request',
      });
    }

    if (!rows || rows.length === 0) {
      throw new AppError({
        statusCode: 409,
        title: 'Conflict',
        detail: 'This operations request has already been fulfilled or rejected',
        code: 'OPERATIONS_REQUEST_ALREADY_RESOLVED',
      });
    }

    if (isTransition && wrId && toPhase) {
      const now = new Date().toISOString();
      const newStatus = PHASE_STATUS_MAP[toPhase] || 'In Progress';

      const { error: wrErr } = await supabaseAdmin
        .from('work_requests')
        .update({
          phase: toPhase,
          phase_entered_at: now,
          status: newStatus,
          updated_at: now,
        })
        .eq('id', wrId);

      if (wrErr) {
        throw new AppError({
          statusCode: 500,
          title: 'Database Error',
          detail: 'Failed to advance work request phase during fulfillment',
        });
      }

      await auditService.log({
        action: 'work_request.phase_advance',
        table: 'work_requests',
        recordId: wrId,
        entity: entityId,
        userId,
        details: {
          from_phase: fromPhase,
          to_phase: toPhase,
          before: { phase: fromPhase },
          after: { phase: toPhase, status: newStatus },
          request_id: id,
          via: 'request',
        },
      });

      if (existing.requested_by) {
        try {
          await notify([existing.requested_by], 'wr.transition_request.resolved', {
            request_id: id,
            work_request_id: wrId,
            from_phase: fromPhase,
            to_phase: toPhase,
            outcome: 'approved',
          });
        } catch (_notifErr) {
          // Notify error never fails business operation
        }
      }
    }

    await auditService.log({
      action: 'operations_request.update',
      table: 'operations_requests',
      recordId: id,
      entity: entityId,
      userId,
      details: { status: 'fulfilled', fulfilledBy: data.fulfilledBy || userId },
    });

    return parseRequestPayload(rows[0]);
  }

  if (data.status === 'rejected') {
    const isTransition = existing.type === 'wr_phase_transition';
    const rejectionReason = data.rejectionReason || data.rejection_reason;
    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new AppError({
        statusCode: 400,
        title: 'Bad Request',
        detail: 'rejectionReason is required when status is rejected',
      });
    }

    const { data: rows, error: rpcError } = await supabaseAdmin.rpc('operations_request_reject', {
      p_id: id,
      p_rejection_reason: rejectionReason.trim(),
      p_user_id: userId,
      p_entity_id: entityId,
    });

    if (rpcError) {
      throw new AppError({
        statusCode: 500,
        title: 'Database Error',
        detail: 'Failed to reject operations request',
      });
    }

    if (!rows || rows.length === 0) {
      throw new AppError({
        statusCode: 409,
        title: 'Conflict',
        detail: 'This operations request has already been fulfilled or rejected',
        code: 'OPERATIONS_REQUEST_ALREADY_RESOLVED',
      });
    }

    if (isTransition && existing.requested_by) {
      let meta = {};
      try {
        meta = JSON.parse(existing.notes || '{}');
      } catch (_err) {
        // Ignore JSON parse error on non-JSON notes
      }
      const fromPhase = meta.from_phase || existing.from_phase;
      const toPhase = meta.to_phase || existing.to_phase;
      const wrId = existing.work_request_id || meta.work_request_id;

      try {
        await notify([existing.requested_by], 'wr.transition_request.resolved', {
          request_id: id,
          work_request_id: wrId,
          from_phase: fromPhase,
          to_phase: toPhase,
          outcome: 'rejected',
          reason: rejectionReason.trim(),
        });
      } catch (_notifErr) {
        // Notify error never fails business operation
      }
    }

    await auditService.log({
      action: 'operations_request.update',
      table: 'operations_requests',
      recordId: id,
      entity: entityId,
      userId,
      details: { status: 'rejected', rejectionReason: rejectionReason.trim() },
    });

    return parseRequestPayload(rows[0]);
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (data.status !== undefined) updates.status = data.status;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.rejectionReason !== undefined) updates.rejection_reason = data.rejectionReason;
  if (data.fulfilledBy !== undefined) updates.fulfilled_by = data.fulfilledBy;

  if (updates.status === 'pending') {
    updates.fulfilled_by = null;
    updates.fulfilled_at = null;
    updates.rejection_reason = null;
  }

  const { data: updated, error } = await supabaseAdmin
    .from('operations_requests')
    .update(updates)
    .eq('id', id)
    .eq('entity_id', entityId)
    .select()
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to update operations request',
    });
  }

  await auditService.log({
    action: 'operations_request.update',
    table: 'operations_requests',
    recordId: id,
    entity: entityId,
    userId,
    details: {
      status: updates.status,
      rejectionReason: updates.rejection_reason,
      fulfilledBy: updates.fulfilled_by,
    },
  });

  return updated;
};

/**
 * Soft-delete an operations request by marking it cancelled.
 * @param {object} params
 * @param {string} params.entityId
 * @param {string} params.id
 * @returns {Promise<object>}
 */
const deleteRequest = async ({ entityId, id }) => {
  const existing = await getRequestById({ entityId, id });

  const { data: deleted, error } = await supabaseAdmin
    .from('operations_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('entity_id', entityId)
    .select()
    .single();

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to delete operations request',
    });
  }

  await auditService.log({
    action: 'operations_request.delete',
    table: 'operations_requests',
    recordId: id,
    entity: entityId,
    userId: existing.requested_by,
    details: { previousStatus: existing.status },
  });

  return deleted;
};

/**
 * Count operations requests grouped by status for the active entity.
 * @param {object} params
 * @param {string} params.entityId
 * @returns {Promise<object>}
 */
const getCounts = async ({ entityId, user }) => {
  const baseQuery = () => {
    let q = supabaseAdmin
      .from('operations_requests')
      .select('*', { count: 'exact', head: true })
      .or('status.eq.pending,status.eq.fulfilled,status.eq.rejected');
    if (entityId && entityId !== 'ALL') {
      q = q.eq('entity_id', entityId);
    }
    return q;
  };

  const runCount = async (query) => {
    const { count, error } = await query;
    if (error) {
      throw new AppError({
        statusCode: 500,
        title: 'Database Error',
        detail: 'Failed to count operations requests',
      });
    }
    return count || 0;
  };

  const canFulfill = (() => {
    if (!user) return false;
    const permissions = buildPermissionSet({
      role: user.role || '',
      departments: user.departments || [],
    });
    return hasPermission(permissions, 'workflow:edit');
  })();

  const [total, pending, fulfilled, rejected, awaitingFulfillment] = await Promise.all([
    runCount(baseQuery()),
    runCount(baseQuery().eq('status', 'pending')),
    runCount(baseQuery().eq('status', 'fulfilled')),
    runCount(baseQuery().eq('status', 'rejected')),
    canFulfill ? runCount(baseQuery().eq('status', 'pending')) : Promise.resolve(0),
  ]);

  return { total, pending, fulfilled, rejected, awaitingFulfillment };
};

module.exports = {
  listRequests,
  createRequest,
  getRequestById,
  updateRequest,
  deleteRequest,
  getCounts,
};
