import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveEntityUUID,
  resolveEntityCodeFromUUID,
  registerEntityMapping,
  resetEntityMappingsForTesting,
  ENTITY_MAP,
  UUID_TO_CODE_MAP,
} from '../tenantResolver';

describe('CDC Tenant Resolver (Parcel R2)', () => {
  beforeEach(() => {
    resetEntityMappingsForTesting();
  });

  describe('Standard Entity Code to UUID Resolution (resolveEntityUUID)', () => {
    it('resolves ATA code to canonical Supabase UUID', () => {
      expect(resolveEntityUUID('ATA')).toBe('e83dc90b-d9b5-4854-8adf-7fe21c2e6822');
    });

    it('resolves LTA code to canonical Supabase UUID', () => {
      expect(resolveEntityUUID('LTA')).toBe('16749820-0129-44a8-9435-a6013d07a370');
    });

    it('handles case-insensitivity across code variations', () => {
      expect(resolveEntityUUID('ata')).toBe('e83dc90b-d9b5-4854-8adf-7fe21c2e6822');
      expect(resolveEntityUUID('lta')).toBe('16749820-0129-44a8-9435-a6013d07a370');
      expect(resolveEntityUUID('Ata')).toBe('e83dc90b-d9b5-4854-8adf-7fe21c2e6822');
      expect(resolveEntityUUID('Lta')).toBe('16749820-0129-44a8-9435-a6013d07a370');
    });

    it('trims leading and trailing whitespace', () => {
      expect(resolveEntityUUID('  ATA  ')).toBe('e83dc90b-d9b5-4854-8adf-7fe21c2e6822');
      expect(resolveEntityUUID(' \tLTA\n ')).toBe('16749820-0129-44a8-9435-a6013d07a370');
      expect(resolveEntityUUID('  ata  ')).toBe('e83dc90b-d9b5-4854-8adf-7fe21c2e6822');
    });

    it('returns undefined for ALL mode', () => {
      expect(resolveEntityUUID('ALL')).toBeUndefined();
      expect(resolveEntityUUID('all')).toBeUndefined();
      expect(resolveEntityUUID('  ALL  ')).toBeUndefined();
    });

    it('returns undefined for empty, null, undefined, or unrecognized codes', () => {
      expect(resolveEntityUUID(null)).toBeUndefined();
      expect(resolveEntityUUID(undefined)).toBeUndefined();
      expect(resolveEntityUUID('')).toBeUndefined();
      expect(resolveEntityUUID('   ')).toBeUndefined();
      expect(resolveEntityUUID('UNKNOWN')).toBeUndefined();
      expect(resolveEntityUUID('XYZ')).toBeUndefined();
    });
  });

  describe('Standard UUID to Entity Code Resolution (resolveEntityCodeFromUUID)', () => {
    it('resolves canonical ATA UUID to ATA entity code', () => {
      expect(resolveEntityCodeFromUUID('e83dc90b-d9b5-4854-8adf-7fe21c2e6822')).toBe('ATA');
    });

    it('resolves canonical LTA UUID to LTA entity code', () => {
      expect(resolveEntityCodeFromUUID('16749820-0129-44a8-9435-a6013d07a370')).toBe('LTA');
    });

    it('handles RFC 4122 case-insensitive UUID matching', () => {
      expect(resolveEntityCodeFromUUID('E83DC90B-D9B5-4854-8ADF-7FE21C2E6822')).toBe('ATA');
      expect(resolveEntityCodeFromUUID('16749820-0129-44A8-9435-A6013D07A370')).toBe('LTA');
      expect(resolveEntityCodeFromUUID('e83DC90b-D9b5-4854-8adf-7fe21C2e6822')).toBe('ATA');
    });

    it('trims leading and trailing whitespace from UUIDs', () => {
      expect(resolveEntityCodeFromUUID('  e83dc90b-d9b5-4854-8adf-7fe21c2e6822  ')).toBe('ATA');
      expect(resolveEntityCodeFromUUID(' \t16749820-0129-44a8-9435-a6013d07a370\n ')).toBe('LTA');
      expect(resolveEntityCodeFromUUID('  E83DC90B-D9B5-4854-8ADF-7FE21C2E6822  ')).toBe('ATA');
    });

    it('returns undefined for null, undefined, empty, or unrecognized UUIDs', () => {
      expect(resolveEntityCodeFromUUID(null)).toBeUndefined();
      expect(resolveEntityCodeFromUUID(undefined)).toBeUndefined();
      expect(resolveEntityCodeFromUUID('')).toBeUndefined();
      expect(resolveEntityCodeFromUUID('   ')).toBeUndefined();
      expect(resolveEntityCodeFromUUID('00000000-0000-0000-0000-000000000000')).toBeUndefined();
      expect(resolveEntityCodeFromUUID('non-uuid-string')).toBeUndefined();
    });
  });

  describe('Runtime Dynamic Registration (registerEntityMapping)', () => {
    it('registers new entity mappings dynamically', () => {
      const customCode = 'SUB';
      const customUUID = '22222222-3333-4444-5555-666666666666';

      registerEntityMapping(customCode, customUUID);

      expect(resolveEntityUUID('SUB')).toBe(customUUID);
      expect(resolveEntityUUID('sub')).toBe(customUUID);
      expect(resolveEntityUUID('  SUB  ')).toBe(customUUID);

      expect(resolveEntityCodeFromUUID(customUUID)).toBe('SUB');
      expect(resolveEntityCodeFromUUID(customUUID.toUpperCase())).toBe('SUB');
      expect(resolveEntityCodeFromUUID(`  ${customUUID}  `)).toBe('SUB');

      // Exported maps are updated
      expect(ENTITY_MAP['SUB']).toBe(customUUID);
      expect(UUID_TO_CODE_MAP[customUUID]).toBe('SUB');
    });

    it('ignores invalid code or UUID in registerEntityMapping', () => {
      registerEntityMapping('', 'some-uuid');
      registerEntityMapping('VALID', '');
      registerEntityMapping('   ', 'some-uuid');

      expect(resolveEntityUUID('VALID')).toBeUndefined();
    });

    it('overrides existing mappings when specified', () => {
      const overrideUUID = '99999999-9999-9999-9999-999999999999';
      registerEntityMapping('ATA', overrideUUID);

      expect(resolveEntityUUID('ATA')).toBe(overrideUUID);
      expect(resolveEntityCodeFromUUID(overrideUUID)).toBe('ATA');
    });

    it('cleanly resets to default mappings via resetEntityMappingsForTesting', () => {
      registerEntityMapping('TEMP', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(resolveEntityUUID('TEMP')).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

      resetEntityMappingsForTesting();

      expect(resolveEntityUUID('TEMP')).toBeUndefined();
      expect(resolveEntityUUID('ATA')).toBe('e83dc90b-d9b5-4854-8adf-7fe21c2e6822');
      expect(resolveEntityUUID('LTA')).toBe('16749820-0129-44a8-9435-a6013d07a370');
    });
  });
});
