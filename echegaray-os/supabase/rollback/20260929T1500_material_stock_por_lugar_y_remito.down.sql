-- Vuelta atrás de 20260929T1500. Borra el stock y los remitos: sólo antes de que existan datos reales
-- que importe conservar (el libro es inmutable a propósito, así que esto es destructivo).
drop trigger if exists pedido_material_recepcion_guarda on public.pedidos_materiales;
drop function if exists public.recibir_pedido_material(text, numeric, uuid, text);
drop function if exists public.usar_material(uuid, uuid, numeric, text);
drop function if exists public.mover_material(jsonb, uuid, uuid, text, text);
drop function if exists public.ajustar_material(uuid, uuid, numeric, text, text);
drop function if exists public.anular_recepcion_material(text, numeric, text);
alter table public.pedidos_materiales
  drop column if exists cantidad_recibida, drop column if exists recibido_en,
  drop column if exists recibido_por, drop column if exists material_id;
drop table if exists public.material_movimiento, public.remito_item, public.remito,
  public.remito_contador, public.material_existencia, public.material;
drop function if exists public._pedido_material_recepcion_guarda();
drop function if exists public._material_libro_inmutable();
drop function if exists public.ve_ubicacion_material(uuid);
drop function if exists public._material_operador();
drop function if exists public._material_deposito(uuid, text);
drop function if exists public._material_rotulo(uuid);
drop function if exists public._material_id(text, text);
drop function if exists public._material_sumar(uuid, uuid, numeric);
drop function if exists public._material_restar(uuid, uuid, numeric);
drop function if exists public._material_cantidad(text, text);
