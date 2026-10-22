# El Tornillo · Mostrador y cobranza (prototipo)

Prototipo navegable de un sistema de **punto de venta, stock, facturación y cuenta corriente** para comercios argentinos (ferreterías, corralones, almacenes, distribuidores). El diferencial es unir el mostrador con la cobranza de lo que se vende "a cuenta".

Es una demo: **no tiene backend, login ni conexión real con ARCA o Mercado Pago**. Esas partes están simuladas detrás de interfaces, listas para reemplazarse por integraciones reales.

## Requisitos

- Node.js 20.9 o superior (se desarrolló con Node 24).
- npm.

## Instalar y correr

```bash
npm install
npm run dev
```

Abrí <http://localhost:3000>. La primera vez se cargan los datos de ejemplo en el navegador; tarda un segundo.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` y `npm start` | Versión de producción local |
| `npm test` | Tests de la lógica de negocio y de los servicios (Vitest) |
| `npm run typecheck` | Chequeo de tipos de TypeScript |
| `npm run lint` | ESLint |

## Desplegar en Vercel

La app es 100 % estática del lado del servidor (los datos viven en el navegador), así que no necesita variables de entorno ni base de datos.

**Opción A, desde GitHub (recomendada):**

1. Subí el proyecto a un repositorio de GitHub.
2. En <https://vercel.com/new>, importá el repositorio. Vercel detecta Next.js solo; dejá la configuración por defecto.
3. Tocá **Deploy**. En un par de minutos tenés una URL `https://<proyecto>.vercel.app` para abrir desde cualquier PC o celular.

Cada `git push` a la rama principal vuelve a publicar.

**Opción B, desde la terminal:**

```bash
npx vercel        # la primera vez pide iniciar sesión y vincular el proyecto
npx vercel --prod # publica en producción
```

> Cada dispositivo tiene sus propios datos: lo que se carga en la PC no aparece en el celular. Para empezar de cero, usá **Configuración → Reiniciar datos demo**.

## Cómo mostrar la demo

- **Usuarios:** el selector arriba a la derecha cambia entre **Carlos Ruiz (Admin)** y **Lucía Gómez (Vendedor)**. El Vendedor no ve costos ni márgenes, no modifica precios, no hace descuentos y no accede a Reportes.
- **Venta** (pantalla principal):
  - El campo de código siempre tiene el foco. Un lector de código de barras USB funciona directamente: "escribe" el código y manda Enter.
  - Para varias unidades: `5*` y después el código (por ejemplo, `5*TOR-005`). Acepta decimales para metros y kilos (`2,5*ELC-001`).
  - El código de la **caja x12** de la cinta aisladora (ELC-004) suma 12 unidades.
  - Atajos: **F2** buscar · **F4** cliente · **F8** poner en espera · **F12** cobrar · **Esc** cancelar.
- **Comprobantes:**
  - Factura A si el cliente es responsable inscripto.
  - Factura B para el resto, con IVA contenido y la leyenda de la Ley 27.743.
  - Nota de pedido (X): no fiscal y sin IVA.
  - Las facturas reciben un CAE ficticio de 14 dígitos y un QR con el formato de ARCA, y se imprimen en A4 o en ticket de 80 mm.
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
- **Costo histórico:** cada línea de venta guarda el costo de ese momento, así la ganancia histórica no cambia cuando se actualizan los costos.
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
  app/                  Rutas (venta, articulos, clientes, cobranza, reportes, configuracion, comprobantes)
  components/           UI por pantalla y componentes de shadcn/ui (components/ui)
  domain/               Lógica de negocio pura y testeada: precios, IVA, comprobantes,
                        carrito, cobro, cuenta corriente, fechas, reportes, WhatsApp
  data/
    store.ts            Interfaces de repositorios (el contrato de acceso a datos)
    indexeddb/          Implementación actual sobre IndexedDB (Dexie)
    seed/               Generador determinístico de los datos de ejemplo
  services/             Casos de uso (registrar venta, registrar pago, cambio masivo…)
  integrations/
    fiscal/             FiscalProvider + ARCA simulado
    payments/           PaymentProvider + Mercado Pago simulado
  auth/                 Sesión y permisos simulados
  hooks/use-consulta.ts Lectura de datos desde la UI (se refresca sola al cambiar los datos)
```

La UI **nunca** accede a los datos directamente: usa los servicios mediante `useServicios()` y `useConsulta()`.

## Cómo reemplazar las simulaciones

Todas las implementaciones se eligen en un solo lugar: `src/components/providers/servicios-provider.tsx`.

- **Base de datos real (Postgres):** escribir una implementación de la interfaz `Store` (`src/data/store.ts`), por ejemplo con Drizzle o Prisma detrás de rutas API o Server Actions, y mover `src/services` al servidor. La lógica de `src/domain` se reutiliza tal cual.
- **ARCA:** implementar `FiscalProvider.autorizar()` contra el web service de factura electrónica (WSFEv1) desde el backend, con certificado y token del WSAA. Hoy `crearArcaSimulado()` devuelve un CAE ficticio.
- **Mercado Pago:** implementar `PaymentProvider` con la API de QR dinámico y de links de pago, y confirmar los cobros con webhooks. Hoy `crearMercadoPagoSimulado()` aprueba el QR a los pocos segundos.
- **Login y roles:** reemplazar `AuthProvider` (`src/auth`). El resto de la app solo usa `useAuth()` y `puede(permiso)`.

## Fuera de alcance (pensado para después)

Backend y base de datos reales, login real, integración real con ARCA y Mercado Pago, importación desde Excel, caja con apertura y arqueo, inventario, devoluciones, notas de crédito desde la UI (existen en el modelo y en los datos de ejemplo), roles personalizados, Factura C (emisor monotributista) y listas de precios múltiples.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Recharts · Dexie (IndexedDB) · Vitest.
