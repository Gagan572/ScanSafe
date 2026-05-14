# ScanSafe SQL Queries and Live Data Guide

This document explains exactly where SQL is integrated, what SQL queries are used, and where live database data can be viewed in the project.

## 1. Where SQL Is Integrated

SQL is integrated in this file:

```text
lib/db.ts
```

The SQLite database file is created here:

```text
data/scansafe.sqlite
```

The project uses `sql.js`, which provides SQLite inside the Node.js/Next.js app.

Main database functions in `lib/db.ts`:

```text
getProducts()
createProduct()
createBatch()
getQRCodes()
getQRCodeById()
createQRCodes()
updateQRCode()
getScansByQrId()
createScan()
createBlockchainEvent()
createAIReport()
```

## 2. Exact SQL Queries Used To Create Tables

These table creation queries are present inside `createSchema()` in `lib/db.ts`.

### Manufacturers Table

```sql
CREATE TABLE IF NOT EXISTS manufacturers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  license_no TEXT,
  email TEXT,
  phone TEXT,
  created_at INTEGER NOT NULL
);
```

### Products Table

```sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  manufacturer_id TEXT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  canonical_image_url TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id)
);
```

### Batches Table

```sql
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
```

### QR Codes Table

```sql
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
```

### Scans Table

```sql
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
```

### Blockchain Events Table

```sql
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
```

### AI Reports Table

```sql
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
```

## 3. Important Insert Queries

### Insert Manufacturer

Used in `ensureSeedManufacturer()` and schema initialization.

```sql
INSERT OR IGNORE INTO manufacturers
  (id, name, license_no, email, phone, created_at)
  VALUES (?, ?, ?, ?, ?, ?);
```

### Insert Product

Used in `insertProductRow()`.

```sql
INSERT OR IGNORE INTO products
  (id, manufacturer_id, name, sku, canonical_image_url, created_at)
  VALUES (?, ?, ?, ?, ?, ?);
```

### Insert Batch

Used in `insertBatchRow()`.

```sql
INSERT OR IGNORE INTO batches
  (id, product_id, name, size, created_at)
  VALUES (?, ?, ?, ?, ?);
```

### Insert QR Code

Used in `insertQRCodeRow()`.

```sql
INSERT OR IGNORE INTO qrcodes
  (id, batch_id, product_id, token, signature, qr_url, created_at,
   manufactured_at, distributed_at, retailed_at, owner_name, owner_id, owner_ts, scanned_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

### Insert Scan

Used in `insertScanRow()`.

```sql
INSERT OR IGNORE INTO scans
  (id, qr_id, role, actor_id, actor_name, timestamp, location_json, device_info,
   is_duplicate, tx_hash, anomaly_score)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

### Insert Blockchain Event

Used in `insertBlockchainEventRow()`.

```sql
INSERT OR IGNORE INTO blockchain_events
  (id, qr_id, event_type, metadata_json, tx_hash, block_number, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?);
```

### Insert AI Report

Used in `insertAIReportRow()`.

```sql
INSERT OR IGNORE INTO ai_reports
  (id, qr_id, product_id, image_hash, verdict, confidence, reasons_json, annotated_image_url, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
```

## 4. Important Select Queries

### Get All Products

Used in `getProducts()`.

```sql
SELECT * FROM products ORDER BY created_at ASC, name ASC;
```

### Get Batches For Product

Used in `getProducts()` and `getProductById()`.

```sql
SELECT * FROM batches WHERE product_id = ? ORDER BY created_at ASC;
```

### Get Product By ID

Used before QR generation.

```sql
SELECT * FROM products WHERE id = ?;
```

### Get All QR Codes

Used by Admin dashboard.

```sql
SELECT * FROM qrcodes ORDER BY created_at DESC;
```

### Get QR Code By ID

Used during QR verification and customer claim.

```sql
SELECT * FROM qrcodes WHERE id = ?;
```

### Get QR Codes By Batch

Used by seed script.

```sql
SELECT * FROM qrcodes WHERE batch_id = ?;
```

### Get Scans For One QR

Used by Admin scan history.

