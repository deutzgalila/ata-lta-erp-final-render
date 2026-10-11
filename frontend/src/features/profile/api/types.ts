export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  defaultView?: 'table' | 'list' | 'board';
  defaultFormView?: 'side-peek' | 'center-peek' | 'full-page' | 'new-tab';
  [key: string]: unknown;
}

export interface UserProfileData {
  id: string;
  email: string;
  name: string;
  role: string;
  departments?: string[];
  entities?: string[];
  isActive?: boolean;
  avatarUrl?: string | null;
  preferences?: UserPreferences;
  activeEntity?: string;
  permissions?: string[];
  unread_notifications?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string | null;
  preferences?: UserPreferences;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AvatarUploadUrlResponse {
  signedUrl: string;
  publicUrl: string;
  path: string;
  maxSizeMb: number;
}
