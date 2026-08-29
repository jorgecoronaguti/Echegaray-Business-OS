-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL COTIZADOR GUARDA LO QUE HOY NO TIENE DÓNDE VIVIR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Cuatro tablas NUEVAS. Ninguna existente se altera, ninguna vista se reemplaza, ningún trigger se
-- toca. Nada de lo que hay hoy consume estas tablas, así que aplicarlas no puede romper nada que
-- esté andando — que es la única condición bajo la que se toca una base compartida con producción.
--
-- ═══ QUÉ NO ESTÁ ACÁ, Y POR QUÉ ═══
--
-- **No hay tabla de observaciones de precio.** `public.recurso_precio` ya guarda costo, fecha,
-- moneda, fuente y vigencia: es la observación de precio, con otro nombre. Crear una tabla paralela
-- daría dos definiciones del precio de un recurso, y en el momento en que existieran dos, el número
-- de la empresa dejaría de ser uno. `orquestador/lib/cotizador/precios.mjs` levanta la distinción
-- RESOURCE ≠ PRICE OBSERVATION en memoria, sobre las filas que ya existen. Lo que SÍ le falta a
-- `recurso_precio` es un `vigencia_dias` por observación —hoy la vigencia es un booleano y el corte
-- de 180 días vive en el código—; eso es un ALTER sobre una tabla que consume media docena de
-- vistas y no se hace en esta migración.
--
-- **No hay columna nueva en `cotizaciones`.** La huella de entradas podría ser una columna nullable,
-- y sería additive. Va como tabla aparte porque una cotización tiene VARIAS versiones congeladas y
-- cada una tiene su huella: una columna guardaría sólo la última.

-- ── 1 · EL ALCANCE ────────────────────────────────────────────────────────────────────────────
-- Una exclusión mueve plata, así que `fuente` es NOT NULL: «no incluye pintura» dicho en una reunión
-- y «el pliego art. 4.2 excluye las terminaciones» valen distinto delante de un cliente que reclama,
-- y la diferencia es exactamente de dónde salió.
create table if not exists public.cotizacion_alcance (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references public.cotizaciones (id) on delete cascade,
  patron         text not null,
  estado         text not null check (estado in ('INCLUIDO', 'EXCLUIDO', 'POR_DEFINIR')),
  fuente         text not null,
  texto_literal  text,
  decidido_por   uuid default auth.uid(),
  motivo         text,
  creado_en      timestamptz not null default now(),
  constraint cotizacion_alcance_patron_unico unique (cotizacion_id, patron)
);

comment on table public.cotizacion_alcance is
  'Qué entra, qué no entra y qué todavía no se decidió, por cotización. El patrón se compara contra '
  'el nombre, el código y el rubro de la partida — es texto y no un id porque el alcance se declara '
  'ANTES de que existan las partidas: el pliego dice «no incluye pintura» sin saber qué código le va '
  'a tocar. Una exclusión NO borra la partida: la saca del total y conserva el cómputo, así que si '
  'el cliente cambia de idea vuelve entera en vez de volver a computarse.';
comment on column public.cotizacion_alcance.fuente is
  'NOT NULL a propósito. Una exclusión mueve plata y sin fuente no se puede defender: el caso real '
  'es el contrato de Quattropani, que excluye entrepiso y escalera y se computaron igual.';
comment on column public.cotizacion_alcance.estado is
  'POR_DEFINIR es el default honesto y NO se cotiza: si nadie dijo que va, cotizarla es decidir por '
  'el cliente, y si al final va aparece como diferencia contra la oferta.';

create index if not exists cotizacion_alcance_por_cotizacion on public.cotizacion_alcance (cotizacion_id);

