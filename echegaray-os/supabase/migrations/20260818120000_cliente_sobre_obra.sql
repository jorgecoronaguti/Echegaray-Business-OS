-- EL CLIENTE ARRIBA DE LA OBRA — sobre la tabla que YA EXISTÍA, no sobre una nueva.
--
-- ═══ QUÉ HABÍA, Y POR QUÉ NO SE CREA `cliente_canonico` ═══
--
-- `public.clientes` existe desde el 08/07/2026 con cuatro filas reales (ARCOR, La Estrella, San
-- Francisco, Messinas) y es a quien apunta `obras.cliente_id` del eje legacy. Tiene nombre y poco
-- más, pero ES la entidad cliente de esta empresa. Crear `cliente_canonico` al lado habría dejado
-- dos tablas de clientes conviviendo, que es el defecto que este OS acaba de terminar de sacarse de
-- encima con el avance. Se reutiliza y se solidifica: se le agrega lo que le falta para ser la
-- ficha que se pide (slug estable, CUIT, carpeta de Drive), y se le cuelga `obra_canonica`.
--
-- El eje legacy `obras` NO se toca ni se revive: sigue donde está, sin que nadie nuevo lo lea.
--
-- ═══ LA RELACIÓN ═══
--
--     clientes ──1:N──> obra_canonica ──1:N──> obra_actividad
--
-- `cliente_texto` se queda en `obra_canonica` como lo que dijo la fuente —igual que `fuente_pestana`
-- en las actividades—, pero el que manda pasa a ser `cliente_id`. Un texto no es una entidad: "La
-- Estrella" aparece en tres obras y hasta hoy eran tres cadenas iguales por casualidad.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) La tabla de clientes, solidificada
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.clientes add column if not exists slug             text;
alter table public.clientes add column if not exists cuit             text;
alter table public.clientes add column if not exists drive_carpeta_id text;
alter table public.clientes add column if not exists activo           boolean not null default true;
alter table public.clientes add column if not exists notas            text;

-- El slug es el identificador legible y estable, el mismo criterio que `obra_canonica.id`: se usa
-- en la URL y no cambia cuando alguien corrige la razón social.
update public.clientes set slug = 'arcor'         where nombre = 'ARCOR' and slug is null;
update public.clientes set slug = 'la-estrella'   where nombre like 'La Estrella%' and slug is null;
update public.clientes set slug = 'san-francisco' where nombre like 'San Francisco%' and slug is null;
update public.clientes set slug = 'messina'       where nombre = 'Messinas' and slug is null;

-- Quattropani es cliente desde que el dueño dio de alta su obra el 17/08/2026 ("Es una obra: darla
-- de alta") y no estaba en la tabla. La razón social es la que trae el Sheet.
insert into public.clientes (nombre, slug)
select 'Quattropani - Melisa García SAS', 'quattropani'
where not exists (select 1 from public.clientes where slug = 'quattropani');

create unique index if not exists clientes_slug_key on public.clientes (slug) where slug is not null;

-- La carpeta de cada cliente en Drive, tal como está indexada hoy en `drive_index`. NO se copia un
-- solo archivo: se guarda el id de la carpeta y los documentos se siguen abriendo en Drive.
update public.clientes c set drive_carpeta_id = d.drive_file_id
  from public.drive_index d
 where c.drive_carpeta_id is null
   and d.mime_type like '%folder%'
   and (
        (c.slug = 'arcor'         and d.path = 'administracion/ARCOR')
     or (c.slug = 'la-estrella'   and d.path = 'administracion/PRESUPUESTOS/LA ESTRELLA')
     or (c.slug = 'messina'       and d.path = 'administracion/PRESUPUESTOS/JUAN MESSINAS')
     or (c.slug = 'quattropani'   and d.path = 'administracion/PRESUPUESTOS/FRANCO QUATTROPANI')
   );

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) La obra cuelga del cliente
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.obra_canonica add column if not exists cliente_id uuid references public.clientes(id);

update public.obra_canonica o set cliente_id = c.id from public.clientes c
 where o.cliente_id is null and (
      (o.id in ('arcor')                                        and c.slug = 'arcor')
   or (o.id in ('la-estrella','le-comedor','le-galpon-9')        and c.slug = 'la-estrella')
   or (o.id in ('san-francisco')                                 and c.slug = 'san-francisco')
   or (o.id in ('messina')                                       and c.slug = 'messina')
   or (o.id in ('quattropani')                                   and c.slug = 'quattropani')
 );
-- `galpones` (cerrada) queda SIN cliente a propósito: su `cliente_texto` dice "Galpones", que es el
-- nombre de la obra, no el de un cliente. Nadie sabe hoy de quién era. Inventarle uno para que la
-- ficha quede prolija sería fabricar un dato; la pantalla lo muestra como "sin cliente declarado".

