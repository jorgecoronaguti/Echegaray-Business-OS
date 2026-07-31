-- EL BUSCADOR PASA A DEJAR RASTRO DE POR QUÉ DECIDIÓ LO QUE DECIDIÓ.
--
-- Hasta acá el ranking era bueno y era opaco: elegía bien, y si algún día elegía mal no había
-- forma de reconstruir por qué. Lo único que se guardaba era un contador de aceptaciones.
--
-- Tres tablas, cada una con un trabajo distinto:
--
--   drive_busqueda_evento     LO QUE PASÓ. Una fila por búsqueda, con los candidatos, sus
--                             puntajes y el desglose de señales. Es el registro de auditoría:
--                             cualquier respuesta del buscador se puede reconstruir desde acá.
--
--   drive_alias_documento     LO QUE SE APRENDIÓ. "flujo de fondos" → este documento, con su
--                             confianza y de dónde salió. Un alias apunta a UN documento: la
--                             clave única lo garantiza, porque un alias ambiguo no ayuda a
--                             nadie.
--
--   drive_documento_estado    LO QUE LA EMPRESA DECIDIÓ. Canónico, operativo, histórico,
--                             archivado, reemplazado, duplicado. El ranking ya infiere algo
--                             de esto por la carpeta y la fecha; esta tabla existe para que
--                             una persona pueda decirlo explícitamente y ganarle a la
--                             inferencia, sin tocar código.
--
-- Y tres vistas de métricas, para que el panel del OS no tenga que saber armar los agregados.

-- ── LO QUE PASÓ ──────────────────────────────────────────────────────────────

create table if not exists public.drive_busqueda_evento (
  id             bigserial primary key,
  creado_at      timestamptz not null default now(),
  usuario        text        not null default '',
  canal          text        not null default 'desconocido',
  consulta       text        not null,
  consulta_norm  text        not null,
  tokens         text[]      not null default '{}',
  tipo_pedido    text,
  etapa          text,
  confianza      text        not null,
  elegido        text,
  confirmado     text,
  confirmado_at  timestamptz,
  rechazado_at   timestamptz,
  candidatos     jsonb       not null default '[]'::jsonb,
  evaluados      integer     not null default 0,
  ms             integer     not null default 0
);

comment on table public.drive_busqueda_evento is
  'Una fila por búsqueda de Drive. Guarda los candidatos con su puntaje y el desglose de señales: sirve para explicar cualquier resultado y para medir si el buscador mejora.';
comment on column public.drive_busqueda_evento.elegido is
  'El documento que el buscador PROPUSO. No implica que la persona lo haya aceptado.';
comment on column public.drive_busqueda_evento.confirmado is
  'El documento que la persona CONFIRMÓ. Sólo esto genera aprendizaje.';
comment on column public.drive_busqueda_evento.candidatos is
  '[{id,name,score,texto,senales,rescatado}] — el ranking completo, congelado tal como se decidió.';

create index if not exists drive_busqueda_evento_usuario_idx  on public.drive_busqueda_evento (usuario, creado_at desc);
create index if not exists drive_busqueda_evento_consulta_idx on public.drive_busqueda_evento (consulta_norm, creado_at desc);
create index if not exists drive_busqueda_evento_fecha_idx    on public.drive_busqueda_evento (creado_at desc);

-- ── LO QUE SE APRENDIÓ ───────────────────────────────────────────────────────

create table if not exists public.drive_alias_documento (
  id             bigserial primary key,
  alias_norm     text        not null unique,
  drive_file_id  text        not null,
  confianza      numeric(4,3) not null default 0,
  origen         text        not null default 'aprendido',
  usos           integer     not null default 0,
  usuarios       integer     not null default 0,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  constraint drive_alias_documento_origen_ck check (origen in ('aprendido', 'manual')),
  constraint drive_alias_documento_confianza_ck check (confianza >= 0 and confianza <= 1)
);

comment on table public.drive_alias_documento is
  'Alias aprendidos: una consulta normalizada que la gente usa para pedir SIEMPRE el mismo documento. La clave única sobre alias_norm impide que un alias apunte a dos documentos.';
comment on column public.drive_alias_documento.confianza is
  'Proporción de confirmaciones de ese alias que fueron a este documento (0..1). Un alias repartido entre dos documentos no se promueve.';
comment on column public.drive_alias_documento.origen is
  'aprendido = lo promovió el OS con evidencia. manual = lo cargó una persona, y manda sobre lo aprendido.';

