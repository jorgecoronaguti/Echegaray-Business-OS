-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA HORA SE CARGA UNA SOLA VEZ — `registros_hh` pasa a ser la fuente canónica de TIEMPO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El dueño, textual: *"El módulo Personal/HH no sirve sólo para productividad de obra. Debe
-- convertirse en la FUENTE CANÓNICA de horas trabajadas por persona"* … *"La misma hora se carga UNA
-- SOLA VEZ. NO quiero: HH para obra por un lado + HH para liquidación por otro."*
--
-- Hoy el registro contesta «cuántas horas se gastaron en esta actividad». Le falta UNA cosa para
-- contestar además «cuántas horas hay que liquidarle a esta persona»: **qué clase de hora es**.
--
-- ═══ POR QUÉ NO UNA TABLA NUEVA ═══
--
-- Una tabla de asistencia al lado de `registros_hh` sería exactamente el problema que el pedido
-- prohíbe: la misma jornada cargada dos veces, y al mes siguiente dos totales que no coinciden sin
-- que nadie sepa cuál manda. `registros_hh` ya tiene persona, fecha, obra, actividad, horas, origen
-- y autor. Le falta una columna, no una tabla.
--
-- ═══ QUÉ NO HACE ESTA MIGRACIÓN, A PROPÓSITO ═══
--
-- No decide sola qué hora es al 50% y cuál al 100%. Eso depende del convenio, del día de la semana,
-- de feriados y de la jornada pactada, y el dueño fue explícito: *"No inventar automáticamente qué
-- hora es 50% o 100% si no existe regla/evidencia suficiente"*. El tipo lo elige quien carga; el
-- sistema lo guarda, lo suma por separado y no lo interpreta.
--
-- Tampoco calcula un peso: `extra_50` NO se guarda como 1,5 horas. Se guardan las horas REALES y el
-- tipo. Multiplicar acá enterraría el recargo adentro de un número del que después no se puede
-- sacar, y haría que las horas de obra —que son las que se trabajaron— quedaran infladas.

-- ── 1 · EL TIPO DE HORA ──────────────────────────────────────────────────────────────────────────

alter table public.registros_hh
  add column if not exists tipo_hora text not null default 'normal';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.registros_hh'::regclass and conname = 'registros_hh_tipo_hora_check'
  ) then
    alter table public.registros_hh add constraint registros_hh_tipo_hora_check
      check (tipo_hora in ('normal', 'extra_50', 'extra_100', 'ausencia', 'licencia'));
  end if;
end $$;

comment on column public.registros_hh.tipo_hora is
  'normal | extra_50 | extra_100 | ausencia | licencia. Las horas se guardan REALES: el recargo no '
  'se multiplica acá. `ausencia` y `licencia` NO son trabajo y quedan fuera de las HH de obra.';

-- ── 2 · LA MISMA PERSONA, EL MISMO DÍA, DOS CLASES DE HORA ───────────────────────────────────────
--
-- El único de persona era (obra, persona, fecha, actividad): con él, cargarle a alguien 8 normales y
-- 2 al 50% el mismo día en la misma actividad chocaba con 23505 — que es la jornada más común que
-- existe apenas hay horas extras. El tipo entra a la clave.

drop index if exists public.registros_hh_persona_unico;
create unique index if not exists registros_hh_persona_unico
  on public.registros_hh (
    obra_canonica_id, persona_id, fecha,
    coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo_hora)
  where persona_id is not null;

-- ── 3 · LAS HH DE OBRA SON LAS TRABAJADAS ────────────────────────────────────────────────────────
--
-- Una ausencia tiene horas y NO es trabajo: sumarla al consumo de una actividad diría que la obra
-- gastó horas el día que la persona no fue. `obra_actividad_hh` pasa a contar sólo lo trabajado, y
-- publica las extras por separado para que Obra → Personal pueda mostrarlas sin recalcular nada.

-- `create or replace view` NO puede insertar una columna en el medio —Postgres sólo deja agregar al
-- final—, y `hh_extra` va al lado de `hh_real` porque es su desagregado. Se recrea entera.
drop view if exists public.obra_actividad_hh;
create view public.obra_actividad_hh
with (security_invoker = true) as
select
  a.id as actividad_id,
  a.obra_id,
  a.nombre,
  a.tipo,
  a.orden,
  a.pct as avance_pct,
  a.hh_plan,
  r.hh_real,
  r.hh_extra,
  coalesce(r.n_imputaciones, 0)::int as n_imputaciones,
  case when a.hh_plan > 0 and r.hh_real is not null
       then round((r.hh_real - a.hh_plan) / a.hh_plan * 100, 1) end as desvio_pct,
  case when a.hh_plan > 0 and r.hh_real is not null
       then round(r.hh_real / a.hh_plan * 100, 1) end as consumo_plan_pct
