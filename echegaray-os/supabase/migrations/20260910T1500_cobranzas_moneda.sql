-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA COLUMNA "Moneda" DE COBRANZAS LLEGA A LA RÉPLICA — y con ella, la trazabilidad de la valuación
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- EL DEFECTO (verificado contra el Sheet vivo el 10/09/2026). `sync-cobranzas.mjs` leía el rango
-- `Cobranzas!A5:R` —hasta la columna 18— y la columna "Moneda" de la pestaña es la **AA**. La fila 62
-- de Quattropani dice `U$S 15.400` y entraba a `public.cobranzas` como **$15.400**: el cobrado de su
-- cuenta corriente daba $23.273.434 menos que el Sheet, y no había forma de verlo — un 15.400 en una
-- columna de pesos no se ve mal. Es el mismo defecto que se arregló del lado de la pestaña el
-- 13/08/2026 (Obras!D14 valuaba y el Cash Flow no), reaparecido por el lado del rango leído.
--
-- QUÉ CAMBIA. Desde ahora `monto_neto`, `iva`, `retenciones` y `total_bruto` se guardan **EN PESOS**,
-- valuados con el mismo `TIPO_CAMBIO_USD` que usan las fórmulas del archivo (misma función
-- `valuarEnPesos`: una definición, no dos). Las once caras que leen esta tabla suman esas columnas
-- como pesos y ninguna sabe de monedas — hacerlas conscientes de la moneda una por una es multiplicar
-- por once la posibilidad de que alguna se olvide.
--
-- POR QUÉ TAMBIÉN SE GUARDA EL NATIVO. Un importe valuado sin decir a qué tipo de cambio no se puede
-- auditar ni recalcular: `moneda`, `tipo_cambio`, `monto_neto_origen` y `total_bruto_origen` son la
-- evidencia de cómo se formó el número en pesos. El tipo de cambio se mueve todos los días; sin estas
-- cuatro columnas, la diferencia entre la réplica y el Sheet sería imposible de explicar.
--
-- `moneda` NO tiene default 'ARS' ni not null: una fila vieja escrita antes de esta migración tiene
-- moneda DESCONOCIDA, y decir 'ARS' de algo que no se miró es exactamente lo que este trabajo vino a
-- arreglar. El sync la escribe entera en cada corrida (delete + insert), así que el NULL dura una hora.

alter table public.cobranzas add column if not exists moneda             text;
alter table public.cobranzas add column if not exists tipo_cambio        numeric;
alter table public.cobranzas add column if not exists monto_neto_origen  numeric;
alter table public.cobranzas add column if not exists total_bruto_origen numeric;

-- El código de moneda sale de `normalizarMoneda` (orquestador/lib/cobranzas-contrato.mjs) y sólo
-- puede ser uno de dos: si mañana la pestaña escribe "EUR", el sync ABORTA nombrando la fila en vez
-- de sumar euros como pesos. Este CHECK es la misma regla, del lado de la base.
do $$ begin
  alter table public.cobranzas add constraint cobranzas_moneda_ck check (moneda in ('ARS','USD'));
exception when duplicate_object then null; end $$;

comment on column public.cobranzas.moneda is
  'Moneda de la fila en el Sheet (columna AA), normalizada: ARS | USD. Los importes de esta tabla YA '
  'están en pesos; esta columna dice en qué moneda estaban escritos.';
comment on column public.cobranzas.tipo_cambio is
  'TIPO_CAMBIO_USD con el que se valuó esta fila (1 cuando es ARS). Sin él, el importe en pesos no se '
  'puede auditar ni recalcular: el TC se mueve todos los días.';
comment on column public.cobranzas.monto_neto_origen is 'Monto neto tal como lo escribe el Sheet, en su moneda.';
comment on column public.cobranzas.total_bruto_origen is 'Total bruto tal como lo escribe el Sheet, en su moneda.';
comment on column public.cobranzas.total_bruto is
  'Total bruto EN PESOS. Si la fila está en USD, es total_bruto_origen x tipo_cambio. Antes del '
  '10/09/2026 esta columna guardaba el número desnudo de la celda y mezclaba dólares con pesos.';

-- SIN GRANT, A PROPÓSITO. Una columna nueva nace sin permiso y quien la lea como `authenticated`
-- recibe "permission denied" — pero acá no la lee nadie: `cliente_cuenta_corriente` usa `total_bruto`
-- (que ya está en pesos y ya tiene su grant desde el 05/09) y el orquestador entra por `service_role`,
-- que no pasa por RLS. El grant de esta tabla está acotado a las cinco columnas que la vista usa y
-- ampliarlo "por si acaso" es agrandar la superficie de datos financieros de clientes sin un
-- consumidor que lo pida. El día que una pantalla muestre la moneda, se agrega ESA columna.