```sql
SELECT * FROM scans WHERE qr_id = ? ORDER BY timestamp ASC;
```

## 5. Important Update Query

### Update QR Lifecycle State

Used in `updateQRCode()`.

This is used when a manufacturer, distributor, retailer, or customer scans/claims a QR code.

```sql
UPDATE qrcodes
SET manufactured_at = ?,
    distributed_at = ?,
    retailed_at = ?,
    owner_name = ?,
    owner_id = ?,
    owner_ts = ?,
    scanned_count = ?
WHERE id = ?;
```

## 6. Where Live Data Can Be Seen

### 1. Main SQL Database File

Live data is stored in:

```text
data/scansafe.sqlite
```

This is the actual SQLite database file. It is not meant to be read like a text file.

### 2. Admin Page

Open:

```text
http://localhost:3000/admin
```

Here you can see:

```text
Products
QR Codes
Scan count
Lifecycle states
Duplicate flags
Scan history
```

### 3. Products API

Open this in browser:

```text
http://localhost:3000/api/products
```

This shows live data from the SQL `products` and `batches` tables.

### 4. QR Codes API

Open this in browser:

```text
http://localhost:3000/api/qrs
```

This shows live data from the SQL `qrcodes` table.

### 5. Scan History API

Use this format:

```text
http://localhost:3000/api/scans/QR_ID_HERE
```

Example:

```text
http://localhost:3000/api/scans/replace-with-real-qr-id
```

This shows live data from the SQL `scans` table for one QR code.

## 7. Which API Route Uses Which SQL Table

| Feature | API File | SQL Tables Used |
|---|---|---|
| Create/List Products | `pages/api/products.ts` | `products`, `batches` |
| Generate QR Codes | `pages/api/qr/generate.ts` | `products`, `batches`, `qrcodes` |
| Verify QR / Scan | `pages/api/qr/verify.ts` | `qrcodes`, `scans`, `blockchain_events` |
| Customer Claim | `pages/api/claim.ts` | `qrcodes`, `scans`, `blockchain_events` |
| List QR Codes | `pages/api/qrs.ts` | `qrcodes` |
| View Scan History | `pages/api/scans/[qrId].ts` | `scans` |
| AI Verification | `pages/api/ai/verify.ts` | `ai_reports`, `products`, `qrcodes` |

## 8. Are JSON Files Still Used?

The live application now uses SQL, not JSON.

Old JSON files still exist in:

```text
data/products.json
data/qrcodes.json
data/scans.json
data/blockchain.json
data/ai_reports.json
```

They are only used as legacy import data. In `lib/db.ts`, if the SQL database is empty, old JSON data can be read once and migrated into SQL.

Final answer for viva:

```text
The old JSON files are not the active database. The active database is data/scansafe.sqlite.
JSON is only kept for migration from the old prototype.
All new products, QR codes, scans, blockchain events, and AI reports are inserted into SQL tables.
```

## 9. How To Explain The DBMS Flow

When product is created:

```text
Admin page -> /api/products -> createProduct() -> INSERT INTO products and batches
```

When QR is generated:

```text
Manufacturer page -> /api/qr/generate -> createQRCodes() -> INSERT INTO qrcodes
```

When QR is scanned:

```text
Scan page -> /api/qr/verify -> SELECT qrcodes -> INSERT scans -> UPDATE qrcodes -> INSERT blockchain_events
```

When customer claims product:

```text
Customer page -> /api/claim -> SELECT qrcodes -> UPDATE qrcodes owner fields -> INSERT scans
```

When AI verification is done:

```text
AI verify page -> /api/ai/verify -> INSERT INTO ai_reports
```

## 10. Simple Viva Explanation

ScanSafe is a SQL based product authentication system. SQL is integrated in `lib/db.ts`. The database is stored in `data/scansafe.sqlite`. The system has seven tables: manufacturers, products, batches, qrcodes, scans, blockchain_events, and ai_reports. Admin creates products, manufacturers generate QR codes, supply chain users scan QR codes, and every scan is stored in the scans table. Duplicate detection is done by checking lifecycle columns in the qrcodes table. JSON was used only in the old version, but the current version stores live data in SQLite.
