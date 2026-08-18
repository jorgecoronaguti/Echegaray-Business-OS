-- EL MVP OPERATIVO: TODO LO QUE YA EXISTÍA, COLGADO DEL EJE CANÓNICO.
--
-- ═══ LO QUE HABÍA, Y POR QUÉ NO SE CREA CASI NADA ═══
--
-- Este OS ya tenía `personas` (30), `registros_hh`, `presupuestos`, `partidas_presupuesto`,
-- `certificados`, `adicionales` y `actividades_semanales`. El problema no era que faltaran: es que
-- **cuelgan de `public.obras` legacy** —cuatro filas, todas pausadas o cerradas— mientras la
-- operación real vive en `obra_canonica`. Por eso el presupuesto de $204M y las 681 HH cargadas no
-- aparecían en ninguna pantalla de las obras que facturan.
--
-- Acá se tiende el puente: cada una gana `obra_canonica_id`. No se crea ni una tabla equivalente.
-- `certificados` y `adicionales` ya tenían la columna: alguien empezó esta migración y quedó a
-- mitad de camino.
--
-- ═══ LO ÚNICO NUEVO ═══
--   · `obra_asignacion` — qué persona trabaja en qué obra (y opcionalmente en qué actividad).
--     No existía: `personas` no tenía forma de relacionarse con una obra.
--   · Cuatro columnas en `obra_actividad`: responsable, HH plan/real y el archivado.
--   · `obra_plan_vs_real` — la vista que compara, que es el valor central del módulo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) EL PUENTE AL EJE CANÓNICO
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.presupuestos          add column if not exists obra_canonica_id text references public.obra_canonica(id);
alter table public.registros_hh          add column if not exists obra_canonica_id text references public.obra_canonica(id);
alter table public.actividades_semanales add column if not exists obra_canonica_id text references public.obra_canonica(id);

-- Se mapea SÓLO lo que coincide exactamente por nombre normalizado. Las legacy "Pisos" y "Cambio de
-- Pisos - RRHH" no tienen contraparte canónica y quedan SIN mapear a propósito: adivinar a qué obra
-- pertenece un presupuesto de $47,5M por parecido de nombre es fabricar un dato con efecto
-- económico. Quedan visibles como "sin obra canónica" hasta que el dueño diga cuál es.
update public.presupuestos p set obra_canonica_id = oc.id
  from public.obras o join public.obra_canonica oc on public.norm_obra(o.nombre) = public.norm_obra(oc.nombre)
 where p.obra_id = o.id and p.obra_canonica_id is null;
update public.registros_hh h set obra_canonica_id = oc.id
  from public.obras o join public.obra_canonica oc on public.norm_obra(o.nombre) = public.norm_obra(oc.nombre)
 where h.obra_id = o.id and h.obra_canonica_id is null;
update public.actividades_semanales a set obra_canonica_id = oc.id
  from public.obras o join public.obra_canonica oc on public.norm_obra(o.nombre) = public.norm_obra(oc.nombre)
 where a.obra_id = o.id and a.obra_canonica_id is null;
update public.certificados c set obra_canonica_id = oc.id
  from public.obras o join public.obra_canonica oc on public.norm_obra(o.nombre) = public.norm_obra(oc.nombre)
 where c.obra_id = o.id and c.obra_canonica_id is null;

