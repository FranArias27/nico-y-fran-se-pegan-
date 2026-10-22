# Activar Firebase

1. En Firebase Authentication habilitar Correo/contraseña. Agregar localhost a los dominios autorizados de desarrollo.
2. Crear Cloud Firestore y publicar el contenido de firestore.rules en su pestaña Reglas (o firebase deploy --only firestore:rules --project eltornillo-6af7d con Firebase CLI autenticado).
3. Crear tu cuenta en Authentication > Usuarios > Agregar usuario. Copiar su UID.
4. En Firestore crear usuarios/{UID} con nombre (string), rol = superadmin (string), activo = true (boolean). Este primer permiso se asigna desde la consola, nunca desde el navegador.
5. Entrar por /login. El panel /admin permite crear empresas y sus usuarios; las altas no cambian tu sesión.
6. Compartir /kiosco-mauro/login o el enlace que muestra el panel para cada empresa. Las cuentas de otra empresa no pueden entrar por ese acceso.

Las claves de configuración web de Firebase son públicas. La protección reside en Authentication y las reglas publicadas, que impiden autoasignarse roles o empresas.

Todos los datos viven en Firestore: perfiles y empresas en la raíz, y los datos de cada negocio (artículos, clientes, ventas, cuenta corriente, ventas en espera y numeración) en `empresas/{id}/...`. Se comparten entre todos los dispositivos de la empresa y el navegador guarda una copia local para seguir leyendo sin conexión. Registrar una venta, una nota de crédito o un pago necesita internet: lo hace el servidor (`/api/operaciones`), que necesita la variable `FIREBASE_SERVICE_ACCOUNT` (ver [ARCA.md](ARCA.md)).

Cada vez que cambie `firestore.rules` hay que volver a publicarlas: sin las reglas nuevas, la app no puede leer ni escribir los datos del negocio.

Hay dos clases de empresa, y se elige al crearla en `/admin` (no se puede cambiar después):

- **Real** (la normal): arranca vacía. El primer administrador que entra crea los datos del comercio, la categoría "General" y el cliente "Consumidor final"; hasta entonces, sus vendedores ven un aviso. Factura con ARCA en cuanto carga su certificado (ver [ARCA.md](ARCA.md)); antes, solo emite notas de pedido. No tiene datos de ejemplo, ni facturación simulada, ni cobro con QR, y las reglas impiden borrar sus datos.
- **De demostración** (tildar "Empresa de demostración"): para mostrar el sistema a posibles clientes. Arranca con la ferretería de ejemplo, factura con CAE simulado y muestra una franja que avisa que es una demo. Desde Configuración se reinicia antes de cada demostración. Conviene crearle un usuario administrador, por ejemplo `demo@...`, y usar ese para vender.

Las empresas creadas antes de este cambio quedan como reales.

Los permisos se aplican del lado del servidor:

- **Reglas de Firestore:**
  - El vendedor no modifica artículos, precios, stock, configuración ni categorías.
  - No borra datos.
  - No cambia la cuenta corriente, el límite, el plazo ni el estado de los clientes.
  - No lee los costos: están en `costos/` y `ventasCostos/`, que solo leen los administradores.
  - Ventas, movimientos de cuenta corriente, recibos y numeración no se escriben desde el navegador, salvo al reiniciar una empresa de demostración.
- **`/api/operaciones`:** registra las ventas con los precios del catálogo, firma cada venta y recibo con el usuario de la sesión, rechaza los descuentos del vendedor y deja las notas de crédito solo a los administradores.

Al entrar un administrador por primera vez después de esta versión, la app pasa en segundo plano los costos de los datos anteriores a las colecciones nuevas (`/api/migraciones`). Hasta entonces, los vendedores todavía pueden ver los costos guardados antes.

Los datos que quedaron en IndexedDB con la versión anterior no se migran.

Para desactivar acceso, cambiar usuarios/{UID}.activo o empresas/{id}.activa desde la consola. Mantener accesos/{id}.activa sincronizado con la empresa para ocultar su formulario público. No habilitar reglas de prueba abiertas.
