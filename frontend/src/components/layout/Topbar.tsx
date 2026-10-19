import { useState, useEffect } from 'react';
import { LogOut, Building2, User, Menu, X } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProfile } from '@/features/profile/api/useProfile';
import { SidebarNavLinks } from './Sidebar';

export function Topbar() {
  const { user, activeEntity, setActiveEntity } = useSessionStore();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  const entities = user?.entities && user.entities.length > 0 ? user.entities : ['ATA', 'LTA'];
  const entityOptions = Array.from(new Set([...entities, 'ALL']));

  const avatarUrl = user?.avatarUrl || profile?.avatarUrl || null;
  const displayName = profile?.name || user?.name || 'User';

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatarUrl, avatarUrl]);

  const initials = displayName
    ? displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'U';

  const primaryEntity = user?.entities && user.entities.length > 0 ? user.entities[0]! : 'ATA';

  return (
    <header
      className="flex h-14 w-full items-center justify-between border-b-2 border-[#0A0A0A] bg-[#F4F4F0] px-4 sm:px-6 shadow-none select-none shrink-0"
      data-testid="app-topbar"
    >
      {/* Left: Mobile Menu Trigger + Entity Switcher */}
      <div className="flex items-center gap-3">
        {/* Mobile / Tablet Drawer Trigger */}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          aria-label="Open navigation menu"
          data-testid="mobile-menu-trigger"
          className="lg:hidden flex h-8 w-8 items-center justify-center border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#E4E2DC] transition-colors cursor-pointer"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Entity Switcher */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945]">
            <Building2 className="h-3.5 w-3.5 text-[#0A0A0A]" />
            <span>Scope:</span>
          </div>
          <div className="w-[110px] sm:w-[130px]">
            <Select
              value={activeEntity || primaryEntity}
              onValueChange={(val) => setActiveEntity(val)}
            >
              <SelectTrigger density="compact" data-testid="entity-switcher">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                {entityOptions.map((ent) => (
                  <SelectItem key={ent} value={ent} density="compact">
                    <span className="font-mono font-bold">{ent}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Right Actions: Notifications & User Menu */}
      <div className="flex items-center gap-3">
        {/* Notification Bell Panel */}
        <NotificationBellPanel />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] p-1 pr-2.5 hover:bg-[#E4E2DC] transition-colors cursor-pointer outline-none"
              data-testid="user-menu-button"
            >
              <div
                className="relative flex h-7 w-7 items-center justify-center rounded-none bg-[#0A0A0A] text-xs font-mono font-bold text-[#FAF9F5] overflow-hidden shrink-0"
                style={
                  avatarUrl && !avatarLoadFailed
                    ? {
                        backgroundImage: `url('${avatarUrl}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
                data-testid="topbar-user-avatar"
              >
                {(!avatarUrl || avatarLoadFailed) && initials}
                {avatarUrl && !avatarLoadFailed && (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="hidden"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                )}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-[#0A0A0A] leading-tight">
                  {user?.name || 'User'}
                </span>
                <span className="font-mono text-[11px] font-semibold uppercase text-[#4A4945] leading-tight">
                  {user?.role === 'Admin' || user?.email === 'lorein@ata-lta.ph' ? 'Admin' : (user?.role || 'Staff')}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-bold leading-none text-[#0A0A0A]">{user?.name}</p>
                <p className="font-mono text-[11px] leading-none text-[#4A4945]">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <div className="px-2 py-1">
              <Badge variant="secondary" className="text-xs">
                {user?.role === 'Admin' || user?.email === 'lorein@ata-lta.ph' ? 'Role: Admin' : `Role: ${user?.role}`}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate('/profile')}
              className="cursor-pointer text-[#0A0A0A] hover:bg-[#E4E2DC]"
              data-testid="my-profile-menu-item"
            >
              <User className="mr-2 h-4 w-4 text-[#0A0A0A]" />
              <span className="font-mono text-xs uppercase font-semibold">My Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-[#E61919] focus:text-[#E61919] focus:bg-[#FCE8E8]"
              data-testid="sign-out-button"
            >
              <LogOut className="mr-2 h-4 w-4 text-[#E61919]" />
              <span className="font-mono text-xs uppercase font-semibold">Sign out</span>
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
          className="flex h-8 w-8 items-center justify-center rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:text-[#FAF9F5] hover:bg-[#E61919] hover:border-[#E61919] transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {/* Mobile/Tablet Radix Dialog Navigation Drawer */}
      <Dialog open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
        <DialogContent className="fixed inset-y-0 left-0 top-0 z-50 h-full w-[260px] max-w-[85vw] translate-x-0 translate-y-0 p-0 border-r-2 border-[#0A0A0A] bg-[#EAE8E3] shadow-[4px_0px_0px_#0A0A0A] duration-200">
          <div className="flex h-14 items-center justify-between border-b-2 border-[#0A0A0A] px-4 bg-[#EAE8E3]">
            <DialogTitle className="flex items-center gap-2 text-xs font-black uppercase tracking-tight text-[#0A0A0A]">
              <div className="flex h-7 w-7 items-center justify-center rounded-none bg-[#0A0A0A] text-[#FAF9F5] font-black text-xs border border-[#0A0A0A]">
                ERP
              </div>
              <span>Navigation</span>
            </DialogTitle>
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close navigation"
              className="flex h-7 w-7 items-center justify-center border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#E4E2DC] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNavLinks onNavigate={() => setMobileDrawerOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
