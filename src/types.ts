export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string; // comma separated, or "*"
  ADMIN_TOKEN?: string;     // secret: enables /api/admin/*
  IP_SALT?: string;         // secret: salts the visitor hash used for rate limiting
}
