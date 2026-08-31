-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA OBRA RECUERDA DE QUÉ VERSIÓN NACIÓ, Y CONTRA QUÉ SE COMPARA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Cuatro tablas NUEVAS. Ninguna existente se altera, ninguna vista se reemplaza, ningún trigger de
-- otra tabla se toca.
--
-- ═══ EL AGUJERO QUE CIERRA, MEDIDO ═══
--
-- Hoy `obra_actividad.cotizacion_partida_id` está poblado en 26 de 380 actividades, todas de
-- Quattropani. Es un puntero de una actividad a UNA partida, y no dice nada de la obra: no dice de
-- qué VERSIÓN salió, ni si esa versión estaba congelada, ni quién adjudicó, ni cuándo.
--
-- Y hace falta, porque `cotizaciones` tiene HOY dos filas de COT-2026-001 en estado 'adjudicada'
-- —v1 (congelada) y v3 (NO congelada)— y `convertida_obra_id` está en NULL en las trece. O sea: si
-- alguien pregunta «¿contra qué se compara el real de Quattropani?», la base tiene dos respuestas
-- posibles y ninguna preferida. Eso no es un dato faltante, es un CONFLICTO, y comparar el real
-- contra una versión que todavía se puede editar es comparar contra un blanco móvil.
--
-- ═══ QUÉ NO ESTÁ ACÁ, Y POR QUÉ ═══
--
-- **No hay tabla de HH reales.** `registros_hh` ya las tiene, con `actividad_id`, `tipo_hora`,
-- `improductiva` y `causa_desvio`. Duplicarlas daría dos números de horas para la misma obra.
--
-- **No hay tabla de cantidad ejecutada.** `obra_ejecucion` ya la tiene (251 filas). Lo que le falta
-- no es una tabla: es que `cantidad` venga cargada — 247 de 251 filas la tienen en NULL y sólo
-- traen `avance_pct`. Ese hueco se DECLARA en la comparación, no se rellena acá.
--
-- **No hay tabla de horas de equipo.** `obra_ejecucion_equipo` ya existe (0 filas, esperando).
--
-- **No hay tabla de composición heredada.** La composición de una versión CONGELADA no cambia, y
-- `cotizacion_partida_composicion` la tiene con su `congelada_en`. Por eso la genealogía EXIGE una
-- versión congelada (CHECK más abajo): con esa exigencia, apuntar a la composición original es tan
-- estable como copiarla, y sin la segunda copia que después se desincroniza.

-- ── 1 · LA GENEALOGÍA ─────────────────────────────────────────────────────────────────────────
-- De qué versión nació esta obra. Una fila por (obra, cotización): la ORIGINAL y, si el cliente
-- aprueba adicionales cotizados aparte, una fila ADICIONAL por cada uno.
create table if not exists public.obra_origen_cotizacion (
  id             uuid primary key default gen_random_uuid(),
  obra_id        text not null references public.obra_canonica (id) on delete cascade,
  cotizacion_id  uuid not null references public.cotizaciones (id),
  alcance        text not null default 'ORIGINAL' check (alcance in ('ORIGINAL', 'ADICIONAL')),
  version        integer not null,
  congelada_en   timestamptz not null,
  huella_sha256  text,
  adjudicada_en  timestamptz not null,
  adjudicada_por uuid,
  costo_estimado numeric,
  meta_ingreso   numeric,
  nota           text,
  creado_en      timestamptz not null default now(),
  constraint obra_origen_una_vez_por_cotizacion unique (obra_id, cotizacion_id)
);

comment on table public.obra_origen_cotizacion is
  'De qué versión congelada nació cada obra. Es lo único que contesta «¿contra qué se está '
  'comparando el real?» sin adivinar. Sin esta fila, plan vs real no se calcula: se declara '
  'SIN_GENEALOGIA, que es distinto de «sin desvío».';
comment on column public.obra_origen_cotizacion.congelada_en is
  'NOT NULL a propósito: una versión que todavía se puede editar no puede ser la base de comparación '
  'de una obra. Si el plan cambia después, el desvío de ayer deja de ser el desvío de hoy y nadie se '
  'entera. Hoy hay dos versiones de COT-2026-001 marcadas adjudicada y una NO está congelada: este '
  'CHECK es el que impide que esa entre.';
comment on column public.obra_origen_cotizacion.huella_sha256 is
  'NULL es legítimo y DECLARADO: cotizacion_huella tiene cero filas hoy, así que las obras que se '
  'enganchen antes de que se calculen las huellas quedan con genealogía sin huella. Eso se informa '
  'como confianza menor, no se inventa un hash.';
