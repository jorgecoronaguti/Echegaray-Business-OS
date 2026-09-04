-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PLAZO DE COBRO SALE DE LA ORDEN DE COMPRA, Y CADA FILA DICE DE DÓNDE SALIÓ EL SUYO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- POR QUÉ. Medido sobre `Cobranzas` el 04/09/2026: el plazo de cobro no salía de la OC en NINGUNA
-- de las 95 filas. Vivía de tres formas incompatibles a la vez —una constante global de 30 días en
-- `orquestador/lib/cobranzas-vencido.mjs`, texto tipeado a mano en la columna H que además gobierna
-- la fórmula (`H100 = "… cta. cte. 15 días"` con `Q100 = =P100+15`), y 82 fechas clavadas sin
-- fórmula—. Las 13 filas que sí calculan `=P+N` declaran CUATRO plazos distintos (30, 70, 75, 15):
-- una constante única no puede estar bien nunca.
--
-- Y estaba mal donde más plata mueve: la OC 00002-00002266 dice `CUENTA CORRIENTE 30 DIAS` y la
-- fila 100 proyecta a 15, sobre $12.154.975.
--
-- ═══ POR QUÉ UNA TABLA NUEVA Y NO `condiciones_financieras` ═══
--
-- Se miró primero. `public.condiciones_financieras` es el catálogo de lo que NOS financian a
-- nosotros: entidad, producto, TNA, CFT, límite disponible, garantías — descubierto Santander,
-- FONDEFIN, leasing, tarjeta. Es financiación BANCARIA tomada. Acá se registra la condición de
-- cobro que un CLIENTE pactó en su orden de compra: no comparte ni una columna con aquella, y
-- meterla ahí obligaría a que casi todo el esquema quede en NULL y a que «entidad» signifique dos
-- cosas. Reutilizar el nombre no es reutilizar el concepto.
--
-- ═══ POR QUÉ LA CLAVE ES LA ORDEN Y NO EL CLIENTE ═══
--
-- Porque el plazo es de la ORDEN. MESSINA tiene la 00002-00000279 a 15 días y la 00002-00002266 a
-- 30, las dos vigentes. Una condición por cliente sería otra constante, un poco menos global.
-- La fila con `orden_compra` vence a la fila con sólo `cliente`: esa es toda la cascada.
--
-- ═══ LO QUE NO SE SABE SE VE ═══
--
-- `dias` es NULLABLE a propósito, y una fila con `dias` en NULL es información, no basura: la OC
-- 00002-00002173 dice «50% ANTICIPADO - 50% CONTRA ENTREGA», que es un hito y no se mide en días.
-- Ponerle 30 sería fabricar el dato con el documento delante. `evidencia` guarda el texto literal.
--
-- ESTA MIGRACIÓN NO SE APLICA SOLA — la aplica el dueño desde el árbol principal. Mientras tanto la
-- capacidad funciona igual: `orquestador/lib/plazo-cobro.mjs` es pura y la lectura de las OC vive
-- versionada en `orquestador/datos/plazos-cobro-oc.json`. La tabla es dónde va a vivir la capa que
-- sólo una persona puede cargar (la condición acordada de palabra con un cliente sin OC archivada)
-- y la que consume la web.

create table if not exists public.condicion_cobro (
  id             bigserial primary key,
  orden_compra   text,                          -- '00002-00002266' | '53312775' | null = vale para todo el cliente
  cliente        text,                          -- como se tipea en Cobranzas col G
  dias           int check (dias is null or (dias >= 0 and dias <= 365)),
  tipo           text not null default 'cuenta_corriente',  -- cuenta_corriente|cheque|contado|hitos|no_reconocida
  instrumento    text,                          -- 'cheque' cuando la condición lo impone; cambia el riesgo, no la fecha
  ancla          text not null default 'fecha_factura' check (ancla in ('fecha_factura', 'fecha_venta')),
  origen         text not null check (origen in ('ORDEN_DE_COMPRA', 'CONDICION_CLIENTE')),
  evidencia      text,                          -- el texto literal del documento: «CUENTA CORRIENTE 30 DIAS»
  drive_file_id  text,                          -- el PDF de la OC del que se leyó
  leido_el       date,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- una fila es de una orden O de un cliente, nunca de ninguno de los dos
  constraint condicion_cobro_alcance check (orden_compra is not null or cliente is not null),
  -- lo leído de una OC trae su evidencia sí o sí; lo cargado a mano puede no tener documento
  constraint condicion_cobro_evidencia check (origen <> 'ORDEN_DE_COMPRA' or evidencia is not null)
);

comment on table public.condicion_cobro is
  'La condición de cobro PACTADA. Fuente única del plazo con el que se proyecta cada cobranza. '
  'La fila con orden_compra le gana a la fila con sólo cliente, y las dos le ganan a la constante '
  'global de cobranzas-vencido.mjs, que es el último recurso y sale marcado SUPUESTO.';

comment on column public.condicion_cobro.dias is
  'NULL no es un hueco: es una condición que no se mide en días (hitos, contra entrega). El '
  'consumidor devuelve FALTA_DATO con la evidencia, nunca cae al supuesto.';

comment on column public.condicion_cobro.ancla is
  'Desde qué fecha se cuentan los días. «Cuenta corriente 30 días» se cuenta desde la FACTURA: en '
  'Cobranzas las columnas C (venta) y P (factura) difieren en 46 de 95 filas, hasta 82 días.';

-- Una sola condición vigente por orden, y una sola por cliente.
create unique index if not exists condicion_cobro_por_orden
  on public.condicion_cobro (orden_compra) where orden_compra is not null;
create unique index if not exists condicion_cobro_por_cliente
  on public.condicion_cobro (upper(cliente)) where orden_compra is null;

alter table public.condicion_cobro enable row level security;

-- RLS sin GRANT es «permission denied» (lección pagada en este repo): van los dos.
grant select on public.condicion_cobro to authenticated;
grant select, insert, update, delete on public.condicion_cobro to service_role;

drop policy if exists condicion_cobro_lectura on public.condicion_cobro;
create policy condicion_cobro_lectura on public.condicion_cobro
  for select to authenticated using (true);

drop policy if exists condicion_cobro_servicio on public.condicion_cobro;
create policy condicion_cobro_servicio on public.condicion_cobro
  for all to service_role using (true) with check (true);
