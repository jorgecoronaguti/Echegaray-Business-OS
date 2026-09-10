-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `cliente_cobranza` — LA PESTAÑA COBRANZAS, FILA POR FILA Y POR CLIENTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL PEDIDO, TEXTUAL (dueño, 10/09/2026 18:20) ═══
--
-- «Necesito una sección exclusiva por cliente con todo lo que involucre cobranzas; quiero que
-- lleves toda la información de la pestaña Cobranzas del Sheet Flujo de Fondos bien organizada por
-- cliente (con OC si corresponde) en Clientes de app.ecsas.com.ar.»
--
-- ═══ POR QUÉ HACE FALTA UNA VISTA, Y NO ALCANZA CON LO QUE HAY ═══
--
-- `public.cobranzas` es la réplica de la pestaña y NO tiene grant para `authenticated`: la app no
-- puede leerla, y está bien que así sea —es una tabla de réplica, sin RLS, con el dato crudo—. Lo
-- que existía expuesto era `cliente_cuenta_corriente`, que ya la AGREGA: saldo, vencido, aging. Una
-- pantalla que muestra fila por fila necesita las filas.
--
-- Esta vista no calcula nada nuevo: pega las tres piezas que ya son canónicas y las publica juntas.
--
--   `cobranzas`             la fila tal como está en el Sheet, con su número de fila (`sheet_id`).
--   `cobranza_imputacion`   de qué OBRA es esa fila (OC → alias → bolsa del cliente). Es la fuente
--                           única de `cobro_por_obra`: acá no se vuelve a decidir.
--   `es_cobrada()`          el predicado de «esto ya entró», el mismo de `obra_cuenta` y de
--                           `cliente_cuenta_corriente`.
--   `plazo_cobro_dias()`    el reloj del vencido: EMISIÓN + 30 días, el de la pestaña OBRAS. NO
--                           `fecha_cobro < hoy`, que se re-tipea cada vez que el cobro se posterga
--                           y está condenado a cero por construcción (cobranzas-vencido.mjs, 14/08).
--
-- ═══ LO QUE NO SE DEDUCE ═══
--
-- `estado = 'CANCELAR'` no es ni cobrado ni pendiente: es una fila anulada, y se publica marcada
-- para que la pantalla pueda mostrarla sin sumarla. Esconder una fila anulada es cómo un total deja
-- de cuadrar contra el Sheet sin que nadie sepa por qué.

create or replace view public.cliente_cobranza with (security_invoker = false) as
select
  cb.id                                as cobranza_id,
  cb.cliente_id,
  i.obra_id,
  i.imputacion,
  cb.sheet_id                          as fila,
  cb.categoria,                        -- 'B' (facturado) / 'N'
  cb.fecha_emision,
  cb.factura,                          -- 'FA', 'FB', …
  cb.numero_comprobante,
  cb.concepto,
  cb.orden_compra,
  cb.monto_neto,
  cb.iva,
  cb.retenciones,
  cb.total_bruto,
  cb.estado,
  cb.moneda,
  public.es_cobrada(cb.estado, cb.fecha_cobro)                             as esta_cobrada,
  cb.estado = 'CANCELAR'                                                   as esta_cancelada,
  -- VENCIDA: pendiente de verdad y con la emisión ya fuera del plazo. Sin fecha de emisión no se
  -- afirma: no hay contra qué medir, y un `true` acá sería una mora inventada.
  (not public.es_cobrada(cb.estado, cb.fecha_cobro)
    and cb.estado is distinct from 'CANCELAR'
    and cb.fecha_emision is not null
    and cb.fecha_emision < current_date - public.plazo_cobro_dias())       as esta_vencida,
  cb.fecha_cobro,
  cb.forma_cobro
from public.cobranzas cb
  left join public.cobranza_imputacion i on i.cobranza_id = cb.id
where cb.cliente_id is not null
  and public.ve_economia();

comment on view public.cliente_cobranza is
  'La pestaña Cobranzas del Flujo de Caja, fila por fila y atada a su cliente y a su obra. '
  'Es la fuente de la solapa Cobranzas de /clientes/[cliente]. No decide nada: reusa '
  'cobranza_imputacion (qué obra), es_cobrada() (qué entró) y plazo_cobro_dias() (el reloj del '
  'vencido, emisión + 30 días, el mismo de la pestaña OBRAS).';

grant select on public.cliente_cobranza to authenticated;

-- LA VISTA LLEVA `ve_economia()` ADENTRO, igual que sus hermanas: al jefe de obra le devuelve CERO
-- FILAS, no un error. Una cobranza es precio de venta, y el 19/08 el dueño decidió que eso no lo ve.
