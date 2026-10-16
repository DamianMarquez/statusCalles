# Deploy independiente del frontend en Plesk

El frontend se publica como una SPA estática. Node 20 y npm se usan únicamente para instalar y compilar; no queda un proceso Node sirviendo la web. Fastify corre por separado y el navegador lo consulta directamente.

## Configuración de Plesk

En **Node.js** configurá:

- **Versión de Node.js:** 20.x.
- **Raíz de la aplicación:** `/httpdocs/frontend`.
- **Raíz del documento:** `/httpdocs/frontend/dist`.
- **Modo:** `production`.
- No hace falta archivo de inicio ni proceso Node permanente para servir la SPA.

El build escribe en `frontend/dist`. Apache/Plesk sirve esa carpeta y el archivo `.htaccess` incluido permite recargar rutas como `/como-usar`.

## URL del backend

Crear `frontend/.env.production` a partir de [frontend/.env.sample](frontend/.env.sample), o definir la variable en el entorno que ejecuta **Run Script**:

```dotenv
VITE_API_URL=https://api.pozometro.com.ar
```

Es el origen HTTPS público de Fastify, sin ruta. El frontend agrega `/api` automáticamente. Esta variable queda incorporada al JavaScript público: no colocar contraseñas, tokens ni otras claves. Cada cambio requiere volver a compilar y publicar el frontend.

## Ejecutar el deploy

Desde **Plesk → Node.js → Run Script**, con la raíz de aplicación configurada como `/httpdocs/frontend`, ejecutar:

```text
deploy:plesk
```

El comando equivale a `npm run deploy:plesk` dentro de `frontend/`. Usa el `frontend/package-lock.json`, instala solamente las dependencias del frontend con `npm ci --workspaces=false`, compila y deja el resultado en `dist/`. No instala ni compila el backend y no ejecuta migraciones.

No ejecutar otro build automático del monorepo ni usar **NPM install** desde el panel: el script realiza la instalación reproducible requerida. Revisar el log de **Run Script**; falla temprano si falta `VITE_API_URL`, Node no es 20 o no se genera `dist/.htaccess`.

## Configuración separada del backend

En el servidor que ejecuta Fastify, definir `CORS_ORIGIN` con el origen exacto del frontend, por ejemplo:

```dotenv
CORS_ORIGIN=https://www.pozometro.com.ar
NODE_ENV=production
DATABASE_URL=... # solo en el backend
```

Habilitar HTTPS en ambos hosts. Mantener frontend y API bajo el mismo dominio registrable —por ejemplo `www.pozometro.com.ar` y `api.pozometro.com.ar`— para que funcionen las cookies de sesión actuales. Ngrok sirve para pruebas temporales, no para producción. CORS debe permitir credenciales y coincidir exactamente con el origen frontend.

## Verificación

Abrir la pestaña **Network** del navegador y confirmar que las llamadas van a `https://api.pozometro.com.ar/api/...`, nunca a `localhost`. Probar también `https://api.pozometro.com.ar/api/health/live`. Si aparece un error CORS, revisar `CORS_ORIGIN` en Fastify y que el certificado HTTPS del backend sea válido.
