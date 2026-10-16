# Street Status

MVP para consultar y reportar problemas de circulación en calles de la Ciudad Autónoma de Buenos Aires (CABA). El proyecto es un monolito modular con frontend React y backend Fastify, más PostgreSQL/PostGIS para persistir los reportes.

## Alcance actual

- Mapa interactivo de CABA con Leaflet y OpenStreetMap, marcador de ubicación del usuario y reportes cargados desde la API según el viewport visible.
- Creación de reportes desde el mapa con selección de ubicación, validación y envío a la API.
- Confirmaciones comunitarias por reporte; cada usuario puede confirmar o indicar que ya no existe, y cambiar su voto.
- Registro, ingreso, cierre de sesión y perfil con sesión persistida y cookie protegida.
- Condición física estimada sobre segmentos oficiales de calles, con disponibilidad para circular mostrada en una dimensión separada.
- Moderación básica con detección de duplicados, marcación de contenido y cola administrativa con auditoría.
- Filtros combinables por tipo, lifecycle, antigüedad, severidad y reportes propios; navegación “Mis reportes”.
- API Fastify con liveness y readiness y endpoints REST para persistir, consultar y moderar reportes.
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
   cp .env.sample .env
   ```

   La plantilla trae placeholders de producción: para desarrollo local, configurar `NODE_ENV=development`, `CORS_ORIGIN=http://localhost:5173` y `DATABASE_URL=postgresql://street_status:street_status@localhost:5433/street_status`. `TEST_DATABASE_URL` debe apuntar a una base separada para tests que escriben y borran registros de prueba. La URL del frontend local queda sin configurar para que Vite use su proxy `/api`.

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

   La API escucha por defecto en `http://localhost:3000`. El frontend usa rutas relativas `/api/...`; Vite las reenvía al backend local en `127.0.0.1:3000` y adapta el encabezado `Origin` al origen local permitido. Así el navegador usa el mismo origen, también detrás de un túnel ngrok, y no necesita conocer la dirección interna del backend. En otra terminal se puede iniciar el frontend:

   ```bash
   npm run dev:frontend
   ```

   Vite informa la URL local, normalmente `http://localhost:5173`.

Para crear una migración al cambiar el esquema: `npm run db:generate`; revisar el SQL generado y aplicarlo con `npm run db:migrate`. La plantilla [.env.sample](.env.sample) no contiene credenciales reales; reemplazá sus valores según el entorno y no la uses sin editar como configuración de producción.

La aplicación usa los tiles estándar de OpenStreetMap y muestra su atribución visible en el mapa. El servicio público de tiles tiene capacidad limitada y disponibilidad best-effort; para producción o tráfico importante, revisar la [política de uso de tiles de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) y elegir un proveedor de tiles basado en OSM o alojar tiles propios según corresponda.

## API de reportes

La API está bajo `/api`. Los tipos admitidos son `POTHOLE`, `FLOOD`, `ROAD_DAMAGE`, `ROAD_BLOCKED`, `ROAD_WORK`, `TRAFFIC_LIGHT` y `OTHER`. Las severidades aceptan `LOW`, `MEDIUM`, `HIGH` y `CRITICAL`, almacenadas como los niveles numéricos 1 a 4. Los estados efectivos son `ACTIVE`, `STALE` y `RESOLVED`.

| Método y ruta                                                    | Uso                                          |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `GET /api/health`                                                | Compatibilidad: liveness                     |
| `GET /api/health/live`                                           | Proceso Fastify activo                       |
| `GET /api/health/ready`                                          | Verifica conexión a PostgreSQL               |
| `GET /api/reports?south=-34.7&north=-34.5&west=-58.5&east=-58.3` | Buscar dentro del viewport visible           |
| `GET /api/users/me/reports`                                      | Reportes del usuario de la sesión actual     |
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

## Filtros del mapa y Mis reportes

