-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL AVANCE DE LA OBRA PASA A SALIR DEL AVANCE CALCULADO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_avance` es LA definición del avance para todo el OS: la leen el portafolio, el chat,
-- Plan vs Real y el control de obras. Promediaba `obra_actividad.pct` — el porcentaje que alguien
-- escribe a mano o que traía el Sheet.
--
-- Desde que existe `obra_actividad_control`, ese ya no es el avance de una actividad: 140 de ellas
-- lo calculan desde sus partes diarios y las que se miden en unidades lo calculan desde la
-- producción. Dejar la vista promediando `pct` la convertía en la SEGUNDA definición: la ficha de la
-- obra mostrando 53% calculado desde 95 de 180 m² y el portafolio mostrando el 40% que alguien
-- tipeó en marzo, los dos «bien» según su propia cuenta.
--
-- Se repunta a la vista de control. Todo lo demás de `obra_avance` queda igual, columna por columna,
-- para no romper a sus cuatro consumidores.
--
-- SIGUE SIENDO UN PROMEDIO SIMPLE de las actividades con fecha, no ponderado por HH: ponderar
-- cambiaría el número que la empresa viene leyendo hace meses, y esa es una decisión del dueño, no
-- un efecto colateral de esta migración.

-- `security_invoker` VA EXPLÍCITO: `create or replace view` NO conserva las opciones de la vista
-- anterior. Sin esta línea, `obra_avance` volvía a correr con los permisos de su dueño y saltearse
-- el RLS de `obra_actividad` — un jefe de obra habría visto el avance de las ocho obras. Lo detectó
-- `orquestador/lib/vistas-security-invoker.test.mjs`, que existe exactamente para esto.
create or replace view public.obra_avance with (security_invoker = true) as
 select oc.id as obra_id,
    oc.nombre as obra,
    count(a.*) filter (where a.tipo <> 'resumen') as n_actividades,
    count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null) as n_medidas,
    count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is null) as n_sin_planificar,
    count(a.*) filter (where a.tipo = 'resumen') as n_secciones,
    count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null and a.avance_pct >= 100) as n_completas,
    round(avg(a.avance_pct) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null))::integer as avance_pct,
    min(a.inicio_plan) filter (where a.tipo <> 'resumen') as desde,
    max(a.fin_plan) filter (where a.tipo <> 'resumen') as hasta,
    max(a.sincronizado_en) as sincronizado_en,
    max(a.fuente_pestana) as fuente_pestana
   from public.obra_canonica oc
     left join (
       select c.*, t.sincronizado_en
         from public.obra_actividad_control c
         join public.obra_actividad t on t.id = c.actividad_id
     ) a on a.obra_id = oc.id
  group by oc.id, oc.nombre;
