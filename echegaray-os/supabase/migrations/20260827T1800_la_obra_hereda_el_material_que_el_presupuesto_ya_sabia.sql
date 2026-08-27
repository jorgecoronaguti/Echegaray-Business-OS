-- LA OBRA HEREDA EL MATERIAL Y EL EQUIPO QUE EL PRESUPUESTO YA SABÍA (27/08/2026)
--
-- ═══ LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO ═══
--
-- Sobre la base real, de las 26 actividades nacidas de un presupuesto:
--
--   · 26 conservan `tarea_tipo_id`, `unidad`, `cantidad_objetivo` y `analisis_id`  ← ya andaba
--   · 25 conservan `hh_plan`                                                       ← ya andaba
--   ·  0 tienen plan de materiales o de equipos                                    ← ESTO
--
-- Y del otro lado del puente hay **462 líneas de composición congelada en 52 partidas**: el día que
-- se ofertó quedó escrito cuántos m³ de hormigón, cuántos kg de hierro y cuántas horas de vibrador
-- lleva cada unidad de cada partida. Nada de eso llegaba nunca a la obra.
--
-- La consecuencia concreta: cuando llega la factura del corralón, no hay contra qué compararla. El
-- desvío de material —que en una obra de hormigón es la mitad del costo— se descubre al cierre, que
-- es cuando ya no se puede hacer nada. «Compramos 340 bolsas» no dice nada solo; «compramos 340 y
-- habíamos previsto 280» dice todo.
--
-- ═══ POR QUÉ ACÁ NO HAY UN SOLO PRECIO ═══
--
-- La tentación era copiar también el costo congelado y tener «el plan valorizado» de un saque. No.
-- El costo de la oferta ya vive UNA vez, en `cotizacion_partida_composicion`, y llegar a él desde la
-- obra es un join por `cotizacion_partida_id`. Copiarlo acá sería la segunda versión del mismo
-- número, con la garantía de que algún día no van a coincidir.
--
-- Y hay una razón de permisos que es igual de fuerte: quién ve plata y quién ve obra no son el mismo
-- conjunto de gente. El jefe de obra tiene que ver que la actividad lleva 12 m³ de H-21; no tiene
-- que ver a cuánto se compró el m³. Con el costo adentro de la tabla, la política de filas no
-- alcanza para separar esas dos cosas —haría falta permiso por columna, y todos entran como el
-- mismo rol de base—. Sin el costo, el problema no existe: **esta tabla es el plan FÍSICO.**
--
-- ═══ POR QUÉ UN DISPARADOR Y NO UN AGREGADO A `convertir_partida_a_plan` ═══
--
-- Es la lección que ya está escrita en la 1410 (`una actividad nueva nunca pierde su tipo`): la
-- copia no puede depender de que cada camino nuevo que cree actividades se acuerde de hacerla. Hoy
-- los caminos son la conversión de a una y la conversión en lote; mañana entra por el chat. El
-- disparador los cubre a todos, incluidos los que todavía no existen.

-- ── 1 · el plan físico de la actividad ─────────────────────────────────────────────────────────

create table if not exists public.obra_actividad_insumo_plan (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               text not null references public.obra_canonica (id) on delete cascade,
  actividad_id          uuid not null references public.obra_actividad (id) on delete cascade,
  cotizacion_partida_id uuid references public.cotizacion_partida (id) on delete set null,
  orden                 int  not null default 0,
  recurso_codigo        text,
  recurso_nombre        text not null,
  tipo                  text,
  unidad                text,
  -- CUÁNTO LLEVA UNA UNIDAD, tal como se ofertó. Es lo que permite recomputar el plan si la
  -- cantidad de la actividad cambia, sin volver a mirar el presupuesto.
  cantidad_unitaria     numeric not null,
  desperdicio           numeric,
  -- CUÁNTO LLEVA ESTA ACTIVIDAD: cantidad_unitaria × cantidad_objetivo × (1 + desperdicio).
  cantidad_plan         numeric not null,
  origen                text not null default 'presupuesto_congelado',
  creado_en             timestamptz not null default now(),
  constraint obra_actividad_insumo_plan_unico unique (actividad_id, orden)
);

create index if not exists obra_actividad_insumo_plan_actividad_idx
  on public.obra_actividad_insumo_plan (actividad_id, orden);
create index if not exists obra_actividad_insumo_plan_obra_idx
  on public.obra_actividad_insumo_plan (obra_id, tipo);

comment on table public.obra_actividad_insumo_plan is
  'El plan FÍSICO de una actividad —cuánto material, equipo y mano de obra lleva— heredado de la '
  'composición congelada del presupuesto. Sin precio a propósito: el costo de la oferta vive una '
  'sola vez en cotizacion_partida_composicion y se llega por cotizacion_partida_id.';
comment on column public.obra_actividad_insumo_plan.cantidad_unitaria is
  'Lo que lleva UNA unidad de la tarea. Se guarda además del total para poder recomputar el plan '
  'cuando la cantidad de la actividad se corrige, sin volver a abrir el presupuesto.';
comment on column public.obra_actividad_insumo_plan.origen is
  'De dónde salió la línea. «presupuesto_congelado» es la única que escribe el disparador; una '
  'línea agregada a mano en obra tiene que decir que es de obra, no disfrazarse de oferta.';

-- ── 2 · quién lo ve ────────────────────────────────────────────────────────────────────────────
--
-- RLS NO ES GRANT: sin el grant, la política más generosa devuelve «denied» y Next lo muestra como
-- un 404 que no explica nada. Van los dos.

alter table public.obra_actividad_insumo_plan enable row level security;

