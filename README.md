# Street Status

MVP para consultar y reportar problemas de circulación en calles de la Ciudad Autónoma de Buenos Aires (CABA). El proyecto es un monolito modular con frontend React y backend Fastify, más PostgreSQL/PostGIS para persistir los reportes.

## Alcance actual

- Mapa interactivo de CABA con Leaflet y OpenStreetMap, marcador de ubicación del usuario y reportes cargados desde la API según el viewport visible.
- Creación de reportes desde el mapa con selección de ubicación, validación y envío a la API.
- Confirmaciones comunitarias por reporte; cada usuario puede confirmar o indicar que ya no existe, y cambiar su voto.
- Registro, ingreso, cierre de sesión y perfil con sesión persistida y cookie protegida.
- Street Score estimado por áreas geográficas con reportes suficientes, visible como celdas explicables en el mapa.
- Moderación básica con detección de duplicados, marcación de contenido y cola administrativa con auditoría.
- API Fastify con health check y endpoints REST para persistir, consultar y moderar reportes.
- Reportes almacenados en PostgreSQL con `GEOGRAPHY(POINT, 4326)` y consultas de radio ejecutadas por PostGIS.
- Migraciones versionadas con Drizzle Kit.
- TypeScript estricto, ESLint, Prettier y tests de integración.

