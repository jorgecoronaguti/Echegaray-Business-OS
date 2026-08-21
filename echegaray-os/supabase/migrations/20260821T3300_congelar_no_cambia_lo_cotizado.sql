-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CONGELAR NO CAMBIA LO COTIZADO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El defecto (encontrado por la auditoría de cierre del 21/08, reproducido con un caso controlado):
-- `congelar_presupuesto()` fijaba `costo_unitario` y `hs_unitarias` copiando SIEMPRE el valor del
-- análisis vigente — pisando el override que el presupuestador tipeó en la partida. La vista
-- `cotizacion_partida_valorizada` valoriza con `coalesce(partida, análisis)`: mientras el
-- presupuesto estaba vivo, el override mandaba; al congelarlo, el número CAMBIABA en silencio.
-- Un presupuesto de 160 HH previstas quedó congelado en 12 HH porque el análisis decía 0,12 HH/m²
-- y la partida, tipeada a mano, 1,6.
--
-- Congelar es fijar EL NÚMERO QUE SE ESTABA MOSTRANDO, no otro. Por eso acá se congela con el
-- mismo `coalesce` que usa la vista: si hay override, sobrevive el override; si no, se fija el
-- valor vivo del análisis — que es el único caso en el que congelar aporta algo.
--
-- Sin datos que corregir: `cotizacion_partida` tiene 0 filas congeladas a la fecha de esta
-- migración (verificado en la base real antes de escribirla).

create or replace function public.congelar_presupuesto(p_cotizacion_id uuid)
returns int language plpgsql security invoker as $$
declare n int;
begin
  if not public.ve_economia() then
    raise exception 'congelar un presupuesto exige permiso económico';
  end if;
  if exists (select 1 from public.cotizaciones where id = p_cotizacion_id and congelada_en is not null) then
    raise exception 'el presupuesto ya está congelado: para cambiarlo se crea una versión nueva';
  end if;

  insert into public.cotizacion_partida_composicion
      (partida_id, orden, recurso_codigo, recurso_nombre, unidad, tipo, cantidad, costo_unitario, desperdicio, fecha_precio)
  select p.id, l.orden, rc.codigo, rc.nombre, rc.unidad, rc.tipo, l.cantidad,
         rc.costo_con_desperdicio, rc.desperdicio, rc.fecha_precio
    from public.cotizacion_partida p
    join public.analisis_linea l on l.analisis_id = p.analisis_id
    join public.recurso_costo rc on rc.recurso_id = l.recurso_id
   where p.cotizacion_id = p_cotizacion_id;
  get diagnostics n = row_count;

  -- El MISMO coalesce que `cotizacion_partida_valorizada`: se congela lo que se mostraba.
  update public.cotizacion_partida p
     set costo_unitario = coalesce(p.costo_unitario, ac.costo_directo),
         hs_unitarias   = coalesce(p.hs_unitarias,   ac.hs_unitarias)
    from public.analisis_costo ac
   where ac.analisis_id = p.analisis_id
     and p.cotizacion_id = p_cotizacion_id;

  update public.cotizaciones
     set congelada_en = now(), congelada_por = auth.uid()
   where id = p_cotizacion_id;

  return n;
end $$;

comment on function public.congelar_presupuesto(uuid) is
  'Copia la composición viva de cada partida y fija costo y rendimiento CON EL MISMO coalesce que '
  'la vista valorizada: el override tipeado sobrevive, el hueco se llena con el análisis vivo. '
  'Se corre una sola vez: después, cambiar el presupuesto es crear una versión nueva.';
