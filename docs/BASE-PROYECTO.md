# Street Status (Pozómetro) — Documento base

> Relevamiento del 2026-11-18, rama `feature/prueba-plesk`. Punto de partida para decidir qué mejorar y qué cambiar. Se basa en el código, el README y la ejecución de lint/tipos/tests.

## 1. Qué es

App para consultar y reportar el estado de las calles de CABA. Dominio público: `pozometro.com.ar`. Los usuarios reportan baches, inundaciones, cortes y obras sobre un mapa. El sistema calcula una **condición física estimada** por segmento de calle (Street Score) y, por separado, la **disponibilidad** para circular.

## 2. Stack y arquitectura

| Capa          | Tecnología                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Monorepo      | npm workspaces (`frontend`, `backend`), TypeScript estricto, ESLint, Prettier, Vitest                         |
| Frontend      | React 19, Vite 6, MapLibre GL (migrado desde Leaflet; estilo vía `VITE_MAP_STYLE_URL`)                        |
| Backend       | Fastify 5, Drizzle ORM, `pg`, `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`                       |
| Datos         | PostgreSQL + PostGIS (`postgis/postgis:16-3.4` local, Supabase en `.env`)                                     |
| Integraciones | USIG (normalizador de direcciones), datasets abiertos de CABA (calles, barrios, comunas, ciclovías, Metrobus) |
| Deploy        | Plesk (frontend estático + backend Node), con restos de Vercel (`vercel.json`, `backend/api/[...path].ts`)    |

El backend es un monolito modular por capas: `modules/<dominio>/{domain,application,http}` más `infrastructure/{database,external}`.

Dominios: `reports`, `streets` (score, catálogo, información vial), `users`/auth, `analytics`, `addresses`, `mobility`, `health`.

### Modelo de datos (23 tablas, 18 migraciones)

- **Geografía oficial**: `geographic_sources`, `communes`, `neighborhoods`, `streets`, `street_segments`, `mobility_infrastructure`.
- **Información vial comunitaria**: perfil vigente, propuestas, confirmaciones e historial por segmento. Un cambio se aplica con 3 confirmaciones de otros usuarios.
- **Reportes**: `street_reports`, `report_feedback`, `report_flags`, `moderation_audit`.
- **Usuarios**: `users`, `auth_sessions` (roles incluyendo `MODERATOR` y `ADMIN`).
- **Infra**: `rate_limit_windows` (rate limit persistido en Postgres).

### Funcionalidades hoy

- Mapa con reportes por viewport, filtros combinables y "Mis reportes".
- Alta de reportes, confirmar o negar reportes ajenos, detección de duplicados, denuncias y moderación con auditoría.
- Capas del mapa: Street Score por segmento, tipo de pavimento comunitario, ciclovías y Metrobus.
- Panel "Informar calle" (propuestas de pavimento, estado y tratamientos).
- Dashboard de analytics público, más vistas para moderador y admin.
- Búsqueda de direcciones, registro/login con sesión por cookie, tutorial.

## 3. Estado de salud (verificado hoy)

| Chequeo                      | Resultado                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Typecheck backend y frontend | OK                                                                                                                                                           |
| ESLint                       | OK                                                                                                                                                           |
| Tests frontend               | 85/85 OK                                                                                                                                                     |
| Tests backend                | 82 OK, **41 omitidos**, 4 archivos fallan                                                                                                                    |
| Causa de las fallas backend  | Los tests de integración apuntan a la DB de Supabase de `.env` y esta responde `tenant/user ... not found` (proyecto pausado, borrado o credenciales viejas) |

Conclusión: el código compila y la lógica pura está testeada, pero **hoy no se puede validar nada que toque la base** (reportes, scoring con PostGIS, información vial, importadores).

Trabajo sin commitear: 15 archivos modificados sobre la capa de estilos del mapa (`roadSurfaceStyle`, `streetConditionStyle`, `StreetScoreLayer`, leyenda y controles de capas) más un test nuevo. También cambió `.env`.

## 4. Hallazgos y qué mejorar

### Críticos (resolver antes de seguir)

1. **Credenciales en git.** `.env` y `frontend/src/.env` están versionados, y el `.gitignore` tiene `#.env` comentado. El `.env` contiene una `DATABASE_URL` de Supabase con contraseña. Hay que rotar esa contraseña, sacar los archivos del índice (`git rm --cached`), reactivar `.env` en `.gitignore` y evaluar limpiar el historial. `TEST_DATABASE_URL` apunta a la **misma** base que `DATABASE_URL`, y los tests de integración escriben y borran datos, así que corren contra producción.
2. **Base de datos inaccesible.** Decidir si Supabase sigue siendo el destino. Mientras tanto, usar el `docker-compose` local con una base de tests separada para recuperar los 41 tests omitidos.
3. **Binarios en el repo.** `deploy.tar.gz` (~10 MB) está versionado aunque `.gitignore` lo menciona comentado. Sacarlo, y generar los artefactos en CI o en el script de deploy.

### Importantes

