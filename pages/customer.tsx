import { FormEvent, useState } from 'react';
import { QrScanner } from '../components/QrScanner';

interface VerifyResponse {
  status: 'AUTHENTIC' | 'DUPLICATE' | 'INVALID';
  qr?: any;
  scanRecord?: any;
  error?: string;
}

export default function CustomerPage() {
  const [token, setToken] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const applyScannedToken = (raw: string) => {
    let value = raw.trim();
    try {
      const url = new URL(raw);
      const tokenParam = url.searchParams.get('token');
      if (tokenParam) {
        value = tokenParam;
      }
    } catch {
      // not a URL, use as-is
    }
    setToken(value);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!token) {
      setError('Token is required');
      return;
    }
    setLoading(true);
    try {
      let res: Response;
      if (ownerName) {
        res = await fetch('/api/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, ownerName, ownerId: ownerId || ownerName }),
        });
      } else {
        res = await fetch('/api/qr/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            role: 'customer',
            actorName: ownerName || 'Customer',
            actorId: ownerId || 'customer',
          }),
        });
      }
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        setError(data.error || 'Request failed');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Customer Verify &amp; Claim</h1>
      <p>Scan or paste a QR to check authenticity and (optionally) claim ownership.</p>

      <div className="page-grid">
        <div>
          <div className="card">
            <form onSubmit={onSubmit}>
              <label>
                QR Token
                <textarea
                  className="textarea"
                  rows={3}
                  value={token}
                  placeholder="Paste token from QR or scan with camera"
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>

              <div className="scan-actions-row">
                <small>
                  You can verify anonymously or provide details to claim this item.
                </small>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setShowScanner((v) => !v)}
                >
                  {showScanner ? 'Hide camera' : 'Scan with camera'}
                </button>
              </div>

              <label>
                Your Name (optional, to claim ownership)
                <input
                  className="input"
                  value={ownerName}
                  placeholder="Name on warranty / invoice"
                  onChange={(e) => setOwnerName(e.target.value)}
                />
              </label>

              <label>
                Your ID (optional)
                <input
                  className="input"
                  value={ownerId}
                  placeholder="Customer ID, phone or email (optional)"
                  onChange={(e) => setOwnerId(e.target.value)}
                />
              </label>

              {error && <p className="text-error">{error}</p>}

              <button className="button" type="submit" disabled={loading}>
                {loading ? 'Submitting…' : ownerName ? 'Verify & Claim Ownership' : 'Verify Only'}
              </button>
            </form>
          </div>

          {result && (
            <div className="card">
              <h2>Result: {result.status}</h2>
              {result.scanRecord?.isDuplicate && (
                <span className="badge badge-danger">Duplicate ownership detected</span>
              )}
              <h3>QR Snapshot</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(result.qr, null, 2)}
              </pre>
              <h3>Scan / Claim Record</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(result.scanRecord, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div>
          {showScanner && (
            <QrScanner
              onToken={(value) => {
                applyScannedToken(value);
                setShowScanner(false);
              }}
              onClose={() => setShowScanner(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
