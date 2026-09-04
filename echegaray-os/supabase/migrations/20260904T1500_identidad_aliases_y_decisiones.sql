-- QUIÉN ES QUIÉN: LOS ALIAS VERIFICADOS Y CADA DECISIÓN DEL RESOLVER.
--
-- POR QUÉ LOS ALIAS SON EL CORAZÓN Y NO UNA COMODIDAD. El ground truth verificado por CUIT del
-- 04/09/2026 tiene estos pares reales, que son el MISMO proveedor:
--   «Corralon Progreso» = «PEREZ GARCIA MARISOL BIBIANA»
--   «Industrias Castel» = «MARTINEZ JORGE ROBERTO»
--   «DUPEC»             = «DUBOS UGARTE PEDRO LUIS RAUL»
-- Nombre de fantasía contra el titular que factura. Ningún modelo puede relacionarlos: no hay nada
-- en el texto. La única forma es que alguien lo confirme una vez y quede escrito. Eso es esta tabla.

create table if not exists public.ml_entidad_alias (
  id            bigserial primary key,
  entidad       text        not null,          -- 'proveedor' | 'cliente' | 'empleado' | 'material' ...
  entidad_id    text        not null,          -- la identidad canónica, en SU tabla
  alias         text        not null,          -- cómo aparece escrito en otra fuente
  alias_norm    text        not null,          -- normalizado: es por donde se busca
  fuente        text,                          -- de dónde salió: 'cheques', 'arca', 'compras'...
  confianza     numeric,
  verificado    boolean     not null default false,  -- lo confirmó una persona o un identificador fuerte
  verificado_por text,
  creado_en     timestamptz not null default now(),
  unique (entidad, alias_norm)
);

comment on table public.ml_entidad_alias is
  'Cómo se llama la misma entidad en cada fuente. Un alias verificado resuelve lo que ningún modelo puede: el nombre de fantasía contra la razón social que factura.';

create index if not exists ml_alias_busqueda_idx on public.ml_entidad_alias (entidad, alias_norm);
create index if not exists ml_alias_entidad_idx on public.ml_entidad_alias (entidad, entidad_id);

-- ── CADA DECISIÓN, REVERSIBLE Y AUDITABLE ──
-- Se guarda el valor ORIGINAL, la entidad a la que se lo mandó, con qué método, con qué confianza,
-- qué señales lo produjeron y con qué versión del resolver. Sin eso, una fusión hecha hace tres
-- meses no se puede explicar ni deshacer, y una auto-resolución que no se puede deshacer no
-- debería existir.
create table if not exists public.ml_resolucion (
  id              bigserial primary key,
  ts              timestamptz not null default now(),
  trace_id        uuid,
  entidad         text        not null,
  valor_original  text        not null,        -- exactamente como venía
  cuit_original   text,
  fuente          text,                        -- qué módulo lo pidió
  entidad_id      text,                        -- a quién se resolvió; null si sin_match/ambiguo
  estado          text        not null,        -- auto_resuelto|sugerido|ambiguo|sin_match|verificado_humano
  metodo          text,                        -- strong_id|exacto|alias|fuzzy|embedding|combinado
  confianza       numeric,
  señales         jsonb,                       -- los seis scores, con null donde la señal no aplica
  por_que         text        not null,
  resolver_version text       not null,
  umbrales_version integer,
  -- LA CORRECCIÓN HUMANA VIVE EN LA MISMA FILA que la decisión que corrige: así se puede medir
  -- cuántas veces el resolver acertó sin cruzar dos tablas, y esa medición es el próximo ground truth.
  corregido_por   text,
  corregido_en    timestamptz,
  entidad_id_correcta text,
  check (estado in ('auto_resuelto','sugerido','ambiguo','sin_match','verificado_humano'))
);

comment on table public.ml_resolucion is
  'Una fila por decisión de identidad. Guarda el valor original y las señales que la produjeron: toda auto-resolución tiene que ser reversible y explicable.';

create index if not exists ml_resolucion_entidad_idx on public.ml_resolucion (entidad, estado, ts desc);
create index if not exists ml_resolucion_pendiente_idx on public.ml_resolucion (estado) where estado in ('sugerido','ambiguo');
