import OSRM from '@project-osrm/osrm';
import { resolve } from 'node:path';

const graphPath = resolve(process.argv[2] ?? `data/routing/osrm-${OSRM.version}/BuenosAires.osrm`);
const engine = new OSRM({ path: graphPath, algorithm: 'MLD', mmap_memory: true });

const response = await new Promise((resolveRoute, rejectRoute) => {
  engine.route(
    {
      coordinates: [
        [-58.3816, -34.6037],
        [-58.3974, -34.5895],
      ],
      geometries: 'geojson',
      overview: 'full',
      steps: false,
    },
    (error, result) => (error ? rejectRoute(error) : resolveRoute(result)),
  );
});

if (
  (response?.code !== undefined && response.code !== 'Ok') ||
  !Array.isArray(response.routes) ||
  !response.routes[0] ||
  response.routes[0].distance <= 0 ||
  response.routes[0].duration <= 0 ||
  response.routes[0].geometry?.type !== 'LineString' ||
  response.routes[0].geometry.coordinates.length < 2
) {
  throw new Error(
    `OSRM smoke check did not return a valid CABA route (code: ${response?.code ?? 'unknown'}).`,
  );
}

console.log(
  `OSRM smoke check OK: ${Math.round(response.routes[0].distance)} m, ${Math.round(response.routes[0].duration)} s, ${response.routes[0].geometry.coordinates.length} puntos.`,
);
