/**
 * Feature Flags for Enterprise Migration (Spec R5).
 * Module implementations land in Phase 2.
 * Unfinished modules remain disabled and render clean placeholders.
 */

export const ENABLED_MODULES = [
  'Operations',
  'Dashboard',
  'Billing',
  'Disbursements',
  'Transmittals',
  'Admin',
  'Reports',
  'Documents',
  'Clients',
] as const;

export type EnabledModule = (typeof ENABLED_MODULES)[number];

export function isModuleEnabled(moduleName: string): boolean {
  return (ENABLED_MODULES as readonly string[]).includes(moduleName);
}

/**
 * Concurrency & Real-Time Sync Feature Flags (Spec §2.1, Parcel A).
 * Three-tier safety net runtime checks with localStorage instant override.
 */
export type FeatureFlag = 'realtime_sync' | 'tab_sync' | 'strict_occ';

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const override = localStorage.getItem(`erp_feature_override_${flag}`);
      if (override !== null && override !== undefined) {
        const normalized = override.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }
    } catch {
      // In case localStorage access is restricted
    }
  }

  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (flag === 'realtime_sync') {
      const val = import.meta.env.VITE_ENABLE_REALTIME_SYNC;
      if (typeof val === 'boolean') return val;
      return String(val ?? '').trim().toLowerCase() !== 'false';
    }
    if (flag === 'tab_sync') {
      const val = import.meta.env.VITE_ENABLE_TAB_SYNC;
      if (typeof val === 'boolean') return val;
      return String(val ?? '').trim().toLowerCase() !== 'false';
    }
    if (flag === 'strict_occ') {
      const val = import.meta.env.VITE_ENABLE_STRICT_OCC;
      if (typeof val === 'boolean') return val;
      return String(val ?? '').trim().toLowerCase() !== 'false';
    }
  }

  return true;
}

