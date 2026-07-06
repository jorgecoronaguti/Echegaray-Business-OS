# Validar migraciones SQL sin un proyecto Supabase real (sin Docker)

Contexto: no hay proyecto Supabase conectado ni Docker instalado en la máquina de desarrollo (no se puede correr `supabase start`). El MCP `supabase` en `.mcp.json` tiene placeholders, no está activo.

## Procedimiento repetible

1. Confirmar que hay Postgres local disponible: `psql --version` (en esta máquina: Postgres 16 vía Homebrew, servicio ya corriendo en `localhost:5432`).
2. Crear los roles que Supabase usa por convención (si no existen ya, son globales al cluster, se crean una sola vez):
   ```sql
   CREATE ROLE anon NOLOGIN;
   CREATE ROLE authenticated NOLOGIN;
   CREATE ROLE service_role NOLOGIN;
   ```
   Esto permite que las políticas RLS (`for all to authenticated using (true)`) compilen sin error de "role does not exist".
3. Crear una base descartable: `createdb echegaray_migration_check`.
4. Aplicar la migración: `psql echegaray_migration_check -v ON_ERROR_STOP=1 -f supabase/migrations/[archivo].sql`.
5. Probar el happy path y los constraints (insert válido, insert que debe fallar por FK/CHECK) directamente con `psql`.
6. Borrar la base: `dropdb echegaray_migration_check`.

## Qué SÍ valida este procedimiento
- Sintaxis SQL, constraints (FK, CHECK, UNIQUE), triggers, defaults.

## Qué NO valida (limitación real, no ocultar)
- RLS con `auth.uid()` real — Postgres puro no tiene el esquema `auth` de Supabase, solo los roles vacíos.
- Comportamiento de la API REST (PostgREST) que Supabase expone — eso requiere el proyecto real o el stack local completo con Docker.
- **Confirmado en PRP-001**: los GRANTs de tabla que Supabase configura por defecto en un proyecto real (o que hay que crear a mano) no existen en este setup de Postgres local — una migración puede pasar este procedimiento perfectamente y aun así fallar con `permission denied` para `authenticated` en un proyecto real, porque falta el `GRANT` explícito. Este procedimiento valida DDL, no el modelo completo de acceso.

Cuando exista un proyecto Supabase real, re-aplicar las migraciones ahí (`apply_migration` del MCP `supabase`, o `supabase db push`), correr `get_advisors(type: "security")`, y probar el acceso real (rol o JWT) antes de dar la tabla por cerrada — no confiar solo en este procedimiento local.
