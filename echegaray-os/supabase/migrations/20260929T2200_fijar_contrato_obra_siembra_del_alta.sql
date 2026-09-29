-- fijar_contrato_obra: la puerta por la que el ALTA DE OBRA siembra su fila en obra_contrato.
--
-- Caso real 29/09/2026: OB-0072 y OB-0073 nacieron sin fila en obra_contrato y anularon el
-- «Contratado en ejecución» de Messina. `obra_contrato` sólo tiene GRANT para service_role, así que
-- la app (authenticated) no podía escribirla. Igual que `fijar_monto_contratado`: SECURITY DEFINER
-- con `ve_economia()` adentro (es precio).
--
-- NO PISA: si la obra ya tiene fila devuelve false. Una carga hecha desde el papel vale más que este
-- pase automático, y pisarla borraría el desglose y la cita que alguien leyó del documento.
-- NO FABRICA: un importe nulo o <= 0 se rechaza (20260911T0930: «un total de cero no es una base»).

create or replace function public.fijar_contrato_obra(
  p_obra_id text,
  p_mano_obra numeric,
  p_materiales numeric,
  p_fuente_tipo text,
  p_fuente_drive_id text,
  p_fuente_nombre text,
  p_cita text,
  p_nota text
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n int;
begin
  if not public.ve_economia() then
    raise exception 'El contrato de la obra lo fija Dirección o Administración' using errcode = '42501';
  end if;
  if coalesce(p_mano_obra, 0) <= 0 and coalesce(p_materiales, 0) <= 0 then
    raise exception 'El contrato necesita un importe mayor a cero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.obra_canonica where id = p_obra_id) then
    raise exception 'No existe esa obra' using errcode = 'P0002';
  end if;
  insert into public.obra_contrato
    (obra_id, mano_obra, materiales, fuente_tipo, fuente_drive_id, fuente_nombre, cita, nota, cargado_por)
  values
    (p_obra_id, nullif(p_mano_obra, 0), nullif(p_materiales, 0), p_fuente_tipo, p_fuente_drive_id,
     p_fuente_nombre, p_cita, p_nota, 'app · alta de obra')
  on conflict (obra_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke execute on function public.fijar_contrato_obra(text, numeric, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.fijar_contrato_obra(text, numeric, numeric, text, text, text, text, text) to authenticated;
