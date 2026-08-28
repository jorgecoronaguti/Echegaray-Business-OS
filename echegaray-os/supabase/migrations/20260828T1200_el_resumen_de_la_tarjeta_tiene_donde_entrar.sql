-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL RESUMEN DE LA TARJETA TIENE DÓNDE ENTRAR — la puerta que existía para el banco y no para la
-- tarjeta
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ POR QUÉ (28/08/2026) ═══
--
-- Textual del dueño: «cuando empiece a enviar los resúmenes se debe actualizar».
--
-- Hasta hoy la tarjeta vivía como una CONSTANTE ESCRITA A MANO en `orquestador/lib/banco-santander.mjs`
-- (`TARJETA`). Para los movimientos del banco la puerta existe desde el 23/07 —`importar-banco.mjs`
-- sobre `public.banco_movimientos`—; para la tarjeta no existía ninguna: cada resumen nuevo obligaba
-- a que alguien editara JavaScript. Un dato operativo que sólo se actualiza tocando el código no se
-- actualiza: envejece. La pestaña llegó a publicar el disponible con la etiqueta «foto de hace 30
-- días» porque nadie podía cargar el resumen nuevo sin abrir un `.mjs`.
--
-- ═══ TRES TABLAS Y NO UNA: EL RESUMEN, SUS LÍNEAS Y SU FUTURO ═══
--
--   `tarjeta_resumen`         la cabecera: qué documento es, cuánto debita y cuándo.
--   `tarjeta_resumen_linea`   cada consumo y cada cargo. SEPARADOS POR `tipo`, porque la pregunta
--                             del dueño —«qué me están cobrando»— es exactamente la diferencia
--                             entre un consumo (algo que compré) y un cargo (algo que me cobran por
--                             tener la tarjeta). Guardarlos mezclados haría que responderla sea una
--                             interpretación cada vez.
--   `tarjeta_cuota_a_vencer`  la tabla que publica el banco con lo YA COMPROMETIDO mes a mes. Es lo
--                             único del resumen que habla del futuro, y es el piso —el único hecho—
--                             de la proyección de la próxima liquidación.
--
-- ═══ LA IDENTIDAD DEL RESUMEN Y POR QUÉ SON DOS ÍNDICES ═══
--
-- La clave natural es (tarjeta, número de resumen). Pero un resumen puede llegar sin número legible
-- —el número no tiene rótulo propio en el PDF y se ubica por posición—, y en ese caso la fecha de
-- cierre lo identifica igual: una tarjeta cierra UNA vez por período. Por eso hay dos índices únicos
-- y no uno: el de número sólo aplica cuando hay número (`where numero is not null`), y el de cierre
-- aplica siempre. Cargar dos veces el mismo PDF no puede duplicar nada, y la garantía la da la BASE
-- —no el script—: un chequeo en código se saltea la primera vez que alguien corre el importador dos
-- veces en paralelo.
--
-- ═══ LOS IMPORTES SON `numeric`, NUNCA `float` ═══
--
-- $2.208.958,42 en punto flotante deja de ser $2.208.958,42 en cuanto se suma tres veces, y la
-- identidad que verifica el resumen (consumos + cargos = lo que se debita) empieza a fallar por
-- centavos que no existen. Mismo criterio que `banco_movimientos`.

