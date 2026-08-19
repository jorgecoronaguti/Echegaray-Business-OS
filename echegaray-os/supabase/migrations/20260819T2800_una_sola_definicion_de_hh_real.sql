-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- HH REAL TIENE UNA SOLA DEFINICIÓN — SE RETIRA LA SEGUNDA, QUE SEGUÍA VIVA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ QUÉ SE ENCONTRÓ (19/08/2026, revisión del módulo Personal/HH) ═══
--
-- El módulo declaró que HH real la publica UNA vista: `obra_actividad_hh`, sumando `registros_hh`
-- por actividad. Pero `obra_hh_resumen` —de julio, y nadie la retiró— seguía sumando las MISMAS
-- horas por otro camino: por `registros_hh.obra_id`, o sea por la tabla `obras` LEGACY, no por
-- `obra_canonica`. Dos definiciones del mismo hecho, con grano distinto.
--
-- Y no era una capa dormida: `detectar_exceso_hh_obra` la lee, y esa función la llama
-- `detectar_senales_criticas_transversales`, que corre TODOS LOS DÍAS a las 11 por `pg_cron`.
-- O sea que la alerta de "Exceso de HH" del backlog se calculaba con la definición retirada.
--
-- ═══ Y FABRICABA UN DATO ═══
--
-- Medido hoy sobre la vista:
--
--     obra_nombre   hh_estimada   hh_real_acumulada   desvio_porcentual
--     Pisos            4047,00              681,00              -83,17
--     Galpones        14441,00                   0             -100,00
--
-- «Galpones» no tiene ni una hora cargada. El `coalesce(..., 0)` de la vista convierte esa AUSENCIA
-- en un CERO, y el cero produce un desvío de -100% que se lee como "esta obra consume un 100% menos
-- de lo previsto" cuando lo cierto es "nadie cargó horas todavía". Es exactamente la regla que el
-- OS tiene escrita: un vacío no se presenta como cero.
--
-- Hoy no llegó a publicar una alerta falsa porque el gatillo es `desvio > 15` y estos desvíos son
-- negativos. Con la primera obra que cargue horas de verdad, deja de ser teórico.
--
-- ═══ QUÉ HACE ESTA MIGRACIÓN ═══
--
-- 1. `detectar_exceso_hh_obra` pasa a leer `obra_plan_vs_real`, que es la cara canónica: su `hh_real`
--    sale de `registros_hh` y su `desvio_hh_pct` YA es `null` cuando falta una de las dos puntas.
--    La alerta no cambia de criterio —sigue siendo "más de 15% por encima del plan"—, cambia de
--    fuente: la única.
-- 2. `obra_hh_resumen` se retira. Sin la función, no le queda un solo lector (verificado en el
--    repo y en `pg_proc`). Dejarla viva es la trampa de la capa fósil: la próxima consulta que la
--    encuentre va a creer que es la definición buena.
--
-- LAS 19 FILAS LEGACY NO SE TOCAN. Siguen con `obra_canonica_id`, `persona_id` y `actividad_id` en
-- null, y por eso no participan de ningún cálculo por obra, persona ni actividad. Su obra legacy es
-- «Pisos» y en el catálogo canónico hay DOS candidatas —«Pisos Industriales» y «Pisos 120m2»—, así
-- que no hay evidencia determinística para imputarlas: quedan pendientes, trazables por
-- `fuente_legacy = 'JORNALES'` y por sus notas, que ya explican fila por fila qué cubren.

create or replace function public.detectar_exceso_hh_obra()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Exceso de HH — ' || r.nombre,
    'Consumo de HH ' || r.desvio_hh_pct || '% por encima del plan (' || r.hh_real
      || 'h reales vs. ' || coalesce(r.hh_plan, r.hh_estimada) || 'h planificadas).',
    'obra_plan_vs_real (detección automática, pg_cron)',
    'calculado',
    'media',
    'alta',
    'medio',
    'Revisar la productividad de ' || r.nombre || ' — está consumiendo más HH de lo previsto.',
    'C',
    'abierto',
    'obra_canonica',
    r.obra_id
  from public.obra_plan_vs_real r
  -- SIN COALESCE A CERO, A PROPÓSITO: `desvio_hh_pct` ya viene `null` cuando falta el plan o falta
  -- la imputación, y una obra sin horas cargadas NO tiene que producir ninguna alerta.
  where r.desvio_hh_pct is not null
    and r.desvio_hh_pct > 15
    and not exists (
      select 1 from public.backlog_autonomo b
      where b.origen_tabla = 'obra_canonica' and b.origen_id = r.obra_id and b.tipo = 'riesgo'
        and b.titulo like 'Exceso de HH%' and b.estado in ('abierto', 'en_curso')
    );
end $$;

drop view if exists public.obra_hh_resumen;