grant select on public.obra_actividad_insumo_plan to authenticated, service_role;
grant insert, update, delete on public.obra_actividad_insumo_plan to authenticated;

drop policy if exists obra_actividad_insumo_plan_select on public.obra_actividad_insumo_plan;
create policy obra_actividad_insumo_plan_select on public.obra_actividad_insumo_plan
  for select to authenticated
  using ((select public.es_administracion())
         or (select public.current_rol()) = 'jefe_obra'
         or public.ve_obra(obra_id));

-- Escribir el plan es un acto de administración: es la línea base contra la que se va a medir la
-- compra, y una línea base que puede editar quien la va a incumplir no controla nada.
drop policy if exists obra_actividad_insumo_plan_escribe on public.obra_actividad_insumo_plan;
create policy obra_actividad_insumo_plan_escribe on public.obra_actividad_insumo_plan
  for all to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

-- ── 3 · el disparador que copia, y por qué copia sólo en algunas actividades ───────────────────
--
-- Una partida convertida genera un árbol: rubro → frente → tarea(s). La cantidad de la partida
-- aparece REPETIDA en varios niveles —el frente y sus pasos declaran los dos la cantidad del
-- frente—, así que copiar el material en todos multiplicaría el plan por la cantidad de pasos. La
-- regla es «lo lleva quien no tiene un frente arriba»:
--
--   · partida de un solo frente sin plantilla → la tarea cuelga del RUBRO       → lleva el plan
--   · varios frentes o con plantilla          → el FRENTE lleva el plan, y sus hijos no
--
-- Así la suma sobre la obra da exactamente la cantidad de la partida, que es la única forma de que
-- el plan de materiales cierre contra la oferta.

create or replace function public.sembrar_insumo_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_padre_rol text;
begin
  if new.cotizacion_partida_id is null or new.cantidad_objetivo is null then
    return null;
  end if;

  select rol_estructura into v_padre_rol from public.obra_actividad where id = new.actividad_padre_id;

  if not (new.rol_estructura = 'frente'
          or (new.tipo = 'tarea' and coalesce(v_padre_rol, '') <> 'frente')) then
    return null;
  end if;

  insert into public.obra_actividad_insumo_plan
    (obra_id, actividad_id, cotizacion_partida_id, orden, recurso_codigo, recurso_nombre, tipo,
     unidad, cantidad_unitaria, desperdicio, cantidad_plan)
  select new.obra_id, new.id, new.cotizacion_partida_id, c.orden, c.recurso_codigo, c.recurso_nombre,
         c.tipo, c.unidad, c.cantidad, c.desperdicio,
         c.cantidad * new.cantidad_objetivo * (1 + coalesce(c.desperdicio, 0))
    from public.cotizacion_partida_composicion c
   where c.partida_id = new.cotizacion_partida_id
  on conflict on constraint obra_actividad_insumo_plan_unico do nothing;

  return null;
end $$;

comment on function public.sembrar_insumo_plan() is
  'Copia la composición congelada del presupuesto al plan físico de la actividad recién creada. '
  'No bloquea nunca: una partida sin composición congelada crea la actividad igual, sin plan.';

drop trigger if exists obra_actividad_sembrar_insumo_plan on public.obra_actividad;
create trigger obra_actividad_sembrar_insumo_plan
  after insert on public.obra_actividad
  for each row execute function public.sembrar_insumo_plan();

-- ── 4 · las que ya nacieron huérfanas ──────────────────────────────────────────────────────────
--
-- El disparador cubre de acá en adelante. Las 26 que ya existen se completan una vez, con la misma
-- regla y con `on conflict do nothing`: correr esto dos veces no duplica ni una línea.

insert into public.obra_actividad_insumo_plan
  (obra_id, actividad_id, cotizacion_partida_id, orden, recurso_codigo, recurso_nombre, tipo,
   unidad, cantidad_unitaria, desperdicio, cantidad_plan)
select a.obra_id, a.id, a.cotizacion_partida_id, c.orden, c.recurso_codigo, c.recurso_nombre,
       c.tipo, c.unidad, c.cantidad, c.desperdicio,
       c.cantidad * a.cantidad_objetivo * (1 + coalesce(c.desperdicio, 0))
  from public.obra_actividad a
  left join public.obra_actividad p on p.id = a.actividad_padre_id
  join public.cotizacion_partida_composicion c on c.partida_id = a.cotizacion_partida_id
 where a.cotizacion_partida_id is not null
   and a.cantidad_objetivo is not null
   and (a.rol_estructura = 'frente'
        or (a.tipo = 'tarea' and coalesce(p.rol_estructura, '') <> 'frente'))
on conflict on constraint obra_actividad_insumo_plan_unico do nothing;

-- ── 5 · lo que la obra necesita mirar: el material agregado, sin tener que sumarlo a mano ──────

create or replace view public.obra_material_plan
with (security_invoker = true) as
select i.obra_id,
       o.nombre                    as obra,
       i.tipo,
       coalesce(i.recurso_codigo, i.recurso_nombre) as recurso,
       i.recurso_nombre,
       i.unidad,
       sum(i.cantidad_plan)        as cantidad_plan,
       count(*)::int               as actividades
  from public.obra_actividad_insumo_plan i
  left join public.obra_canonica o on o.id = i.obra_id
 group by i.obra_id, o.nombre, i.tipo, coalesce(i.recurso_codigo, i.recurso_nombre), i.recurso_nombre, i.unidad;

comment on view public.obra_material_plan is
  'Cuánto de cada recurso preveía la oferta para toda la obra. Es el contra qué de las compras: '
  'sin esta línea base, una factura del corralón no se puede juzgar hasta el cierre de la obra.';

grant select on public.obra_material_plan to authenticated, service_role;
