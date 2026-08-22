-- ═══ EL DETECTOR DE EXCESO DE HH VUELVE A CORRER (22/08/2026) ═══
--
-- El job `detectar_senales_criticas_diario` (pg_cron, 11:10) falla desde el 20/08:
--   ERROR: operator does not exist: uuid = text
--   CONTEXT: PL/pgSQL function detectar_exceso_hh_obra()
-- y con él se cayó la ronda ENTERA de señales críticas — dos días sin ninguna alerta automática,
-- en silencio. Lo encontró el auditor de cierre en cron.job_run_details.
--
-- La causa NO era un cast que faltaba: `backlog_autonomo.origen_id` es uuid y el id de
-- `obra_canonica` es un SLUG de texto («san-francisco») — esa referencia no puede existir por esa
-- columna, con ningún cast. La función nació rota de diseño: nunca corrió ni una vez.
-- El arreglo honesto: la obra viaja en el título (que ya la nombra) y en la evidencia;
-- `origen_id` queda NULL a propósito, y el anti-duplicado dedupe por el título exacto — que para
-- este detector ES la identidad de la alerta.

create or replace function public.detectar_exceso_hh_obra()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    null
  from public.obra_plan_vs_real r
  -- SIN COALESCE A CERO, A PROPÓSITO: `desvio_hh_pct` ya viene `null` cuando falta el plan o falta
  -- la imputación, y una obra sin horas cargadas NO tiene que producir ninguna alerta.
  where r.desvio_hh_pct is not null
    and r.desvio_hh_pct > 15
    and not exists (
      select 1 from public.backlog_autonomo b
      where b.tipo = 'riesgo' and b.titulo = 'Exceso de HH — ' || r.nombre
        and b.estado in ('abierto', 'en_curso')
    );
end $function$;
