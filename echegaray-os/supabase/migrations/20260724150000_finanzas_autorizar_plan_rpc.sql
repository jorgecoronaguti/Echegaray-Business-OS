-- APROBAR EL PLAN DESDE LA INTERFAZ — sin service_role, con RLS real.
--
-- POR QUÉ (24/07). El botón "Aprobar y convertir en trabajo" usaba el admin client (service_role) para
-- hacer el UPDATE, porque la RLS de finanzas_plan_vigente sólo deja SELECT a authenticated. Pero el
-- service_role vive en una env var de Vercel (SUPABASE_SERVICE_ROLE_KEY) que NO estaba cargada en
-- producción → createAdminClient() lanzaba y la página entera crasheaba ("server error") al aprobar.
--
-- El arreglo correcto no es depender de esa env var: es una función SECURITY DEFINER que el usuario
-- AUTENTICADO invoca por RPC. Hace el UPDATE guardado (sólo si sigue pendiente Y es el mismo plan que
-- vio la interfaz) y gatea por rol (Dirección/Administración), igual que el resto de la escritura
-- financiera. Así la aprobación funciona con el cliente normal, sin secretos en el server action.

create or replace function public.finanzas_autorizar_plan(
  p_horizonte    text,
  p_calculado_en timestamptz
)
returns text                       -- el estado resultante ('autorizado') o null si no correspondía
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  -- Sólo Dirección/Administración pueden autorizar la ejecución (misma regla que la escritura financiera).
  if current_rol() not in ('direccion', 'administracion') then
    raise exception 'solo Dirección o Administración pueden autorizar el plan';
  end if;

  -- Guarda anti-doble-ejecución y anti-plan-viejo: sólo pasa a 'autorizado' si sigue pendiente Y es
  -- exactamente el plan que la interfaz mostró (mismo horizonte y mismo corte de cálculo).
  update public.finanzas_plan_vigente
     set estado = 'autorizado', autorizado_por = 'interfaz', autorizado_en = now(), actualizado_en = now()
   where id = 1
     and estado = 'pendiente_ejecucion'
     and horizonte = p_horizonte
     and calculado_en = p_calculado_en
  returning estado into v_estado;

  return v_estado;  -- null ⇒ ya no estaba pendiente o el plan cambió; la interfaz lo informa
end;
$$;

revoke all on function public.finanzas_autorizar_plan(text, timestamptz) from public;
grant execute on function public.finanzas_autorizar_plan(text, timestamptz) to authenticated;

comment on function public.finanzas_autorizar_plan(text, timestamptz) is
  'Autoriza la ejecución del plan de tesorería vigente desde la interfaz (Dirección/Administración). SECURITY DEFINER: no requiere service_role. Idempotente y anti-doble-ejecución: sólo actúa si el plan sigue pendiente y coincide con el que se vio.';
