import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  onToken: (token: string) => void;
  onClose?: () => void;
}

export function QrScanner({ onToken, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraFileRef = useRef<HTMLInputElement | null>(null);
  const uploadFileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageScanning, setImageScanning] = useState(false);

  const detectWithBarcodeDetector = async (
    source: HTMLCanvasElement | HTMLImageElement,
  ): Promise<string | null> => {
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      return null;
    }

    try {
      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const codes = await detector.detect(source);
      return codes?.[0]?.rawValue || null;
    } catch {
      return null;
    }
  };

  const drawImageToCanvas = (
    image: HTMLImageElement,
    maxSize: number,
    rotation = 0,
  ): HTMLCanvasElement => {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const rotated = rotation === 90 || rotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? height : width;
    canvas.height = rotated ? width : height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Image scanning is not supported in this browser');
    }

    ctx.save();
    if (rotation === 90) {
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
    } else if (rotation === 180) {
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
    } else if (rotation === 270) {
      ctx.translate(0, canvas.height);
      ctx.rotate((3 * Math.PI) / 2);
    }
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();

    return canvas;
  };

  const detectWithJsQr = (canvas: HTMLCanvasElement): string | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(imageData.data, canvas.width, canvas.height, {
      inversionAttempts: 'attemptBoth',
    });

    return result?.data || null;
  };

  const detectQrInImage = async (image: HTMLImageElement): Promise<string | null> => {
    const nativeResult = await detectWithBarcodeDetector(image);
    if (nativeResult) {
      return nativeResult;
    }

    const maxSizes = [1800, 1200, 800, 500];
    const rotations = [0, 90, 180, 270];

    for (const maxSize of maxSizes) {
      for (const rotation of rotations) {
        const canvas = drawImageToCanvas(image, maxSize, rotation);
        const barcodeResult = await detectWithBarcodeDetector(canvas);
        if (barcodeResult) {
          return barcodeResult;
        }

        const jsQrResult = detectWithJsQr(canvas);
        if (jsQrResult) {
          return jsQrResult;
        }
      }
    }

    return null;
  };

  const readQrFromImage = async (file: File) => {
    setError(null);
    setImageScanning(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(file);
      });

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = dataUrl;
      });

      const result = await detectQrInImage(image);

      if (!result) {
        throw new Error('No QR code found. Fill the photo mostly with the QR square and keep all four corners visible.');
      }

      onToken(result);
      if (onClose) {
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Could not scan QR from image');
    } finally {
      setImageScanning(false);
      if (cameraFileRef.current) {
        cameraFileRef.current.value = '';
      }
      if (uploadFileRef.current) {
        uploadFileRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameHandle: number | null = null;

    function stop() {
      cancelled = true;
      if (frameHandle !== null && typeof window !== 'undefined') {
        window.clearTimeout(frameHandle);
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    }

    async function start() {
      try {
        if (typeof window === 'undefined') return;

        if (!window.isSecureContext && window.location.hostname !== 'localhost') {
          throw new Error('Live camera needs HTTPS on phones. Use Scan from photo below, or open the site on localhost.');
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Live camera is not supported in this browser. Use Scan from photo below.');
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const scanLoop = () => {
          if (cancelled || !video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            frameHandle = window.setTimeout(scanLoop, 400);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          try {
            const result = jsQR(imageData.data, canvas.width, canvas.height);
            if (result && result.data) {
              onToken(result.data);
              if (onClose) {
                onClose();
              }
              stop();
              return;
            }
          } catch {
            // ignore decoding errors
          }

          frameHandle = window.setTimeout(scanLoop, 400);
        };

        scanLoop();
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Unable to access live camera. Use Scan from photo below.');
        }
      }
    }

    start();

    return () => {
      stop();
    };
  }, [onToken, onClose]);

  return (
    <div className="card card--subtle">
      <div className="scanner-header">
        <div>
          <h3 className="scanner-title">Scan QR with Camera</h3>
          <p className="scanner-subtitle">Align the QR code within the frame</p>
        </div>
        {onClose && (
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <div className="scanner-view">
        <video
          ref={videoRef}
          style={{ width: '100%', height: 'auto' }}
          muted
          playsInline
        />
        <div className="scanner-overlay" />
      </div>
      <div className="scanner-actions">
        <input
          ref={cameraFileRef}
          className="scanner-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              readQrFromImage(file);
            }
          }}
        />
        <input
          ref={uploadFileRef}
          className="scanner-file-input"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              readQrFromImage(file);
            }
          }}
        />
        <button
          type="button"
          className="button button-secondary"
          disabled={imageScanning}
          onClick={() => cameraFileRef.current?.click()}
        >
          {imageScanning ? 'Scanning...' : 'Take photo'}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={imageScanning}
          onClick={() => uploadFileRef.current?.click()}
        >
          Upload from device
        </button>
      </div>
      {error && <p className="text-error">{error}</p>}
    </div>
  );
}
