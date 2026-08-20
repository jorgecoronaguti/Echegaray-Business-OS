-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CONTROL DE OBRA · LA ACTIVIDAD SE PUEDE MEDIR Y LA EJECUCIÓN DIARIA ES UN HECHO HISTÓRICO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ QUÉ HAY HOY, Y QUÉ FALTA ═══
--
-- `obra_actividad` ya es la entidad canónica del trabajo: tiene la jerarquía (`tipo = 'resumen'` es
-- el rubro y `codigo_padre` lo cuelga), fechas de plan y de baseline, `hh_plan`, responsable, orden y
-- archivada. Gantt, Próximos y Plan vs Real ya leen de ahí. NO se crea una segunda entidad.
--
-- Le faltan tres cosas para que el control de obra deje de depender de «Avances de Obra»:
--
--   1. PODER MEDIRSE EN UNIDADES FÍSICAS. 180 m² de mampostería, 12 columnas, 42 m³ de excavación.
--   2. UN REGISTRO DIARIO DE LO QUE PASÓ, que es un hecho con fecha y no se pisa.
--   3. QUE EL AVANCE SE CALCULE en vez de escribirse a mano.
--
-- ═══ LO QUE EL EXCEL SÍ TIENE, Y QUE HAY QUE CONSERVAR ═══
--
-- Se leyó «Avances de Obra» entero. NO tiene columnas de unidad ni de cantidad —los encabezados
-- reales son `# · Activity · Comment · Start · End · Days · Status · Días Reales · % Done`—. Lo que
-- sí tiene, y es lo valioso, es la GRILLA DIARIA a la derecha: una columna por día, y en la celda el
-- avance de ESE día. «MONTAJE DE SOPORTES» lleva 0% el 16/7, 70% el 22/7 y 30% el 23/7.
--
-- O sea: la planilla ya lleva un registro diario incremental. Eso es exactamente `obra_ejecucion`, y
-- se migra tal cual. Las unidades y cantidades no se migran porque no existen: son la mejora.
--
-- ═══ EL AVANCE TIENE UN MÉTODO, Y SE DECLARA ═══
--
-- Un avance calculado desde producción y un avance escrito a mano no son el mismo número, y
-- mezclarlos en silencio es cómo una obra termina informando 20,56% que nadie puede reconstruir.
-- `metodo_avance` dice cuál se usa, y la vista publica además de dónde salió el número.

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1 · LA ACTIVIDAD SE PUEDE MEDIR
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.obra_actividad
  add column if not exists unidad text,
  add column if not exists cantidad_objetivo numeric,
  add column if not exists metodo_avance text not null default 'manual',
  add column if not exists cuadrilla_id uuid references public.cuadrilla (id) on delete set null,
  -- La puerta a Cotizaciones, que NO se desarrolla ahora. Guardar el código de la partida y la
  -- cantidad presupuestada no cuesta nada hoy y es lo único que después permite que una cotización
  -- ganada genere el plan sin recargar cantidades. Sin esto, esa relación exige migrar datos.
  add column if not exists partida_codigo text,
  add column if not exists partida_cantidad numeric;

alter table public.obra_actividad drop constraint if exists obra_actividad_metodo_avance_check;
alter table public.obra_actividad add constraint obra_actividad_metodo_avance_check
  check (metodo_avance in ('cantidad', 'manual'));

-- Medir en cantidad exige saber cuánto es el total: sin objetivo, el porcentaje no existe.
alter table public.obra_actividad drop constraint if exists obra_actividad_medible_completa;
alter table public.obra_actividad add constraint obra_actividad_medible_completa
  check (metodo_avance <> 'cantidad' or (unidad is not null and cantidad_objetivo is not null));

comment on column public.obra_actividad.metodo_avance is
  'cantidad = el avance se calcula desde la producción cargada. manual = alguien declara el '
  'porcentaje. NUNCA se mezclan en silencio: la vista obra_actividad_control publica origen_avance.';

comment on column public.obra_actividad.cuadrilla_id is
  'La cuadrilla PREVISTA. Quién trabajó de verdad sale de registros_hh: esto es plan, no real.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2 · CINCO ESTADOS, Y «BLOQUEADA» NO ES UNO DE ELLOS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- El estado guardado tiene CUATRO valores. «Bloqueada» se DERIVA de que exista un impedimento
