-- UN NULL NO ES UN «NO» — la guarda del plan físico dejaba pasar los pasos (27/08/2026)
--
-- ═══ EL DEFECTO, TAL COMO LO ENCONTRÓ LA PRUEBA ═══
--
-- La guarda de `sembrar_insumo_plan` estaba escrita así:
--
--     if not (new.rol_estructura = 'frente'
--             or (new.tipo = 'tarea' and coalesce(v_padre_rol,'') <> 'frente')) then return null; end if;
--
-- Un paso que cuelga de un frente tiene `rol_estructura` en NULL. Y en SQL **`NULL = 'frente'` no es
-- falso: es NULL**. `NULL or false` es NULL, `not NULL` es NULL, y un `if NULL then` no entra — así
-- que la guarda no frenaba nada y el paso se sembraba igual. Con una plantilla de cinco pasos, el
-- material de la partida quedaba multiplicado por seis (los cinco pasos más el frente).
--
-- La misma expresión escrita en el `where` del relleno SÍ funcionaba, porque un `where` que da NULL
-- descarta la fila. Dos lugares con el mismo texto y comportamiento opuesto: por eso el arreglo es
-- envolver TODA comparación con una columna anulable en `coalesce`, y no confiar en la intuición de
-- que «si no es frente, entonces no es frente».
--
-- Se arregla en una migración nueva y no editando la 1800: el ledger guarda el hash del archivo tal
-- como se aplicó, y editarlo después lo deja marcado como EDITADA DESPUÉS DE APLICARSE para siempre.

create or replace function public.sembrar_insumo_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_padre_rol text;
begin
  if new.cotizacion_partida_id is null or new.cantidad_objetivo is null then
    return null;
  end if;

  select rol_estructura into v_padre_rol from public.obra_actividad where id = new.actividad_padre_id;

  -- LO LLEVA QUIEN NO TIENE UN FRENTE ARRIBA. Todo `coalesce`: ver el encabezado.
  if not (coalesce(new.rol_estructura, '') = 'frente'
          or (coalesce(new.tipo, '') = 'tarea' and coalesce(v_padre_rol, '') <> 'frente')) then
    return null;
  end if;

  insert into public.obra_actividad_insumo_plan
    (obra_id, actividad_id, cotizacion_partida_id, orden, recurso_codigo, recurso_nombre, tipo,
     unidad, cantidad_unitaria, desperdicio, cantidad_plan)
  select new.obra_id, new.id, new.cotizacion_partida_id, c.orden, c.recurso_codigo, c.recurso_nombre,
         c.tipo, c.unidad, c.cantidad, c.desperdicio,
         c.cantidad * new.cantidad_objetivo * (1 + coalesce(c.desperdicio, 0))
    from public.cotizacion_partida_composicion c
   where c.partida_id = new.cotizacion_partida_id
  on conflict on constraint obra_actividad_insumo_plan_unico do nothing;

  return null;
end $$;

-- ── LA LIMPIEZA, POR SI ALGUNA FILA ALCANZÓ A ENTRAR ──────────────────────────────────────────
--
-- Entre la 1800 y ésta no se convirtió ninguna partida, así que en principio no hay nada que
-- limpiar. Se corre igual y es idempotente: una fila sembrada en una actividad que cuelga de un
-- frente es material contado dos veces, y eso se ve recién cuando alguien compara el plan con la
-- compra —tarde—.

delete from public.obra_actividad_insumo_plan i
 using public.obra_actividad a
  join public.obra_actividad p on p.id = a.actividad_padre_id
 where i.actividad_id = a.id
   and coalesce(a.rol_estructura, '') <> 'frente'
   and coalesce(p.rol_estructura, '') = 'frente';