-- ── 2 · LOS EVENTOS ───────────────────────────────────────────────────────────────────────────
-- Un presupuesto se negocia: la cantidad cambia tres veces, el beneficio baja y vuelve, la sanitaria
-- pasa de propia a subcontratada. Al final alguien pregunta por qué esta obra quedó en 168 y la
-- anterior parecida en 190, y la respuesta no está en el estado final: está en la secuencia.
create table if not exists public.cotizacion_evento (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references public.cotizaciones (id) on delete cascade,
  accion         text not null,
  entidad        text not null,
  campo          text,
  antes          jsonb,
  despues        jsonb,
  actor          uuid not null default auth.uid(),
  motivo         text,
  correlation_id uuid not null,
  revierte_a     uuid references public.cotizacion_evento (id),
  cuando         timestamptz not null default now()
);

comment on table public.cotizacion_evento is
  'Append-only. DESHACER NO BORRA: crea un evento nuevo con revierte_a apuntando al que revierte, y '
  'la historia queda con las dos entradas. Borrar el evento haría que «lo intentamos y lo dimos de '
  'baja» se viera igual que «nunca se intentó», y esas dos cosas dicen cosas distintas sobre cómo se '
  'cotizó la obra.';
comment on column public.cotizacion_evento.correlation_id is
  'Un solo pedido —«sacá pintura»— produce N mutaciones: la exclusión, el recálculo de cada partida '
  'y el total nuevo. Todas comparten correlation_id, así que el undo revierte el pedido ENTERO. Sin '
  'esto, deshacer dejaría el alcance restaurado y el total viejo.';
comment on column public.cotizacion_evento.antes is
  'El VALOR, no una descripción: «cambió la cantidad» no permite reconstruir nada, «520 → 5200» sí.';

create index if not exists cotizacion_evento_por_cotizacion on public.cotizacion_evento (cotizacion_id, cuando);
create index if not exists cotizacion_evento_por_correlacion on public.cotizacion_evento (correlation_id);

-- ── 3 · LA HUELLA DE ENTRADAS ─────────────────────────────────────────────────────────────────
-- Sirve para dos cosas distintas y las dos importan: REPRODUCIBILIDAD (dos corridas con los mismos
-- inputs tienen que dar la misma huella) y REVISIÓN (cuando llega documentación nueva, comparar la
-- huella de hoy con la congelada dice EXACTAMENTE qué cambió, sin diffear dos presupuestos enteros).
--
-- Es del INPUT, no del output: una huella del resultado no distingue «cambió el precio del cemento»
-- de «cambió la política comercial», y las dos mueven el total.
create table if not exists public.cotizacion_huella (
  id             uuid primary key default gen_random_uuid(),
  cotizacion_id  uuid not null references public.cotizaciones (id) on delete cascade,
  version        int not null,
  sha256         text not null check (length(sha256) = 64),
  partes         jsonb not null,
  resumen        text,
  calculada_en   timestamptz not null default now(),
  constraint cotizacion_huella_version_unica unique (cotizacion_id, version)
);

comment on table public.cotizacion_huella is
  'La huella de las ENTRADAS con las que se congeló cada versión: documentos, cantidades, precios, '
  'política, alcance y tipo de cambio. `partes` guarda el detalle porque una diferencia de huella '
  'tiene que poder EXPLICARSE y no sólo detectarse.';
comment on column public.cotizacion_huella.partes is
  'Cada llave se serializa ORDENADA. Sin eso, dos corridas idénticas que recorrieran las partidas en '
  'distinto orden darían huellas distintas y la reproducibilidad diría que falló cuando no falló.';

-- ── 4 · LA ESTRUCTURA DE INDIRECTOS ───────────────────────────────────────────────────────────
-- «GG = 27 %» a secas no dice si ese 27 salió de sumar la estructura de la empresa o de que alguien
-- lo tipeó. Con esta tabla el porcentaje se CALCULA, y el que se APLICA se guarda al lado sin perder
-- el calculado: la diferencia entre los dos es una decisión que se puede mirar.
create table if not exists public.indirecto_concepto (
  id             uuid primary key default gen_random_uuid(),
  version        int not null,
  vigente        boolean not null default false,
  concepto       text not null,
  monto_anual    numeric not null check (monto_anual >= 0),
  fuente         text not null,
  notas          text,
  creado_en      timestamptz not null default now(),
  constraint indirecto_concepto_unico unique (version, concepto)
);

