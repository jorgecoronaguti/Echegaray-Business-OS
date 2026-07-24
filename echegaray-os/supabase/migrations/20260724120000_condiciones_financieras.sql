-- CONDICIONES FINANCIERAS — la fuente ÚNICA de verdad de tasas, costos y condiciones vigentes de
-- cada alternativa de financiamiento (descubierto, préstamos, descuento de cheques, eCheq,
-- financiación de proveedores, tarjeta, pago diferido…).
--
-- POR QUÉ EXISTE (24/07). El motor de Ingeniería Financiera ya compara alternativas, pero pedía las
-- tasas a mano cada vez (`comparar_financiamiento` devolvía "FALTA la tasa" para préstamo y descuento
-- de cheque). Esta tabla es donde viven, UNA sola vez, las condiciones reales — con su fuente,
-- vigencia y nivel de confianza. El motor las consume; nunca las inventa.
--
-- REGLAS QUE HACE CUMPLIR EL ESQUEMA:
--  · `fuente` es NOT NULL: ninguna condición entra sin decir de dónde salió (trazabilidad).
--  · `nivel_confianza` distingue lo verificado de lo informado/estimado/pendiente — una tasa que
--    todavía no se consiguió se guarda como 'pendiente' con las tasas en NULL, NO con un número
--    inventado.
--  · el índice único evita dos condiciones del mismo producto/entidad/moneda para la misma vigencia:
--    no se duplica una línea por banco ni por producto.
create table if not exists public.condiciones_financieras (
  id                   bigint generated always as identity primary key,
  entidad              text not null,               -- Banco Santander, Proveedor X, ARCA…
  producto             text not null,               -- "Acuerdo de descubierto N°00007", "Tarjeta Visa Business"…
  tipo_financiacion    text not null check (tipo_financiacion in (
                         'descubierto','prestamo','descuento_cheque','echeq','tarjeta',
                         'financiacion_proveedor','pago_diferido','impuesto','otro')),
  moneda               text not null default 'ARS',
  vigencia_desde       date,
  vigencia_hasta       date,
  -- Tasas: fracciones (0.55 = 55%). NULL = no se conoce; NO se inventa. El CFT es el que manda para
  -- comparar (costo financiero total efectivo), no la TNA sola.
  tna                  numeric,
  tea                  numeric,
  cft                  numeric,
  iva_sobre_intereses  numeric,                     -- fracción de IVA (+percep) sobre el interés, ej 0.12
  comisiones           numeric,                     -- monto fijo en `moneda` (NULL si no aplica/​no se sabe)
  gastos               numeric,                     -- monto fijo en `moneda`
  plazo_dias           integer,                     -- plazo total del producto (préstamo)
  dias_minimos         integer,                     -- días mínimos que cobra (ej. descuento de cheque)
  limite_disponible    numeric,                     -- margen sin usar de la línea
  saldo_utilizado      numeric,                     -- ya usado de la línea
  amortizacion         text,                        -- francés / bullet / revolving…
  fecha_debito         text,                        -- cuándo debita (texto: puede ser "día 3 de cada mes")
  garantias            text,
  fuente               text not null,               -- de dónde salió el dato (extracto, contrato, resumen…)
  actualizado_en       timestamptz not null default now(),
  nivel_confianza      text not null default 'pendiente'
                         check (nivel_confianza in ('verificado','informado','estimado','pendiente')),
  observaciones        text
);

create unique index if not exists condiciones_financieras_unica
  on public.condiciones_financieras (entidad, producto, tipo_financiacion, moneda, coalesce(vigencia_desde, '1900-01-01'::date));

alter table public.condiciones_financieras enable row level security;
drop policy if exists condiciones_financieras_read on public.condiciones_financieras;
-- Lectura para cualquier autenticado (info de gestión de la propia empresa). La escritura la hace el
-- backend con el rol de servicio, que ignora RLS.
create policy condiciones_financieras_read on public.condiciones_financieras
  for select to authenticated using (true);
grant select on public.condiciones_financieras to authenticated;

comment on table public.condiciones_financieras is
  'Fuente única de condiciones de financiamiento (tasas, costos, límites) que consume el motor de Ingeniería Financiera. Toda fila tiene fuente y nivel de confianza; las tasas desconocidas van en NULL, nunca inventadas.';
