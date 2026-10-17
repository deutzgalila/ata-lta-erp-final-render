import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserListTable } from '../components/UserListTable';
import { UserCreateModal } from '../components/UserCreateModal';
import { UserEditModal } from '../components/UserEditModal';
import { UserDisableModal } from '../components/UserDisableModal';
import { UserDetailModal } from '../components/UserDetailModal';
import { GuardedPasswordInput } from '../components/GuardedPasswordInput';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import { useSessionStore } from '@/lib/session';
import type { AdminUser } from '../api/types';

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

const mockUsers: AdminUser[] = [
  {
    id: 'user-admin',
    name: 'Admin Developer',
    email: 'dev-admin@ata-lta.ph',
    role: 'Admin',
    departments: ['Management', 'Accounting', 'Operations', 'Documentation', 'HR'],
    entities: ['ATA', 'LTA'],
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-docs',
    name: 'Doc Specialist',
    email: 'dev-docs@ata-lta.ph',
    role: 'Documentation',
    departments: ['Documentation', 'Management'],
    entities: ['ATA', 'LTA'],
    isActive: true,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'user-disabled',
    name: 'Old Staff',
    email: 'old-staff@ata-lta.ph',
    role: 'Accounting',
    departments: ['Accounting'],
    entities: ['ATA'],
    isActive: false,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
];

describe('Admin User Management Components (Parity & Security)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'dev-admin@ata-lta.ph',
        name: 'Admin Developer',
        role: 'Admin',
        departments: ['Management', 'Accounting', 'Operations', 'Documentation', 'HR'],
        entities: ['ATA', 'LTA'],
      },
      permissions: ['users:view', 'users:manage', 'retainers:use', 'retainers:edit'],
      activeEntity: 'ALL',
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/users')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: mockUsers }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    useBlockingModalStore.getState().reset();
  });

  describe('UserListTable', () => {
    it('renders user list with avatars, names, roles, departments, entities, and status pills', async () => {
      const { wrapper } = createHarness();
      render(
        <UserListTable
          onAddUser={vi.fn()}
          onEditUser={vi.fn()}
          onDisableUser={vi.fn()}
          onViewDetails={vi.fn()}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-row-user-admin')).toBeInTheDocument();
        expect(screen.getByTestId('user-row-user-docs')).toBeInTheDocument();
        expect(screen.getByTestId('user-row-user-disabled')).toBeInTheDocument();
      });

      expect(screen.getByText('Admin Developer')).toBeInTheDocument();
      expect(screen.getByText('Doc Specialist')).toBeInTheDocument();
      expect(screen.getByTestId('user-status-user-admin')).toHaveTextContent('Active');
      expect(screen.getByTestId('user-status-user-disabled')).toHaveTextContent('Disabled');
    });

    it('filters users by search query (name and email)', async () => {
      const { wrapper } = createHarness();
      render(
        <UserListTable
          onAddUser={vi.fn()}
          onEditUser={vi.fn()}
          onDisableUser={vi.fn()}
          onViewDetails={vi.fn()}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-row-user-admin')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('user-search-input');
      fireEvent.change(searchInput, { target: { value: 'Specialist' } });

      expect(screen.queryByTestId('user-row-user-admin')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-row-user-docs')).toBeInTheDocument();

      // Search by email
      fireEvent.change(searchInput, { target: { value: 'dev-admin@ata-lta.ph' } });
      expect(screen.getByTestId('user-row-user-admin')).toBeInTheDocument();
      expect(screen.queryByTestId('user-row-user-docs')).not.toBeInTheDocument();
    });

    it('enforces self-disable protection on active admin row', async () => {
      const { wrapper } = createHarness();
      render(
        <UserListTable
          onAddUser={vi.fn()}
          onEditUser={vi.fn()}
          onDisableUser={vi.fn()}
          onViewDetails={vi.fn()}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-row-user-admin')).toBeInTheDocument();
      });

      // For logged in user ('user-admin'), the disable button is disabled
      const selfDisableBtn = screen.getByTestId('user-disable-btn-user-admin');
      expect(selfDisableBtn).toBeDisabled();
      expect(selfDisableBtn).toHaveAttribute('title', 'Cannot disable your own account');

      // For another user ('user-docs'), the disable button is enabled
      const otherDisableBtn = screen.getByTestId('user-disable-btn-user-docs');
      expect(otherDisableBtn).not.toBeDisabled();
    });

    it('displays active user cap banner when active accounts reach 15', async () => {
      // Mock 15 active users
      const fifteenUsers: AdminUser[] = Array.from({ length: 15 }, (_, i) => ({
        id: `u-${i}`,
        name: `User ${i}`,
        email: `user${i}@ata-lta.ph`,
        role: 'Operations',
        departments: ['Operations'],
        entities: ['ATA'],
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: fifteenUsers }),
      } as Response);

      const { wrapper } = createHarness();
      render(
        <UserListTable
          onAddUser={vi.fn()}
          onEditUser={vi.fn()}
          onDisableUser={vi.fn()}
          onViewDetails={vi.fn()}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-cap-banner')).toBeInTheDocument();
      });

      expect(screen.getByTestId('user-cap-banner')).toHaveTextContent('User Account Cap Alert');
      expect(screen.getByTestId('user-cap-banner')).toHaveTextContent('15 active user accounts');
    });

    it('triggers callback when clicking + Add User', async () => {
      const onAddUserMock = vi.fn();
      const { wrapper } = createHarness();
      render(
        <UserListTable
          onAddUser={onAddUserMock}
          onEditUser={vi.fn()}
          onDisableUser={vi.fn()}
          onViewDetails={vi.fn()}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('add-user-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('add-user-button'));
      expect(onAddUserMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('GuardedPasswordInput', () => {
    it('evaluates criteria checklist in real time as password changes', () => {
      const onChangeMock = vi.fn();
      const { rerender } = render(
        <GuardedPasswordInput value="" onChange={onChangeMock} />
      );

      // Check all initial criteria are unmet
      expect(screen.getByTestId('guarded-password-criterion-length')).toHaveAttribute(
        'data-status',
        'unmet'
      );
      expect(screen.getByTestId('guarded-password-strength-label')).toHaveTextContent('None');

      // Rerender with weak password
      rerender(<GuardedPasswordInput value="weak" onChange={onChangeMock} />);
      expect(screen.getByTestId('guarded-password-strength-label')).toHaveTextContent('Weak');
      expect(screen.getByTestId('guarded-password-criterion-lower')).toHaveAttribute(
        'data-status',
        'met'
      );

      // Rerender with fully compliant password
      rerender(<GuardedPasswordInput value="StrongP@ssw0rd!" onChange={onChangeMock} />);
      expect(screen.getByTestId('guarded-password-strength-label')).toHaveTextContent('Strong');
      expect(screen.getByTestId('guarded-password-criterion-length')).toHaveAttribute(
        'data-status',
        'met'
      );
      expect(screen.getByTestId('guarded-password-criterion-upper')).toHaveAttribute(
        'data-status',
        'met'
      );
      expect(screen.getByTestId('guarded-password-criterion-number')).toHaveAttribute(
        'data-status',
        'met'
      );
      expect(screen.getByTestId('guarded-password-criterion-special')).toHaveAttribute(
        'data-status',
        'met'
      );
    });

    it('generates random password and invokes onChange when clicking Generate button', async () => {
      const onChangeMock = vi.fn();
      render(<GuardedPasswordInput value="" onChange={onChangeMock} />);

      const generateBtn = screen.getByTestId('guarded-password-generate');
      fireEvent.click(generateBtn);

      expect(onChangeMock).toHaveBeenCalledTimes(1);
      const generated = onChangeMock.mock.calls[0]![0] as string;
      expect(generated.length).toBe(16);
    });

    it('toggles password visibility between text and password types', () => {
      render(<GuardedPasswordInput value="SecretPass123!" onChange={vi.fn()} />);

      const input = screen.getByTestId('guarded-password-input');
      const toggle = screen.getByTestId('guarded-password-toggle');

      expect(input).toHaveAttribute('type', 'password');
      fireEvent.click(toggle);
      expect(input).toHaveAttribute('type', 'text');
      fireEvent.click(toggle);
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  describe('UserCreateModal', () => {
    it('submits valid new user data and closes on success', async () => {
      const onCloseMock = vi.fn();
      const onSuccessMock = vi.fn();
      const { wrapper } = createHarness();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'new-u-1',
            name: 'Carlos Yulo',
            email: 'carlos@ata-lta.ph',
            role: 'Operations',
            departments: ['Operations'],
            entities: ['ATA'],
            isActive: true,
          },
        }),
      } as Response);

      render(
        <UserCreateModal
          isOpen={true}
          onClose={onCloseMock}
          onSuccess={onSuccessMock}
        />,
        { wrapper }
      );

      fireEvent.change(screen.getByTestId('create-user-name-input'), {
        target: { value: 'Carlos Yulo' },
      });
      fireEvent.change(screen.getByTestId('create-user-email-input'), {
        target: { value: 'carlos@ata-lta.ph' },
      });
      fireEvent.change(screen.getByTestId('guarded-password-input'), {
        target: { value: 'GoldMedal2024!' },
      });

      fireEvent.click(screen.getByTestId('create-user-submit-btn'));

      await waitFor(() => {
        expect(onSuccessMock).toHaveBeenCalledTimes(1);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('UserEditModal', () => {
    it('pre-populates user data and protects admin from self-deactivation', async () => {
      const { wrapper } = createHarness();
      render(
        <UserEditModal
          user={mockUsers[0]!} // Admin self-account
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      expect(screen.getByTestId('edit-user-name-input')).toHaveValue('Admin Developer');
      expect(screen.getByTestId('edit-user-email-input')).toHaveValue('dev-admin@ata-lta.ph');

      // Self-deactivation checkbox is disabled
      const activeCheckbox = screen.getByTestId('edit-user-active-checkbox');
      expect(activeCheckbox).toBeDisabled();
      expect(screen.getByText(/Cannot deactivate self/)).toBeInTheDocument();
    });
  });

  describe('UserDisableModal', () => {
    it('blocks self-disable action with clear warning', () => {
      const { wrapper } = createHarness();
      render(
        <UserDisableModal
          user={mockUsers[0]!} // Admin self-account
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Self-Action Blocked/)).toBeInTheDocument();
      expect(screen.queryByTestId('disable-user-confirm-btn')).not.toBeInTheDocument();
    });

    it('enables confirm button for other users and invokes disable on click', async () => {
      const onCloseMock = vi.fn();
      const onSuccessMock = vi.fn();
      const { wrapper } = createHarness();

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as Response);

      render(
        <UserDisableModal
          user={mockUsers[1]!} // Other user
          isOpen={true}
          onClose={onCloseMock}
          onSuccess={onSuccessMock}
        />,
        { wrapper }
      );

      expect(screen.getByTestId('disable-user-confirm-btn')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('disable-user-confirm-btn'));

      await waitFor(() => {
        expect(onSuccessMock).toHaveBeenCalledTimes(1);
        expect(onCloseMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('UserDetailModal', () => {
    it('renders profile and effective permissions inspector with all 52 keys', () => {
      render(
        <UserDetailModal
          user={mockUsers[0]!} // Admin
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText('Effective Permissions Inspector')).toBeInTheDocument();
      expect(screen.getByText('52 / 52 granted')).toBeInTheDocument();
      expect(screen.getByTestId('user-perm-users:manage')).toHaveAttribute(
        'data-granted',
        'true'
      );
      expect(screen.getByTestId('user-perm-retainers:edit')).toHaveAttribute(
        'data-granted',
        'true'
      );
    });
  });
});
