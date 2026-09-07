-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA DEUDA CON UN PROVEEDOR — un concepto del OS, no una suma del front
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 07/09/2026: filtros para la sección Proveedores, y al detallarlos: «rubro y
-- deuda». El rubro ya existe en la tabla (`rubro`, `rubro_deducido`). La deuda no existía en ningún
-- lado como concepto: sólo estaba, fila por fila, en `compra_sheet.saldo_pendiente`.
--
-- ═══ POR QUÉ EN POSTGRES Y NO EN EL SERVICIO ═══
--
-- «Cuánto le debemos a X» lo van a preguntar la web, el chat y el Director. Sumarlo en TypeScript
-- para la pantalla crearía la segunda definición del mismo número el día que alguien lo pregunte por
-- otra puerta — y las dos sumas se separarían en silencio. La regla de realidad única del OS dice
-- dónde vive: acá.
--
-- ═══ EL SALTO DEL TEXTO AL PROVEEDOR CANÓNICO NO SE REESCRIBE ═══
--
-- `compra_sheet.proveedor` es texto libre y un proveedor tiene varias grafías («DUPEC», «Dupec»,
-- «DUBOS UGARTE PEDRO LUIS RAUL» — el mismo CUIT 20-28773782-4, verificado hoy en Cheques Emitidos).
-- Ese criterio ya vive una sola vez, en `normalizar_nombre_proveedor()` y `proveedor_nombre_resuelto`.
-- Se usa el MISMO, igual que hace `proveedor_papel`: una segunda normalización repartiría la deuda
-- de un proveedor entre dos fichas y ninguna de las dos sería la verdad.
--
-- ═══ QUÉ CUENTA COMO DEUDA, Y QUÉ NO ═══
--
--   · `saldo_pendiente > 0` — lo que el Sheet declara sin pagar. El 0 NO entra: una compra saldada
--     no es una deuda de cero, es una compra que no debe nada, y contarla haría que un proveedor al
--     día apareciera en el filtro «con deuda».
--   · Las ANULADAS quedan afuera. Una fila muerta no se debe.
--   · `no_es_proveedor` queda afuera por el join: «SUELDOS» o «ARCA» son textos que la resolución ya
--     descartó como proveedor, y regalarles deuda inventaría un acreedor.
--
-- NO se declara «vencido» acá. Ese criterio ya lo escribe el Sheet en `tramo_vencimiento` y tenerlo
-- dos veces terminaría con la pantalla diciendo una cosa y la pestaña otra.
--
-- ═══ LO QUE ESTA VISTA NO PUEDE VER, MEDIDO EL 07/09/2026 ═══
--
-- La pestaña declara $19.164.815,70 de saldo vivo en 35 filas. Esta vista llega a $4.870.127,39 en
-- 7 proveedores. La diferencia —$14.294.688,31, el 75%— NO se pierde por un defecto de la suma: son
-- textos de Compras que no están vinculados a ningún proveedor del maestro, y por eso no tienen
-- ficha donde mostrarse:
--
--     PEDRO TELLO   $8.650.000,00 (4)      Sersolin SAS  $376.890,80 (1)
--     Pedro Fredes  $5.200.000,00 (5)      RSV            $67.797,51 (1)
--
-- Se declara acá y no se tapa. Un filtro «con deuda» que mostrara $4,8M sin decir que hay $14,3M sin
-- acreedor identificado estaría escondiendo el 75% de lo que la empresa debe, que es exactamente el
-- tipo de silencio que las reglas de este sistema prohíben. La cola de resolución de nombres
-- (`proveedor_nombre_pendiente`) es donde eso se arregla: vinculando esos cuatro textos.

create or replace view public.proveedor_deuda
with (security_invoker = true) as
select
  r.proveedor_id,
  sum(cs.saldo_pendiente)                                   as deuda,
  count(*)                                                  as comprobantes_impagos,
  -- La factura impaga más vieja: es la que decide la urgencia cuando hay que elegir a quién pagar.
  min(cs.fecha)                                             as impaga_mas_vieja,
  max(cs.fecha_prevista)                                    as ultimo_vencimiento_previsto
from public.compra_sheet cs
join public.proveedor_nombre_resuelto r
  on r.nombre_norm = public.normalizar_nombre_proveedor(cs.proveedor)
where r.proveedor_id is not null
  and r.estado = 'vinculado'
  and cs.anulada is not true
  and cs.saldo_pendiente is not null
  and cs.saldo_pendiente > 0
  and (select public.es_administracion())
group by r.proveedor_id;

comment on view public.proveedor_deuda is
  'Lo que se le debe a cada proveedor: la suma de compra_sheet.saldo_pendiente de sus compras vivas, cruzando el texto libre con normalizar_nombre_proveedor(). Derivada — la deuda no se guarda en ningún lado. Un proveedor sin deuda NO tiene fila (no es una deuda de $0).';

-- UNA VISTA NUEVA NACE SIN PERMISO Y RLS NO ES GRANT: sin esto PostgREST devuelve «permission
-- denied» y Next lo muestra como un 404 mudo. La cerradura por fila la siguen poniendo las policies
-- de `compra_sheet`, que `security_invoker` hace valer con el rol de quien consulta.
grant select on public.proveedor_deuda to authenticated;
