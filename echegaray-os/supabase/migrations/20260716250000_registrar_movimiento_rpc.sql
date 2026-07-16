-- Registrar un movimiento de herramienta de forma ATÓMICA: inserta el log y actualiza la
-- ubicación actual de la herramienta en una sola transacción (evita que quede el log sin
-- reflejarse en la ubicación, o al revés). SECURITY INVOKER: respeta el RLS del usuario.
create or replace function public.registrar_movimiento_herramienta(
  p_id_herramienta text,
  p_destino text,
  p_responsable text
) returns text
language plpgsql
security invoker
as $$
declare
  v_id text := 'OS-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
begin
  insert into public.movimientos_herramienta (id_movimiento, id_herramienta, destino, responsable, fecha, origen)
  values (v_id, p_id_herramienta, p_destino, nullif(trim(p_responsable), ''), now(), 'os');

  update public.herramientas
     set ubicacion_actual = p_destino, origen = 'os', updated_at = now()
   where id_herramienta = p_id_herramienta;

  return v_id;
end;
$$;

grant execute on function public.registrar_movimiento_herramienta(text, text, text) to authenticated;
