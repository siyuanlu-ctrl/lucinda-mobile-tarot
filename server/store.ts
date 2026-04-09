import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient, type RedisClientType } from 'redis';

export interface ShareTokenRecord {
  token: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  accessKey: string | null;
}

export interface AccessRecord {
  key: string;
  token: string;
  label: string;
  deviceId: string;
  userAgent: string;
  grantedAt: string;
  expiresAt: string;
}

export interface AccessLogRecord {
  id: string;
  event: string;
  token: string | null;
  key: string | null;
  label: string | null;
  deviceId: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: string;
  createdAt: string;
}

interface FileStoreShape {
  tokens: Record<string, ShareTokenRecord>;
  accesses: Record<string, AccessRecord>;
  logs: AccessLogRecord[];
}

type KvValue = ShareTokenRecord | AccessRecord | AccessLogRecord;

const defaultStore: FileStoreShape = {
  tokens: {},
  accesses: {},
  logs: [],
};

const localStoreFile = path.resolve(process.cwd(), 'server/data/token-store.json');
const accessLifetimeMinutes = Number(process.env.ACCESS_TTL_MINUTES ?? 10);

const upstash =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new UpstashRedis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

let redisClientPromise: Promise<RedisClientType | null> | null = null;

function isProductionRuntime(): boolean {
  return process.env.RENDER === 'true' || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
}

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) {
    return null;
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({
        url: process.env.REDIS_URL,
      });
      client.on('error', (error) => {
        console.error('Redis error:', error);
      });
      await client.connect();
      return client;
    })();
  }

  return redisClientPromise;
}

async function getStorageMode(): Promise<'redis' | 'upstash' | 'file'> {
  const redisClient = await getRedisClient();

  if (redisClient) {
    return 'redis';
  }

  if (upstash) {
    return 'upstash';
  }

  if (isProductionRuntime()) {
    throw new Error(
      'Production requires REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.',
    );
  }

  return 'file';
}

async function readFileStore(): Promise<FileStoreShape> {
  try {
    const raw = await readFile(localStoreFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FileStoreShape>;
    return {
      tokens: parsed.tokens ?? {},
      accesses: parsed.accesses ?? {},
      logs: parsed.logs ?? [],
    };
  } catch {
    await mkdir(path.dirname(localStoreFile), { recursive: true });
    await writeFile(localStoreFile, JSON.stringify(defaultStore, null, 2), 'utf8');
    return defaultStore;
  }
}

async function writeFileStore(data: FileStoreShape): Promise<void> {
  await mkdir(path.dirname(localStoreFile), { recursive: true });
  await writeFile(localStoreFile, JSON.stringify(data, null, 2), 'utf8');
}

async function setValue(key: string, value: KvValue): Promise<void> {
  const mode = await getStorageMode();

  if (mode === 'redis') {
    const client = await getRedisClient();
    await client!.set(key, JSON.stringify(value));
    return;
  }

  if (mode === 'upstash') {
    await upstash!.set(key, value);
    return;
  }
}

async function getValue<T>(key: string): Promise<T | null> {
  const mode = await getStorageMode();

  if (mode === 'redis') {
    const client = await getRedisClient();
    const raw = await client!.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  if (mode === 'upstash') {
    return ((await upstash!.get(key)) as T | null) ?? null;
  }

  return null;
}

export async function createShareToken(label: string, expiresInHours: number): Promise<ShareTokenRecord> {
  const token = randomUUID().replace(/-/g, '');
  const now = new Date();
  const record: ShareTokenRecord = {
    token,
    label,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
    usedAt: null,
    accessKey: null,
  };

  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    store.tokens[token] = record;
    await writeFileStore(store);
    return record;
  }

  await setValue(`share:token:${token}`, record);
  return record;
}

export async function getShareToken(token: string): Promise<ShareTokenRecord | null> {
  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    return store.tokens[token] ?? null;
  }

  return await getValue<ShareTokenRecord>(`share:token:${token}`);
}

export async function saveShareToken(record: ShareTokenRecord): Promise<void> {
  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    store.tokens[record.token] = record;
    await writeFileStore(store);
    return;
  }

  await setValue(`share:token:${record.token}`, record);
}

export async function createAccessRecord(
  token: string,
  label: string,
  deviceId: string,
  userAgent: string,
): Promise<AccessRecord> {
  const now = new Date();
  const record: AccessRecord = {
    key: randomUUID().replace(/-/g, ''),
    token,
    label,
    deviceId,
    userAgent,
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + accessLifetimeMinutes * 60 * 1000).toISOString(),
  };

  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    store.accesses[record.key] = record;
    await writeFileStore(store);
    return record;
  }

  await setValue(`share:access:${record.key}`, record);
  return record;
}

export async function getAccessRecord(key: string): Promise<AccessRecord | null> {
  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    return store.accesses[key] ?? null;
  }

  return await getValue<AccessRecord>(`share:access:${key}`);
}

export async function appendAccessLog(
  entry: Omit<AccessLogRecord, 'id' | 'createdAt'>,
): Promise<AccessLogRecord> {
  const record: AccessLogRecord = {
    id: randomUUID().replace(/-/g, ''),
    createdAt: new Date().toISOString(),
    ...entry,
  };

  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    store.logs.unshift(record);
    store.logs = store.logs.slice(0, 200);
    await writeFileStore(store);
    return record;
  }

  if (mode === 'redis') {
    const client = await getRedisClient();
    await client!.lPush('share:logs', JSON.stringify(record));
    await client!.lTrim('share:logs', 0, 199);
    return record;
  }

  await upstash!.lpush('share:logs', record);
  await upstash!.ltrim('share:logs', 0, 199);
  return record;
}

export async function listAccessLogs(limit = 20): Promise<AccessLogRecord[]> {
  const mode = await getStorageMode();

  if (mode === 'file') {
    const store = await readFileStore();
    return store.logs.slice(0, limit);
  }

  if (mode === 'redis') {
    const client = await getRedisClient();
    const rows = await client!.lRange('share:logs', 0, Math.max(0, limit - 1));
    return rows.map((item) => JSON.parse(item) as AccessLogRecord);
  }

  return (await upstash!.lrange<AccessLogRecord>('share:logs', 0, Math.max(0, limit - 1))) ?? [];
}
