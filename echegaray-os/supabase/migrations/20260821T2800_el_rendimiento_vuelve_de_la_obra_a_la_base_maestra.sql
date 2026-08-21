-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL RENDIMIENTO VUELVE DE LA OBRA A LA BASE MAESTRA — y no se aplica solo
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Es el último eslabón del circuito y el que lo convierte en circuito:
--
--     BASE MAESTRA → PRESUPUESTO → CONVERSIÓN → PLAN → EJECUCIÓN → REAL → APRENDIZAJE → BASE MAESTRA
--
-- Cuando una actividad termina, se sabe algo que antes era una estimación: cuántas horas costó de
-- verdad hacer esa cantidad de esa tarea, con esa cuadrilla. El análisis decía 2,4 HH/unidad y la
-- obra dijo 2,9. Ese número no sirve sólo para explicar el desvío de esta obra: sirve para que la
-- próxima cotización no repita el error.
--
-- ═══ SE CAPTURA SOLO. NO SE APLICA SOLO. NUNCA. ═══
--
-- La captura es automática porque es un HECHO: la actividad terminó, las horas están imputadas, la
-- cantidad está declarada. Que ese hecho quede registrado no requiere el juicio de nadie.
--
-- Cambiar el análisis SÍ lo requiere, y por eso no pasa acá. `rendimiento_recomendado` propone, una
-- persona acepta, y aceptar crea una VERSIÓN NUEVA del análisis con autor, fecha y muestra. Un
-- sistema que se recalibra solo con la última obra medida termina cotizando con el rendimiento de
-- la obra más rara que hizo.
--
-- ═══ UNA OBRA NO ES UNA MUESTRA ═══
--
-- Con una sola obra medida `rendimiento_recomendado` devuelve `hs_recomendado` en NULL y dice
-- «muestra chica: es un dato, no una recomendación». Está a propósito: un caso no es una
-- distribución, y presentar el primero como recomendación es la forma más rápida de meter un
-- outlier en la base maestra para siempre.

-- Una actividad se captura una sola vez. Sin esto, cada corrida del capturador agregaría otra fila
-- de la misma actividad terminada y la «muestra» crecería sola sin que se mida nada nuevo.
create unique index if not exists rendimiento_historico_una_por_actividad
  on public.rendimiento_historico (actividad_id) where actividad_id is not null;

-- ── qué está en condiciones de enseñar algo ───────────────────────────────────────────────────
create or replace view public.rendimiento_a_capturar with (security_invoker = true) as
select c.actividad_id,
       a.obra_id,
       c.nombre,
       a.tarea_tipo_id,
       a.analisis_id,
       c.unidad,
       c.cantidad_objetivo                                as cantidad,
       c.hh_real,
       round(c.hh_real / nullif(c.cantidad_objetivo, 0), 3) as hs_unitarias_observado,
       ac.hs_unitarias                                    as hs_unitarias_analisis,
       c.cuadrilla_id,
       c.inicio_real,
       c.fin_real
  from public.obra_actividad_control c
  join public.obra_actividad a on a.id = c.actividad_id
  left join public.analisis_costo ac on ac.analisis_id = a.analisis_id
 where c.tipo <> 'resumen'
   and not c.archivada
   and a.tarea_tipo_id is not null
   and c.cantidad_objetivo > 0
   and c.hh_real > 0
   and c.avance_pct >= 100
   and not exists (select 1 from public.rendimiento_historico r where r.actividad_id = c.actividad_id);

comment on view public.rendimiento_a_capturar is
  'Actividades terminadas que tienen las cuatro cosas que hacen falta para aprender algo: tarea '
  'tipo, cantidad declarada, horas imputadas y avance completo. Si falta una, la actividad no '
  'enseña nada y no se fuerza: una cantidad en NULL dividiría por cero, y un avance al 100% sin '
  'horas imputadas significa que las horas están en otro lado, no que el trabajo fue gratis.';

