-- ERP OBRAS · SERIE B — LAS OBRAS EXISTENTES PASAN A TENER HISTORIAS (decisión del dueño, 25/09/2026:
-- «armalas vos y hacé todo lo de obras»).
--
-- Las obras cargadas antes de la serie B tienen TAREAS colgadas directo del rubro (o de la raíz), y la
-- pantalla las marcaba «sin historia · revisar». Esta migración de DATOS REALES arma lo que falta:
--
--   1. Una HISTORIA por rubro vivo que tenga tareas, con el nombre del rubro; las tareas que colgaban
--      del rubro pasan a colgar de su historia.
--   2. Las tareas vivas colgadas de la RAÍZ (sin rubro vivo: le-galpon-9, pilon, limpieza, relevamiento,
--      una de messina) quedan bajo un rubro y una historia con el NOMBRE DE LA OBRA. No se inventa un
--      rubro temático: el nombre de la obra es lo único cierto que se sabe de ellas.
--      Se excluyen las filas «ZZ-E2E …»: son datos de prueba que llegaron por el sincronizador del Sheet
--      y no se consagran en la estructura (quedan como estaban, para borrarlas en su origen).
--   3. COSTO DE MO: vacío (NULL, «sin costo · no pesa») salvo que TODAS las tareas de la historia vengan
--      de partidas con composición congelada; entonces es la suma de mano de obra y cargas sociales de
--      esas partidas × su cantidad. Nunca un 0 inventado. (Hoy ninguna tarea viva tiene partida.)
--   4. `obra_avance_ponderado`: sin ninguna historia que pese, el avance es NULL («sin peso»), no 0 %.
--      Antes eso no pasaba porque no había historias; ahora que las hay sin costo, un 0 % mentiría.
--
-- No se borra nada ni cambia un id: los partes, pasos e insumos siguen atados a las mismas tareas.

-- 1 y 2 · las historias (y el rubro con el nombre de la obra donde hace falta).
do $fn$
declare
  r record;
  v_rubro uuid;
  v_hist uuid;
  v_mo numeric;
begin
  -- 2 · raíz → rubro con el nombre de la obra.
  for r in
    select a.obra_id, o.nombre as obra_nombre, min(a.orden) as orden
      from public.obra_actividad a
      join public.obra_canonica o on o.id = a.obra_id
     where a.nivel = 'tarea' and a.actividad_padre_id is null and not a.archivada
       and a.nombre not ilike 'ZZ-E2E%'
     group by a.obra_id, o.nombre
  loop
    insert into public.obra_actividad (obra_id, nombre, nivel, tipo, rol_estructura, orden, clave, fuente, creada_en_web, metodo_avance, estado)
    values (r.obra_id, r.obra_nombre, 'rubro', 'resumen', 'rubro', greatest(coalesce(r.orden, 1) - 1, 0), 'rubro-obra:' || r.obra_id, 'web', true, 'manual', 'pendiente')
    returning id into v_rubro;
    update public.obra_actividad set actividad_padre_id = v_rubro, seccion = r.obra_nombre
     where obra_id = r.obra_id and nivel = 'tarea' and actividad_padre_id is null and not archivada and nombre not ilike 'ZZ-E2E%';
  end loop;

  -- 1 · rubro vivo con tareas → una historia con su nombre.
  for r in
    select distinct p.id as rubro_id, p.obra_id, p.nombre, p.orden
      from public.obra_actividad p
      join public.obra_actividad t on t.actividad_padre_id = p.id and t.nivel = 'tarea' and t.nombre not ilike 'ZZ-E2E%'
     where p.nivel = 'rubro' and not p.archivada
  loop
    -- El costo sólo si TODAS sus tareas vienen de una partida con composición congelada.
    select case when count(*) = count(c.mo) then sum(c.mo) end into v_mo
      from (select distinct t.cotizacion_partida_id from public.obra_actividad t
             where t.actividad_padre_id = r.rubro_id and t.nivel = 'tarea' and not t.archivada) t
      left join lateral (
        select round(sum(x.cantidad * x.costo_unitario * (1 + coalesce(x.desperdicio, 0))) * cp.cantidad) as mo
          from public.cotizacion_partida cp
          join public.cotizaciones k on k.id = cp.cotizacion_id and k.congelada_en is not null
          join public.cotizacion_partida_composicion x on x.partida_id = cp.id and x.tipo in ('mano_obra', 'carga_social')
         where cp.id = t.cotizacion_partida_id and cp.cantidad is not null
         group by cp.cantidad
      ) c on true;

    insert into public.obra_actividad (obra_id, nombre, nivel, tipo, orden, actividad_padre_id, seccion, clave, fuente, creada_en_web, metodo_avance, estado, costo_mo)
    values (r.obra_id, r.nombre, 'historia', 'resumen', r.orden, r.rubro_id, r.nombre, 'historia-del-rubro:' || r.rubro_id, 'web', true, 'manual', 'pendiente', v_mo)
    returning id into v_hist;
    update public.obra_actividad set actividad_padre_id = v_hist
     where actividad_padre_id = r.rubro_id and nivel = 'tarea' and nombre not ilike 'ZZ-E2E%';
  end loop;
end $fn$;

-- 4 · el avance de la obra sin peso es NULL, no 0 %.
create or replace view public.obra_avance_ponderado
with (security_invoker = true) as
select obra_id,
       max(metodo_ponderacion) as metodo,
       case when coalesce(sum(peso), 0) > 0 then round(sum(avance_pct * coalesce(peso, 0)), 1) end as avance_pct,
       sum(costo_mo) as costo_mo_total,
       case when coalesce(sum(peso), 0) > 0 then round(sum(avance_pct * coalesce(peso, 0)) / 100 * sum(costo_mo), 0) end as costo_teorico,
       count(*)::int as n_historias,
       count(*) filter (where sin_costo)::int as n_historias_sin_costo,
       round(100 * (1 - coalesce(sum(peso), 0)), 1) as pct_sin_peso,
       sum(n_medidas)::int as n_items_medidos,
       sum(n_hojas)::int as n_items
  from public.obra_historia_peso
 group by obra_id;

grant select on public.obra_avance_ponderado to authenticated;
