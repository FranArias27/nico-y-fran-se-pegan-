# Facturación electrónica con ARCA

## Prueba reproducible de homologación

Las pruebas locales de fallos y reintentos usan dobles de WSAA/WSFE y el emulador de Firestore. No acreditan por sí mismas homologación ni producción.

Preparar una o varias empresas reales **exclusivas de homologación**, con certificado de prueba, un administrador, un cliente y un artículo. Crear un archivo privado `casos-homologacion.json` con los casos que correspondan:

```json
[
  { "empresaId": "prueba-ri", "usuarioId": "UID_ADMIN", "clienteId": "CLIENTE_RI", "articuloId": "ARTICULO", "tipo": "A" },
  { "empresaId": "prueba-ri", "usuarioId": "UID_ADMIN", "clienteId": "CLIENTE_CF", "articuloId": "ARTICULO", "tipo": "B" },
  { "empresaId": "prueba-mono", "usuarioId": "UID_ADMIN", "clienteId": "CLIENTE_CF", "articuloId": "ARTICULO", "tipo": "C" }
]
```

Ejecutar `npm run validar:arca -- casos-homologacion.json` con las variables de servidor cargadas. El programa rechaza certificados de producción, emite una factura de dos unidades, repite el mismo pedido para comprobar idempotencia y envía dos notas parciales concurrentes cuya suma revierte la factura. Usa transferencia para no alterar caja; los movimientos de stock quedan compensados por las devoluciones. Si se interrumpe, revisar y reanudar el pedido pendiente antes de repetir toda la prueba.

Agregar casos con artículos exentos y cada alícuota usada por el comercio. Los resultados reales requieren acceso al servidor de ARCA y un certificado válido. Registrar fecha, empresa, comprobantes y resultado de cada ejecución antes de habilitar producción. Las pruebas en producción deben realizarse de forma controlada por el responsable del comercio; este script no emite comprobantes de producción.

La app emite Factura A, B y C y sus notas de crédito con el web service de factura electrónica de ARCA (WSFEv1). Lo hace desde el servidor, al registrar la venta (`src/app/api/operaciones`), nunca desde el navegador.

## Cómo funciona

- **Cada comercio tiene su propio certificado de ARCA**, a nombre de su CUIT. Factura en nombre propio, sin delegarle nada a nadie.
- **La clave privada nunca sale del servidor.**
  1. El servidor la genera cuando el admin toca *Generar pedido de certificado*.
  2. La guarda cifrada (AES-256-GCM) en `arcaCredenciales/{empresa}`, una colección que el navegador no puede leer.
  3. El comercio solo descarga el pedido (`.csr`) y sube el certificado (`.crt`). Los dos son públicos.
- **Al subir el certificado, el servidor verifica** que corresponda a la clave del pedido, que sea de la CUIT del comercio y que esté vigente. Además indica si es de prueba (homologación) o de producción.
- **Cambiar de certificado no corta la facturación.** Si se genera un pedido nuevo, por ejemplo para renovar, el certificado anterior sigue funcionando hasta que se carga el nuevo.
- **Toda empresa real factura con ARCA.** Hasta que carga su certificado, solo puede emitir notas de pedido. No existe la facturación simulada en las empresas reales: solo en la de demostración (ver [FIREBASE.md](FIREBASE.md)).
- **Un certificado de homologación emite comprobantes de prueba.** Se marcan como sin validez fiscal.
- **El servidor no confía en el navegador.** El navegador solo dice qué artículos y cantidades se venden y cómo se pagan. El servidor lee del catálogo los precios, y de Firestore el CUIT, la condición de IVA y el punto de venta; calcula los importes, verifica que el usuario pertenezca a la empresa y pide el CAE. Las notas de crédito, los descuentos y la gestión del certificado son solo para administradores.
- **La numeración la pone ARCA.** El servidor pide el último número autorizado y usa el siguiente. Si otra caja ganó ese número en el medio, reintenta una vez.
- **Un CAE no se pierde.**
  - Si ARCA no responde a tiempo, el servidor consulta (`FECompConsultar`) si el comprobante quedó autorizado igual, y en ese caso lo usa.
  - El CAE se anota en `empresas/{empresa}/operaciones/{id}` antes de guardar la venta. Si se corta la conexión, el navegador reintenta con el mismo id y el servidor usa ese CAE en vez de pedir otro; si la venta ya estaba guardada, la devuelve sin duplicarla.
  - Una operación con `fiscal` cuya venta (mismo id en `ventas`) no existe es un comprobante autorizado que no quedó registrado: revisarla desde la consola de Firestore.

