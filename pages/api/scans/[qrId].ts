import type { NextApiRequest, NextApiResponse } from 'next';
import { getScansByQrId } from '../../../lib/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { qrId } = req.query;
  if (!qrId || typeof qrId !== 'string') {
    return res.status(400).json({ error: 'qrId is required' });
  }

  const scans = await getScansByQrId(qrId);
  return res.status(200).json(scans);
}
