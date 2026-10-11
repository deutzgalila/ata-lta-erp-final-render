import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { profileKeys } from './queryKeys';
import type {
  UserProfileData,
  UpdateProfileInput,
  ChangePasswordInput,
  AvatarUploadUrlResponse,
} from './types';

export function useProfile() {
  return useQuery({
    queryKey: profileKeys.me(),
    queryFn: async () => {
      const res = await apiRequest<{ data: UserProfileData }>('/v1/me');
      return res.data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { setSession, user, permissions, activeEntity, unreadCount } = useSessionStore();

  return useMutation({
    mutationFn: async (payload: UpdateProfileInput) => {
      const res = await apiRequest<{ data: UserProfileData }>('/v1/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(profileKeys.me(), updatedProfile);
      void queryClient.invalidateQueries({ queryKey: profileKeys.me() });

      if (user) {
        setSession({
          user: {
            ...user,
            name: updatedProfile.name ?? user.name,
            avatarUrl: updatedProfile.avatarUrl !== undefined ? updatedProfile.avatarUrl : user.avatarUrl,
            preferences: (updatedProfile.preferences as Record<string, unknown>) ?? user.preferences,
          },
          permissions,
          activeEntity,
          unreadCount,
        });
      }
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordInput) => {
      await apiRequest<void>('/v1/me/password', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  const { setSession, user, permissions, activeEntity, unreadCount } = useSessionStore();

  return useMutation({
    mutationFn: async (file: File) => {
      // Step 1: Request signed upload URL from backend
      const presignedRes = await apiRequest<{ data: AvatarUploadUrlResponse }>(
        '/v1/me/avatar-upload-url',
        {
          method: 'POST',
        }
      );
      const { signedUrl, publicUrl } = presignedRes.data;

      // Step 2: Directly PUT binary payload to signed URL
      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error('Avatar binary upload failed');
      }

      // Step 3: Patch user profile with new publicUrl
      const patchRes = await apiRequest<{ data: UserProfileData }>('/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: publicUrl }),
      });

      return patchRes.data;
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(profileKeys.me(), updatedProfile);
      void queryClient.invalidateQueries({ queryKey: profileKeys.me() });

      if (user) {
        setSession({
          user: {
            ...user,
            avatarUrl: updatedProfile.avatarUrl !== undefined ? updatedProfile.avatarUrl : user.avatarUrl,
          },
          permissions,
          activeEntity,
          unreadCount,
        });
      }
    },
  });
}
