"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ScannerProduct = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock: number;
  unit: string;
};

type QueueItem = { id: string; barcode: string };
type ScanResult = { kind: "idle" | "success" | "error"; title: string; detail: string };

function createScanId() {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `scan-${suffix}`;
}

function maskedBarcode(barcode: string) {
  if (barcode.length <= 6) return barcode;
  return `${barcode.slice(0, 3)}••••${barcode.slice(-3)}`;
}

export default function ScannerView({
  product,
  canScan,
  canManageBarcode,
  onScanned,
  onBarcodeSaved,
}: {
  product: ScannerProduct;
  canScan: boolean;
  canManageBarcode: boolean;
  onScanned: (stock: number) => void;
  onBarcodeSaved: () => void;
}) {
  const scannerInput = useRef<HTMLInputElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const scanQueue = useRef<QueueItem[]>([]);
  const isDrainingQueue = useRef(false);
  const lastEnqueuedScan = useRef<{ barcode: string; at: number } | null>(null);
  const [linkedBarcode, setLinkedBarcode] = useState(product.barcode);
  const [input, setInput] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [sessionScans, setSessionScans] = useState(0);
  const [lastResult, setLastResult] = useState<ScanResult>({
    kind: "idle",
    title: "Lector listo",
    detail: "Escanea un frasco. Cada lectura descontará una unidad.",
  });
  const [changingBarcode, setChangingBarcode] = useState(false);

  useEffect(() => {
    const focus = window.setTimeout(() => scannerInput.current?.focus(), 80);
    return () => window.clearTimeout(focus);
  }, [linkedBarcode, changingBarcode]);

  useEffect(() => () => {
    if (audioContext.current) void audioContext.current.close();
  }, []);

  function prepareSound() {
    if (!audioContext.current) audioContext.current = new AudioContext();
    if (audioContext.current.state === "suspended") void audioContext.current.resume();
  }

  const playFeedback = useCallback((success: boolean) => {
    if ("vibrate" in navigator) navigator.vibrate(success ? 45 : [80, 45, 80]);
    const context = audioContext.current;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = success ? 820 : 230;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.13);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.14);
  }, []);

  const processScan = useCallback(async (item: QueueItem) => {
    try {
      const response = await fetch("/api/inventory/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: item.barcode, scanId: item.id }),
      });
      const result = (await response.json()) as {
        error?: string;
        stock?: number;
        duplicate?: boolean;
        product?: string;
      };
      if (!response.ok || typeof result.stock !== "number") {
        throw new Error(result.error || "No fue posible registrar la lectura");
      }

      if (!result.duplicate) {
        setSessionScans((value) => value + 1);
        onScanned(result.stock);
      }
      setLastResult({
        kind: "success",
        title: result.duplicate ? "Lectura ya procesada" : "1 unidad descontada",
        detail: `${result.product || product.name} · Stock actual: ${result.stock.toLocaleString("es-CL")}`,
      });
      playFeedback(true);
    } catch (error) {
      setLastResult({
        kind: "error",
        title: "Lectura rechazada",
        detail: error instanceof Error ? error.message : "Revisa el código e intenta nuevamente.",
      });
      playFeedback(false);
    }
  }, [onScanned, playFeedback, product.name]);

  const drainQueue = useCallback(async () => {
    if (isDrainingQueue.current) return;
    isDrainingQueue.current = true;
    setProcessing(true);
    while (scanQueue.current.length > 0) {
      const item = scanQueue.current.shift();
      setQueueCount(scanQueue.current.length);
      if (item) await processScan(item);
    }
    isDrainingQueue.current = false;
    setProcessing(false);
    window.setTimeout(() => scannerInput.current?.focus(), 25);
  }, [processScan]);

  function enqueueScan(event: FormEvent) {
    event.preventDefault();
    prepareSound();
    const barcode = input.trim();
    if (!barcode) return;
    setInput("");
    const now = Date.now();
    if (
      lastEnqueuedScan.current?.barcode === barcode
      && now - lastEnqueuedScan.current.at < 500
    ) {
      setLastResult({
        kind: "error",
        title: "Lectura repetida bloqueada",
        detail: "Vuelve a apuntar al siguiente frasco y escanéalo nuevamente.",
      });
      playFeedback(false);
      return;
    }
    lastEnqueuedScan.current = { barcode, at: now };
    scanQueue.current.push({ id: createScanId(), barcode });
    setQueueCount(scanQueue.current.length);
    void drainQueue();
  }

  if (!linkedBarcode || changingBarcode) {
    return (
      <BarcodeSetup
        product={product}
        canManage={canManageBarcode}
        currentBarcode={linkedBarcode}
        onCancel={linkedBarcode ? () => setChangingBarcode(false) : undefined}
        onSaved={(barcode) => {
          setLinkedBarcode(barcode);
          setChangingBarcode(false);
          setLastResult({ kind: "idle", title: "Lector listo", detail: "Escanea un frasco. Cada lectura descontará una unidad." });
          onBarcodeSaved();
        }}
      />
    );
  }

  return (
    <section className="scanner-section">
      <div className="section-intro scanner-intro">
        <div>
          <h2>Despacho con código de barras</h2>
          <p>Conecta el lector USB o Bluetooth y escanea cada frasco que salga.</p>
        </div>
        {canManageBarcode && (
          <button className="button ghost" type="button" onClick={() => setChangingBarcode(true)}>
            Cambiar código vinculado
          </button>
        )}
      </div>

      <div className="scanner-layout">
        <article className="panel scanner-console">
          <div className="scanner-console-head">
            <div><span className="scanner-live-dot" />LECTOR ACTIVO</div>
            <span>{maskedBarcode(linkedBarcode)}</span>
          </div>

          {canScan ? (
            <>
              <form className="scanner-form" onSubmit={enqueueScan}>
                <label htmlFor="barcode-input">Escanea ahora</label>
                <div className="scanner-input-wrap">
                  <span aria-hidden="true">▥</span>
                  <input
                    ref={scannerInput}
                    id="barcode-input"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="El código aparecerá aquí"
                    autoComplete="off"
                    autoCapitalize="none"
                    enterKeyHint="done"
                    aria-describedby="scanner-help"
                  />
                  <button type="submit">Descontar</button>
                </div>
                <p id="scanner-help">El lector enviará Enter automáticamente. También puedes escribir el código y presionar Descontar.</p>
              </form>

              <div className={`scan-feedback ${lastResult.kind}`} aria-live="polite">
                <span aria-hidden="true">{lastResult.kind === "success" ? "✓" : lastResult.kind === "error" ? "!" : "▥"}</span>
                <div><strong>{lastResult.title}</strong><p>{lastResult.detail}</p></div>
              </div>

              <div className="scanner-queue">
                <span>{processing ? "Procesando lectura" : "Esperando próxima lectura"}</span>
                <strong>{queueCount ? `${queueCount} en cola` : "Sin pendientes"}</strong>
              </div>
            </>
          ) : (
            <div className="scanner-no-access">
              <span>⌾</span>
              <h3>Perfil de consulta o bodega</h3>
              <p>El descuento por escáner está disponible para Despacho, Miguel Angel y Daniela Vasquez.</p>
            </div>
          )}
        </article>

        <aside className="scanner-summary">
          <article className="panel scanner-stock-card">
            <span>STOCK DISPONIBLE</span>
            <strong>{product.stock.toLocaleString("es-CL")}</strong>
            <p>{product.unit}s</p>
          </article>
          <article className="panel scanner-session-card">
            <span>SESIÓN ACTUAL</span>
            <strong>{sessionScans.toLocaleString("es-CL")}</strong>
            <p>unidades escaneadas</p>
            <div><i style={{ width: `${Math.min(100, sessionScans * 5)}%` }} /></div>
          </article>
          <article className="scanner-tip">
            <span>i</span>
            <p><strong>Control trazable</strong>Cada lectura guarda el usuario, la fecha, la hora y el código utilizado.</p>
          </article>
        </aside>
      </div>
    </section>
  );
}

