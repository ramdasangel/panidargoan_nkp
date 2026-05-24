import Redis from "ioredis";
import { config } from "./config.js";

let client: Redis | null = null;

if (config.redisUrl) {
  client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  client.connect().catch((e) => {
    console.warn(`[cache] Redis connect failed (${e.message}); continuing without cache`);
    client = null;
  });
  client.on("error", (e) => {
    if (!(e as NodeJS.ErrnoException).message.includes("ECONNREFUSED")) {
      console.warn("[cache] Redis error:", e.message);
    }
  });
}

export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  if (!client || client.status !== "ready") return compute();
  try {
    const hit = await client.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    return compute();
  }
  const value = await compute();
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // best-effort; ignore cache write failures
  }
  return value;
}

export async function invalidate(pattern: string): Promise<void> {
  if (!client || client.status !== "ready") return;
  try {
    const stream = client.scanStream({ match: pattern, count: 100 });
    const keys: string[] = [];
    for await (const batch of stream) {
      keys.push(...(batch as string[]));
    }
    if (keys.length) await client.del(...keys);
  } catch {
    // ignore
  }
}

export function cacheStatus(): { enabled: boolean; status: string } {
  return { enabled: Boolean(client), status: client?.status ?? "off" };
}

export async function disconnect(): Promise<void> {
  if (!client) return;
  try { await client.quit(); } catch { /* ignore */ }
  client = null;
}
