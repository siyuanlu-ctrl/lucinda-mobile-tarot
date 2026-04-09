import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { tarotDecks } from '../src/data/decks';
import {
  appendAccessLog,
  createAccessRecord,
  createShareToken,
  getAccessRecord,
  getShareToken,
  listAccessLogs,
  saveShareToken,
  type AccessRecord,
} from './store';

const app = express();

app.use(cors());
app.use(express.json());

function getAdminKey(): string {
  return process.env.SHARE_ADMIN_KEY ?? 'lucinda-change-me';
}

function getPublicAppUrl(request: express.Request): string {
  return process.env.PUBLIC_APP_URL ?? `${request.protocol}://${request.get('host')}`;
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

function getClientIp(request: express.Request): string | null {
  return request.ip ?? request.socket.remoteAddress ?? null;
}

function getUserAgent(request: express.Request): string {
  return request.header('user-agent') ?? '';
}

function isWechatUserAgent(request: express.Request): boolean {
  return /micromessenger/i.test(getUserAgent(request));
}

function getDeviceId(request: express.Request): string {
  const headerValue = request.header('x-device-id');
  const queryValue = typeof request.query.deviceId === 'string' ? request.query.deviceId : '';
  return (headerValue ?? queryValue ?? '').trim();
}

function buildWatermarkText(label: string, deviceId: string): string {
  return `Lucinda · ${label} · ${deviceId.slice(-6)}`;
}

async function logEvent(
  request: express.Request,
  event: string,
  detail: string,
  extra?: Partial<{
    token: string | null;
    key: string | null;
    label: string | null;
    deviceId: string | null;
  }>,
): Promise<void> {
  await appendAccessLog({
    event,
    token: extra?.token ?? null,
    key: extra?.key ?? null,
    label: extra?.label ?? null,
    deviceId: extra?.deviceId ?? null,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    detail,
  });
}

async function rejectWithLog(
  request: express.Request,
  response: express.Response,
  statusCode: number,
  message: string,
  event: string,
  extra?: Partial<{
    token: string | null;
    key: string | null;
    label: string | null;
    deviceId: string | null;
  }>,
): Promise<null> {
  await logEvent(request, event, message, extra);
  response.status(statusCode).json({
    ok: false,
    message,
  });
  return null;
}

async function requireValidAccessRecord(
  request: express.Request,
  response: express.Response,
): Promise<AccessRecord | null> {
  const key = typeof request.query.key === 'string' ? request.query.key.trim() : '';
  const deviceId = getDeviceId(request);

  if (!isWechatUserAgent(request)) {
    return rejectWithLog(
      request,
      response,
      403,
      '仅允许在微信内打开此页面。',
      'reject_non_wechat',
      {
        key: key || null,
        deviceId: deviceId || null,
      },
    );
  }

  if (!key) {
    return rejectWithLog(request, response, 401, '缺少访问 key。', 'reject_missing_key', {
      deviceId: deviceId || null,
    });
  }

  if (!deviceId) {
    return rejectWithLog(request, response, 401, '缺少设备标识。', 'reject_missing_device', {
      key,
    });
  }

  const accessRecord = await getAccessRecord(key);

  if (!accessRecord || isExpired(accessRecord.expiresAt)) {
    return rejectWithLog(
      request,
      response,
      401,
      '当前访问许可已失效。',
      'reject_expired_key',
      {
        key,
        deviceId,
      },
    );
  }

  if (accessRecord.deviceId !== deviceId) {
    return rejectWithLog(
      request,
      response,
      403,
      '当前链接已绑定其他设备，不能在新设备上继续访问。',
      'reject_device_mismatch',
      {
        key,
        token: accessRecord.token,
        label: accessRecord.label,
        deviceId,
      },
    );
  }

  return accessRecord;
}

function buildProtectedImageUrl(
  request: express.Request,
  key: string,
  deviceId: string,
  src: string,
): string {
  const base = getPublicAppUrl(request);
  return `${base}/api/content/image?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(deviceId)}&src=${encodeURIComponent(src)}`;
}

function getMimeType(target: string): string {
  const extension = path.extname(target).toLowerCase();

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/admin/logs', async (request, response) => {
  const headerAdminKey = request.header('x-admin-key');

  if (!headerAdminKey || headerAdminKey !== getAdminKey()) {
    response.status(401).json({
      ok: false,
      message: '管理员口令无效。',
    });
    return;
  }

  response.json({
    ok: true,
    logs: await listAccessLogs(30),
  });
});

