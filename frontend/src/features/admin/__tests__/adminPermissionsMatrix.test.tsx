import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionsMatrixView } from '../components/PermissionsMatrixView';
import { PERMISSION_KEYS, ADMIN_EXCLUSIVE_PERMISSIONS } from '../utils/permissionsMatrix';

describe('PermissionsMatrixView Component', () => {
  it('renders all 52 permission keys in the master table', () => {
    render(<PermissionsMatrixView />);

    expect(screen.getByTestId('master-permissions-table')).toBeInTheDocument();
    expect(screen.getByText(`Showing ${PERMISSION_KEYS.length} of ${PERMISSION_KEYS.length} keys`)).toBeInTheDocument();

    expect(screen.getByTestId('matrix-row-users:manage')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-row-retainers:edit')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-row-workflow:view')).toBeInTheDocument();
  });

  it('filters matrix rows via search input', () => {
    render(<PermissionsMatrixView />);

    const searchInput = screen.getByTestId('matrix-search-input');
    fireEvent.change(searchInput, { target: { value: 'retainers' } });

    expect(screen.getByTestId('matrix-row-retainers:edit')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-row-retainers:use')).toBeInTheDocument();
    expect(screen.queryByTestId('matrix-row-workflow:view')).not.toBeInTheDocument();
  });

  it('updates department union calculator dynamically when toggling departments', () => {
    render(<PermissionsMatrixView />);

    // Toggle off Operations and Documentation
    fireEvent.click(screen.getByTestId('calculator-toggle-Operations'));
    fireEvent.click(screen.getByTestId('calculator-toggle-Documentation'));

    // Select Management
    fireEvent.click(screen.getByTestId('calculator-toggle-Management'));

    // Check union has Management permissions
    expect(screen.getByTestId('union-granted-users:view')).toBeInTheDocument();
    expect(screen.getByTestId('union-granted-retainers:use')).toBeInTheDocument();

    // Verify that admin-exclusive keys are NOT granted in the union even if all departments are checked
    fireEvent.click(screen.getByTestId('calculator-toggle-Operations'));
    fireEvent.click(screen.getByTestId('calculator-toggle-Documentation'));
    fireEvent.click(screen.getByTestId('calculator-toggle-Accounting'));
    fireEvent.click(screen.getByTestId('calculator-toggle-HR'));

    // All 5 departments are now checked in the union calculator
    for (const adminKey of ADMIN_EXCLUSIVE_PERMISSIONS) {
      expect(screen.queryByTestId(`union-granted-${adminKey}`)).not.toBeInTheDocument();
    }
  });
});
