-- ANDAMIO de Material, DESPUÉS de activo_mover_00_andamio.sql y de la cadena de Herramientas
-- (de ahí salen `ubicacion` y `ubicacion_de_obra`) y ANTES de 20260929T1500. No es producción: es
-- lo justo que la migración le pide a lo que ya existía (roles, ve_obra, pedidos_materiales).
create function public.current_rol() returns text language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid()
$$;
create function public.es_administracion() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_rol() in ('direccion', 'administracion', 'jefe_obra'), false)
$$;
create table public.usuario_obra (usuario_id uuid, obra_canonica_id text);
create function public.ve_obra(p_obra text) returns boolean language sql stable security definer set search_path = public as $$
  select public.es_administracion()
      or exists (select 1 from usuario_obra uo where uo.usuario_id = auth.uid() and uo.obra_canonica_id = p_obra)
$$;
grant execute on function public.current_rol(), public.es_administracion(), public.ve_obra(text) to authenticated;
grant select on public.perfiles, public.usuario_obra, public.obra_canonica to authenticated;

-- pedidos_materiales tal como queda tras 20260716/20260923: sólo las columnas que se usan, con la
-- policy de update abierta a quien ve la obra (la que el trigger guarda tiene que cerrar).
create table public.pedidos_materiales (
  id uuid primary key default gen_random_uuid(),
  id_pedido text unique not null,
  obra_texto text, obra_canonica_id text references public.obra_canonica(id),
  fecha date, material text, cantidad numeric, unidad text,
  estado text, origen text default 'app', nota text,
  borrado_en timestamptz, updated_at timestamptz not null default now()
);
alter table public.pedidos_materiales enable row level security;
create policy pm_select on public.pedidos_materiales for select to authenticated using (borrado_en is null and public.ve_obra(obra_canonica_id));
create policy pm_update on public.pedidos_materiales for update to authenticated using (public.ve_obra(obra_canonica_id)) with check (public.ve_obra(obra_canonica_id));
grant select, insert, update, delete on public.pedidos_materiales to authenticated;

-- Un jefe (administra todo) y un obrero de campo con UNA obra asignada.
insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333');
insert into public.perfiles values ('22222222-2222-2222-2222-222222222222', 'Jefe Prueba', 'jefe_obra'),
                                   ('33333333-3333-3333-3333-333333333333', 'Campo Prueba', 'campo');
insert into public.usuario_obra values ('33333333-3333-3333-3333-333333333333', 'ob-activa');
