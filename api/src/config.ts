import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Try api/.env first (local dev), then repo-root .env (shared compose vars).
// In Docker, no .env file exists — env vars come from the compose service.
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  authMode: (process.env.AUTH_MODE ?? "dummy") as "dummy" | "google" | "both",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  // First-time Google sign-in: any email that matches this CSV gets the admin role.
  // Everyone else starts as viewer. Set via env, e.g. ADMIN_EMAILS=foo@gmail.com,bar@gmail.com
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  minioEndpoint: process.env.MINIO_ENDPOINT ?? "",
  minioRegion: process.env.MINIO_REGION ?? "us-east-1",
  minioBucket: process.env.MINIO_BUCKET ?? "panidargoan",
  minioAccessKey: process.env.MINIO_ACCESS_KEY ?? "",
  minioSecretKey: process.env.MINIO_SECRET_KEY ?? "",
};