comment on column public.obra_origen_cotizacion.meta_ingreso is
  'PRECIO al cliente. Vive acá y NO en el plan de costo, separado a propósito: la obra se controla '
  'contra su costo previsto, no contra lo que se vendió. Mezclarlos convierte el margen en cero '
  'antes de empezar.';

-- UNA sola ORIGINAL por obra. Sin este índice, las dos filas 'adjudicada' de COT-2026-001 podrían
-- entrar las dos y la pregunta volvería a tener dos respuestas.
create unique index if not exists obra_origen_una_original_por_obra
  on public.obra_origen_cotizacion (obra_id) where alcance = 'ORIGINAL';
create index if not exists obra_origen_por_cotizacion on public.obra_origen_cotizacion (cotizacion_id);

-- ── 2 · EL PLAN HEREDADO, CONGELADO ───────────────────────────────────────────────────────────
create table if not exists public.obra_partida_plan (
  id                      uuid primary key default gen_random_uuid(),
  origen_id               uuid not null references public.obra_origen_cotizacion (id) on delete cascade,
  obra_id                 text not null references public.obra_canonica (id) on delete cascade,
  cotizacion_partida_id   uuid not null references public.cotizacion_partida (id),
  actividad_id            uuid references public.obra_actividad (id) on delete set null,
  codigo                  text,
  descripcion             text not null,
  unidad                  text,
  cantidad_plan           numeric,
  hs_unitarias_plan       numeric,
  hh_plan                 numeric,
  costo_unitario_plan     numeric,
  costo_plan              numeric,
  dias_plan               numeric,
  subcontratada           boolean not null default false,
  precio_subcontrato_plan numeric,
  congelado_en            timestamptz not null default now(),
  constraint obra_partida_plan_una_por_partida unique (obra_id, cotizacion_partida_id)
);

comment on table public.obra_partida_plan is
  'El plan de COSTO que la obra heredó al adjudicar, congelado. No tiene columna de precio de venta: '
  'el precio vive en obra_origen_cotizacion.meta_ingreso, a nivel obra. Una partida no se controla '
  'contra lo que se le vendió al cliente.';
comment on column public.obra_partida_plan.hh_plan is
  'NULL y 0 son cosas distintas. 0 es un hecho cuando la partida es subcontratada (no lleva HH '
  'propias). NULL es un hueco: la productividad no se conoce. Poner 0 en el segundo caso inventa '
  'una productividad infinita y el desvío de HH sale ∞.';
comment on column public.obra_partida_plan.dias_plan is
  'DÍAS de calendario. No son HH y no se derivan de HH: 160 HH pueden ser 4 personas × 5 días o 1 '
  'persona × 20 días. Confundirlos es el error que esta columna existe para hacer imposible.';
comment on column public.obra_partida_plan.actividad_id is
  'La única columna que se puede actualizar después de creada la fila (ver el trigger): el vínculo '
  'con la actividad de obra puede establecerse cuando la actividad todavía no existía al adjudicar.';

create index if not exists obra_partida_plan_por_obra on public.obra_partida_plan (obra_id);
create index if not exists obra_partida_plan_por_actividad on public.obra_partida_plan (actividad_id);

-- FROZEN ≠ MUTABLE, hecho cumplir por la base y no por una convención.
create or replace function public.obra_partida_plan_no_se_reescribe()
returns trigger language plpgsql as $$
begin
  if (new.origen_id, new.obra_id, new.cotizacion_partida_id, new.codigo, new.descripcion, new.unidad,
      new.cantidad_plan, new.hs_unitarias_plan, new.hh_plan, new.costo_unitario_plan, new.costo_plan,
      new.dias_plan, new.subcontratada, new.precio_subcontrato_plan, new.congelado_en)
     is distinct from
     (old.origen_id, old.obra_id, old.cotizacion_partida_id, old.codigo, old.descripcion, old.unidad,
      old.cantidad_plan, old.hs_unitarias_plan, old.hh_plan, old.costo_unitario_plan, old.costo_plan,
      old.dias_plan, old.subcontratada, old.precio_subcontrato_plan, old.congelado_en)
  then
    raise exception 'obra_partida_plan es el plan CONGELADO: sólo actividad_id se puede actualizar. '
                    'Un plan que se reescribe hace que el desvío de ayer deje de ser el de hoy. '
                    'Si el alcance cambió, entra como fila ADICIONAL con su propia genealogía.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists obra_partida_plan_congelado on public.obra_partida_plan;
create trigger obra_partida_plan_congelado before update on public.obra_partida_plan
  for each row execute function public.obra_partida_plan_no_se_reescribe();

