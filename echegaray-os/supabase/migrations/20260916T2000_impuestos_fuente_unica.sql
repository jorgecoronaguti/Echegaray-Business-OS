-- LOS IMPUESTOS, REGISTRADOS UNA SOLA VEZ — lo que se debe por período y lo que ya se pagó.
--
-- ═══ EL PEDIDO (dueño, 16/09/2026) ═══
--
-- «Tener siempre registrado IVA, Ganancias, Ingresos Brutos y demás impuestos, todo bien en Supabase
-- y llevado a app.ecsas.com.ar».
--
-- ═══ QUÉ EXISTÍA Y POR QUÉ NO ALCANZA ═══
--
--   · `obligaciones` es deuda comercial de UNA línea (concepto + monto + vencimiento). No tiene
--     período fiscal, ni impuesto, ni saldo a favor, ni de qué DDJJ salió. Su única fila impositiva
--     («Deuda impositiva (ARCA)» $1.982.466, 08/07) es un número del resumen viejo del Sheet que
--     nadie actualiza; meter ahí el IVA mensual la convertiría en dos cosas distintas con la misma
--     forma. No se toca: se propone retirarla aparte.
--   · `cargas_sociales_periodo` es el F931 POR CÓDIGO y quedó en junio (su réplica corrió el 20/07).
--     Es detalle de nómina, lo lee `liquida_sueldos()`; no tiene vencimiento, estado ni pago.
--   · `finanzas_calendario` es un payload jsonb generado: una foto, no un registro.
--   · `comprobantes_arca` son los libros, no la posición: débito y crédito, sin saldo arrastrado.
--
-- Lo que faltaba es el registro DEVENGADO (qué se determinó, por impuesto y período, con su fuente)
-- separado del PERCIBIDO (qué plata salió o qué crédito se sufrió, y cuándo). Son dos tablas porque
-- son dos ventanas de tiempo: un F931 de julio se paga el 11/08, una retención de agosto se computa
-- en la DDJJ de agosto. Mezclarlas en una fila es la regla de oro 3.
--
-- ═══ DOS PRINCIPIOS QUE LA FORMA IMPONE ═══
--
-- 1. DATO AUSENTE = NULL, NUNCA 0. Un IVA cuyo saldo anterior no se conoce tiene `a_pagar` null, no 0:
--    cero quiere decir «no hay que pagar», null quiere decir «no se sabe». Los importes aceptan null.
-- 2. CADA FILA DICE DE DÓNDE SALE. `fuente` es la naturaleza (DDJJ del contador / ARCA / cálculo del
--    OS / carga manual) y `lector` el mecanismo concreto que la escribió; el sincronizador sólo borra
--    lo de un lector que leyó bien (ver `orquestador/lib/impuestos-escritura.mjs`). Un mismo período
--    puede tener fila de dos fuentes —el cálculo sobre ARCA hasta que llega la DDJJ— y la vista elige.
--
-- ═══ QUIÉN LA LEE ═══
--
-- `ve_economia()` (Dirección y Administración), NO `es_administracion()`: desde el 19/08/2026 esta
-- última incluye al jefe de obra, y el impuesto de la empresa es plata de la empresa, no costo de una
-- obra. Es la misma línea que ya siguen `cotizaciones` y las vistas económicas (20260913T1200).
-- La escritura es sólo del sincronizador (conexión directa, dueña del esquema): `authenticated` no
-- tiene INSERT/UPDATE/DELETE. Una pantalla que pudiera escribir acá podría declarar pagado un impuesto.
--
-- ORDEN: no depende de nada posterior a 20260819T4900 (`ve_economia`).

set local lock_timeout = '3s';

