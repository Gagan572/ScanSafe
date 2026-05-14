import { FormEvent, useState } from 'react';
import { QrScanner } from '../components/QrScanner';

type Role = 'manufacturer' | 'distributor' | 'retailer' | 'customer';

interface VerifyResponse {
  status: 'AUTHENTIC' | 'DUPLICATE' | 'INVALID';
  qr?: any;
  scanRecord?: any;
  error?: string;
}

export default function ScanPage() {
  const [token, setToken] = useState('');
  const [role, setRole] = useState<Role>('manufacturer');
  const [actorId, setActorId] = useState('');
  const [actorName, setActorName] = useState('');
  const [location, setLocation] = useState('');
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
    if (!token || !actorName) {
      setError('Token and actor name are required');
      return;
    }
    setLoading(true);
    try {
      const body: any = { token, role, actorId: actorId || actorName, actorName };
      if (location) {
        body.location = location;
      }
      const res = await fetch('/api/qr/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        setError(data.error || 'Verification failed');
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
      <h1>Supply Chain Scan / Verify</h1>
      <p>Scan or paste a product QR and log its journey through the supply chain.</p>

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
                  placeholder="Paste token or scan with camera"
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>

              <div className="scan-actions-row">
                <small>
                  Camera scan reads either the raw token or a full URL containing <code>?token=</code>.
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
                Role
                <select
                  className="select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="manufacturer">Manufacturer</option>
                  <option value="distributor">Distributor</option>
                  <option value="retailer">Retailer</option>
                  <option value="customer">Customer</option>
                </select>
              </label>

              <label>
                Actor Name
                <input
                  className="input"
                  value={actorName}
                  placeholder="e.g. Factory A, Distributor X"
                  onChange={(e) => setActorName(e.target.value)}
                />
              </label>

              <label>
                Actor ID (optional)
                <input
                  className="input"
                  value={actorId}
                  placeholder="Internal code or ID (optional)"
                  onChange={(e) => setActorId(e.target.value)}
                />
              </label>

              <label>
                Location (optional, e.g. "12.9,77.6")
                <input
                  className="input"
                  value={location}
                  placeholder="lat,lon or city name"
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>

              {error && <p className="text-error">{error}</p>}

              <button className="button" type="submit" disabled={loading}>
                {loading ? 'Verifying…' : 'Scan / Verify'}
              </button>
            </form>
          </div>

          {result && (
            <div className="card">
              <h2>Result: {result.status}</h2>
              {result.scanRecord?.isDuplicate && (
                <span className="badge badge-danger">Duplicate detected</span>
              )}
              <h3>QR Snapshot</h3>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {JSON.stringify(result.qr, null, 2)}
              </pre>
              <h3>Scan Record</h3>
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
