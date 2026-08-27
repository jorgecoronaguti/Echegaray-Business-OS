-- EL ESTADO OPERATIVO DE ECHEGARAY, CONSULTABLE EN UNA SOLA LECTURA.
--
-- ═══ QUÉ RESUELVE (27/08/2026) ═══
--
-- La cadena `Cliente → Obra → Actividad → Personas → HH → Avance → Costo → Resultado` existía entera
-- en la base, repartida en siete tablas, y NADIE la tenía junta. Para contestar «¿cómo viene esta
-- actividad contra lo que se planificó?» había que escribir el mismo join de cada vez —y cada quien
-- lo escribía distinto, que es como dos pantallas terminan mostrando números diferentes del mismo
-- hecho.
--
-- ═══ ES UNA VISTA, NO UNA TABLA — Y ESO ES EL PUNTO ═══
--
-- No se copia un solo dato. La verdad sigue viviendo donde vivía; esto es la forma de mirarla. Una
-- tabla materializada sería una segunda versión de la realidad que se desactualiza sola, y el OS ya
-- tiene una regla para eso: un concepto se define UNA vez.
--
-- ═══ security_invoker ═══
--
-- Sin él la vista correría con los permisos de quien la creó y un jefe de obra vería las obras que
-- no son suyas. Con él, cada quien ve por la vista exactamente lo mismo que vería por las tablas.

-- ── LA ACTIVIDAD, CON SU PLAN Y SU REAL AL LADO ──────────────────────────────────────────────

create or replace view public.xsas_actividad
with (security_invoker = true) as
select
  a.id                                   as actividad_id,
  a.obra_id,
  o.nombre                               as obra,
  coalesce(c.nombre_comercial, c.razon_social, o.cliente_texto) as cliente,
  o.cliente_id,
  o.estado                               as obra_estado,
  o.contrato_monto,
  o.contrato_moneda,
  a.codigo,
  a.nombre                               as actividad,
  a.estado                               as actividad_estado,
  a.unidad,
  a.tarea_tipo_id,
  tt.codigo                              as tarea_codigo,
  tt.nombre                              as tarea,
  a.analisis_id,
  a.cotizacion_partida_id,

  -- PLAN — lo que se dijo que iba a pasar
  a.cantidad_objetivo                    as plan_cantidad,
  a.hh_plan                              as plan_hh,
  a.dias_plan                            as plan_dias,
  a.dotacion_prevista                    as plan_dotacion,
  a.inicio_plan,
  a.fin_plan,

  -- PRESUPUESTO — de dónde salió ese plan, cuando la actividad está atada a una partida cotizada
  cp.hs_unitarias                        as presupuesto_hs_unitarias,
  cp.costo_unitario                      as presupuesto_costo_unitario,
  cp.cantidad                            as presupuesto_cantidad,

  -- REAL — lo que pasó
  eje.cantidad_real,
  eje.avance_medido,
  eje.ultima_ejecucion,
  eje.partes,
  eje.con_evidencia,
  ah.hh_real,
  ah.hh_improductivas,
  hh.personas_con_hh,
  hh.primera_hh,
  hh.ultima_hh,
  a.pct                                  as avance_declarado,
  a.inicio_real,
  a.fin_real,
  a.dias_real,
  dot.dotacion_real

from public.obra_actividad a
left join public.obra_canonica    o  on o.id  = a.obra_id
left join public.clientes         c  on c.id  = o.cliente_id
left join public.tarea_tipo       tt on tt.id = a.tarea_tipo_id
left join public.cotizacion_partida cp on cp.id = a.cotizacion_partida_id

-- La ejecución: cuánto se hizo. `sum` porque los partes son incrementales y `max` para el avance,
-- que es acumulado — sumarlo daría 250% en una actividad terminada.
left join lateral (
  select sum(e.cantidad)                                    as cantidad_real,
         max(e.avance_pct)                                  as avance_medido,
         max(e.fecha)                                       as ultima_ejecucion,
         count(*)::int                                      as partes,
         count(*) filter (where e.evidencia is not null)::int as con_evidencia
    from public.obra_ejecucion e
   where e.actividad_id = a.id
) eje on true

-- ═══ LAS HH NO SE VUELVEN A SUMAR ACÁ ═══
--
-- `public.actividad_horas` YA es la definición de las horas por actividad —productivas, improductivas
-- y extra— y es la que usa el capturador de rendimientos. Sumar `registros_hh` por mi cuenta daría un
-- segundo número para el mismo concepto: hoy coincidirían y algún día no, y nadie sabría cuál mirar.
-- De `registros_hh` sale sólo lo que `actividad_horas` no tiene: la ventana de fechas y cuánta gente
-- imputó horas.
left join public.actividad_horas ah on ah.actividad_id = a.id
left join lateral (
  select count(distinct h.persona_id)::int                    as personas_con_hh,
         min(coalesce(h.fecha, h.fecha_inicio_semana))        as primera_hh,
         max(coalesce(h.fecha, h.fecha_inicio_semana))        as ultima_hh
    from public.registros_hh h
   where h.actividad_id = a.id
) hh on true