-- ── LO QUE LA EMPRESA DECIDIÓ ────────────────────────────────────────────────

create table if not exists public.drive_documento_estado (
  drive_file_id    text primary key,
  estado           text        not null,
  motivo           text,
  reemplazado_por  text,
  definido_por     text,
  creado_at        timestamptz not null default now(),
  actualizado_at   timestamptz not null default now(),
  constraint drive_documento_estado_ck check (estado in
    ('canonico', 'operativo', 'historico', 'archivado', 'reemplazado', 'duplicado'))
);

comment on table public.drive_documento_estado is
  'Estado declarado de un documento. Le gana a lo que el ranking infiere por carpeta y fecha: si Dirección dice que un archivo es canónico, es canónico aunque viva en una carpeta con nombre de año.';

-- ── MÉTRICAS ─────────────────────────────────────────────────────────────────

create or replace view public.v_drive_busqueda_metricas as
select
  count(*)                                                             as busquedas,
  count(*) filter (where confianza = 'alta')                           as directas,
  count(*) filter (where confianza = 'media')                          as propuestas,
  count(*) filter (where confianza = 'baja' and elegido is not null)    as aclaraciones,
  count(*) filter (where etapa is null)                                as sin_resultado,
  count(*) filter (where confirmado_at is not null)                    as confirmadas,
  count(*) filter (where rechazado_at is not null)                     as rechazadas,
  count(*) filter (where confirmado is not null and confirmado is distinct from elegido) as corregidas,
  count(distinct usuario) filter (where usuario <> '')                 as usuarios,
  round(avg(ms))                                                       as ms_promedio,
  percentile_disc(0.95) within group (order by ms)                     as ms_p95,
  round(avg((candidatos->0->>'score')::numeric))                       as score_promedio_ganador,
  min(creado_at)                                                       as desde,
  max(creado_at)                                                       as hasta
from public.drive_busqueda_evento;

comment on view public.v_drive_busqueda_metricas is
  'Salud del buscador de un vistazo. "corregidas" es la métrica que importa: cuántas veces la persona tuvo que desmentirlo.';

create or replace view public.v_drive_busqueda_documentos as
select
  coalesce(e.confirmado, e.elegido)                       as drive_file_id,
  i.name                                                  as nombre,
  i.path                                                  as ruta,
  count(*)                                                as veces,
  count(*) filter (where e.confirmado_at is not null)      as confirmadas,
  count(distinct e.usuario) filter (where e.usuario <> '') as usuarios,
  max(e.creado_at)                                        as ultima
from public.drive_busqueda_evento e
left join public.drive_index i on i.drive_file_id = coalesce(e.confirmado, e.elegido)
where coalesce(e.confirmado, e.elegido) is not null
group by 1, 2, 3;

create or replace view public.v_drive_busqueda_alias as
select
  e.consulta_norm                                          as alias,
  count(*)                                                 as busquedas,
  count(*) filter (where e.confirmado_at is not null)       as confirmaciones,
  count(distinct e.usuario) filter (where e.usuario <> '')  as usuarios,
  a.drive_file_id                                          as documento,
  a.confianza,
  a.origen
from public.drive_busqueda_evento e
left join public.drive_alias_documento a on a.alias_norm = e.consulta_norm
group by 1, 5, 6, 7;

-- ── Permisos ─────────────────────────────────────────────────────────────────

alter table public.drive_busqueda_evento  enable row level security;
alter table public.drive_alias_documento  enable row level security;
alter table public.drive_documento_estado enable row level security;

grant select on public.drive_busqueda_evento  to authenticated;
grant select on public.drive_alias_documento  to authenticated;
grant select on public.drive_documento_estado to authenticated;
grant select on public.v_drive_busqueda_metricas   to authenticated;
grant select on public.v_drive_busqueda_documentos to authenticated;
grant select on public.v_drive_busqueda_alias      to authenticated;
grant select, insert, update, delete on public.drive_busqueda_evento  to service_role;
grant select, insert, update, delete on public.drive_alias_documento  to service_role;
grant select, insert, update, delete on public.drive_documento_estado to service_role;

do $$
declare t text;
begin
  foreach t in array array['drive_busqueda_evento', 'drive_alias_documento', 'drive_documento_estado'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_read') then
      execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_read', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_srv') then
      execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_srv', t);
    end if;
  end loop;
end $$;
