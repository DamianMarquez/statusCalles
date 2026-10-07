#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="$project_root/data/routing"
extract_url="https://download.bbbike.org/osm/bbbike/BuenosAires/BuenosAires.osm.pbf"
osrm_image="ghcr.io/project-osrm/osrm-backend:latest"

mkdir -p "$data_dir"
if [[ ! -s "$data_dir/BuenosAires.osm.pbf" ]]; then
  echo 'Descargando el extracto OSM de Buenos Aires…'
  curl --fail --location --retry 3 --output "$data_dir/BuenosAires.osm.pbf" "$extract_url"
fi

if [[ ! -s "$data_dir/BuenosAires.osrm" ]]; then
  echo 'Preparando la red de calles con OSRM (puede tardar unos minutos)…'
  docker run --rm -t -v "$data_dir:/data" "$osrm_image" \
    osrm-extract -p /opt/car.lua /data/BuenosAires.osm.pbf
  docker run --rm -t -v "$data_dir:/data" "$osrm_image" \
    osrm-partition /data/BuenosAires.osrm
  docker run --rm -t -v "$data_dir:/data" "$osrm_image" \
    osrm-customize /data/BuenosAires.osrm
fi

docker compose -f "$project_root/docker-compose.yml" \
  -f "$project_root/docker-compose.routing.yml" up -d routing

echo 'Esperando respuesta de OSRM en http://localhost:5001…'
for attempt in {1..15}; do
  if curl --silent --show-error --fail --max-time 3 \
    'http://localhost:5001/route/v1/driving/-58.3816,-34.6037;-58.3974,-34.5895?overview=false' \
    | rg -q '"code":"Ok"'; then
    echo 'OSRM está listo. Configurá OSRM_BASE_URL=http://localhost:5001 y reiniciá el backend.'
    exit 0
  fi
  sleep 2
done

echo 'OSRM no respondió a la prueba. Revisá los logs con: docker compose -f docker-compose.yml -f docker-compose.routing.yml logs routing' >&2
exit 1
