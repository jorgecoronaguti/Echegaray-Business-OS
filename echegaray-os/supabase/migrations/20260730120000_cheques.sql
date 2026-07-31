-- LOS CHEQUES, EN LA BASE — LA PUERTA QUE FALTABA, HERMANA DE banco_movimientos.
--
-- POR QUÉ (30/07). El dueño trajo las pantallas de eCHEQ del Santander (recibidos y emitidos) y una
-- Orden de Pago de un cliente con 5 cheques de terceros. No había dónde ponerlos: el único registro
-- de cheques del OS es `orquestador/lib/cheques-recibidos.mjs`, un array ESCRITO A MANO con
-- `CORTE = '2026-07-22'`. Cargar los cheques del día significaba editar JavaScript — el mismo defecto
-- que ya se corrigió para el extracto bancario. Un dato operativo que sólo se actualiza tocando el
-- código no se actualiza: envejece.
--
-- ═══ UNA FILA ES UN CHEQUE, NO UNA OPERACIÓN ═══
--
-- Es la distinción que hacía inservible el registro anterior. La pantalla de OPERACIONES del banco
-- lista cada paso del ciclo de vida (Aceptación → Custodia → Depósito, o Aceptación → Endoso), así
-- que el mismo valor genera varias filas y sumar la columna Importe cuenta el mismo cheque tres
-- veces: el endoso de $20.000.000 figuraba como Endoso Y como Rescate el mismo día. Peor, ese
-- registro no trae número de cheque ni librador, así que no se puede cruzar contra nada.
--
-- Acá la fila es el CHEQUE, con su número, su librador y su fecha de pago. El estado es una columna
-- que cambia, no una fila nueva. Así la cartera se puede sumar sin miedo y cada cheque se puede
-- cruzar contra el extracto (`banco_movimientos`) y contra la cobranza que lo trajo.
--
-- ═══ POR QUÉ LA CARGA ES UPSERT Y NO INSERT (la diferencia con el extracto) ═══
--
-- Un movimiento bancario es un hecho inmutable: pasó, con esa fecha y ese importe, y nunca cambia.
-- Un cheque NO: el mismo cheque está hoy "en custodia", el martes "depositado" y el jueves "pagado".
-- Si la clave única incluyera el estado, cada foto del banco crearía un cheque nuevo y la cartera se
-- triplicaría. Por eso la clave natural es (tipo, banco, número) —un banco no emite dos cheques con
-- el mismo número— y una segunda lectura ACTUALIZA estado, fecha de pago, importe y corte en vez de
-- insertar. Efecto secundario deseado: una relectura CORRIGE un importe mal transcripto en vez de
-- dejar un fantasma al lado del bueno.

create table if not exists public.cheques (
  id               bigserial primary key,
  -- 'recibido' = valor de un tercero que entró (se vuelve caja al depositarlo).
  -- 'emitido'  = cheque propio entregado a un proveedor (sale de la cuenta en su fecha de pago).
  tipo             text        not null check (tipo in ('recibido', 'emitido')),
  numero           text        not null,
  -- Banco librador. En los eCHEQ propios es el nuestro; en un cheque de tercero endosado por un
  -- cliente es el banco de ESE tercero (Credicoop, Galicia, Supervielle…). Parte de la clave.
  banco            text,
  librador         text,        -- quién emitió el cheque (el "emisor" de la pantalla del banco)
  librador_cuit    text,
  -- Recibido: de quién lo recibimos (puede no ser el librador — un cliente endosa cheques de otros).
  -- Emitido: el beneficiario. Esa asimetría es real y no se fuerza a un solo nombre.
  contraparte      text,
  contraparte_cuit text,
  caracter         text,        -- 'A la orden', etc., tal como lo declara el banco
  -- CUÁNDO EL VALOR SE VUELVE CAJA. Es la pregunta que el registro anterior no podía contestar: no es
  -- la fecha de la operación (cuándo el banco registró la custodia), es la fecha de pago del cheque.
  fecha_pago       date,
  importe          numeric(16,2) not null check (importe > 0),
  estado           text        not null,
  cuenta           text,        -- la cuenta del cheque (los emitidos del Santander la traen)
  -- La Orden de Pago del cliente que trajo este cheque. Es lo que permite cruzar la cartera contra la
  -- cobranza y contra el depósito del extracto: sin esto, un depósito de $16.807.425,92 en el banco
  -- no se puede atribuir a las facturas que lo originaron.
  orden_pago       text,
  obra             text,
  -- De dónde salió esta fila, declarado. Regla de oro: fórmula o celda con ORIGEN TRAZABLE.
  origen           text        not null,
  -- A qué fecha es esta foto del ESTADO. Una réplica que no dice cuándo se sacó envejece sin gritar:
  -- es el defecto que ya rompió el espejo de JORNALES y el IPC en este mismo proyecto.
  corte            date        not null,
  importado_en     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- LA CLAVE NATURAL DEL CHEQUE, EN LA BASE Y NO EN EL SCRIPT. Un chequeo en código se saltea la
-- primera vez que el importador corre dos veces en paralelo. `coalesce` en banco porque puede faltar
-- (en un índice único NULL nunca es igual a NULL: sin esto se duplicaría en cada corrida).
create unique index if not exists cheques_unico
  on public.cheques (tipo, coalesce(banco, ''), numero);

create index if not exists cheques_fecha_pago on public.cheques (fecha_pago);
create index if not exists cheques_estado on public.cheques (tipo, estado);
create index if not exists cheques_orden_pago on public.cheques (orden_pago) where orden_pago is not null;

alter table public.cheques enable row level security;

drop policy if exists cheques_lectura on public.cheques;
create policy cheques_lectura on public.cheques
  for select using (auth.role() = 'authenticated');

-- La escritura es del service role (el importador del OS). Nadie carga cheques desde la web.
drop policy if exists cheques_escritura on public.cheques;
create policy cheques_escritura on public.cheques
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

comment on table public.cheques is
  'Cheques y eCHEQ, uno por fila (NO una fila por operación: sumar operaciones cuenta el mismo cheque varias veces). Recibidos = cartera que se vuelve caja en fecha_pago; emitidos = plata firmada que todavía no salió. Carga por UPSERT sobre (tipo, banco, numero) porque el estado cambia con el tiempo. Se cruza con banco_movimientos (el depósito) y con cobranzas (la factura que lo originó).';

comment on column public.cheques.corte is
  'Fecha de la foto del estado. Sin esto no se sabe si "en custodia" es de hoy o de hace tres semanas.';
