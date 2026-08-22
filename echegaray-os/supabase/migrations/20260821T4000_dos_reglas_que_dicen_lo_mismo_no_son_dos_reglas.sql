-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOS REGLAS QUE DICEN LO MISMO NO SON DOS REGLAS — higiene del DDL antes de construir encima
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Nada de esto cambia un número publicado hoy. Se hace ahora porque las migraciones que siguen
-- agregan tablas, funciones y vistas sobre estas mismas estructuras, y un duplicado que hoy es
-- ruido mañana es una regla que se aplica dos veces con criterios distintos.
--
-- Lo medido en la base real el 21/08:
--
--   1 · `obra_actividad.actividad_padre_id` tiene DOS claves foráneas al mismo destino:
--       `obra_actividad_actividad_padre_id_fkey` (ON DELETE CASCADE, de la tabla original) y
--       `obra_actividad_padre_fk` (ON DELETE RESTRICT, de 20260821T2000). Postgres evalúa las dos y
--       **gana la más restrictiva**: borrar un contenedor con hijas ya falla. La CASCADE es letra
--       muerta que promete lo contrario de lo que pasa — y si mañana alguien retira la RESTRICT
--       creyendo que hay una sola, borrar un rubro se lleva la obra entera en silencio.
--
--   2 · `obra_dependencia` tiene el mismo CHECK dos veces (`obra_dependencia_check` anónimo y
--       `obra_dependencia_no_es_ella_misma`, ambos `origen_id <> destino_id`) y la misma unicidad
--       dos veces (la constraint `obra_dependencia_origen_id_destino_id_key` y el índice
--       `obra_dependencia_unica`). Se conserva **la que tiene nombre declarado** en el CHECK y **la
--       que es constraint** en la unicidad: una constraint la ve `pg_constraint` y la puede nombrar
--       un mensaje de error; un índice suelto, no.
--
--   3 · `obra_actividad_por_padre` y `obra_actividad_padre_idx` son el MISMO índice parcial. Dos
--       índices idénticos cuestan el doble en cada escritura y no aceleran ninguna lectura.
--
--   4 · `cotizaciones.estado` tiene `DEFAULT 'emitida'` y su propio CHECK sólo admite
--       ('borrador','enviada','adjudicada','perdida','anulada'). El default VIOLA el CHECK: todo
--       INSERT que no nombre el estado falla. No se notó porque la tabla tiene 0 filas y las dos
--       vías vivas (la acción de la web y `nueva_version_de_presupuesto`) escriben 'borrador'
--       explícito. El default correcto es el mismo: un presupuesto nace en borrador.
--
--   5 · `obra_avance` pondera por HH con filtros ASIMÉTRICOS: el numerador suma
--       `avance_pct * hh_plan` sin exigir `avance_pct is not null` y el denominador sí lo exige.
--       Hoy coinciden de casualidad —una actividad con `hh_plan` y sin `avance_pct` aporta NULL al
--       numerador, que `sum()` ignora— pero es coincidencia, no diseño: si mañana el numerador
--       usara `coalesce(avance_pct, 0)` el avance de la obra bajaría sin que nadie tocara la obra.
--       Se escriben iguales los dos lados.

-- ── 1 · una sola clave foránea al padre, y es la que manda ────────────────────────────────────
alter table public.obra_actividad drop constraint if exists obra_actividad_actividad_padre_id_fkey;

comment on constraint obra_actividad_padre_fk on public.obra_actividad is
  'ON DELETE RESTRICT a propósito: borrar un contenedor con hijas TIENE que fallar. Convivía con '
  'una FK duplicada en CASCADE que no hacía nada (la restrictiva gana) pero prometía lo contrario.';

-- ── 2 · un CHECK y una unicidad, no dos de cada ───────────────────────────────────────────────
alter table public.obra_dependencia drop constraint if exists obra_dependencia_check;
drop index if exists public.obra_dependencia_unica;

