/**
 * Snapshot drift alarm test for RBAC Permission Matrix.
 * Part of Parcel P0-H (Contract Freeze & Audit).
 * Proves that docs/api-contracts/rbac-matrix.md stays strictly in parity
 * with backend/src/lib/permissions.js via backend/scripts/print-permission-matrix.js.
 */

const fs = require('fs');
const path = require('path');
const { generateMatrixMarkdown } = require('../scripts/print-permission-matrix');

describe('P0-H: RBAC Permission Matrix Parity & Drift Alarm', () => {
  const docPath = path.resolve(__dirname, '../../docs/api-contracts/rbac-matrix.md');

  it('guarantees rbac-matrix.md table strictly equals generateMatrixMarkdown() output', () => {
    expect(fs.existsSync(docPath)).toBe(true);

    const docContent = fs.readFileSync(docPath, 'utf8');
    const startTag = '<!-- BEGIN GENERATED PERMISSION MATRIX -->\n';
    const endTag = '\n<!-- END GENERATED PERMISSION MATRIX -->';

    const startIndex = docContent.indexOf(startTag);
    const endIndex = docContent.indexOf(endTag);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);

    const docTable = docContent.substring(startIndex + startTag.length, endIndex) + '\n';
    const generatedTable = generateMatrixMarkdown();

    expect(docTable).toBe(generatedTable);
  });

  it('generates consistent, non-empty markdown table with header and rows', () => {
    const table = generateMatrixMarkdown();
    expect(table).toMatch(/^\| Permission Key \| Admin \| Management \| Accounting \| Operations \| Documentation \| HR \|/m);
    expect(table.split('\n').length).toBeGreaterThan(45);
  });
});
