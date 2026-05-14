import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import type {
  AIReport,
  BlockchainEvent,
  Product,
  ProductBatch,
  QRCodeRecord,
  QRStates,
  ScanRecord,
} from './types';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'scansafe.sqlite');

let dbPromise: Promise<any> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function now() {
  return Date.now();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function boolToInt(value: boolean) {
  return value ? 1 : 0;
}

function intToBool(value: unknown) {
  return Number(value) === 1;
}

async function readLegacyJson<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const fullPath = path.join(dataDir, fileName);
    const raw = await fs.promises.readFile(fullPath, 'utf8');
    return raw.trim() ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function rowsFromResult(result: any[]): Record<string, any>[] {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row: any[]) =>
    columns.reduce((acc: Record<string, any>, column: string, index: number) => {
      acc[column] = row[index];
      return acc;
    }, {}),
  );
}

function selectRows(db: any, sql: string, params: any[] = []): Record<string, any>[] {
  return rowsFromResult(db.exec(sql, params));
}

function createSchema(db: any) {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS manufacturers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      license_no TEXT,
      email TEXT,
      phone TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      manufacturer_id TEXT,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      canonical_image_url TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
    );

    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS qrcodes (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      product_id TEXT,
      token TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL,
      qr_url TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      manufactured_at INTEGER,
      distributed_at INTEGER,
      retailed_at INTEGER,
      owner_name TEXT,
      owner_id TEXT,
      owner_ts INTEGER,
      scanned_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (batch_id) REFERENCES batches(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      qr_id TEXT NOT NULL,
      role TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      location_json TEXT,
      device_info TEXT,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT,
      anomaly_score REAL,
      FOREIGN KEY (qr_id) REFERENCES qrcodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blockchain_events (
      id TEXT PRIMARY KEY,
      qr_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      metadata_json TEXT,
      tx_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (qr_id) REFERENCES qrcodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_reports (
      id TEXT PRIMARY KEY,
      qr_id TEXT,
      product_id TEXT,
      image_hash TEXT NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('AUTHENTIC', 'SUSPECT')),
      confidence REAL NOT NULL,
      reasons_json TEXT NOT NULL,
      annotated_image_url TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (qr_id) REFERENCES qrcodes(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  db.run(
    `INSERT OR IGNORE INTO manufacturers
      (id, name, license_no, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    ['mfg-1', 'ScanSafe Demo Manufacturer', 'LIC-SS-2026', 'demo@scansafe.local', '9999999999', now()],
  );
}

async function migrateLegacyJson(db: any) {
  const productCount = selectRows(db, 'SELECT COUNT(*) AS total FROM products')[0]?.total || 0;
  const qrCount = selectRows(db, 'SELECT COUNT(*) AS total FROM qrcodes')[0]?.total || 0;
  if (productCount || qrCount) return;

  const products = await readLegacyJson<Product[]>('products.json', []);
  const qrs = await readLegacyJson<QRCodeRecord[]>('qrcodes.json', []);
  const scans = await readLegacyJson<ScanRecord[]>('scans.json', []);
  const events = await readLegacyJson<BlockchainEvent[]>('blockchain.json', []);
  const reports = await readLegacyJson<AIReport[]>('ai_reports.json', []);

  for (const product of products) {
    insertProductRow(db, product, false);
    for (const batch of product.batches || []) {
      insertBatchRow(db, product.id, batch);
    }
  }
  for (const qr of qrs) insertQRCodeRow(db, qr);
  for (const scan of scans) insertScanRow(db, scan);
  for (const event of events) insertBlockchainEventRow(db, event);
  for (const report of reports) insertAIReportRow(db, report);
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const SQL = await initSqlJs();
      const fileBuffer = fs.existsSync(dbPath) ? await fs.promises.readFile(dbPath) : null;
      const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
      createSchema(db);
      await migrateLegacyJson(db);
      await saveDb(db);
      return db;
    })();
  }
  return dbPromise;
}

async function saveDb(db: any) {
  const bytes = db.export();
  await fs.promises.writeFile(dbPath, Buffer.from(bytes));
}

async function withWrite<T>(fn: (db: any) => T | Promise<T>): Promise<T> {
  const db = await getDb();
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    const result = await fn(db);
    await saveDb(db);
    return result;
  } finally {
    release();
  }
}

function productFromRow(row: Record<string, any>, batches: ProductBatch[]): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    sku: String(row.sku),
    canonicalImageUrl: row.canonical_image_url || undefined,
    batches,
  };
}

function batchFromRow(row: Record<string, any>): ProductBatch {
  return {
    id: String(row.id),
    name: String(row.name),
    size: Number(row.size),
    createdAt: Number(row.created_at),
  };
}

function statesFromRow(row: Record<string, any>): QRStates {
  return {
    manufactured: row.manufactured_at == null ? null : Number(row.manufactured_at),
    distributed: row.distributed_at == null ? null : Number(row.distributed_at),
    retailed: row.retailed_at == null ? null : Number(row.retailed_at),
    owner: row.owner_name
      ? {
          name: String(row.owner_name),
          ownerId: row.owner_id || undefined,
          ts: Number(row.owner_ts),
        }
      : null,
  };
}

function qrFromRow(row: Record<string, any>): QRCodeRecord {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    productId: row.product_id || undefined,
    token: String(row.token),
    signature: String(row.signature),
    qrUrl: String(row.qr_url),
    createdAt: Number(row.created_at),
    states: statesFromRow(row),
    scannedCount: Number(row.scanned_count),
  };
}

function scanFromRow(row: Record<string, any>): ScanRecord {
  return {
    id: String(row.id),
    qrId: String(row.qr_id),
    role: row.role,
    actorId: String(row.actor_id),
    actorName: String(row.actor_name),
    timestamp: Number(row.timestamp),
    location: parseJson(row.location_json, undefined),
    deviceInfo: row.device_info || undefined,
    isDuplicate: intToBool(row.is_duplicate),
    txHash: row.tx_hash || undefined,
    anomalyScore: row.anomaly_score == null ? undefined : Number(row.anomaly_score),
  };
}

function insertProductRow(db: any, product: Product, saveBatches = true) {
  db.run(
    `INSERT OR IGNORE INTO products
      (id, manufacturer_id, name, sku, canonical_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [product.id, 'mfg-1', product.name, product.sku, product.canonicalImageUrl || null, now()],
  );
  if (saveBatches) {
    for (const batch of product.batches || []) insertBatchRow(db, product.id, batch);
  }
}

function insertBatchRow(db: any, productId: string, batch: ProductBatch) {
  db.run(
    `INSERT OR IGNORE INTO batches (id, product_id, name, size, created_at)
      VALUES (?, ?, ?, ?, ?)`,
    [batch.id, productId, batch.name, batch.size, batch.createdAt],
  );
}

function insertQRCodeRow(db: any, qr: QRCodeRecord) {
  db.run(
    `INSERT OR IGNORE INTO qrcodes
      (id, batch_id, product_id, token, signature, qr_url, created_at,
       manufactured_at, distributed_at, retailed_at, owner_name, owner_id, owner_ts, scanned_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      qr.id,
      qr.batchId,
      qr.productId || null,
      qr.token,
      qr.signature,
      qr.qrUrl,
      qr.createdAt,
      qr.states.manufactured,
      qr.states.distributed,
      qr.states.retailed,
      qr.states.owner?.name || null,
      qr.states.owner?.ownerId || null,
      qr.states.owner?.ts || null,
      qr.scannedCount,
    ],
  );
}

function insertScanRow(db: any, scan: ScanRecord) {
  db.run(
    `INSERT OR IGNORE INTO scans
      (id, qr_id, role, actor_id, actor_name, timestamp, location_json, device_info,
       is_duplicate, tx_hash, anomaly_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scan.id,
      scan.qrId,
      scan.role,
      scan.actorId,
      scan.actorName,
      scan.timestamp,
      scan.location == null ? null : JSON.stringify(scan.location),
      scan.deviceInfo || null,
      boolToInt(scan.isDuplicate),
      scan.txHash || null,
      scan.anomalyScore || null,
    ],
  );
}

function insertBlockchainEventRow(db: any, event: BlockchainEvent) {
  db.run(
    `INSERT OR IGNORE INTO blockchain_events
      (id, qr_id, event_type, metadata_json, tx_hash, block_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.qrId,
      event.eventType,
      JSON.stringify(event.metadata || {}),
      event.txHash,
      event.blockNumber,
      event.timestamp,
    ],
  );
}

function insertAIReportRow(db: any, report: AIReport) {
  db.run(
    `INSERT OR IGNORE INTO ai_reports
      (id, qr_id, product_id, image_hash, verdict, confidence, reasons_json, annotated_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.id,
      report.qrId || null,
      report.productId || null,
      report.imageHash,
      report.verdict,
      report.confidence,
      JSON.stringify(report.reasons),
      report.annotatedImageUrl || null,
      report.createdAt,
    ],
  );
}

export async function ensureSeedManufacturer() {
  await withWrite((db) => {
    db.run(
      `INSERT OR IGNORE INTO manufacturers
        (id, name, license_no, email, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      ['mfg-1', 'ScanSafe Demo Manufacturer', 'LIC-SS-2026', 'demo@scansafe.local', '9999999999', now()],
    );
  });
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDb();
  const products = selectRows(db, 'SELECT * FROM products ORDER BY created_at ASC, name ASC');
  return products.map((product) => {
    const batches = selectRows(db, 'SELECT * FROM batches WHERE product_id = ? ORDER BY created_at ASC', [
      product.id,
    ]).map(batchFromRow);
    return productFromRow(product, batches);
  });
}

export async function getProductById(id: string): Promise<Product | null> {
  const db = await getDb();
  const rows = selectRows(db, 'SELECT * FROM products WHERE id = ?', [id]);
  if (!rows.length) return null;
  const batches = selectRows(db, 'SELECT * FROM batches WHERE product_id = ? ORDER BY created_at ASC', [id]).map(
    batchFromRow,
  );
  return productFromRow(rows[0], batches);
}

export async function createProduct(product: Product): Promise<Product> {
  await ensureSeedManufacturer();
  await withWrite((db) => insertProductRow(db, product));
  return product;
}

export async function createBatch(productId: string, batch: ProductBatch): Promise<ProductBatch> {
  await withWrite((db) => insertBatchRow(db, productId, batch));
  return batch;
}

export async function getQRCodes(): Promise<QRCodeRecord[]> {
  const db = await getDb();
  return selectRows(db, 'SELECT * FROM qrcodes ORDER BY created_at DESC').map(qrFromRow);
}

export async function getQRCodeById(id: string): Promise<QRCodeRecord | null> {
  const db = await getDb();
  const rows = selectRows(db, 'SELECT * FROM qrcodes WHERE id = ?', [id]);
  return rows.length ? qrFromRow(rows[0]) : null;
}

export async function getQRCodesByBatch(batchId: string): Promise<QRCodeRecord[]> {
  const db = await getDb();
  return selectRows(db, 'SELECT * FROM qrcodes WHERE batch_id = ?', [batchId]).map(qrFromRow);
}

export async function createQRCodes(qrs: QRCodeRecord[]): Promise<QRCodeRecord[]> {
  await withWrite((db) => {
    for (const qr of qrs) insertQRCodeRow(db, qr);
  });
  return qrs;
}

export async function updateQRCode(qr: QRCodeRecord): Promise<QRCodeRecord> {
  await withWrite((db) => {
    db.run(
      `UPDATE qrcodes
       SET manufactured_at = ?, distributed_at = ?, retailed_at = ?,
           owner_name = ?, owner_id = ?, owner_ts = ?, scanned_count = ?
       WHERE id = ?`,
      [
        qr.states.manufactured,
        qr.states.distributed,
        qr.states.retailed,
        qr.states.owner?.name || null,
        qr.states.owner?.ownerId || null,
        qr.states.owner?.ts || null,
        qr.scannedCount,
        qr.id,
      ],
    );
  });
  return qr;
}

export async function getScansByQrId(qrId: string): Promise<ScanRecord[]> {
  const db = await getDb();
  return selectRows(db, 'SELECT * FROM scans WHERE qr_id = ? ORDER BY timestamp ASC', [qrId]).map(scanFromRow);
}

export async function createScan(scan: ScanRecord): Promise<ScanRecord> {
  await withWrite((db) => insertScanRow(db, scan));
  return scan;
}

export async function createBlockchainEvent(event: BlockchainEvent): Promise<BlockchainEvent> {
  await withWrite((db) => insertBlockchainEventRow(db, event));
  return event;
}

export async function createAIReport(report: AIReport): Promise<AIReport> {
  await withWrite((db) => insertAIReportRow(db, report));
  return report;
}
