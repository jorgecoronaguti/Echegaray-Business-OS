-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA BASE MAESTRA CONSTRUCTIVA — 223 análisis de precio unitario salen del Excel y entran al OS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `Planilla para Cotizar (2).xlsm` tiene 16 hojas y el activo real son tres cosas:
--
--     223 tareas tipo · 1.365 líneas de análisis · 409 recursos (301 en uso, 108 nunca usados)
--
-- La cadena que cotiza hoy, leída de las fórmulas y no supuesta:
--
--     Recursos ──J=D*(1+I)──► Análisis ──VLOOKUP──► Presupuesto ──×H89──► OFERTA
--
-- Este esquema la reproduce con dos correcciones que el Excel no puede hacer, porque son las que le
-- cuestan plata:
--
-- ═══ 1 · LO QUE SE CALCULA NO SE GUARDA ═══
--
-- En el Excel, el costo directo unitario y su desglose viven en fórmulas de cabecera que **76 de las
-- 223 tareas no tienen**: 6,38 M$ del presupuesto quedan sin clasificar en mano de obra / materiales
-- / cargas sociales, y otras 33 tareas tienen mano de obra y NINGUNA carga social — subcosteadas
-- alrededor del 100% en ese componente. Acá no hay columna de costo unitario ni de desglose: los
-- calcula `analisis_costo` desde las líneas. Una tarea no puede quedar «sin fórmula de cabecera»
-- porque no hay cabecera que llenar.
--
-- ═══ 2 · EL TIPO DE RECURSO LO DICE LA UNIDAD, NO EL COLOR ═══
--
-- Se verificó el código de color contra el contenido: en `Análisis` el verde acierta el 78,5% (270
-- filas verdes, 58 son ruido: RODILLO, THINNER, NAFTA) y en `Recursos` **la convención se invierte**
-- —ahí las cargas sociales están en verde—. La fuente confiable es la unidad: `hs` es mano de obra,
-- `hr` es carga social. El color queda como lo que era, una ayuda visual de quien lo pintó.
--
-- ═══ 3 · EL PRECIO ES UNA VERSIÓN, NO UNA COLUMNA ═══
--
-- 82 recursos tienen precio de 2017 y 58 no tienen fecha: el 34% del maestro se usa hoy junto a
-- precios de 2026-05 sin que nada lo diga. `recurso_precio` separa el precio del recurso, con su
-- fecha y su fuente. Un precio sin fecha se puede cargar —existe— pero se ve como lo que es.
-- El corte económico cae solo: el jefe de obra ve la tarea, el análisis y las HH; el precio y el
-- costo viven en otra tabla, que sólo abre `ve_economia()`.
--
-- Lo que NO entra: `#REF!` (217 celdas en tres hojas muertas), los 6 códigos de tarea duplicados
-- —con `VLOOKUP FALSE` el segundo era inalcanzable—, y el código `MAL` que no existe en `Recursos`.
-- Un error histórico de Excel no se convierte en una regla del sistema nuevo.

-- ── 1 · el recurso ────────────────────────────────────────────────────────────────────────────
create table if not exists public.recurso (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null,
  nombre         text not null,
  unidad         text not null,
  tipo           text not null check (tipo in ('mano_obra', 'carga_social', 'material', 'equipo', 'otro')),
  familia        text,
  division       text,
  desperdicio    numeric not null default 0 check (desperdicio >= 0 and desperdicio < 1),
  activo         boolean not null default true,
  origen         text,
  creado_en      timestamptz not null default now(),
  constraint recurso_codigo_unico unique (codigo)
);

comment on column public.recurso.unidad is
  'La unidad ES la semántica del recurso: hs = mano de obra, hr = carga social. Así lo resuelve el '
  'libro que se migró, y es más confiable que el color (que en Recursos está invertido).';
comment on column public.recurso.desperdicio is
  'Fracción, no porcentaje: 0,05 es 5%. El Excel lo aplicaba con J = D*(1+I); acá lo aplica '
  'recurso_costo, que es una vista.';

-- ── 2 · el precio, versionado y con fecha ─────────────────────────────────────────────────────
create table if not exists public.recurso_precio (
  id             uuid primary key default gen_random_uuid(),
  recurso_id     uuid not null references public.recurso (id) on delete cascade,
  costo          numeric not null check (costo >= 0),
  fecha_precio   date,
  fuente         text,
  proveedor      text,
  vigente        boolean not null default true,
  cargado_en     timestamptz not null default now(),
  cargado_por    uuid default auth.uid()
);