-- abierto en `obra_restriccion`: guardarla como quinto valor daría dos verdades sobre el mismo
-- hecho, y el día que alguien resuelva el impedimento la actividad seguiría diciendo que está
-- bloqueada. La quinta columna del tablero existe igual — sale de la vista.

update public.obra_actividad set estado = case
  when estado in ('Completado', 'completado', 'Hecha') then 'hecha'
  when estado in ('En progreso', 'en progreso', 'En curso') then 'en_curso'
  when estado is null then 'pendiente'
  else lower(estado) end
where estado is null or estado <> lower(estado) or estado in ('completado', 'en progreso');

update public.obra_actividad set estado = 'pendiente'
 where estado not in ('pendiente', 'lista', 'en_curso', 'hecha');

alter table public.obra_actividad alter column estado set default 'pendiente';
alter table public.obra_actividad alter column estado set not null;
alter table public.obra_actividad drop constraint if exists obra_actividad_estado_check;
alter table public.obra_actividad add constraint obra_actividad_estado_check
  check (estado in ('pendiente', 'lista', 'en_curso', 'hecha'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3 · LA EJECUCIÓN DIARIA
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Un parte de ejecución es un HECHO: pasó tal día, lo cargó alguien, y no se reescribe para
-- representar el acumulado. El acumulado se suma; la historia se conserva. Es la misma regla por la
-- que `registros_hh` guarda las horas de cada día en vez de un total por actividad.
--
-- NO LLEVA HORAS NI PERSONAS. Las horas de esa jornada se escriben en `registros_hh`, que es la
-- fuente canónica de tiempo desde el 19/08 y de donde salen la liquidación futura y el costo por
-- obra. Copiarlas acá sería cargar la misma hora dos veces.

create table if not exists public.obra_ejecucion (
  id uuid primary key default gen_random_uuid(),
  obra_id text not null references public.obra_canonica (id) on delete cascade,
  actividad_id uuid not null references public.obra_actividad (id) on delete cascade,
  fecha date not null,
  -- Una de las dos, según el método de la actividad. Las dos en null no es un parte: es nada.
  cantidad numeric,
  avance_pct numeric,
  comentario text,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  -- De dónde salió la fila: 'web' la cargó una persona, 'avances_de_obra_drive' la trajo la grilla
  -- diaria del Excel. Sin esto no se puede volver atrás una migración sin llevarse trabajo real.
  fuente text not null default 'web',
  constraint obra_ejecucion_dice_algo check (cantidad is not null or avance_pct is not null),
  constraint obra_ejecucion_pct_valido check (avance_pct is null or (avance_pct >= 0 and avance_pct <= 100)),
  constraint obra_ejecucion_cantidad_valida check (cantidad is null or cantidad >= 0)
);

create index if not exists obra_ejecucion_por_actividad on public.obra_ejecucion (actividad_id, fecha);
create index if not exists obra_ejecucion_por_obra on public.obra_ejecucion (obra_id, fecha desc);

-- La misma celda del Excel no entra dos veces por más que se re-corra la migración.
create unique index if not exists obra_ejecucion_una_por_dia_del_sheet
  on public.obra_ejecucion (actividad_id, fecha) where fuente = 'avances_de_obra_drive';

alter table public.obra_ejecucion enable row level security;

grant select, insert, update, delete on public.obra_ejecucion to authenticated;

-- Ver la ejecución de una obra es verla operar: Administración toda, Obras las suyas.
create policy obra_ejecucion_select on public.obra_ejecucion for select to authenticated
  using (public.es_administracion() or public.ve_obra(obra_id));

create policy obra_ejecucion_insert on public.obra_ejecucion for insert to authenticated
  with check ((public.current_rol() = any (array['direccion', 'administracion', 'jefe_obra']))
    and (public.es_administracion() or public.ve_obra(obra_id)));

create policy obra_ejecucion_update on public.obra_ejecucion for update to authenticated
  using (public.es_administracion() or public.ve_obra(obra_id))
  with check (public.es_administracion() or public.ve_obra(obra_id));

create policy obra_ejecucion_delete on public.obra_ejecucion for delete to authenticated
  using (public.es_administracion() or public.ve_obra(obra_id));

commit;
