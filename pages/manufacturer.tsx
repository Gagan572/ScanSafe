import { FormEvent, useEffect, useState } from 'react';

interface ProductBatch {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  batches: ProductBatch[];
}

interface GenerateResponse {
  tokens: string[];
  qrcodes: { id: string; qrUrl: string; token: string }[];
  printableUrl: string;
}

export default function ManufacturerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data);
        if (data.length > 0) {
          setProductId(data[0].id);
          if (data[0].batches?.length > 0) {
            setBatchId(data[0].batches[0].id);
          }
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!productId || !batchId || count <= 0) {
      setError('Please select product, batch and count > 0');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, batchId, count }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate QRs');
      } else {
        setResult(data as GenerateResponse);
      }
    } catch (err) {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <section className="manufacturer-page">
      <div className="manufacturer-header">
        <h1>Manufacturer QR Codes</h1>
        <p>Create secure product QR codes that work from laptops, tablets, and phones on your network.</p>
      </div>

      <div className="card manufacturer-card">
        <form className="manufacturer-form" onSubmit={onSubmit}>
          <label>
            Product
            <select
              className="select"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                if (p && p.batches.length > 0) {
                  setBatchId(p.batches[0].id);
                }
              }}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{`${p.name} (${p.sku})`}</option>
              ))}
            </select>
          </label>

          <label>
            Batch
            <select
              className="select"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">Select batch</option>
              {selectedProduct?.batches?.map((b) => (
                <option key={b.id} value={b.id}>{`${b.name}`}</option>
              ))}
            </select>
          </label>

          <label>
            Number of QR codes
            <input
              className="input"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value || '0', 10))}
            />
          </label>

          {error && <p className="text-error">{error}</p>}

          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Generating...' : 'Generate QR Codes'}
          </button>
        </form>
      </div>

      {result && (
        <div className="card manufacturer-results">
          <div className="manufacturer-results-header">
            <h2>Generated QR Codes</h2>
            <p>Printable sheet hint URL: {result.printableUrl}</p>
          </div>

          <div className="qr-grid">
            {result.qrcodes.map((q) => (
              <div key={q.id} className="qr-card">
                <img className="qr-image" src={q.qrUrl} alt={q.id} />
                <div className="qr-id">{q.id}</div>
                <a
                  href={q.qrUrl}
                  download={`scansafe-${q.id}.png`}
                  className="button button-secondary"
                >
                  Download PNG
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
