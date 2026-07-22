/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev-only flag: a local .env OPENAI_API_KEY exists on the server (value never exposed). */
  readonly VITE_DEV_HAS_KEY?: boolean;
}