from public.obra_actividad a
left join lateral (
  select
    sum(h.horas) filter (where h.tipo_hora in ('normal', 'extra_50', 'extra_100')) as hh_real,
    sum(h.horas) filter (where h.tipo_hora in ('extra_50', 'extra_100')) as hh_extra,
    count(*) filter (where h.tipo_hora in ('normal', 'extra_50', 'extra_100')) as n_imputaciones
  from public.registros_hh h
  where h.actividad_id = a.id
) r on true
where not a.archivada;

grant select on public.obra_actividad_hh to authenticated;

-- ── 4 · LA CONSOLIDACIÓN POR PERSONA Y POR PERÍODO ──────────────────────────────────────────────
--
-- El dueño pidió poder contestar, sin Sheets: *"¿cuántas horas trabajó esta persona? ¿en qué fechas?
-- ¿en qué obras? ¿en qué actividades? ¿de qué tipo fueron? ¿cuántas tengo que considerar en la
-- liquidación?"* — y que el futuro módulo de sueldos **no vuelva a pedir las horas**.
--
-- Es UNA vista al grano día · persona · obra · actividad · tipo. Todo lo demás —semana, quincena,
-- mes, por obra, por tipo— es una agregación de ésta, y por eso no hay una vista por pregunta: una
-- vista por pregunta es la forma elegante de tener seis definiciones de lo mismo.

create or replace view public.persona_hh_dia
with (security_invoker = true) as
select
  h.id,
  h.persona_id,
  p.nombre_completo,
  p.categoria,
  h.fecha,
  h.fecha_inicio_semana,
  h.obra_canonica_id as obra_id,
  o.nombre as obra,
  h.actividad_id,
  a.nombre as actividad,
  h.tipo_hora,
  h.horas,
  h.notas,
  h.created_at
from public.registros_hh h
join public.personas p on p.id = h.persona_id
left join public.obra_canonica o on o.id = h.obra_canonica_id
left join public.obra_actividad a on a.id = h.actividad_id
-- LAS 19 FILAS LEGACY QUEDAN AFUERA, y no por descuido: no tienen persona, así que no se pueden
-- atribuir a nadie. Mezclarlas acá sería inventar de quién son. Siguen enteras en `registros_hh`
-- con su `fuente_legacy`, que es donde se las va a buscar el día que aparezca la evidencia.
where h.persona_id is not null;

grant select on public.persona_hh_dia to authenticated;

-- EL INPUT DEL FUTURO MÓDULO DE LIQUIDACIÓN. Una función y no una vista porque el período es un
-- parámetro —quincena, mes, o lo que el convenio diga— y hornear un calendario adentro de una vista
-- obliga a cambiarla cada vez que cambia el criterio.
--
-- `security invoker` por omisión (las funciones no son definer salvo que se diga): cada quien ve las
-- horas que la RLS de `registros_hh` le deja ver, sin una segunda regla de permisos que mantener.
create or replace function public.hh_por_periodo(desde date, hasta date, persona uuid default null)
returns table (
  persona_id uuid,
  nombre_completo text,
  categoria text,
  hh_normales numeric,
  hh_extra_50 numeric,
  hh_extra_100 numeric,
  hh_ausencia numeric,
  hh_licencia numeric,
  hh_trabajadas numeric,
  obras jsonb
)
language sql
stable
set search_path to 'public'
as $$
  select
    d.persona_id,
    d.nombre_completo,
    d.categoria,
    coalesce(sum(d.horas) filter (where d.tipo_hora = 'normal'), 0),
    coalesce(sum(d.horas) filter (where d.tipo_hora = 'extra_50'), 0),
    coalesce(sum(d.horas) filter (where d.tipo_hora = 'extra_100'), 0),
    coalesce(sum(d.horas) filter (where d.tipo_hora = 'ausencia'), 0),
    coalesce(sum(d.horas) filter (where d.tipo_hora = 'licencia'), 0),
    coalesce(sum(d.horas) filter (where d.tipo_hora in ('normal', 'extra_50', 'extra_100')), 0),
    -- LA DISTRIBUCIÓN POR OBRA VIAJA CON EL TOTAL, no en una segunda consulta: es la que convierte
    -- estas horas en costo laboral POR OBRA, que es el motivo por el que se cargan con obra.
    coalesce((
      select jsonb_agg(jsonb_build_object('obra_id', x.obra_id, 'obra', x.obra, 'horas', x.horas)
                       order by x.horas desc)
      from (
        select e.obra_id, e.obra, sum(e.horas) as horas
        from public.persona_hh_dia e
        where e.persona_id = d.persona_id and e.fecha between desde and hasta
          and e.tipo_hora in ('normal', 'extra_50', 'extra_100')
        group by e.obra_id, e.obra
      ) x
    ), '[]'::jsonb)
  from public.persona_hh_dia d
  where d.fecha between desde and hasta
    and (persona is null or d.persona_id = persona)
  group by d.persona_id, d.nombre_completo, d.categoria
  order by d.nombre_completo;
$$;

grant execute on function public.hh_por_periodo(date, date, uuid) to authenticated;
