"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ScannerView from "./scanner-view";

type TabId = "inicio" | "escaner" | "inventario" | "movimientos" | "usuarios";
type MovementType = "initial" | "entry" | "output";
type AppRole = "owner" | "admin" | "warehouse" | "dispatch" | "viewer";

type Product = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  stock: number;
  initialStock: number;
  cost: number | null;
  price: number;
  minStock: number;
  unit: string;
  stockValue: number | null;
  projectedMargin: number | null;
  updatedAt: string;
};

type Movement = {
  id: number;
  type: MovementType;
  quantity: number;
  delta: number;
  reason: string;
  lot: string | null;
  expirationDate: string | null;
  note: string | null;
  userId: string;
  userName: string;
  createdAt: string;
};

type Account = {
  id: number;
  name: string;
  username: string | null;
  role: AppRole;
  canViewCost: boolean;
  canManageUsers: boolean;
  active: boolean;
  systemAccount: boolean;
  mustChangePassword: boolean;
};

type CurrentUser = Omit<Account, "active" | "systemAccount">;

type InventoryData = {
  currentUser: CurrentUser;
  product: Product;
  history: Movement[];
  accounts: Account[];
  stats: { entries: number; outputs: number };
  permissions: { canViewCost: boolean; canManageUsers: boolean; allowed: readonly string[] };
};

const NAV_ITEMS: { id: TabId; label: string; symbol: string }[] = [
  { id: "inicio", label: "Inicio", symbol: "⌂" },
  { id: "escaner", label: "Escanear", symbol: "▥" },
  { id: "inventario", label: "Inventario", symbol: "▦" },
  { id: "movimientos", label: "Movimientos", symbol: "⇄" },
  { id: "usuarios", label: "Usuarios", symbol: "♙" },
];

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null) {
  return value === null ? "Restringido" : CLP.format(value);
}

function formatDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatExportDate(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function movementTypeLabel(type: MovementType) {
  if (type === "entry") return "Entrada";
  if (type === "output") return "Salida";
  return "Inventario inicial";
}

function todayLabel() {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function roleLabel(role: AppRole) {
  if (role === "admin") return "Administrador";
  if (role === "warehouse") return "Bodega";
  if (role === "dispatch") return "Despacho";
  if (role === "owner") return "Propietaria del sistema";
  return "Solo lectura";
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LD";
}

export default function InventoryApp({ session }: { session: { name: string; username: string; mustChangePassword: boolean } }) {
  const [activeTab, setActiveTab] = useState<TabId>("inicio");
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"entry" | "output" | null>(null);
  const [toast, setToast] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(session.mustChangePassword);

  const loadInventory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      const payload = (await response.json()) as InventoryData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No fue posible cargar el inventario");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error al cargar");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadInventory(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadInventory]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const canEnter = data?.permissions.allowed.includes("entry") ?? false;
  const canOutput = data?.permissions.allowed.includes("output") ?? false;
  const lowStock = data ? data.product.stock <= data.product.minStock : false;

  const pageTitle = useMemo(
    () => NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? "Inicio",
    [activeTab],
  );

  async function registerMovement(payload: {
    type: "entry" | "output";
    quantity: number;
    reason: string;
    lot?: string;
    expirationDate?: string;
    note?: string;
  }) {
    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string; stock?: number };
    if (!response.ok) throw new Error(result.error || "No fue posible registrar el movimiento");
    setModal(null);
    setToast(
      `${payload.type === "entry" ? "Entrada" : "Salida"} registrada. Nuevo stock: ${result.stock?.toLocaleString("es-CL")}`,
    );
    await loadInventory();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Image src="/linadigest-logo-corporativo.png" alt="LinaDigest" width={58} height={52} priority unoptimized />
          </div>
          <div>
            <strong>LinaDigest</strong>
            <span>Control de inventario</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Navegación principal">
          <span className="nav-caption">MENÚ PRINCIPAL</span>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-symbol" aria-hidden="true">{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="side-status">
          <span className="status-dot" />
          <div><strong>Sistema operativo</strong><span>Datos sincronizados</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            {activeTab !== "inicio" && (
              <button className="home-button" type="button" onClick={() => setActiveTab("inicio")} aria-label="Volver al inicio" title="Volver al inicio">
                <span aria-hidden="true">⌂</span><span className="home-label">Inicio</span>
              </button>
            )}
            <div>
              <p className="eyebrow">{todayLabel()}</p>
              <h1>{pageTitle}</h1>
            </div>
          </div>
          <div className="signed-user">
            <span className="profile-avatar">{initials(data?.currentUser.name ?? session.name)}</span>
            <span className="profile-copy">
              <strong>{data?.currentUser.name ?? session.name}</strong>
              <small>{data ? roleLabel(data.currentUser.role) : `@${session.username}`}</small>
            </span>
            <button type="button" onClick={() => void signOut()} aria-label="Cerrar sesión" title="Cerrar sesión">↪</button>
          </div>
        </header>

        <div className="content-wrap">
          {error ? (
            <div className="error-card" role="alert">
              <span>!</span><div><strong>No pudimos cargar el inventario</strong><p>{error}</p></div>
              <button type="button" onClick={() => void loadInventory()}>Reintentar</button>
            </div>
          ) : loading || !data ? (
            <LoadingState />
          ) : (
            <>
              {activeTab === "inicio" && (
                <Dashboard
                  data={data}
                  lowStock={lowStock}
                  canEnter={canEnter}
                  canOutput={canOutput}
                  onEntry={() => setModal("entry")}
                  onOutput={() => setModal("output")}
                  onNavigate={setActiveTab}
                />
              )}
              {activeTab === "inventario" && (
                <InventoryView data={data} onEntry={() => setModal("entry")} onOutput={() => setModal("output")} />
              )}
              {activeTab === "escaner" && (
                <ScannerView
                  product={data.product}
                  canScan={canOutput}
                  canManageBarcode={data.permissions.canManageUsers}
                  onScanned={(stock) => {
                    setData((current) => current ? {
                      ...current,
                      product: { ...current.product, stock },
                      stats: { ...current.stats, outputs: current.stats.outputs + 1 },
                    } : current);
                    void loadInventory(true);
                  }}
                  onBarcodeSaved={() => void loadInventory(true)}
                />
              )}
              {activeTab === "movimientos" && <MovementsView history={data.history} />}
              {activeTab === "usuarios" && (
                <UsersView
                  accounts={data.accounts}
                  canManage={data.permissions.canManageUsers}
                  onSaved={loadInventory}
                />
              )}
            </>
          )}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeTab === item.id ? "active" : ""}
            onClick={() => setActiveTab(item.id)}
          >
            <span aria-hidden="true">{item.symbol}</span>{item.label}
          </button>
        ))}
      </nav>

      {modal && (
        <MovementModal
          type={modal}
          stock={data?.product.stock ?? 0}
          onClose={() => setModal(null)}
          onSubmit={registerMovement}
        />
      )}
      {mustChangePassword && (
        <PasswordChangeModal
          onSaved={() => {
            setMustChangePassword(false);
            setToast("Tu nueva clave quedó guardada");
          }}
        />
      )}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Dashboard({
  data,
  lowStock,
  canEnter,
  canOutput,
  onEntry,
  onOutput,
  onNavigate,
}: {
  data: InventoryData;
  lowStock: boolean;
  canEnter: boolean;
  canOutput: boolean;
  onEntry: () => void;
  onOutput: () => void;
  onNavigate: (tab: TabId) => void;
}) {
  const { product } = data;
  const stockPercent = Math.min(100, Math.max(4, (product.stock / product.initialStock) * 100));

  return (
    <>
      <section className="welcome-row">
        <div>
          <h2>Hola, aquí está tu inventario</h2>
          <p>Revisa el stock disponible y registra cada movimiento de LinaDigest.</p>
        </div>
        <div className="action-buttons">
          {canEnter && <button className="button secondary" type="button" onClick={onEntry}><span>＋</span>Registrar entrada</button>}
          {canOutput && <button className="button primary" type="button" onClick={() => onNavigate("escaner")}><span>▥</span>Escanear salida</button>}
          {canOutput && <button className="button ghost" type="button" onClick={onOutput}><span>−</span>Salida manual</button>}
        </div>
      </section>

      <section className="stats-grid" aria-label="Resumen del inventario">
        <article className="stat-card">
          <div className="stat-icon initial">◆</div>
          <div><span>Cantidad inicial</span><strong>{product.initialStock.toLocaleString("es-CL")}</strong><small>unidades</small></div>
        </article>
        <article className="stat-card featured">
          <div className="stat-icon boxes">▦</div>
          <div><span>Stock disponible</span><strong>{product.stock.toLocaleString("es-CL")}</strong><small>{product.unit}s</small></div>
          <span className={lowStock ? "trend warning" : "trend good"}>{lowStock ? "Stock bajo" : "Nivel saludable"}</span>
        </article>
        <article className="stat-card">
          <div className="stat-icon price">$</div>
          <div><span>Precio de venta</span><strong>{formatCurrency(product.price)}</strong><small>por unidad</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon entries">↙</div>
          <div><span>Entradas registradas</span><strong>{data.stats.entries.toLocaleString("es-CL")}</strong><small>unidades</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon outputs">↗</div>
          <div><span>Salidas registradas</span><strong>{data.stats.outputs.toLocaleString("es-CL")}</strong><small>unidades</small></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel product-panel">
          <div className="panel-heading">
            <div><p className="panel-kicker">PRODUCTO ACTIVO</p><h3>Estado de inventario</h3></div>
            <span className="active-badge"><i />Disponible</span>
          </div>
          <div className="product-overview">
            <div className="product-picture"><Image src="/linadigest-logo-corporativo.png" alt="Logo de LinaDigest" width={168} height={148} unoptimized /></div>
            <div className="product-info">
              <span className="sku">SKU {product.sku}</span>
              <h4>{product.name}</h4>
              <p>Presentación de 400 g · 100% natural</p>
              <div className="stock-bar-header"><span>Nivel de stock</span><strong>{product.stock.toLocaleString("es-CL")} uds.</strong></div>
              <div className="stock-bar"><i style={{ width: `${stockPercent}%` }} /></div>
              <div className="stock-scale"><span>Mínimo: {product.minStock}</span><span>Cantidad inicial: {product.initialStock.toLocaleString("es-CL")}</span></div>
            </div>
          </div>
          {data.permissions.canViewCost ? (
            <div className="financial-strip">
              <div><span>Costo unitario</span><strong>{formatCurrency(product.cost)}</strong></div>
              <div><span>Inventario valorizado</span><strong>{formatCurrency(product.stockValue)}</strong></div>
              <div><span>Margen proyectado</span><strong>{formatCurrency(product.projectedMargin)}</strong></div>
            </div>
          ) : (
            <div className="restricted-strip"><span>⌾</span><p><strong>Información protegida</strong>Los costos y la valorización solo están visibles para los administradores.</p></div>
          )}
        </article>

        <article className="panel activity-panel">
          <div className="panel-heading">
            <div><p className="panel-kicker">ACTIVIDAD</p><h3>Últimos movimientos</h3></div>
            <button className="text-button" type="button" onClick={() => onNavigate("movimientos")}>Ver todos</button>
          </div>
          <MovementList history={data.history.slice(0, 5)} compact />
        </article>
      </section>
    </>
  );
}