create index if not exists obra_canonica_cliente_idx on public.obra_canonica (cliente_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) Contactos y documentos del CLIENTE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Mismo criterio que en la obra: el archivo vive en Drive y acá vive el VÍNCULO. `origen` distingue
-- lo que puso una persona de lo que se dedujo del path, para no discutir después de dónde salió.
create table if not exists public.cliente_contacto (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  nombre      text not null,
  rol         text,
  email       text,
  telefono    text,
  notas       text,
  creado_en   timestamptz not null default now()
);
create index if not exists cliente_contacto_cliente_idx on public.cliente_contacto (cliente_id);

create table if not exists public.cliente_documento (
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  drive_file_id text not null,
  rol           text,
  origen        text not null default 'manual' check (origen in ('manual','path_inferido')),
  creado_en     timestamptz not null default now(),
  primary key (cliente_id, drive_file_id)
);

alter table public.cliente_contacto  enable row level security;
alter table public.cliente_documento enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cliente_contacto','cliente_documento'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_write on public.%I for all to authenticated
        using (public.current_rol() = any (array['direccion','administracion']))
        with check (public.current_rol() = any (array['direccion','administracion']))$f$, t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) `cliente_panel` — la cartera del cliente, sin recalcular nada
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Todo lo económico y el avance salen de `obra_panel`, que a su vez saca el avance de `obra_avance`.
-- Acá SÓLO se suma. No hay un avance de cliente: promediar obras de tamaños distintos daría un
-- número que no significa nada, y la cartera muestra el de cada obra.
--
-- `obra_panel` se rehace primero, porque suma el cliente y las vistas se apilan. El `grant` del
-- final NO es opcional: `drop view` se lleva los privilegios, y eso ya dejó el módulo entero en
-- `permission denied` una vez.
drop view if exists public.cliente_panel;
drop view if exists public.obra_panel;

create view public.obra_panel as
select
  oc.id                as obra_id,
  oc.nombre,
  oc.cliente_id,
  cl.slug              as cliente_slug,
  coalesce(cl.nombre, oc.cliente_texto) as cliente_nombre,
  oc.cliente_texto,
  oc.estado,
  oc.tipo,
  oc.etapa,
  oc.jefe_obra,
  oc.orden,
  oc.monto_contratado,
  oc.fecha_inicio_plan,
  oc.fecha_fin_plan,
  oc.fecha_inicio_real,
  oc.fecha_fin_real,
  oc.drive_carpeta_id,
  ocr.costo_real,
  ocr.n_comprobantes,
  case when oc.monto_contratado > 0 and coalesce(ocr.costo_real, 0) > 0
       then round((oc.monto_contratado - ocr.costo_real) / oc.monto_contratado * 100, 1) end
    as margen_sobre_contratado_pct,
  av.avance_pct,
  av.n_medidas::int         as n_actividades_medidas,
  av.n_actividades::int     as n_actividades,
  av.n_sin_planificar::int  as n_actividades_sin_planificar,
  av.sincronizado_en        as avance_sincronizado_en,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada')                                      as restricciones_abiertas,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada'
      and r.fecha_compromiso is not null and r.fecha_compromiso < current_date)              as restricciones_vencidas
from public.obra_canonica oc
left join public.clientes cl         on cl.id  = oc.cliente_id
left join public.obra_costo_real ocr on ocr.obra_id = oc.id
left join public.obra_avance av      on av.obra_id  = oc.id;

create view public.cliente_panel as
select
  c.id                                                    as cliente_id,
  c.slug,
  c.nombre,
  c.cuit,
  c.drive_carpeta_id,
  c.activo,
  c.notas,
  count(op.obra_id)::int                                  as n_obras,
  count(op.obra_id) filter (where op.estado = 'activa')::int as n_obras_activas,
  sum(op.monto_contratado)                                as contratado,
  sum(op.costo_real)                                      as costo_real,
  sum(op.restricciones_abiertas)::int                     as restricciones_abiertas,
  max(op.avance_sincronizado_en)                          as avance_sincronizado_en,
  (select count(*)::int from public.cliente_contacto ct where ct.cliente_id = c.id)  as n_contactos,
  (select count(*)::int from public.cliente_documento cd where cd.cliente_id = c.id) as n_documentos
from public.clientes c
left join public.obra_panel op on op.cliente_id = c.id
group by c.id, c.slug, c.nombre, c.cuit, c.drive_carpeta_id, c.activo, c.notas;

grant select on public.obra_panel        to authenticated;
grant select on public.cliente_panel     to authenticated;
grant select on public.clientes          to authenticated;
grant select, insert, update, delete on public.cliente_contacto  to authenticated;
grant select, insert, update, delete on public.cliente_documento to authenticated;
