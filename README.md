# Street Status

MVP para consultar y reportar problemas de circulación en calles de la Ciudad Autónoma de Buenos Aires (CABA). El proyecto es un monolito modular con frontend React y backend Fastify, más PostgreSQL/PostGIS para persistir los reportes.

## Alcance actual

- Mapa interactivo de CABA con Leaflet y OpenStreetMap, marcador de ubicación del usuario y reportes cargados desde la API según el viewport visible.
- Creación de reportes desde el mapa con selección de ubicación, validación y envío a la API.
- Confirmaciones comunitarias por reporte; cada usuario puede confirmar o indicar que ya no existe, y cambiar su voto.
- Registro, ingreso, cierre de sesión y perfil con sesión persistida y cookie protegida.
- Street Score estimado por áreas geográficas con reportes suficientes, visible como celdas explicables en el mapa.
- API Fastify con health check y endpoints REST para persistir y consultar reportes.
- Reportes almacenados en PostgreSQL con `GEOGRAPHY(POINT, 4326)` y consultas de radio ejecutadas por PostGIS.
- Migraciones versionadas con Drizzle Kit.
- TypeScript estricto, ESLint, Prettier y tests de integración.

No hay login social ni moderación avanzada.

## Requisitos

- Node.js 20.19 o superior (o 22.13 o superior) y npm.
- Docker y Docker Compose.

## Puesta en marcha

1. Instalar las dependencias desde la raíz:

   ```bash
   npm install
   ```

2. Crear las variables locales:

   ```bash
   cp .env.example .env
   ```

   `DATABASE_URL` por defecto conecta con `street_status` en `localhost:5432`.

3. Iniciar PostgreSQL + PostGIS:

   ```bash
   docker compose up -d database
   ```

   Si el puerto local `5432` ya está ocupado, iniciar Compose con otro puerto y actualizar `DATABASE_URL` en `.env`:

   ```bash
   POSTGRES_PORT=5433 docker compose up -d database
   ```

   En `.env`, usar el mismo puerto para la API:

   ```dotenv
   POSTGRES_PORT=5433
   DATABASE_URL=postgres://street_status:street_status@localhost:5433/street_status
   ```

4. Aplicar las migraciones versionadas:

   ```bash
   npm run db:migrate
   ```

   Este paso instala PostGIS y crea los tipos, constraints, tabla e índices. Ejecutarlo antes de iniciar el backend o los tests.

5. En una terminal, iniciar el backend:

   ```bash
   npm run dev:backend
   ```

   La API escucha por defecto en `http://localhost:3000`. El backend habilita CORS para `http://localhost:5173` mediante `CORS_ORIGIN`. El frontend usa `VITE_API_URL` para elegir la URL base de la API; por defecto es `http://localhost:3000`. En otra terminal se puede iniciar el frontend:

   ```bash
   npm run dev:frontend
   ```

   Vite informa la URL local, normalmente `http://localhost:5173`.

Para crear una migración al cambiar el esquema: `npm run db:generate`; revisar el SQL generado y aplicarlo con `npm run db:migrate`. Las credenciales de `.env.example` son solo para desarrollo local.

La aplicación usa los tiles estándar de OpenStreetMap y muestra su atribución visible en el mapa. El servicio público de tiles tiene capacidad limitada y disponibilidad best-effort; para producción o tráfico importante, revisar la [política de uso de tiles de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) y elegir un proveedor de tiles basado en OSM o alojar tiles propios según corresponda.

## API de reportes

La API está bajo `/api`. Los tipos admitidos son `POTHOLE`, `FLOOD`, `ROAD_DAMAGE`, `ROAD_BLOCKED`, `ROAD_WORK`, `TRAFFIC_LIGHT` y `OTHER`. Las severidades aceptan `LOW`, `MEDIUM`, `HIGH` y `CRITICAL`, almacenadas como los niveles numéricos 1 a 4. Los estados efectivos son `ACTIVE`, `STALE` y `RESOLVED`.

