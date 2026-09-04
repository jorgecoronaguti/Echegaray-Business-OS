-- QUIÉN PUEDE VER —Y QUIÉN PUEDE CAMBIAR— UNA IDENTIDAD RESUELTA.
--
-- La pantalla de Compras tiene que poder decir «DUPEC → Dubos Ugarte Pedro Luis Raul» y «este
-- proveedor no está identificado». Para eso necesita LEER las dos tablas de identidad, y hoy no
-- puede: no tienen RLS ni grant, así que PostgREST le contesta que no a todo el mundo.
--
-- ═══ POR QUÉ LECTURA SÍ Y ESCRITURA NO ═══
--
-- Un alias VERIFICADO es la señal más fuerte del resolver: hace que un texto se vincule solo, sin
-- modelo y para siempre. Si cualquier sesión autenticada pudiera insertar uno, cualquier sesión
-- autenticada podría fusionar dos proveedores — y esa fusión mueve deuda de un proveedor a otro sin
-- que nada avise. La confirmación de una persona entra por una acción del servidor, que valida el
-- rol y escribe con la llave de servicio. Es el mismo criterio que ya rige el maestro de
-- proveedores: mirar es de todos, escribir pasa por una puerta.
--
-- No lleva portero económico: acá no hay importes, sólo nombres de proveedor, que Administración y
-- Jefe de Obra ya ven en la pantalla de Compras.

alter table public.ml_entidad_alias enable row level security;
alter table public.ml_resolucion   enable row level security;

grant select on public.ml_entidad_alias to authenticated;
grant select on public.ml_resolucion   to authenticated;

-- El portero va en `(select auth.role())` y no en `auth.role()`: envuelto en un select, Postgres lo
-- evalúa UNA vez por consulta (InitPlan) en vez de una vez por fila.
drop policy if exists ml_alias_lectura on public.ml_entidad_alias;
create policy ml_alias_lectura on public.ml_entidad_alias
  for select to authenticated using ((select auth.role()) = 'authenticated');

drop policy if exists ml_resolucion_lectura on public.ml_resolucion;
create policy ml_resolucion_lectura on public.ml_resolucion
  for select to authenticated using ((select auth.role()) = 'authenticated');
