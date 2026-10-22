# El Tornillo · Mostrador y cobranza

Prototipo navegable de un sistema de **punto de venta, stock, facturación y cuenta corriente** para comercios argentinos (ferreterías, corralones, almacenes, distribuidores). El diferencial es unir el mostrador con la cobranza de lo que se vende "a cuenta".

Usa Firebase (Authentication y Firestore) para el login y los datos de cada empresa; ver [FIREBASE.md](FIREBASE.md). Las empresas reales facturan con ARCA (ver [ARCA.md](ARCA.md)); solo la empresa de demostración usa datos de ejemplo y facturación simulada. **Mercado Pago todavía no está integrado:** el cobro con QR existe solo en la demo.

## Requisitos

- Node.js 20.9 o superior (se desarrolló con Node 24).
- npm.

## Instalar y correr

```bash
npm install
npm run dev
```

Antes, creá un archivo `.env.local` con las variables del servidor (ver [ARCA.md](ARCA.md#1-variables-de-entorno-del-servidor-una-sola-vez)). Sin ellas la app abre, pero no puede registrar ventas ni pagos.

Abrí <http://localhost:3000> e ingresá con un usuario creado desde `/admin` (ver [FIREBASE.md](FIREBASE.md)).

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` y `npm start` | Versión de producción local |
| `npm test` | Tests de la lógica de negocio y de los servicios (Vitest) |
| `npm run typecheck` | Chequeo de tipos de TypeScript |
| `npm run lint` | ESLint |

## Desplegar en Vercel

Los datos viven en Firestore. El servidor de Next.js registra las ventas, las notas de crédito y los pagos, y habla con ARCA, así que necesita dos variables de entorno: `FIREBASE_SERVICE_ACCOUNT` y `ARCA_CLAVE_CIFRADO` (ver [ARCA.md](ARCA.md#1-variables-de-entorno-del-servidor-una-sola-vez)).

**Opción A, desde GitHub (recomendada):**

1. Subí el proyecto a un repositorio de GitHub.
2. En <https://vercel.com/new>, importá el repositorio. Vercel detecta Next.js solo; dejá la configuración por defecto.
3. En *Settings → Environment Variables*, cargá las dos variables.
4. Tocá **Deploy**. En un par de minutos tenés una URL `https://<proyecto>.vercel.app` para abrir desde cualquier PC o celular.

Cada `git push` a la rama principal vuelve a publicar.

**Opción B, desde la terminal:**

```bash
npx vercel        # la primera vez pide iniciar sesión y vincular el proyecto
npx vercel --prod # publica en producción
```

> Los datos se guardan en Firestore y se comparten entre los dispositivos de la empresa. Para mostrar el sistema, creen desde `/admin` una **empresa de demostración** con su usuario: arranca con la ferretería de ejemplo y se reinicia desde **Configuración → Reiniciar demo**.

## Cómo mostrar la demo

- **Usuarios:** conviene crear desde `/admin` un usuario Admin y uno Vendedor en la empresa de demostración. El Vendedor no ve costos ni márgenes, no modifica precios, no hace descuentos, no da crédito a los clientes (cuenta corriente, límite, plazo y estado) y no accede a Reportes.
- **Venta** (pantalla principal):
  - El campo de código siempre tiene el foco. Un lector de código de barras USB funciona directamente: "escribe" el código y manda Enter.
  - Para varias unidades: `5*` y después el código (por ejemplo, `5*TOR-005`). Acepta decimales para metros y kilos (`2,5*ELC-001`).
  - El código de la **caja x12** de la cinta aisladora (ELC-004) suma 12 unidades.
  - Atajos: **F2** buscar · **F4** cliente · **F8** poner en espera · **F12** cobrar · **Esc** cancelar.
- **Comprobantes:**
  - Factura A si el cliente es responsable inscripto.
  - Factura B para el resto, con IVA contenido y la leyenda de la Ley 27.743.
  - Nota de pedido (X): no fiscal y sin IVA.
  - En la demo, las facturas reciben un CAE ficticio de 14 dígitos y un QR con el formato de ARCA, y se imprimen en A4 o en ticket de 80 mm.
- **Clientes para probar:**
  - *Silvia Acosta* (bloqueada: no se le puede vender a cuenta).
  - *Hernán Castro* y *Desarrollos Lanús* (en observación y con deuda de más de 30 días).
  - *Electro Norte S.R.L.* (responsable inscripto: emite Factura A).
- **QR de Mercado Pago:** se "acredita" solo a los pocos segundos de generarlo.
- **WhatsApp:** los teléfonos de los clientes de ejemplo son ficticios (`11 0000-xxxx`) a propósito. Para probar el envío real, editá un cliente y poné tu número.

## Reglas de negocio implementadas

- **Importes** en centavos (enteros), **cantidades** en milésimas y **porcentajes** en puntos básicos: no hay errores de redondeo.
- **Precios** netos de IVA: `precio = costo × (1 + % ganancia)`, con cálculo en ambos sentidos. El redondeo a la centena es opcional por artículo y se aplica sobre el precio final con IVA.
- **Alícuota** por artículo: 21 %, 10,5 %, 27 % o exento. **Una sola lista de precios.**
- **Códigos de barra:** varios por artículo, cada uno con una cantidad equivalente. Un código no puede estar en dos artículos.
- **Costo histórico:** cada línea de venta guarda el costo de ese momento, así la ganancia histórica no cambia cuando se actualizan los costos. Los costos se guardan aparte, en colecciones que solo leen los administradores (ver `src/data/costos.ts`).
- **Stock:** se puede vender sin stock (con aviso) y el stock queda negativo.
- **Descuentos** por ítem o al total, en % o en monto, solo para el Admin. El descuento al total se prorratea entre líneas para calcular bien el IVA de cada alícuota.
- **Cuenta corriente** sin intereses:
  - Vencimiento = fecha de la venta + plazo de pago del cliente.
  - Antigüedad de la deuda en tramos: al día, 1–7, 8–15, 16–30 y más de 30 días.
  - Los pagos se imputan a la deuda más vieja, o a los comprobantes que se elijan.
  - El excedente de un pago queda como saldo a favor y se aplica a la próxima venta a cuenta.
- **Estado del cliente:**
  - *En observación:* muestra un aviso.
  - *Bloqueado:* impide vender a cuenta (se le puede vender al contado).
  - Si una venta a cuenta supera el límite de crédito, se muestra un aviso.

## Estructura del proyecto

```
src/
  app/                  Rutas (venta, articulos, clientes, cobranza, reportes, configuracion, comprobantes, admin)
    api/operaciones/    Registra ventas, notas de crédito y pagos (en el servidor)
    api/arca/           Certificado de ARCA de cada comercio
    api/migraciones/    Migra los datos de una empresa al formato actual
  components/           UI por pantalla y componentes de shadcn/ui (components/ui)
  domain/               Lógica de negocio pura y testeada: precios, IVA, comprobantes,
                        carrito, cobro, cuenta corriente, fechas, reportes, WhatsApp
  data/
    store.ts            Interfaces de repositorios (el contrato de acceso a datos)
    firestore/          Implementación en el navegador sobre Firestore
    costos.ts           Cómo se guardan aparte los costos (solo para administradores)
    indexeddb/          Implementación sobre IndexedDB (Dexie), usada en los tests
    seed/               Generador determinístico de los datos de ejemplo
  services/             Casos de uso (registrar venta, registrar pago, cambio masivo…)
  server/               Código que corre solo en el servidor: acceso, Firestore con Admin SDK,
                        operaciones y ARCA (WSAA + WSFEv1)
  integrations/
    fiscal/             FiscalProvider + ARCA simulado (demo)
    payments/           PaymentProvider + Mercado Pago simulado (demo)
    servidor/           Llamadas del navegador a /api/operaciones
  auth/                 Sesión (Firebase Authentication) y permisos por rol
  hooks/use-consulta.ts Lectura de datos desde la UI (se refresca sola al cambiar los datos)
```

La UI **nunca** accede a los datos directamente: usa los servicios mediante `useServicios()` y `useConsulta()`.

## Qué corre dónde

- **En el navegador:** las lecturas, y las altas y cambios de artículos, clientes, configuración y ventas en espera. Las reglas de Firestore (`firestore.rules`) controlan quién puede hacer cada cosa.
- **En el servidor** (`/api/operaciones`): las ventas, las notas de crédito y los pagos. El servidor corre los mismos servicios de `src/services` sobre Firestore con el Admin SDK: toma precios y costos del catálogo guardado, valida los permisos, pide el CAE y guarda todo junto. El navegador solo manda qué se vende y cómo se paga. Ver `src/server/operaciones/ejecutar.ts`.

## Cómo reemplazar las simulaciones

Las implementaciones del navegador se eligen en `src/components/providers/servicios-provider.tsx`; las del servidor, en `src/server/operaciones/ejecutar.ts`.

- **Otra base de datos (por ejemplo, Postgres):** escribir una implementación de la interfaz `Store` (`src/data/store.ts`). La lógica de `src/domain` y `src/services` se reutiliza tal cual.
- **ARCA:** ya está implementado en el servidor (`src/server/arca`, WSAA + WSFEv1). Las empresas reales facturan con ARCA en cuanto cargan su certificado; la de demostración, simulado. Ver [ARCA.md](ARCA.md).
- **Mercado Pago:** implementar `PaymentProvider` con la API de QR dinámico y de links de pago, y confirmar los cobros con webhooks. Hoy `crearMercadoPagoSimulado()` aprueba el QR a los pocos segundos, y el servidor rechaza el cobro con QR en las empresas reales.

## Fuera de alcance (pensado para después)

Integración real con Mercado Pago, importación desde Excel, caja con apertura y arqueo, inventario, roles personalizados, facturas de servicios y en moneda extranjera, contingencia sin conexión con ARCA (CAEA) y listas de precios múltiples.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Recharts · Firebase (Authentication, Firestore, Admin SDK) · Vitest.
