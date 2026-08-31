-- NINGÚN ROL DE APLICACIÓN PUEDE VACIAR UNA TABLA, NI LAS QUE TODAVÍA NO EXISTEN.
--
-- Cierra `docs/engineering/TICKET-truncate-authenticated.md`.
--
-- ═══ QUÉ SE MIDIÓ (2026-08-31, base productiva) ═══
--
--   privilegio    anon   authenticated   (sobre 196 tablas de public)
--   TRUNCATE      194        187
--   REFERENCES    194        194
--   TRIGGER       194        194
--   MAINTAIN      194        194
--
-- El ticket sólo había contado TRUNCATE y sólo para `authenticated`. Los otros tres bits estaban
-- igual de abiertos, y `anon` —el rol de la clave pública que viaja en el navegador— estaba PEOR
-- que `authenticated`, no mejor.
--
-- ═══ POR QUÉ RLS NO SALVA NADA DE ESTO ═══
--
-- Las policies filtran FILAS en select/insert/update/delete. Estos cuatro son privilegios de TABLA:
-- no pasan por RLS, no disparan los triggers de auditoría por fila y no dejan rastro reconstruible.
--   · TRUNCATE   vacía la tabla entera, incluidas las que el sistema declara inmutables
--                (`cotizacion_evento`, `cotizacion_override_precio`, el log de Base Maestra:
--                 tienen prohibido el UPDATE y el DELETE por policy, y se podían vaciar enteras).
--   · TRIGGER    permite colgarle un trigger a la tabla. No pueden escribir la función —`public`
--                no da CREATE a anon ni a authenticated— pero sí ENGANCHAR una de las 33 funciones
--                SECURITY DEFINER que ya existen, que corren con los permisos de su dueño.
--   · REFERENCES permite clavarle una FK desde afuera y bloquear borrados legítimos.
--   · MAINTAIN   permite CLUSTER/REINDEX: toma el lock exclusivo de la tabla. No borra un dato,
--                deja la pantalla colgada, que en horario de obra es lo mismo.
--
-- ═══ LA CAUSA, QUE NO ESTABA EN LAS TABLAS ═══
--
-- No había que arreglar 187 tablas: había que arreglar la regla que las fabrica así. El
-- `pg_default_acl` del rol `postgres` —el que corre las migraciones— para el esquema `public` decía
--
--   {postgres=arwdDxtm/postgres, anon=Dxtm/postgres, authenticated=Dxtm/postgres, service_role=arwdDxtm/postgres}
--
-- o sea: toda tabla creada por una migración NACÍA con los cuatro bits puestos para anon y para
-- authenticated. Es el mismo patrón que ya mordió con los GRANT por columna. Por eso el número del
-- ticket crecía solo —176/185 → 187/196 en una hora— y por eso revocar tabla por tabla habría
-- durado hasta la migración siguiente.
--
-- ═══ POR QUÉ ESTE REVOKE NO ROMPE NADA ═══
--
-- Se buscó, antes de revocar, si algún flujo los usa con un rol de aplicación:
--   · TRUNCATE: los 20 usos del repo están en tests y scripts que corren con el rol del pool
--     (`postgres`, dueño de las 196 tablas) o con `service_role`. Ninguno con `authenticated`.
--   · TRIGGER y REFERENCES: sólo se ejercen en DDL, y el DDL lo hace el dueño.
--   · MAINTAIN: el vacuum lo corre el autovacuum de la plataforma, no un rol de aplicación.
-- `service_role` conserva los cuatro: es el backend autorizado, su clave no sale del servidor, y
-- limpiar tablas es parte de su trabajo. Revocárselos sería un revoke de más.
-- SELECT/INSERT/UPDATE/DELETE no se tocan: ahí es donde vive la operación normal bajo RLS.

-- Un REVOKE sobre `all tables` toca 301 relaciones de golpe. Si una de ellas está tomada por una
-- consulta larga, esta migración se queda esperando CON las otras 300 ya bloqueadas y cuelga la app
-- entera. Prefiere fallar y que se la vuelva a correr.
set local lock_timeout = '5s';

-- ── 1 · las 196 que ya existen ────────────────────────────────────────────────────────────────
-- `all tables` alcanza también a las 105 vistas: una vista tampoco necesita que un rol de
-- aplicación pueda colgarle un INSTEAD OF trigger.
revoke truncate, references, trigger, maintain on all tables in schema public from anon, authenticated;

-- ── 2 · las que todavía no existen ────────────────────────────────────────────────────────────
-- Sin esto, la próxima migración vuelve a fabricar el agujero. `for role postgres` porque las 196
-- tablas de public tienen owner `postgres` y es el rol con el que corren las migraciones.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

-- ── 3 · la migración se verifica a sí misma ───────────────────────────────────────────────────
-- Una migración que corre sin error no prueba que el permiso se fue: `has_table_privilege` sí,
-- porque también ve lo que llega por herencia de rol y por PUBLIC, que el ACL crudo no muestra.
do $$
declare
  n_tablas   int;
  acl_futuro text;
begin
  select count(*) into n_tablas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace,
         unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p,
         unnest(array['anon','authenticated']) r
   where n.nspname = 'public' and c.relkind in ('r','p')
     and has_table_privilege(r, c.oid, p);
  if n_tablas > 0 then
    raise exception 'quedaron % combinaciones tabla/rol/privilegio destructivas en public', n_tablas;
  end if;

  select d.defaclacl::text into acl_futuro
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'public' and d.defaclobjtype = 'r';
  if acl_futuro ~ '(anon|authenticated)=[^/]*[Dxtm]' then
    raise exception 'las tablas nuevas siguen naciendo con permiso destructivo: %', acl_futuro;
  end if;
end $$;