function InventoryView({ data, onEntry, onOutput }: { data: InventoryData; onEntry: () => void; onOutput: () => void }) {
  return (
    <section>
      <div className="section-intro">
        <div><h2>Inventario de productos</h2><p>La estructura está lista para agregar nuevas presentaciones y productos.</p></div>
        <div className="action-buttons">
          {data.permissions.allowed.includes("entry") && <button className="button secondary" onClick={onEntry}>＋ Entrada</button>}
          {data.permissions.allowed.includes("output") && <button className="button primary" onClick={onOutput}>− Salida</button>}
        </div>
      </div>
      <div className="panel inventory-table-wrap">
        <div className="inventory-table-head"><span>Producto</span><span>Stock</span><span>Costo</span><span>Precio venta</span><span>Estado</span></div>
        <div className="inventory-row">
          <div className="inventory-product"><Image src="/linadigest-logo-corporativo.png" alt="LinaDigest" width={58} height={52} unoptimized /><div><strong>{data.product.name}</strong><span>{data.product.sku} · {data.product.unit}</span></div></div>
          <strong>{data.product.stock.toLocaleString("es-CL")}</strong>
          <span className={data.product.cost === null ? "restricted-value" : ""}>{data.product.cost === null ? "🔒 Oculto" : formatCurrency(data.product.cost)}</span>
          <strong>{formatCurrency(data.product.price)}</strong>
          <span className="active-badge"><i />Activo</span>
        </div>
      </div>
      <div className="growth-note"><span>＋</span><div><strong>Preparado para crecer</strong><p>La próxima versión puede incluir más productos, categorías, bodegas y variantes sin modificar la base actual.</p></div></div>
    </section>
  );
}

