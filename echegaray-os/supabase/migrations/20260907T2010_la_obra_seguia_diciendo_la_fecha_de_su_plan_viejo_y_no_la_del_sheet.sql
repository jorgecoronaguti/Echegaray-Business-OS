-- LA OBRA SEGUÍA DICIENDO LA FECHA DE SU PLAN VIEJO Y NO LA DEL SHEET (07/09/2026)
--
-- EL DEFECTO, VISTO LEYENDO EL EFECTO Y NO EL `UPDATE`. Después de
-- `20260907T2000`, `obra_canonica` decía lo correcto para las diez obras — SALÓN COMERCIAL
-- 2026-08-18 → 2026-12-30, las fechas de la pestaña OBRAS del Flujo de Caja. Pero la CARTERA, que
-- es lo que el dueño mira, publicaba otra cosa:
--
--   SALÓN COMERCIAL | Quattropani | 2026-08-03 → 2026-08-03
--
-- Nueve obras bien y una mal. Un `update` que no falló no prueba nada: esto sólo aparece leyendo
-- `obra_panel`, que es la fuente de la pantalla, y no la tabla que se escribió.
--
-- POR QUÉ. `obra_fechas` —de donde `obra_panel` saca el plazo— hace
-- `coalesce(envolvente_de_las_actividades, fecha_declarada_en_la_obra)`: la fecha de la obra es la
-- de su plan mientras tenga plan, y sólo cae a la declarada cuando no le queda ninguna actividad
-- viva. A Salón Comercial le quedaron CINCO, porque la migración anterior no pudo borrar las que
-- tienen horas imputadas (`registros_hh.actividad_id` es SET NULL y su índice único colapsa dos
-- imputaciones de la misma persona el mismo día). Su envolvente es 03/08 → 03/08 y le ganaba al
-- Sheet.
--
-- ═══ ARCHIVAR, QUE NO ES BORRAR ═══
--
-- `obra_fechas` filtra `where not archivada`, y `obra_actividad.archivada` está declarada en el tipo
-- como *"Archivada NO es borrada: sale del Gantt y de los promedios, y su historia queda"*. Es
-- exactamente lo que hace falta: la actividad sale de la envolvente, del Gantt y del avance —el plan
-- vuelve a empezar, que es lo que el dueño pidió— y las 49 horas imputadas siguen colgadas de ella,
-- con su persona, su fecha y su causa de desvío. No se toca `registros_hh` ni
-- `obra_partida_costo_real`.
--
-- LO QUE ESTA MIGRACIÓN NO RESUELVE, Y QUEDA PARA EL DUEÑO: las dos imputaciones que colisionan
-- (persona 17fdcfb1, 20/08/2026, 1 h y 15 h en dos actividades distintas de Salón Comercial). Hasta
-- que alguien diga si son 16 h o si una está mal cargada, esas actividades no se pueden borrar. Son
-- horas de gente: no las decide una migración de limpieza.

update public.obra_actividad set archivada = true
where obra_id in (
  select id from public.obra_canonica where estado = 'activa'
) and not archivada;

-- ── LA GUARDA ES SOBRE LA VISTA QUE MIRA EL DUEÑO, NO SOBRE LA TABLA QUE ESCRIBÍ ────────────────
-- Un control nunca se valida contra la misma información que produce: acá se escribe
-- `obra_actividad` y se verifica `obra_panel`.
do $$
declare mal int;
begin
  select count(*) into mal
  from public.obra_panel p
  join public.obra_canonica o on o.id = p.obra_id
  where o.estado = 'activa'
    and (p.fecha_inicio_plan is distinct from o.fecha_inicio_plan
      or p.fecha_fin_plan    is distinct from o.fecha_fin_plan);
  if mal > 0 then
    raise exception 'la cartera publica otra fecha que la del Sheet en % obra(s)', mal;
  end if;

  if (select count(*) from public.registros_hh where actividad_id is not null) < 6 then
    raise exception 'se perdieron horas imputadas: archivar no puede desvincular una imputación';
  end if;
end $$;
