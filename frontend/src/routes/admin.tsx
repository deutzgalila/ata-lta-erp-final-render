import { Forbidden } from '@/components/common/Forbidden';
import { BlockingActionModal } from '@/features/operations/components/BlockingActionModal';
import { AdminTabs } from '@/features/admin/components/AdminTabs';
import { usePermission } from '@/lib/permissions';

export default function AdminPage() {
  const canManageUsers = usePermission('users:manage');

  if (!canManageUsers) {
    return <Forbidden requiredPermission="users:manage" />;
  }

  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto" data-testid="admin-page">
      <AdminTabs />
      <BlockingActionModal />
    </div>
  );
}
