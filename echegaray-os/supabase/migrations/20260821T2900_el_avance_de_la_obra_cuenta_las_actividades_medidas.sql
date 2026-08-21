-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL AVANCE DE LA OBRA CUENTA LAS ACTIVIDADES MEDIDAS — NO LAS QUE NO TIENEN PADRE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_avance` filtraba con `WHERE actividad_padre_id IS NULL`. La intención era buena y está
-- escrita en 20260819T4800: **las subtareas no cuentan**, porque una actividad partida en seis
-- tareas pesaría siete veces en el promedio. Con `actividad_padre_id` en NULL en las 350 filas, ese
-- filtro no excluía nada y la cuenta salía bien por casualidad.
--
-- Al rellenar la jerarquía (20260821T2000) el filtro empezó a excluir 161 actividades REALES, que
-- ahora tienen padre porque cuelgan de su sección. El efecto, medido contra la base:
--
--     Messina                       publicaba 100%   sobre 1 actividad     → debía ser  67% sobre 31
--     Galpones, Mampostería…        publicaba  —     sobre 0 actividades   → debía ser  47% sobre 85
--     Oficina y Fábrica de Palillos publicaba  —     sobre 0 actividades   → debía ser  94% sobre 35
--     Salón Comercial               publicaba  —     sobre 0 actividades   → debía ser  86% sobre 7
--
-- Tres obras dejaron de informar avance y una informaba TERMINADA estando en dos tercios. No lo
-- gritó nada: la vista devolvía filas, con números, sin un solo error.
--
-- La regla correcta es la que la intención original quería decir: **cuenta la actividad ejecutable
-- que no es subtarea de otra ejecutable.** Colgar de un contenedor no descalifica a nadie —para eso
-- está el contenedor—; colgar de una actividad sí, porque ahí la madre ya se cuenta.
--
-- ═══ Y EL PROMEDIO SE PONDERA POR HH CUANDO SE PUEDE ═══
--
-- Promediar porcentajes trata igual a una actividad de 400 HH y a una de 4. El contrato pide
-- ponderar por HH. Hoy `hh_plan` está en NULL en las 350 actividades —su insumo llega por la
-- conversión desde el análisis— así que ponderar daría NULL para todo. Entonces: se pondera cuando
-- hay HH, se promedia cuando no, y **la vista dice cuál de las dos hizo** en `base_del_avance`. Un
-- número que no dice cómo se calculó obliga a confiar; uno que lo dice, no.

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
           then round(sum(m.avance_pct * m.hh_plan) filter (where m.cuenta and m.inicio_plan is not null)
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
  'ejecutable. Colgar de un contenedor no descalifica; colgar de una actividad sí, porque ahí la '
  'madre ya se cuenta. Pondera por HH cuando las hay y promedia cuando no, y dice cuál hizo en '
  'base_del_avance — un número que no declara cómo se calculó obliga a confiar en él.';

grant select on public.obra_avance to authenticated;
grant select on public.obra_avance to service_role;
