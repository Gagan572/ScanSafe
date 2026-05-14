# ScanSafe-MVP

A minimal Next.js + TypeScript demo for signed product QR codes, duplicate detection, mock AI image verification, and optional blockchain logging. Application data is stored in a local SQL database at `data/scansafe.sqlite`.

## Tech Stack

- **Frontend**: Next.js 13 + React + TypeScript
- **Backend**: Next.js API routes (TypeScript)
- **QR generation**: [`qrcode`](https://www.npmjs.com/package/qrcode)
- **Crypto signing**: HMAC-SHA256 via Node `crypto`
- **Token format**: `base64url(payload) + '.' + base64url(signature)`
- **Storage**: SQLite database through `sql.js`
  - Main database file: `data/scansafe.sqlite`
  - Main entities: `manufacturers`, `products`, `batches`, `qrcodes`, `scans`, `blockchain_events`, `ai_reports`
- **Optional image storage**: saved under `public/uploads`
- **Blockchain**: [`ethers`](https://www.npmjs.com/package/ethers`) if RPC + key are configured, otherwise mocked tx entries are stored in `blockchain_events`

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy the example env file and edit values:

   ```bash
   cp .env.example .env.local
   ```

   Required:

   - `PRODUCT_QR_SECRET` – HMAC secret used to sign QR payloads
   - `NEXT_PUBLIC_APP_URL` – usually `http://localhost:3000`

   Optional:

   - `GENINI_API_KEY` – placeholder for external image hosting (not required; app stores images locally under `public/uploads`)
   - `WEB3_RPC_URL`, `WEB3_PRIVATE_KEY` - if set, real transactions are sent with `ethers` and recorded in SQL.

3. **Seed demo data**

   The seed script creates:

   - 1 manufacturer
   - 1 product with SKU `SS-DEMO-001`
   - 1 batch (`Demo Batch 1`)
   - Up to 10 signed QR codes for that batch

   Make sure `.env.local` has `PRODUCT_QR_SECRET` set, then run:

   ```bash
   npm run seed
   ```

## Running the app

Start the Next.js dev server:

```bash
npm run dev
```

Then open:

- `http://localhost:3000` – Landing page

## Core Flows

### 1. Manufacturer – Generate QR codes

- Go to **`/manufacturer`**.
- Select the seeded product and batch.
- Enter a number of QR codes to generate (e.g. 5).
- The app calls `POST /api/qr/generate` which:
  - Builds payload: `{ id: uuidv4(), batch: batchId, t: Date.now() }`.
  - Signs it with `HMAC_SHA256(payload, PRODUCT_QR_SECRET)`.
  - Forms token: `base64url(payload) + '.' + base64url(signature)`.
  - Generates a PNG QR that encodes `NEXT_PUBLIC_APP_URL/api/qr/verify?token=...`.
  - Persists QR entries in the SQL `qrcodes` table with QR image data URLs.

### 2. Supply Chain Scan – Manufacturer / Distributor / Retailer

- Go to **`/scan`**.
- Paste a QR token (from the generated list) into the text area.
- Choose role: `manufacturer`, `distributor`, or `retailer`.
- Fill in actor name (and optional ID / location).
- Submit to call `POST /api/qr/verify` which:
  - Verifies the HMAC-SHA256 signature using `PRODUCT_QR_SECRET`.
  - Looks up the QR by `payload.id` in the `qrcodes` table.
  - Records a scan entry in the `scans` table.
  - Checks if that role’s lifecycle state is already set; if so, marks `isDuplicate: true` and returns `status: "DUPLICATE"`.
  - Otherwise updates the appropriate state (`manufactured`, `distributed`, `retailed`) and increments `scannedCount`.
  - Optionally sends or simulates a blockchain tx and records it in `blockchain_events`.

### 3. Customer Verify & Claim

- Go to **`/customer`**.
- Paste the QR token.
- Optionally fill in **Your Name / ID** to claim ownership.
- If a name is provided, the UI calls `POST /api/claim` which:
  - Verifies token.
  - Attaches an `owner` structure to the corresponding QR record.
  - Adds a `role = 'customer'` scan entry in `scans`.
  - If the owner is already set, marks the claim as duplicate and returns `status: "DUPLICATE"`.

If no name is provided, the page calls `POST /api/qr/verify` with `role='customer'` to just log a verification without ownership metadata.

### 4. Admin Dashboard – Duplicates & Anomalies

- Go to **`/admin`**.
- The page calls `GET /api/qrs` to list all QR codes with:
  - Batch ID, product ID, `scannedCount`.
  - Lifecycle state badges (M/D/R/C).
- Click **View Scans** on any QR row:
  - Fetches `GET /api/scans/:qrId`.
  - Shows a table of scans: time, role, actor, location, `isDuplicate`, anomaly score, tx hash.

Duplicate / anomaly logic (demo):

- For a given QR and role, multiple scans on an already-set state cause `status: "DUPLICATE"`.
- When locations are provided as `"lat,lon"` strings, rapid scans (≤ 10 minutes apart) that are more than ~500km apart increment an `anomalyScore` stored on the scan.
- The admin UI surfaces duplicates and anomaly counts per QR.

### 5. AI Image Verification (Mock)

- Go to **`/ai-verify`**.
- Upload a product/QR image and optionally paste a QR token.
- The page calls `POST /api/ai/verify` with a multipart form:
  - The API reads the image bytes, computes a simple hash (SHA-256) as a stand-in for a perceptual hash.
  - Optionally decodes the token to link the report to a QR/product.
  - Simulates an AI verdict (`AUTHENTIC` or `SUSPECT`) with a random confidence in `[0.5, 1.0]`.
  - Stores a report in `ai_reports` and copies the image to `public/uploads/`.
- The UI displays verdict, confidence, reasons, and the stored image URL.

## Blockchain Demo Behavior

- If **`WEB3_RPC_URL`** and **`WEB3_PRIVATE_KEY`** are set:
  - The backend uses `ethers` to send a simple transaction from the configured wallet to itself.
  - Tx `data` is a SHA-256 hash of JSON `{ qrId, eventType, ts, metadata }`.
  - It waits for 1 confirmation and records `{ txHash, blockNumber, timestamp }` along with a `BlockchainEvent` row.
- If not set:
  - A mocked transaction is generated: `txHash = 'MOCK_' + randomHex`, `blockNumber = 0`.
  - The mock event is still inserted into `blockchain_events`.

## SQL Data Model

- **`manufacturers`**: manufacturer identity and license details
- **`products`**: product catalog with SKU and manufacturer reference
- **`batches`**: product batch records
- **`qrcodes`**: signed QR tokens and lifecycle state
- **`scans`**: scan history, actor, role, duplicate flag, anomaly score
- **`blockchain_events`**: transaction/audit records
- **`ai_reports`**: image hash, verdict, confidence, and reasons

(See `lib/types.ts` for exact TypeScript interfaces.)

## All SQL Queries for DBMS Submission

All main SQL queries used in this project are documented here:

- [`SQL_QUERIES_AND_DATA_GUIDE.md`](./SQL_QUERIES_AND_DATA_GUIDE.md)

In GitHub, open that file to show the DBMS SQL part of the project. It includes:

- `CREATE TABLE` queries
- `INSERT` queries
- `SELECT` queries
- `UPDATE` queries
- Entity list
- Table relationships
- API route to table mapping
- Live data locations

The documented SQL covers these tables:

- `manufacturers`
- `products`
- `batches`
- `qrcodes`
- `scans`
- `blockchain_events`
- `ai_reports`

The SQL integration code is in:

- [`lib/db.ts`](./lib/db.ts)

Live application data is stored in:

- `data/scansafe.sqlite`

## Demo Walkthrough

1. **Seed data**
   - Ensure `.env.local` has `PRODUCT_QR_SECRET`.
   - Run `npm run seed`.

2. **Generate QRs**
   - Go to `/manufacturer` and generate **5 QR codes** for the demo batch.

3. **Manufacturer scan**
   - Copy a token (QR1) and go to `/scan`.
   - Choose role `manufacturer`, set an actor name (e.g. `Factory A`), and submit.

4. **Distributor scan**
   - Reuse the same token on `/scan`.
   - Choose role `distributor`, set an actor name (e.g. `Distributor X`), and submit.

5. **Customer verify & claim**
   - Go to `/customer`.
   - Paste the same token and enter a customer name / ID.
   - Submit to verify and claim ownership.

6. **Duplicate demonstration**
   - Still on `/customer`, paste the same token again but use a *different* customer name.
   - The response should show `status: "DUPLICATE"` for the second claim.
   - Visit `/admin` and view the scan history for that QR to see the duplicate flag.

7. **AI verify demo**
   - Go to `/ai-verify`.
   - Upload any image, optionally with a QR token.
   - Observe the mock verdict and confidence; the report is persisted to SQL.

## Notes

- This is an MVP-style prototype; no authentication or role management is implemented.
- All app data is stored locally in `data/scansafe.sqlite`; delete that file to reset the SQL database.
- The QR images are stored as PNG data URLs inside the `qrcodes` table for simplicity.
