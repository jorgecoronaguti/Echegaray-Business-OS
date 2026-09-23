-- MIS SESIONES SE VEN Y SE CIERRAN DE A UNA (dueño, 23/09/2026: «Mi cuenta › Sesiones»).
--
-- La pantalla mostraba sólo la sesión actual y decía que las demás «viven en el esquema interno de
-- autenticación» y que llegar ahí exigía privilegios de administrador. Es cierto, y por eso la puerta
-- no es la clave de servicio en una pantalla personal: son DOS FUNCIONES `security definer` que miran
-- `auth.sessions` acotadas a `auth.uid()`. Cada uno ve las suyas y nada más; no hay forma de pedir las
-- de otro porque el filtro no es un parámetro.
--
-- QUÉ GUARDA SUPABASE POR SESIÓN (leído de `auth.sessions`, 23/09/2026): `created_at`, `updated_at`,
-- `refreshed_at`, `user_agent`, `ip`, `aal`, `factor_id`, `not_after`. Lo que se devuelve es eso; no se
-- deduce ciudad de la IP ni se inventa un nombre de dispositivo.
--
-- QUÉ HACE CERRAR: borrar la fila de `auth.sessions`. Los refresh tokens cuelgan de ella con `on
-- delete cascade`, así que esa sesión no puede renovarse más. EL LÍMITE, dicho: el access token ya
-- emitido sigue valiendo hasta que venza (una hora como mucho), porque PostgREST lo valida por firma sin
-- preguntarle al servidor de Auth. Es el mismo límite que tiene «quitar el acceso» en Usuarios.
--
-- La sesión ACTUAL se identifica por el claim `session_id` del JWT: `cerrar_mis_otras_sesiones()` la
-- deja viva; para cerrarla está «Cerrar sesión».

create or replace function public.mis_sesiones()
returns table (
  id uuid,
  es_actual boolean,
  creada_en timestamptz,
  ultima_actividad timestamptz,
  user_agent text,
  ip text,
  aal text
)
language sql stable security definer set search_path = public as $$
  select s.id,
         s.id::text = (auth.jwt() ->> 'session_id') as es_actual,
         s.created_at,
         coalesce(s.refreshed_at, s.updated_at, s.created_at) as ultima_actividad,
         s.user_agent,
         host(s.ip) as ip,
         s.aal::text
    from auth.sessions s
   where s.user_id = auth.uid()
     and (s.not_after is null or s.not_after > now())
   order by es_actual desc, ultima_actividad desc
$$;
revoke all on function public.mis_sesiones() from public, anon;
grant execute on function public.mis_sesiones() to authenticated;
comment on function public.mis_sesiones() is
  'Las sesiones abiertas del usuario de la sesión, con lo que Supabase guarda de cada una. Nunca las de otro.';

-- Cierra UNA sesión propia. Devuelve cuántas filas borró (0 = no era tuya o ya no existía).
create or replace function public.cerrar_mi_sesion(p_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.cerrar_mi_sesion(uuid) from public, anon;
grant execute on function public.cerrar_mi_sesion(uuid) to authenticated;

-- Cierra todas las propias MENOS la actual. Devuelve cuántas cerró.
create or replace function public.cerrar_mis_otras_sesiones()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'hace falta un usuario logueado' using errcode = '42501'; end if;
  delete from auth.sessions
   where user_id = auth.uid()
     and id::text is distinct from (auth.jwt() ->> 'session_id');
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.cerrar_mis_otras_sesiones() from public, anon;
grant execute on function public.cerrar_mis_otras_sesiones() to authenticated;
