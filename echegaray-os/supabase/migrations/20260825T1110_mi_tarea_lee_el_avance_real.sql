-- EL EMPLEADO VE EL MISMO AVANCE QUE LA OBRA — una tarea, un porcentaje (25/08/2026).
--
-- ═══ QUÉ SE ROMPIÓ (auditoría del móvil con datos, hallazgo 2) ═══
--
-- `mi_tarea` publicaba `obra_actividad.pct`. Desde el 24/08 (`20260824T1400`) ese campo NO es el
-- avance: es la SEMILLA declarada al crear la actividad, y el avance canónico lo calcula
-- `actividad_avance` a partir de los hechos —producción, partes, pasos—. Resultado medido sobre el
-- fixture `[PRUEBA E2E]`: el jefe cargó +10 m² desde J06, `obra_actividad_control.avance_pct` quedó
-- en 8,3 % y `obra_actividad.pct` siguió en NULL, así que M02, M03 y M04 le decían al empleado
-- «sin medición: falta el avance cargado» sobre una tarea con el avance cargado esa misma mañana.
--
-- La empresa tenía dos verdades sobre la misma columna según por qué pantalla se entrara. La
-- corrección es la de siempre en este repo: NO se agrega un escritor que copie el número a
-- `obra_actividad.pct` —dos escritores sobre una columna espejo es la receta de la deriva—, se
-- cambia la vista para que lea la ÚNICA definición de avance que ya existe.
--
-- ═══ POR QUÉ `actividad_avance` Y NO `obra_actividad_control` ═══
--
-- Las dos calculan el mismo número (la segunda lee la primera), pero `obra_actividad_control` es
-- `security_invoker = true`: consultarla desde adentro de una vista `definer` haría que las tablas
-- de abajo se chequeen con los permisos de quien pregunta, y el empleado de campo perdería filas
-- que su propia vista sí le permite ver. `actividad_avance` corre con los permisos del dueño, igual
-- que `mi_tarea`, así que el portero de la vista sigue siendo el único filtro que decide.
--
-- ═══ QUÉ CAMBIA PARA EL ROL CAMPO ═══
--
--   · `pct` deja de ser el número declarado y pasa a ser el avance real. Mismo nombre y mismo tipo
--     (numeric) a propósito: `create or replace view` no permite cambiarlos, y la pantalla no tiene
--     que aprender una columna nueva para dejar de mentir.
--   · Medido sobre las 279 actividades vivas de la base: 28 pasan de «sin número» a tener uno,
--     7 cambian de número (5 suben al 100 % porque los hechos ya lo dicen, 2 se corrigen por
--     redondeo: 38 → 37,5 y 93 → 92,9) y NINGUNA pierde el número que tenía.
--   · Una tarea medida por cantidad, con objetivo y sin producción cargada, ahora publica 0 % en vez
--     de NULL. Es un hecho («no se ejecutó nada»), no un «no se sabe», y es lo que ya muestra Obras.
--   · Cuatro columnas NUEVAS al final —`origen_avance`, `cantidad_ejecutada`, `n_pasos`,
--     `n_pasos_hechos`—: con qué se midió, cuánto se lleva ejecutado en la unidad de la tarea, y
--     cuántos pasos hay y cuántos están hechos (M04 por pasos no tenía de dónde sacarlos).
--   · No entra NINGÚN dato de dinero: `actividad_avance` no publica costo ni certificación.
--
-- ═══ EL PORTERO NO SE TOCA ═══
--
-- Mismo `where` palabra por palabra —responsable, cuadrilla vigente o asignación vigente, con
-- `mi_persona_id()` no nulo—, mismo `security_invoker = false`. El join nuevo es un LEFT JOIN por
-- `actividad_id`: no agrega ni saca una sola fila. Y el `grant` se vuelve a escribir porque una
-- columna nueva de una vista reemplazada nace sin permiso si el grant fuera por columna: escribirlo
-- cuesta una línea y evita el «se lee VACÍA» que ya pasó en este repo.

create or replace view public.mi_tarea
with (security_invoker = false) as
  select distinct
    t.id,
    t.obra_id,
    o.nombre        as obra,
    t.codigo,
    t.nombre,
    t.seccion,
    t.estado,
    -- EL CAMBIO. Antes: `t.pct`, la semilla que ningún camino de escritura actualiza.
    av.avance_pct   as pct,
    t.inicio_plan,
    t.fin_plan,
    t.unidad,
    t.cantidad_objetivo,
    t.metodo_avance,
    t.comentario,
    (select count(*) from public.obra_restriccion r
      where r.actividad_id = t.id and r.estado = 'abierta')::int as impedimentos,
    av.origen_avance,
    av.cantidad_ejecutada,
    av.n_pasos,
    av.n_pasos_hechos
  from public.obra_actividad t
  join public.obra_canonica o on o.id = t.obra_id
  left join public.actividad_avance av on av.actividad_id = t.id
  where t.archivada is not true
    and public.mi_persona_id() is not null
    and (
      t.responsable_id = public.mi_persona_id()
      or exists (
        select 1 from public.cuadrilla_integrante ci
         where ci.persona_id = public.mi_persona_id() and ci.hasta is null
           and ci.cuadrilla_id = t.cuadrilla_id
      )
      or exists (
        select 1 from public.obra_asignacion a
         where a.persona_id = public.mi_persona_id()
           and a.actividad_id = t.id
           and public.asignacion_vigente(a.desde, a.hasta)
      )
    );

comment on view public.mi_tarea is
  'Las actividades que son mías: soy responsable, son de mi cuadrilla, o me asignaron a ellas. Estar asignado a la obra NO alcanza — eso sería el plan entero con otro nombre. `pct` es el avance CANÓNICO (actividad_avance), el mismo que ve la obra: nunca el declarado en obra_actividad.pct.';

grant select on public.mi_tarea to authenticated;
