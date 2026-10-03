/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ERP_API_BASE_URL?: string;
  readonly VITE_ERP_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
