# Activar Firebase

1. En Firebase Authentication habilitar Correo/contraseña. Agregar localhost a los dominios autorizados de desarrollo.
2. Crear Cloud Firestore y publicar el contenido de firestore.rules en su pestaña Reglas (o firebase deploy --only firestore:rules --project eltornillo-6af7d con Firebase CLI autenticado).
3. Crear tu cuenta en Authentication > Usuarios > Agregar usuario. Copiar su UID.
4. En Firestore crear usuarios/{UID} con nombre (string), rol = superadmin (string), activo = true (boolean). Este primer permiso se asigna desde la consola, nunca desde el navegador.
5. Entrar por /login. El panel /admin permite crear empresas y sus usuarios; las altas no cambian tu sesión.
6. Compartir /kiosco-mauro/login o el enlace que muestra el panel para cada empresa. Las cuentas de otra empresa no pueden entrar por ese acceso.

Las claves de configuración web de Firebase son públicas. La protección reside en Authentication y las reglas publicadas, que impiden autoasignarse roles o empresas.

Los perfiles y empresas viven en Firestore. Ventas, stock y clientes conservan el almacenamiento IndexedDB de la demo, ahora separado por empresa. No hay sincronización entre dispositivos ni seguridad de backend para esos datos locales: falta migrarlos antes de usar el sistema comercialmente. No se importan datos de la demo anterior.

Para desactivar acceso, cambiar usuarios/{UID}.activo o empresas/{id}.activa desde la consola. Mantener accesos/{id}.activa sincronizado con la empresa para ocultar su formulario público. No habilitar reglas de prueba abiertas.
