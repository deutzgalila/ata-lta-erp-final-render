#!/usr/bin/env node

/**
 * Print Permission Matrix Script
 * Renders the live role/department x permission key matrix from backend/src/lib/permissions.js.
 * Part of Parcel P0-H (Contract Freeze).
 */

const {
  DEPARTMENTS,
  DEPARTMENT_PERMISSIONS,
  buildPermissionSet,
  hasPermission,
} = require('../src/lib/permissions');

function generateMatrixMarkdown() {
  // Collect all unique keys present across all departments and Admin
  const adminSet = buildPermissionSet({ role: 'Admin', departments: [] });
  const allKeysSet = new Set(adminSet);
  Object.values(DEPARTMENT_PERMISSIONS).forEach((perms) => {
    perms.forEach((p) => allKeysSet.add(p));
  });

  const sortedKeys = Array.from(allKeysSet).sort();

  // Columns: Role / Depts
  const columns = [
    { label: 'Admin', getSet: () => buildPermissionSet({ role: 'Admin', departments: [] }) },
    { label: 'Management', getSet: () => buildPermissionSet({ role: 'Manager', departments: ['Management'] }) },
    { label: 'Accounting', getSet: () => buildPermissionSet({ role: 'Accounting', departments: ['Accounting'] }) },
    { label: 'Operations', getSet: () => buildPermissionSet({ role: 'Operations', departments: ['Operations'] }) },
    { label: 'Documentation', getSet: () => buildPermissionSet({ role: 'Documentation', departments: ['Documentation'] }) },
    { label: 'HR', getSet: () => buildPermissionSet({ role: 'HR', departments: ['HR'] }) },
  ];

  const colSets = columns.map((col) => ({ label: col.label, perms: col.getSet() }));

  let md = '';
  md += '| Permission Key | ' + colSets.map((c) => c.label).join(' | ') + ' |\n';
  md += '| :--- | ' + colSets.map(() => ':---:').join(' | ') + ' |\n';

  sortedKeys.forEach((key) => {
    const row = colSets.map((col) => (hasPermission(col.perms, key) ? '✅' : '❌'));
    md += `| \`${key}\` | ${row.join(' | ')} |\n`;
  });

  return md;
}

if (require.main === module) {
  process.stdout.write(generateMatrixMarkdown());
}

module.exports = { generateMatrixMarkdown };
