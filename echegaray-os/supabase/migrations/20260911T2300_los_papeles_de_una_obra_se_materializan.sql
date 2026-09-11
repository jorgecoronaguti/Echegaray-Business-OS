-- ═══ LOS PAPELES DE UNA OBRA DEJAN DE CALCULARSE EN CADA VIAJE ════════════════════════════════════
--
-- MEDIDO el 11/09/2026 con `explain (analyze)` como `authenticated`, sobre Messina:
--
--   `obra_papel_drive` recortada a sus obras      exec  610 ms · PLANNING 1.332 ms
--   `pantalla_cliente('messina','documentos')`    exec 13.981 ms
--   la carpeta del cliente (`like` + limit 300)   exec    4 ms
--
-- El dueño lo vio como 23–29 s de render de servidor. La carpeta NO es el problema: el problema es
-- que `obra_papel_drive` es una VISTA que cruza los 4.232 archivos de `drive_index` contra las 22
-- carpetas con `path like ruta || '/%'`, resuelve el `distinct on` sobre todo el universo y RECIÉN
-- ENTONCES se filtra por las obras del cliente. Eso se recalcula en cada llamada —y en una función
-- SQL se replanifica en cada llamada, que es de dónde salen 1,3 s de PLANNING—.
--
-- ═══ LA DECISIÓN: UNA TABLA QUE SE REFRESCA, NO UNA VISTA QUE SE RECALCULA ═══
--
-- El cruce sólo cambia cuando cambia el índice de Drive (timer cada 6 h) o cuando alguien vincula
-- una carpeta (`obras-carpetas-drive.mjs`). Entre esos dos momentos, recalcularlo en cada clic es
-- trabajo repetido por definición. La tabla tiene la MISMA forma que la vista y `obra_papel_drive`
-- pasa a ser un `select *` sobre ella: ningún consumidor cambia —ni la RPC, ni sus tests, ni el
-- contador de la solapa—, y el que la lee ahora usa un índice por `obra_id`.
--
-- NO ES UNA MATERIALIZED VIEW: `refresh materialized view` toma un lock que frena a quien esté
-- leyendo, y además no puede tener RLS propia. Una tabla común con un `refrescar()` que hace
-- `delete` + `insert` adentro de una transacción deja la lectura consistente sin bloquear la cara.
--
-- LA REGLA QUE SE MANTIENE: gana el PAPEL ATADO con evidencia sobre la carpeta, y entre carpetas la
-- MÁS PROFUNDA. Es el mismo cuerpo de 20260911T2100, movido de la vista a la función que llena.

create table if not exists public.obra_papel (
  drive_file_id text primary key,
  obra_id text not null references public.obra_canonica(id) on delete cascade,
  nombre text,
  ruta text,
  mime_type text,
  size_bytes bigint,
  modified_time timestamptz,
  web_view_link text,
  via text,
  refrescado_en timestamptz not null default now()
);

comment on table public.obra_papel is
  'CADA ARCHIVO DE DRIVE CON LA OBRA A LA QUE PERTENECE, ya resuelto. Lo llena '
  'refrescar_obra_papel() desde obra_carpeta_drive + los papeles atados; la vista obra_papel_drive '
  'lee de acá. Existe porque calcular el cruce en cada viaje costaba 610 ms de ejecución y 1,3 s de '
  'planificación por llamada.';

create index if not exists obra_papel_obra_idx on public.obra_papel (obra_id);

-- La MISMA puerta que `obra_carpeta_drive` y que `obra_canonica`: ver los papeles de una obra es ver
-- la obra. Y una policy sin GRANT es «permission denied».
alter table public.obra_papel enable row level security;

drop policy if exists obra_papel_select on public.obra_papel;
create policy obra_papel_select on public.obra_papel for select
  using ((select public.es_administracion())
         or (select public.current_rol()) = 'jefe_obra'
         or obra_id in (select public.mis_obras()));

grant select on public.obra_papel to authenticated;
grant select, insert, update, delete on public.obra_papel to service_role;

