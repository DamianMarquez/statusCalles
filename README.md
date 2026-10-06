# Street Status

MVP para consultar y reportar problemas de circulación en calles de la Ciudad Autónoma de Buenos Aires (CABA). El proyecto es un monolito modular con frontend React y backend Fastify, más PostgreSQL/PostGIS para persistir los reportes.

## Alcance actual

- Mapa interactivo de CABA con Leaflet y OpenStreetMap, marcador de ubicación del usuario y reportes mock de frontend.
- API Fastify con health check y endpoints REST para persistir y consultar reportes.
- Reportes almacenados en PostgreSQL con `GEOGRAPHY(POINT, 4326)` y consultas de radio ejecutadas por PostGIS.
- Migraciones versionadas con Drizzle Kit.
- TypeScript estricto, ESLint, Prettier y tests de integración.

El mapa todavía muestra los marcadores mock; la conexión del frontend con `GET /api/reports` queda para una fase posterior. No hay autenticación, creación de reportes desde el mapa ni moderación avanzada.

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

   La API escucha por defecto en `http://localhost:3000`. En otra terminal se puede iniciar el frontend:

   ```bash
   npm run dev:frontend
   ```

   Vite informa la URL local, normalmente `http://localhost:5173`.

Para crear una migración al cambiar el esquema: `npm run db:generate`; revisar el SQL generado y aplicarlo con `npm run db:migrate`. Las credenciales de `.env.example` son solo para desarrollo local.

La aplicación usa los tiles estándar de OpenStreetMap y muestra su atribución visible en el mapa. El servicio público de tiles tiene capacidad limitada y disponibilidad best-effort; para producción o tráfico importante, revisar la [política de uso de tiles de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) y elegir un proveedor de tiles basado en OSM o alojar tiles propios según corresponda.

## API de reportes

La API está bajo `/api`. Los tipos admitidos son `POTHOLE`, `FLOOD`, `ROAD_DAMAGE`, `ROAD_BLOCKED`, `ROAD_WORK`, `TRAFFIC_LIGHT` y `OTHER`. Las severidades aceptan `LOW`, `MEDIUM`, `HIGH` y `CRITICAL`, almacenadas como los niveles numéricos 1 a 4. Los estados son `ACTIVE` y `RESOLVED`.

| Método y ruta                                            | Uso                                     |
| -------------------------------------------------------- | --------------------------------------- |
| `GET /api/health`                                        | Health check                            |
| `GET /api/reports?lat=-34.6037&lng=-58.3816&radius=1000` | Buscar en un radio, expresado en metros |
| `POST /api/reports`                                      | Crear un reporte                        |
| `GET /api/reports/:id`                                   | Consultar un reporte                    |
| `PATCH /api/reports/:id/status`                          | Cambiar entre `ACTIVE` y `RESOLVED`     |

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"type":"POTHOLE","severity":"HIGH","description":"Bache grande","latitude":-34.6037,"longitude":-58.3816}'
```

Las coordenadas se validan dentro de los rangos de latitud y longitud, la descripción se limita a 500 caracteres y los objetos rechazan propiedades adicionales. La búsqueda exige `lat`, `lng` y `radius`, limita el radio a 50 km y devuelve hasta 200 resultados. El filtro espacial usa `ST_DWithin` sobre la columna geography, que mide en metros y puede usar el índice GiST. Las consultas SQL se parametrizan mediante Drizzle.

La API devuelve DTOs con `{ latitude, longitude }`, fechas ISO y enums públicos; no serializa filas o tipos internos de la base.

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
  src/components/map/     # Mapa, configuración, geolocalización y datos mock
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
      streets/             # Reservado para el dominio de calles
    infrastructure/
      database/            # Pool, esquema Drizzle y repositorio PostGIS
```

## Evoluciones posibles

La base permite agregar confirmaciones, Street Score, historial, integración con datos públicos de CABA, fotografías, cuentas y reputación, y recomendaciones de rutas. Estas capacidades quedan fuera de esta fase.