-- La dotación real: personas asignadas a la actividad y todavía vigentes.
left join lateral (
  select count(distinct s.persona_id)::int as dotacion_real
    from public.obra_asignacion s
   where s.actividad_id = a.id
     and (s.hasta is null or s.hasta >= current_date)
) dot on true

where a.archivada is not true;

comment on view public.xsas_actividad is
  'El estado de cada actividad con su PLAN y su REAL al lado. No copia un dato: compone las fuentes canónicas. Lo que no está cargado sale NULL — nunca cero.';

-- ── LA OBRA, COMO LA VE XSAS ─────────────────────────────────────────────────────────────────

create or replace view public.xsas_obra
with (security_invoker = true) as
select
  o.id                                    as obra_id,
  o.nombre                                as obra,
  coalesce(c.nombre_comercial, c.razon_social, o.cliente_texto) as cliente,
  o.cliente_id,
  o.estado,
  o.etapa,
  o.jefe_obra,
  o.contrato_monto,
  o.contrato_moneda,
  o.monto_contratado,
  o.fecha_inicio_plan, o.fecha_fin_plan, o.fecha_inicio_real, o.fecha_fin_real,
  act.actividades,
  act.con_plan_hh,
  act.con_hh_real,
  act.plan_hh,
  act.hh_real,
  -- El avance de la obra pesado por las HH planificadas: una actividad de 300 hs no avanza lo mismo
  -- que una de 3. Sin HH plan en ninguna actividad sale NULL, que es la verdad.
  act.avance_ponderado_pct,
  cos.costo_real,
  cos.costo_real_puente,
  -- RESULTADO PARCIAL — con el costo que hoy se imputa por obra. No es el margen final y no se
  -- publica como tal: es contrato menos costo cargado, y falta todo lo que no se cargó.
  case when o.monto_contratado is not null and cos.costo_real is not null
       then o.monto_contratado - cos.costo_real end as contrato_menos_costo_cargado
from public.obra_canonica o
left join public.clientes c on c.id = o.cliente_id
left join lateral (
  select count(*)::int                                                     as actividades,
         count(*) filter (where v.plan_hh is not null)::int                as con_plan_hh,
         count(*) filter (where v.hh_real is not null)::int                as con_hh_real,
         sum(v.plan_hh)                                                    as plan_hh,
         sum(v.hh_real)                                                    as hh_real,
         case when sum(v.plan_hh) > 0
              then sum(v.plan_hh * coalesce(v.avance_medido, v.avance_declarado, 0)) / sum(v.plan_hh)
         end                                                               as avance_ponderado_pct
    from public.xsas_actividad v
   where v.obra_id = o.id
) act on true
-- ═══ EL COSTO REAL, Y EL PUENTE QUE NO EXISTE ═══
--
-- `costos_reales` está indexado por `public.obras.id` (uuid) y esta vista vive en `obra_canonica`
-- (slug de texto). Son los DOS REGISTROS DE OBRA del OS y **no hay una columna que los una**.
--
-- Se cruza por nombre exacto, y sólo cuando ese nombre identifica a UNA sola obra del otro registro.
-- Con dos candidatas —'Pisos' contra 'Pisos Industriales' y 'Pisos 120m2'— el costo sale NULL: elegir
-- una sería adivinar de qué obra es una plata que existe, y un costo puesto en la obra equivocada
-- ensucia dos márgenes en vez de uno. El hueco se ve en `costo_real_puente`, que dice por qué.
left join lateral (
  select case when e.cuantas = 1 then
           (select sum(r.monto) from public.costos_reales r where r.obra_id = e.unica) end as costo_real,
         case when e.cuantas = 1 then 'nombre exacto'
              when e.cuantas = 0 then 'sin obra equivalente en public.obras'
              else 'ambiguo: ' || e.cuantas::text || ' obras con ese nombre' end as costo_real_puente
    from (select count(*)::int as cuantas, min(x.id::text)::uuid as unica
            from public.obras x
           where lower(btrim(x.nombre)) = lower(btrim(o.nombre))) e
) cos on true;

comment on view public.xsas_obra is
  'La obra vista desde XSAS: cliente, contrato, avance ponderado por HH planificadas, HH y costo cargado. El resultado es PARCIAL y el nombre de la columna lo dice.';

grant select on public.xsas_actividad to authenticated, service_role;
grant select on public.xsas_obra      to authenticated, service_role;

