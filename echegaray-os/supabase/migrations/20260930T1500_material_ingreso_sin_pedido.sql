-- MATERIAL: INGRESO SIN PEDIDO — la segunda puerta de entrada al stock (dueño, 30/09/2026: «rehacer
-- materiales tal como pedí ayer», que el 29/09 decía «no solo como gestión de pedidos sino también de
-- control de stock», calcando el inventario de Herramientas).
--
-- Hasta acá el stock SÓLO nacía de un «Llegó» sobre un pedido. Eso deja afuera lo que ya está en el
-- Taller o en una obra (stock inicial), la compra directa en el corralón sin pedido previo y lo que
-- vuelve de otra fuente. En producción, al 30/09 los 7 pedidos existentes figuran ENTREGADO sin
-- cantidad recibida (anteriores al stock), así que la sección no podía mostrar ni un material: el
-- control de stock no tenía por dónde arrancar.
--
-- `ingresar_material` es un asiento 'entrada' SIN pedido (la forma ya la admite el check
-- `material_mov_forma_chk`): mismo operador (`es_administracion()`), mismos depósitos (Taller u obra
-- activa), mismo catálogo (`_material_id` encuentra o crea por nombre+unidad). El ORIGEN es obligatorio
-- (texto corto): una entrada sin pedido y sin decir de dónde vino es stock que nadie puede auditar.
-- Se corrige como todo el libro: con un recuento (ajuste), nunca editando el asiento.

create function public.ingresar_material(p_nombre text, p_unidad text, p_ubicacion uuid, p_cantidad numeric, p_origen text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_usr uuid := public._material_operador();
  v_n numeric := public._material_cantidad(p_cantidad::text, coalesce(btrim(p_nombre), 'el material'));
  v_origen text := nullif(btrim(p_origen), '');
  v_mat uuid;
begin
  if v_origen is null or length(v_origen) < 3 then
    raise exception 'decí de dónde viene el material (compra directa, stock inicial…)' using errcode = 'P0001';
  end if;
  perform public._material_deposito(p_ubicacion, 'destino');
  v_mat := public._material_id(p_nombre, p_unidad);
  perform public._material_sumar(v_mat, p_ubicacion, v_n);
  insert into material_movimiento (material_id, tipo, destino_id, cantidad, nota, usuario_id)
  values (v_mat, 'entrada', p_ubicacion, v_n, left(v_origen, 400), v_usr);
  return v_mat;
end $$;

revoke all on function public.ingresar_material(text, text, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.ingresar_material(text, text, uuid, numeric, text) to authenticated;