El mapa permite combinar `types` (CSV OR), `statuses` (CSV OR), `period`, `fromDate`, `toDate`, `minSeverity` y `onlyMine=true`. Ejemplo: `GET /api/reports?south=-34.7&north=-34.5&west=-58.5&east=-58.3&types=POTHOLE,FLOOD&statuses=ACTIVE,STALE&period=7d&minSeverity=HIGH`. Las categorías se aplican con AND. `period` acepta `24h`, `3d`, `7d`, `30d` o `90d` y Postgres calcula su corte desde `NOW()`; un rango personalizado recibe ISO-8601 UTC (`fromDate`/`toDate`) y rechaza fechas mal formadas o invertidas. Los inputs de fecha del usuario se interpretan en `America/Argentina/Buenos_Aires`; persistencia y comparación usan instantes UTC. El lifecycle `STALE` sigue la misma regla vigente: un reporte no resuelto queda stale si su creación y última confirmación superan 30 días.

El filtrado ocurre en PostgreSQL/PostGIS antes de mapear DTOs. El viewport conserva su bounding box GiST, y los resultados se limitan a 200 por petición; la respuesta del mapa es `{ items, hasMore }`. Si hay más de 200, se informa que conviene acercar el mapa; no se agregaron clustering ni un endpoint de facetas, porque el límite acota el trabajo y los conteos de tipo no son necesarios para aplicar filtros. Los cambios de filtro se editan en un panel y sólo **Aplicar** dispara una nueva consulta; la URL guarda el filtro, admite back/forward y puede compartirse. Cada consulta aborta la anterior y conserva markers actuales mientras carga.

`onlyMine=true` exige una cookie de sesión y el backend toma el `user_id` exclusivamente de esa sesión; cualquier `userId` enviado por el cliente se ignora. Para mostrar en mapa los reportes propios ocultos, el endpoint los incluye sólo bajo esa sesión y marca `publiclyVisible: false`; el popup informa que no aparece en el mapa público y deshabilita el feedback. Los demás usuarios nunca reciben reportes ocultos.

`GET /api/users/me/reports?limit=50&offset=0` lista reportes de la sesión autenticada, incluso los que ya no son públicos. Devuelve tipo, calle/ubicación, fecha, severidad, estado calculado, resumen de feedback, última actividad y un indicador de visibilidad pública, sin motivo ni datos internos de moderación. El listado pagina hasta 100 elementos por llamada; no acepta identidad de usuario como selector. Desde cada tarjeta se abre el detalle, se accede al reporte en el mapa (con `onlyMine=true` y foco geográfico) o se modifica feedback cuando el reporte sigue visible. Los botones de creación llevan al modo de selección de ubicación del mapa.

Para crear un reporte, presionar **Reportar problema**, tocar el mapa para marcar la ubicación y completar tipo y severidad. La descripción es opcional (máximo 500 caracteres). La API valida tipo, severidad, coordenadas y longitud de descripción; si se omite, persiste una descripción vacía. Una creación correcta devuelve el DTO del reporte, que se agrega al mapa inmediatamente. Antes de crear, el backend busca por PostGIS reportes visibles del mismo tipo a 50 metros o menos, creados en las últimas 24 horas y no resueltos. Ante una coincidencia devuelve `409 SIMILAR_REPORT_EXISTS`; la interfaz avisa y permite reintentar confirmando `allowSimilar: true`. No se elimina ni se fusiona ningún reporte.

## Cuentas y sesión

El registro pide email, nombre visible y contraseña de al menos 12 caracteres. El backend almacena exclusivamente un hash `scrypt` con salt aleatorio (N=32768, r=8, p=1); el login responde con un error genérico cuando email o contraseña no coinciden. Los límites por IP se configuran con variables `RATE_LIMIT_*_MAX` y `RATE_LIMIT_*_WINDOW_SECONDS`; los valores del `.env.sample` son 20 reportes, 30 feedbacks, 5 denuncias, 5 logins, 5 registros, 10 cambios de estado, 60 consultas de analytics, 20 rutas, 30 búsquedas de direcciones y 15 aportes/confirmaciones de información vial por 60 segundos. Se validan como enteros positivos y los contadores viven en PostgreSQL, compartidos por todas las instancias. La migración `0017_wise_slapstick` crea el almacenamiento y debe estar aplicada antes de desplegar esta versión. Si el backend está detrás de un proxy, `TRUST_PROXY` debe listar las IP/CIDR del proxy de confianza para calcular la IP cliente correctamente; no lo configures como `*`.

