-- UNA OBSERVACION DE PRECIO ES UN HECHO. ELEGIRLA ES UN JUICIO. APLICARLA ES UN ACTO.
--
-- === EL PROBLEMA QUE ESTA TABLA RESUELVE ===
--
-- Hoy los tres actos viven en la misma fila de `public.recurso_precio`. Consecuencias medidas al
-- 31/08/2026: los 406 recursos del catalogo tienen EXACTAMENTE UNA observacion cada uno -- ni uno
-- solo tiene dos --, porque cada carga sobrescribio la anterior. Sin serie no hay volatilidad
-- medible, y por eso `derivaDeSerie()` no dispara en ningun recurso y los 338 caen al IPC nivel
-- general, que es un piso prestado del promedio de la economia y no la deriva del hormigon.
--
-- Y ademas se pierden dos preguntas que despues nadie puede contestar: que otras fuentes se miraron
-- y se descartaron, y quien o que regla autorizo escribir la que gano.
--
-- === QUE GUARDA CADA COSA ===
--
--   precio_observacion         ACTO 1 -- el hecho. Un numero que alguien publico o cobro, con su
--                              fuente citable, su unidad, su IVA, su jurisdiccion y su fecha.
--                              Inmutable. Se acumula: dos lecturas de la misma pagina en dos dias
--                              son dos hechos, y de ahi sale la serie que hoy no existe.
--   precio_aplicacion          ACTO 3 -- que observacion se escribio en el catalogo, con que regla
--                              o firma de quien. Es lo unico con efecto economico.
--
-- El ACTO 2 (la seleccion) viaja adentro de `precio_aplicacion.seleccion`: no tiene vida propia
-- fuera de una aplicacion, porque elegir sin aplicar no cambia nada.
--
-- === valid_until SOLO SI LA FUENTE LO DICE ===
--
-- `valido_hasta` es un HECHO del documento ("validez 15 dias" de un presupuesto de proveedor), no
-- una vigencia estimada. El CHECK obliga a declarar que la fuente lo dijo. La vigencia derivada la
-- calcula `vigencia.mjs` y NO se guarda aca: mezclar un hecho con una estimacion en la misma columna
-- hace que seis meses despues nadie distinga cual era cual.
--
-- === SIN UPDATE NI DELETE ===
--
-- Misma leccion que `recurso_precio_resolucion`: un hecho registrado no se reescribe. Si la pagina
-- cambia el precio, eso es otra observacion y va otra fila. Se hace cumplir en la BASE con los
-- GRANT, no con una convencion del codigo.

create table if not exists public.precio_observacion (
  id                uuid primary key default gen_random_uuid(),
  -- El hash de contenido: la misma observacion leida dos veces produce el mismo id, y por eso se
  -- puede deduplicar sin comparar campo por campo. La unicidad la impone la base, no el codigo.
  hash              text not null unique,
  recurso_id        uuid references public.recurso (id) on delete cascade,
  recurso_codigo    text not null,
  descripcion       text,
  -- La especificacion normalizada: los atributos medibles ordenados. Es lo que permite comparar
  -- "Panel Chapa Trape Blanco Pur 50 Mm" con "panel aislante 50mm PUR trapezoidal" sin que los
  -- nombres coincidan.
  spec              text,
  valor             numeric not null,
  moneda            text not null,
  unidad            text not null,
  -- "$12.000 la bolsa de 50 kg": el precio es 12.000 y la BASE es {valor:50, unidad:'kg'}. Sin
  -- esto, dividir es adivinar.
  base_de_cantidad  jsonb,
  tipo_fuente       text not null,
  fuente_id         text,
  proveedor         text,
  fabricante        text,
  url               text,
  documento         text,
  observado_en      date not null,
  valido_desde      date,
  valido_hasta      date,
  valido_hasta_lo_dice_la_fuente boolean not null default false,
  jurisdiccion      text not null default 'AR-SJ',
  iva               text not null default 'NO_DECLARADO',
  flete             text not null default 'NO_DECLARADO',
  confianza         text,
  evidencia         jsonb,
  procedencia       jsonb,
  cotizacion_id     uuid,
  cargado_en        timestamptz not null default now(),

  constraint precio_observacion_valor_positivo check (valor > 0),
  constraint precio_observacion_fuente_conocida check (tipo_fuente in (
    'COMPRA_ECSAS', 'COTIZACION_PROVEEDOR', 'CATALOGO_INTERNO', 'FABRICANTE',
    'WEB', 'REFERENCIA_TECNICA', 'MODELO', 'HUMANO')),
  constraint precio_observacion_iva_conocido check (iva in ('SIN_IVA', 'CON_IVA', 'NO_DECLARADO')),
  constraint precio_observacion_flete_conocido check (flete in ('INCLUIDO', 'NO_INCLUIDO', 'NO_DECLARADO')),
  -- Sin una manera de volver a consultarla, una observacion no es evidencia: es un recuerdo.
  constraint precio_observacion_citable check (url is not null or documento is not null or fuente_id is not null),
  -- LA REGLA: una fecha de vencimiento que la fuente no declaro es una estimacion disfrazada de hecho.
  constraint precio_observacion_validez_es_un_hecho
    check (valido_hasta is null or valido_hasta_lo_dice_la_fuente is true)
);

