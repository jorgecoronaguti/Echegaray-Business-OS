-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL FORECAST DICE CON QUÉ RITMO LO CALCULÓ — y el cómputo deja de ser un número sin memoria
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Hasta acá la obra sabe decir cuánto planificó (`hh_plan`), cuánto lleva consumido (`hh_real`) y
-- cuánto avanzó. No sabe decir **cuánto va a costar terminar**, que es la única de las cuatro que
-- sirve para decidir algo mientras la obra está viva. Una desviación detectada al cierre es
-- historia; detectada durante la ejecución es una herramienta de gestión.
--
--     COTIZADO ≠ PLANIFICADO ≠ REAL ≠ FORECAST
--
-- Son cuatro números distintos y tienen que poder valer cuatro cosas distintas a la vez. El
-- cotizado vive en la partida congelada, el planificado en `hh_plan`, el real en `registros_hh`, y
-- el forecast se calcula acá. **La línea base no se toca**: `inicio_base`/`fin_base` son lo que se
-- selló y el forecast no las mueve — si el forecast pudiera reescribir la baseline, no habría
-- contra qué medir el desvío.
--
-- ═══ EL FORECAST DECLARA SU MÉTODO, FILA POR FILA ═══
--
-- Hay dos maneras de proyectar lo que falta y no valen lo mismo:
--
--   · **ritmo real** — la actividad ya produjo algo, así que se sabe cuántas horas productivas
--     costó cada unidad y se multiplica por lo que falta. Es un CÁLCULO sobre evidencia.
--   · **ritmo del plan** — la actividad no arrancó, o no mide cantidad: lo que falta se estima con
--     el rendimiento que se planificó. Es una INFERENCIA, y va a ser tan buena como el análisis.
--
-- La vista publica `base_del_forecast` con la que usó en cada fila. Un número que no dice cómo se
-- calculó obliga a confiar en él; uno que lo dice, no. Es la misma regla de `obra_avance` y de
-- `base_del_avance`, y por eso se escribe igual.
--
-- Y el rendimiento real se mide sobre HORAS PRODUCTIVAS (4500): proyectar con el total metería la
-- espera del camión de hormigón en todo lo que falta, como si fuera a repetirse cada día.

