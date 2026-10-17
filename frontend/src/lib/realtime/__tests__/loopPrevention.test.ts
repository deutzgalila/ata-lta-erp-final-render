import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  trackLocalMutation,
  isLocalMutation,
  isSelfOriginatedPayload,
  clearLocalMutationsForTesting,
} from '../loopPrevention';
import { getTabId, resetTabIdForTesting } from '@/lib/tabSync';

describe('Loop Prevention Registry & Tab Origin Tracking', () => {
  beforeEach(() => {
    clearLocalMutationsForTesting();
    resetTabIdForTesting('tab-test-123');
  });

  afterEach(() => {
    clearLocalMutationsForTesting();
    resetTabIdForTesting();
  });

  it('detects tracked local mutations with version', () => {
    expect(isLocalMutation('work_requests', 'wr-1', 2)).toBe(false);

    trackLocalMutation('work_requests', 'wr-1', 2);
    expect(isLocalMutation('work_requests', 'wr-1', 2)).toBe(true);

    // Different version should not match if exact version specified
    expect(isLocalMutation('work_requests', 'wr-1', 3)).toBe(false);
    // Different table should not match
    expect(isLocalMutation('invoices', 'wr-1', 2)).toBe(false);
  });

  it('detects tracked unversioned local mutations', () => {
    trackLocalMutation('work_requests', 'wr-2');
    expect(isLocalMutation('work_requests', 'wr-2')).toBe(true);
    // Any version matches unversioned tracking
    expect(isLocalMutation('work_requests', 'wr-2', 5)).toBe(true);
  });

  it('identifies self-originated payloads from current tab', () => {
    const currentTabId = getTabId();

    const payloadSelf = {
      eventType: 'UPDATE',
      new: { id: 'wr-1', origin_tab_id: currentTabId },
    };
    expect(isSelfOriginatedPayload(payloadSelf)).toBe(true);

    const payloadCamelCase = {
      eventType: 'UPDATE',
      new: { id: 'wr-1', originTabId: currentTabId },
    };
    expect(isSelfOriginatedPayload(payloadCamelCase)).toBe(true);

    const payloadTopLevel = {
      origin_tab_id: currentTabId,
      eventType: 'UPDATE',
      new: { id: 'wr-1' },
    };
    expect(isSelfOriginatedPayload(payloadTopLevel)).toBe(true);

    const payloadOtherTab = {
      eventType: 'UPDATE',
      new: { id: 'wr-1', origin_tab_id: 'tab-other-456' },
    };
    expect(isSelfOriginatedPayload(payloadOtherTab)).toBe(false);

    const payloadNoOrigin = {
      eventType: 'UPDATE',
      new: { id: 'wr-1' },
    };
    expect(isSelfOriginatedPayload(payloadNoOrigin)).toBe(false);
  });
});
