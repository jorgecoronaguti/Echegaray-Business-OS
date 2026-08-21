-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA JORNADA, LA CAPACIDAD Y EL CALENDARIO SON DATOS DEL MODELO, NO CONSTANTES DEL FRONT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- El motor que convierte HH en plazo no puede dividir HH por cantidad de personas. La pantalla «08 ·
-- Dotación y Proyección» lo dice sin vueltas: hay un TOPE por frente, y arriba de ese tope poner
-- más gente no acorta nada. Y una persona no rinde lo mismo que otra.
--
--     HH previstas ÷ (capacidad ponderada de la cuadrilla × jornada) = duración
--
-- Los cuatro insumos de esa cuenta son datos y ninguno existía:
--
--   1. la CAPACIDAD PONDERADA por categoría (of. especializado 1,2 · oficial 1,0 · medio oficial
--      0,8 · ayudante 0,6). Las cuatro categorías del contrato coinciden exactamente con las que
--      ya tiene `personas.categoria`: 29 oficiales, 16 ayudantes, 6 medio oficiales, 2 oficiales
--      especializados. No se inventa un catálogo nuevo: se le pone el peso al que ya existe.
--   2. la JORNADA y los días hábiles, que pueden ser distintos por obra.
--   3. el CALENDARIO: feriados nacionales, provinciales (San Juan) y paros o excepciones de una
--      obra puntual.
--   4. el TOPE DE FRENTE, que es del frente y por eso vive en la actividad contenedora.
--
-- ═══ LAS CARGAS SOCIALES SE CALCULAN, NO SE TIPEAN ═══
--
-- El libro tenía TRES modelos de carga social conviviendo: el vivo (dos recursos de 5.200 y 4.200
-- $/hr, que dan un 104,3% implícito para oficial y 99,1% para ayudante, y un ratio efectivo por
-- tarea que va de 0,297 a 2,408 — o sea, nadie lo decide), el legacy de 2022, y uno **correcto y
-- desenchufado** en la hoja `MO Lu-Vi 8 a 16` que parametriza concepto por concepto y da 51,91%.
-- Ninguna fórmula del libro referenciaba el correcto.
--
-- Acá entra el correcto, como conceptos con vigencia. Se carga con los valores de esa hoja, que
-- son los que el propio libro había calculado bien: hay que verificarlos contra la normativa
-- vigente antes de cotizar con ellos, y por eso cada uno declara su fuente.

-- ── 1 · la capacidad de cada categoría ────────────────────────────────────────────────────────
create table if not exists public.categoria_obra (
  clave        text primary key,
  nombre       text not null,
  capacidad    numeric not null check (capacidad > 0),
  orden        int not null default 0,
  convenio     text,
  activa       boolean not null default true
);

insert into public.categoria_obra (clave, nombre, capacidad, orden, convenio) values
  ('oficial_especializado', 'Oficial especializado', 1.2, 1, 'UOCRA 76/75'),
  ('oficial',               'Oficial',               1.0, 2, 'UOCRA 76/75'),
  ('medio_oficial',         'Medio oficial',         0.8, 3, 'UOCRA 76/75'),
  ('ayudante',              'Ayudante',              0.6, 4, 'UOCRA 76/75')
on conflict (clave) do nothing;

comment on table public.categoria_obra is
  'La capacidad ponderada de cada categoría. Las cuatro claves son las que ya usa personas.categoria '
  '—no es un catálogo paralelo—. El jornal NO vive acá: sale de uocra_escala, que tiene 115 filas '
  'con vigencia y es la fuente real del convenio.';

-- ── 2 · las cargas sociales, concepto por concepto y con vigencia ─────────────────────────────
create table if not exists public.carga_social (
  id             uuid primary key default gen_random_uuid(),
  concepto       text not null,
  porcentaje     numeric not null check (porcentaje >= 0),
  vigencia_desde date not null,
  vigencia_hasta date,
  fuente         text,
  cargado_en     timestamptz not null default now(),
  constraint carga_social_concepto_vigencia unique (concepto, vigencia_desde)
);

