import path from 'path';
import dotenv from 'dotenv';
import {
  createBatch,
  createProduct,
  createQRCodes,
  ensureSeedManufacturer,
  getProductById,
  getProducts,
  getQRCodesByBatch,
} from '../lib/db';
import { createSignedQrRecord } from '../lib/qr';
import type { Product, QRCodeRecord } from '../lib/types';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  if (!process.env.PRODUCT_QR_SECRET) {
    throw new Error('PRODUCT_QR_SECRET must be set in .env.local before running the seed script');
  }

  console.log('Seeding demo data...');
  await ensureSeedManufacturer();

  const products = await getProducts();

  let product: Product;
  if (products.length === 0) {
    product = {
      id: 'prod-1',
      name: 'SafeScan Demo Product',
      sku: 'SS-DEMO-001',
      canonicalImageUrl: '/uploads/demo-product.png',
      batches: [],
    };
    await createProduct(product);
  } else {
    product = products[0];
  }

  const batchId = 'batch-1';
  if (!product.batches.find((b) => b.id === batchId)) {
    product.batches.push({
      id: batchId,
      name: 'Demo Batch 1',
      size: 10,
      createdAt: Date.now(),
    });
    await createBatch(product.id, product.batches[product.batches.length - 1]);
  }

  product = (await getProductById(product.id)) || product;

  const existingQrs = await getQRCodesByBatch(batchId);

  const toCreate = 10 - existingQrs.length;
  const newRecords: QRCodeRecord[] = [];
  for (let i = 0; i < toCreate; i += 1) {
    const rec = await createSignedQrRecord({ productId: product.id, batchId });
    newRecords.push(rec);
  }

  if (newRecords.length > 0) {
    await createQRCodes(newRecords);
  }

  console.log('Seed complete. SQL database, product, batch, and QR codes are ready.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
