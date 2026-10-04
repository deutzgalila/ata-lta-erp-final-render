import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUserMutations } from '../api/useUsers';
import { useSessionStore } from '@/lib/session';
import type { AdminUser } from '../api/types';

export interface UserDisableModalProps {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function UserDisableModal({
  user,
  isOpen,
  onClose,
  onSuccess,
}: UserDisableModalProps) {
  const currentUser = useSessionStore((state) => state.user);
  const { disableUser } = useUserMutations();

  const isSelf = user?.id === currentUser?.id;

  const handleConfirm = async () => {
    if (!user || isSelf) return;

    try {
      await disableUser(user.id, user.name);
      if (onSuccess) onSuccess();
      onClose();
    } catch {
      // Errors handled verbatim by runBlockingAction
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6" data-testid="user-disable-modal">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Disable User Account
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-0.5">
                Confirmation required before deactivating access.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isSelf ? (
          <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
            <strong>Self-Action Blocked:</strong> You cannot disable your own active administrator account ({user?.email}). Another administrator must make this change.
          </div>
        ) : (
          <div className="space-y-3 py-2 text-xs text-slate-600">
            <p>
              Are you sure you want to deactivate account access for{' '}
              <strong className="text-slate-900">{user?.name}</strong> (
              <span className="font-mono text-slate-700">{user?.email}</span>)?
            </p>
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800 space-y-1">
              <p className="font-semibold">Consequences of soft-disabling:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>User session tokens will be evicted immediately.</li>
                <li>User will be barred from authenticating to the platform.</li>
                <li>Historic tasks, time entries, and audit logs remain intact.</li>
                <li>Account can be re-enabled later by an administrator.</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs h-9"
            data-testid="disable-user-cancel-btn"
          >
            Cancel
          </Button>
          {!isSelf && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              className="text-xs h-9 bg-rose-600 text-white hover:bg-rose-700"
              data-testid="disable-user-confirm-btn"
            >
              Disable Account
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