| Método y ruta                                                    | Uso                                          |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `GET /api/health`                                                | Health check                                 |
| `GET /api/reports?south=-34.7&north=-34.5&west=-58.5&east=-58.3` | Buscar dentro del viewport visible           |
| `GET /api/reports?lat=-34.6037&lng=-58.3816&radius=1000`         | Buscar en un radio, expresado en metros      |
| `POST /api/reports`                                              | Crear un reporte                             |
| `POST /api/reports/:id/feedback`                                 | Crear o cambiar la confirmación comunitaria  |
| `POST /api/auth/register`                                        | Crear una cuenta e iniciar sesión            |
| `POST /api/auth/login`                                           | Iniciar sesión                               |
| `POST /api/auth/logout`                                          | Revocar la sesión actual                     |
| `GET /api/auth/session`                                          | Consultar la sesión actual                   |
| `GET /api/users/me`                                              | Perfil y estadísticas de reputación          |
| `GET /api/reports/:id`                                           | Consultar un reporte                         |
| `PATCH /api/reports/:id/status`                                  | Cambiar entre `ACTIVE`, `STALE` y `RESOLVED` |

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"type":"POTHOLE","severity":"HIGH","description":"Bache grande","latitude":-34.6037,"longitude":-58.3816}'
```

Las coordenadas se validan dentro de los rangos de latitud y longitud, la descripción se limita a 500 caracteres y los objetos rechazan propiedades adicionales. La búsqueda acepta un viewport geográfico (`south`, `north`, `west`, `east`) o un radio (`lat`, `lng`, `radius`, máximo 50 km); ambas devuelven hasta 200 resultados. El viewport se filtra con PostGIS contra su bounding box, y el radio usa `ST_DWithin` sobre geography. Las consultas SQL se parametrizan mediante Drizzle. El mapa solicita el viewport al abrirse y al terminar cada movimiento/zoom, con debounce de 300 ms, cancelación de solicitudes anteriores y protección frente a respuestas fuera de orden. Si falla la API, el mapa permanece visible con opción para reintentar; no se usa clustering en esta etapa.

La API devuelve DTOs con `{ latitude, longitude }`, fechas ISO y enums públicos; no serializa filas o tipos internos de la base.

Para crear un reporte, presionar **Reportar problema**, tocar el mapa para marcar la ubicación y completar tipo y severidad. La descripción es opcional (máximo 500 caracteres). La API valida tipo, severidad, coordenadas y longitud de descripción; si se omite, persiste una descripción vacía. Una creación correcta devuelve el DTO del reporte, que se agrega al mapa inmediatamente.

## Cuentas y sesión

El registro pide email, nombre visible y contraseña de al menos 12 caracteres. El backend almacena exclusivamente un hash `scrypt` con salt aleatorio (N=32768, r=8, p=1); el login responde con un error genérico cuando email o contraseña no coinciden. Registro y login están limitados a 5 intentos por minuto por IP; creación de reportes, a 20; feedback, a 30. Si el backend está detrás de un proxy, `TRUST_PROXY` debe listar las IP/CIDR del proxy de confianza para calcular la IP cliente correctamente; no lo configures como `*`.

El BFF emite un token aleatorio opaco de 256 bits como cookie `street_status_session` (`HttpOnly`, `SameSite=Lax`, `Path=/api`, 30 días); la base conserva solo su SHA-256 y vencimiento. En producción la cookie usa `Secure`. El frontend envía cookies con `credentials: include`; no guarda tokens, contraseñas ni identificadores de voto en `localStorage`. El BFF comprueba `Origin` contra `CORS_ORIGIN` en solicitudes con origen y CORS permite credenciales únicamente para los orígenes configurados. Publicá frontend y BFF bajo el mismo site (idealmente detrás de un mismo origen/reverse proxy) para que `SameSite=Lax` funcione. Configurá HTTPS y `NODE_ENV=production` detrás del proxy de producción.

`POST /api/reports/:id/feedback` y `PATCH /api/reports/:id/status` requieren sesión. Los reportes pueden seguir creándose sin cuenta; si hay sesión, se registra el propietario. Los votos nuevos se asocian a `user_id` y cada usuario puede tener una decisión por reporte. Las filas históricas de votos anónimos siguen agregándose y la migración conserva el identificador temporal solo para esas filas previas; la aplicación ya no lo emite ni lo consume. Los reportes previos conservan sus datos con `user_id` nulo.

El perfil muestra nombre, email, fecha de registro, total de reportes, confirmaciones dadas y métricas descriptivas de reputación (reportes propios confirmados/resueltos y feedback útil). Son contadores derivados; no representan puntos ni un ranking.

La política central `ReportFreshnessPolicy` calcula los campos `status` y `freshness` al responder la API. Un reporte o confirmación de hasta un día se muestra como `FRESH`; hasta 30 días, como `AGING`; después de 30 días sin confirmaciones recientes, como `STALE`. `RESOLVED` permanece resuelto. La confianza combina una señal de recencia con votos comunitarios ponderados por una vida media de 30 días; los votos viejos pierden peso progresivamente. Los umbrales están centralizados en el dominio. La frescura se deriva al leer: reportes y votos se conservan para el histórico.

## Street Score

`GET /api/streets/score?south=-34.7&north=-34.5&west=-58.5&east=-58.3` calcula estimaciones únicamente en el área solicitada (cada dimensión debe abarcar como máximo un grado). La búsqueda usa PostGIS y consulta hasta 5.000 reportes de ese viewport; no recorre todas las calles de CABA. Como todavía no existe un catálogo de segmentos viales, el resultado se agrupa en celdas geográficas aproximadas de 250 m. Solo se devuelve una celda cuando contiene al menos dos reportes actualmente activos; las demás no reciben un score ni se les asigna nombre de calle.

La primera fórmula está implementada en `StreetScoreCalculator` y es determinista para un instante de evaluación dado:

1. Por cada reporte activo, partir de una penalización según severidad: baja 8, media 16, alta 32 y crítica 50 puntos.
2. Reducir la penalización por antigüedad con decaimiento exponencial y vida media de 30 días, usando como actividad más reciente una confirmación si existe.
3. Multiplicar por `1 + 0.08 × confirmaciones ponderadas`, con máximo 1.4. Los votos pierden peso con la misma vida media de 30 días.
4. Reducir el impacto por votos de resolución: multiplicador `max(0.25, 1 - 0.15 × resoluciones ponderadas)`.
5. Reflejar concentración con `min(1.5, 1 + 0.1 × (reportes activos - 1))` y calcular `score = clamp(0, 100, redondear(100 - suma(penalizaciones) × concentración))`.

El score se etiqueta como muy malo (0–34), malo (35–59), regular (60–79) o bueno (80–100). La respuesta incluye reportes activos, cantidad de alta severidad, confirmaciones, resoluciones y fecha del último reporte para que la estimación se pueda entender. Los reportes resueltos no reducen el score; sí aparecen como contexto histórico. La interfaz dibuja las celdas disponibles y aclara que son estimaciones, no calles identificadas. La fórmula es una primera aproximación y se puede ajustar cuando haya más datos reales o un modelo de segmentos.

## Persistencia y decisión de ORM

Se eligió **Drizzle ORM + Drizzle Kit** por sus tipos TypeScript y migraciones versionadas para PostgreSQL. Drizzle tiene soporte PostGIS para geometry; para conservar `GEOGRAPHY(POINT, 4326)`, el esquema declara un tipo custom y la migración contiene el SQL específico para crear la extensión y la columna. La creación y lectura geográfica usan las funciones PostGIS necesarias a través del SQL parametrizado de Drizzle.

El módulo `reports` mantiene dominio, aplicación, HTTP/DTO y repositorio separados. `streets` no participa en el almacenamiento ni en las rutas de reportes. El repositorio de persistencia es la implementación concreta de una interfaz usada por el servicio y las rutas.

## Comandos

Desde la raíz:

| Comando                | Acción                                          |
| ---------------------- | ----------------------------------------------- |
| `npm run dev:backend`  | Backend en modo watch                           |
| `npm run dev:frontend` | Servidor de desarrollo Vite                     |
| `npm run db:generate`  | Genera una migración desde el esquema Drizzle   |
| `npm run db:migrate`   | Aplica migraciones pendientes                   |
| `npm run build`        | Compila backend y frontend                      |
| `npm test`             | Ejecuta tests; requiere base iniciada y migrada |
| `npm run lint`         | Ejecuta ESLint                                  |
| `npm run format`       | Formatea con Prettier                           |
| `npm run format:check` | Comprueba el formato                            |

Para detener PostgreSQL: `docker compose down`. Para borrar también sus datos: `docker compose down -v`.

## Estructura

```text
frontend/
  src/api/                # Cliente HTTP y contratos públicos de reportes
  src/components/map/     # Mapa, formulario, selector de ubicación y marcadores
backend/
  drizzle/                # Migraciones SQL y snapshots de Drizzle Kit
  src/
    app/                  # Composición de la app Fastify
    modules/
      reports/
        domain/            # Tipos, severidad y entidad de reporte
        application/       # Servicio y contrato del repositorio
        http/              # Rutas, validación y DTOs
      health/
      users/               # Identidad, hashing, sesiones y perfil
      streets/             # Reservado para el dominio de calles
    infrastructure/
      database/            # Pool, esquema Drizzle y repositorio PostGIS
```

## Evoluciones posibles

La base permite agregar confirmaciones, Street Score, historial, integración con datos públicos de CABA, fotografías, cuentas y reputación, y recomendaciones de rutas. Estas capacidades quedan fuera de esta fase.
