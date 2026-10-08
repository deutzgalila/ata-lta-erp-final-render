/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ERP_API_BASE_URL?: string;
  readonly VITE_ERP_API_BASE_URL?: string;
  readonly VITE_ENABLE_REALTIME_SYNC?: string;
  readonly VITE_ENABLE_TAB_SYNC?: string;
  readonly VITE_ENABLE_STRICT_OCC?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
