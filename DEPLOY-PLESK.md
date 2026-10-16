# Despliegue offline en Plesk

Este flujo prepara frontend y backend en una máquina con acceso a npm. El servidor Plesk recibe el build y las dependencias de producción ya instaladas; **no debe ejecutar `npm install`**. El backend se ejecuta como proceso Node persistente y el frontend se sirve como archivos estáticos.

## 1. Generar el paquete

Requisitos para el flujo recomendado: Docker iniciado, acceso a `registry.npmjs.org` y espacio suficiente para el build. Desde la raíz del repositorio:

```bash
bash scripts/build-deploy.sh
```

El comando usa `node:20-bookworm` para Linux x64/glibc, instala con `npm ci` usando el lockfile, compila backend y frontend y crea `deploy/` y `deploy.tar.gz`. El archivo contiene `app.js`, manifests, el lockfile, backend compilado y fuente, migraciones, frontend estático en `public/` y `node_modules` de producción. La verificación importa el backend dentro de Docker. El artefacto se genera sin incluir `.env`.

Alternativa cuando no hay Docker, en Node 20 y npm 10.4 o superior:

```bash
bash scripts/build-deploy-nodocker.sh
```

Esta alternativa compila con las herramientas nativas del host e instala las dependencias finales con destino `linux/x64/glibc`. `file` verifica los binarios ELF y Node comprueba la resolución de módulos, pero el host no puede confirmar que los addons Linux carguen allí. Para una validación completa, ejecutar luego `bash scripts/verify-deploy.sh` en una máquina con Docker.

Para verificar el paquete Docker de forma independiente:

```bash
bash scripts/verify-deploy.sh
```

## 2. Subir y extraer

1. Subir `deploy.tar.gz` por SFTP o desde **Plesk → Files**.
2. Extraerlo dentro de la raíz del sitio `httpdocs`. El archivo no crea una carpeta contenedora `deploy/`; deja `app.js`, `backend/`, `node_modules/` y `public/` en esa raíz.
3. No subir `.env`, `.git` ni `node_modules` de macOS/Windows por separado.

El paquete se puede regenerar y subir en cada publicación. La extracción debe reemplazar los archivos de la versión previa y no debe borrar directorios de datos ajenos al paquete.

## 3. Configurar Node.js en Plesk

En **Websites & Domains → Node.js**:

- Versión: Node.js 20.x (compatible con Node 20.20.2).
- Application root: `/httpdocs`.
- Application startup file: `app.js`.
- Application mode: `production`.
- Document root del sitio: `/httpdocs/public`.
- No presionar **NPM install** ni configurar un build automático de npm.

El frontend queda separado en `public/` para que Apache no exponga `backend/` ni `node_modules/`. El backend escucha en `PORT` si Plesk lo proporciona y usa `BACKEND_PORT` como alternativa.

## 4. Variables de entorno

Cargarlas en la sección **Custom environment variables** de la aplicación Node de Plesk. No incluirlas en el paquete ni en `frontend/`; cualquier valor `VITE_*` se publica en el navegador.

Como mínimo:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://usuario:contraseña@host:puerto/base?sslmode=require
CORS_ORIGIN=https://tu-dominio.example
```

Plesk suele asignar `PORT`; no fijarlo manualmente salvo que el panel lo requiera. `BACKEND_HOST` puede ser `0.0.0.0`. `TRUST_PROXY` se configura sólo si aplica, con las IP/CIDR confiables del proxy. Pool PostgreSQL y URL de búsqueda USIG pueden usar defaults o configurarse según la guía existente del proyecto. No poner contraseñas reales en comandos, logs ni archivos versionados.

Si la base necesita cambios de esquema, ejecutar las migraciones una vez desde un entorno con conectividad a Supabase antes de publicar la versión; el arranque no las ejecuta.

## 5. Reiniciar y ver logs

Después de extraer el paquete, reiniciar desde el botón **Restart App** de la sección Node.js de Plesk. Si Passenger no reinicia automáticamente, crear/tocar `tmp/restart.txt` bajo `/httpdocs` y volver a reiniciar desde el panel. Los logs se consultan en **Node.js → Logs** o **Websites & Domains → Logs**, según la versión de Plesk.

Verificar `https://tu-dominio.example/api/health/live` y luego `https://tu-dominio.example/api/health/ready`. El primero prueba el proceso; el segundo también requiere conexión a PostgreSQL.

## Solución de problemas

- **`invalid ELF header`, módulo nativo incompatible o `Exec format error`:** regenerar con `bash scripts/build-deploy.sh` y Docker `linux/amd64`; no reutilizar `node_modules` de macOS/Windows ni desplegar desde otra arquitectura.
- **`Cannot find package` / módulo faltante:** verificar que el tar incluya `node_modules/`, `backend/dist/`, `backend/package.json` y `app.js`; extraer de nuevo el paquete completo. No intentar reparar ejecutando npm en Plesk.
- **Permiso denegado o startup no encontrado:** confirmar propietario/lectura para el usuario de la suscripción, Application root `/httpdocs` y startup `app.js`; extraer el tar preservando permisos y symlinks.
- **La app no escucha o Plesk informa puerto incorrecto:** dejar que Plesk inyecte `PORT`, comprobar los logs y confirmar que no se fijó un puerto incompatible. En desarrollo local el fallback es `BACKEND_PORT` o 3000.
- **`ECONNRESET` durante el empaquetado:** Docker/CI necesita acceso HTTPS saliente a npm; esta solución evita esa instalación en el servidor, pero no descarga dependencias sin conectividad en la máquina que genera el paquete.
- **API viva pero readiness falla:** comprobar `DATABASE_URL`, SSL, allowlist/firewall y migraciones de Supabase.
