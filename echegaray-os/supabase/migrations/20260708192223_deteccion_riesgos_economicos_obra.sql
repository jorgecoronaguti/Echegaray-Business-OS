-- Ciclo "Ficha Integral de Obra" (Sección 9): las alertas de margen/HH ya existen en
-- TypeScript (features/dashboard/types: mapControlEconomico, mapHH) pero solo se ven
-- si alguien abre el Dashboard o la Ficha de obra -- no generan backlog por sí solas,
-- a diferencia de acciones vencidas/fuentes atrasadas (única rutina pg_cron real hasta
-- ahora). Esta migración cierra ese gap para las dos señales más críticas de una obra
-- en ejecución: deterioro de margen y exceso de HH -- ambas ya calculadas sobre vistas
-- SQL existentes (obra_resumen_economico, obra_hh_resumen), sin fórmulas nuevas.
--
-- Los umbrales son los MISMOS ya usados en TypeScript (UMBRAL_DESVIO_ATENCION/CRITICO
-- en control-economico/types, UMBRAL_DESVIO_HH_PORCENTAJE en hh-productividad/types) --
-- duplicados acá porque pg_cron no puede ejecutar TS. Si esos umbrales cambian, hay que
-- actualizar ambos lados (gap real, no se resuelve con una fuente única todavía).
create or replace function detectar_deterioro_margen_obra()
returns void
language sql
set search_path = public
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Margen ' || (case when r.desvio_porcentual > 15 then 'crítico' else 'en atención' end) || ' — ' || r.obra_nombre,
    'Costo real desvía ' || r.desvio_porcentual || '% del presupuesto aprobado (margen actualizado $'
      || r.margen_actualizado || ', costo real acumulado $' || r.costo_real_acumulado || ').',
    'obra_resumen_economico (detección automática, pg_cron)',
    'calculado',
    case when r.desvio_porcentual > 15 then 'alta' else 'media' end,
    case when r.desvio_porcentual > 15 then 'alta' else 'media' end,
    'medio',
    'Abrir la ficha de ' || r.obra_nombre || ' y revisar qué costos explican el desvío antes de que siga creciendo.',
    'C',
    'abierto',
    'obras',
    r.obra_id
  from obra_resumen_economico r
  where r.presupuesto_id is not null
    and r.desvio_porcentual is not null
    and r.desvio_porcentual > 5
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'obras' and b.origen_id = r.obra_id and b.tipo = 'riesgo'
        and b.titulo like 'Margen%' and b.estado in ('abierto', 'en_curso')
    );
$$;

create or replace function detectar_exceso_hh_obra()
returns void
language sql
set search_path = public
as $$
  insert into backlog_autonomo (
    tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo,
    recomendacion, nivel_autonomia_permitido, estado, origen_tabla, origen_id
  )
  select
    'riesgo',
    'Exceso de HH — ' || r.obra_nombre,
    'Consumo de HH ' || r.desvio_porcentual || '% por encima de lo estimado (' || r.hh_real_acumulada
      || 'h reales vs. ' || r.hh_estimada || 'h estimadas).',
    'obra_hh_resumen (detección automática, pg_cron)',
    'calculado',
    'media',
    'alta',
    'medio',
    'Revisar la productividad de ' || r.obra_nombre || ' — está consumiendo más HH de lo previsto.',
    'C',
    'abierto',
    'obras',
    r.obra_id
  from obra_hh_resumen r
  where r.hh_estimada is not null
    and r.desvio_porcentual is not null
    and r.desvio_porcentual > 15
    and not exists (
      select 1 from backlog_autonomo b
      where b.origen_tabla = 'obras' and b.origen_id = r.obra_id and b.tipo = 'riesgo'
        and b.titulo like 'Exceso de HH%' and b.estado in ('abierto', 'en_curso')
    );
$$;

create or replace function detectar_senales_criticas_transversales()
returns void
language sql
set search_path = public
as $$
  select detectar_acciones_vencidas();
  select detectar_fuentes_criticas_atrasadas();
  select detectar_deterioro_margen_obra();
  select detectar_exceso_hh_obra();
$$;