create index if not exists presupuestos_canonica_idx          on public.presupuestos (obra_canonica_id);
create index if not exists registros_hh_canonica_idx          on public.registros_hh (obra_canonica_id);
create index if not exists actividades_semanales_canonica_idx on public.actividades_semanales (obra_canonica_id);
create index if not exists certificados_canonica_idx          on public.certificados (obra_canonica_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) LA ACTIVIDAD GANA RESPONSABLE, HH Y ARCHIVADO
-- ─────────────────────────────────────────────────────────────────────────────
-- `cuadrilla` ya existía (viene del tracker de Drive). El responsable es una PERSONA con nombre:
-- una cuadrilla no rinde cuentas, una persona sí.
alter table public.obra_actividad add column if not exists responsable_id uuid references public.personas(id);
alter table public.obra_actividad add column if not exists hh_plan numeric;
alter table public.obra_actividad add column if not exists hh_real numeric;
-- Una actividad NO SE BORRA: se archiva. Borrarla se lleva su historia de avance y su baseline.
alter table public.obra_actividad add column if not exists archivada boolean not null default false;
alter table public.obra_actividad add column if not exists creada_en_web boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) QUIÉN TRABAJA EN QUÉ OBRA — lo único que de verdad no existía
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.obra_asignacion (
  id            uuid primary key default gen_random_uuid(),
  obra_id       text not null references public.obra_canonica(id) on delete cascade,
  persona_id    uuid not null references public.personas(id) on delete cascade,
  -- 'responsable' es el jefe de obra o capataz; 'integrante' es el resto de la cuadrilla.
  rol           text not null default 'integrante' check (rol in ('responsable','integrante')),
  cuadrilla     text,
  actividad_id  uuid references public.obra_actividad(id) on delete set null,
  desde         date,
  hasta         date,
  notas         text,
  creado_en     timestamptz not null default now()
);
-- La unicidad va como índice y no como `unique (...)` de tabla: lleva una expresión, y una
-- restricción de tabla no admite expresiones. Una persona puede estar asignada a la obra en general
-- (sin actividad) y además a actividades puntuales, pero no dos veces a lo mismo.
create unique index if not exists obra_asignacion_unica
  on public.obra_asignacion (obra_id, persona_id, coalesce(actividad_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists obra_asignacion_obra_idx    on public.obra_asignacion (obra_id);
create index if not exists obra_asignacion_persona_idx on public.obra_asignacion (persona_id);

alter table public.obra_asignacion enable row level security;
drop policy if exists obra_asignacion_select on public.obra_asignacion;
create policy obra_asignacion_select on public.obra_asignacion for select to authenticated using (true);
drop policy if exists obra_asignacion_write on public.obra_asignacion;
create policy obra_asignacion_write on public.obra_asignacion for all to authenticated
  using (public.current_rol() = any (array['direccion','administracion','jefe_obra']))
  with check (public.current_rol() = any (array['direccion','administracion','jefe_obra']));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) PLAN CONTRA REAL — el valor central, calculado UNA vez
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Cada desvío tiene que poder explicarse señalando el dato del que sale, y por eso la vista publica
-- las DOS PUNTAS de cada comparación, no sólo la diferencia. Un "-12%" sin sus dos números es una
-- afirmación que nadie puede auditar.
--
-- Y CADA COMPARACIÓN SE ANULA SOLA CUANDO LE FALTA UNA PUNTA. Sin presupuesto no hay desvío de
-- costo: hay un presupuesto que falta. Publicarlo como 0% diría "vamos en presupuesto", que es
-- exactamente lo contrario de la verdad.
create or replace view public.obra_plan_vs_real as
with hh as (
  select obra_canonica_id as obra_id, sum(horas) as hh_real
    from public.registros_hh where obra_canonica_id is not null group by 1
), hh_plan as (
  select obra_id, sum(hh_plan) as hh_plan
    from public.obra_actividad where hh_plan is not null and not archivada group by 1
), pres as (
  select distinct on (obra_canonica_id)
         obra_canonica_id as obra_id, id as presupuesto_id, monto_presupuestado,
         costo_directo_presupuestado, margen_esperado, hh_estimada
    from public.presupuestos
   where obra_canonica_id is not null
   order by obra_canonica_id, (estado = 'aprobado') desc, version desc
), cert as (
  select obra_canonica_id as obra_id,
         sum(monto_certificado) as certificado,
         sum(monto_facturado)   as facturado,
         sum(monto_cobrado)     as cobrado
    from public.certificados where obra_canonica_id is not null group by 1
), plazo as (
  select obra_id,
         min(inicio_plan) as inicio_plan, max(fin_plan) as fin_plan,
         min(inicio_base) as inicio_base, max(fin_base) as fin_base,
         count(*) filter (where not archivada and tipo <> 'resumen'
                            and fin_plan is not null and fin_plan < current_date
                            and coalesce(pct, 0) < 100)                     as atrasadas,
         count(*) filter (where not archivada and inicio_base is not null)  as con_baseline
    from public.obra_actividad group by 1
)
select
  op.obra_id,
  op.nombre,
  op.cliente_id,
  op.cliente_nombre,
  op.estado,
  op.etapa,

  -- PLAZO
  plazo.inicio_plan, plazo.fin_plan, plazo.inicio_base, plazo.fin_base,
  case when plazo.fin_base is not null and plazo.fin_plan is not null
       then (plazo.fin_plan - plazo.fin_base) end                            as desvio_plazo_dias,
  plazo.atrasadas::int                                                       as actividades_atrasadas,
  plazo.con_baseline::int                                                    as actividades_con_baseline,

  -- AVANCE (de la fuente única `obra_avance`, la misma que publican la web y el chat)
  op.avance_pct,
  op.n_actividades_medidas,
  op.n_actividades,

  -- HH
  hh_plan.hh_plan,
  pres.hh_estimada,
  hh.hh_real,
  case when coalesce(hh_plan.hh_plan, pres.hh_estimada) > 0 and hh.hh_real is not null
       then round((hh.hh_real - coalesce(hh_plan.hh_plan, pres.hh_estimada))
                  / coalesce(hh_plan.hh_plan, pres.hh_estimada) * 100, 1) end as desvio_hh_pct,

  -- ECONOMÍA
  pres.presupuesto_id,
  pres.monto_presupuestado,
  pres.costo_directo_presupuestado                                            as costo_presupuestado,
  op.costo_real,
  -- `> 0`, no `is not null`: una obra sin un solo comprobante imputado trae costo real 0, y con
  -- `is not null` eso publicaba "-100% de desvío" —o sea, "gastamos un 100% menos de lo
  -- presupuestado"— sobre una obra de la que simplemente no se cargó nada.
  case when pres.costo_directo_presupuestado > 0 and op.costo_real > 0
       then round((op.costo_real - pres.costo_directo_presupuestado)
                  / pres.costo_directo_presupuestado * 100, 1) end            as desvio_costo_pct,
  op.monto_contratado,
  pres.margen_esperado,
  case when op.monto_contratado > 0 and op.costo_real > 0
       then op.monto_contratado - op.costo_real end                           as margen_actual,

  -- CONTRATO
  cert.certificado, cert.facturado, cert.cobrado,
  case when op.monto_contratado is not null
       then op.monto_contratado - coalesce(cert.certificado, 0) end           as pendiente_certificar,
  coalesce(cert.certificado, 0) - coalesce(cert.cobrado, 0)                   as pendiente_cobrar
from public.obra_panel op
left join hh      on hh.obra_id      = op.obra_id
left join hh_plan on hh_plan.obra_id = op.obra_id
left join pres    on pres.obra_id    = op.obra_id
left join cert    on cert.obra_id    = op.obra_id
left join plazo   on plazo.obra_id   = op.obra_id;

comment on view public.obra_plan_vs_real is
  'PLAN contra REAL por obra. Publica las dos puntas de cada comparación además del desvío: un '
  'porcentaje sin sus dos números no se puede auditar. Cada desvío es null cuando le falta una '
  'punta — sin presupuesto no hay desvío de costo, hay un presupuesto que falta.';

grant select on public.obra_plan_vs_real to authenticated;
grant select, insert, update, delete on public.obra_asignacion to authenticated;
grant select on public.personas       to authenticated;
grant select, insert, update, delete on public.presupuestos          to authenticated;
grant select, insert, update, delete on public.registros_hh          to authenticated;
grant select, insert, update, delete on public.certificados          to authenticated;
grant select, insert, update, delete on public.partidas_presupuesto  to authenticated;

-- La ubicación de la obra: hasta ahora vivía sólo en la cabeza del jefe de obra.
alter table public.obra_canonica add column if not exists ubicacion text;
