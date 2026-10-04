import { LogOut, Building2 } from 'lucide-react';
import { useSessionStore } from '@/lib/session';
import { signOut } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { NotificationBellPanel } from '@/features/dashboard/components/NotificationBellPanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Topbar() {
  const { user, activeEntity, setActiveEntity } = useSessionStore();
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  const entities = user?.entities && user.entities.length > 0 ? user.entities : ['ATA', 'LTA'];
  const entityOptions = Array.from(new Set([...entities, 'ALL']));

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const primaryEntity = user?.entities && user.entities.length > 0 ? user.entities[0]! : 'ATA';

  return (
    <header
      className="flex h-16 w-full items-center justify-between border-b border-[#f0f0f5] bg-white px-6 shadow-[0_10px_40px_rgba(0,0,0,0.03)]"
      data-testid="app-topbar"
    >
      {/* Entity Switcher */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-[#9494a0]">
          <Building2 className="h-4 w-4 text-[#2563eb]" />
          <span>Active Entity:</span>
        </div>
        <div className="w-[120px]">
          <Select
            value={activeEntity || primaryEntity}
            onValueChange={(val) => setActiveEntity(val)}
          >
            <SelectTrigger density="compact" data-testid="entity-switcher">
              <SelectValue placeholder="Select Entity" />
            </SelectTrigger>
            <SelectContent>
              {entityOptions.map((ent) => (
                <SelectItem key={ent} value={ent} density="compact">
                  <span className="font-semibold">{ent}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right Actions: Notifications & User Menu */}
      <div className="flex items-center gap-4">
        {/* Notification Bell Panel (Spec §3.3 & §4.2) */}
        <NotificationBellPanel />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-[#f0f1f3] transition-colors cursor-pointer outline-none"
              data-testid="user-menu-button"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563eb] text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-[#1e293b] leading-tight">
                  {user?.name || 'User'}
                </span>
                <span className="text-[10px] text-[#9494a0] leading-tight">
                  {user?.role || 'Staff'}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-[#1e293b]">{user?.name}</p>
                <p className="text-xs leading-none text-[#9494a0]">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <div className="px-2 py-1">
              <Badge variant="secondary" className="text-[10px]">
                Role: {user?.role}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-[#ef4444] focus:text-[#ef4444] focus:bg-red-50"
              data-testid="sign-out-button"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick Sign Out Action */}
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
          data-testid="header-signout-btn"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9494a0] hover:text-[#ef4444] hover:bg-red-50 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