4. **Deploy duplicado y confuso.** Conviven Plesk (`DEPLOY-PLESK.md`, `DEPLOY-FRONTEND-PLESK.md`, `docs/plesk-configuracion.md`, tres scripts de build), Vercel (`vercel.json`, handler serverless) y un `app.js` raíz que importa `backend/dist`. Elegir una plataforma, borrar lo otro y dejar un solo documento de deploy.
5. **README de 47 KB** que mezcla manual de API, decisiones de diseño, parámetros de calibración y deploy. Dividirlo en `docs/` (API, scoring, datos CABA, deploy) y dejar un README corto de arranque. Ya hay dos desactualizaciones: dice "no hay dashboard de moderación" pero existen rutas y analytics de moderación, y sigue mencionando Supabase y Plesk en paralelo.
6. **Restos de OSRM.** `data/routing/` (ignorado) y `OSRM_BASE_URL` / `RATE_LIMIT_ROUTING_*` en `.env` quedaron tras el commit "Removed OSMR". Limpiar variables y límites sin uso.
7. **Archivos de entorno duplicados.** `.env.sample`, `envsample.txt` y `frontend/.env.sample` se superponen. Dejar uno por workspace. El `.env.sample` actual trae valores de producción como placeholders (`pozometro.com.ar`); usar valores de desarrollo.
8. **Sin CI.** No hay pipeline que corra lint, tipos y tests. Agregar GitHub Actions con un servicio PostGIS para los tests de integración.
9. **Score sin calibrar.** Los siete rangos (`EXCELLENT`…`CRITICAL`) y los pesos (65 % severidad, 35 % frescura) son iniciales. Se calcula **bajo demanda y sin caché** para cada consulta. Definir criterio de calibración con datos reales y evaluar precalcular o cachear por segmento cuando suba el volumen.

### Mejoras de calidad y producto

10. **Archivos grandes.** `MapView.tsx` (683 líneas), `AnalyticsDashboard.tsx` (425), `street-score-calculator.ts` (509) y `reports.routes.ts` (401) se benefician de dividirse. El frontend no usa router ni librería de estado (todo en `App.tsx` y hooks), lo cual se vuelve costoso al crecer.
11. **Frontend sin data-fetching estructurado.** Evaluar TanStack Query para cache, reintentos y cancelación de las consultas por viewport.
12. **Tests end-to-end ausentes.** Los tests de frontend son de componentes. Falta un flujo completo (reportar, confirmar, moderar) con Playwright.
13. **Tiles de OSM públicos.** Su política de uso no sirve para tráfico real. Pasar a un proveedor basado en OSM o a tiles propios antes de lanzar.
14. **Seguridad a revisar.** Hay rate limit y cookies protegidas, lo cual es buen punto de partida. Faltan una auditoría de CSRF para las rutas con cookie, política de contraseñas y recuperación de cuenta, y verificación de email. El README admite que no hay login social.
15. **Producto.** Sin fotos en reportes, sin notificaciones, sin reputación de usuarios ni rutas recomendadas (el README las lista como "evoluciones posibles"). Definir cuáles entran en la próxima fase.
16. **Observabilidad.** Solo hay `health/live` y `health/ready`. Agregar logs estructurados, métricas y alertas de errores.

## 5. Qué cambiar (decisiones abiertas)

| Decisión                  | Opciones                                              | Impacto                                 |
| ------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Hosting de backend y base | Plesk + Supabase / Vercel + Supabase / VPS con Docker | Define qué archivos de deploy se borran |
| Entornos                  | dev local, test aislado, producción                   | Evita que los tests toquen datos reales |
| Tiles del mapa            | OSM público / proveedor / autoalojado                 | Costo y escalabilidad                   |
| Calibración del score     | Mantener pesos / ajustar con datos reales             | Credibilidad del producto               |
| Alcance de fase 2         | Fotos, notificaciones, rutas, reputación              | Esquema de datos y almacenamiento       |

## 6. Plan de arranque sugerido

1. **Higiene (1–2 días):** rotar credenciales, sacar `.env`, `deploy.tar.gz` y `frontend/src/.env` del índice, separar `TEST_DATABASE_URL`, levantar PostGIS local y recuperar los 41 tests.
2. **Orden de deploy y docs (1–2 días):** elegir plataforma, borrar la otra, dividir el README, limpiar variables de OSRM.
3. **CI (0,5 día):** lint + tipos + tests con PostGIS.
4. **Cierre del trabajo en curso:** revisar y commitear los cambios de capas de mapa.
5. **Refactor y producto:** dividir `MapView`, agregar e2e, luego priorizar la fase 2.

## 7. Comandos útiles

```bash
npm install
cp .env.sample .env            # luego ajustar a valores de desarrollo
docker compose up -d database  # PostGIS local
npm run db:migrate
npm run dev:backend            # http://localhost:3000
npm run dev:frontend           # http://localhost:5173
npm run lint && npm test
npm run import:caba:all        # geografía oficial
npm run sync:caba:infrastructure
```
