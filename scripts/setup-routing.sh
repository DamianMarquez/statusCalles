#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

configured_data_root="${OSRM_DATA_DIR:-}"
if [[ -z "$configured_data_root" && -f "$project_root/.env" ]]; then
  configured_data_root="$(node -e 'const fs=require("node:fs");const dotenv=require("dotenv");process.stdout.write(dotenv.parse(fs.readFileSync(".env")).OSRM_DATA_DIR||"")')"
fi
data_root="${configured_data_root:-$project_root/data/routing}"
mkdir -p "$data_root"
if [[ "$data_root" != /* ]]; then
  data_root="$project_root/$data_root"
fi

package_dir="$project_root/node_modules/@project-osrm/osrm"
if [[ ! -d "$package_dir" ]]; then
  echo "No se encontró @project-osrm/osrm. Ejecutá npm ci antes de preparar el grafo." >&2
  exit 1
fi

osrm_version="$(node -p "require('./node_modules/@project-osrm/osrm/package.json').version")"
binary_dir="$package_dir/lib/binding_napi_v8"
profile="$package_dir/profiles/car.lua"
pbf="$data_root/BuenosAires.osm.pbf"
dataset_dir="$data_root/osrm-$osrm_version"
graph="$dataset_dir/BuenosAires.osrm"
threads="${OSRM_PREP_THREADS:-2}"

if [[ ! -f "$pbf" ]]; then
  pbf_url="${CABA_OSM_PBF_URL:-https://download.bbbike.org/osm/bbbike/BuenosAires/BuenosAires.osm.pbf}"
  echo "Descargando extracto OSM de Buenos Aires..."
  curl --fail --location --retry 3 --output "$pbf.tmp" "$pbf_url"
  mv "$pbf.tmp" "$pbf"
fi

if command -v shasum >/dev/null 2>&1; then
  pbf_sha256="$(shasum -a 256 "$pbf" | awk '{print $1}')"
else
  pbf_sha256="$(sha256sum "$pbf" | awk '{print $1}')"
fi
metadata_matches() {
  [[ -f "$dataset_dir/.street-status-routing.json" && -f "$graph.properties" && -f "$graph.mldgr" && -f "$graph.partition" ]] && \
    node -e 'const fs=require("node:fs");const f=process.argv[1];const m=JSON.parse(fs.readFileSync(f,"utf8"));process.exit(m.osrmVersion===process.argv[2]&&m.algorithm==="MLD"&&m.pbfSha256===process.argv[3]?0:1)' \
      "$dataset_dir/.street-status-routing.json" "$osrm_version" "$pbf_sha256"
}

if metadata_matches; then
  echo "El grafo OSRM $osrm_version ya está preparado y coincide con el extracto."
  node scripts/check-routing.mjs "$graph"
  exit 0
fi

for executable in osrm-extract osrm-partition osrm-customize; do
  if [[ ! -x "$binary_dir/$executable" ]]; then
    echo "No se encontró el ejecutable nativo $binary_dir/$executable. Revisá la instalación del addon para esta plataforma." >&2
    exit 1
  fi
done
if [[ ! -f "$profile" ]]; then
  echo "No se encontró el perfil de conducción incluido en @project-osrm/osrm: $profile" >&2
  exit 1
fi

stage="$(mktemp -d "$data_root/.routing-build.XXXXXXXX")"
cleanup() { rm -rf "$stage"; }
trap cleanup EXIT
stage_graph="$stage/BuenosAires.osrm"

echo "Procesando el grafo OSRM $osrm_version (MLD, perfil car.lua; $threads hilos)..."
"$binary_dir/osrm-extract" -p "$profile" "$pbf" -o "$stage_graph" --threads="$threads"
"$binary_dir/osrm-partition" "$stage_graph" --threads="$threads"
"$binary_dir/osrm-customize" "$stage_graph" --threads="$threads"
node scripts/check-routing.mjs "$stage_graph"
node -e 'require("node:fs").writeFileSync(process.argv[1], JSON.stringify({osrmVersion:process.argv[2],algorithm:"MLD",pbfSha256:process.argv[3],profile:"car.lua"},null,2)+"\n")' \
  "$stage/.street-status-routing.json" "$osrm_version" "$pbf_sha256"

previous_dir="$data_root/osrm-$osrm_version.previous"
rm -rf "$previous_dir"
if [[ -e "$dataset_dir" ]]; then
  mv "$dataset_dir" "$previous_dir"
fi
if ! mv "$stage" "$dataset_dir"; then
  if [[ -e "$previous_dir" && ! -e "$dataset_dir" ]]; then mv "$previous_dir" "$dataset_dir"; fi
  echo "No se pudo activar el grafo OSRM nuevo; se restauró el anterior si existía." >&2
  exit 1
fi
trap - EXIT
rm -rf "$previous_dir"

echo "Grafo OSRM activo en $graph"
node scripts/check-routing.mjs "$graph"