-- ── 3 · un solo índice por padre ──────────────────────────────────────────────────────────────
drop index if exists public.obra_actividad_por_padre;

-- ── 4 · un presupuesto nace en borrador ───────────────────────────────────────────────────────
alter table public.cotizaciones alter column estado set default 'borrador';

comment on column public.cotizaciones.estado is
  'borrador → enviada → adjudicada | perdida | anulada. El default era ''emitida'', que su propio '
  'CHECK no admite: cualquier INSERT sin estado explícito fallaba. Nace en borrador, que es lo que '
  'ya escribían las dos vías vivas.';

-- ── 5 · el ponderado se filtra igual arriba y abajo ───────────────────────────────────────────
create or replace view public.obra_avance with (security_invoker = true) as
with medidas as (
  select c.obra_id,
         c.actividad_id,
         c.tipo,
         c.avance_pct,
         c.inicio_plan,
         c.fin_plan,
         a.hh_plan,
         a.sincronizado_en,
         c.fuente_pestana,
         -- ejecutable que no cuelga de otra ejecutable
         (c.tipo <> 'resumen' and not exists (
            select 1 from public.obra_actividad p
             where p.id = c.actividad_padre_id and p.tipo <> 'resumen')) as cuenta
    from public.obra_actividad_control c
    join public.obra_actividad a on a.id = c.actividad_id
   where not c.archivada
)
select oc.id                                                                   as obra_id,
       oc.nombre                                                               as obra,
       count(*) filter (where m.cuenta)                                        as n_actividades,
       count(*) filter (where m.cuenta and m.inicio_plan is not null)           as n_medidas,
       count(*) filter (where m.cuenta and m.inicio_plan is null)               as n_sin_planificar,
       count(*) filter (where m.tipo = 'resumen')                               as n_secciones,
       count(*) filter (where m.cuenta and m.inicio_plan is not null and m.avance_pct >= 100) as n_completas,
       case
         when sum(m.hh_plan) filter (where m.cuenta and m.inicio_plan is not null and m.avance_pct is not null) > 0
           -- MISMO filtro que el denominador, palabra por palabra. Antes al numerador le faltaba
           -- `avance_pct is not null` y coincidía sólo porque NULL·hh_plan da NULL y sum() lo saltea.
           then round(sum(m.avance_pct * m.hh_plan) filter (where m.cuenta and m.inicio_plan is not null and m.avance_pct is not null)
                      / sum(m.hh_plan) filter (where m.cuenta and m.inicio_plan is not null and m.avance_pct is not null))::integer
         else round(avg(m.avance_pct) filter (where m.cuenta and m.inicio_plan is not null))::integer
       end                                                                      as avance_pct,
       min(m.inicio_plan) filter (where m.cuenta)                               as desde,
       max(m.fin_plan) filter (where m.cuenta)                                  as hasta,
       max(m.sincronizado_en)                                                   as sincronizado_en,
       max(m.fuente_pestana)                                                    as fuente_pestana,
       case
         when count(*) filter (where m.cuenta and m.inicio_plan is not null) = 0 then 'sin actividades medidas'
         when sum(m.hh_plan) filter (where m.cuenta and m.inicio_plan is not null and m.avance_pct is not null) > 0
           then 'ponderado por HH'
         else 'promedio simple: las actividades no tienen HH planificadas'
       end                                                                      as base_del_avance
  from public.obra_canonica oc
  left join medidas m on m.obra_id = oc.id
 group by oc.id, oc.nombre;

comment on view public.obra_avance is
  'El avance de la obra sobre sus actividades MEDIDAS: ejecutables que no son subtarea de otra '
  'ejecutable. Pondera por HH cuando las hay y promedia cuando no, y dice cuál hizo en '
  'base_del_avance. Numerador y denominador del ponderado llevan EL MISMO filtro: que coincidieran '
  'era una casualidad de cómo sum() trata el NULL, no una decisión.';