-- ── 1 · el forecast de cada actividad ─────────────────────────────────────────────────────────
create or replace view public.obra_actividad_forecast with (security_invoker = true) as
with base as (
  select c.actividad_id,
         c.obra_id,
         c.nombre,
         c.unidad,
         c.metodo_avance,
         c.cantidad_objetivo,
         c.cantidad_ejecutada,
         c.avance_pct,
         c.hh_plan,
         -- De `actividad_horas` (4500), que es LA definición de la partición. No de
         -- `obra_actividad_control`: esa vista la reescriben dos frentes y sus columnas dependen del
         -- orden de aplicación — el forecast no puede depender de eso.
         ah.hh_real,
         ah.hh_improductivas,
         ah.hh_productivas,
         c.inicio_plan, c.fin_plan, c.inicio_base, c.fin_base, c.inicio_real, c.fin_real,
         coalesce(c.dotacion_prevista, padre.dotacion_prevista) as dotacion,
         coalesce(o.jornada_horas, 8)                           as jornada,
         -- El rendimiento OBSERVADO en horas por unidad, sobre lo productivo.
         case when coalesce(c.cantidad_ejecutada, 0) > 0 and coalesce(ah.hh_productivas, 0) > 0
              then ah.hh_productivas / c.cantidad_ejecutada end  as rendimiento_real,
         -- Lo que falta, en unidades cuando el método las mide.
         case when c.metodo_avance = 'cantidad' and c.cantidad_objetivo is not null
              then greatest(c.cantidad_objetivo - coalesce(c.cantidad_ejecutada, 0), 0) end
                                                                as cantidad_restante,
         -- Lo que falta, en fracción, para todo lo demás.
         case when c.avance_pct is not null
              then greatest(1 - c.avance_pct / 100.0, 0) end     as fraccion_restante
    from public.obra_actividad_control c
    join public.actividad_horas ah on ah.actividad_id = c.actividad_id
    left join public.obra_actividad padre on padre.id = c.actividad_padre_id
    left join public.obra_canonica o on o.id = c.obra_id
   where c.tipo <> 'resumen' and not c.archivada
), proyectado as (
  select b.*,
         case
           when b.rendimiento_real is not null and b.cantidad_restante is not null
             then b.cantidad_restante * b.rendimiento_real
           when b.hh_plan is not null and b.fraccion_restante is not null
             then b.hh_plan * b.fraccion_restante
         end                                                    as hh_restantes,
         case
           when b.rendimiento_real is not null and b.cantidad_restante is not null
             then 'ritmo real: horas productivas por unidad ya ejecutada · CÁLCULO'
           when b.hh_plan is not null and b.fraccion_restante is not null
             then 'ritmo del plan: no hay producción propia todavía · INFERENCIA'
           else 'sin base: la actividad no tiene HH previstas ni producción medida'
         end                                                    as base_del_forecast
    from base b
)
select p.actividad_id,
       p.obra_id,
       p.nombre,
       p.unidad,
       p.metodo_avance,
       p.cantidad_objetivo,
       p.cantidad_ejecutada,
       p.cantidad_restante,
       p.avance_pct,
       p.hh_plan,
       p.hh_real,
       p.hh_improductivas,
       p.hh_productivas,
       round(p.rendimiento_real, 4)                             as rendimiento_real,
       case when p.cantidad_objetivo > 0 and p.hh_plan is not null
            then round(p.hh_plan / p.cantidad_objetivo, 4) end  as rendimiento_plan,
       round(p.hh_restantes, 2)                                 as hh_restantes,
       case when p.hh_restantes is not null
            then round(coalesce(p.hh_real, 0) + p.hh_restantes, 2) end as hh_forecast,
       case when p.hh_restantes is not null and p.hh_plan is not null
            then round(coalesce(p.hh_real, 0) + p.hh_restantes - p.hh_plan, 2) end as desvio_hh,
       case when p.hh_restantes is not null and p.hh_plan > 0
            then round((coalesce(p.hh_real, 0) + p.hh_restantes - p.hh_plan) / p.hh_plan * 100, 1) end
                                                                as desvio_hh_pct,
       public.duracion_dias(p.hh_restantes, p.dotacion, p.jornada, 0) as dias_restantes,
       p.dotacion                                               as dotacion_prevista,
       p.jornada                                                as jornada_horas,
       -- LA BASELINE NO SE TOCA. Van al lado para poder comparar las cuatro, no para reescribirse.
       p.inicio_plan, p.fin_plan, p.inicio_base, p.fin_base, p.inicio_real, p.fin_real,
       p.base_del_forecast
  from proyectado p;

comment on view public.obra_actividad_forecast is
  'Cuánto falta para terminar cada actividad, con el método declarado fila por fila en '
  'base_del_forecast: «ritmo real» es un CÁLCULO sobre lo ya producido, «ritmo del plan» es una '
  'INFERENCIA. El rendimiento real se mide sobre horas PRODUCTIVAS —proyectar con el total metería '
  'la espera del camión en todo lo que falta—. Las fechas base van al lado y NO se tocan: cotizado, '
  'planificado, real y forecast son cuatro números y tienen que poder valer cuatro cosas distintas.';

grant select on public.obra_actividad_forecast to authenticated;
grant select on public.obra_actividad_forecast to service_role;