-- ═══ EL REFRESCO ═══
--
-- `security definer` a propósito: lo llaman el script del orquestador y el indexador de Drive, y
-- tiene que ver TODO `drive_index` para poder resolver el cruce — no la porción que ve quien lo
-- dispara. Lo que se puede VER después sigue decidiéndolo la RLS de la tabla.
--
-- Devuelve cuántas filas dejó, para que la corrida pueda decirlo en vez de afirmar que anduvo.
create or replace function public.refrescar_obra_papel()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  n integer;
begin
  create temporary table _papel_nuevo on commit drop as
  with archivo as (
    select d.drive_file_id, d.name, d.path, d.mime_type, d.size_bytes, d.modified_time, d.web_view_link
      from public.drive_index d
     where not d.is_folder
       and coalesce(d.trashed, false) = false
       and coalesce(d.ausente_en_drive, false) = false
  ),
  candidato as (
    select a.*, k.obra_id, 1 as prioridad, 0 as largo,
           'la cotización o el contrato que fija el precio'::text as via
      from archivo a join public.obra_contrato k on k.fuente_drive_id = a.drive_file_id
    union all
    select a.*, r.obra_id, 1, 0, 'papel del cliente atado a la obra (' || coalesce(r.tipo, 'otro') || ')'
      from archivo a join public.cliente_orden r on r.drive_file_id = a.drive_file_id
     where r.obra_id is not null and r.eliminado_en is null
    union all
    select a.*, v.obra_id, 1, 0, 'vinculado a la obra'
      from archivo a join public.obra_documento v on v.drive_file_id = a.drive_file_id
    union all
    select a.*, c.obra_id, 2, length(c.ruta), 'carpeta de la obra en Drive'
      from archivo a join public.obra_carpeta_drive c on a.path like c.ruta || '/%'
  )
  select distinct on (drive_file_id)
         drive_file_id, obra_id, name as nombre, path as ruta, mime_type, size_bytes,
         modified_time, web_view_link, via
    from candidato
   order by drive_file_id, prioridad, largo desc;

  -- LA OBRA TIENE QUE EXISTIR: un papel atado a una obra borrada no entra, en vez de romper la FK y
  -- dejar la tabla a medio llenar.
  delete from _papel_nuevo p
   where not exists (select 1 from public.obra_canonica o where o.id = p.obra_id);

  delete from public.obra_papel;
  insert into public.obra_papel
    (drive_file_id, obra_id, nombre, ruta, mime_type, size_bytes, modified_time, web_view_link, via)
  select drive_file_id, obra_id, nombre, ruta, mime_type, size_bytes, modified_time, web_view_link, via
    from _papel_nuevo;

  get diagnostics n = row_count;
  return n;
end
$fn$;

comment on function public.refrescar_obra_papel() is
  'Rehace public.obra_papel desde obra_carpeta_drive y los papeles atados. Lo llaman '
  'scripts/obras-carpetas-drive.mjs --aplicar y el indexador de Drive. Gana el papel atado sobre la '
  'carpeta, y entre carpetas la más profunda — la misma regla que tenía la vista.';

revoke all on function public.refrescar_obra_papel() from public;
grant execute on function public.refrescar_obra_papel() to service_role;

-- ═══ LA VISTA SIGUE EXISTIENDO Y AHORA LEE LA TABLA ═══
--
-- Ningún consumidor cambia: ni `pantalla_cliente`, ni el contador de la solapa, ni los tests que la
-- nombran. Lo único que cambia es cuánto cuesta leerla.
create or replace view public.obra_papel_drive
with (security_invoker = true) as
  select drive_file_id, obra_id, nombre, ruta, mime_type, size_bytes, modified_time, web_view_link, via
    from public.obra_papel;

comment on view public.obra_papel_drive is
  'Los papeles de cada obra. Desde 20260911T2300 lee public.obra_papel —que refresca '
  'refrescar_obra_papel()— en vez de cruzar drive_index entero en cada viaje: 610 ms de ejecución y '
  '1,3 s de planificación por llamada medidos el 11/09/2026.';

grant select on public.obra_papel_drive to authenticated, service_role;

-- La primera carga, para que la cara no quede vacía entre la migración y la próxima corrida.
select public.refrescar_obra_papel();

notify pgrst, 'reload schema';