-- ── 3 · EL COSTO REAL IMPUTADO A LA PARTIDA ───────────────────────────────────────────────────
-- La puerta que falta. `costos_obra` tiene el gasto real pero sólo por `obra_texto`: sabe cuánto
-- costó la obra y no sabe cuánto costó la mampostería. `compras` está VACÍA (0 filas). Sin esta
-- tabla, «precio estimado vs precio comprado» y «costo estimado vs costo real» POR PARTIDA no se
-- pueden contestar — que son dos de las siete comparaciones que el aprendizaje necesita.
create table if not exists public.obra_partida_costo_real (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               text not null references public.obra_canonica (id) on delete cascade,
  cotizacion_partida_id uuid references public.cotizacion_partida (id),
  actividad_id          uuid references public.obra_actividad (id) on delete set null,
  tipo                  text not null check (tipo in ('MATERIAL', 'SUBCONTRATO', 'EQUIPO', 'MANO_DE_OBRA', 'OTRO')),
  recurso_codigo        text,
  recurso_nombre        text not null,
  unidad                text,
  cantidad              numeric,
  precio_unitario       numeric,
  monto                 numeric not null,
  moneda                text not null default 'ARS',
  fecha                 date not null,
  proveedor             text,
  comprobante           text,
  fuente                text not null,
  fuente_id             text,
  imputado_por          uuid,
  creado_en             timestamptz not null default now()
);

comment on table public.obra_partida_costo_real is
  'Lo que la obra gastó de verdad, imputado a la partida que lo consumió. Es la contraparte real de '
  'cotizacion_partida_composicion: el mismo recurso, con el precio que se pagó y no con el que se '
  'cotizó.';
comment on column public.obra_partida_costo_real.cotizacion_partida_id is
  'NULLABLE A PROPÓSITO. Un comprobante que no se pudo imputar a ninguna partida entra igual, con '
  'NULL, y la comparación lo devuelve en la lista SIN_IMPUTAR con su monto. Rechazarlo lo haría '
  'desaparecer del costo de la obra; asignarlo a la partida más parecida inventaría el dato. Las '
  'dos son peores que decir «este gasto existe y todavía no sé de quién es».';
comment on column public.obra_partida_costo_real.precio_unitario is
  'NULL cuando el comprobante no discrimina cantidad. NULL no es precio cero: un precio cero '
  'aparecería como el mejor negocio de la historia en la comparación contra el precio cotizado.';
comment on column public.obra_partida_costo_real.monto is
  'NETO, sin IVA. El IVA de una constructora es crédito fiscal, no costo de obra — sumarlo infla el '
  'costo real un 21% y hace que toda partida parezca desviada.';

create index if not exists obra_partida_costo_real_por_obra on public.obra_partida_costo_real (obra_id);
create index if not exists obra_partida_costo_real_por_partida on public.obra_partida_costo_real (cotizacion_partida_id);
-- Idempotencia de la puerta: el mismo comprobante de la misma fuente no entra dos veces para la
-- misma partida. `coalesce` porque en un índice único los NULL son todos distintos entre sí, y sin
-- eso un comprobante sin imputar se podría cargar cien veces.
create unique index if not exists obra_partida_costo_real_sin_duplicar
  on public.obra_partida_costo_real (fuente, fuente_id, coalesce(cotizacion_partida_id::text, '—'), coalesce(recurso_codigo, '—'))
  where fuente_id is not null;

-- ── 4 · LA BITÁCORA DE OBSERVACIONES ──────────────────────────────────────────────────────────
-- Append-only. NO es la fuente del desvío: el desvío se recalcula desde el plan y el real cuando se
-- pregunta. Esto es la EVIDENCIA de qué dijo el motor, con qué versión y sobre qué entradas — lo
-- mismo que cotizacion_huella hace del lado de la cotización. Sin esto no hay aprendizaje: no se
-- puede saber si el desvío de una partida mejoró entre dos obras.
create table if not exists public.obra_plan_real_observacion (
  id                    uuid primary key default gen_random_uuid(),
  obra_id               text not null references public.obra_canonica (id) on delete cascade,
  cotizacion_partida_id uuid references public.cotizacion_partida (id),
  concepto              text not null check (concepto in
                          ('CANTIDAD', 'HH', 'RENDIMIENTO', 'MATERIAL', 'PRECIO', 'DURACION', 'COSTO')),
  unidad                text,
  plan                  numeric,
  real_medido           numeric,
  desvio                numeric,
  desvio_pct            numeric,
  comparable            boolean not null,
  motivo_no_comparable  text,
  causa                 text not null default 'SIN_CAUSA',
  evidencia             jsonb,
  estado                text not null,
  corrida_id            uuid not null,
  motor_version         text not null,
  corrida_en            timestamptz not null default now()
);

