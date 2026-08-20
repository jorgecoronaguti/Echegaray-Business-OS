-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA TAREA DESCOMPONE UNA ACTIVIDAD, Y LO OPERATIVO SE LE PUEDE COLGAR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ 1 · TAREAS, SIN UNA SEGUNDA ENTIDAD ═══
--
-- «Columnas de carga» se hace en seis pasos: armado, colocación, encofrado, hormigonado,
-- desencofrado, curado. Eso es una actividad con tareas, no seis actividades del cronograma.
--
-- Una tabla `obra_tarea` aparte sería una segunda entidad de trabajo con su propio estado, su propio
-- responsable y su propia manera de quedarse vieja. La tarea ES una actividad que cuelga de otra:
-- `actividad_padre_id`. Se reusa todo lo que ya existe —estado, responsable, fechas, RLS— y no hay
-- nada nuevo que mantener sincronizado.
--
-- UN SOLO NIVEL. Una tarea no puede tener tareas: la jerarquía obligatoria máxima es rubro →
-- actividad, y la tarea es un desagregado opcional. Lo impide un trigger, no la buena voluntad.
--
-- LAS TAREAS NO CUENTAN EN EL AVANCE DE LA OBRA. Si contaran, una actividad partida en seis pesaría
-- siete veces (ella y sus seis) contra una que nadie partió. `obra_avance` las excluye.
--
-- NO HAY ROLLUP AUTOMÁTICO del avance. Que 3 de 6 tareas estén hechas NO significa 50% de la
-- actividad: las seis no duran lo mismo ni pesan lo mismo. La pantalla dice «3 de 6 tareas», que es
-- un hecho, en vez de un porcentaje que nadie puede defender.
--
-- ═══ 2 · UN PEDIDO PUEDE SER DE UNA ACTIVIDAD ═══
--
-- Los ladrillos se piden PARA la mampostería. Poder decirlo permite ver, en la actividad, qué está
-- esperando. `actividad_id` es OPCIONAL y lo seguirá siendo: la obra es el eje operativo y
-- económico, y obligar a elegir actividad en cada pedido agregaría fricción a lo que hoy se carga
-- desde el teléfono en treinta segundos.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · TAREAS
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.obra_actividad
  add column if not exists actividad_padre_id uuid references public.obra_actividad (id) on delete cascade;

create index if not exists obra_actividad_por_padre
  on public.obra_actividad (actividad_padre_id) where actividad_padre_id is not null;

create or replace function public.tarea_de_un_solo_nivel()
returns trigger
language plpgsql
as $$
begin
  if new.actividad_padre_id is null then return new; end if;
  if new.actividad_padre_id = new.id then
    raise exception 'Una actividad no puede ser tarea de sí misma.';
  end if;
  if exists (select 1 from public.obra_actividad p
              where p.id = new.actividad_padre_id and p.actividad_padre_id is not null) then
    raise exception 'Una tarea no puede tener tareas. La jerarquía es rubro → actividad → tarea.';
  end if;
  if exists (select 1 from public.obra_actividad p
              where p.id = new.actividad_padre_id and p.obra_id <> new.obra_id) then
    raise exception 'La tarea y su actividad tienen que ser de la misma obra.';
  end if;
  return new;
end;
$$;

drop trigger if exists obra_actividad_tarea_un_nivel on public.obra_actividad;
create trigger obra_actividad_tarea_un_nivel
  before insert or update of actividad_padre_id on public.obra_actividad
  for each row execute function public.tarea_de_un_solo_nivel();

comment on column public.obra_actividad.actividad_padre_id is
  'Si está, esta fila es una TAREA de esa actividad. Un solo nivel (lo impide un trigger). Las '
  'tareas no cuentan en el avance de la obra: pesarían doble contra una actividad sin partir.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · LA OPERACIÓN SE PUEDE COLGAR DE UNA ACTIVIDAD
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.pedidos_materiales
  add column if not exists actividad_id uuid references public.obra_actividad (id) on delete set null;
create index if not exists pedidos_materiales_por_actividad
  on public.pedidos_materiales (actividad_id) where actividad_id is not null;
grant select (actividad_id), insert (actividad_id), update (actividad_id)
  on public.pedidos_materiales to authenticated;

alter table public.obra_documento
  add column if not exists actividad_id uuid references public.obra_actividad (id) on delete set null;
create index if not exists obra_documento_por_actividad
  on public.obra_documento (actividad_id) where actividad_id is not null;

comment on column public.pedidos_materiales.actividad_id is
  'Para qué actividad se pidió. OPCIONAL a propósito: la obra sigue siendo el eje, y exigirlo '
  'agregaría fricción a un pedido que hoy se carga desde el teléfono en treinta segundos.';

commit;