El BFF emite un token aleatorio opaco de 256 bits como cookie `street_status_session` (`HttpOnly`, `SameSite=Lax`, `Path=/api`, 30 días); la base conserva solo su SHA-256 y vencimiento. En producción la cookie usa `Secure`. El frontend envía cookies con `credentials: include`; no guarda tokens, contraseñas ni identificadores de voto en `localStorage`. El BFF comprueba `Origin` contra `CORS_ORIGIN` en solicitudes con origen y CORS permite credenciales únicamente para los orígenes configurados. Publicá frontend y BFF bajo el mismo site (idealmente detrás de un mismo origen/reverse proxy) para que `SameSite=Lax` funcione. Configurá HTTPS y `NODE_ENV=production` detrás del proxy de producción.

`POST /api/reports/:id/feedback`, `POST /api/reports/:id/flags` y `PATCH /api/reports/:id/status` requieren sesión. Un usuario puede cambiar su feedback, pero el índice único mantiene una sola decisión actual por reporte y usuario. Los reportes pueden seguir creándose sin cuenta; si hay sesión, se registra el propietario. Solo el autor del reporte puede cambiar su estado; moderadores y administradores pueden hacerlo también. Las filas históricas de votos anónimos siguen agregándose y la migración conserva el identificador temporal solo para esas filas previas; la aplicación ya no lo emite ni lo consume. Los reportes previos conservan sus datos con `user_id` nulo.

Las cuentas nuevas reciben el rol `USER`. `MODERATOR` y `ADMIN` no se pueden asignar desde la API pública: un operador debe otorgarlos de forma controlada desde la base de datos. La cola administrativa solo acepta esos roles. Cada cuenta puede marcar una sola vez cada reporte con motivo `SPAM`, `INAPPROPRIATE`, `FALSE_INFORMATION` u `OTHER`; las repeticiones reciben `409`. La acción administrativa `VISIBLE`/`HIDDEN` se guarda en `moderation_audit`, junto con actor, cambio, fecha y nota; las denuncias revisadas conservan su fecha de revisión. Los reportes ocultos se excluyen de consultas públicas, feedback y Street Score, sin borrar el contenido histórico. Ejemplo de promoción operativa, ejecutado únicamente por un operador autorizado: `UPDATE users SET role = 'MODERATOR' WHERE email = 'moderador@ejemplo.com';`.

Las solicitudes mutables con `Origin` se validan contra `CORS_ORIGIN`; cookies `HttpOnly`, `SameSite=Lax` y validación de origen son las defensas CSRF actuales. La cookie es `Secure` en producción. Respuestas y descripciones se renderizan como texto por React y no como HTML; los filtros y mutaciones SQL parametrizan valores con Drizzle. Los controles de moderación son básicos: no verifican la veracidad automáticamente ni sustituyen una revisión humana.

El perfil muestra nombre, email, fecha de registro, total de reportes, confirmaciones dadas y métricas descriptivas de reputación (reportes propios confirmados/resueltos y feedback útil). Son contadores derivados; no representan puntos ni un ranking.

La política central `ReportFreshnessPolicy` calcula los campos `status` y `freshness` al responder la API. Un reporte o confirmación de hasta un día se muestra como `FRESH`; hasta 30 días, como `AGING`; después de 30 días sin confirmaciones recientes, como `STALE`. `RESOLVED` permanece resuelto. La confianza combina una señal de recencia con votos comunitarios ponderados por una vida media de 30 días; los votos viejos pierden peso progresivamente. Los umbrales están centralizados en el dominio. La frescura se deriva al leer: reportes y votos se conservan para el histórico.

## Condición física de calles y disponibilidad

`GET /api/streets/condition?south=-34.7&north=-34.5&west=-58.5&east=-58.3&zoom=15&levels=BAD,VERY_BAD,CRITICAL&roadClasses=PRIMARY,SECONDARY,LOCAL` devuelve un `FeatureCollection` GeoJSON de los segmentos oficiales que intersectan el viewport, con o sin reportes. A zoom menor a 16 agrupa por calle y clase vial; desde zoom 16 devuelve segmentos oficiales. El repositorio consulta primero `street_segments` mediante bbox, intersección e índice GiST `street_segments_geometry_gix`, y simplifica geometrías según zoom. El mapa solicita el viewport con debounce, cancela solicitudes obsoletas y conserva las líneas anteriores mientras carga. `levels` filtra la condición visual y `roadClasses` controla clases de red de forma independiente.

