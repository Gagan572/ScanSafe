import crypto from 'crypto';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { QRCodeRecord } from './types';

export interface TokenPayload {
  id: string;
  batch: string;
  t: number;
}

function base64urlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecodeToString(input: string): string {
  const pad = 4 - (input.length % 4);
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/') + (pad === 4 ? '' : '='.repeat(pad));
  return Buffer.from(base64, 'base64').toString('utf8');
}

function getSecret(): string {
  const secret = process.env.PRODUCT_QR_SECRET;
  if (!secret) {
    throw new Error('PRODUCT_QR_SECRET is not set');
  }
  return secret;
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export async function createSignedQrRecord(options: {
  productId?: string;
  batchId: string;
  appUrl?: string;
}): Promise<QRCodeRecord> {
  const id = uuidv4();
  const payload: TokenPayload = {
    id,
    batch: options.batchId,
    t: Date.now(),
  };
  const payloadStr = JSON.stringify(payload);
  const secret = getSecret();
  const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest();
  const signatureB64 = base64urlEncode(signature);
  const token = `${base64urlEncode(payloadStr)}.${signatureB64}`;

  const appUrl = options.appUrl || getAppUrl();
  const urlToEncode = `${appUrl}/api/qr/verify?token=${encodeURIComponent(token)}`;
  const qrUrl = await QRCode.toDataURL(urlToEncode, { margin: 4, width: 320 });

  const record: QRCodeRecord = {
    id,
    batchId: options.batchId,
    productId: options.productId,
    token,
    signature: signatureB64,
    qrUrl,
    createdAt: Date.now(),
    states: {
      manufactured: null,
      distributed: null,
      retailed: null,
      owner: null,
    },
    scannedCount: 0,
  };

  return record;
}

export function verifyToken(token: string): { valid: boolean; payload?: TokenPayload; error?: string } {
  try {
    const [payloadPart, sigPart] = token.split('.');
    if (!payloadPart || !sigPart) {
      return { valid: false, error: 'Malformed token' };
    }
    const payloadStr = base64urlDecodeToString(payloadPart);
    const payload = JSON.parse(payloadStr) as TokenPayload;
    const secret = getSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest();
    const expectedSigB64 = base64urlEncode(expectedSig);
    if (expectedSigB64 !== sigPart) {
      return { valid: false, error: 'Invalid signature' };
    }
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: 'Verification failed' };
  }
}
