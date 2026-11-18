# Lab MapLibre GL (rama `feature/maplibre-lab`)

Prototipo paralelo al mapa Leaflet. No reemplaza nada: se abre con `http://localhost:5173/?lab=1`.

## Qué incluye

- `frontend/src/lab/MapLabView.tsx`: mapa MapLibre, capas de calles, reportes y dibujos.
- `frontend/src/lab/drawTools.ts`: Terra Draw captura el gesto (marca, línea, zona); la forma se guarda en una fuente propia coloreada por estado y persiste en `localStorage`.
- `frontend/src/lab/labConfig.ts`: estilo base y expresión de color por nivel (reusa `streetConditionCatalog.ts`).
- Mediciones activables a la vez: Estado general, Baches, Todos los reportes. Los filtros por nivel solo hacen `setFilter`, sin recargar datos ni remontar capas.

## Calles por puntaje (fase 2)

- Cada tramo se pinta con un degradado continuo según `score` (0 rojo oscuro → 100 verde). Sin evidencia (`hasEvidence: false`) queda gris. No se usa `condition`, que vale `GOOD` de relleno.
- Chip "Sin datos" y filtros por nivel funcionan en cliente con `setFilter`. Clic en una calle muestra puntaje, reportes activos y confianza.
- El backend no cambió: ya devuelve todos los tramos con o sin reportes. Solo cuentan reportes físicos con tramo asignado (≤ 35 m).

## Datos de prueba (solo base local)

```bash
docker compose up -d database                      # PostGIS en el puerto 5433
export DATABASE_URL=postgresql://street_status:street_status@localhost:5433/street_status
npm run db:migrate
npm run seed:lab --workspace backend               # ~500 reportes [LAB] en el microcentro
npm run seed:lab --workspace backend -- --clean    # los borra
```

El seed se niega a correr si `DATABASE_URL` no es localhost. Para ver el lab contra otro backend: `API_PROXY_TARGET=http://127.0.0.1:3001 npm run dev:frontend`.

## Cómo probarlo

```bash
npm run dev:backend    # necesita PostGIS local con datos (la base de Supabase de .env no responde)
npm run dev:frontend
```

Opcional: `VITE_MAP_STYLE_URL` en `frontend/.env` con un estilo vectorial (MapTiler, Stadia). Sin ella usa tiles raster de OSM.

## Verificado

- Tipos, ESLint y los 85 tests de frontend siguen en verde.
- Carga del mapa, dibujo, calles coloreadas por puntaje, gris sin datos, popup y chip "Sin datos", probados en el navegador contra la base local.

## Sin verificar

- Datos reales de Supabase: la base no respondía; se verificó con la base local y reportes ficticios.
- Rendimiento con el viewport lleno en zoom 16.
- Estilo vectorial de proveedor.

## Pendiente / ideas

- Popups al clic en calles, marcas y dibujos; editar o borrar un dibujo individual.
- Baches agregados por segmento (hoy son puntos de reporte).
- Clustering de reportes y mapa de calor.
- Guardar dibujos en el backend (hoy solo localStorage).

## Notas técnicas

- `vite.config.ts` excluye `maplibre-gl` de `optimizeDeps`; sin eso el worker falla en dev.
- Migrar el mapa principal implicaría ~500 líneas en ~10 archivos (`MapView`, `StreetScoreLayer`, marcadores, `AnalyticsDashboard`, estilos y mocks de tests).

## Alternativas y estilo (fase 3)

"OpenStreetMap" es una fuente de datos, no un motor. La dureza de las líneas venía de cómo se dibujaban y del mapa base raster, no de MapLibre.

| Capa      | Opciones                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Motor     | MapLibre GL (actual), Mapbox GL (pago), Google Maps JS, deck.gl sobre MapLibre para volúmenes enormes                       |
| Mapa base | MapTiler (a probar), Stadia (Alidade Smooth), CARTO (Positron/Voyager), Mapbox, Protomaps (PMTiles propio, sin clave), Esri |
| Datos     | OSM, BA Data, USIG (ya usados)                                                                                              |

De la lista de USIG/Argenmap: casi todo es Leaflet (mismo problema visual) o datos. Útiles: PMTiles con un extracto de CABA como mapa base propio gratis, `@usig-gcba/callejero` y BA Data. Revisar precios y términos de cada proveedor antes de producción.

### Qué se cambió

- Calles: capa de borde claro (`streets-casing`) bajo el color, `line-blur` leve, ancho por zoom y clase vial (PRIMARY > SECONDARY > LOCAL), calles sin datos más finas y sin borde, y capas insertadas bajo las etiquetas del mapa base.
- Dibujos: modos "Línea libre" y "Zona libre" (Terra Draw freehand); al terminar se simplifica (Douglas-Peucker) y se suaviza (Chaikin) en `frontend/src/lab/smooth.ts`. Líneas con borde y puntas redondas.
- MapLibre exige que `['zoom']` sea el `interpolate` de nivel superior: los factores de datos van dentro de las salidas (ver `zoomScaled` en `labConfig.ts`).

### Sin verificar

- Trazo libre real con mouse (se probó con 4 puntos, que salió curvo).
- Posible angulosidad por la simplificación del servidor a zoom medio.

### MapTiler probado

- La clave va en `frontend/.env.local` (ignorado por git) como `VITE_MAP_STYLE_URL`. Se compararon `streets-v2` (beige, más cargado) y `dataviz` (gris claro, pensado para superponer datos). **`dataviz` es el elegido**: los colores de puntaje resaltan y las etiquetas se leen sobre ellos.
- Pendiente: las calles grises (sin datos) se confunden con las calles grises del mapa base; probar un gris más claro o ocultarlas por defecto.

## Migración al mapa principal

El mapa principal (`/`) ya usa MapLibre; Leaflet, react-leaflet y @types/leaflet se eliminaron.

- Capa compartida: `frontend/src/components/map/maplibre/mapLibre.tsx` (`MapCanvas`, `MapMarker`, `MapPopup`, `useMapEvents`, `focusMap`). Los popups conservan contenido React mediante portales.
- Estilo de calles compartido: `frontend/src/components/map/streetLayerStyle.ts` (degradado por puntaje, gris sin datos, borde, ancho por clase vial). `StreetScoreLayer.tsx` usa una capa invisible más ancha para facilitar el clic.
- Pavimento: una capa por condición (continua o con guiones), debajo del color de la calle.
- Analytics: `AnalyticsHeatMap.tsx` reemplaza el mapa de calor de Leaflet.
- Los colores de los niveles de `streetConditionCatalog.ts` ahora coinciden con el degradado.
- El lab (`/?lab=1`) sigue para el dibujo (marcas, líneas, zonas), que aún no está en el mapa principal.
- Producción: definir `VITE_MAP_STYLE_URL` al compilar el frontend (ver `docs/plesk-configuracion.md`).