No hay login social ni dashboard de moderación.

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
| `POST /api/reports/:id/flags`                                    | Marcar contenido para revisión               |
| `GET /api/admin/reports`                                         | Cola de reportes marcados (moderador/admin)  |
| `PATCH /api/admin/reports/:id/moderation`                        | Ocultar o volver a mostrar (moderador/admin) |

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"type":"POTHOLE","severity":"HIGH","description":"Bache grande","latitude":-34.6037,"longitude":-58.3816}'
```

Las coordenadas se validan dentro de los rangos de latitud y longitud, la descripción se limita a 500 caracteres y los objetos rechazan propiedades adicionales. La búsqueda acepta un viewport geográfico (`south`, `north`, `west`, `east`) o un radio (`lat`, `lng`, `radius`, máximo 50 km); ambas devuelven hasta 200 resultados. El viewport se filtra con PostGIS contra su bounding box, y el radio usa `ST_DWithin` sobre geography. Las consultas SQL se parametrizan mediante Drizzle. El mapa solicita el viewport al abrirse y al terminar cada movimiento/zoom, con debounce de 300 ms, cancelación de solicitudes anteriores y protección frente a respuestas fuera de orden. Si falla la API, el mapa permanece visible con opción para reintentar; no se usa clustering en esta etapa.

La API devuelve DTOs con `{ latitude, longitude }`, fechas ISO y enums públicos; no serializa filas o tipos internos de la base.

Para crear un reporte, presionar **Reportar problema**, tocar el mapa para marcar la ubicación y completar tipo y severidad. La descripción es opcional (máximo 500 caracteres). La API valida tipo, severidad, coordenadas y longitud de descripción; si se omite, persiste una descripción vacía. Una creación correcta devuelve el DTO del reporte, que se agrega al mapa inmediatamente. Antes de crear, el backend busca por PostGIS reportes visibles del mismo tipo a 50 metros o menos, creados en las últimas 24 horas y no resueltos. Ante una coincidencia devuelve `409 SIMILAR_REPORT_EXISTS`; la interfaz avisa y permite reintentar confirmando `allowSimilar: true`. No se elimina ni se fusiona ningún reporte.

## Cuentas y sesión

El registro pide email, nombre visible y contraseña de al menos 12 caracteres. El backend almacena exclusivamente un hash `scrypt` con salt aleatorio (N=32768, r=8, p=1); el login responde con un error genérico cuando email o contraseña no coinciden. Los límites por IP se configuran con `RATE_LIMIT_{REPORTS,FEEDBACK,FLAGS,LOGIN,REGISTER,REPORT_STATUS}_MAX` y `RATE_LIMIT_{REPORTS,FEEDBACK,FLAGS,LOGIN,REGISTER,REPORT_STATUS}_WINDOW_SECONDS`; los valores del `.env.example` son 20, 30, 5, 5, 5 y 10 solicitudes por 60 segundos respectivamente. Se validan como enteros positivos. El limitador usa memoria local por proceso, suficiente para esta fase; con varias réplicas se necesita un almacén compartido antes de distribuir el tráfico. Si el backend está detrás de un proxy, `TRUST_PROXY` debe listar las IP/CIDR del proxy de confianza para calcular la IP cliente correctamente; no lo configures como `*`.

El BFF emite un token aleatorio opaco de 256 bits como cookie `street_status_session` (`HttpOnly`, `SameSite=Lax`, `Path=/api`, 30 días); la base conserva solo su SHA-256 y vencimiento. En producción la cookie usa `Secure`. El frontend envía cookies con `credentials: include`; no guarda tokens, contraseñas ni identificadores de voto en `localStorage`. El BFF comprueba `Origin` contra `CORS_ORIGIN` en solicitudes con origen y CORS permite credenciales únicamente para los orígenes configurados. Publicá frontend y BFF bajo el mismo site (idealmente detrás de un mismo origen/reverse proxy) para que `SameSite=Lax` funcione. Configurá HTTPS y `NODE_ENV=production` detrás del proxy de producción.

`POST /api/reports/:id/feedback`, `POST /api/reports/:id/flags` y `PATCH /api/reports/:id/status` requieren sesión. Un usuario puede cambiar su feedback, pero el índice único mantiene una sola decisión actual por reporte y usuario. Los reportes pueden seguir creándose sin cuenta; si hay sesión, se registra el propietario. Solo el autor del reporte puede cambiar su estado; moderadores y administradores pueden hacerlo también. Las filas históricas de votos anónimos siguen agregándose y la migración conserva el identificador temporal solo para esas filas previas; la aplicación ya no lo emite ni lo consume. Los reportes previos conservan sus datos con `user_id` nulo.

Las cuentas nuevas reciben el rol `USER`. `MODERATOR` y `ADMIN` no se pueden asignar desde la API pública: un operador debe otorgarlos de forma controlada desde la base de datos. La cola administrativa solo acepta esos roles. Cada cuenta puede marcar una sola vez cada reporte con motivo `SPAM`, `INAPPROPRIATE`, `FALSE_INFORMATION` u `OTHER`; las repeticiones reciben `409`. La acción administrativa `VISIBLE`/`HIDDEN` se guarda en `moderation_audit`, junto con actor, cambio, fecha y nota; las denuncias revisadas conservan su fecha de revisión. Los reportes ocultos se excluyen de consultas públicas, feedback y Street Score, sin borrar el contenido histórico. Ejemplo de promoción operativa, ejecutado únicamente por un operador autorizado: `UPDATE users SET role = 'MODERATOR' WHERE email = 'moderador@ejemplo.com';`.

Las solicitudes mutables con `Origin` se validan contra `CORS_ORIGIN`; cookies `HttpOnly`, `SameSite=Lax` y validación de origen son las defensas CSRF actuales. La cookie es `Secure` en producción. Respuestas y descripciones se renderizan como texto por React y no como HTML; los filtros y mutaciones SQL parametrizan valores con Drizzle. Los controles de moderación son básicos: no verifican la veracidad automáticamente ni sustituyen una revisión humana.

El perfil muestra nombre, email, fecha de registro, total de reportes, confirmaciones dadas y métricas descriptivas de reputación (reportes propios confirmados/resueltos y feedback útil). Son contadores derivados; no representan puntos ni un ranking.

La política central `ReportFreshnessPolicy` calcula los campos `status` y `freshness` al responder la API. Un reporte o confirmación de hasta un día se muestra como `FRESH`; hasta 30 días, como `AGING`; después de 30 días sin confirmaciones recientes, como `STALE`. `RESOLVED` permanece resuelto. La confianza combina una señal de recencia con votos comunitarios ponderados por una vida media de 30 días; los votos viejos pierden peso progresivamente. Los umbrales están centralizados en el dominio. La frescura se deriva al leer: reportes y votos se conservan para el histórico.

## Street Score

`GET /api/streets/score?south=-34.7&north=-34.5&west=-58.5&east=-58.3` calcula estimaciones dentro del viewport (cada dimensión abarca como máximo un grado), consulta hasta 5.000 reportes con PostGIS y conserva celdas aproximadas de 250 m para la capa general del mapa. `GET /api/streets/:id/score` y `/api/streets/:id/score/explanation` calculan bajo demanda el score de una calle a partir de los segmentos oficiales que tienen señales; ambos devuelven el mismo resultado con factores, métricas, confianza y disponibilidad de fuentes. No se persisten resultados ni se agrega Redis: el cálculo es pequeño, determinista para `calculatedAt` y se limita al viewport o calle solicitada.

La fórmula V2 está centralizada en `StreetScoreCalculator` y sus límites en `streetScoreConfig`:

1. El punto neutral es 75. Sin reportes ni otras señales, el resultado es `75 / 100`, nivel `FAIR`, confianza baja. Expresa falta de evidencia; no afirma que la calle esté perfecta.
2. Cada reporte activo aporta una penalización por severidad: baja 5, media 10, alta 18 y crítica 30. Se divide en factores explicables de severidad (65%) y frescura (35%), ambos ponderados por `exp(-ln(2) × días / 30)`. Los reportes resueltos o vencidos no reducen el estado actual.
3. Confirmaciones recientes restan hasta 6 puntos (`0,6 × confirmaciones ponderadas`), porque refuerzan la confianza en un problema activo. Votos de resolución recientes y reportes resueltos de cuentas distintas aportan crédito, limitado a 25 puntos: `min(25, 4 × reportes resueltos + 0,6 × votos de resolución ponderados)`.
4. Para evitar manipulación, en cada segmento solo cuenta el reporte activo de mayor peso por cuenta. Reportes sin autor conocido comparten un único cupo por segmento. Se excluyen los reportes ocultos por moderación. El factor del sistema explica cuando aplicó el límite.
5. Las señales oficiales que se conecten se suman por separado: corte activo −8, accidente −10, obra −3, evento/otro −2, con tope acumulado de −30; tráfico moderado −2 y alto −5, con decaimiento de 30 días. Hoy la API realtime de GCBA figura suspendida, por lo que estas señales se marcan como no disponibles y no se cuentan como cero cortes ni cero tráfico. La infraestructura de ciclovías/Metrobus no altera el score de condición vial.
6. Si hubo evidencia histórica, no hay reporte activo y no hubo actividad por 30 días, se agrega +5. Sin reportes no se concede ese bono.
7. Se suman factores a la base y se limita el resultado a 0–100. Los niveles son: `GOOD` 80–100, `FAIR` 55–79, `BAD` 30–54, `VERY_BAD` 1–29, `IMPASSABLE` 0.

Cada factor declara su origen `COMMUNITY`, `OFFICIAL` o `SYSTEM`, su impacto con signo y una explicación. En el score de calle se promedian los segmentos con evidencia; segmentos sin datos no diluyen la estimación. El resultado incluye conteos activos/recientes/resueltos, confirmaciones, último reporte, confianza y estado disponible/no disponible de incidentes y tráfico oficiales. La vista muestra el detalle “Por qué tiene este score” y advierte cuando faltan fuentes. Las pruebas pasan una fecha explícita; la fórmula no lee el reloj del sistema.

## Analytics

El dashboard público está disponible desde la navegación superior y agrega reportes visibles, sin nombres, emails, descripciones ni identificadores de usuarios. El selector temporal filtra métricas de reportes, barrios, comunas, tendencias y heatmap. Los rankings calculan el Street Score vigente con el mismo `StreetScoreCalculator`: la consulta selecciona las calles y segmentos con más reportes visibles y ordena esos candidatos por score. Para mantener acotado el trabajo, el ranking no afirma que revisó cada calle sin reportes. El score representa la evidencia actual completa y no cambia con el selector temporal.

Endpoints públicos:

- `GET /api/analytics/overview`: totales, activos recientes, resueltos, stale, media de resolución y porcentaje con confirmación.
- `GET /api/analytics/reports`: distribución por tipo y severidad.
- `GET /api/analytics/neighborhoods` y `/api/analytics/communes`: agregaciones espaciales sobre polígonos oficiales de CABA.
- `GET /api/analytics/trends?bucket=week`: conteos por día, semana o mes.
- `GET /api/analytics/streets` y `/api/analytics/segments`: ranking limitado a 20 scores actuales con evidencia.
- `GET /api/analytics/heatmap?south=-34.72&north=-34.52&west=-58.54&east=-58.33`: conteos por celdas PostGIS, limitado a 2.500 celdas; no devuelve reportes individuales.
- `GET /api/analytics/proximity?lat=-34.60&lng=-58.38&radius=500`: grupos agregados por tipo y severidad dentro de un radio máximo de 5 km.
- `GET /api/analytics/official`: cantidad de infraestructura importada, estado de sincronización de fuentes y disponibilidad de tráfico realtime.

Las rutas filtrables aceptan `from`, `to`, `type`, `severity`, `neighborhoodId` y `communeId`; las fechas deben ser ISO-8601 y el rango debe ser ascendente. Los reportes ocultos por moderación no aparecen en analytics públicas. La media de resolución usa `updated_at - created_at` para registros cuyo estado almacenado es `RESOLVED`, porque el modelo actual no conserva un timestamp separado de resolución. `stale` se deriva de la actividad comunitaria reciente, sin borrar ni modificar historia. Las señales de transporte en tiempo real siguen no disponibles; el dashboard muestra el estado conocido de las fuentes oficiales.

Las rutas `/api/analytics/moderation/overview` requieren rol `MODERATOR` o `ADMIN`; `/api/analytics/admin/overview` requiere `ADMIN`. La primera agrega denuncias pendientes por motivo. La segunda expone conteos operativos y sincronizaciones, nunca información de cuentas individuales. Analytics aplica rate limit configurable con `RATE_LIMIT_ANALYTICS_MAX` y `RATE_LIMIT_ANALYTICS_WINDOW_SECONDS` (por defecto 60 solicitudes por minuto).

Las queries limitan resultados en SQL, parametrizan filtros y usan PostGIS para bounding boxes, celdas, radio y asignación a barrios/comunas. Revisé `EXPLAIN (ANALYZE, BUFFERS)` en la base local: el cruce con barrios usa `neighborhoods_geometry_gix`; tendencias y heatmap usaron scan secuencial sobre el conjunto local de 24 reportes por su tamaño, con ejecuciones menores a 1 ms. Los índices existentes `street_reports_created_at_idx`, `street_reports_location_gix`, `neighborhoods_geometry_gix` y `communes_geometry_gix` cubren las consultas probadas; no agregué índices sin evidencia de necesidad.

## Geografía oficial de CABA

La app mantiene su base cartográfica propia en PostgreSQL/PostGIS y conserva Leaflet/OpenStreetMap para renderizar los tiles. La fuente oficial es Buenos Aires Data, bajo licencia CC-BY-2.5-AR: [Calles](https://data.buenosaires.gob.ar/dataset/calles), [Barrios](https://data.buenosaires.gob.ar/dataset/barrios) y [Comunas](https://data.buenosaires.gob.ar/dataset/comunas).

El Callejero inspeccionado contiene registros lineales con `id` de tramo, `codigo` de calle, `nomoficial`, geometría GeoJSON `LineString`, alturas, sentido, barrio y comuna. Por eso `StreetSegment` conserva cada tramo publicado por GCBA y `Street` agrupa por `codigo` y nombre oficial normalizado; no se cortan geometrías artificialmente. Los barrios publican polígonos con `id`, `nombre` y `comuna`; las comunas publican el número y su geometría. Los adaptadores del formato original están aislados en `backend/src/infrastructure/external/caba`; el dominio recibe nombres normalizados y GeoJSON de líneas o polígonos.

La migración `0008_tidy_junta.sql` crea `streets`, `street_segments`, `neighborhoods`, `communes` y `geographic_sources`, agrega índices GiST a todas las columnas geométricas y deja `street_id`/`street_segment_id` opcionales en reportes antiguos. Las geometrías se guardan como `geometry(MultiLineString,4326)` o `geometry(MultiPolygon,4326)`. La importación valida coordenadas, anillos cerrados y geometrías con PostGIS; hace upsert por los identificadores oficiales, registra fuente, licencia, URL, fecha, estado, cantidad y error de la última sincronización. Puede ejecutarse repetidamente sin duplicar registros. No corre durante el startup.

Con la base levantada y las migraciones aplicadas, importar manualmente:

```bash
npm run import:caba:communes
npm run import:caba:neighborhoods
npm run import:caba:streets
```

O ejecutar las tres en el orden requerido con `npm run import:caba:all`. Cada comando descarga el GeoJSON oficial; para usar un archivo ya descargado, ejecutar `npm run import:caba:streets --workspace backend -- --file=/ruta/al/archivo.geojson`. Las URL se pueden cambiar mediante `CABA_COMMUNES_URL`, `CABA_NEIGHBORHOODS_URL` y `CABA_STREETS_URL` (sus valores oficiales están en `.env.example`). Barrios referencia comuna, y los tramos resuelven barrio/comuna si esos catálogos ya están importados; por eso el orden indicado permite dejar todas las relaciones pobladas. Un tramo que no trae barrio o comuna oficiales se conserva con esa relación nula.

Al crear un reporte, `StreetLocationResolverService` busca con PostGIS el tramo más cercano en un radio máximo de 35 m. La búsqueda usa el GiST de geometría para acotar candidatos y `ST_DWithin`/`ST_Distance` sobre geography para confirmar distancia real. Si no hay coincidencia dentro del umbral, el reporte queda sin calle asociada y sigue siendo válido. La API devuelve `street` como un DTO resumido; el popup muestra nombre oficial, barrio y comuna cuando existen.

Rutas agregadas:

| Método y ruta                                              | Uso                                              |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/streets/nearby?lat=-34.60&lng=-58.38&radius=500` | Calles más cercanas (radio máximo 5 km)          |
| `GET /api/streets/:id`                                     | Nombre oficial y zonas que atraviesan sus tramos |
| `GET /api/streets/:id/reports`                             | Hasta 200 reportes públicos asociados            |
| `GET /api/neighborhoods`                                   | Barrios, comuna y geometría GeoJSON              |
| `GET /api/communes`                                        | Comunas y geometría GeoJSON                      |

