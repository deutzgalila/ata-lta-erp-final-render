/**
 * CDC Tenant Resolver (Stage 5 Remediation, Parcel R2)
 *
 * Provides bidirectional mapping between tenant entity short codes ('ATA', 'LTA')
 * and Supabase PostgreSQL UUID identifiers.
 */

export const ENTITY_MAP: Record<string, string> = {
  ATA: 'e83dc90b-d9b5-4854-8adf-7fe21c2e6822',
  LTA: '16749820-0129-44a8-9435-a6013d07a370',
};

export const UUID_TO_CODE_MAP: Record<string, string> = {
  'e83dc90b-d9b5-4854-8adf-7fe21c2e6822': 'ATA',
  '16749820-0129-44a8-9435-a6013d07a370': 'LTA',
};

/**
 * Resolves an entity short code ('ATA', 'LTA') to its corresponding PostgreSQL UUID.
 * Returns undefined for 'ALL', null, undefined, empty strings, or unrecognized codes.
 * Case-insensitive and trims whitespace.
 */
export function resolveEntityUUID(code: string | null | undefined): string | undefined {
  if (!code || typeof code !== 'string') return undefined;
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized === 'ALL') return undefined;
  return ENTITY_MAP[normalized];
}

/**
 * Resolves a PostgreSQL UUID to its corresponding entity short code ('ATA', 'LTA').
 * Returns undefined for null, undefined, empty strings, or unrecognized UUIDs.
 * Case-insensitive and trims whitespace.
 */
export function resolveEntityCodeFromUUID(uuid: string | null | undefined): string | undefined {
  if (!uuid || typeof uuid !== 'string') return undefined;
  const normalized = uuid.trim().toLowerCase();
  if (!normalized) return undefined;
  return UUID_TO_CODE_MAP[normalized];
}

/**
 * Registers or overrides an entity code <-> UUID mapping at runtime.
 * Normalizes code to uppercase and UUID to lowercase.
 */
export function registerEntityMapping(code: string, uuid: string): void {
  if (!code || typeof code !== 'string' || !uuid || typeof uuid !== 'string') return;
  const normCode = code.trim().toUpperCase();
  const normUUID = uuid.trim().toLowerCase();
  if (!normCode || !normUUID) return;
  ENTITY_MAP[normCode] = normUUID;
  UUID_TO_CODE_MAP[normUUID] = normCode;
}

/**
 * Resets mappings to the standard defaults (used in testing).
 */
export function resetEntityMappingsForTesting(): void {
  for (const key of Object.keys(ENTITY_MAP)) {
    delete ENTITY_MAP[key];
  }
  for (const key of Object.keys(UUID_TO_CODE_MAP)) {
    delete UUID_TO_CODE_MAP[key];
  }

  ENTITY_MAP['ATA'] = 'e83dc90b-d9b5-4854-8adf-7fe21c2e6822';
  ENTITY_MAP['LTA'] = '16749820-0129-44a8-9435-a6013d07a370';
  UUID_TO_CODE_MAP['e83dc90b-d9b5-4854-8adf-7fe21c2e6822'] = 'ATA';
  UUID_TO_CODE_MAP['16749820-0129-44a8-9435-a6013d07a370'] = 'LTA';
}