comment on table public.precio_observacion is
  'ACTO 1: el hecho. Un precio observado en algun lado, con su fuente citable. NO es el precio del '
  'catalogo (ese es recurso_precio) ni una decision. Se acumula y no se pisa: de aca sale la serie '
  'que permite medir la volatilidad real de cada recurso en vez de prestarle el IPC.';

comment on column public.precio_observacion.valido_hasta is
  'SOLO cuando la fuente lo declara (un presupuesto que dice "validez 15 dias"). La vigencia '
  'ESTIMADA no va aca: la calcula vigencia.mjs y viaja aparte, etiquetada como derivada.';

create index if not exists precio_observacion_por_recurso
  on public.precio_observacion (recurso_codigo, observado_en desc);
create index if not exists precio_observacion_por_spec
  on public.precio_observacion (spec) where spec is not null;

create table if not exists public.precio_aplicacion (
  id                uuid primary key default gen_random_uuid(),
  observacion_hash  text not null references public.precio_observacion (hash),
  recurso_id        uuid references public.recurso (id) on delete cascade,
  recurso_codigo    text not null,
  valor             numeric not null,
  moneda            text not null,
  unidad            text not null,
  destino           text not null,
  -- QUIEN SE HIZO CARGO. 'REGLA' o 'HUMANO', y nada mas. Una aplicacion HUMANO sin firmante es una
  -- firma fabricada y el CHECK la rechaza: no alcanza con que el codigo prometa no inventarla.
  autorizado_por_tipo text not null,
  autorizado_por    text not null,
  firmada_por       text,
  politica          jsonb,
  seleccion         jsonb not null,
  procedencia       jsonb not null,
  aplicado_en       timestamptz not null default now(),

  constraint precio_aplicacion_valor_positivo check (valor > 0),
  constraint precio_aplicacion_autoridad_conocida check (autorizado_por_tipo in ('REGLA', 'HUMANO')),
  constraint precio_aplicacion_firma_humana_es_real
    check (autorizado_por_tipo <> 'HUMANO' or (firmada_por is not null and length(trim(firmada_por)) > 0))
);

comment on table public.precio_aplicacion is
  'ACTO 3: el unico con efecto economico. Que observacion se escribio en el catalogo y quien o que '
  'regla lo autorizo. Una aplicacion HUMANO sin firmante la rechaza la base: nunca se finge una firma.';

create index if not exists precio_aplicacion_por_recurso
  on public.precio_aplicacion (recurso_codigo, aplicado_en desc);

alter table public.precio_observacion enable row level security;
alter table public.precio_aplicacion enable row level security;

drop policy if exists precio_observacion_lectura on public.precio_observacion;
drop policy if exists precio_observacion_alta on public.precio_observacion;
drop policy if exists precio_aplicacion_lectura on public.precio_aplicacion;
drop policy if exists precio_aplicacion_alta on public.precio_aplicacion;

-- Un precio es economia: lo ve quien ve economia. El `(select ...)` hace que el portero corra UNA
-- vez por consulta (initplan) y no una vez por fila.
create policy precio_observacion_lectura on public.precio_observacion for select to authenticated
  using ((select public.ve_economia()));

-- Registrar una OBSERVACION no mueve ningun costo: es anotar lo que se vio. Alcanza con ver economia.
create policy precio_observacion_alta on public.precio_observacion for insert to authenticated
  with check ((select public.ve_economia()));

create policy precio_aplicacion_lectura on public.precio_aplicacion for select to authenticated
  using ((select public.ve_economia()));

-- APLICAR si mueve el costo de una oferta: es COMMERCIAL_WRITE, la misma exigencia que firmar un
-- override de precio vencido.
create policy precio_aplicacion_alta on public.precio_aplicacion for insert to authenticated
  with check ((select public.ve_economia()) and (select public.cot_permiso('COMMERCIAL_WRITE')));

-- RLS NO ES GRANT: sin esto la policy existe y la consulta devuelve `permission denied`.
grant select, insert on public.precio_observacion to authenticated;
grant select, insert on public.precio_aplicacion to authenticated;
grant all on public.precio_observacion to service_role;
grant all on public.precio_aplicacion to service_role;