insert into public.carga_social (concepto, porcentaje, vigencia_desde, fuente) values
  ('Jubilación',                        0.1077, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('Adicional UOCRA',                   0.0500, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('INSSJP',                            0.0159, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('Fondo Nacional de Empleo',          0.0094, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('Asignaciones familiares',           0.0470, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('Obra social',                       0.0600, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('ART',                               0.1030, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('Fondo de cese laboral',             0.1200, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente'),
  ('FICS + IERIC + FODECO',             0.0048, '2026-01-01', 'hoja «MO Lu-Vi 8 a 16» de Planilla para Cotizar — A VERIFICAR contra normativa vigente')
on conflict (concepto, vigencia_desde) do nothing;

create or replace view public.carga_social_vigente with (security_invoker = true) as
select concepto, porcentaje, vigencia_desde, fuente
  from public.carga_social
 where vigencia_desde <= current_date
   and (vigencia_hasta is null or vigencia_hasta >= current_date);

comment on view public.carga_social_vigente is
  'Los conceptos que rigen hoy. Suman 51,78% con los valores de la planilla, contra el 104,3% que '
  'el libro estaba aplicando de hecho vía dos recursos en $/hr que nadie había decidido. La fuente '
  'de cada uno dice A VERIFICAR a propósito: es normativa cambiante y nadie la confirmó todavía.';

-- ── 3 · el calendario laboral ─────────────────────────────────────────────────────────────────
create table if not exists public.calendario_no_laborable (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  motivo     text not null,
  alcance    text not null default 'nacional' check (alcance in ('nacional', 'provincial', 'gremial', 'obra')),
  obra_id    text references public.obra_canonica (id) on delete cascade,
  creado_en  timestamptz not null default now(),
  constraint calendario_alcance_obra check ((alcance = 'obra') = (obra_id is not null))
);

create unique index if not exists calendario_fecha_alcance
  on public.calendario_no_laborable (fecha, alcance, coalesce(obra_id, ''));

comment on table public.calendario_no_laborable is
  'Lo que NO se trabaja. Nacional y provincial (San Juan) valen para todas las obras; alcance=obra '
  'es la excepción de una sola. Se declara lo no laborable, no lo laborable: la lista es corta y no '
  'hay que mantener 365 filas por año.';

-- ── 4 · la jornada, por obra ──────────────────────────────────────────────────────────────────
alter table public.obra_canonica add column if not exists jornada_horas numeric not null default 8
  check (jornada_horas > 0 and jornada_horas <= 24);
alter table public.obra_canonica add column if not exists dias_habiles int[] not null default '{1,2,3,4,5}';
alter table public.obra_canonica add column if not exists radio_obra_metros int not null default 300
  check (radio_obra_metros > 0);

comment on column public.obra_canonica.dias_habiles is
  'Días de la semana que se trabajan, en la numeración de isodow (1 = lunes … 7 = domingo). Por '
  'defecto lunes a viernes. Una obra que trabaja sábados lo declara acá, no lo asume el cálculo.';

-- ── 5 · el tope del frente ────────────────────────────────────────────────────────────────────
alter table public.obra_actividad add column if not exists rol_estructura text
  check (rol_estructura is null or rol_estructura in ('rubro', 'sector', 'nivel', 'frente', 'elemento'));
alter table public.obra_actividad add column if not exists tope_frente int
  check (tope_frente is null or tope_frente > 0);
alter table public.obra_actividad add column if not exists dotacion_prevista int
  check (dotacion_prevista is null or dotacion_prevista >= 0);
alter table public.obra_actividad add column if not exists analisis_id uuid references public.analisis (id) on delete set null;
alter table public.obra_actividad add column if not exists tarea_tipo_id uuid references public.tarea_tipo (id) on delete set null;
alter table public.obra_actividad add column if not exists cotizacion_partida_id uuid references public.cotizacion_partida (id) on delete set null;

comment on column public.obra_actividad.rol_estructura is
  'Qué es este contenedor dentro de la obra. NULL es válido: una obra chica no está obligada a '
  'declarar sectores ni frentes. El tope de personas simultáneas es del FRENTE, por eso tope_frente '
  'vive acá y no en la actividad ejecutable.';
comment on column public.obra_actividad.analisis_id is
  'El análisis de la base maestra con el que se planificó esta actividad. Junto con '
  'cotizacion_partida_id es la trazabilidad completa: avance físico y costo consumido pasan a ser '
  'la misma verdad leída de dos maneras.';

-- ── 6 · días hábiles entre dos fechas, respetando el calendario ───────────────────────────────
create or replace function public.dias_habiles(p_obra_id text, p_desde date, p_hasta date)
returns int language sql stable as $$
  select count(*)::int
    from generate_series(p_desde, p_hasta, interval '1 day') d
   where extract(isodow from d)::int = any (
           coalesce((select dias_habiles from public.obra_canonica where id = p_obra_id), '{1,2,3,4,5}'))
     and not exists (
           select 1 from public.calendario_no_laborable c
            where c.fecha = d::date
              and (c.alcance <> 'obra' or c.obra_id = p_obra_id));
$$;

comment on function public.dias_habiles(text, date, date) is
  'Días que realmente se trabajan entre dos fechas en esa obra. Sin obra declarada cae a lunes-'
  'viernes, que es el default de obra_canonica, no una constante escondida en el front.';

-- ── 7 · la capacidad de una cuadrilla ─────────────────────────────────────────────────────────
create or replace view public.cuadrilla_capacidad with (security_invoker = true) as
select cu.id                                as cuadrilla_id,
       cu.nombre,
       count(ci.id)::int                    as personas,
       sum(coalesce(cat.capacidad, 1.0))    as capacidad_ponderada,
       count(*) filter (where cat.clave is null)::int as personas_sin_categoria
  from public.cuadrilla cu
  left join public.cuadrilla_integrante ci
         on ci.cuadrilla_id = cu.id and (ci.hasta is null or ci.hasta >= current_date)
  left join public.personas p on p.id = ci.persona_id
  left join public.categoria_obra cat on cat.clave = p.categoria
 group by cu.id, cu.nombre;

comment on view public.cuadrilla_capacidad is
  'Cuánto rinde de verdad una cuadrilla. Cuatro ayudantes no son cuatro oficiales: son 2,4. Una '
  'persona sin categoría cargada pesa 1,0 y se cuenta aparte en personas_sin_categoria — para que '
  'el supuesto se vea en vez de esconderse dentro del total.';

-- ── 8 · permisos ──────────────────────────────────────────────────────────────────────────────
alter table public.categoria_obra          enable row level security;
alter table public.carga_social            enable row level security;
alter table public.calendario_no_laborable enable row level security;

drop policy if exists categoria_obra_lee on public.categoria_obra;
create policy categoria_obra_lee on public.categoria_obra for select to authenticated using (true);
drop policy if exists categoria_obra_escribe on public.categoria_obra;
create policy categoria_obra_escribe on public.categoria_obra for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

-- Las cargas sociales son un porcentaje sobre remuneración: es económico.
drop policy if exists carga_social_economia on public.carga_social;
create policy carga_social_economia on public.carga_social for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

drop policy if exists calendario_lee on public.calendario_no_laborable;
create policy calendario_lee on public.calendario_no_laborable for select to authenticated using (true);
drop policy if exists calendario_escribe on public.calendario_no_laborable;
create policy calendario_escribe on public.calendario_no_laborable for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

grant select on public.categoria_obra to authenticated;
grant insert, update, delete on public.categoria_obra to authenticated;
grant select, insert, update, delete on public.carga_social to authenticated;
grant select, insert, update, delete on public.calendario_no_laborable to authenticated;
grant all on public.categoria_obra, public.carga_social, public.calendario_no_laborable to service_role;
grant select on public.carga_social_vigente, public.cuadrilla_capacidad to authenticated;
grant select on public.carga_social_vigente, public.cuadrilla_capacidad to service_role;
grant execute on function public.dias_habiles(text, date, date) to authenticated;
