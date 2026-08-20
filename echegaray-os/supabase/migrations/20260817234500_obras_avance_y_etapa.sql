-- EL AVANCE SE MIDE SOBRE LO PLANIFICADO, Y LA ETAPA QUE NADIE DECLARÓ NO SE INVENTA.
--
-- ═══ POR QUÉ (17/08/2026, tras el rechazo del auditor de cierre) ═══
--
-- 1) EL AVANCE ESTABA MAL Y CONTRADECÍA AL RESTO DEL OS. `/obras` publicaba San Francisco al 33%
--    mientras `/chat` y `/control-obras`, leyendo el MISMO archivo del MISMO minuto, decían 85%.
--    Dos causas, las dos corregidas:
--      · el parser guardaba los títulos de sección como tareas al 0% (arreglado en
--        `obra-cronograma.mjs`: un título no tiene fechas NI duración, y el porcentaje no distingue);
--      · y esta vista promediaba TODA actividad que no fuera de resumen, incluidas las que todavía
--        no tienen fecha. Una actividad sin planificar no es una actividad al 0%: es una actividad
--        que no se puede medir. Contarla como cero hace que cargar el cronograma futuro BAJE el
--        avance de la obra, que es exactamente al revés de lo que significa.
--
-- 2) LA ETAPA DE CINCO OBRAS ERA EL DEFAULT DE LA COLUMNA, NO UN HECHO. `etapa ... default
--    'desarrollo'` le puso "Desarrollo" a todas las obras que el dueño no nombró — incluida
--    `galpones`, que está CERRADA. El portafolio imprimía "Desarrollo" al lado de una obra cerrada.
--    Presentar un default como estado del ciclo de vida es presentar una estimación como hecho.
--    Ahora la columna admite NULL, el default se retira, y sólo quedan declaradas las tres que el
--    dueño nombró más `galpones`, cuya etapa SÍ es deducible de su propio estado 'cerrada'.

-- ── 1) La etapa deja de fabricarse
alter table public.obra_canonica alter column etapa drop default;
alter table public.obra_canonica alter column etapa drop not null;

update public.obra_canonica set etapa = 'cierre'
 where estado = 'cerrada' and etapa = 'desarrollo';

-- Las que nunca fueron declaradas vuelven a "no se sabe". Las tres del alta del dueño
-- (quattropani=inicio, le-comedor=desarrollo, le-galpon-9=terminacion) no se tocan.
update public.obra_canonica set etapa = null
 where id in ('arcor', 'la-estrella', 'messina', 'san-francisco');

-- ── 2) El avance se mide sobre lo que tiene fecha
-- Se destruye y se rehace porque la vista suma una columna en el medio y Postgres no deja
-- reordenar con `replace`. El `grant` de abajo NO es opcional: `drop view` se lleva los privilegios,
-- y ya dejó el módulo entero en `permission denied` una vez.
drop view if exists public.obra_panel;

create view public.obra_panel as
select
  oc.id                as obra_id,
  oc.nombre,
  oc.cliente_texto,
  oc.estado,
  oc.tipo,
  oc.etapa,
  oc.jefe_obra,
  oc.orden,
  oc.monto_contratado,
  oc.fecha_inicio_plan,
  oc.fecha_fin_plan,
  oc.fecha_inicio_real,
  oc.fecha_fin_real,
  oc.drive_carpeta_id,
  ocr.costo_real,
  ocr.n_comprobantes,
  case when oc.monto_contratado > 0 and coalesce(ocr.costo_real, 0) > 0
       then round((oc.monto_contratado - ocr.costo_real) / oc.monto_contratado * 100, 1) end
    as margen_sobre_contratado_pct,
  -- SOBRE LO PLANIFICADO: ni los resúmenes (pesarían doble el avance de sus hijas) ni las
  -- actividades sin fecha (no están planificadas: no se pueden medir).
  (select round(avg(a.pct)) from public.obra_actividad a
    where a.obra_id = oc.id and a.tipo <> 'resumen'
      and a.inicio_plan is not null and a.pct is not null)                                  as avance_pct,
  (select count(*)::int from public.obra_actividad a
    where a.obra_id = oc.id and a.tipo <> 'resumen'
      and a.inicio_plan is not null)                                                        as n_actividades_medidas,
  (select count(*)::int from public.obra_actividad a where a.obra_id = oc.id)               as n_actividades,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada')                                      as restricciones_abiertas,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada'
      and r.fecha_compromiso is not null and r.fecha_compromiso < current_date)              as restricciones_vencidas
from public.obra_canonica oc
left join public.obra_costo_real ocr on ocr.obra_id = oc.id;

-- `create or replace` conserva los grants, pero se reponen por si alguien vuelve a recrearla con
-- drop: perderlos deja el módulo entero en `permission denied`, y eso ya pasó una vez.
grant select on public.obra_panel to authenticated;
