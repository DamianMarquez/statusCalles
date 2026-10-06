# Street Status

MVP para consultar y, en próximas etapas, reportar el estado de las calles de la Ciudad Autónoma de Buenos Aires (CABA). Esta primera fase deja una base ejecutable para evolucionar el producto sin implementar todavía reportes ni autenticación.

## Alcance actual

- Frontend React + TypeScript + Vite con una pantalla principal responsive y un espacio preparado para el mapa.
- Backend Node.js + TypeScript + Fastify, organizado como monolito modular.
- `GET /api/health`, que devuelve `{ "status": "ok" }`.
- PostgreSQL con PostGIS en Docker Compose.
- Configuración de TypeScript estricto, ESLint, Prettier y tests básicos.

El mapa real con Leaflet/OpenStreetMap y los módulos de reportes, calles y usuarios se incorporarán en fases posteriores. Las carpetas de esos módulos ya están preparadas para agregar su lógica sin acoplarla al framework o a la infraestructura.

## Requisitos

- Node.js 20.19 o superior (o 22.13 o superior) y npm.
- Docker y Docker Compose para iniciar PostgreSQL/PostGIS.

## Puesta en marcha

1. Instalar las dependencias desde la raíz:

   ```bash
   npm install
   ```

2. Crear el archivo local de variables de entorno:

   ```bash
   cp .env.example .env
   ```

3. Iniciar PostgreSQL + PostGIS:

   ```bash
   docker compose up -d database
   ```

   La base queda disponible en `localhost:5432`. La extensión PostGIS viene incluida en la imagen; todavía no se ejecutan migraciones porque no existe modelo de datos en esta fase.

4. En una terminal, iniciar el backend:

   ```bash
   npm run dev:backend
   ```

   La API escucha por defecto en `http://localhost:3000`. Verificar el health check:

   ```bash
   curl http://localhost:3000/api/health
   ```

5. En otra terminal, iniciar el frontend:

   ```bash
   npm run dev:frontend
   ```

   Vite informa la URL local, normalmente `http://localhost:5173`.

También se puede iniciar únicamente el backend con `npm run dev` desde la raíz. La variable `VITE_API_URL` queda documentada para la futura conexión frontend/API.

## Comandos

Desde la raíz:

| Comando                | Acción                                |
| ---------------------- | ------------------------------------- |
| `npm run dev:backend`  | Backend en modo watch                 |
| `npm run dev:frontend` | Servidor de desarrollo Vite           |
| `npm run build`        | Compila backend y frontend            |
| `npm test`             | Ejecuta los tests de ambos workspaces |
| `npm run lint`         | Ejecuta ESLint                        |
| `npm run format`       | Formatea con Prettier                 |
| `npm run format:check` | Comprueba el formato                  |

Para detener la base: `docker compose down`. Para eliminar también los datos persistidos: `docker compose down -v`.

## Estructura

```text
frontend/
  src/                 # Aplicación React y estilos
backend/
  src/
    app/               # Composición de la aplicación Fastify
    modules/
      health/          # Health check inicial
      reports/         # Preparado para futuros reportes
      streets/         # Preparado para futuras calles y puntuaciones
      users/           # Preparado para futuros usuarios y reputación
    infrastructure/
      database/        # Preparado para PostgreSQL/PostGIS
      maps/            # Preparado para servicios/adaptadores de mapas
    shared/            # Código compartido del backend
docker-compose.yml
```

Cada módulo de dominio tendrá sus responsabilidades y rutas propias. `app/` registra esos módulos, mientras `infrastructure/` aloja las integraciones externas. Esta separación mantiene una sola aplicación desplegable y evita introducir capas o servicios que el alcance actual no necesita. Los endpoints futuros `/api/reports`, `/api/streets` y `/api/users` aún no están implementados.

## Configuración

Copiar `.env.example` a `.env` permite ajustar host/puerto del backend, URL de conexión a base de datos, URL de API del frontend y credenciales/puerto de PostgreSQL. Los valores incluidos son exclusivamente para desarrollo local; no usar esas credenciales en producción.

## Próximas evoluciones posibles

La estructura permite agregar confirmaciones de reportes, Street Score, historial, integración con datos públicos de CABA, fotografías, cuentas y reputación, y recomendaciones de rutas. Estas funcionalidades requieren definir sus modelos y reglas en cada módulo antes de conectarlos con PostgreSQL/PostGIS y la interfaz.
