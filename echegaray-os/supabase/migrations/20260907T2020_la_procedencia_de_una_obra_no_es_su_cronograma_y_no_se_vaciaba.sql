-- LA PROCEDENCIA DE UNA OBRA NO ES SU CRONOGRAMA — Y SE VACIÓ POR ERROR (07/09/2026)
--
-- EL DEFECTO ES MÍO Y LO ENCONTRÓ LA SUITE, no yo. `20260907T2000` metió tres tablas en el reset
-- del plan que no son plan:
--
--   · `obra_origen_cotizacion` (1 fila) — de QUÉ cotización nació la obra. Es procedencia
--     CONTRACTUAL: la misma familia que `cotizaciones` y `presupuestos`, que esa migración sí dejó
--     intactas a propósito. Borrar el origen y conservar la cotización es incoherente.
--   · `obra_partida_plan` (26 filas) — la línea base CONGELADA que sale de la cotización adjudicada.
--     No es el cronograma que se rehace: es contra lo que se mide el desvío.
--   · `obra_ejecucion` de actividades que SOBREVIVIERON — `20260907T2010` archivó en vez de borrar
--     las cuatro actividades con horas imputadas justamente porque su historia importa. Borrarles
--     los partes mientras se conservan sus horas es la misma incoherencia al revés.
--
-- CÓMO SE VIO. `orquestador/lib/cotizador/obra-pg.pg.test.mjs` se puso rojo en 10 tests contra la
-- base real: *"no hay genealogía persistida"* y *"obra_ejecucion de Quattropani trajo 0"*. Ese
-- archivo declara en su encabezado que se ata a las filas reales —*"No se inventa un fixture: si
-- estas filas cambian, el test tiene que enterarse"*— y se enteró. El rojo no era del test.
--
-- ═══ LA REGLA QUE FALTABA, ESCRITA DE UNA VEZ ═══
--
-- LO QUE CUELGA DE UNA ACTIVIDAD QUE SOBREVIVIÓ, SOBREVIVE. Los 2 partes cuyas actividades sí se
-- borraron (no tenían horas ni costo) NO vuelven: ésos son el avance que el dueño quiere rehacer.
-- Vuelven 4 de 6, y eso es lo correcto, no una restauración a medias.
--
-- Todo sale de `respaldo_obras_20260907`, que `20260907T2000` tomó antes de borrar. Es idempotente:
-- `on conflict do nothing` y, si ya está, no hace nada.

insert into public.obra_origen_cotizacion
select r.* from respaldo_obras_20260907.obra_origen_cotizacion r
where r.obra_id in (select id from public.obra_canonica where estado = 'activa')
on conflict do nothing;

-- `actividad_id` VUELVE EN NULL cuando su actividad ya no existe, y eso NO es una licencia: la FK
-- `obra_partida_plan_actividad_id_fkey` está declarada ON DELETE SET NULL, así que es literalmente
-- lo que la base habría hecho sola si la partida hubiera estado ahí cuando se borró la actividad.
-- 23 de 26 quedan sin actividad, 2 conservan la suya y 1 ya venía en null. La partida no se pierde:
-- lo que se pierde es a qué tarea del cronograma viejo colgaba, que es el cronograma que se rehace.
insert into public.obra_partida_plan (
  id, origen_id, obra_id, cotizacion_partida_id, actividad_id, codigo, descripcion, unidad,
  cantidad_plan, hs_unitarias_plan, hh_plan, costo_unitario_plan, costo_plan, dias_plan,
  subcontratada, precio_subcontrato_plan, congelado_en)
select r.id, r.origen_id, r.obra_id, r.cotizacion_partida_id,
       case when r.actividad_id in (select id from public.obra_actividad) then r.actividad_id end,
       r.codigo, r.descripcion, r.unidad, r.cantidad_plan, r.hs_unitarias_plan, r.hh_plan,
       r.costo_unitario_plan, r.costo_plan, r.dias_plan, r.subcontratada,
       r.precio_subcontrato_plan, r.congelado_en
from respaldo_obras_20260907.obra_partida_plan r
where r.obra_id in (select id from public.obra_canonica where estado = 'activa')
on conflict do nothing;

-- El `where actividad_id in (…)` NO es defensivo: es la regla. Un parte sin su actividad no se
-- puede insertar (FK) y tampoco significa nada.
insert into public.obra_ejecucion
select r.* from respaldo_obras_20260907.obra_ejecucion r
where r.obra_id in (select id from public.obra_canonica where estado = 'activa')
  and r.actividad_id in (select id from public.obra_actividad)
on conflict do nothing;

-- ── GUARDAS ────────────────────────────────────────────────────────────────────────────────────
do $$
declare n_orig int; n_part int; n_ejec int; n_activas int;
begin
  select count(*) into n_orig from public.obra_origen_cotizacion
   where obra_id in (select id from public.obra_canonica where estado = 'activa');
  select count(*) into n_part from public.obra_partida_plan
   where obra_id in (select id from public.obra_canonica where estado = 'activa');
  select count(*) into n_ejec from public.obra_ejecucion
   where obra_id in (select id from public.obra_canonica where estado = 'activa');

  if n_orig < 1 then raise exception 'la procedencia de la obra no volvió'; end if;
  if n_part < 26 then raise exception 'la línea base congelada volvió incompleta: % de 26', n_part; end if;
  if n_ejec < 4 then raise exception 'los partes de las actividades vivas no volvieron: % de 4', n_ejec; end if;

  -- Y lo que 20260907T2000 y T2010 dejaron establecido no se puede haber movido.
  select count(*) into n_activas from public.obra_canonica where estado = 'activa';
  if n_activas <> 10 then raise exception 'la cartera dejó de ser 10 obras: %', n_activas; end if;
  if exists (
    select 1 from public.obra_panel p join public.obra_canonica o on o.id = p.obra_id
    where o.estado = 'activa'
      and (p.fecha_inicio_plan is distinct from o.fecha_inicio_plan
        or p.fecha_fin_plan is distinct from o.fecha_fin_plan)
  ) then raise exception 'la cartera volvió a publicar una fecha que no es la del Sheet'; end if;
end $$;