`GET /api/streets/:id/score` y `/api/streets/:id/score/explanation` calculan bajo demanda. La respuesta incluye `hasEvidence`, score y nivel nulos si no existe evidencia física, confianza, factores, métricas y `availability`. No se persisten resultados ni se introduce cache. El nivel inicial es `UNKNOWN` (sin señales), `RESTRICTED` (obra, inundación u otra restricción) o `BLOCKED` (bloqueo/corte reportado). No se interpreta la falta de información como circulación libre.

El cálculo está en `StreetScoreCalculator`; la política de frescura reutiliza `ReportFreshnessPolicy` y su decay exponencial de vida media de 30 días. Los reportes físicos incluidos son `POTHOLE`, `ROAD_DAMAGE`, `ROAD_IRREGULARITY`, `ROAD_ELEVATION` y `ROAD_SUBSIDENCE`. Cada uno usa la severidad configurada (baja 5, media 10, alta 18, crítica 30), los factores explicables de severidad (65%) y frescura (35%), confirmaciones ponderadas (hasta −6), resoluciones (crédito hasta +25), estabilidad histórica (+5 luego de 30 días sin actividad) y el límite de una contribución por autor/segmento. El score se limita a 0–100. Cortes, obras, inundaciones y tráfico informan disponibilidad y routing; no degradan el score físico. La confianza es un dato independiente del valor del score.

Los siete rangos iniciales son configurables y todavía no están calibrados: `EXCELLENT` 90–100, `GOOD` 75–89, `ACCEPTABLE` 60–74, `UNCOMFORTABLE` 45–59, `BAD` 30–44, `VERY_BAD` 15–29 y `CRITICAL` 0–14. En el frontend las bandas, nombres y colores están centralizados en `streetConditionCatalog`; Excelente/Buena usan verde suave, Aceptable amarillo, Incómoda naranja y Mala/Muy mala/Crítica rojo. Esto solo agrupa colores: no modifica niveles ni fórmula. El Callejero oficial clasifica la red con `red_jerarq`, normalizado a `PRIMARY`, `SECONDARY`, `LOCAL` o `UNKNOWN`. En zoom menor a 12 se muestran principales; entre 12 y 13 se agregan secundarias; desde 14 se incluyen todas; desde 16 se muestran segmentos detallados. Estos umbrales están centralizados y son iniciales. Los filtros de jerarquía y condición son independientes. Los segmentos sin evidencia conservan `score:null`, `level:null` y `hasEvidence:false`, pero se dibujan verdes como **Buena por defecto** para mantener visible toda la red. El popup aclara que no hay score calculado. Street Score es una estimación comunitaria, no una inspección profesional ni una recomendación de seguridad.

La verificación local de `EXPLAIN (ANALYZE, BUFFERS)` se hizo con 31.961 segmentos y 24 reportes visibles. La consulta de segmentos usa `street_segments_geometry_gix` y completó el viewport de ejemplo en unos 10,5 ms. En zoom lejano el optimizador partió de los reportes visibles y comprobó sus segmentos por PK; agrupó 3 calles en unos 9,4 ms. No agregué índices nuevos: el primer plan ya usa GiST y el segundo conjunto local es pequeño. Volver a medir con un volumen mayor antes de cambiar esta decisión.

Los tipos `ROAD_IRREGULARITY`, `ROAD_ELEVATION` y `ROAD_SUBSIDENCE` se agregaron con la migración aditiva `0013_loving_hex.sql`. La jerarquía vial normalizada y su backfill desde metadata oficial se agrega con `0014_blue_jean_grey.sql`. Aplicá las migraciones con `npm run db:migrate` en cada entorno antes de desplegar el backend nuevo; las migraciones no corren durante el startup. En Elevación anómala, la UI aclara que no se deben reportar lomos de burro o badenes intencionales. Reportes, filtros, marcadores, analíticas y validación del backend usan el catálogo extendido.