La primera importación verificada en desarrollo incorporó 15 comunas, 48 barrios, 2.741 calles oficiales y 31.961 tramos. Las calles se agrupan por código y nombre oficial normalizado, ya que un mismo código de origen puede aparecer con nombres distintos. `npm run import:caba:all` se puede volver a ejecutar para sincronizar el catálogo.

## Datos oficiales de movilidad

La revisión del portal oficial se hizo el 6 de octubre de 2026. Se eligieron tres recursos GeoJSON batch: [Ciclovías](https://data.buenosaires.gob.ar/dataset/ciclovias), con segmentos `LineString`/ID/nombre/tipo y actualización semestral (el portal mostraba actualización del 2 de octubre de 2026); [recorrido Metrobus](https://data.buenosaires.gob.ar/dataset/metrobus), con corredores `MultiLineString` y atributos de corredor, calle y sentido (frecuencia eventual; última actualización mostrada 23 de junio de 2026); y estaciones Metrobus, con ubicaciones `Point` (mismo conjunto/frecuencia eventual). Son datos batch, descargables sin autenticación, publicados bajo CC-BY-2.5-AR. El formato y frecuencia pueden cambiar y el importador rechaza datos vacíos o no válidos para preservar la última carga correcta. Las URL externas se limitan a hosts HTTPS oficiales de GCBA.

El dataset [Volumen Vehicular](https://data.buenosaires.gob.ar/dataset/volumen_vehicular) sí publica conteos históricos, pero los recursos actuales son XLSX (base anual 2024 y detalle de una semana típica), además de ubicaciones de sensores y diccionario. No es una API realtime ni una serie con actualización vigente que convenga tratar como tráfico actual; queda como siguiente integración batch después de fijar el mapeo de sus planillas. La [API de Transporte Público](https://data.buenosaires.gob.ar/dataset/api-transporte-publico) documenta colectivos, transporte y cortes, y la documentación lista rutas como `/transito/v1/cortes` y `/transito/v1/eventos`; sin embargo, el portal indica que los recursos con formato API y GTFS están suspendidos y en revisión. No se conectó ningún endpoint en vivo ni se creó información de cortes ficticia. La autenticación de esos recursos no se considera verificada mientras el servicio esté suspendido. `TrafficDataProvider`, `OfficialIncidentProvider` y `TrafficVolumeProvider` definen contratos; el adaptador actual devuelve explícitamente no disponible y no emite solicitudes.

Los GeoJSON se normalizan detrás del adaptador `CabaMobilityDatasetImporter` y se guardan como `mobility_infrastructure` con geometría PostGIS e índice GiST. La carga reemplaza sólo los registros de su propia fuente, y lo hace dentro de una transacción después de validar toda la colección. El catálogo conserva estado de intento, última sincronización exitosa, cantidad importada y error. No hay descargas automáticas al iniciar la aplicación ni scheduler.

Con la base migrada, sincronizar manualmente:

```bash
npm run sync:caba:ciclovias
npm run sync:caba:metrobus
npm run sync:caba:metrobus-stops
# o las tres fuentes
npm run sync:caba:infrastructure
```

Las URL se configuran con `CABA_CICLOVIAS_URL`, `CABA_METROBUS_URL` y `CABA_METROBUS_STOPS_URL`; se admite `--file=/ruta/al/archivo.geojson` para importar un archivo local. `GET /api/streets/:id/infrastructure` devuelve los elementos oficiales próximos a los segmentos de esa calle (25 m); `GET /api/mobility/sources` expone el estado de sincronización. `GET /api/streets/:id/incidents` y `/traffic` devuelven `503 UNAVAILABLE` mientras la API oficial esté suspendida, en vez de presentar la falta de datos como ausencia de cortes o tráfico. Los popups cargan la infraestructura al abrirse y la rotulan por separado como “Fuente oficial”, diferenciándola de los reportes comunitarios. No se modelan sensores independientes ni volúmenes recientes todavía.

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