function MovementsView({ history }: { history: Movement[] }) {
  const [filter, setFilter] = useState<"all" | MovementType>("all");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const visible = filter === "all" ? history : history.filter((item) => item.type === filter);

  async function loadExportHistory() {
    const query = filter === "all" ? "" : `?type=${filter}`;
    const response = await fetch(`/api/inventory/export${query}`, { cache: "no-store" });
    const payload = (await response.json()) as { history?: Movement[]; error?: string };
    if (!response.ok || !payload.history) {
      throw new Error(payload.error || "No fue posible preparar el historial");
    }
    return payload.history;
  }

  async function exportExcel() {
    setExporting("excel");
    try {
      const movements = await loadExportHistory();
      const XLSX = await import("xlsx");
      const rows = movements.map((movement) => ({
        Fecha: formatExportDate(movement.createdAt),
        Tipo: movementTypeLabel(movement.type),
        Motivo: movement.reason,
        Cantidad: movement.quantity,
        Movimiento: movement.delta,
        Lote: movement.lot ?? "",
        Vencimiento: movement.expirationDate ?? "",
        Usuario: movement.userName,
        Nota: movement.note ?? "",
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [
        { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 12 }, { wch: 13 },
        { wch: 14 }, { wch: 15 }, { wch: 24 }, { wch: 32 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Movimientos");
      XLSX.writeFile(workbook, `Movimientos_LinaDigest_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    } catch (exportError) {
      window.alert(exportError instanceof Error ? exportError.message : "No fue posible exportar a Excel");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    try {
      const movements = await loadExportHistory();
      const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const document = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      document.setTextColor(66, 27, 89);
      document.setFontSize(17);
      document.text("Historial de movimientos LinaDigest", 14, 16);
      document.setTextColor(110, 101, 116);
      document.setFontSize(9);
      document.text(`Generado el ${new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`, 14, 22);
      autoTableModule.default(document, {
        startY: 28,
        head: [["Fecha", "Tipo", "Motivo", "Cantidad", "Movimiento", "Lote", "Vencimiento", "Usuario", "Nota"]],
        body: movements.map((movement) => [
          formatExportDate(movement.createdAt),
          movementTypeLabel(movement.type),
          movement.reason,
          movement.quantity.toLocaleString("es-CL"),
          `${movement.delta > 0 ? "+" : ""}${movement.delta.toLocaleString("es-CL")}`,
          movement.lot ?? "",
          movement.expirationDate ?? "",
          movement.userName,
          movement.note ?? "",
        ]),
        styles: { fontSize: 7, cellPadding: 2.2, overflow: "linebreak" },
        headStyles: { fillColor: [83, 35, 109], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 245, 250] },
        columnStyles: { 2: { cellWidth: 38 }, 8: { cellWidth: 45 } },
      });
      document.save(`Movimientos_LinaDigest_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (exportError) {
      window.alert(exportError instanceof Error ? exportError.message : "No fue posible exportar a PDF");
    } finally {
      setExporting(null);
    }
  }

  return (
    <section>
      <div className="section-intro">
        <div><h2>Historial de movimientos</h2><p>Cada cambio queda registrado; el historial no se borra.</p></div>
        <div className="action-buttons export-buttons">
          <button className="button secondary" type="button" onClick={() => void exportExcel()} disabled={Boolean(exporting)}><span>▦</span>{exporting === "excel" ? "Preparando…" : "Exportar Excel"}</button>
          <button className="button primary" type="button" onClick={() => void exportPdf()} disabled={Boolean(exporting)}><span>▤</span>{exporting === "pdf" ? "Preparando…" : "Exportar PDF"}</button>
        </div>
      </div>
      <div className="filter-row">
        {(["all", "entry", "output", "initial"] as const).map((value) => (
          <button key={value} className={filter === value ? "filter active" : "filter"} onClick={() => setFilter(value)}>
            {value === "all" ? "Todos" : value === "entry" ? "Entradas" : value === "output" ? "Salidas" : "Inicial"}
          </button>
        ))}
      </div>
      <article className="panel movement-table">
        <MovementList history={visible} />
      </article>
    </section>
  );
}

function MovementList({ history, compact = false }: { history: Movement[]; compact?: boolean }) {
  if (!history.length) return <div className="empty-state"><span>⇄</span><p>Aún no hay movimientos en esta categoría.</p></div>;
  return (
    <div className={compact ? "movement-list compact" : "movement-list"}>
      {history.map((movement) => (
        <div className="movement-item" key={movement.id}>
          <span className={`movement-icon ${movement.type}`} aria-hidden="true">{movement.type === "entry" ? "↙" : movement.type === "output" ? "↗" : "◆"}</span>
          <div className="movement-main"><strong>{movement.reason}</strong><span>{movement.userName} · {formatDate(movement.createdAt)}</span>{!compact && (movement.lot || movement.note) && <small>{movement.lot ? `Lote ${movement.lot}` : ""}{movement.lot && movement.note ? " · " : ""}{movement.note}</small>}</div>
          <strong className={`movement-quantity ${movement.type}`}>{movement.delta > 0 ? "+" : ""}{movement.delta.toLocaleString("es-CL")}</strong>
        </div>
      ))}
    </div>
  );
}

function UsersView({
  accounts,
  canManage,
  onSaved,
}: {
  accounts: Account[];
  canManage: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const operationalAccounts = accounts.filter((account) => !account.systemAccount);

  if (!canManage) {
    return (
      <section>
        <div className="section-intro"><div><h2>Usuarios y permisos</h2><p>Los accesos son administrados de forma individual.</p></div></div>
        <div className="panel access-summary">
          <span>⌾</span>
          <div><h3>Tu acceso está protegido</h3><p>Solo Miguel Angel, Daniela Vasquez y la cuenta propietaria pueden habilitar o modificar usuarios.</p></div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="section-intro">
        <div><h2>Usuarios y permisos</h2><p>Asigna un usuario y una clave temporal para acceder desde cualquier equipo.</p></div>
        <button className="button primary" type="button" onClick={() => setEditing("new")}>＋ Agregar usuario</button>
      </div>
      <div className="users-grid">
        {operationalAccounts.map((account) => (
          <article className="user-card" key={account.id}>
            <div className={`large-avatar ${account.role === "admin" ? "admin" : "operator"}`}>{initials(account.name)}</div>
            <div className="user-card-title">
              <h3>{account.name}</h3>
              <span className={account.active ? "user-status active" : "user-status pending"}>{account.active ? "Activo" : "Pendiente"}</span>
            </div>
            <p>{roleLabel(account.role)}</p>
            <div className="user-email">{account.username ? `@${account.username}` : "Falta asignar usuario"}</div>
            <ul>
              <li><i>✓</i>Consultar stock e historial</li>
              <li><i>✓</i>{account.role === "warehouse" ? "Registrar entradas" : account.role === "dispatch" ? "Registrar salidas" : account.role === "viewer" ? "Acceso de solo lectura" : "Registrar entradas y salidas"}</li>
              <li className={account.canViewCost ? "" : "muted"}><i>{account.canViewCost ? "✓" : "×"}</i>Ver costos y valorización</li>
            </ul>
            <button className="edit-user" type="button" onClick={() => setEditing(account)}>Editar acceso</button>
          </article>
        ))}
      </div>
      <div className="security-note"><span>⌾</span><div><strong>Accesos individuales y trazables</strong><p>Cada persona entra con su propia cuenta. El sistema registra su nombre en cada entrada o salida y nunca envía los costos a perfiles sin autorización.</p></div></div>
      {editing && <UserModal account={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await onSaved(); }} />}
    </section>
  );
}

function UserModal({
  account,
  onClose,
  onSaved,
}: {
  account: Account | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>(account?.role === "owner" ? "viewer" : account?.role ?? "viewer");
  const [active, setActive] = useState(account?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/users", {
        method: account ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account?.id, name, username, password, role, active }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No fue posible guardar el usuario");
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No fue posible guardar");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-head">
          <div className="modal-symbol user">♙</div>
          <div><span>{account ? "EDITAR ACCESO" : "NUEVO USUARIO"}</span><h2>{account ? account.name : "Agregar usuario"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del usuario" required /></label>
        <label>Nombre de usuario<input autoCapitalize="none" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="Ej. bodega" pattern="[a-z0-9._-]{3,32}" required /></label>
        <label>{account ? "Nueva clave temporal (opcional)" : "Clave temporal"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={account ? "Déjala vacía para conservarla" : "Mínimo 8 caracteres"} minLength={account ? undefined : 8} required={!account} /></label>
        <label>Perfil<select value={role} onChange={(event) => setRole(event.target.value as AppRole)}><option value="viewer">Solo lectura</option><option value="warehouse">Bodega · entradas</option><option value="dispatch">Despacho · salidas</option><option value="admin">Administrador · acceso total y costos</option></select></label>
        {account && <label className="switch-row"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span>Usuario activo</span></label>}
        <div className="permission-preview"><strong>{role === "admin" ? "Acceso con costos" : "Costos protegidos"}</strong><span>{role === "admin" ? "Este perfil podrá ver costo, valorización y margen." : "Este perfil no recibirá información de costos."}</span></div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Guardando..." : "Guardar acceso"}</button></div>
      </form>
    </div>
  );
}

function PasswordChangeModal({ onSaved }: { onSaved: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "No fue posible cambiar la clave");
      onSaved();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "No fue posible cambiar la clave");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop required-password" role="presentation">
      <form className="modal-card password-card" onSubmit={submit}>
        <div className="modal-head">
          <div className="modal-symbol user">⌾</div>
          <div><span>PRIMER INGRESO</span><h2>Crea tu nueva clave</h2></div>
        </div>
        <p className="password-copy">Por seguridad, reemplaza la clave temporal antes de comenzar a registrar movimientos.</p>
        <label>Nueva clave<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" minLength={8} required autoFocus /></label>
        <label>Repetir nueva clave<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repite la clave" minLength={8} required /></label>
        <div className="permission-preview"><strong>Requisito de seguridad</strong><span>Usa al menos 8 caracteres, incluyendo una letra y un número.</span></div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar nueva clave"}</button></div>
      </form>
    </div>
  );
}

function MovementModal({
  type,
  stock,
  onClose,
  onSubmit,
}: {
  type: "entry" | "output";
  stock: number;
  onClose: () => void;
  onSubmit: (payload: { type: "entry" | "output"; quantity: number; reason: string; lot?: string; expirationDate?: string; note?: string }) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState(type === "entry" ? "Producción" : "Despacho de venta");
  const [lot, setLot] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit({ type, quantity: Number(quantity), reason, lot, expirationDate, note });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No fue posible guardar");
      setSaving(false);
    }
  }

  const reasons = type === "entry"
    ? ["Producción", "Compra", "Devolución recibida", "Ajuste positivo"]
    : ["Despacho de venta", "Muestra o regalo", "Producto dañado", "Producto vencido", "Ajuste negativo"];

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal-card" onSubmit={handleSubmit}>
        <div className="modal-head">
          <div className={`modal-symbol ${type}`}>{type === "entry" ? "↙" : "↗"}</div>
          <div><span>{type === "entry" ? "NUEVA ENTRADA" : "NUEVA SALIDA"}</span><h2>{type === "entry" ? "Agregar unidades" : "Descontar unidades"}</h2></div>
          <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-stock">Stock actual <strong>{stock.toLocaleString("es-CL")} unidades</strong></div>
        <label>Cantidad<input type="number" min="1" max={type === "output" ? stock : 1000000} inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ej. 50" autoFocus required /></label>
        <label>Motivo<select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item}>{item}</option>)}</select></label>
        {type === "entry" && <div className="form-grid"><label>Número de lote<input value={lot} onChange={(event) => setLot(event.target.value)} placeholder="Ej. LD-0826" /></label><label>Fecha de vencimiento<input type="date" value={expirationDate} onChange={(event) => setExpirationDate(event.target.value)} /></label></div>}
        <label>Nota opcional<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Agrega un detalle si es necesario" rows={3} /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button type="submit" className={`button ${type === "entry" ? "secondary" : "primary"}`} disabled={saving}>{saving ? "Guardando..." : type === "entry" ? "Confirmar entrada" : "Confirmar salida"}</button></div>
      </form>
    </div>
  );
}

function LoadingState() {
  return <div className="loading-state"><span /><div><i /><i /><i /></div><p>Cargando inventario…</p></div>;
}
