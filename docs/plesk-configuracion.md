# Configuración de Street Status en Plesk

Esta guía corresponde al monorepo actual. El código del backend y los archivos de instalación viven en la raíz de la aplicación; el frontend compilado se publica en una carpeta pública separada.

## Valores de la pantalla Node.js

| Campo de Plesk | Valor recomendado | Acción |
| --- | --- | --- |
| Versión de Node.js | `20.20.2` | Mantener. El proyecto funciona con Node 20.17 o posterior de la línea 20. |
| Administrador de paquetes | `npm` | Mantener. El monorepo tiene un `package-lock.json` en la raíz. |
| Raíz de la aplicación | `/httpdocs` | Mantener si el repositorio completo está instalado ahí. Debe contener `package.json`, `package-lock.json`, `app.js`, `backend/` y `frontend/`. |
| Raíz del documento | `/httpdocs/public` | Cambiar desde `/httpdocs`. Es el directorio público, separado del código de la aplicación. El deploy coloca ahí el frontend. |
| Modo de aplicación | `production` | Mantener. Plesk define `NODE_ENV=production`, necesario para que la cookie de sesión use `Secure`. |
| URL de la aplicación | `https://pozometro.com.ar/` | Mantener la raíz del dominio. Usar HTTPS cuando el certificado SSL esté activo; configurar redirección de HTTP a HTTPS. |
| Archivo de inicio | `app.js` | Cambiar desde `.plesk.startup.cjs`, salvo que ese archivo generado haya sido comprobado y delegue explícitamente en `app.js`. El repositorio incluye `app.js`, que importa el backend compilado. |

Plesk para Linux recomienda que la raíz del documento sea un subdirectorio de la raíz de la aplicación. El archivo de inicio debe encontrarse dentro de la raíz de la aplicación. Ver [documentación de Node.js de Plesk](https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs-support.76652/) y [requisitos para instalar una app Node.js](https://support.plesk.com/hc/en-us/articles/12377084794263-How-to-install-and-run-Node-js-application-in-Plesk).

> Si `/httpdocs` no contiene el repositorio sino solamente archivos publicados, primero hay que confirmar dónde Plesk instaló el repositorio. La raíz de aplicación debe apuntar a la carpeta que contiene el `package.json` raíz; no configures las dos raíces a ciegas.

## Variables personalizadas de Plesk

Agregá estas variables en **Node.js → Custom Environment Variables**. Plesk usa el modo de aplicación para proporcionar `NODE_ENV`; confirmá que el modo esté en `production`.

| Variable | Valor / requisito | Notas |
| --- | --- | --- |
| `DATABASE_URL` | URI PostgreSQL de Supabase con SSL, por ejemplo `postgresql://...` y `sslmode=require` | Obligatoria para iniciar la API. Copiala de **Supabase → Connect** y no compartas el valor en capturas o logs. |
| `CORS_ORIGIN` | `https://pozometro.com.ar` | Obligatoria para el navegador. Debe coincidir exactamente con el origen del sitio: protocolo y dominio, sin ruta ni `/` final. Si el sitio se sirve con `www`, usar ese origen real. |

No agregues manualmente `PORT`: Plesk/Passenger asigna el puerto de la aplicación y el backend lee `PORT`. `BACKEND_PORT` es un fallback local. `NODE_ENV` no hace falta duplicarlo como variable personalizada si el modo de aplicación figura como `production`.

### Opcionales: dejarlas sin configurar inicialmente

- `BACKEND_HOST`: el backend ya usa `0.0.0.0` por defecto.
- `TRUST_PROXY`: dejar vacía salvo que el hosting indique la IP o CIDR exacta del proxy confiable. No usar `*`.
- `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS`: la app aplica valores conservadores si se omiten.
- `USIG_ADDRESS_SEARCH_URL`: la búsqueda ya tiene un proveedor predeterminado.
- `PLESK_DOCUMENT_ROOT`: el deploy publica por defecto en `public/` dentro de la raíz de la app. Solo configurarla si elegís otro document root; en ese caso el valor debe ser la ruta física completa.
- `PLESK_APP_TMP_DIR`: solo configurarla si Passenger usa una carpeta `tmp` distinta de la carpeta `tmp/` de la app.
- `RATE_LIMIT_*`: todos los límites tienen valores predeterminados; se ajustan solo si hay una necesidad operativa concreta.

El frontend llama a la API mediante rutas relativas (`/api`), por lo que no necesita `VITE_API_URL`. Tampoco se necesita configurar variables de OSRM, Redis ni claves de sesión.

## Publicación

1. En **Application Root**, seleccionar `/httpdocs`; en **Document Root**, `/httpdocs/public`.
2. Confirmar Node 20.20.2, npm, modo `production` y startup `app.js`.
3. Guardar `DATABASE_URL` y `CORS_ORIGIN` en las variables personalizadas de Node.js.
4. Desde **Run Script**, seleccionar la raíz `/httpdocs` y ejecutar el script npm `deploy:plesk`.
5. Revisar su salida. El script imprime etapas, tiempos y avisos de variables faltantes sin revelar secretos. Si alguna variable falta, continúa el deploy; eso no garantiza que la API pueda arrancar. En particular, sin `DATABASE_URL` Fastify falla al iniciar.
6. Abrir `https://pozometro.com.ar/api/health` y confirmar que devuelve `{"status":"ok"}`. Luego verificar que el mapa y el login funcionen bajo HTTPS.

Las migraciones no forman parte del deploy. Si una versión agrega migraciones, ejecutar `db:migrate` explícitamente contra la base correcta antes de publicar esa versión.

El comando de despliegue instala dependencias, compila ambos workspaces, copia `frontend/dist` al document root y solicita el reinicio mediante `tmp/restart.txt`. Plesk debe tener habilitado Node.js y Passenger para esta aplicación.
