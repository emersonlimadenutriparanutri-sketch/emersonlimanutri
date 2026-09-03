/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_TAGLINE?: string;
  readonly VITE_BRAND_LOGO?: string;
  readonly VITE_BRAND_SUPORTE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