-- ─── 1 · lo devengado ───────────────────────────────────────────────────────────────────────────
create table if not exists public.impuesto_obligacion (
  id uuid primary key default gen_random_uuid(),
  impuesto text not null check (impuesto in (
    'iva', 'iibb', 'ganancias', 'bienes_personales', 'cargas_sociales', 'impuesto_cheque', 'sellos', 'otro')),
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- 'ddjj' para la declaración mensual; 'anticipo', 'acciones y participaciones', etc. para el resto.
  concepto text not null default 'ddjj',
  fuente text not null check (fuente in ('ddjj_contador', 'arca', 'calculo', 'manual')),
  lector text not null,
  estado text not null check (estado in ('estimado', 'presentado', 'pagado')),
  vencimiento date,
  -- 'verificado' = tabla del organismo (`vencimientos-fiscales.mjs`); 'supuesto' = regla de reserva.
  vencimiento_confianza text check (vencimiento_confianza in ('verificado', 'supuesto')),
  -- IVA: débito − crédito del período (puede ser negativo). Resto: el impuesto determinado.
  determinado numeric(16, 2),
  base_imponible numeric(16, 2),
  -- Retenciones, percepciones y pagos a cuenta computados CONTRA este período.
  creditos numeric(16, 2),
  saldo_favor_anterior numeric(16, 2),
  a_pagar numeric(16, 2) check (a_pagar is null or a_pagar >= 0),
  saldo_a_favor numeric(16, 2) check (saldo_a_favor is null or saldo_a_favor >= 0),
  presentada_el date,
  comprobante text,
  documento text,
  -- Hasta qué fecha llegan los datos de la fuente. ARCA al 04/09 ≠ sincronizado hoy.
  datos_al date,
  detalle jsonb not null default '{}'::jsonb,
  sincronizado_en timestamptz not null default now(),
  constraint impuesto_obligacion_vencimiento_con_confianza
    check ((vencimiento is null) = (vencimiento_confianza is null)),
  constraint impuesto_obligacion_clave unique (impuesto, periodo, concepto, fuente)
);

comment on table public.impuesto_obligacion is
  'Lo DEVENGADO: una fila por impuesto × período × concepto × fuente. Null = no se sabe (nunca 0). '
  'La escribe orquestador/scripts/impuestos-a-postgres.mjs; la pantalla lee impuesto_posicion.';

-- ─── 2 · lo percibido ───────────────────────────────────────────────────────────────────────────
create table if not exists public.impuesto_pago (
  id uuid primary key default gen_random_uuid(),
  -- NULL = SIN IMPUTAR: un VEP cuyo impuesto no se puede probar se registra igual y se ve como tal.
  impuesto text check (impuesto in (
    'iva', 'iibb', 'ganancias', 'bienes_personales', 'cargas_sociales', 'impuesto_cheque', 'sellos', 'otro')),
  periodo text check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  concepto text,
  tipo text not null check (tipo in ('vep', 'debito_automatico', 'debito_bancario', 'retencion', 'percepcion')),
  fecha date not null,
  -- Positivo = salió hacia el fisco. Negativo sólo para una anulación del banco.
  importe numeric(16, 2) not null check (importe <> 0),
  fuente text not null check (fuente in ('banco', 'compras', 'cobranzas', 'manual')),
  lector text not null,
  -- Qué tan firme es la imputación: lo dice el papel, coincide al centavo con una DDJJ, o no se sabe.
  imputacion text not null check (imputacion in ('documento', 'importe', 'sin_imputar')),
  referencia text not null,
  contraparte text,
  descripcion text,
  detalle jsonb not null default '{}'::jsonb,
  sincronizado_en timestamptz not null default now(),
  constraint impuesto_pago_imputado_o_no check ((impuesto is null) = (imputacion = 'sin_imputar')),
  constraint impuesto_pago_clave unique (fuente, referencia)
);

comment on table public.impuesto_pago is
  'Lo PERCIBIDO: VEP, débitos del banco, retenciones y percepciones sufridas. impuesto null = sin '
  'imputar (se ve, no se adivina). Lo escribe orquestador/scripts/impuestos-a-postgres.mjs.';

create index if not exists impuesto_pago_imputado on public.impuesto_pago (impuesto, periodo, concepto);

-- ─── 3 · la constancia de cada corrida ──────────────────────────────────────────────────────────
-- Sin esto la pantalla no puede distinguir «no hay nada que pagar» de «el sincronizador no corre
-- desde hace una semana» ni de «corrió pero Drive no contestó».
create table if not exists public.impuesto_sincronizacion (
  id bigint generated always as identity primary key,
  corrio_en timestamptz not null default now(),
  -- Por lector: {ok, filas, datos_al, error}.
  lectores jsonb not null,
  escritas integer not null,
  borradas integer not null
);

