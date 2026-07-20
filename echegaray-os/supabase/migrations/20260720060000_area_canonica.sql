-- ÁREA CANÓNICA — las 8 áreas del OS como fuente única, igual que obra_canonica/obra_alias.
--
-- PROBLEMA REAL (auditado 20/07 sobre datos vivos, no supuesto): el OS ya tiene una biblioteca de
-- conocimiento repartida en 7 tablas, y cada una clasifica con una taxonomía DISTINTA:
--
--   acciones.area              32 filas  → las 8 áreas oficiales          ✔ canónica
--   conocimiento_empresa.area  57 filas  → texto libre; 50 en 'direccion' (área que ya no existe)
--   fuentes_datos.area         23 filas  → 11 dominios Title Case ('Tesorería', 'Personas')
--   preguntas_negocio.dominio  18 filas  → 12 dominios Title Case
--   scorecard_dominios.dominio 22 filas  → 22 dominios, uno por fila
--   reportes_definiciones      3 filas   → nombres PRE-migración ('obras_produccion', 'direccion'),
--                                          que 20260718210000_areas_8 renombró SOLO en acciones
--   backlog_autonomo           46 filas  → sin columna de área: 42 pendientes que nadie puede rutear
--
-- Consecuencia medible: no se puede responder "qué sabe y qué le falta al OS sobre Administración
-- y Finanzas" sin leer siete tablas a mano. El conocimiento existe y no es recuperable por área.
--
-- Esto NO crea una octava taxonomía: crea el catálogo de las 8 que ya son oficiales y un resolver
-- de alias que traduce todo lo legacy. Ninguna tabla de origen se reescribe — la clasificación se
-- resuelve al leer, así que si mañana aparece otro valor suelto se agrega un alias, no una migración
-- de datos. Mismo criterio que obra_alias.

-- ── Catálogo: las 8 áreas oficiales (migración 20260718210000, división real del dueño) ──
create table if not exists public.area_canonica (
  clave  text primary key,   -- el MISMO id que ya usa acciones.area (no se inventa uno nuevo)
  nombre text not null,      -- nombre para mostrar en web/chat
  orden  int  not null       -- orden de recorrido del programa de las 8 áreas
);

insert into public.area_canonica (clave, nombre, orden) values
  ('compras',                 'Compras',                    1),
  ('administracion_finanzas', 'Administración y Finanzas',  2),
  ('obras',                   'Obras',                      3),
  ('personas',                'Personas',                   4),
  ('contabilidad_legales',    'Contabilidad y Legales',     5),
  ('comercial',               'Comercial / Cotización',     6),
  ('calidad',                 'Calidad',                    7),
  ('gestion_general',         'Gestión General',            8)
on conflict (clave) do update set nombre = excluded.nombre, orden = excluded.orden;

-- ── Resolver: cualquier texto de área/dominio observado → su área canónica ──
create table if not exists public.area_alias (
  alias       text primary key,  -- texto normalizado (lower, sin acentos, sin puntuación)
  area_clave  text not null references public.area_canonica(clave),
  ejemplo_raw text                -- un ejemplo tal cual aparece hoy en los datos
);

comment on table public.area_canonica is
  'Las 8 áreas oficiales del OS (mismas claves que acciones.area). Fuente única compartida por web, chat y Claude Code.';
comment on table public.area_alias is
  'Resolver: texto de área/dominio legacy → área canónica. Se agrega un alias, nunca se reescribe la tabla de origen.';