create index if not exists recurso_precio_recurso_idx on public.recurso_precio (recurso_id);
create unique index if not exists recurso_precio_uno_vigente
  on public.recurso_precio (recurso_id) where vigente;

comment on column public.recurso_precio.fecha_precio is
  'Puede ser NULL y eso NO es cero ni hoy: son los 58 recursos que el Excel traía sin fecha. La '
  'pantalla los muestra como «sin fecha» y el auditor de frescura los cuenta.';

-- ── 3 · la tarea tipo y su análisis versionado ────────────────────────────────────────────────
create table if not exists public.tarea_tipo (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null,
  nombre             text not null,
  unidad             text not null,
  division           text,
  metodo_medicion    text check (metodo_medicion in ('cantidad', 'pasos', 'manual')),
  descripcion        text,
  activo             boolean not null default true,
  origen             text,
  creado_en          timestamptz not null default now(),
  constraint tarea_tipo_codigo_unico unique (codigo)
);

create table if not exists public.analisis (
  id             uuid primary key default gen_random_uuid(),
  tarea_tipo_id  uuid not null references public.tarea_tipo (id) on delete cascade,
  version        int  not null default 1,
  vigente        boolean not null default true,
  motivo         text,
  autor          uuid default auth.uid(),
  creado_en      timestamptz not null default now(),
  constraint analisis_version_unica unique (tarea_tipo_id, version)
);

create unique index if not exists analisis_uno_vigente
  on public.analisis (tarea_tipo_id) where vigente;

create table if not exists public.analisis_linea (
  id             uuid primary key default gen_random_uuid(),
  analisis_id    uuid not null references public.analisis (id) on delete cascade,
  recurso_id     uuid not null references public.recurso (id) on delete restrict,
  cantidad       numeric not null check (cantidad >= 0),
  orden          int not null default 0,
  nota           text
);

create index if not exists analisis_linea_analisis_idx on public.analisis_linea (analisis_id, orden);

comment on table public.analisis_linea is
  'La composición por unidad de tarea. La unidad de cada línea la pone el recurso: no se repite acá '
  'para que no puedan discrepar. De estas líneas salen el costo unitario, el desglose y las hs/unidad.';

-- ── 4 · lo que se calcula ─────────────────────────────────────────────────────────────────────
create or replace view public.recurso_costo with (security_invoker = true) as
select r.id as recurso_id, r.codigo, r.nombre, r.unidad, r.tipo, r.familia, r.division,
       r.desperdicio, r.activo,
       p.costo                                   as costo_base,
       round(p.costo * (1 + r.desperdicio), 4)   as costo_con_desperdicio,
       p.fecha_precio, p.fuente, p.proveedor
  from public.recurso r
  left join public.recurso_precio p on p.recurso_id = r.id and p.vigente;

comment on view public.recurso_costo is
  'El costo con desperdicio aplicado — el `J = D*(1+I)` del Excel, hecho una sola vez y en un solo '
  'lugar. costo_base NULL significa recurso sin precio cargado: no es cero.';

-- El desglose que el Excel calculaba con SUMIF y le faltaba a 76 tareas de 223.
create or replace view public.analisis_costo with (security_invoker = true) as
select a.id                                     as analisis_id,
       a.tarea_tipo_id, a.version, a.vigente,
       t.codigo, t.nombre, t.unidad, t.division,
       count(l.id)::int                                                        as n_lineas,
       count(*) filter (where rc.costo_base is null and l.id is not null)::int as n_lineas_sin_precio,
       sum(l.cantidad * rc.costo_con_desperdicio)                              as costo_directo,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'mano_obra')     as costo_mano_obra,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'carga_social')  as costo_cargas_sociales,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'material')      as costo_materiales,
       sum(l.cantidad * rc.costo_con_desperdicio) filter (where rc.tipo = 'equipo')        as costo_equipos,
       sum(l.cantidad) filter (where rc.tipo = 'mano_obra')                    as hs_unitarias,
       min(rc.fecha_precio)                                                    as precio_mas_viejo,
       bool_or(rc.tipo = 'mano_obra')                                          as tiene_mano_obra,
       bool_or(rc.tipo = 'carga_social')                                       as tiene_cargas_sociales
  from public.analisis a
  join public.tarea_tipo t on t.id = a.tarea_tipo_id
  left join public.analisis_linea l on l.analisis_id = a.id
  left join public.recurso_costo rc on rc.recurso_id = l.recurso_id
 group by a.id, a.tarea_tipo_id, a.version, a.vigente, t.codigo, t.nombre, t.unidad, t.division;

