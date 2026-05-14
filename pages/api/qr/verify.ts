import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { createScan, getQRCodeById, getScansByQrId, updateQRCode } from '../../../lib/db';
import { verifyToken } from '../../../lib/qr';
import { recordBlockchainEvent } from '../../../lib/blockchain';
import type { ScanRecord, Role } from '../../../lib/types';

function parseLocation(input: any): { lat: number; lon: number } | undefined {
  if (!input) return undefined;
  if (typeof input === 'string') {
    const parts = input.split(',').map((x) => parseFloat(x.trim()));
    if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
      return { lat: parts[0], lon: parts[1] };
    }
    return undefined;
  }
  if (typeof input === 'object' && input.lat != null && input.lon != null) {
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      return { lat, lon };
    }
  }
  return undefined;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const c = 2 * Math.asin(
    Math.sqrt(sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon),
  );
  return R * c;
}

function getStateField(role: Role): 'manufactured' | 'distributed' | 'retailed' | 'owner' {
  if (role === 'manufacturer') return 'manufactured';
  if (role === 'distributor') return 'distributed';
  if (role === 'retailer') return 'retailed';
  return 'owner';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const token = (req.query.token as string) || '';
    if (!token) {
      return res.status(400).json({ status: 'INVALID', error: 'Missing token' });
    }
    const verification = verifyToken(token);
    if (!verification.valid || !verification.payload) {
      return res.status(200).json({ status: 'INVALID', error: verification.error });
    }
    const qr = await getQRCodeById(verification.payload.id);
    if (!qr) {
      return res.status(200).json({ status: 'INVALID', error: 'QR not found' });
    }
    return res.status(200).json({ status: 'AUTHENTIC', qr });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, role, actorId, actorName, location } = req.body || {};

  if (!token || !role || !actorName) {
    return res.status(400).json({ status: 'INVALID', error: 'token, role, actorName are required' });
  }

  const roleValue = role as Role;

  const verification = verifyToken(token);
  if (!verification.valid || !verification.payload) {
    return res.status(200).json({ status: 'INVALID', error: verification.error });
  }

  const payload = verification.payload;
  const qr = await getQRCodeById(payload.id);
  if (!qr) {
    return res.status(200).json({ status: 'INVALID', error: 'QR not found' });
  }

  const now = Date.now();
  const prevScans = await getScansByQrId(qr.id);

  const stateField = getStateField(roleValue);
  let isDuplicate = false;

  if (stateField === 'owner') {
    if (qr.states.owner) {
      isDuplicate = true;
    }
  } else if (qr.states[stateField]) {
    isDuplicate = true;
  }

  const locParsed = parseLocation(location);

  let anomalyScore = 0;
  if (locParsed && prevScans.length > 0) {
    for (const s of prevScans) {
      const otherLoc = parseLocation(s.location);
      if (!otherLoc) continue;
      const dtMin = Math.abs(now - s.timestamp) / (1000 * 60);
      if (dtMin <= 10) {
        const distKm = haversineKm(locParsed, otherLoc);
        if (distKm > 500) {
          anomalyScore += 1;
        }
      }
    }
  }

  const scanRecord: ScanRecord = {
    id: uuidv4(),
    qrId: qr.id,
    role: roleValue,
    actorId: String(actorId || actorName),
    actorName: String(actorName),
    timestamp: now,
    location: locParsed || location,
    deviceInfo: undefined,
    isDuplicate,
    anomalyScore: anomalyScore || undefined,
  };

  if (!isDuplicate) {
    if (stateField === 'owner') {
      qr.states.owner = { name: actorName, ownerId: actorId, ts: now };
    } else {
      (qr.states as any)[stateField] = now;
    }
    qr.scannedCount += 1;
    await updateQRCode(qr);
  }

  const bc = await recordBlockchainEvent({
    qrId: qr.id,
    eventType: isDuplicate ? 'SCAN_DUPLICATE' : 'SCAN',
    metadata: {
      role: roleValue,
      actorId: scanRecord.actorId,
      actorName: scanRecord.actorName,
      location: scanRecord.location,
      isDuplicate,
    },
  });

  scanRecord.txHash = bc.txHash;

  await createScan(scanRecord);

  const status = isDuplicate ? 'DUPLICATE' : 'AUTHENTIC';

  return res.status(200).json({ status, qr, scanRecord });
}