comment on table public.impuesto_sincronizacion is
  'Una fila por corrida con --aplicar de impuestos-a-postgres.mjs: qué lector leyó, cuánto y hasta cuándo.';

-- ─── 4 · la posición: la fila vigente de cada obligación y lo pagado contra ella ────────────────
-- LA PRIORIDAD ES DE EVIDENCIA: la DDJJ presentada manda sobre el cálculo del OS; ARCA sobre la carga
-- manual. La fila de menor prioridad sigue en la tabla (es el control) pero no se muestra como vigente.
-- `pagado` suma sólo plata que salió (VEP y débitos). Las retenciones y percepciones ya están dentro de
-- `creditos` de la obligación: sumarlas acá sería contarlas dos veces.
create or replace view public.impuesto_posicion
with (security_invoker = true) as
with vigente as (
  select distinct on (o.impuesto, o.periodo, o.concepto) o.*
    from public.impuesto_obligacion o
   order by o.impuesto, o.periodo, o.concepto,
            case o.fuente when 'ddjj_contador' then 1 when 'arca' then 2 when 'manual' then 3 else 4 end
), pagos as (
  select p.impuesto, p.periodo, p.concepto,
         sum(p.importe) filter (where p.tipo in ('vep', 'debito_automatico', 'debito_bancario')) as pagado,
         max(p.fecha) as ultimo_pago
    from public.impuesto_pago p
   where p.impuesto is not null and p.periodo is not null
   group by 1, 2, 3
)
select v.id, v.impuesto, v.periodo, v.concepto, v.fuente, v.estado, v.vencimiento, v.vencimiento_confianza,
       v.determinado, v.base_imponible, v.creditos, v.saldo_favor_anterior, v.a_pagar, v.saldo_a_favor,
       v.presentada_el, v.comprobante, v.documento, v.datos_al, v.detalle, v.sincronizado_en,
       coalesce(pg.pagado, 0)::numeric(16, 2) as pagado,
       pg.ultimo_pago,
       case when v.a_pagar is null then null
            else greatest(v.a_pagar - coalesce(pg.pagado, 0), 0)::numeric(16, 2) end as pendiente
  from vigente v
  left join pagos pg on pg.impuesto = v.impuesto and pg.periodo = v.periodo and pg.concepto = v.concepto;

comment on view public.impuesto_posicion is
  'La obligación vigente por impuesto × período × concepto (DDJJ > ARCA > manual > cálculo) con lo '
  'pagado contra ella. security_invoker: la cierra la RLS de sus tablas.';

-- ─── 5 · permisos: leer sólo quien ve la plata; escribir, nadie desde la web ────────────────────
alter table public.impuesto_obligacion enable row level security;
alter table public.impuesto_pago enable row level security;
alter table public.impuesto_sincronizacion enable row level security;

revoke all on public.impuesto_obligacion, public.impuesto_pago, public.impuesto_sincronizacion,
  public.impuesto_posicion from anon, authenticated;

-- RLS NO ES GRANT: sin el grant la policy no alcanza y la pantalla lee «permission denied».
grant select on public.impuesto_obligacion, public.impuesto_pago, public.impuesto_sincronizacion,
  public.impuesto_posicion to authenticated;
grant all on public.impuesto_obligacion, public.impuesto_pago, public.impuesto_sincronizacion to service_role;

drop policy if exists impuesto_obligacion_lee_economia on public.impuesto_obligacion;
create policy impuesto_obligacion_lee_economia on public.impuesto_obligacion
  for select to authenticated using ((select public.ve_economia()));

drop policy if exists impuesto_pago_lee_economia on public.impuesto_pago;
create policy impuesto_pago_lee_economia on public.impuesto_pago
  for select to authenticated using ((select public.ve_economia()));

drop policy if exists impuesto_sincronizacion_lee_economia on public.impuesto_sincronizacion;
create policy impuesto_sincronizacion_lee_economia on public.impuesto_sincronizacion
  for select to authenticated using ((select public.ve_economia()));