## 1. Variables de entorno del servidor (una sola vez)

En Vercel van en *Project → Settings → Environment Variables*; para correrlo en la PC, en un archivo `.env.local`, que git ignora.

| Variable | Valor |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | JSON completo de una cuenta de servicio (Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada), en una sola línea |
| `ARCA_CLAVE_CIFRADO` | 32 bytes al azar en base64. Se generan con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

**`ARCA_CLAVE_CIFRADO` no se puede cambiar ni perder.** Si se cambia, las claves guardadas ya no se pueden descifrar y cada comercio tiene que tramitar su certificado de nuevo. Guárdenla también en un lugar seguro fuera de Vercel.

## 2. Alta de cada comercio

**En la app** (admin del comercio, o ustedes en modo soporte), en *Configuración*:

1. Cargar y guardar el CUIT, la condición frente al IVA y la razón social.
2. En *Certificado de ARCA*, tocar **Generar pedido de certificado** y **Descargar pedido (.csr)**.

**En ARCA**, con la clave fiscal del comercio:

3. **Para producción:** en el servicio **"Administración de Certificados Digitales"**, agregar un alias (por ejemplo `facturacion`), subir el `.csr` y descargar el certificado.

   **Para pruebas:** el servicio se llama **"WSASS – Autogestión Certificados Homologación"**. Ahí se crea el certificado con el mismo `.csr` y se autoriza para el servicio **wsfe**.
4. Solo en producción: en **"Administrador de Relaciones de Clave Fiscal"** → *Nueva relación*, elegir el servicio **"Facturación electrónica"** y, como representante, el **computador fiscal** (el alias del paso 3).
5. En **"Administración de puntos de venta y domicilios"**, dar de alta un punto de venta del tipo **"RECE para aplicativo y web services"**. Tiene que ser exclusivo para este sistema.

**De vuelta en la app:**

6. Cargar el número de punto de venta y guardar.
7. Subir el `.crt`, elegir *Pruebas* o *Producción* y tocar **Cargar certificado**. Desde ese momento el mostrador ofrece las facturas.
8. Hacer una venta de prueba chica y anularla con una nota de crédito.

El certificado dura 2 años. Para renovarlo se repiten los pasos 2, 3 y 7; el anterior sigue funcionando mientras tanto.

## Qué cubre y qué no

**Cubre:**
- Factura A, B y C y sus notas de crédito, con comprobante asociado.
- Concepto "productos".
- Pesos argentinos.
- IVA 10,5 %, 21 % y 27 %, y operaciones exentas.
- Condición frente al IVA del receptor (RG 5616).
- El QR del comprobante.

**No cubre todavía:**
- **Facturas de servicios:** necesitan informar fechas de servicio y de vencimiento de pago.
- **Moneda extranjera.**
- **Percepciones y otros tributos.**
- **Factura de crédito electrónica MiPyME.**
- **Contingencia** (CAEA) cuando ARCA está caído: si ARCA no responde, la venta no se registra. Mientras tanto se puede emitir una nota de pedido.

**Vencimiento del certificado:** desde 30 días antes, los administradores ven un aviso en todas las pantallas.

**Límite de identificación:** ARCA exige identificar al consumidor final en Factura B a partir de cierto monto. Si se supera, ARCA rechaza el comprobante con un mensaje que se muestra en pantalla: hay que cargar el cliente con su DNI.

## Antes de pasar a producción

Probar todo con un certificado de homologación:
- Factura A, B y C.
- Una nota de crédito total y una parcial.
- Una venta con artículo exento.
- Dos cajas vendiendo a la vez.

El armado del pedido, el cifrado y la validación de certificados tienen tests en `src/server`, pero la respuesta real de ARCA solo se puede verificar contra su servidor de pruebas.