app.post('/api/admin/links', async (request, response) => {
  const headerAdminKey = request.header('x-admin-key');

  if (!headerAdminKey || headerAdminKey !== getAdminKey()) {
    response.status(401).json({
      ok: false,
      message: '管理员口令无效。',
    });
    return;
  }

  const label =
    typeof request.body?.label === 'string' && request.body.label.trim()
      ? request.body.label.trim()
      : '微信分享';
  const expiresInHours = Math.max(1, Math.min(24, Number(request.body?.expiresInHours ?? 1) || 1));
  const record = await createShareToken(label, expiresInHours);

  await logEvent(request, 'token_created', '管理员生成了一次性分享链接。', {
    token: record.token,
    label,
  });

  response.json({
    ok: true,
    shareUrl: `${getPublicAppUrl(request)}/?token=${record.token}`,
    token: record.token,
    expiresAt: record.expiresAt,
  });
});

app.post('/api/access/consume', async (request, response) => {
  const token = typeof request.body?.token === 'string' ? request.body.token.trim() : '';
  const deviceId = typeof request.body?.deviceId === 'string' ? request.body.deviceId.trim() : '';

  if (!token) {
    await rejectWithLog(request, response, 400, '缺少分享 token。', 'reject_missing_token');
    return;
  }

  if (!isWechatUserAgent(request)) {
    await rejectWithLog(
      request,
      response,
      403,
      '仅允许在微信内打开此链接。',
      'reject_non_wechat_consume',
      {
        token,
        deviceId: deviceId || null,
      },
    );
    return;
  }

  if (!deviceId) {
    await rejectWithLog(
      request,
      response,
      400,
      '缺少设备标识，无法绑定当前设备。',
      'reject_missing_device_consume',
      {
        token,
      },
    );
    return;
  }

  const tokenRecord = await getShareToken(token);

  if (!tokenRecord) {
    await rejectWithLog(request, response, 404, '分享链接不存在。', 'reject_missing_token_record', {
      token,
      deviceId,
    });
    return;
  }

  if (tokenRecord.usedAt) {
    await rejectWithLog(
      request,
      response,
      410,
      '这个分享链接已经被使用过，需要重新生成。',
      'reject_reused_token',
      {
        token,
        key: tokenRecord.accessKey,
        label: tokenRecord.label,
        deviceId,
      },
    );
    return;
  }

  if (isExpired(tokenRecord.expiresAt)) {
    await rejectWithLog(request, response, 410, '这个分享链接已经过期。', 'reject_expired_token', {
      token,
      label: tokenRecord.label,
      deviceId,
    });
    return;
  }

  const accessRecord = await createAccessRecord(
    token,
    tokenRecord.label,
    deviceId,
    getUserAgent(request),
  );
  tokenRecord.usedAt = new Date().toISOString();
  tokenRecord.accessKey = accessRecord.key;
  await saveShareToken(tokenRecord);

  await logEvent(request, 'token_consumed', '一次性链接已核销并绑定当前设备。', {
    token,
    key: accessRecord.key,
    label: tokenRecord.label,
    deviceId,
  });

  response.json({
    ok: true,
    accessKey: accessRecord.key,
    expiresAt: accessRecord.expiresAt,
    watermarkText: buildWatermarkText(tokenRecord.label, deviceId),
  });
});

