import { useProfile } from '@/features/profile/api/useProfile';
import { ProfileDetailsCard } from '@/features/profile/components/ProfileDetailsCard';
import { ProfilePasswordCard } from '@/features/profile/components/ProfilePasswordCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();

  return (
    <div className="w-full space-y-6" data-testid="profile-page">
      {/* 1. Blueprint Module Header */}
      <div className="border-b-2 border-[#0A0A0A] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="font-mono text-xs uppercase tracking-wider text-[#4A4945] flex items-center gap-1.5 pb-1"
          >
            <span>Account</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#0A0A0A] font-semibold">Profile</span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0A0A0A]">Profile</h1>
          <p className="text-xs sm:text-sm text-[#4A4945] pt-0.5">Manage your account information and security.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-none border border-[#0A0A0A]" />
          <Skeleton className="h-72 w-full rounded-none border border-[#0A0A0A]" />
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileDetailsCard profile={profile} isLoading={isLoading} />
          <ProfilePasswordCard isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}
