import { useProfile } from '@/features/profile/api/useProfile';
import { ProfileDetailsCard } from '@/features/profile/components/ProfileDetailsCard';
import { ProfilePasswordCard } from '@/features/profile/components/ProfilePasswordCard';
import { ProfilePreferencesCard } from '@/features/profile/components/ProfilePreferencesCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto" data-testid="profile-page">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account information and preferences.</p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          <ProfileDetailsCard profile={profile} isLoading={isLoading} />
          <ProfilePasswordCard isLoading={isLoading} />
          <ProfilePreferencesCard profile={profile} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}
