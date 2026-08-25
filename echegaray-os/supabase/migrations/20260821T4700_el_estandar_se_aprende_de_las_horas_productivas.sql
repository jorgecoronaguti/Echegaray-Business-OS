-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESTÁNDAR SE APRENDE DE LAS HORAS PRODUCTIVAS — y alguien tiene que apretar el botón
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El último eslabón del circuito estaba escrito y **desenchufado en cuatro lugares a la vez**:
--
--   1 · `capturar_rendimientos()` NO ESCRIBÍA `hs_unitarias` — que es exactamente la columna que
--       `rendimiento_recomendado` promedia. Bueno: no podía, porque es una columna GENERADA. Pero
--       la generaba como `hh_reales / cantidad`, o sea con el total de horas: una espera de camión
--       de cuatro horas entraba al estándar de la tarea y se quedaba ahí para siempre.
--
--   2 · `rendimiento_a_capturar` usaba `inicio_real` / `fin_real` de la actividad, y esas dos
--       columnas **NO LAS ESCRIBE NADIE**: 0 de 350. Cada captura salía sin ventana temporal, así
--       que no se podía saber en qué condiciones se midió ni con qué cuadrilla —la composición se
--       resolvía a `current_date`, que es la fecha en que corre el capturador, no la del trabajo.
--
--   3 · la cantidad salía de `cantidad_objetivo` aunque el método midiera cantidad y la EVIDENCIA
--       —los partes de `obra_ejecucion`— dijera otra cosa. Aprender contra el objetivo en vez de
--       contra lo ejecutado es aprender contra lo que quisimos, no contra lo que pasó.
--
--   4 · **nada la disparaba**. `pg_cron` tiene exactamente dos jobs (frescura 11:00, señales 11:10)
--       y no hay una sola llamada a `capturar_rendimientos` en `src/` ni en `orquestador/`. La
--       función existía, era idempotente, y no la corría nadie: el circuito no se cerraba nunca.
--
-- ═══ POR QUÉ LA REGLA VA EN LA COLUMNA GENERADA Y NO EN LA FUNCIÓN ═══
--
-- «El rendimiento se aprende de las horas PRODUCTIVAS» podría vivir en `capturar_rendimientos`.
-- Pero entonces valdría sólo para la captura automática, y cualquier otra vía de carga —una
-- importación, una fila puesta a mano desde el chat— metería el número con el criterio viejo sin
-- que nada lo notara. Va en la definición de la columna: no hay forma de escribir un rendimiento
-- que incluya horas improductivas, porque la columna no se escribe, se calcula.
--
-- Se captura solo porque es un HECHO. NO se aplica solo, nunca: cambiar el análisis lo decide una
-- persona (eso es la 4800).

-- ── 1 · el histórico guarda las improductivas y las causas ────────────────────────────────────
alter table public.rendimiento_historico add column if not exists hh_improductivas numeric not null default 0;
alter table public.rendimiento_historico add column if not exists causas jsonb;

alter table public.rendimiento_historico drop constraint if exists rendimiento_improductivas_coherentes;
alter table public.rendimiento_historico add constraint rendimiento_improductivas_coherentes
  check (hh_improductivas >= 0 and hh_improductivas <= hh_reales);

comment on column public.rendimiento_historico.hh_improductivas is
  'De las hh_reales, cuántas no produjeron. No se restan del total —el total es lo que se pagó— '
  'pero sí del rendimiento: hs_unitarias las descuenta.';
comment on column public.rendimiento_historico.causas is
  'Conteo por causa de lo que salió mal en esa actividad: {"espera_equipo": 3, "falta_material": 1}. '
  'Es lo que convierte «tardó 20 % más» en «tardó 20 % más y 12 de esas horas fueron esperando el '
  'camión» — la primera frase no sirve para cotizar mejor, la segunda sí.';

-- Las tres vistas que cuelgan de la columna generada se retiran para poder redefinirla y vuelven
-- abajo. Ninguna otra vista depende de ellas (verificado contra pg_depend en la base real).
drop view if exists public.rendimiento_recomendado;
drop view if exists public.rendimiento_contra_lo_cotizado;
drop view if exists public.rendimiento_a_capturar;

alter table public.rendimiento_historico drop column if exists hs_unitarias;
alter table public.rendimiento_historico add column hs_unitarias numeric
  generated always as (round((hh_reales - hh_improductivas) / nullif(cantidad, 0), 3)) stored;

comment on column public.rendimiento_historico.hs_unitarias is
  'El rendimiento observado sobre las HORAS PRODUCTIVAS, calculado y no tipeado. La regla vive acá y '
  'no en el capturador a propósito: en el capturador valdría sólo para la captura automática y '
  'cualquier otra vía de carga metería el criterio viejo sin que nada lo notara.';

