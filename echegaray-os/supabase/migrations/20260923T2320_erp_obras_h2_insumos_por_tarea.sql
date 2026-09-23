-- ERP OBRAS · H2.4 — INSUMOS POR TAREA (diseño C04: chips de activo con ubicación real y material
-- «sin pedir» / pedido).
--
-- Qué existe hoy y por qué no alcanza: `obra_actividad_insumo_plan` ya lista los insumos de la
-- tarea (tipo material / mano_obra / carga_social, cantidad plan, origen). Le falta poder apuntar a
-- un ACTIVO real de Herramientas (para decir «en la obra» / «en Taller») y al PEDIDO de material que
-- lo cubre. No se crea `actividad_insumo` aparte: son dos columnas y un tipo más.

alter table public.obra_actividad_insumo_plan
  add column if not exists activo_id uuid references public.activo(id) on delete set null,
  add column if not exists pedido_id uuid references public.pedidos_materiales(id) on delete set null;
comment on column public.obra_actividad_insumo_plan.activo_id is
  'Insumo tipo activo: el activo de Herramientas; su ubicación real sale de activo_existencia/ubicacion.';
comment on column public.obra_actividad_insumo_plan.pedido_id is
  'Insumo tipo material: el pedido que lo cubre. NULL = sin pedir.';

-- `tipo` admite ahora 'activo' además de material / mano_obra / carga_social. Si hay un CHECK, se rehace.
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.obra_actividad_insumo_plan'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%';
  if v_def is not null and v_def not ilike '%activo%' then
    execute 'alter table public.obra_actividad_insumo_plan drop constraint ' || (
      select conname from pg_constraint
       where conrelid = 'public.obra_actividad_insumo_plan'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%' limit 1);
    alter table public.obra_actividad_insumo_plan
      add constraint obra_actividad_insumo_plan_tipo_check
      check (tipo in ('material', 'mano_obra', 'carga_social', 'activo'));
  end if;
end $$;