create table if not exists public.tarjeta_resumen (
  id                      bigserial primary key,

  -- QUÉ PLÁSTICO. El banco lo nombra de dos formas —"Visa 921127486" (el contrato) y "Visa
  -- terminada en 3319" (el plástico)— y son la misma tarjeta. Se guardan las dos: perder una obliga
  -- a adivinar la próxima vez que el banco use la otra.
  tarjeta                 text        not null,
  cuenta_tarjeta          text,
  titular                 text,

  -- Nulo posible: ver arriba. Si falta, manda el cierre.
  numero                  text,
  cierre                  date        not null,
  vencimiento             date        not null,
  cierre_anterior         date,
  vencimiento_anterior    date,
  proximo_cierre          date,
  proximo_vencimiento     date,

  limite_compra           numeric(16,2),
  limite_cuotas           numeric(16,2),
  limite_financiacion     numeric(16,2),

  saldo_anterior_pesos    numeric(16,2),
  saldo_anterior_dolares  numeric(16,2),
  -- El pago que canceló (o no) el período anterior, tal como lo registra ESTE resumen. Es lo que
  -- permite armar el historial hacia atrás sin tener el PDF viejo, y el tipo de cambio con el que el
  -- banco convirtió el saldo en dólares — el único lugar del documento donde ese TC está declarado.
  pago_anterior_fecha     date,
  pago_anterior_importe   numeric(16,2),
  pago_anterior_tc        numeric(16,3),

  consumos_pesos          numeric(16,2),
  consumos_dolares        numeric(16,2),
  cargos_pesos            numeric(16,2),

  -- LA ÚNICA CIFRA DEL DOCUMENTO QUE ES UNA OBLIGACIÓN CON FECHA CIERTA: sale de la cuenta corriente
  -- sola, sin que nadie la mande. Dos monedas, dos columnas: sumarlas sería sumar peras con manzanas
  -- y esconder el único riesgo de tipo de cambio que tiene la tarjeta.
  a_debitar_pesos         numeric(16,2) not null,
  a_debitar_dolares       numeric(16,2) not null default 0,
  cuenta_debito           text,

  -- NULO significa "el resumen no lo trae o no lo pude identificar", NUNCA cero. Un pago mínimo en
  -- cero haría creer que no hay que pagar nada, y lo que no se paga financia al 6,411% mensual.
  pago_minimo             numeric(16,2),
  pago_minimo_verificado  boolean     not null default false,

  -- De dónde salió esta fila, declarado (regla de oro: fórmula o celda con origen trazable).
  origen                  text        not null,
  importado_en            timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

create unique index if not exists tarjeta_resumen_numero_unico
  on public.tarjeta_resumen (tarjeta, numero) where numero is not null;
create unique index if not exists tarjeta_resumen_cierre_unico
  on public.tarjeta_resumen (tarjeta, cierre);

create table if not exists public.tarjeta_resumen_linea (
  id            bigserial primary key,
  resumen_id    bigint      not null references public.tarjeta_resumen(id) on delete cascade,

  -- El orden en que el banco imprimió la línea. ES LA IDENTIDAD DE LA FILA dentro del resumen: el
  -- mismo PDF leído dos veces da el mismo orden, así que re-importar corrige en vez de duplicar. Un
  -- consumo puede repetirse el mismo día, por el mismo importe y en el mismo comercio (dos cargos de
  -- U$S 45 de ANTHROPIC el 31/07), y ninguna combinación de campos lo distingue.
  orden         int         not null,

  -- consumo | cargo | pago | saldo_anterior. La pregunta "qué me están cobrando" es esta columna.
  tipo          text        not null check (tipo in ('consumo', 'cargo', 'pago', 'saldo_anterior')),
  -- Para los cargos: sellos, sellos_provinciales, rg5617, iva, interes_financiacion, punitorio,
  -- comision, seguro, percepcion. Libre a propósito: un cargo que el banco invente mañana entra con
  -- su nombre y se ve, en vez de caer en un cajón de sastre.
  concepto      text,

  fecha         date,
  comprobante   text,
  comercio      text,
  referencia    text,
  -- El plan de cuotas "C.08/18" abierto: cuota 8 de 18. Es lo que permite reconstruir qué se vuelve
  -- a facturar el mes que viene — el control independiente de la tabla de cuotas a vencer.
  cuota         int,
  cuotas        int,

  importe_pesos   numeric(16,2) not null default 0,
  importe_dolares numeric(16,2) not null default 0,
  -- La base de la percepción RG 5617, que el banco imprime entre paréntesis. Verifica el consumo en
  -- dólares desde otra columna: base ÷ dólares = el TC del cierre.
  base          numeric(16,2),
  tc            numeric(16,3)
);

create unique index if not exists tarjeta_resumen_linea_unica
  on public.tarjeta_resumen_linea (resumen_id, orden);
create index if not exists tarjeta_resumen_linea_resumen on public.tarjeta_resumen_linea (resumen_id);

create table if not exists public.tarjeta_cuota_a_vencer (
  id            bigserial primary key,
  resumen_id    bigint      not null references public.tarjeta_resumen(id) on delete cascade,
  -- Primer día del mes en que el banco va a facturar esa cuota.
  mes           date        not null,
  importe       numeric(16,2) not null,

  -- ═══ "A PARTIR DE MARZO/27 $1.421.653,32" NO ES UNA CUOTA MENSUAL: ES EL TOTAL ═══
  --
  -- Es el renglón que miente si se lee rápido: 1.421.653,32 = 4 × 355.413,33 EXACTO. Leerlo como
  -- cuota mensual multiplica por N un compromiso que ya terminó, y el error crece con cada mes que
  -- se proyecte. Por eso la fila lo declara (`es_total`) y guarda en cuántas cuotas se reparte
  -- cuando la división da exacta — si no da exacta, queda en NULL y el importador lo dice.
  es_total      boolean     not null default false,
  cuotas        int,
  cuota         numeric(16,2)
);

create unique index if not exists tarjeta_cuota_unica on public.tarjeta_cuota_a_vencer (resumen_id, mes);

-- ── RLS: se lee autenticado, se escribe sólo con el service role (el importador del OS) ──────────
-- Nadie carga un resumen de tarjeta desde la web. Y la policy sin GRANT no alcanza: PostgREST
-- devuelve "permission denied" con la policy puesta si el rol no tiene el privilegio.
alter table public.tarjeta_resumen           enable row level security;
alter table public.tarjeta_resumen_linea     enable row level security;
alter table public.tarjeta_cuota_a_vencer    enable row level security;

drop policy if exists tarjeta_resumen_lectura on public.tarjeta_resumen;
create policy tarjeta_resumen_lectura on public.tarjeta_resumen
  for select using ((select auth.role()) = 'authenticated');
drop policy if exists tarjeta_resumen_escritura on public.tarjeta_resumen;
create policy tarjeta_resumen_escritura on public.tarjeta_resumen
  for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

drop policy if exists tarjeta_linea_lectura on public.tarjeta_resumen_linea;
create policy tarjeta_linea_lectura on public.tarjeta_resumen_linea
  for select using ((select auth.role()) = 'authenticated');
drop policy if exists tarjeta_linea_escritura on public.tarjeta_resumen_linea;
create policy tarjeta_linea_escritura on public.tarjeta_resumen_linea
  for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

drop policy if exists tarjeta_cuota_lectura on public.tarjeta_cuota_a_vencer;
create policy tarjeta_cuota_lectura on public.tarjeta_cuota_a_vencer
  for select using ((select auth.role()) = 'authenticated');
drop policy if exists tarjeta_cuota_escritura on public.tarjeta_cuota_a_vencer;
create policy tarjeta_cuota_escritura on public.tarjeta_cuota_a_vencer
  for all using ((select auth.role()) = 'service_role') with check ((select auth.role()) = 'service_role');

grant select on public.tarjeta_resumen, public.tarjeta_resumen_linea, public.tarjeta_cuota_a_vencer to authenticated;
grant all    on public.tarjeta_resumen, public.tarjeta_resumen_linea, public.tarjeta_cuota_a_vencer to service_role;
grant usage, select on sequence public.tarjeta_resumen_id_seq, public.tarjeta_resumen_linea_id_seq, public.tarjeta_cuota_a_vencer_id_seq to service_role;

comment on table public.tarjeta_resumen is
  'Resumen de la tarjeta Visa del Santander, tal como lo emite el banco. Entra por orquestador/scripts/importar-tarjeta.mjs desde el PDF; no hay API. La pestaña "Tarjeta de Credito" del Flujo de Caja se deriva de acá, y el "¿ya se pagó?" se prueba cruzando con public.banco_movimientos.';
