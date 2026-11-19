// Empaqueta el servidor en un solo archivo con sus dependencias adentro.
// Vercel copia el contenido de dist/ sin node_modules, así que dist/main.js debe ser autosuficiente.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/main.js',
  external: ['pg-native'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
writeFileSync('dist/package.json', JSON.stringify({ type: 'module' }));