-- ── 2 · la proyección económica, con su portero y su naturaleza en el nombre ──────────────────
-- El COSTO REAL por comprobantes ya tiene fuente (`obra_costo_real`) y no se duplica acá: una
-- capacidad, una fuente. Lo que esta vista aporta es lo que no existe en ningún lado — la
-- proyección del costo a terminación a partir del consumo de HH.
--
-- Es una INFERENCIA y el nombre de la columna lo dice: supone que el costo se comporta como las HH,
-- que es cierto para la mano de obra y falso para el material ya comprado. Está declarado adentro
-- en vez de en un manual porque el que lee la columna es el que tiene que saberlo.
create or replace view public.obra_forecast_economico with (security_invoker = false) as
with partidas as (
  select distinct a.obra_id, p.id as partida_id, p.cantidad, p.costo_unitario,
         p.subcontratada, p.precio_subcontrato
    from public.obra_actividad a
    join public.cotizacion_partida p on p.id = a.cotizacion_partida_id
    join public.cotizaciones c on c.id = p.cotizacion_id
   where c.congelada_en is not null
), costo as (
  select obra_id,
         sum(case when subcontratada then precio_subcontrato
                  else cantidad * costo_unitario end) as costo_cotizado,
         count(*)::int                                as n_partidas_congeladas
    from partidas group by obra_id
), horas as (
  select obra_id,
         sum(hh_plan)                                          as hh_plan,
         sum(hh_real)                                          as hh_real,
         sum(hh_improductivas)                                 as hh_improductivas,
         sum(hh_forecast)                                      as hh_forecast,
         count(*) filter (where base_del_forecast like 'ritmo real%')::int     as n_con_ritmo_real,
         count(*) filter (where base_del_forecast like 'ritmo del plan%')::int as n_con_ritmo_plan,
         count(*) filter (where base_del_forecast like 'sin base%')::int       as n_sin_base
    from public.obra_actividad_forecast group by obra_id
)
select o.id                                          as obra_id,
       o.nombre                                      as obra,
       c.costo_cotizado,
       c.n_partidas_congeladas,
       h.hh_plan,
       h.hh_real,
       h.hh_improductivas,
       h.hh_forecast,
       case when h.hh_plan > 0 then round(h.hh_forecast / h.hh_plan, 4) end as factor_hh,
       case when h.hh_plan > 0 and c.costo_cotizado is not null
            then round(c.costo_cotizado * h.hh_forecast / h.hh_plan, 2) end
                                                     as costo_proyectado_inferido,
       case when h.hh_plan > 0 and c.costo_cotizado is not null
            then round(c.costo_cotizado * h.hh_forecast / h.hh_plan - c.costo_cotizado, 2) end
                                                     as desvio_proyectado_inferido,
       h.n_con_ritmo_real, h.n_con_ritmo_plan, h.n_sin_base,
       case
         when c.costo_cotizado is null then 'sin presupuesto congelado convertido a esta obra'
         when h.hh_plan is null or h.hh_plan = 0 then 'las actividades no tienen HH previstas: no hay factor que aplicar'
         when h.n_con_ritmo_real = 0 then 'INFERENCIA: ninguna actividad produjo todavía, el forecast es el plan'
         else 'INFERENCIA: el costo se proyecta con el factor de HH (' || h.n_con_ritmo_real ||
              ' actividades con ritmo real, ' || h.n_con_ritmo_plan || ' con ritmo de plan)'
       end                                           as base_de_la_proyeccion
  from public.obra_canonica o
  left join costo c on c.obra_id = o.id
  left join horas h on h.obra_id = o.id
 where public.ve_economia();

comment on view public.obra_forecast_economico is
  'COTIZADO contra PROYECTADO. El costo cotizado sale de las partidas congeladas convertidas a esta '
  'obra; la proyección aplica el factor de HH del forecast y por eso se llama '
  'costo_proyectado_INFERIDO: supone que el costo se comporta como las horas, lo cual es cierto para '
  'la mano de obra y falso para el material ya comprado. El costo REAL por comprobantes NO se '
  'recalcula acá: ya tiene su fuente y una capacidad tiene una sola. Corre como dueño y lleva '
  've_economia() en el WHERE — quien no ve la plata no recibe filas.';

grant select on public.obra_forecast_economico to authenticated;
grant select on public.obra_forecast_economico to service_role;