comment on table public.obra_plan_real_observacion is
  'Append-only: cada corrida agrega sus observaciones y no pisa las anteriores. Dos corridas del '
  'mismo día con resultados distintos son un dato (algo cambió), no un error a resolver pisando.';
comment on column public.obra_plan_real_observacion.comparable is
  'false NO es «sin desvío». Una partida en curso, una sin HH cargadas y una sin plan salen todas '
  'con comparable=false y su motivo, y NO entran a ningún promedio de desvío. El resumen las cuenta '
  'aparte para que «0 desvíos» nunca signifique «0 datos».';
comment on column public.obra_plan_real_observacion.causa is
  'SIN_CAUSA es el default y es honesto. Una causa sólo se escribe cuando hay evidencia que la diga '
  '(obra_ejecucion.causa_desvio, registros_hh.causa_desvio, una incidencia). Deducir la causa del '
  'signo del desvío es inventar el dato que más caro se paga: el que después entra a una cotización.';
comment on column public.obra_plan_real_observacion.real_medido is
  'Se llama real_medido y no real porque `real` es un TIPO de Postgres (float4) y una columna '
  'llamada así obliga a comillar en cada consulta.';

create index if not exists obra_plan_real_observacion_por_obra on public.obra_plan_real_observacion (obra_id, corrida_en desc);
create index if not exists obra_plan_real_observacion_por_corrida on public.obra_plan_real_observacion (corrida_id);

-- ── RLS Y GRANT ───────────────────────────────────────────────────────────────────────────────
-- RLS NO ES GRANT: una policy sin su GRANT devuelve «permission denied», que Next muestra como 404
-- y se lee como «no hay datos». El portero va envuelto en `(select …)` para que se evalúe una vez
-- por consulta y no una por fila.
--
-- Quién ve qué: el PLAN y la GENEALOGÍA llevan precio y costo cotizado, así que son `ve_economia`.
-- El COSTO REAL también. Las OBSERVACIONES las ve también quien ve la obra: un jefe de obra tiene
-- que poder ver que su partida va a 1,4× las HH previstas sin ver el margen de la empresa — por eso
-- la observación no trae plata de venta en ninguna columna.
alter table public.obra_origen_cotizacion      enable row level security;
alter table public.obra_partida_plan           enable row level security;
alter table public.obra_partida_costo_real     enable row level security;
alter table public.obra_plan_real_observacion  enable row level security;

drop policy if exists obra_origen_cotizacion_economia on public.obra_origen_cotizacion;
create policy obra_origen_cotizacion_economia on public.obra_origen_cotizacion for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

drop policy if exists obra_partida_plan_economia on public.obra_partida_plan;
create policy obra_partida_plan_economia on public.obra_partida_plan for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

drop policy if exists obra_partida_costo_real_economia on public.obra_partida_costo_real;
create policy obra_partida_costo_real_economia on public.obra_partida_costo_real for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

drop policy if exists obra_plan_real_observacion_lectura on public.obra_plan_real_observacion;
drop policy if exists obra_plan_real_observacion_alta on public.obra_plan_real_observacion;
-- `ve_economia()` no toma argumentos y se envuelve en `(select …)`: se evalúa UNA vez por consulta.
-- `ve_obra(obra_id)` SÍ mira la fila, así que va sin envolver — envuelto, Postgres lo trataría como
-- subconsulta correlacionada y no ganaría nada. El OR corta temprano por el lado constante.
create policy obra_plan_real_observacion_lectura on public.obra_plan_real_observacion for select to authenticated
  using ((select public.ve_economia()) or public.ve_obra(obra_id));
create policy obra_plan_real_observacion_alta on public.obra_plan_real_observacion for insert to authenticated
  with check ((select public.ve_economia()));

grant select, insert, update, delete on public.obra_origen_cotizacion     to authenticated;
-- Sin DELETE ni UPDATE amplio sobre el plan: el UPDATE que queda lo filtra el trigger a actividad_id.
grant select, insert, update         on public.obra_partida_plan          to authenticated;
grant select, insert, update, delete on public.obra_partida_costo_real    to authenticated;
grant select, insert                 on public.obra_plan_real_observacion to authenticated;

grant all on public.obra_origen_cotizacion, public.obra_partida_plan,
             public.obra_partida_costo_real, public.obra_plan_real_observacion to service_role;
