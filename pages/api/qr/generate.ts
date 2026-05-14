import type { NextApiRequest, NextApiResponse } from 'next';
import { createQRCodes, getProductById } from '../../../lib/db';
import type { QRCodeRecord } from '../../../lib/types';
import { createSignedQrRecord } from '../../../lib/qr';

function getRequestAppUrl(req: NextApiRequest): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || 'http';
  const host = req.headers.host;

  if (host) {
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, batchId, count } = req.body || {};
  const n = Number(count) || 0;

  if (!productId || !batchId || n <= 0) {
    return res.status(400).json({ error: 'productId, batchId and positive count are required' });
  }

  if (n > 500) {
    return res.status(400).json({ error: 'count too large for demo (max 500)' });
  }

  const product = await getProductById(String(productId));
  if (!product) {
    return res.status(400).json({ error: 'Unknown productId' });
  }
  if (!product.batches.some((batch) => batch.id === batchId)) {
    return res.status(400).json({ error: 'Unknown batchId for product' });
  }

  const appUrl = getRequestAppUrl(req);
  const records: QRCodeRecord[] = [];
  for (let i = 0; i < n; i += 1) {
    const rec = await createSignedQrRecord({ productId, batchId, appUrl });
    records.push(rec);
  }

  await createQRCodes(records);

  return res.status(200).json({
    tokens: records.map((r) => r.token),
    qrcodes: records.map((r) => ({ id: r.id, qrUrl: r.qrUrl, token: r.token })),
    printableUrl: `${appUrl}/manufacturer`,
  });
}
