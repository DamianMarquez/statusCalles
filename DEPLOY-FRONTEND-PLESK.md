# Deploy separado del frontend en Plesk

El frontend es una SPA estática. El script de publicación instala y compila únicamente el workspace `frontend`; no instala, compila ni reinicia el backend.

## Configurar la URL pública del backend

El bundle se genera con la variable pública `VITE_API_URL`. Su valor es el origen público del backend, sin secretos. Por ejemplo:

```text
VITE_API_URL=https://api.pozometro.com.ar
```

El frontend agrega `/api` automáticamente, por lo que consultará `https://api.pozometro.com.ar/api/...`. También acepta que la variable termine en `/api`. Si se usa un proxy del mismo origen, el valor puede ser `/api`.

En Plesk, configurá `VITE_API_URL` en el entorno que ejecuta **Run Script** antes del build. Si ese entorno no hereda las variables de la aplicación Node, creá en la raíz del monorepo un archivo `.env.production` con esta línea:

```dotenv
VITE_API_URL=https://api.pozometro.com.ar
```

El archivo solo contiene una dirección pública, no credenciales. La URL queda incluida en los archivos JavaScript descargados por los navegadores; nunca pongas `DATABASE_URL`, passwords, claves privadas ni tokens en variables `VITE_*`. Cada vez que cambie la URL del backend, hay que volver a ejecutar el deploy del frontend.

## Publicar

Desde **Plesk → Node.js → Run Script**, en la raíz del proyecto, ejecutar el script npm:

```text
deploy:frontend:plesk
```

Equivale a:

```bash
npm run deploy:frontend:plesk
```

El proceso requiere Node 20 y npm disponible en Plesk. Instala las dependencias del workspace frontend usando el `package-lock.json` de la raíz, compila Vite y copia `frontend/dist` al document root. Por defecto publica en `public/` dentro de la raíz de la aplicación. Si el document root configurado es otro, establecer `PLESK_DOCUMENT_ROOT` en el entorno del script, por ejemplo `/var/www/vhosts/pozometro.com.ar/httpdocs`.

No hace falta mantener un proceso Node corriendo para servir los archivos estáticos. En Plesk, apuntá el document root del dominio a la carpeta de destino del build. El `.htaccess` de Vite se copia junto con el bundle para que funcionen las rutas SPA al abrirlas o recargarlas.

## Configuración del backend

En la aplicación Node que ejecuta Fastify, configurar:

```text
CORS_ORIGIN=https://www.pozometro.com.ar
NODE_ENV=production
DATABASE_URL=... (solo en el backend)
```

`CORS_ORIGIN` debe ser el origen exacto del frontend: incluir `https://` y, si corresponde, el puerto; no agregar rutas ni una barra final. Fastify ya habilita CORS con credenciales, y el frontend envía cookies con `credentials: include`.

Para que login, sesión y funciones autenticadas funcionen con la cookie `SameSite=Lax`, lo recomendado es publicar ambos hosts bajo el mismo dominio registrable y con HTTPS, por ejemplo `www.pozometro.com.ar` y `api.pozometro.com.ar`. Si el frontend y el backend están en dominios registrables distintos, la cookie actual no se enviará en las llamadas fetch cross-site; hace falta adaptar deliberadamente la política de cookies y protección CSRF del backend. CORS por sí solo no resuelve ese caso.

## Comprobación

Después de publicar, abrir en el navegador la URL del frontend y revisar la pestaña **Network**. Las solicitudes deben ir a `https://api.pozometro.com.ar/api/...`, no a `localhost`. Probar también `https://api.pozometro.com.ar/api/health/live`. Si el navegador informa un error CORS, revisar que `CORS_ORIGIN` coincida exactamente con el origen del sitio y que el backend permita credenciales.
