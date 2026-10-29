# Versión local para comercios sin internet

## Objetivo inicial

Un comercio, una computadora, operación diaria sin conexión desde el primer arranque tras instalar. Internet no es requisito para entrar, vender, consultar datos, imprimir ni recuperar un respaldo.

## Estado del material disponible

La carpeta actual contiene HTML y JavaScript compilado, más un lanzador Vite. No contiene los componentes React originales, el servidor de las rutas /api ni las reglas de Firebase. La aplicación distribuida utiliza Firebase y rutas de API remotas. Hace falta recuperar el código fuente para adaptar la aplicación existente de forma mantenible.

## Diseño propuesto

- Reutilizar la interfaz React del proyecto original.
- Separar las reglas de ventas, caja y stock de Firebase y de los componentes de pantalla.
- Incorporar una aplicación de escritorio y SQLite local. Elegir el contenedor de escritorio después de revisar las dependencias originales y las impresoras del piloto.
- Ejecutar las operaciones de base de datos en la capa local de la aplicación, con validación de permisos y consultas parametrizadas.
- Usar cuentas y credenciales locales, sin inicio de sesión obligatorio contra un servicio externo. Guardar contraseñas mediante un algoritmo de hash apropiado, nunca como texto.
- Incluir recursos de interfaz en el instalador, sin fuentes, scripts o archivos descargados de internet durante el uso.
- Mantener la nube como una integración futura opcional; no incluir sincronización en el primer alcance.

## Primer recorrido completo

1. Abrir la aplicación sin conexión y configurar el comercio y su administrador.
2. Cargar productos con precio, código de barras y stock inicial.
3. Abrir una caja y realizar una venta en efectivo.
4. Guardar venta, detalle, pago y movimientos de stock en una única transacción.
5. Consultar la venta e imprimir un comprobante interno.
6. Cerrar y volver a abrir la aplicación, conservando los datos.
7. Exportar un respaldo y restaurarlo en una instalación de prueba.

## Reglas de datos

- Identificadores únicos y claves de operación para impedir duplicados por doble clic o reintento.
- Importes monetarios con representación exacta y reglas explícitas de redondeo; no usar cálculos de dinero con coma flotante sin control.
- Detalles de venta conservan el precio y la descripción usados al vender.
- Stock basado en movimientos; ajustes y anulaciones generan movimientos compensatorios y quedan auditados.
- Venta, pago y stock se confirman juntos o se revierten juntos.
- Migraciones de esquema versionadas, con respaldo antes de actualizar una instalación existente.
- Respaldo consistente de SQLite mediante una operación compatible con la base abierta; no copiar únicamente el archivo principal mientras hay escrituras.
- Restauración con validación de integridad y versión, preservando una copia previa de los datos reemplazados.

## Verificación obligatoria del piloto

- Instalación y arranque con la red deshabilitada.
- Acceso local después de reiniciar el equipo, sin una sesión previa en Firebase.
- Venta confirmada conservada después de reiniciar.
- Error durante una venta no deja cobros ni descuentos de stock parciales.
- Reintentar una misma operación no duplica la venta.
- Impresión fallida permite reimprimir sin volver a registrar la venta.
- Respaldo restaurado recupera ventas, caja, productos y usuarios.
- Actualización conserva datos y permite detectar una migración fallida.

## Alcance posterior

Cuenta corriente, compras, devoluciones, medios de pago adicionales y reportes se incorporan según el local piloto. Varias cajas requieren diseñar un servidor en la red del local; no compartir un archivo SQLite entre computadoras. La facturación fiscal y otros servicios externos requieren un flujo específico y no se consideran resueltos por guardar ventas localmente.

## Próximo requisito

Ubicar el repositorio fuente original, incluyendo componentes, dependencias, servidor y configuración de acceso a datos. A partir de ese material, implementar el primer recorrido completo sin reemplazar la aplicación por una maqueta nueva.
