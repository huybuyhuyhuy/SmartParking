import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null
});

// Avoid noisy logs when Redis is down.
let lastRedisErrAt = 0;
redis.on("error", (err) => {
  const now = Date.now();
  if (now - lastRedisErrAt > 5000) {
    lastRedisErrAt = now;
    console.error("[redis] connection error:", err?.message || err);
  }
});

const mem = new Map();

async function tryRedis(fn, fallback) {
  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    return await fn();
  } catch (_e) {
    return fallback();
  }
}

export async function cacheGet(key) {
  return tryRedis(() => redis.get(key), () => mem.get(key) ?? null);
}

export async function cacheSet(key, value) {
  return tryRedis(() => redis.set(key, value), () => {
    mem.set(key, value);
    return "OK";
  });
}

export async function cacheSetEx(key, ttlSeconds, value) {
  return tryRedis(() => redis.setex(key, ttlSeconds, value), () => {
    mem.set(key, value);
    setTimeout(() => mem.delete(key), Math.max(0, ttlSeconds) * 1000).unref?.();
    return "OK";
  });
}

export async function cacheSetNxEx(key, ttlSeconds, value) {
  return tryRedis(
    async () => {
      const result = await redis.set(key, value, "EX", Math.max(1, ttlSeconds), "NX");
      return result === "OK";
    },
    () => {
      if (mem.has(key)) return false;
      mem.set(key, value);
      setTimeout(() => mem.delete(key), Math.max(0, ttlSeconds) * 1000).unref?.();
      return true;
    }
  );
}
