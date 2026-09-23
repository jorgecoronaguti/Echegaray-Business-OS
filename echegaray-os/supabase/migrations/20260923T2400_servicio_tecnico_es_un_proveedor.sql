-- UN SERVICIO TÉCNICO ES UN PROVEEDOR (dueño, 23/09/2026: «si hay que armar un listado de servicios
-- técnicos hacerlo, puede formar parte de una categoría de proveedores»).
--
-- Hasta hoy Herramientas tenía un tipo de lugar `servicio_tecnico` con nombre propio, sembrado con
-- un solo lugar —«Servicio técnico sin identificar»— que no apunta a nadie: no tiene CUIT, no tiene
-- compras, no tiene ficha. Un taller de reparación que arregla una soldadora le factura a Echegaray:
-- ES un proveedor, y si vive en dos lados (un texto en Herramientas y una fila en Proveedores) hay
-- dos versiones del mismo nombre. Realidad única: el lugar apunta al proveedor y el nombre sale de
-- ahí.
--
-- Qué cambia:
--   1. El vocabulario de rubros del proveedor suma «Servicio técnico». La deducción por compras
--      nunca lo produce (como Fletes): lo declara una persona, o lo pone Herramientas al usar el
--      proveedor como lugar de reparación si el proveedor todavía no tenía rubro.
--   2. `ubicacion.proveedor_id`: un servicio técnico (o un tercero) puede apuntar a un proveedor.
--      Entonces `nombre` puede quedar null: el nombre es el del proveedor.
--   3. `ubicacion_de_proveedor(proveedor, tipo)`: trae o crea el lugar de ese proveedor (uno por
--      proveedor). Es la única puerta para un servicio técnico: `crear_ubicacion` deja de aceptar
--      `servicio_tecnico` y sigue creando terceros sueltos (un préstamo a un conocido no es un
--      proveedor).
--   4. El lugar semilla «Servicio técnico sin identificar» se archiva: hoy no tiene nada adentro y
--      sus dos movimientos históricos siguen apuntándole (archivar no borra).

-- 1 · El rubro
alter table public.proveedores drop constraint if exists proveedores_rubro_ck;
alter table public.proveedores add constraint proveedores_rubro_ck
  check (rubro is null or rubro in (
    'Materiales', 'Subcontratista', 'Fletes', 'Combustible', 'Equipos',
    'Servicios de obra', 'Seguridad e higiene', 'Servicio técnico'));
alter table public.proveedores drop constraint if exists proveedores_rubro_deducido_ck;
alter table public.proveedores add constraint proveedores_rubro_deducido_ck
  check (rubro_deducido is null or rubro_deducido in (
    'Materiales', 'Subcontratista', 'Fletes', 'Combustible', 'Equipos',
    'Servicios de obra', 'Seguridad e higiene', 'Servicio técnico'));

-- 2 · El lugar apunta al proveedor
alter table public.ubicacion add column if not exists proveedor_id uuid references public.proveedores(id);
create unique index if not exists ubicacion_proveedor_uq on public.ubicacion (proveedor_id) where proveedor_id is not null;
alter table public.ubicacion drop constraint if exists ubicacion_nombre_chk;
alter table public.ubicacion add constraint ubicacion_nombre_chk
  check (tipo in ('obra', 'rodado') or nombre is not null or proveedor_id is not null);
alter table public.ubicacion drop constraint if exists ubicacion_proveedor_chk;
alter table public.ubicacion add constraint ubicacion_proveedor_chk
  check (proveedor_id is null or tipo in ('servicio_tecnico', 'tercero'));
comment on column public.ubicacion.proveedor_id is
  'El proveedor que ES este lugar (servicio técnico o tercero). Con proveedor, el nombre del lugar es el del proveedor: no se guarda dos veces.';

-- 3 · Traer o crear el lugar de un proveedor
create or replace function public.ubicacion_de_proveedor(p_proveedor uuid, p_tipo text default 'servicio_tecnico') returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_prov proveedores%rowtype; v_quien text;
begin
  perform public._activo_usuario();
  if p_tipo not in ('servicio_tecnico', 'tercero') then
    raise exception 'un proveedor sólo puede ser servicio técnico o tercero';
  end if;
  select * into v_prov from proveedores where id = p_proveedor and coalesce(es_prueba, false) = false for update;
  if not found then raise exception 'el proveedor no existe'; end if;
  -- Usarlo como servicio técnico lo clasifica, salvo que una persona ya haya declarado otro rubro.
  if p_tipo = 'servicio_tecnico' and v_prov.rubro is null then
    v_quien := coalesce(nullif(auth.jwt() ->> 'email', ''), auth.uid()::text);
    update proveedores set rubro = 'Servicio técnico', rubro_declarado_por = v_quien, rubro_declarado_en = now()
     where id = p_proveedor;
  end if;
  select id into v_id from ubicacion where proveedor_id = p_proveedor;
  if found then
    update ubicacion set archivada = false, tipo = p_tipo where id = v_id and (archivada or tipo <> p_tipo);
    return v_id;
  end if;
  insert into ubicacion (tipo, proveedor_id) values (p_tipo, p_proveedor) returning id into v_id;
  return v_id;
end $fn$;
revoke all on function public.ubicacion_de_proveedor(uuid, text) from public;
grant execute on function public.ubicacion_de_proveedor(uuid, text) to authenticated;

create or replace function public.crear_ubicacion(p_tipo text, p_nombre text, p_contacto text default null) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  perform public._activo_usuario();
  if p_tipo = 'servicio_tecnico' then
    raise exception 'un servicio técnico es un proveedor: elegilo de Proveedores (ubicacion_de_proveedor)';
  end if;
  if p_tipo <> 'tercero' then
    raise exception 'sólo se crean terceros sueltos: el Taller es uno solo, una obra sale del índice de obras, un rodado del rodado y un servicio técnico de Proveedores';
  end if;
  insert into ubicacion (tipo, nombre, contacto) values (p_tipo, btrim(p_nombre), nullif(btrim(p_contacto), ''))
  returning id into v_id;
  return v_id;
end $fn$;

-- 4 · El lugar semilla se archiva si está vacío (si algo llegó a estar ahí, se deja como está y se avisa).
do $$
declare v_id uuid; n int;
begin
  select id into v_id from public.ubicacion where tipo = 'servicio_tecnico' and proveedor_id is null and nombre = 'Servicio técnico sin identificar' and not archivada;
  if v_id is null then return; end if;
  select count(*) into n from public.activo_existencia where ubicacion_id = v_id and cantidad > 0;
  n := n + (select count(*) from public.activo where ubicacion_id = v_id and estado <> 'baja');
  if n > 0 then
    raise notice 'el lugar «Servicio técnico sin identificar» tiene % cosas adentro: no se archiva', n;
  else
    update public.ubicacion set archivada = true where id = v_id;
    raise notice 'archivado «Servicio técnico sin identificar» (vacío)';
  end if;
end $$;
