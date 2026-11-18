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
