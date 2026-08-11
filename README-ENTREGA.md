# Inventario LinaDigest — proyecto fuente completo

Este paquete contiene el código fuente de la versión vigente de Inventario
LinaDigest, junto con sus migraciones SQL, recursos gráficos, PWA, pruebas y
configuración de compilación.

## Funciones incluidas

- Acceso propio mediante usuario y clave.
- Selector desplegable de Bodega, Despacho, Miguel Angel y Daniela Vasquez.
- Roles y permisos aplicados en el servidor.
- Costo de $12.000 visible solamente para Miguel Angel y Daniela Vasquez.
- Precio de venta de $29.990.
- Cantidad inicial informativa de 2.029 unidades.
- Saldo inicial disponible de 1.438 unidades en una instalación nueva.
- Entradas y salidas manuales con lote, vencimiento, motivo y observación.
- Descuento de una unidad mediante pistola lectora de código de barras.
- Protección contra duplicación de una misma lectura.
- Historial con usuario, fecha y hora.
- Exportación de movimientos a Excel y PDF.
- Interfaz adaptable a celular, tablet y computador.
- PWA instalable desde el navegador.

## Tecnologías

- TypeScript, React y componentes TSX.
- Vinext/Vite con enrutamiento compatible con Next.js.
- Cloudflare Workers.
- Cloudflare D1, SQL/SQLite y Drizzle ORM.
- PWA con manifiesto y Service Worker.
- `xlsx`, `jsPDF` y `jspdf-autotable` para las exportaciones.

## Estructura principal

| Ruta | Contenido |
| --- | --- |
| `app/` | Pantallas, autenticación y API del inventario |
| `db/` | Esquema y conexión de la base de datos |
| `drizzle/` | Migraciones SQL completas |
| `public/` | Logos, iconos, manifiesto y Service Worker |
| `worker/` | Punto de entrada de Cloudflare Worker |
| `tests/` | Prueba de compilación y metadatos renderizados |
| `.openai/hosting.json` | Identidad y binding D1 de la app actual |

## Requisitos para desarrollo

- Node.js 22.13 o superior.
- npm.
- Entorno compatible con Cloudflare Workers y una base D1 enlazada como `DB`.

Instalación básica:

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

Antes de iniciar, reemplaza las cuatro claves de ejemplo en `.dev.vars`. Cada
cuenta debe cambiar su clave temporal durante el primer acceso.

Comprobaciones disponibles:

```bash
npm run build
npm test
npm run lint
```

## Base de datos

Las migraciones se encuentran numeradas dentro de `drizzle/` y deben aplicarse
en orden. El código espera una base Cloudflare D1 enlazada con el nombre `DB`.

Una instalación nueva crea LinaDigest con 1.438 unidades disponibles y deja
registrada la cantidad inicial informativa de 2.029 unidades. Los movimientos
reales de la aplicación actualmente publicada no forman parte del código
fuente: permanecen en la base de datos administrada del servidor.

Para trasladar también la información histórica, primero exporta los
movimientos desde la app a Excel y realiza una exportación o respaldo de D1.
No reemplaces la aplicación en producción hasta comprobar que el total de
entradas, salidas y el saldo coincidan.

## Usuarios iniciales y permisos

| Usuario | Rol | Entradas | Salidas | Ve costo | Administra usuarios |
| --- | --- | ---: | ---: | ---: | ---: |
| Bodega | Bodega | Sí | No | No | No |
| Despacho | Despacho | No | Sí | No | No |
| Miguel Angel | Administrador | Sí | Sí | Sí | Sí |
| Daniela Vasquez | Administradora | Sí | Sí | Sí | Sí |

Las claves no están incluidas en el ZIP. Se entregan al servidor mediante las
variables indicadas en `.dev.vars.example` y se almacenan únicamente como hash
PBKDF2 con salt individual.

## Despliegue independiente

La versión incluida corresponde a la arquitectura actual de Cloudflare Workers
y D1. Para alojarla fuera de ChatGPT existen dos caminos:

1. Mantener Workers + D1 y configurar un proyecto propio de Cloudflare.
2. Migrar la base y autenticación a Supabase y desplegar la interfaz en Vercel.

La segunda alternativa requiere adaptar la conexión `cloudflare:workers`, las
rutas de autenticación y las consultas D1. No debe tratarse como una carga
directa del ZIP en Vercel.

## Seguridad

- El paquete no contiene claves reales, sesiones, tokens ni una copia de la
  base de producción.
- No publiques `.dev.vars`, `.env`, respaldos de D1 ni archivos de sesiones.
- Usa HTTPS y claves distintas para cada usuario.
- Mantén copias de seguridad antes de aplicar migraciones o importar datos.

## Versión entregada

Código funcional recuperado de la última versión publicada, cuyo último cambio
de aplicación corresponde a la actualización de logos, stock inicial y
exportaciones. Los únicos agregados para esta entrega son esta guía y el archivo
de variables de ejemplo.