## Informar calles

El mapa separa `+ Informar calle` de `+ Reportar problema`. Para proponer información vial se elige un segmento oficial (el mapa acerca automáticamente a zoom 16); los campos son parciales: tipo de vía, pavimento, estado de calzada y tratamientos especiales. Los campos omitidos conservan el valor confirmado existente. `CONCRETE_ASPHALT` se mantiene como categoría propia. La falta de datos no se interpreta como asfalto.

`POST /api/streets/segments/:id/information` crea una propuesta autenticada. `GET /api/streets/segments/:id/information` devuelve perfil vigente, propuestas pendientes y hasta 20 cambios confirmados anteriores. `POST /api/streets/information-proposals/:id/confirm` registra una confirmación autenticada. El autor no puede confirmar su propuesta; al alcanzar tres confirmaciones de otros usuarios, los atributos aportados se aplican al perfil vigente y se guarda una instantánea histórica. Las propuestas y confirmaciones tienen un límite configurable de 15 por minuto con `RATE_LIMIT_ROAD_INFORMATION_MAX` y `RATE_LIMIT_ROAD_INFORMATION_WINDOW_SECONDS`.

La capa `Tipo de pavimento` se puede activar desde `Capas del mapa`; sus filtros son independientes de reportes y Street Score. Para evitar atribuir el dato de una calle entera a cada tramo, la capa solo dibuja información comunitaria confirmada al nivel de segmento (zoom 16 o superior). Las geometrías y clasificación oficial de red siguen procediendo de `street_segments`.

La migración `0015_sweet_marrow.sql` agrega el perfil, propuestas, confirmaciones e historial comunitarios sin modificar las geometrías oficiales ni los reportes existentes. Aplicala con `npm run db:migrate` antes de iniciar el backend nuevo.

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

## Búsqueda de direcciones

El backend conserva `GET /api/addresses/search?q=corrientes%20y%20callao`. El formulario de reportes permite buscar una dirección como ayuda para ubicar el punto; la persona puede seguir marcándolo manualmente en el mapa. El endpoint usa el normalizador USIG de CABA, valida las respuestas y limita las consultas. La UI no incluye planificación de rutas.

El mapa utiliza Leaflet y tiles de OpenStreetMap de forma independiente. OSRM no se usa para dibujar el mapa ni para consultar calles, reportes o scores.

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

O ejecutar las tres en el orden requerido con `npm run import:caba:all`. Cada comando descarga el GeoJSON oficial; para usar un archivo ya descargado, ejecutar `npm run import:caba:streets --workspace backend -- --file=/ruta/al/archivo.geojson`. Las URL se pueden cambiar mediante `CABA_COMMUNES_URL`, `CABA_NEIGHBORHOODS_URL` y `CABA_STREETS_URL` (sus valores oficiales están en `.env.sample`). Barrios referencia comuna, y los tramos resuelven barrio/comuna si esos catálogos ya están importados; por eso el orden indicado permite dejar todas las relaciones pobladas. Un tramo que no trae barrio o comuna oficiales se conserva con esa relación nula.

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

## Navegación y tutorial

La aplicación sirve el tutorial en `/como-usar` con navegación del navegador. En Plesk, `frontend/public/.htaccess` se incluye en `frontend/dist` y permite abrir o recargar esa ruta directamente sin afectar el proxy de `/api`. El tutorial utiliza ejemplos locales ilustrativos: sus filtros y botones no escriben en el backend. El mapa base usa OpenStreetMap y la UI mantiene su atribución visible.

## Supabase PostgreSQL y despliegue en Plesk

Supabase se utiliza como PostgreSQL/PostGIS administrado. React continúa hablando únicamente con el BFF Fastify (`/api/...`); no se usa `@supabase/supabase-js`, Supabase Auth ni acceso directo desde el navegador. Drizzle y `pg` permanecen como ORM/driver. Las consultas de reportes, calles, segmentos, barrios, comunas, movilidad, routing y analytics siguen ejecutándose en PostgreSQL/PostGIS.

### Preparar Supabase

