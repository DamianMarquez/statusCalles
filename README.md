# Street Status

MVP para consultar y reportar problemas de circulación en calles de la Ciudad Autónoma de Buenos Aires (CABA). El proyecto es un monolito modular con frontend React y backend Fastify, más PostgreSQL/PostGIS para persistir los reportes.

## Alcance actual

- Mapa interactivo de CABA con Leaflet y OpenStreetMap, marcador de ubicación del usuario y reportes cargados desde la API según el viewport visible.
- Creación de reportes desde el mapa con selección de ubicación, validación y envío a la API.
- Confirmaciones comunitarias por reporte; cada usuario puede confirmar o indicar que ya no existe, y cambiar su voto.
- Registro, ingreso, cierre de sesión y perfil con sesión persistida y cookie protegida.
- Street Score estimado por áreas geográficas con reportes suficientes, visible como celdas explicables en el mapa.
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
   cp .env.example .env
   ```

   `DATABASE_URL` por defecto conecta con `street_status` en `localhost:5433`. `TEST_DATABASE_URL` debe apuntar a una base separada para tests que escriben y borran registros de prueba.

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
| `GET /api/health`                                                | Compatibilidad: liveness                    |
| `GET /api/health/live`                                           | Proceso Fastify activo                      |
| `GET /api/health/ready`                                          | Verifica conexión a PostgreSQL              |
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

## Routing inteligente

La interfaz **Cómo llegar** permite buscar calle + altura e intersecciones con autocomplete, intercambiar los puntos y usar la ubicación actual como origen. El usuario elige explícitamente entre las coincidencias; no se calcula una ruta al seleccionar una dirección. Los resultados elegidos se muestran como marcadores temporales diferenciados y Leaflet centra el mapa sin crear reportes. El frontend espera 300 ms desde la última tecla, no consulta con menos de 3 caracteres y cancela/ignora respuestas anteriores. También puede reutilizarse `AddressSearchInput` en el formulario de reportes para posicionar el punto; la creación conserva la selección manual en el mapa.

`GET /api/addresses/search?q=corrientes%20y%20callao` devuelve `{ items }` normalizados. El módulo `addresses` define `AddressSearchProvider`; `UsigAddressSearchProvider` es el adapter que llama al normalizador oficial actual (`https://servicios.usig.buenosaires.gob.ar/normalizar/`) con geocodificación WGS84, valida la respuesta y restringe los resultados al partido CABA. Se documentan `calle_altura` y `calle_y_calle`; los resultados tipo calle sin coordenadas no se ofrecen como destinos hasta que se aporte altura o cruce. Los DTO no exponen el JSON del proveedor. La UI sólo llama al backend; el timeout upstream es 4 s y los errores se responden como mensajes genéricos `502`/`504`. Un cache en memoria por query normalizada conserva respuestas correctas durante 60 s y tiene un límite de 250 entradas; errores no se cachean. El endpoint limita 30 requests por minuto por IP, configurable con `RATE_LIMIT_ADDRESS_SEARCH_MAX` y `RATE_LIMIT_ADDRESS_SEARCH_WINDOW_SECONDS`; `ADDRESS_SEARCH_MIN_QUERY_LENGTH` controla el mínimo backend (3 por defecto). Tanto el cache como el rate limit son por proceso y deben migrarse a almacenamiento compartido antes de escalar a varias réplicas.