function BarcodeSetup({
  product,
  canManage,
  currentBarcode,
  onCancel,
  onSaved,
}: {
  product: ScannerProduct;
  canManage: boolean;
  currentBarcode: string | null;
  onCancel?: () => void;
  onSaved: (barcode: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [barcode, setBarcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => inputRef.current?.focus(), []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, barcode }),
      });
      const result = (await response.json()) as { error?: string; barcode?: string };
      if (!response.ok || !result.barcode) throw new Error(result.error || "No fue posible vincular el código");
      onSaved(result.barcode);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No fue posible guardar");
      setSaving(false);
    }
  }

  return (
    <section className="barcode-setup-section">
      <div className="section-intro">
        <div><h2>Configurar lector de código de barras</h2><p>Este paso se realiza una sola vez para identificar LinaDigest.</p></div>
      </div>
      <article className="panel barcode-setup-card">
        <div className="barcode-setup-icon">▥</div>
        {canManage ? (
          <>
            <p className="panel-kicker">VINCULAR PRODUCTO</p>
            <h3>{currentBarcode ? "Cambiar código de barras" : "Escanea un frasco de LinaDigest"}</h3>
            <p>Apunta el lector al código impreso en el envase. Al recibirlo, quedará asociado a <strong>{product.name}</strong>.</p>
            <form onSubmit={save} className="barcode-setup-form">
              <label htmlFor="barcode-setup-input">Código leído</label>
              <div>
                <input
                  ref={inputRef}
                  id="barcode-setup-input"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder="Escanea o escribe el código"
                  autoComplete="off"
                  autoCapitalize="none"
                  minLength={4}
                  required
                />
                <button className="button primary" type="submit" disabled={saving}>{saving ? "Vinculando…" : "Vincular código"}</button>
              </div>
              {error && <p className="form-error">{error}</p>}
              {onCancel && <button className="text-button" type="button" onClick={onCancel}>Cancelar cambio</button>}
            </form>
          </>
        ) : (
          <>
            <p className="panel-kicker">CONFIGURACIÓN PENDIENTE</p>
            <h3>Falta vincular el código de LinaDigest</h3>
            <p>Miguel Angel o Daniela Vasquez deben ingresar a esta sección y escanear un frasco una sola vez.</p>
          </>
        )}
      </article>
    </section>
  );
}