comment on table public.indirecto_concepto is
  'Los conceptos que forman los gastos indirectos de la empresa, con su monto anual y su fuente. El '
  'porcentaje se calcula como Σ montos ÷ costo directo anual. SIN ESTRUCTURA DECLARADA el calculado '
  'es NULL y nunca cero: un indirecto de cero significaría que la empresa no tiene estructura. Hoy '
  'el 27 % vive como un escalar en parametro_comercial y esta tabla no lo reemplaza — lo explica.';

create unique index if not exists indirecto_concepto_una_version_vigente
  on public.indirecto_concepto (concepto) where vigente;

-- ── 5 · PERMISOS ──────────────────────────────────────────────────────────────────────────────
-- Las cuatro son ECONÓMICAS: el alcance define qué se cobra, los eventos exponen la negociación, la
-- huella referencia precios y política, y los indirectos son la estructura de costos de la empresa.
--
-- El portero va envuelto en `(select …)` para que Postgres lo evalúe UNA vez por consulta y no una
-- por fila. Sin eso, la policy por fila costó 64 s en este repo sobre una tabla de siete mil filas.
--
-- Y RLS NO ES GRANT: una policy sin su GRANT devuelve «permission denied», que Next muestra como un
-- 404 y se lee como «no hay datos». Las dos cosas van juntas o no va ninguna.
alter table public.cotizacion_alcance   enable row level security;
alter table public.cotizacion_evento    enable row level security;
alter table public.cotizacion_huella    enable row level security;
alter table public.indirecto_concepto   enable row level security;

drop policy if exists cotizacion_alcance_economia on public.cotizacion_alcance;
create policy cotizacion_alcance_economia on public.cotizacion_alcance for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

-- Los eventos son APPEND-ONLY también para la base, no sólo para el código: sin este split, un
-- UPDATE de PostgREST reescribía el `antes` de un evento y la historia dejaba de ser historia. El
-- undo se hace INSERTANDO el evento inverso, que es justamente lo que esta policy permite.
drop policy if exists cotizacion_evento_economia on public.cotizacion_evento;
drop policy if exists cotizacion_evento_lectura on public.cotizacion_evento;
drop policy if exists cotizacion_evento_alta on public.cotizacion_evento;
create policy cotizacion_evento_lectura on public.cotizacion_evento for select to authenticated
  using ((select public.ve_economia()));
create policy cotizacion_evento_alta on public.cotizacion_evento for insert to authenticated
  with check ((select public.ve_economia()));

-- La huella también: se calcula al congelar y no se retoca. Si la huella se pudiera editar, la
-- revisión podría decir que no cambió nada cuando cambió todo.
drop policy if exists cotizacion_huella_lectura on public.cotizacion_huella;
drop policy if exists cotizacion_huella_alta on public.cotizacion_huella;
create policy cotizacion_huella_lectura on public.cotizacion_huella for select to authenticated
  using ((select public.ve_economia()));
create policy cotizacion_huella_alta on public.cotizacion_huella for insert to authenticated
  with check ((select public.ve_economia()));

drop policy if exists indirecto_concepto_economia on public.indirecto_concepto;
create policy indirecto_concepto_economia on public.indirecto_concepto for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

grant select, insert, update, delete on public.cotizacion_alcance  to authenticated;
grant select, insert                 on public.cotizacion_evento   to authenticated;
grant select, insert                 on public.cotizacion_huella   to authenticated;
grant select, insert, update, delete on public.indirecto_concepto  to authenticated;

grant all on public.cotizacion_alcance, public.cotizacion_evento,
             public.cotizacion_huella, public.indirecto_concepto to service_role;
