import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { createScan, getQRCodeById, updateQRCode } from '../../lib/db';
import { verifyToken } from '../../lib/qr';
import { recordBlockchainEvent } from '../../lib/blockchain';
import type { ScanRecord } from '../../lib/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, ownerName, ownerId } = req.body || {};
  if (!token || !ownerName) {
    return res.status(400).json({ status: 'INVALID', error: 'token and ownerName are required' });
  }

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

  let isDuplicate = false;
  if (qr.states.owner) {
    isDuplicate = true;
  } else {
    qr.states.owner = { name: ownerName, ownerId, ts: now };
    qr.scannedCount += 1;
    await updateQRCode(qr);
  }

  const scanRecord: ScanRecord = {
    id: uuidv4(),
    qrId: qr.id,
    role: 'customer',
    actorId: String(ownerId || ownerName),
    actorName: String(ownerName),
    timestamp: now,
    location: undefined,
    deviceInfo: undefined,
    isDuplicate,
  };

  const bc = await recordBlockchainEvent({
    qrId: qr.id,
    eventType: isDuplicate ? 'CLAIM_DUPLICATE' : 'CLAIM',
    metadata: {
      actorId: scanRecord.actorId,
      actorName: scanRecord.actorName,
      isDuplicate,
    },
  });

  scanRecord.txHash = bc.txHash;

  await createScan(scanRecord);

  const status = isDuplicate ? 'DUPLICATE' : 'AUTHENTIC';

  return res.status(200).json({ status, qr, scanRecord });
}
