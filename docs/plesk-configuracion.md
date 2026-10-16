# Configuración de Street Status en Plesk

El frontend y el backend se despliegan por separado. Esta configuración describe el frontend estático dentro de Plesk; Fastify corre en el servidor de API elegido.

## Frontend estático

| Campo de Plesk | Valor |
| --- | --- |
| Versión de Node.js | Node 20.x para ejecutar el script de instalación/build |
| Administrador de paquetes | npm |
| Raíz de aplicación | `/httpdocs/frontend` |
| Raíz del documento | `/httpdocs/frontend/dist` |
| Modo | `production` |
| Archivo de inicio | No se usa para servir la SPA; Apache sirve `dist/` |

En `frontend/.env.production` o en el entorno de **Run Script**, definir:

```dotenv
VITE_API_URL=https://api.pozometro.com.ar
```

Es el origen HTTPS de Fastify. Vite lo incorpora al bundle público y agrega `/api`; no colocar secretos en variables `VITE_*`.

Desde **Run Script**, con la raíz de aplicación `/httpdocs/frontend`, ejecutar `deploy:plesk`. El paquete frontend instala sus propias dependencias con `npm ci --workspaces=false`, compila a `dist/` y verifica el fallback SPA. No ejecutar NPM install desde otra carpeta ni un build automático del monorepo. Ver [DEPLOY-FRONTEND-PLESK.md](../DEPLOY-FRONTEND-PLESK.md).

## Backend Fastify

El backend se despliega por separado en su servidor de aplicación. Configurar al menos:

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | URI PostgreSQL/Supabase con SSL; solo backend |
| `CORS_ORIGIN` | Origen exacto del frontend, por ejemplo `https://www.pozometro.com.ar` |
| `NODE_ENV` | `production` |
| `PORT` | Puerto asignado por el hosting; Fastify lo consume al iniciar |

Las cookies actuales requieren HTTPS y conviene que frontend y API compartan el dominio registrable, por ejemplo `www.pozometro.com.ar` y `api.pozometro.com.ar`. CORS debe aceptar credenciales y usar el origen exacto. Las migraciones se ejecutan explícitamente contra la base antes de publicar cambios de esquema; no forman parte del build frontend.
