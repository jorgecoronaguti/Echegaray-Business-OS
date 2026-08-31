-- LAS FOTOS DEL SHEET Y EL TRÁFICO DEL CHAT DEJAN DE SER LEGIBLES POR CUALQUIER EMPLEADO.
--
-- Segundo hallazgo del inventario de privilegios del 31/08, mientras se cerraba el TRUNCATE
-- (`20260901T0600`). No estaba en el ticket: lo destapó medir el esquema `orq`, que nadie había
-- mirado porque toda la atención estaba en `public`.
--
-- ═══ QUÉ SE MIDIÓ ═══
--
-- Cinco tablas de `orq` con `relrowsecurity = false`, CERO policies y `select` concedido a
-- `authenticated`. Asumiendo el rol —el mismo camino que usa PostgREST— devolvían:
--
--   orq.sheet_snapshots   50 MB · 2.397 filas   las fotos del 'Flujo de Caja - Cash Flow':
--                                               caja, jornales y margen por obra, celda por celda
--   orq.chat_result      584 kB ·   414 filas   las respuestas del chat, que también llevan plata
--   orq.chat_cost        256 kB ·   493 filas
--   orq.chat_request     152 kB ·   105 filas
--   orq.chat_cache       136 kB ·    21 filas
--
-- No es la fuga de un campo: es el Sheet entero, sin el portero por obra ni el portero económico
-- que gobiernan el resto del OS. Un jefe de obra al que `subcontrato_costo` le esconde el precio de
-- un paquete tenía la caja completa de la empresa a un `select` de distancia.
--
-- ═══ POR QUÉ ESTE ARREGLO Y NO OTRO ═══
--
-- Las otras 19 tablas de `orq` YA tenían RLS. El patrón del esquema —`orq.google_tokens`,
-- `orq.xsas_requests`— es RLS encendida con policy SÓLO para `service_role`: `authenticated`
-- conserva el grant y recibe cero filas. Estas cinco nunca lo recibieron. No se inventa un
-- mecanismo nuevo: se les pone el que sus vecinas ya usan.
--
-- Se agrega el `revoke select` porque las dos capas fallan distinto y las dos hacen falta: la RLS
-- devuelve CERO FILAS —silencioso, se confunde con «no hay datos»— y el REVOKE devuelve PERMISSION
-- DENIED, que se ve en el log. Y porque la lección de la migración hermana es que el GRANT es lo
-- que decide.
--
-- ═══ POR QUÉ NO ROMPE ═══
--
-- Se buscaron los lectores antes de tocar, no después:
--   · CERO referencias a estas cinco tablas en `src/`. Ninguna pantalla las lee.
--   · Los 10 lectores reales viven en `orquestador/` y llegan por `query()` de `lib/db.mjs`, que
--     conecta con DATABASE_URL: rol `postgres`, dueño del esquema y con BYPASSRLS.
--   · `orq` NO está expuesto por PostgREST (`supabase/config.toml`: schemas = public,
--     graphql_public), así que hoy ni siquiera hay ruta HTTP. Eso es un atenuante, no una defensa:
--     está a una línea de configuración de dejar de serlo, y el grant seguía puesto.
--   · `service_role` no pierde nada, y además tiene BYPASSRLS.
--
-- `orq.tasks` y `orq.events` NO se tocan: tienen una policy de lectura deliberada para
-- `authenticated` (`using (true)`), igual que las otras 17 tablas de configuración del Work Fabric.

-- ── 1 · el portero de sus vecinas, en las cinco que no lo tenían ──────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['sheet_snapshots', 'chat_result', 'chat_cost', 'chat_request', 'chat_cache']
  loop
    execute format('alter table orq.%I enable row level security', t);
    execute format('drop policy if exists %I on orq.%I', t || '_srv', t);
    execute format('create policy %I on orq.%I for all to service_role using (true) with check (true)',
                   t || '_srv', t);
    -- La segunda capa: sin grant no hay lectura ni aunque mañana alguien agregue una policy
    -- permisiva «para probar algo».
    execute format('revoke select on orq.%I from authenticated', t);
  end loop;
end $$;

-- ── 2 · y las tablas de orq que todavía no existen ────────────────────────────────────────────
-- `20260711120000_orq_fundacion_work_fabric.sql` dejó
--   alter default privileges in schema orq grant select on tables to authenticated;
-- Es la misma clase de defecto que el TRUNCATE de la migración hermana: la regla que fabrica el
-- permiso, no el permiso. Con esto una tabla nueva de `orq` nace privada, y la que necesite
-- lectura la pide explícitamente — que es lo que uno quiere leer en un diff.
alter default privileges for role postgres in schema orq revoke select on tables from authenticated;

-- ── 3 · la migración se verifica a sí misma ───────────────────────────────────────────────────
do $$
declare
  sin_rls   text;
  con_grant text;
  acl       text;
begin
  select string_agg(c.relname, ', ') into sin_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'orq' and not c.relrowsecurity
     and c.relname = any(array['sheet_snapshots','chat_result','chat_cost','chat_request','chat_cache']);
  if sin_rls is not null then raise exception 'quedaron sin RLS: %', sin_rls; end if;

  select string_agg(c.relname, ', ') into con_grant
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'orq' and has_table_privilege('authenticated', c.oid, 'SELECT')
     and c.relname = any(array['sheet_snapshots','chat_result','chat_cost','chat_request','chat_cache']);
  if con_grant is not null then raise exception 'authenticated conserva select sobre: %', con_grant; end if;

  -- y las que sí debían seguir leyéndose siguen leyéndose
  if not has_table_privilege('authenticated', 'orq.tasks', 'SELECT')
     or not has_table_privilege('authenticated', 'orq.events', 'SELECT') then
    raise exception 'el revoke se llevó puestas orq.tasks/orq.events, que tienen lectura deliberada';
  end if;

  select d.defaclacl::text into acl
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'orq' and d.defaclobjtype = 'r';
  if acl ~ 'authenticated=[^/]*r' then
    raise exception 'las tablas nuevas de orq siguen naciendo legibles por authenticated: %', acl;
  end if;
end $$;