-- ── 3 · el cómputo, con memoria de cálculo ────────────────────────────────────────────────────
--
-- `cotizacion_partida.cantidad` es EL cómputo y es un número sin memoria: no dice de qué plano
-- salió, ni de qué revisión, ni quién lo midió, ni cómo. Cuando el cliente manda la revisión C del
-- plano, la única manera de saber qué cambia es rehacer el cómputo entero.
--
-- Los descuentos de vanos van en NEGATIVO y por eso el CHECK es `cantidad <> 0` y no `> 0`: una
-- fila de −12,5 m² por las aberturas es una línea legítima del cómputo, y un cero es lo único que
-- nunca aporta nada. Esta migración deja la fundación; la pantalla es otro trabajo.
create table if not exists public.computo (
  id                    uuid primary key default gen_random_uuid(),
  cotizacion_partida_id uuid not null references public.cotizacion_partida (id) on delete cascade,
  documento_drive_id    text,
  documento_nombre      text,
  revision              text,
  elemento              text,
  sector                text,
  unidad                text,
  cantidad              numeric not null check (cantidad <> 0),
  origen                text not null check (origen in ('plano', 'relevamiento', 'estimacion', 'importado')),
  criterio              text,
  autor                 uuid default auth.uid(),
  creado_en             timestamptz not null default now()
);

create index if not exists computo_partida_idx on public.computo (cotizacion_partida_id);

comment on table public.computo is
  'La memoria de cálculo del cómputo de una partida, línea por línea. `cantidad` admite negativos a '
  'propósito: el descuento de vanos es una línea legítima. `origen` distingue lo medido sobre plano '
  'de lo relevado en obra y de lo estimado — tres niveles de confianza que hoy se publican como el '
  'mismo número.';
comment on column public.computo.criterio is
  'Cómo se llegó a ese número: «12 paños de 2,40 × 1,10». Es lo que permite rehacer sólo la parte '
  'que cambió cuando llega la revisión siguiente del plano, en vez de recomputar todo.';

create or replace view public.computo_de_partida with (security_invoker = true) as
select p.id                                     as partida_id,
       p.cotizacion_id,
       p.descripcion,
       p.unidad,
       p.cantidad                               as cantidad_partida,
       sum(c.cantidad)                          as cantidad_computada,
       count(c.id)::int                         as n_lineas,
       count(*) filter (where c.cantidad < 0)::int as n_descuentos,
       count(distinct c.documento_nombre)::int  as n_documentos,
       count(*) filter (where c.origen = 'estimacion')::int as n_estimadas,
       case when p.cantidad is not null and sum(c.cantidad) is not null
            then round(sum(c.cantidad) - p.cantidad, 4) end as diferencia,
       case
         when count(c.id) = 0                                   then 'sin cómputo cargado'
         when p.cantidad is null                                then 'la partida no declara cantidad'
         when round(sum(c.cantidad), 4) = round(p.cantidad, 4)  then 'la cantidad de la partida es la suma del cómputo'
         else 'la partida dice ' || p.cantidad || ' y el cómputo suma ' || sum(c.cantidad)
       end                                      as lectura
  from public.cotizacion_partida p
  left join public.computo c on c.cotizacion_partida_id = p.id
 group by p.id, p.cotizacion_id, p.descripcion, p.unidad, p.cantidad;

comment on view public.computo_de_partida is
  'La trazabilidad del cómputo: qué dice la partida contra qué suman sus líneas. NO corrige la '
  'partida ni la fuerza a cuadrar — hay casos legítimos en los que difieren (un ajuste comercial, '
  'un cómputo parcial en curso) y taparlos con un trigger convertiría la diferencia en invisible. '
  'Se publica y se ve.';

-- ── 4 · permisos ──────────────────────────────────────────────────────────────────────────────
-- Espejo de `cotizacion_partida`: el presupuesto ES precio y el cómputo es su insumo directo.
alter table public.computo enable row level security;

drop policy if exists computo_economia on public.computo;
create policy computo_economia on public.computo for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

grant select, insert, update, delete on public.computo to authenticated;
grant all on public.computo to service_role;
grant select on public.computo_de_partida to authenticated;
grant select on public.computo_de_partida to service_role;