1. En el Dashboard de Supabase, abrir **Database → Extensions**, habilitar `postgis` y elegir el schema dedicado `extensions`. Hacerlo antes de aplicar migraciones. La primera migración versionada ya ejecuta `CREATE EXTENSION IF NOT EXISTS postgis`; al encontrarla instalada, no vuelve a crearla. El pool fija `search_path=public,extensions` para resolver los tipos y funciones PostGIS no cualificados de las migraciones y SQL existentes. Las columnas usan `geography(Point,4326)` para reportes y `geometry(...,4326)` para datos oficiales.
2. En **Connect**, copiar la URI completa y reemplazar la contraseña. Usar conexión directa para el backend persistente si Plesk tiene salida IPv6 (o el proyecto tiene IPv4 habilitado). Si Plesk sólo tiene IPv4, usar **Shared Pooler en modo Session**, copiando host, puerto y usuario del Dashboard. Evitar Transaction para este backend persistente por sus limitaciones de estado de sesión; ejecutar migraciones preferentemente con conexión directa.
3. Exigir SSL en la cadena de conexión (`sslmode=require`). Para validar también el certificado, Supabase permite descargar la CA; configurar `sslmode=verify-full` y el certificado conforme al driver y validar desde el host de Plesk.
4. En Plesk, establecer `DATABASE_URL` como variable protegida del entorno Node, nunca en Vite ni en un archivo versionado. No configurar credenciales en variables `VITE_*`. No se necesita Docker en producción.

La URI la entrega el botón **Connect**. Como referencia, la directa se parece a `postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require`; el pooler de sesión tiene otro host/usuario y debe copiarse del Dashboard, sin construirlo a mano. Escapar los caracteres reservados de la contraseña según las instrucciones de Supabase.

El pool reutilizado por proceso tiene límites opcionales con defaults conservadores: `DB_POOL_MAX=5`, `DB_IDLE_TIMEOUT_MS=10000`, `DB_CONNECTION_TIMEOUT_MS=10000` y `DB_QUERY_TIMEOUT_MS=30000`. `DB_POOL_MAX` limita conexiones por proceso Node, no por sitio; sumar instancias/procesos y respetar el límite del plan Supabase. `DATABASE_URL` es obligatorio en todos los entornos y la app/CLI falla si falta; no hay credenciales de conexión por defecto en código. El backend no registra la URL ni credenciales.

### Migraciones, datos e importación

Aplicar migraciones explícitamente antes del deploy/restart:

```bash
npm ci
npm run db:migrate
npm run db:migrate:status
npm run build
```

`db:migrate` no se ejecuta al arrancar Fastify. `db:migrate:status` lista las pendientes según el journal Drizzle. No agregué usuarios ni reportes ficticios. Los catálogos oficiales se importan explícitamente con `npm run import:caba:all` y `npm run sync:caba:infrastructure`, o sus comandos individuales, luego de configurar las URLs de datos. Las pruebas de integración requieren una base migrada separada y nunca producción.

La base Docker local existente no se modifica ni se vuelca a Supabase automáticamente. Al inspeccionarla había 25 reportes, 5 usuarios, 2.741 calles, 31.961 segmentos, 48 barrios y 15 comunas. Respaldarla antes de cualquier operación de datos. Si se decide conservar los datos, realizar un plan aparte hacia una base destino vacía: backup `pg_dump` de PostgreSQL, migraciones de esquema en destino y restauración de datos compatible con PostGIS, verificando conteos y relaciones antes del corte. No restaurar el esquema encima de tablas creadas por Drizzle ni ejecutar importadores de catálogos antes de decidir si se actualizarán las mismas filas. No se encontró dependencia ni esquema MySQL/MariaDB.

### Plesk Node.js 20

Si Plesk no puede descargar paquetes de npm, usar el [paquete offline de despliegue](DEPLOY-PLESK.md): construir `deploy.tar.gz` localmente/CI con dependencias Linux x64 ya instaladas y no ejecutar **NPM install** en el hosting.

