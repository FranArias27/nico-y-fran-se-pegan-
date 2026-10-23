# Operación y puesta en marcha

## Activar esta versión

1. Usar Node 24 LTS y Java 21 o superior para el emulador. Instalar con `npm ci`.
2. Publicar **las reglas de Firestore** con `npx firebase deploy --only firestore:rules --project TU_PROYECTO`. El código local no publica las reglas automáticamente.
3. Desplegar la aplicación con las variables de servidor indicadas en ARCA.md.
4. En cada empresa existente, abrir **Herramientas → Actualizar resúmenes de cobranza** una vez. Hasta entonces, el panel usa una lectura de compatibilidad del historial de los clientes que aún no tienen resumen.
5. Abrir la caja desde **Configuración → Caja, compras e inventario** antes de vender, cobrar o devolver efectivo. Hay una caja compartida por comercio; no hay cajas independientes por empleado o sucursal.

## Concurrencia y pedidos pendientes

Las ventas, cobranzas, devoluciones, compras, pagos a proveedores, importaciones y ajustes comparten una exclusión persistente por empresa. Se adquiere antes de leer los saldos. Las escrituras verifican el token de esa exclusión en una transacción de Firestore; un proceso reemplazado no puede confirmar escrituras.

Mientras una operación trabaja, los otros pedidos reciben HTTP 409 y deben reintentarse. El navegador conserva el identificador y el contenido del pedido en esta pestaña. Un identificador no admite otro contenido ni otro usuario.

Si una operación fiscal quedó incierta, no se libera automáticamente para otro pedido. **Herramientas → Pedidos pendientes** permite reanudarla con su id original. Esperar dos minutos si el servidor todavía puede estar trabajando. Un administrador puede reanudar un pedido de un vendedor; queda registrada su intervención. Si se trata de una importación, reenviar el mismo archivo. No borrar manualmente el bloqueo ni cambiar el contenido del pedido.

ARCA conserva el número y el pedido antes del envío. Después de un corte consulta ese número, compara los datos y reutiliza el CAE. Una consulta caída nunca se interpreta como comprobante inexistente. Los rechazos fiscales definitivos liberan la operación para corregirla. Una discrepancia exige conciliación manual.

Esta estrategia prioriza la consistencia y serializa operaciones por comercio. Una incidencia pendiente puede detener nuevas operaciones hasta que se concilie. No equivale a una cola ilimitada ni a contingencia fiscal sin conexión.

## Caja, compras e inventario

- Apertura con fondo inicial; ingresos y retiros con motivo; cierre con efectivo contado, esperado y diferencia. El cierre se conserva en el historial.
- Las ventas y los recibos en efectivo suman a la caja; los reintegros, pagos de compras y pagos a proveedores en efectivo restan. Cada comprobante se registra una sola vez aunque se reintente.
- Alta y edición de proveedores, saldo pendiente acumulado, recepción de compras con varias líneas, actualización de costo y precio conservando margen, pagos iniciales y posteriores con validación del saldo. El comprobante no puede repetirse para un mismo proveedor.
- El total de recepción usa el IVA de cada artículo. Es un circuito de mercadería y deuda comercial: todavía no reemplaza un módulo contable de compras con percepciones, retenciones, IVA especial del proveedor, devoluciones a proveedores u órdenes de compra con recepción parcial.
- El inventario registra conteos con motivo y responsable; rechaza un conteo si hubo cambios de stock desde que comenzó. Ventas, devoluciones, compras y conteos dejan movimientos auditables.
- Los artículos existentes ya no editan stock desde su formulario ni desde Excel. Esto evita sobrescribir una venta con un valor antiguo del formulario.

## Excel

Desde **Herramientas** descargar la plantilla `.xlsx`. La primera hoja contiene las columnas admitidas, y la segunda los ids y nombres de categorías.

Importes en pesos, cantidades en unidades/metros/kilos y porcentajes en puntos porcentuales (por ejemplo `21`, `10.5`, `50`). La categoría debe existir. Se admite un código de barras principal; las presentaciones adicionales de artículos existentes se conservan. No se ejecutan fórmulas ni enlaces de la planilla.

