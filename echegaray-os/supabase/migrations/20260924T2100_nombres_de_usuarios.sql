-- EL NOMBRE DE UN USUARIO ES EL DE SU PERSONA (dueño, 24/09/2026: «noto nombres distintos en distintas
-- secciones de la app»; la misma persona salía «Emiliano», «Emiliano Maldonado» y «Maldonado Batista
-- Emiliano Miguel» según la pantalla).
--
-- Persona ≠ Usuario: un usuario es un acceso (`perfiles`), una persona es un empleado (`personas`).
-- No se fusionan. El nombre se resuelve POR EL VÍNCULO `perfiles.persona_id`: si el acceso es de una
-- persona, su nombre es el del legajo; si no (una cuenta sin legajo), el `perfiles.nombre`.
--
-- Por qué una función y no un JOIN en cada pantalla: la RLS de `personas` deja ver a un jefe sólo la
-- gente de sus obras, y a un operario a nadie. Con un JOIN, el mismo usuario se llamaba por su legajo
-- para Administración y por `perfiles.nombre` para el jefe: el nombre dependía de QUIÉN miraba. Esta
-- función expone lo mismo que `perfiles` ya expone a todo autenticado (id → nombre), con el nombre
-- tomado de la fuente canónica. No publica ningún otro dato del legajo.
--
-- El formato («Maldonado Batista Emiliano Miguel» en oración) NO vive acá: lo pone una sola función,
-- `src/shared/personas/nombre.ts`. Esto devuelve el dato crudo.
create or replace function public.nombres_de_usuarios()
returns table (id uuid, nombre text, persona_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select pf.id,
         coalesce(nullif(btrim(pe.nombre_completo), ''), nullif(btrim(pf.nombre), '')) as nombre,
         pf.persona_id
    from public.perfiles pf
    left join public.personas pe on pe.id = pf.persona_id
   where (select auth.uid()) is not null
      or (select auth.role()) = 'service_role'
$$;

revoke all on function public.nombres_de_usuarios() from public, anon;
grant execute on function public.nombres_de_usuarios() to authenticated, service_role;

comment on function public.nombres_de_usuarios() is
  'id de usuario → nombre para mostrar: el legajo de su persona (perfiles.persona_id) o, sin persona, perfiles.nombre. Formato en src/shared/personas/nombre.ts.';