-- ── 2 · qué está en condiciones de enseñar algo, con la evidencia delante ─────────────────────
create view public.rendimiento_a_capturar with (security_invoker = true) as
with base as (
  select c.actividad_id,
         a.obra_id,
         c.nombre,
         a.tarea_tipo_id,
         a.analisis_id,
         c.unidad,
         c.metodo_avance,
         c.cantidad_objetivo,
         -- Las horas salen de `actividad_horas`, que es LA definición de la partición (4500), y no
         -- de `obra_actividad_control`: esa vista la reescriben dos frentes y sus columnas dependen
         -- del orden en que se apliquen. Esta cuenta no puede depender de eso.
         ah.hh_real,
         ah.hh_improductivas,
         c.cuadrilla_id,
         c.avance_pct,
         c.archivada,
         c.tipo,
         ac.hs_unitarias                          as hs_unitarias_analisis,
         ev.desde                                 as fecha_desde,
         ev.hasta                                 as fecha_hasta,
         ev.cantidad                              as cantidad_ejecutada,
         -- LA CANTIDAD LA DICE LA EVIDENCIA cuando el método mide cantidad. Aprender contra el
         -- objetivo es aprender contra lo que quisimos, no contra lo que pasó.
         case when c.metodo_avance = 'cantidad' and coalesce(ev.cantidad, 0) > 0 then ev.cantidad
              else c.cantidad_objetivo end        as cantidad,
         -- La ventana temporal sale de los partes. `inicio_real`/`fin_real` de la actividad están
         -- en NULL en las 350 filas: no las escribe nadie, y sin ventana la composición de la
         -- cuadrilla se resolvía a la fecha en que corre el capturador.
         coalesce(c.inicio_real, ev.desde)        as inicio_real,
         coalesce(c.fin_real,    ev.hasta)        as fin_real
    from public.obra_actividad_control c
    join public.obra_actividad a on a.id = c.actividad_id
    join public.actividad_horas ah on ah.actividad_id = c.actividad_id
    left join public.analisis_costo ac on ac.analisis_id = a.analisis_id
    left join lateral (select min(x.fecha) as desde, max(x.fecha) as hasta, sum(x.cantidad) as cantidad
                         from public.obra_ejecucion x where x.actividad_id = c.actividad_id) ev on true
)
select b.actividad_id,
       b.obra_id,
       b.nombre,
       b.tarea_tipo_id,
       b.analisis_id,
       b.unidad,
       b.cantidad,
       b.hh_real,
       round((b.hh_real - b.hh_improductivas) / nullif(b.cantidad, 0), 3) as hs_unitarias_observado,
       b.hs_unitarias_analisis,
       b.cuadrilla_id,
       b.inicio_real,
       b.fin_real,
       b.hh_improductivas,
       (b.hh_real - b.hh_improductivas)          as hh_productivas,
       b.fecha_desde,
       b.fecha_hasta,
       b.cantidad_ejecutada,
       b.metodo_avance,
       (b.metodo_avance = 'cantidad' and coalesce(b.cantidad_ejecutada, 0) > 0) as cantidad_de_la_evidencia
  from base b
 where b.tipo <> 'resumen'
   and not b.archivada
   and b.tarea_tipo_id is not null
   and b.cantidad > 0
   and b.hh_real > 0
   and (b.hh_real - b.hh_improductivas) > 0
   and b.avance_pct >= 100
   and not exists (select 1 from public.rendimiento_historico r where r.actividad_id = b.actividad_id);

comment on view public.rendimiento_a_capturar is
  'Actividades terminadas que tienen lo que hace falta para enseñar algo: tarea tipo, cantidad, '
  'horas imputadas y avance completo. La cantidad y las fechas salen de la EVIDENCIA —los partes de '
  'obra_ejecucion— y no del objetivo ni de columnas que nadie escribe. Una actividad cuyas horas '
  'fueron TODAS improductivas no enseña un rendimiento de cero: no enseña nada, y por eso no entra.';

