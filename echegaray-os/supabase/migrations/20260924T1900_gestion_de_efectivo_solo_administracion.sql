-- LA GESTIÓN DEL EFECTIVO A RENDIR ES DE ADMINISTRACIÓN (dueño, 24/09/2026: «efectivo a rendir es una
-- función de nivel de usuario administración; a todos los niveles sólo se les envía el link para firma
-- y que vean lo que tengan que rendir, pero no la gestión»).
--
-- `_efectivo_exigir_administracion` usaba `es_administracion()`, que desde el 19/08 incluye al Jefe de
-- obra: la pantalla ya no le mostraba la gestión (Compras cerrado para el jefe), pero la base le
-- dejaba entregar, anular, cerrar, reclamar, observar/descartar comprobantes, registrar devoluciones y
-- archivar el papel. Pasa a `ve_economia()` (Dirección y Administración).
--
-- No cambia: firmar con el dedo (lo firma quien recibió, sin este control), declarar la devolución
-- propia, rendir lo propio y ver lo propio (`ve_efectivo_entrega`). Al 24/09 ninguna entrega la hizo un
-- jefe (6 de Dirección, 1 sin perfil), así que nadie pierde una entrega que ya manejaba.
create or replace function public._efectivo_exigir_administracion()
returns uuid
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  if not public.ve_economia() then
    raise exception 'la gestión del efectivo a rendir es de Administración' using errcode = '42501';
  end if;
  return auth.uid();
end $function$;