app.get('/api/access/verify', async (request, response) => {
  const accessRecord = await requireValidAccessRecord(request, response);

  if (!accessRecord) {
    return;
  }

  await logEvent(request, 'access_verified', '访问许可校验通过。', {
    token: accessRecord.token,
    key: accessRecord.key,
    label: accessRecord.label,
    deviceId: accessRecord.deviceId,
  });

  response.json({
    ok: true,
    expiresAt: accessRecord.expiresAt,
    watermarkText: buildWatermarkText(accessRecord.label, accessRecord.deviceId),
  });
});

app.get('/api/content/decks', async (request, response) => {
  const accessRecord = await requireValidAccessRecord(request, response);

  if (!accessRecord) {
    return;
  }

  const decks = tarotDecks.map((deck) => ({
    ...deck,
    backImage: deck.backImage
      ? buildProtectedImageUrl(request, accessRecord.key, accessRecord.deviceId, deck.backImage)
      : '',
    cards: deck.cards.map((card) => ({
      ...card,
      image: card.image
        ? buildProtectedImageUrl(request, accessRecord.key, accessRecord.deviceId, card.image)
        : '',
    })),
  }));

  await logEvent(request, 'content_loaded', '已返回受保护牌组内容。', {
    token: accessRecord.token,
    key: accessRecord.key,
    label: accessRecord.label,
    deviceId: accessRecord.deviceId,
  });

  response.json({
    ok: true,
    decks,
    watermarkText: buildWatermarkText(accessRecord.label, accessRecord.deviceId),
  });
});

app.get('/api/content/image', async (request, response) => {
  const accessRecord = await requireValidAccessRecord(request, response);

  if (!accessRecord) {
    return;
  }

  const target = typeof request.query.src === 'string' ? request.query.src.trim() : '';

  if (!target) {
    await rejectWithLog(request, response, 400, '缺少图片地址。', 'reject_missing_image_src', {
      token: accessRecord.token,
      key: accessRecord.key,
      label: accessRecord.label,
      deviceId: accessRecord.deviceId,
    });
    return;
  }

  try {
    if (target.startsWith('http://') || target.startsWith('https://')) {
      const upstream = await fetch(target);

      if (!upstream.ok) {
        await rejectWithLog(request, response, 502, '远程图片获取失败。', 'reject_remote_image', {
          token: accessRecord.token,
          key: accessRecord.key,
          label: accessRecord.label,
          deviceId: accessRecord.deviceId,
        });
        return;
      }

      response.setHeader('Content-Type', upstream.headers.get('content-type') ?? getMimeType(target));
      response.setHeader('Cache-Control', 'private, no-store');
      response.send(Buffer.from(await upstream.arrayBuffer()));
      return;
    }

    if (target.startsWith('/assets/')) {
      const assetPath = path.resolve(process.cwd(), 'public', `.${target}`);
      const file = await readFile(assetPath);

      response.setHeader('Content-Type', getMimeType(assetPath));
      response.setHeader('Cache-Control', 'private, no-store');
      response.send(file);
      return;
    }

    await rejectWithLog(request, response, 400, '不支持的图片地址。', 'reject_invalid_image_src', {
      token: accessRecord.token,
      key: accessRecord.key,
      label: accessRecord.label,
      deviceId: accessRecord.deviceId,
    });
  } catch {
    await rejectWithLog(request, response, 404, '图片不存在或无法读取。', 'reject_image_not_found', {
      token: accessRecord.token,
      key: accessRecord.key,
      label: accessRecord.label,
      deviceId: accessRecord.deviceId,
    });
  }
});

const distPath = path.resolve(process.cwd(), 'dist');
const distIndexPath = path.join(distPath, 'index.html');

if (existsSync(distPath) && existsSync(distIndexPath)) {
  app.use(express.static(distPath));

  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next();
      return;
    }

    response.sendFile(distIndexPath);
  });
}

export default app;