-- ── 3 · la captura, con la ventana y las causas ───────────────────────────────────────────────
create or replace function public.capturar_rendimientos(p_obra_id text default null)
returns int language plpgsql security invoker as $$
declare n int;
begin
  insert into public.rendimiento_historico
      (tarea_tipo_id, analisis_id, obra_id, actividad_id, unidad, cantidad, hh_reales,
       hh_improductivas, cuadrilla_id, composicion, causas, fecha_desde, fecha_hasta, fuente)
  select v.tarea_tipo_id, v.analisis_id, v.obra_id, v.actividad_id, v.unidad, v.cantidad, v.hh_real,
         v.hh_improductivas,
         v.cuadrilla_id,
         -- La composición de la cuadrilla A LA FECHA REAL DE FIN, no a la fecha en que corre el
         -- capturador: {"oficial": 2, "ayudante": 3}. Sin esto la muestra dice cuánto tardó pero no
         -- CON QUIÉN, y dos obras con el mismo rendimiento y distinta composición no significan lo
         -- mismo. Si la fecha de fin es desconocida quedan sólo los integrantes sin fecha de baja:
         -- es lo único que se puede afirmar, y es mejor que afirmar la de hoy.
         (select jsonb_object_agg(x.categoria, x.n)
            from (select coalesce(p2.categoria, 'sin categoría') as categoria, count(*) as n
                    from public.cuadrilla_integrante ci
                    join public.personas p2 on p2.id = ci.persona_id
                   where ci.cuadrilla_id = v.cuadrilla_id
                     and (ci.hasta is null or ci.hasta >= v.fin_real)
                   group by 1) x),
         -- Las causas, contadas por las dos puertas por las que entran.
         (select jsonb_object_agg(z.causa, z.n)
            from (select y.causa, sum(y.n)::int as n
                    from (select r.causa_desvio as causa, count(*)::int as n
                            from public.registros_hh r
                           where r.actividad_id = v.actividad_id
                             and r.improductiva and r.causa_desvio is not null
                           group by 1
                          union all
                          select e.causa_desvio, count(*)::int
                            from public.obra_ejecucion e
                           where e.actividad_id = v.actividad_id and e.causa_desvio is not null
                           group by 1) y
                   group by y.causa) z),
         v.fecha_desde, v.fecha_hasta, 'obra'
    from public.rendimiento_a_capturar v
   where p_obra_id is null or v.obra_id = p_obra_id
  on conflict (actividad_id) where actividad_id is not null do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.capturar_rendimientos(text) is
  'Registra lo que las actividades terminadas enseñaron: cantidad y ventana de la EVIDENCIA, horas '
  'productivas, composición de la cuadrilla a la fecha real de fin y conteo de causas. Es '
  'idempotente: correrlo dos veces no duplica ninguna muestra. NO toca ningún análisis — eso lo '
  'decide una persona, y crea una versión nueva.';

grant execute on function public.capturar_rendimientos(text) to authenticated;
grant select on public.rendimiento_a_capturar to authenticated;
grant select on public.rendimiento_a_capturar to service_role;

-- ── 4 · las dos vistas de lectura, de vuelta ──────────────────────────────────────────────────
create view public.rendimiento_recomendado with (security_invoker = true) as
select t.id                                          as tarea_tipo_id,
       t.codigo, t.nombre, t.unidad,
       ac.hs_unitarias                               as hs_analisis,
       count(r.id)::int                              as muestra,
       count(distinct r.obra_id)::int                as obras,
       round(avg(r.hs_unitarias), 3)                 as hs_observado_promedio,
       round(percentile_cont(0.5) within group (order by r.hs_unitarias)::numeric, 3) as hs_observado_mediana,
       round(stddev_samp(r.hs_unitarias), 3)         as dispersion,
       case
         when count(distinct r.obra_id) < 2 then null
         else round(percentile_cont(0.5) within group (order by r.hs_unitarias)::numeric, 3)
       end                                           as hs_recomendado,
       case
         when count(r.id) = 0                  then 'sin dato'
         when count(distinct r.obra_id) < 2    then 'muestra chica: es un dato, no una recomendación'
         else 'con evidencia de ' || count(distinct r.obra_id) || ' obras'
       end                                           as lectura,
       max(r.creado_en)                              as ultima_muestra,
       sum(r.hh_improductivas)                       as hh_improductivas_de_la_muestra,
       a.id                                          as analisis_vigente_id
  from public.tarea_tipo t
  left join public.analisis a  on a.tarea_tipo_id = t.id and a.vigente
  left join public.analisis_costo ac on ac.analisis_id = a.id
  left join public.rendimiento_historico r on r.tarea_tipo_id = t.id
 group by t.id, t.codigo, t.nombre, t.unidad, ac.hs_unitarias, a.id;

comment on view public.rendimiento_recomendado is
  'Teórico → real → recomendado. Con UNA sola obra medida NO hay recomendación: hay un dato, y se '
  'dice así. La recomendación no se aplica sola nunca — se acepta a mano y crea una versión nueva '
  'del análisis, con autor, fecha y muestra. El promedio y la mediana salen de rendimientos ya '
  'limpios de horas improductivas.';

create view public.rendimiento_contra_lo_cotizado with (security_invoker = true) as
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
  'es sagrado: es el punto donde el desvío deja de explicarse por la variabilidad normal de una obra.';

grant select on public.rendimiento_recomendado, public.rendimiento_contra_lo_cotizado to authenticated;
grant select on public.rendimiento_recomendado, public.rendimiento_contra_lo_cotizado to service_role;

-- ── 5 · el disparador que faltaba ─────────────────────────────────────────────────────────────
-- 11:20, detrás de los otros dos jobs de la casa (frescura 11:00, señales 11:10). pg_cron corre
-- como `postgres`, así que la RLS no lo frena, y la función es idempotente por el ON CONFLICT: si
-- un día corre dos veces no duplica una sola muestra.
--
-- Capturar es un HECHO y por eso se automatiza. Aplicar el aprendizaje al análisis NO se automatiza
-- nunca: un sistema que se recalibra solo con la última obra medida termina cotizando con el
-- rendimiento de la obra más rara que hizo.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'capturar_rendimientos_diario') then
    perform cron.unschedule('capturar_rendimientos_diario');
  end if;
end $$;

select cron.schedule(
  'capturar_rendimientos_diario',
  '20 11 * * *',
  $$select public.capturar_rendimientos();$$
);
