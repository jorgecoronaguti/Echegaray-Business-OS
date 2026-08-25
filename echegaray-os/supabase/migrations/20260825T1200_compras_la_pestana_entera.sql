-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA PESTAÑA «COMPRAS» ENTERA, NO LA MITAD QUE TENÍA OBRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 25/08/2026, textual: «la sección "compras" en app.ecsas tiene que replicar toda
-- la información que actualmente se concentra en pestaña Compras de Sheet Flujo de Fondos».
--
-- ═══ POR QUÉ UNA TABLA NUEVA Y NO MÁS COLUMNAS EN `costos_obra` ═══
--
-- `public.costos_obra` se llama así porque contesta UNA pregunta: cuánto costó cada obra. Su regla
-- de admisión es «tiene obra asignada y mueve plata», y todo lo que la lee suma por `obra_texto`.
-- Meterle las filas sin obra y las anuladas cambiaría el significado de una vista que ya está en
-- producción sin que ninguna consulta lo pida — el defecto que en este repo se llama «una vista que
-- cambia de significado».
--
-- Así que hay dos objetos con dos preguntas distintas y UNA sola lectura del Sheet:
--   · `public.compra_sheet`  — la pestaña TAL CUAL, fila por fila, columna por columna.
--   · `public.costos_obra`   — la proyección de siempre, con su regla de siempre, derivada de la
--                              anterior. Su contenido no cambia (verificado: 874 de 875 filas
--                              idénticas; la que difiere es la que tenía «—» por clave).
--
-- ═══ POR QUÉ LA CLAVE PRIMARIA ES EL RENGLÓN Y NO EL «ID» DE LA PESTAÑA ═══
--
-- El «ID» de la columna A es `=ROW()-4`: una POSICIÓN, no una identidad. Insertar una fila arriba
-- recorre todos los de abajo. Se guarda porque es lo que el dueño ve, pero nada se ata a él. La
-- identidad de un gasto es `clave` —`c:<cuit>|<número>`, la misma que usa el registro de
-- idempotencia del bot— y por eso los adjuntos se atan a ESA, nunca al renglón.
--
-- ═══ LAS FILAS ANULADAS SE REPLICAN ═══
--
-- El dueño anula una fila escribiendo ELIMINADO en «Estado» y poniendo sus importes en cero; la
-- fila queda en la pestaña. Se replica con su marca (`anulada`) porque él la ve: una pantalla que
-- muestra 876 filas sobre un libro de 882 no puede afirmar nada sobre las 6 que no mostró. Como
-- todas tienen total cero, no mueven ningún importe.

create table if not exists public.compra_sheet (
  -- EL RENGLÓN REAL DE LA PESTAÑA (4 es la primera de datos). Es la posición de HOY y por eso la
  -- réplica es un snapshot completo: se borra y se reescribe en una transacción, nunca se hace
  -- upsert por renglón — un upsert dejaría fósiles de filas que el dueño borró.
  fila                  integer primary key,
  -- Lo que dice la columna A. `null` cuando no es un número (el ID 0 leído con formato se dibuja «—»).
  sheet_id              integer,
  -- `c:<cuit>|<numero>` · `p:<proveedor>|<numero>` · `NC|` para las notas de crédito. NULL cuando la
  -- fila no tiene número de comprobante (212 de 882 al 25/08: pagos de sueldos, impuestos, anticipos).
  -- NO es única: la misma factura puede estar en dos renglones y eso es justamente lo que la columna
  -- «¿Comprobante repetido? (OS)» sirve para mirar. Declararla única acá escondería el problema
  -- rompiendo la réplica en vez de mostrarlo.
  clave                 text,

  categoria             text,
  fecha                 date,
  mes                   text,
  proveedor             text,
  modalidad             text,
  tipo                  text,
  comprobante           text,
  unidad_negocio        text,
  obra_texto            text,
  -- DOS CAMPOS, NO UNO. El sync viejo pegaba «Detalles / Obra» y «Concepto» con un guión largo:
  -- buscar por concepto arrastraba el detalle y el detalle dejaba de existir como dato.
  detalle_obra          text,
  concepto              text,

  importe               numeric,
  iva                   numeric,
  total                 numeric,

  tipo_pago             text,
  fecha_prevista        date,
  pago_total_o_parcial  text,
  monto_pagado          numeric,
  monto_parcial_1       numeric,
  fecha_prevista_2      date,
  monto_parcial_2       numeric,

  -- Pagado · Pendiente · Proyectado · ELIMINADO. Sin CHECK: el vocabulario lo fija el dueño en su
  -- desplegable y un CHECK acá haría que agregar un estado en el Sheet rompiera la réplica entera.
  estado                text,
  tipo_costo            text,
  estado_pago           text,
  estado_carga          text,
  fecha_caja            date,
  familia_material      text,
  sub_rubro             text,
  repetido              text,
  saldo_pendiente       numeric,
  cuit                  text,
  tramo_vencimiento     text,

  anulada               boolean not null default false,
  sincronizado_en       timestamptz not null default now()
);

comment on table public.compra_sheet is
  'Réplica fiel de la pestaña Compras del Sheet Flujo de Caja, fila por fila. La FUENTE sigue siendo el Sheet: esto es el espejo que lee la pantalla 24. No se escribe desde la web — la escribe orquestador/scripts/sync-compras.mjs por DATABASE_URL.';
comment on column public.compra_sheet.fila is
  'El renglón real de la pestaña. 4 es la primera fila de datos.';
comment on column public.compra_sheet.clave is
  'La identidad del comprobante, la MISMA que comunicacion.comprobantes_cargados.clave. Es a esto que se atan los adjuntos, nunca al renglón (que se mueve al insertar una fila arriba).';
comment on column public.compra_sheet.anulada is
  'El dueño escribió ELIMINADO en Estado. La fila existe en su pestaña y por eso existe acá; sus importes están en cero.';

-- La pantalla lista por fecha y busca por proveedor/comprobante/obra.
create index if not exists compra_sheet_fecha_idx on public.compra_sheet (fecha desc nulls last);
create index if not exists compra_sheet_clave_idx on public.compra_sheet (clave) where clave is not null;
create index if not exists compra_sheet_obra_idx on public.compra_sheet (obra_texto);
create index if not exists compra_sheet_estado_idx on public.compra_sheet (estado);

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────
--
-- Misma puerta que la pantalla 24 y que `comprobante_entrada`: `es_administracion()` — Dirección,
-- Administración y Jefe de Obra. Una compra es COSTO, no precio: lo que el jefe de obra no puede ver
-- es cuánto se vendió la obra, y eso no está acá.
--
-- El portero va en `(select …)` para que Postgres lo evalúe UNA vez por consulta y no una por fila:
-- por fila costaron 64 s en este mismo repo.
alter table public.compra_sheet enable row level security;

drop policy if exists compra_sheet_select on public.compra_sheet;
create policy compra_sheet_select on public.compra_sheet
  for select to authenticated using ((select public.es_administracion()));

-- NO HAY POLICY DE INSERT/UPDATE/DELETE. El espejo lo escribe el sync por DATABASE_URL, que no pasa
-- por RLS. Si `authenticated` pudiera escribir acá, la pantalla podría afirmar un gasto que el Sheet
-- —la fuente— nunca tuvo, y el espejo dejaría de ser un espejo.

-- Una columna nueva NACE SIN PERMISO: el grant no se hereda. Sin esto PostgREST devuelve «permission
-- denied» y Next lo muestra como un 404 vacío.
grant select on public.compra_sheet to authenticated;