comment on view public.analisis_costo is
  'El costo unitario y su desglose, calculados desde las líneas. En el Excel esto vivía en fórmulas '
  'de cabecera que 76 de 223 tareas no tenían (6,38 M$ sin clasificar). Acá no puede faltar. '
  'hs_unitarias es el rendimiento: la suma de las cantidades de mano de obra, que es exactamente lo '
  'que el libro re-exponía en M7/N7 y sólo publicaba en 94 de 223 tareas.';

-- El control que el Excel no tenía: una tarea con mano de obra y sin carga social está subcosteada.
create or replace view public.analisis_incompleto with (security_invoker = true) as
select codigo, nombre, unidad, division, n_lineas, n_lineas_sin_precio, hs_unitarias,
       case
         when n_lineas = 0                                    then 'sin análisis'
         when tiene_mano_obra and not tiene_cargas_sociales    then 'mano de obra sin carga social'
         when n_lineas_sin_precio > 0                          then 'líneas con recurso sin precio'
         when hs_unitarias is null or hs_unitarias = 0         then 'sin rendimiento: no aporta HH'
       end as falta
  from public.analisis_costo
 where vigente
   and (n_lineas = 0
        or (tiene_mano_obra and not tiene_cargas_sociales)
        or n_lineas_sin_precio > 0
        or hs_unitarias is null or hs_unitarias = 0);

comment on view public.analisis_incompleto is
  'La deuda de carga de la base maestra, a la vista y contable. Nace poblada: el libro traía 33 '
  'tareas con mano de obra y sin carga social. Se ve, no se corrige sola.';

-- ── 5 · quién ve qué ──────────────────────────────────────────────────────────────────────────
-- La tarea, el análisis y las HH son OPERATIVOS: el jefe de obra los necesita para planificar.
-- El precio y el costo son ECONÓMICOS. Por eso el precio vive en su propia tabla: el corte no lo
-- hace la pantalla escondiendo una columna, lo hace la base no entregando la fila.
alter table public.recurso        enable row level security;
alter table public.recurso_precio enable row level security;
alter table public.tarea_tipo     enable row level security;
alter table public.analisis       enable row level security;
alter table public.analisis_linea enable row level security;

drop policy if exists recurso_lee on public.recurso;
create policy recurso_lee on public.recurso for select to authenticated using (true);
drop policy if exists recurso_escribe on public.recurso;
create policy recurso_escribe on public.recurso for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

drop policy if exists tarea_tipo_lee on public.tarea_tipo;
create policy tarea_tipo_lee on public.tarea_tipo for select to authenticated using (true);
drop policy if exists tarea_tipo_escribe on public.tarea_tipo;
create policy tarea_tipo_escribe on public.tarea_tipo for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

drop policy if exists analisis_lee on public.analisis;
create policy analisis_lee on public.analisis for select to authenticated using (true);
drop policy if exists analisis_escribe on public.analisis;
create policy analisis_escribe on public.analisis for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

drop policy if exists analisis_linea_lee on public.analisis_linea;
create policy analisis_linea_lee on public.analisis_linea for select to authenticated using (true);
drop policy if exists analisis_linea_escribe on public.analisis_linea;
create policy analisis_linea_escribe on public.analisis_linea for all to authenticated
  using (public.es_administracion()) with check (public.es_administracion());

drop policy if exists recurso_precio_lee on public.recurso_precio;
create policy recurso_precio_lee on public.recurso_precio for select to authenticated
  using (public.ve_economia());
drop policy if exists recurso_precio_escribe on public.recurso_precio;
create policy recurso_precio_escribe on public.recurso_precio for all to authenticated
  using (public.ve_economia()) with check (public.ve_economia());

-- Una policy sin GRANT no se evalúa: la tabla contesta «permission denied» y Next lo muestra como 404.
grant select on public.recurso, public.tarea_tipo, public.analisis, public.analisis_linea to authenticated;
grant insert, update, delete on public.recurso, public.tarea_tipo, public.analisis, public.analisis_linea to authenticated;
grant select, insert, update, delete on public.recurso_precio to authenticated;
grant all on public.recurso, public.recurso_precio, public.tarea_tipo, public.analisis, public.analisis_linea to service_role;

grant select on public.recurso_costo, public.analisis_costo, public.analisis_incompleto to authenticated;
grant select on public.recurso_costo, public.analisis_costo, public.analisis_incompleto to service_role;