Primero validar y previsualizar. Corregir todos los errores antes de confirmar. Hasta 5.000 filas y 3 MB por archivo. El código interno identifica las actualizaciones; un código nuevo crea un artículo. La importación conserva el stock existente y los códigos de presentación que no se cambien.

La importación trabaja por bloques con cursor persistido y mantiene el comercio bloqueado hasta terminar. Después de una interrupción, cargar exactamente el mismo archivo desde el mismo usuario y navegador para reutilizar su id. No iniciar otra importación para eludir una pendiente.

## Respaldo y restauración

**Herramientas → Descargar respaldo completo** exporta datos maestros, costos, ventas, cuenta corriente, recibos, numeración, trazas de operaciones y los módulos nuevos. La lectura es un snapshot consistente de Firestore. El archivo tiene versión y SHA-256 para detectar corrupción. Contiene información privada del comercio: no compartirlo en un repositorio ni en un enlace público.

Para historiales grandes o copias programadas, ejecutar en un entorno privado con `.env.local` o `FIREBASE_SERVICE_ACCOUNT`:

```text
npm run respaldo -- crear mi-comercio
npm run respaldo -- verificar backups/mi-comercio-FECHA.json
```

El primer comando crea un archivo nuevo en `backups/`, sin sobrescribir archivos anteriores. Copiarlo además a almacenamiento privado fuera de la máquina. Programar una ejecución diaria con el programador del servidor, monitorear su salida y probar la recuperación periódicamente. La instalación no configura por sí sola una cuenta de almacenamiento externo ni una tarea programada.

Procedimiento de recuperación:

1. Verificar el archivo con el comando anterior.
2. Crear desde Administración una empresa destino nueva, **del mismo tipo real/demo que el origen**, sin ingresar a ella. Mantenerla desactivada.
3. Ejecutar:

```text
npm run respaldo -- restaurar empresa-nueva backups/mi-comercio-FECHA.json
```

4. El proceso exige un destino vacío, lo mantiene en recuperación, copia por lotes y verifica cantidad y contenido de cada colección. Si falla, repetir el mismo archivo: la copia es idempotente y la empresa sigue bloqueada. Si el proceso terminó abruptamente, esperar diez minutos para retomar su bloqueo; cada lote verifica el token para excluir al proceso anterior. Una recuperación ya terminada no puede ejecutarse de nuevo sobre ese destino. Nunca restaura sobre el comercio original.
5. El destino queda desactivado incluso después de una restauración correcta. Revisar ventas, recibos, saldos, stock y numeración antes de habilitarlo y asignar los usuarios correspondientes.
6. Los perfiles y contraseñas de Firebase Authentication, los certificados privados de ARCA y las variables de entorno **no están en el archivo descargable**. Respaldar aparte la infraestructura y las claves con acceso restringido. El indicador público de certificado se elimina al restaurar: volver a configurar ARCA antes de facturar. Los ids históricos de los usuarios se conservan como auditoría; no se reasignan automáticamente.

No se genera un respaldo comercial mientras exista una operación pendiente sin conciliar. Para recuperación completa de infraestructura, mantener también backups administrados de Firestore y un procedimiento independiente de recuperación de Authentication y secretos.

## Validación

```text
npm test
npm run typecheck
npm run lint
npm run build
npm run test:firestore
```

Las pruebas de integración solo conectan a un emulador local con proyecto `demo-el-tornillo`. Crean y eliminan exclusivamente empresas de prueba. Requieren Java. Cubren cobranzas y devoluciones simultáneas, protección de pedidos, caja, compras/pagos, inventario, restauración, Excel y reglas de acceso.

Para medir el panel con 10.000 movimientos sintéticos y 50 clientes, iniciar el emulador y definir `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`, y ejecutar `npm run medir:historial`. El script imprime tamaño de respuestas, lecturas lógicas y tiempos locales; elimina su empresa sintética al finalizar. No estima costos reales ni latencia de producción.

El panel general usa un resumen por cliente, sin escuchar todo el historial. El historial detallado de una cuenta y los reportes por rango todavía consultan los documentos correspondientes; medirlos por separado antes de operar con volúmenes grandes. El catálogo sigue en memoria para el mostrador.