-- ── la captura ────────────────────────────────────────────────────────────────────────────────
create or replace function public.capturar_rendimientos(p_obra_id text default null)
returns int language plpgsql security invoker as $$
declare n int;
begin
  insert into public.rendimiento_historico
      (tarea_tipo_id, analisis_id, obra_id, actividad_id, unidad, cantidad, hh_reales,
       cuadrilla_id, composicion, fecha_desde, fecha_hasta, fuente)
  select v.tarea_tipo_id, v.analisis_id, v.obra_id, v.actividad_id, v.unidad, v.cantidad, v.hh_real,
         v.cuadrilla_id,
         -- La composición de la cuadrilla el día que terminó: {"oficial": 2, "ayudante": 3}. Sin
         -- esto la muestra dice cuánto tardó pero no CON QUIÉN, y dos obras con el mismo
         -- rendimiento y distinta composición no significan lo mismo.
         (select jsonb_object_agg(x.categoria, x.n)
            from (select coalesce(p2.categoria, 'sin categoría') as categoria, count(*) as n
                    from public.cuadrilla_integrante ci
                    join public.personas p2 on p2.id = ci.persona_id
                   where ci.cuadrilla_id = v.cuadrilla_id
                     and (ci.hasta is null or ci.hasta >= coalesce(v.fin_real, current_date))
                   group by 1) x),
         v.inicio_real, v.fin_real, 'obra'
    from public.rendimiento_a_capturar v
   where p_obra_id is null or v.obra_id = p_obra_id
  on conflict (actividad_id) where actividad_id is not null do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.capturar_rendimientos(text) is
  'Registra lo que las actividades terminadas enseñaron. Es idempotente: correrlo dos veces no '
  'duplica ninguna muestra. NO toca ningún análisis — eso lo decide una persona en la pantalla de '
  'la base maestra, y crea una versión nueva.';

grant execute on function public.capturar_rendimientos(text) to authenticated;
grant select on public.rendimiento_a_capturar to authenticated;
grant select on public.rendimiento_a_capturar to service_role;

-- ── el desvío, dicho al lado del número ───────────────────────────────────────────────────────
create or replace view public.rendimiento_contra_lo_cotizado with (security_invoker = true) as
select r.tarea_tipo_id,
       t.codigo, t.nombre, t.unidad,
       count(*)::int                                 as muestras,
       count(distinct r.obra_id)::int                as obras,
       round(avg(r.hs_unitarias), 3)                 as hs_real_promedio,
       ac.hs_unitarias                               as hs_cotizado,
       case when ac.hs_unitarias > 0
            then round((avg(r.hs_unitarias) - ac.hs_unitarias) / ac.hs_unitarias * 100, 1) end as desvio_pct,
       case
         when ac.hs_unitarias is null                              then 'el análisis no publica rendimiento'
         when avg(r.hs_unitarias) > ac.hs_unitarias * 1.10          then 'cotizamos corto'
         when avg(r.hs_unitarias) < ac.hs_unitarias * 0.90          then 'cotizamos largo'
         else 'el análisis acierta'
       end                                           as lectura
  from public.rendimiento_historico r
  join public.tarea_tipo t on t.id = r.tarea_tipo_id
  left join public.analisis a on a.tarea_tipo_id = t.id and a.vigente
  left join public.analisis_costo ac on ac.analisis_id = a.id
 group by r.tarea_tipo_id, t.codigo, t.nombre, t.unidad, ac.hs_unitarias;

comment on view public.rendimiento_contra_lo_cotizado is
  '«Cotizamos corto» es la frase que tiene que llegar a la próxima cotización. El umbral del 10% no '
  'es sagrado: es el punto donde el desvío deja de explicarse por la variabilidad normal de una '
  'obra. Que la lectura viva acá y no en cada pantalla es lo que impide que dos pantallas lean el '
  'mismo desvío de dos maneras.';

grant select on public.rendimiento_contra_lo_cotizado to authenticated;
grant select on public.rendimiento_contra_lo_cotizado to service_role;
