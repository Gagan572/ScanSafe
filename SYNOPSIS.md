# ScanSafe: SQL Based Product Authentication System

## 1. Title

ScanSafe: A SQL Based QR Product Authentication and Supply Chain Tracking System

## 2. Introduction

Counterfeit products are a major problem in modern supply chains. ScanSafe is a DBMS project that helps manufacturers create signed QR codes for products and track every scan across the product lifecycle. The system verifies QR authenticity, detects duplicate scans, records ownership claims, stores AI image verification reports, and keeps blockchain-style audit events.

The earlier prototype used JSON files for storage. This version uses a SQL database stored at `data/scansafe.sqlite`, making the project suitable for DBMS evaluation because data is organized into normalized tables with primary keys, foreign keys, and relational queries.

## 3. Objectives

- To replace file based JSON storage with a SQL based database.
- To manage product, batch, QR code, scan, ownership, blockchain event, and AI report data.
- To provide secure QR verification using HMAC signed tokens.
- To detect duplicate product scans and suspicious location based scan activity.
- To provide an admin dashboard for product and scan monitoring.

## 4. Scope

The system is designed for a product manufacturer and supply chain participants such as distributors, retailers, and customers. It supports product registration, batch creation, QR generation, QR verification, scan history tracking, duplicate detection, customer ownership claim, and AI based product image verification.

## 5. Technologies Used

- Frontend: Next.js, React, TypeScript
- Backend: Next.js API Routes
- Database: SQLite through `sql.js`
- QR generation: `qrcode`
- Security: HMAC-SHA256 token signing
- Optional blockchain logging: `ethers`

## 6. Minimum Entities

This project contains more than the required five entities. The main SQL entities are:

1. `manufacturers`: Stores manufacturer profile and license details.
2. `products`: Stores product name, SKU, image URL, and manufacturer reference.
3. `batches`: Stores product batch details such as batch name and size.
4. `qrcodes`: Stores signed QR tokens, QR image URL, lifecycle states, and ownership data.
5. `scans`: Stores each scan made by manufacturer, distributor, retailer, or customer.
6. `blockchain_events`: Stores immutable audit style transaction records.
7. `ai_reports`: Stores AI verification result, image hash, verdict, and confidence.

## 7. Relationships

- One manufacturer can have many products.
- One product can have many batches.
- One batch can have many QR codes.
- One QR code can have many scans.
- One QR code can have many blockchain audit events.
- One QR code or product can have many AI verification reports.

## 8. Database Design Summary

Primary keys are used for all major tables. Foreign keys connect products to manufacturers, batches to products, QR codes to batches/products, scans to QR codes, blockchain events to QR codes, and AI reports to QR codes/products.

Important tables:

```sql
manufacturers(id, name, license_no, email, phone, created_at)
products(id, manufacturer_id, name, sku, canonical_image_url, created_at)
batches(id, product_id, name, size, created_at)
qrcodes(id, batch_id, product_id, token, signature, qr_url, created_at, scanned_count)
scans(id, qr_id, role, actor_id, actor_name, timestamp, location_json, is_duplicate)
blockchain_events(id, qr_id, event_type, metadata_json, tx_hash, block_number, timestamp)
ai_reports(id, qr_id, product_id, image_hash, verdict, confidence, reasons_json, created_at)
```

## 9. Main Modules

Product Management:
The admin can create products. Each product has a SKU and a default batch.

QR Generation:
The manufacturer selects a product and batch, then generates signed QR codes. These are stored in the `qrcodes` table.

QR Verification:
The QR token is verified using HMAC-SHA256. If valid, the system retrieves the QR code record from SQL and returns authenticity status.

Scan Tracking:
Every scan is inserted into the `scans` table with role, actor, location, duplicate status, and transaction hash.

Duplicate Detection:
If the same lifecycle state is scanned again, the system marks the scan as duplicate.

AI Verification:
Uploaded product images are hashed and stored as AI reports with verdict and confidence.

Audit Logging:
Every important scan or claim creates an entry in the `blockchain_events` table.

## 10. Advantages

- Uses SQL tables instead of unstructured JSON files.
- Supports normalized relational data with foreign keys.
- Provides easy querying of product, QR, scan, and report history.
- Demonstrates practical DBMS concepts through a working web application.
- Includes more than five entities required for the project.

## 11. Conclusion

ScanSafe is a SQL based DBMS project for product authentication and supply chain tracking. It shows how a relational database can be used to manage manufacturers, products, batches, QR codes, scans, audit logs, and AI verification reports. The project is suitable for DBMS submission because it includes multiple related entities, SQL schema design, primary and foreign key relationships, and real application workflows built on top of the database.
