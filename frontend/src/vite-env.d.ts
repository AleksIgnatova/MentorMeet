/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the MentorMeet API, e.g. http://localhost:3000/api. Public (in the bundle). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
