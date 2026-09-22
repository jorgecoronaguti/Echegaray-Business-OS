-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA NOTA DE CRÉDITO RESTA DE LA DEUDA DEL PROVEEDOR
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Reportado y confirmado por el dueño el 22/09/2026: la ficha de Corralón Progreso (CUIT
-- 23-36911157-4) publicaba $1.543.107,26 y la pestaña Compras, contada a mano, $1.434.834,97. La
-- diferencia era EXACTAMENTE $108.272,29: sus dos notas de crédito abiertas, la 0006-00000068 por
-- $105.857,89 y la 0004-00000097 por $2.414,40.
--
-- ═══ LA CAUSA ═══
--
-- En el Sheet una nota de crédito se carga con Tipo = «N C» y el importe en NEGATIVO (columna P).
-- La fórmula de `Saldo pendiente (OS)` (AM) la arrastra CON SU SIGNO mientras el Estado sea
-- «Pendiente»:
--
--     =ARRAYFORMULA(… IF(($Y="Pendiente")*($AK=1); IF(ISNUMBER($P);$P;0) - … ; 0) …)
--
-- El dato llegaba bien. Lo que lo perdía era el corte `cs.saldo_pendiente > 0` de esta misma vista
-- (20260907T1200) y su gemelo `.gt('saldo_pendiente', 0)` en el servicio de la web. La fila
-- negativa no se sumaba mal: DESAPARECÍA. El efecto es unidireccional y siempre en contra — la app
-- le muestra al dueño más deuda de la que tiene con todo proveedor que tenga una NC abierta.
--
-- ═══ EL SIGNO NO SE REDEFINE ACÁ ═══
--
-- Ya estaba decidido en este proyecto: `orquestador/lib/comprobante-arca.mjs` (21/07/2026) declara
-- que la nota de CRÉDITO resta y la de DÉBITO suma, y `compras-costo-de-obra.mjs` corta en
-- `total !== 0` desde el 15/09/2026 justamente para que las nueve filas negativas de Compras lleguen
-- al costo de obra. Esta vista era la última que seguía cortando en `> 0`.
--
-- ═══ QUÉ CAMBIA, EXACTAMENTE ═══
--
--   · `saldo_pendiente <> 0` en vez de `> 0`. El CERO sigue afuera: una compra saldada no es una
--     deuda de cero, y contarla pondría a un proveedor al día en el filtro «con deuda».
--   · `deuda` pasa a ser el NETO. Es el número que el dueño lee, y ahora es el de la pestaña.
--   · `comprobantes_impagos` cuenta SÓLO las filas con saldo positivo: una nota de crédito no es un
--     comprobante impago, y sumarla ahí diría que hay una factura más para pagar.
--   · `nota_credito_a_favor` (nueva, última columna, ≤ 0) publica cuánto de ese neto es crédito sin aplicar. Sin
--     ella el total baja sin que la pantalla pueda decir por qué, que es precisamente el silencio
--     que este defecto produjo al revés.
--   · `impaga_mas_vieja` y `ultimo_vencimiento_previsto` miran sólo el saldo POSITIVO: son fechas de
--     pago, y una nota de crédito no se paga.
--   · `having sum(...) <> 0`: si las notas de crédito cancelan exactamente lo que se le debe, no hay
--     fila. Un «$0» en la lista de a quién hay que pagarle sería peor que la ausencia.
--
-- ═══ LO MEDIDO EL 22/09/2026, CONTRA LA PESTAÑA ═══
--
-- `compra_sheet` tiene 9 filas con `total < 0` por $1.491.504,41: 8 notas de crédito («N C») más la
-- fila 487 de DUPEC, que no tiene Tipo cargado. HOY las 9 están en Estado «Pagado», así que su
-- `saldo_pendiente` vale 0 y el neto de esta vista NO cambia con esta migración: $14.216.459,90
-- antes y después, en 5 proveedores. Se declara así, sin inflar el resultado. Lo que cambia es que
-- la próxima nota de crédito que quede PENDIENTE —que es el estado en que el dueño encontró las dos
-- de Corralón— va a restar en vez de evaporarse.
--
-- Queda ADEMÁS anotado, sin tocarlo, un dato de carga que esta vista no puede arreglar: la fila 194
-- (Trielec, `00038-00000003`) está cargada con Tipo «NC» y total POSITIVO $127.132,05. O el tipo o
-- el signo está mal, y lo decide quien cargó la fila, no el código.

create or replace view public.proveedor_deuda
with (security_invoker = true) as
select
  r.proveedor_id,
  sum(cs.saldo_pendiente)                                                        as deuda,
  count(*) filter (where cs.saldo_pendiente > 0)                                 as comprobantes_impagos,
  -- La factura impaga más vieja: es la que decide la urgencia cuando hay que elegir a quién pagar.
  -- Una nota de crédito no entra: no se paga, así que no puede fijar la urgencia.
  min(cs.fecha) filter (where cs.saldo_pendiente > 0)                            as impaga_mas_vieja,
  max(cs.fecha_prevista) filter (where cs.saldo_pendiente > 0)                   as ultimo_vencimiento_previsto,
  -- AL FINAL Y NO EN EL MEDIO: `create or replace view` sólo admite columnas NUEVAS agregadas
  -- despues de las que ya existen; moverla rompería el reemplazo en cualquier base ya migrada.
  coalesce(sum(cs.saldo_pendiente) filter (where cs.saldo_pendiente < 0), 0)     as nota_credito_a_favor
from public.compra_sheet cs
join public.proveedor_nombre_resuelto r
  on r.nombre_norm = public.normalizar_nombre_proveedor(cs.proveedor)
where r.proveedor_id is not null
  and r.estado = 'vinculado'
  and cs.anulada is not true
  and cs.saldo_pendiente is not null
  and cs.saldo_pendiente <> 0
  and (select public.es_administracion())
group by r.proveedor_id
having sum(cs.saldo_pendiente) <> 0;

comment on view public.proveedor_deuda is
  'Lo que se le debe a cada proveedor: la suma NETA de compra_sheet.saldo_pendiente de sus compras vivas, cruzando el texto libre con normalizar_nombre_proveedor(). Una nota de crédito llega con saldo negativo y RESTA (22/09/2026). Derivada — la deuda no se guarda en ningún lado. Un proveedor sin deuda NO tiene fila (no es una deuda de $0).';

-- UNA COLUMNA NUEVA NACE SIN PERMISO Y RLS NO ES GRANT. `create or replace view` conserva los grants
-- de la vista, pero se repite por si esta migración corre sobre una base donde la vista se recreó.
grant select on public.proveedor_deuda to authenticated;
