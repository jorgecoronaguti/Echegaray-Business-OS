-- TODA TABLA NUEVA NACE CON GRANT (cambio de Supabase del 30/10/2026).
--
-- Supabase deja de exponer automáticamente por la Data API lo que `postgres` crea en `public`: desde
-- el 30/10/2026 una tabla nueva sin `grant` explícito no existe para `anon`, `authenticated` ni
-- `service_role` (ver `supabase/config.toml`, `auto_expose_new_tables`). En esta base eso YA es así:
-- `pg_default_acl` para `postgres` en `public` sólo reparte a `service_role` (lo dejó la migración
-- 20260818T2330) y no reparte nada a `anon` ni `authenticated`. Leído el 23/09/2026:
--
--   tablas (r): {postgres=arwdDxtm, service_role=arwdDxtm}   secuencias: {postgres}   funciones: {postgres}
--
-- O sea que el 30/10 no cambia nada en producción: el riesgo es el que ya existía, una migración que
-- crea una tabla y se olvida del `grant` deja una pantalla que devuelve «permission denied» para el
-- usuario con sesión. Esta migración lo corrige en dos planos:
--
--   1. Lo que hoy falta en objetos que la app usa. Auditado contra el código (`src/**` con cliente de
--      sesión, `orquestador/**` entra por Postgres como `postgres`) y contra las políticas: NINGÚN
--      objeto que la app lea con sesión carece de grant. Los 63 objetos sin grant a `authenticated`
--      son: 24 con políticas para `authenticated` que nadie consume por sesión (políticas muertas,
--      quedan como decisión del dueño: se activan o se retiran), 5 con grant POR COLUMNA a propósito
--      (banco_movimientos, cobranzas, documento_espejo_corrida, obra_economia_sheet, recupero_art),
--      y el resto es del orquestador/service_role. No se abre nada que nadie usa.
--      Lo único que sí falta es de `service_role`: 12 secuencias nacidas después de 20260818T2330
--      sin `usage`. Las 5 serial (documento_fragmento, ml_embedding, ml_entidad_alias, ml_resolucion,
--      portal_acceso) fallarían en un INSERT por PostgREST con la clave de servicio.
--
--   2. Privilegios por defecto para lo que venga: toda tabla o vista que `postgres` cree en `public`
--      nace con DML para `authenticated` y `service_role`. NO para `anon`: hoy `anon` sólo lee
--      `os_runtime` (una fila de configuración) y el login no necesita ninguna tabla. Abrirle por
--      defecto lo que todavía no existe sería regalar superficie sin un uso que lo pida.
--
-- El grant NO reemplaza a la RLS: una tabla con grant y sin política devuelve cero filas, y una tabla
-- con grant y RLS apagada muestra todo a cualquier usuario con sesión. Por eso la regla
-- (`.claude/rules/migraciones.md`) y la prueba (`supabase/migrations/grants.test.mjs`) exigen las
-- tres cosas en la misma migración: `grant` + `enable row level security` + política.
--
-- Idempotente: `grant` sobre un privilegio que ya está y `alter default privileges` repetido son no-op.
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- ── 1. service_role: las secuencias que quedaron afuera ──────────────────────────────────────────
-- Igual que hizo 20260818T2330 con las que existían entonces. `service_role` salta la RLS por diseño:
-- esto no abre nada nuevo, sólo deja de romper un INSERT que ya debía poder hacer.
grant usage, select on all sequences in schema public to service_role;

-- ── 2. lo que nazca de acá en adelante ───────────────────────────────────────────────────────────
-- `for role postgres` explícito: las migraciones corren como `postgres` (aplicar-migracion.mjs con
-- DATABASE_URL) y los privilegios por defecto son POR ROL CREADOR. Sin nombrarlo aplicarían al rol
-- de la sesión, que es el mismo hoy, pero el archivo tiene que decir a quién le habla.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;

-- `anon` queda fuera a propósito (ver arriba). Si un objeto nuevo necesita `anon` —un portal sin
-- sesión, un endpoint público— se le da en su propia migración, con nombre y motivo.

comment on table public.migracion_aplicada is
  'Qué migraciones corrió esta base. El hash es del archivo tal como se aplicó: si alguien lo edita '
  'después, deja de coincidir y aplicar-migracion.mjs --estado lo dice. Desde 20260923T2000 toda tabla '
  'nueva de public nace con grant a authenticated y service_role (privilegios por defecto); la RLS y la '
  'política siguen siendo obligatorias en la misma migración.';
