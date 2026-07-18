-- F0.2 EL EJE — tabla canónica de obras (plan de acción 18/07). Hoy las obras viven como TEXTO
-- suelto con grafías distintas ("LA ESTRELLA"/"ESTRELLA"/"Estrella") en costos_obra, avance_obra,
-- pedidos_materiales y comprobantes_arca → toda join costo↔avance↔HH↔caja es un match frágil.
-- Esto crea la fuente única: 1 fila por obra REAL + una tabla de alias que resuelve cualquier
-- texto crudo a su obra canónica (o lo marca indirecto/excluido). Clasificación confirmada por el
-- dueño (18/07): La Estrella / San Francisco / Messina = obras activas; ARCOR = mantenimiento
-- edilicio; Lebane (LE-*) = EXCLUIDO; resto (Administracion, Taller, F931, UOCRA, IERIC…) = indirecto.
-- NO se carga economía (monto/fechas) acá: eso NO se fabrica, entra con los contratos en su fase.

create table if not exists public.obra_canonica (
  id          text primary key,            -- slug estable: 'la-estrella', 'san-francisco'…
  nombre      text not null,               -- nombre lindo: 'La Estrella'
  estado      text not null default 'activa',  -- activa | cerrada | pausada
  tipo        text not null default 'obra',    -- obra | mantenimiento
  created_at  timestamptz not null default now()
);

-- Resolver: cada TEXTO de obra observado (normalizado) → su obra canónica, o su clasificación.
create table if not exists public.obra_alias (
  alias         text primary key,          -- normObra(texto): lowercase, sin acentos, sin artículos
  obra_id       text references public.obra_canonica(id),  -- null si no es una obra
  clasificacion text not null,             -- obra | mantenimiento | indirecto | excluido
  ejemplo_raw   text                        -- un ejemplo del texto tal como aparece en los datos
);
create index if not exists obra_alias_clasif_idx on public.obra_alias (clasificacion);

comment on table public.obra_canonica is 'F0.2: 1 fila por obra REAL de Echegaray (el eje). Todo cruce costo/avance/HH/caja referencia esto, no texto suelto.';
comment on table public.obra_alias is 'Resolver: texto de obra normalizado → obra_canonica o clasificación (indirecto/excluido). Fuente única compartida por web y chat.';

-- ── Obras canónicas reales (sin economía fabricada) ──
insert into public.obra_canonica (id, nombre, estado, tipo) values
  ('la-estrella',   'La Estrella',   'activa',  'obra'),
  ('san-francisco', 'San Francisco', 'activa',  'obra'),
  ('messina',       'Messina',       'activa',  'obra'),
  ('arcor',         'ARCOR',         'activa',  'mantenimiento'),
  ('galpones',      'Galpones',      'cerrada', 'obra')
on conflict (id) do update set nombre=excluded.nombre, estado=excluded.estado, tipo=excluded.tipo;

-- ── Alias (clave = texto normalizado con la misma regla que la web: lowercase, sin acentos,
--    sin artículos la/el/los/las/de/del, colapsado). Un ejemplo crudo por fila. ──
insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw) values
  -- obras
  ('estrella',            'la-estrella',   'obra',          'LA ESTRELLA'),
  ('san francisco',       'san-francisco', 'obra',          'San Francisco'),
  ('messinas',            'messina',       'obra',          'MESSINAS'),
  ('messina',             'messina',       'obra',          'Messina'),
  -- mantenimiento edilicio
  ('arcor',               'arcor',         'mantenimiento', 'ARCOR'),
  -- indirectos / overhead (no son obras)
  ('administracion',      null, 'indirecto', 'Administracion'),
  ('taller',              null, 'indirecto', 'Taller'),
  ('almacen',             null, 'indirecto', 'Almacen'),
  ('plan pago',           null, 'indirecto', 'Plan de pago'),
  ('f931',                null, 'indirecto', 'F931'),
  ('obras',               null, 'indirecto', 'Obras'),
  ('credito prendario',   null, 'indirecto', 'Credito Prendario'),
  ('uocra',               null, 'indirecto', 'UOCRA'),
  ('fcl',                 null, 'indirecto', 'FCL'),
  ('ieric',               null, 'indirecto', 'IERIC'),
  ('fodeco',              null, 'indirecto', 'FODECO'),
  ('sueldos',             null, 'indirecto', 'Sueldos'),
  ('vehiculos maquinas',  null, 'indirecto', 'Vehiculos / Maquinas'),
  ('papa',                null, 'indirecto', 'Papa'),
  ('saint gobain',        null, 'indirecto', 'SAINT GOBAIN'),
  -- excluido (Lebane: constructora ≠ desarrollador, decisión del dueño)
  ('le comedor',          null, 'excluido',  'LE - Comedor'),
  ('le galpon 9',         null, 'excluido',  'LE - Galpon 9')
on conflict (alias) do update set obra_id=excluded.obra_id, clasificacion=excluded.clasificacion, ejemplo_raw=excluded.ejemplo_raw;