Seleccionar Node.js 20.17+ en Plesk y configurar las variables de entorno en la configuración de la app Node. Mantener la raíz de aplicación en el root del proyecto; `app.js` es el startup file y carga el backend compilado. El document root debe ser el subdirectorio `public` dentro de esa raíz; el deploy copia ahí `frontend/dist`. Para publicar desde **Run Script** de Plesk, seleccionar el proyecto raíz y escribir `deploy:plesk` como nombre del script npm (equivale a `npm run deploy:plesk`). Ese flujo online instala o actualiza las dependencias desde el lockfile con `npm install`, compila backend y frontend y toca `tmp/restart.txt` para que Passenger reinicie automáticamente ([método documentado por Plesk](https://support.plesk.com/hc/en-us/articles/12387509415703-How-to-restart-NodeJS-app-in-Plesk)). La instalación incremental reutiliza `node_modules` entre deploys; las dependencias de desarrollo quedan instaladas para evitar una poda lenta y permitir el siguiente build. El script registra cada etapa y valida la presencia de `DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV` y `PORT`/`BACKEND_PORT` sin imprimir valores secretos. Si falta una variable, muestra un aviso y continúa el deploy; la API puede no iniciar o funcionar correctamente hasta configurar las variables necesarias. La comprobación usa las variables heredadas por **Run Script** y claves del `.env` en la raíz; no puede leer directamente la configuración privada del panel de Plesk. Si el panel no pasa sus variables al script, el aviso no prueba que falten al proceso Passenger: confirmalas en la configuración de la app Node. Ejecutar `npm run db:migrate` explícitamente antes del deploy cuando haya cambios de esquema. El script online publica por defecto en `$BASE_DIR/public`; `PLESK_DOCUMENT_ROOT` permite sobreescribir esa ruta y `PLESK_APP_TMP_DIR` indica dónde Passenger espera `tmp/restart.txt`. El deploy copia `.htaccess` para que Apache/Plesk reescriba rutas SPA como `/como-usar` y conserve `/api`; verificar que `mod_rewrite` y `.htaccess` estén habilitados. Configurar `CORS_ORIGIN` con el origen público real y `TRUST_PROXY` sólo con IP/CIDR del proxy confiable, si aplica. El proceso usa el puerto `PORT` que Plesk asigne y `BACKEND_PORT` como fallback. Este flujo online ejecuta npm en el hosting; si Plesk no puede descargar paquetes, usar el paquete offline de [DEPLOY-PLESK.md](DEPLOY-PLESK.md) en vez de `deploy:plesk`. Ninguno ejecuta migraciones automáticamente.

Para los valores concretos de la pantalla de Plesk y las variables personalizadas, seguir la [guía de configuración de Plesk](docs/plesk-configuracion.md).

Si el frontend y Fastify se despliegan en servidores separados, usar `npm run deploy:frontend:plesk` desde el monorepo. El script instala y compila solo el workspace frontend, y publica `frontend/dist` en `PLESK_DOCUMENT_ROOT` (por defecto `public/`). Antes del build, configurar `VITE_API_URL` con el origen HTTPS público de Fastify, por ejemplo `https://api.pozometro.com.ar`; el frontend agrega `/api`. Esta variable es pública y se incorpora al bundle, así que nunca debe contener secretos. En el backend configurar `CORS_ORIGIN` con el origen exacto del sitio frontend. Ver [DEPLOY-FRONTEND-PLESK.md](DEPLOY-FRONTEND-PLESK.md) para cookies, CORS y valores de Plesk.

### Vercel Services: frontend y API Fastify

Vercel publica frontend y backend como dos servicios en un mismo proyecto y deployment, independiente del deployment de Plesk. En **Project Settings → Build and Deployment**, seleccionar **Services** como framework; Vercel ignora la configuración de servicios si esa opción no está activa. El archivo `vercel.json` define `frontend` en `frontend/` y `backend` en `backend/`. Las reglas públicas envían `/api/*` a Fastify y el resto de las rutas al frontend Vite, con fallback de rutas SPA a `index.html`. La Function `backend/api/[...path].ts` importa la misma fábrica que Plesk (`backend/src/server-app.ts` compilada), sin duplicar rutas. El navegador llama al API en el mismo origen; por eso no hay binding servidor-servidor entre frontend y backend. El proyecto usa el root lockfile npm: los comandos de cada servicio vuelven a la raíz para instalar/compilar el workspace correspondiente.

En el proyecto Vercel configurar `DATABASE_URL` como secreto con la URI SSL de la misma Supabase, `CORS_ORIGIN` con el dominio de producción y las variables funcionales adicionales que use el backend. Vercel agrega el origen exacto del deployment por `VERCEL_URL` (y el dominio de producción por `VERCEL_PROJECT_PRODUCTION_URL`) para validar `Origin` en previews. Configurar `DB_POOL_MAX=1` para limitar las conexiones por instancia; los contadores de rate limit se comparten mediante PostgreSQL. Las variables `VITE_*` se incorporan al bundle público y nunca deben contener secretos.

El servicio backend usa Node.js 24; la restricción de `engines` también admite Node 20.17+ para Plesk. El backend no instala OSRM ni incorpora un grafo de routing, por lo que no necesita Large Functions para ese componente.

La migración de rate limits y cualquier migración futura se ejecutan una sola vez contra Supabase antes de promover el mismo código en ambos destinos. No ejecutar migraciones durante un build Preview. Los servicios Vercel se publican y promueven juntos; para probar Plesk y Vercel de forma independiente, usar sus dominios respectivos. El dominio personalizado sólo puede apuntar al proveedor elegido para producción en cada momento. Plesk y Vercel usan el mismo esquema/base y ambos deben desplegar código compatible con las migraciones aplicadas. Para desarrollo local conjunto, Vercel Services ofrece `vercel dev -L`.

Variables actuales relevantes para producción:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://... (URI del Dashboard con SSL)
BACKEND_HOST=0.0.0.0
PORT=... (puerto interno asignado por Plesk; alternativamente BACKEND_PORT)
CORS_ORIGIN=https://tu-dominio.example
TRUST_PROXY=... (proxy confiable, si corresponde)
DB_POOL_MAX=5
DB_IDLE_TIMEOUT_MS=10000
DB_CONNECTION_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=30000
USIG_ADDRESS_SEARCH_URL=https://servicios.usig.buenosaires.gob.ar/normalizar/
```

`SESSION_SECRET` y `ROUTING_PROVIDER` no son variables utilizadas por el código actual. La cookie de sesión usa token aleatorio persistido como hash en PostgreSQL y queda `Secure` cuando `NODE_ENV=production`. USIG es opcional para readiness y sólo se usa si se consulta el endpoint de búsqueda de direcciones.

`GET /api/health/live` indica que Fastify está vivo. `GET /api/health/ready` ejecuta `SELECT 1` y responde `503` sin detalles internos si PostgreSQL no responde. `/api/health` se conserva como alias de liveness.

### Tests con base aislada

Los tests de integración crean usuarios/reportes temporales y los eliminan al finalizar; el import test restaura el catálogo que modifica. Crear una DB exclusiva con PostgreSQL/PostGIS y aplicar el journal antes de correrlos:

```bash
PGPASSWORD=street_status PGHOST=localhost PGPORT=5433 PGUSER=street_status createdb street_status_test
DATABASE_URL=postgres://street_status:street_status@localhost:5433/street_status_test npm run db:migrate
TEST_DATABASE_URL=postgres://street_status:street_status@localhost:5433/street_status_test npm test
```

También se puede dejar `TEST_DATABASE_URL` en `.env` (excluido de Git). Los tests de persistencia requieren esa variable y no caen silenciosamente en `DATABASE_URL`.

### Diagnóstico

- `ECONNREFUSED` / timeout: verificar host, puerto, firewall/allowlist y soporte IPv4/IPv6 de Plesk. En IPv4-only, copiar la URI Shared Pooler Session.
- Error de password o role: copiar usuario/contraseña de **Connect**; el pooler puede usar otro username. Codificar caracteres reservados de la contraseña.
- Error SSL: exigir `sslmode=require`; con `verify-full`, instalar la CA de Supabase y validar hostname.
- `type geography does not exist` o `function st_* does not exist`: habilitar PostGIS en `extensions` antes de migrar y mantener `search_path=public,extensions`.
- Schema incompleto: revisar `npm run db:migrate:status`, correr migraciones explícitamente y confirmar que Plesk y Drizzle usan la misma `DATABASE_URL`.
- Saturación: revisar procesos Node × `DB_POOL_MAX` y límites de Supabase; no crear pools por request.

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