-- Normalizador de texto de área. Misma forma que norm_obra/norm_proveedor: inmutable y sin tabla,
-- para poder indexar. La traducción a área vive en area_alias, no acá.
create or replace function public.norm_area_txt(txt text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(regexp_replace(
      lower(translate(coalesce(txt, ''), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                                          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
      '[^a-z0-9]+', ' ', 'g')),
  '');
$$;

-- Resuelve un texto cualquiera a una de las 8 áreas. Devuelve NULL si no hay alias: eso es un dato
-- sin clasificar, y se declara como tal — no se adivina un área por parecido.
create or replace function public.norm_area(txt text)
returns text
language sql
stable
as $$
  select a.area_clave from public.area_alias a where a.alias = public.norm_area_txt(txt);
$$;

comment on function public.norm_area(text) is
  'Texto de área/dominio (cualquier taxonomía legacy) → clave de una de las 8 áreas. NULL = sin clasificar (no se adivina).';

-- ── Alias observados en los datos reales al 20/07/2026 ──
insert into public.area_alias (alias, area_clave, ejemplo_raw) values
  -- las 8 claves canónicas se resuelven a sí mismas
  ('compras',                  'compras',                 'compras'),
  ('administracion finanzas',  'administracion_finanzas', 'administracion_finanzas'),
  ('obras',                    'obras',                   'obras'),
  ('personas',                 'personas',                'Personas'),
  ('contabilidad legales',     'contabilidad_legales',    'contabilidad_legales'),
  ('comercial',                'comercial',               'Comercial'),
  ('calidad',                  'calidad',                 'calidad'),
  ('gestion general',          'gestion_general',         'gestion_general'),

  -- Gestión General: la dirección y lo transversal del propio OS
  ('direccion',                'gestion_general',         'direccion'),
  ('software',                 'gestion_general',         'Software'),
  ('datos',                    'gestion_general',         'Datos'),
  ('post mortem y aprendizaje','gestion_general',         'Post Mortem y Aprendizaje'),
  ('control economico',        'gestion_general',         'Control Económico'),

  -- Administración y Finanzas: caja, cobranzas, tesorería, el trabajo administrativo
  ('finanzas',                 'administracion_finanzas', 'finanzas'),
  ('tesoreria',                'administracion_finanzas', 'Tesorería'),
  ('administracion',           'administracion_finanzas', 'Administración'),
  ('cobranzas',                'administracion_finanzas', 'cobranzas'),

  -- Compras: proveedores y la decisión comprar/alquilar de equipos y vehículos
  ('proveedores',              'compras',                 'Proveedores'),
  ('equipos y vehiculos',      'compras',                 'Equipos y Vehículos'),

  -- Obras: producción, certificación del avance ejecutado
  ('obra',                     'obras',                   'obra'),
  ('obras produccion',         'obras',                   'obras_produccion'),
  ('certificacion',            'obras',                   'Certificación'),

  -- Personas: lo laboral, lo que se paga por trabajar y la seguridad de quien trabaja
  ('laboral',                  'personas',                'Laboral'),
  ('jornales',                 'personas',                'jornales'),
  ('sueldos',                  'personas',                'sueldos'),
  ('seguridad e higiene',      'personas',                'Seguridad e Higiene'),

  -- Contabilidad y Legales
  ('contabilidad',             'contabilidad_legales',    'Contabilidad'),
  ('fiscal',                   'contabilidad_legales',    'Fiscal'),
  ('legal y contractual',      'contabilidad_legales',    'Legal y Contractual'),

  -- Comercial / Cotización
  ('presupuestacion',          'comercial',               'Presupuestación'),
  ('clientes',                 'comercial',               'Clientes')
on conflict (alias) do update
  set area_clave = excluded.area_clave, ejemplo_raw = excluded.ejemplo_raw;

-- ── El backlog no tenía área: 42 pendientes abiertos que nadie podía rutear a un responsable ──
alter table public.backlog_autonomo add column if not exists area text references public.area_canonica(clave);
comment on column public.backlog_autonomo.area is
  'Área responsable del pendiente. NULL = sin clasificar todavía (no se adivina por el título).';

-- Backfill del área SOLO donde hay evidencia: el área de un hallazgo es la del dato donde se
-- detectó. 11 de las 46 filas traen origen_tabla; las otras 35 solo tienen una descripción en
-- texto libre y quedan en NULL a propósito — clasificarlas por parecido de título sería inventar
-- un responsable. Aparecen como "sin clasificar" y eso es trabajo real, no un defecto oculto.
update public.backlog_autonomo b set area = 'administracion_finanzas'
  where b.area is null and b.origen_tabla = 'movimientos_caja';
update public.backlog_autonomo b set area = 'contabilidad_legales'
  where b.area is null and b.origen_tabla = 'obligaciones';
update public.backlog_autonomo b set area = 'obras'
  where b.area is null and b.origen_tabla = 'obras';
update public.backlog_autonomo b set area = public.norm_area(f.area)
  from public.fuentes_datos f
  where b.area is null and b.origen_tabla = 'fuentes_datos' and f.id::text = b.origen_id::text
    and public.norm_area(f.area) is not null;

-- ── RLS, igual que el resto de las tablas de referencia (20260719170000) ──
alter table public.area_canonica enable row level security;
drop policy if exists area_canonica_select on public.area_canonica;
create policy area_canonica_select on public.area_canonica for select to authenticated using (true);

alter table public.area_alias enable row level security;
drop policy if exists area_alias_select on public.area_alias;
create policy area_alias_select on public.area_alias for select to authenticated using (true);
drop policy if exists area_alias_write on public.area_alias;
create policy area_alias_write on public.area_alias for all to authenticated using (true) with check (true);

-- ── La vista que faltaba: TODO el conocimiento del OS, recuperable por área ──
-- Une las 7 tablas bajo las 8 claves. No copia nada: cada fila sigue viviendo en su tabla dueña.
create or replace view public.conocimiento_por_area as
  select public.norm_area(area)    as area, 'afirmacion'::text as tipo, afirmacion  as titulo,
         confianza::text as confianza, vigente as activo, id::text as origen_id,
         'conocimiento_empresa'::text as origen_tabla, created_at
    from public.conocimiento_empresa
  union all
  select public.norm_area(area), 'fuente', nombre,
         criticidad::text, (estado is distinct from 'retirada'), id::text, 'fuentes_datos', created_at
    from public.fuentes_datos
  union all
  select public.norm_area(dominio), 'pregunta', pregunta,
         nivel_confianza_actual::text, (estado is distinct from 'cerrada'), id::text, 'preguntas_negocio', created_at
    from public.preguntas_negocio
  union all
  select public.norm_area(dominio), 'capacidad', dominio,
         nivel_actual::text, true, id::text, 'scorecard_dominios', created_at
    from public.scorecard_dominios
  union all
  select public.norm_area(dominio), 'reporte', nombre,
         null, activo, id::text, 'reportes_definiciones', created_at
    from public.reportes_definiciones
  union all
  select coalesce(area, public.norm_area(tipo)), 'pendiente', titulo,
         confianza::text, (estado = 'abierto'), id::text, 'backlog_autonomo', created_at
    from public.backlog_autonomo
  union all
  select public.norm_area(area), 'accion', titulo,
         null, (estado is distinct from 'cerrada'), id::text, 'acciones', created_at
    from public.acciones;

comment on view public.conocimiento_por_area is
  'Todo el conocimiento del OS recuperable por una de las 8 áreas. No duplica: cada fila vive en su tabla dueña. area NULL = sin clasificar.';
