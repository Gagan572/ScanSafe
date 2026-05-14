import type { NextApiRequest, NextApiResponse } from 'next';
import { createProduct, getProducts } from '../../lib/db';
import type { Product } from '../../lib/types';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const products = await getProducts();
    return res.status(200).json(products);
  }

  if (req.method === 'POST') {
    const { name, sku, canonicalImageUrl, batchName, batchSize } = req.body || {};
    if (!name || !sku) {
      return res.status(400).json({ error: 'name and sku are required' });
    }

    const id = `prod-${uuidv4()}`;
    const batch = {
      id: `batch-${uuidv4()}`,
      name: batchName ? String(batchName) : 'Default Batch',
      size: Number(batchSize) || 100,
      createdAt: Date.now(),
    };
    const newProduct: Product = {
      id,
      name: String(name),
      sku: String(sku),
      canonicalImageUrl: canonicalImageUrl ? String(canonicalImageUrl) : undefined,
      batches: [batch],
    };

    await createProduct(newProduct);
    return res.status(201).json(newProduct);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
