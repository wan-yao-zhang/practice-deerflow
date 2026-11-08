/** Extra bindings not listed in wrangler.jsonc vars (secrets + local-only). */
interface Env {
  ADMIN_TOKEN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
}
