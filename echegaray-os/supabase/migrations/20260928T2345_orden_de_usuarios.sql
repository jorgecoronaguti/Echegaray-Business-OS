-- ORDEN DE USUARIOS POR APELLIDO, AUNQUE LA SESIÓN NO VEA EL LEGAJO.
--
-- Bug (auditoría 28/09/2026 sobre f7a6dd7a): la app ordenaba las listas de usuarios (entrar como,
-- responsables de clientes, filtro de Herramientas) leyendo `personas.nombre_completo` con la sesión
-- de quien mira. La RLS de `personas` oculta los legajos a Campo y a los jefes, así que para ellos
-- no había legajo y la lista caía al nombre para mostrar («Emiliano Maldonado»): orden por nombre de
-- pila, justo el bug que se estaba arreglando.
--
-- Esta función devuelve SÓLO la clave de orden, no el legajo: lo que se muestra sigue saliendo de
-- `nombres_de_usuarios()` (que no se toca). Security definer por lo mismo que aquélla: la clave tiene
-- que ser la misma para cualquier sesión.
--
-- La clave replica `claveDeOrden` de src/shared/personas/nombre.ts: el legajo (apellido primero) con
-- espacios colapsados, en minúsculas y sin tildes MENOS LA Ñ (es otra letra, va después de la N). Se
-- usa `translate` y no `unaccent` para no depender de la extensión (mismo criterio que
-- 20260913T2300). La app vuelve a pasar la clave por `claveDeOrden`, así que una tilde que se escape
-- de esta lista no cambia el orden. Cae al nombre para mostrar SÓLO si la cuenta no tiene legajo.
create or replace function public.orden_de_usuarios()
returns table (usuario_id uuid, clave_orden text)
language sql
stable
security definer
set search_path = public
as $$
  select pf.id as usuario_id,
         translate(
           lower(regexp_replace(btrim(coalesce(
             nullif(btrim(pe.nombre_completo), ''),
             nullif(btrim(pe.nombre_para_mostrar), ''),
             nullif(btrim(pf.nombre), ''),
             ''
           )), '\s+', ' ', 'g')),
           'áàâäãéèêëíìîïóòôöõúùûüç',
           'aaaaaeeeeiiiiooooouuuuc'
         ) as clave_orden
    from public.perfiles pf
    left join public.personas pe on pe.id = pf.persona_id
   where (select auth.uid()) is not null or (select auth.role()) = 'service_role'
$$;

revoke all on function public.orden_de_usuarios() from public, anon;
-- service_role además de authenticated: «entrar como» lee con el cliente admin.
grant execute on function public.orden_de_usuarios() to authenticated, service_role;