El dominio de routing sigue recibiendo coordenadas: `RoutePlanner` transforma el resultado de dirección en `latitude`/`longitude` al invocar `calculateRoute`, y el backend y `RoutingProvider` permanecen sin dependencia de USIG. El backend sigue verificando que los puntos queden dentro de las comunas oficiales cargadas. `USIG_ADDRESS_SEARCH_URL` permite cambiar el endpoint sin modificar frontend. No hay fallback automático ni reverse geocoding todavía. La integración usa la documentación vigente de [USIG Normalizador de Direcciones](https://servicios.usig.buenosaires.gob.ar/normalizar) y el [catálogo oficial de APIs de Buenos Aires](https://datosabiertos-apis.buenosaires.gob.ar/BA_Root/Documentacion?schema_name=usig_geocoder).

`RoutingProvider` es el contrato de aplicación y `OsrmRoutingProvider` adapta OSRM, sin exponer sus respuestas o códigos al dominio. Se eligió OSRM porque resuelve rutas en la red OSM existente y devuelve geometría/duración, y puede entregar alternativas para comparar; la integración queda acotada a un endpoint configurable. Valhalla también es una opción OSM válida y ofrece más controles de costo y modos, pero esos controles no se necesitan para este primer flujo. No se llama al servidor público de demostración: `OSRM_BASE_URL` apunta a una instancia local propia o administrada que acepte el perfil `driving` de CABA. El valor local es `http://localhost:5001`, para evitar el conflicto habitual del puerto 5000 en macOS. La petición upstream tiene timeout de 8 segundos; los fallos se traducen a respuestas seguras `502`/`504`.

`POST /api/routing` recibe `{ "origin": { "latitude": -34.6037, "longitude": -58.3816 }, "destination": { "latitude": -34.5895, "longitude": -58.3974 }, "options": "AVOID_BAD_STREETS" }` y responde con `route` (GeoJSON LineString), distancia y duración estimadas por el proveedor, `warnings` y `affectedSegments`. Para preferencias distintas de `FASTEST`, OSRM puede devolver hasta tres alternativas; se comparan las que realmente entrega y, para el modo rápido, se solicita sólo la ruta rápida.

El adaptador PostGIS encuentra segmentos oficiales a hasta 15 m de cada geometría candidata, calcula la longitud aproximada de cruce y consulta Street Score con el mismo `StreetScoreCalculator` ya usado por la plataforma. La comparación no retuerce una geometría: calcula una duración efectiva para cada alternativa y elige la de menor duración penalizada. Política v1, centralizada en `calculateRoutePenalty`:

1. Velocidad de referencia fija: 13,89 m/s (50 km/h); tiempo de cruce aproximado = longitud del tramo / 13,89.
2. Para score menor a 55, demora = tiempo de cruce × ((55 − score) / 55) × 2 × multiplicador de severidad (baja 1, media 1,15, alta 1,4, crítica 1,8).
3. Severidad alta agrega 25% del tiempo de cruce; crítica agrega 50%.
4. Un corte oficial activo agregaría cinco veces el tiempo de cruce en `AVOID_BAD_STREETS`; en `AVOID_BLOCKED_STREETS`, score cero/estado `IMPASSABLE` o corte activo bloquea esa alternativa si hay otra transitable. Si todas están bloqueadas, se devuelve la alternativa con menor penalización y se avisa.
5. Las advertencias también listan segmentos con score bajo o severidad alta/crítica en FASTEST, pero FASTEST no altera el tiempo ni la selección. Empates se resuelven por distancia.

Los incidentes/cortes oficiales siguen no disponibles porque la fuente realtime de CABA continúa suspendida; el sistema lo advierte y no interpreta la ausencia como cero cortes. La coincidencia geométrica es aproximada, no una garantía de que proveedor y callejero representen idénticamente cada conexión. La respuesta no representa una recomendación infalible ni una garantía de transitabilidad. El endpoint aplica `RATE_LIMIT_ROUTING_MAX` y `RATE_LIMIT_ROUTING_WINDOW_SECONDS` (20 solicitudes por minuto por defecto).

Para preparar y levantar una instancia local de desarrollo (requiere Docker y descarga el extracto OSM de Buenos Aires), ejecutar `npm run routing:setup`. El script procesa los datos con OSRM MLD y levanta el servicio en el puerto anfitrión 5001. Después configurar `OSRM_BASE_URL=http://localhost:5001` en `.env` y reiniciar el backend. El extracto y los archivos procesados quedan en `data/routing/`, excluidos de Git. El servicio se puede detener con `docker compose -f docker-compose.yml -f docker-compose.routing.yml stop routing`. Para producción se debe apuntar `OSRM_BASE_URL` a una instancia administrada; no se usa el servidor público de demostración. Los datos OSM se distribuyen bajo ODbL y requieren atribución a OpenStreetMap contributors.

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

El repositorio no contiene `deploy.sh`; los pasos usan los scripts npm existentes. Seleccionar Node.js 20 en Plesk, instalar con `npm ci`, configurar entorno, correr `npm run db:migrate` como paso explícito, compilar con `npm run build` y ejecutar el backend con `npm start` (script del workspace `backend`). Configurar el document root estático en `frontend/dist` y el proxy/rewrite de `/api` al puerto interno `BACKEND_PORT` del proceso Node para compartir origen. La publicación de archivos estáticos y el fallback SPA dependen de la configuración web del dominio en Plesk. Configurar `CORS_ORIGIN` con el origen público real y `TRUST_PROXY` sólo con IP/CIDR del proxy confiable, si aplica.

Variables actuales relevantes para producción:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://... (URI del Dashboard con SSL)
BACKEND_HOST=0.0.0.0
BACKEND_PORT=... (puerto interno asignado por Plesk)
CORS_ORIGIN=https://tu-dominio.example
TRUST_PROXY=... (proxy confiable, si corresponde)
DB_POOL_MAX=5
DB_IDLE_TIMEOUT_MS=10000
DB_CONNECTION_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=30000
USIG_ADDRESS_SEARCH_URL=https://servicios.usig.buenosaires.gob.ar/normalizar/
OSRM_BASE_URL=https://... (instancia OSRM propia o administrada)
```

`SESSION_SECRET` y `ROUTING_PROVIDER` no son variables utilizadas por el código actual. La cookie de sesión usa token aleatorio persistido como hash en PostgreSQL y queda `Secure` cuando `NODE_ENV=production`. Las APIs externas USIG/OSRM son opcionales para readiness: sus fallos no marcan la app como no lista.

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
