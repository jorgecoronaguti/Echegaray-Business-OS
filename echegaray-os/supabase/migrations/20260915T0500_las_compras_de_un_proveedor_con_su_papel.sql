-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS COMPRAS DE UN PROVEEDOR — una fila por compra, tenga o no su comprobante guardado
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 14/09/2026, textual: «necesito q proveedores guarde los comprobantes de cada
-- una de las compras q le corresponde, asi como haces con compras».
--
-- ═══ POR QUÉ NO ALCANZA `proveedor_papel` ═══
--
-- `proveedor_papel` (06/09) publica PAPELES: parte de `compra_adjunto`, así que una compra sin
-- archivo no existe para ella. Lo que el dueño pide es la otra mirada —todas las compras, y al lado
-- si tienen papel o no—, que es justo lo que muestra Compras. Medido hoy como Dirección: 680
-- compras de 2026 llegan a un proveedor del maestro y sólo 149 papeles cuelgan de alguna.
--
-- ═══ ESTA VISTA NO GUARDA NI UNE EL PAPEL ═══
--
-- Publica filas de `compra_sheet` con el proveedor al que pertenecen, nada más. Qué papel es de qué
-- compra lo decide `papelesDeCadaFila` (TypeScript), la misma función de la pantalla Compras: si se
-- repitiera acá como join, «esta compra tiene comprobante» tendría dos definiciones.
--
-- ═══ EL VÍNCULO: PRIMERO EL CUIT, Y EL NOMBRE SÓLO CUANDO NO HAY CUIT ═══
--
-- La identidad de un proveedor es su CUIT. `compra_sheet.cuit` viene con guiones (`30-71877540-6`)
-- y `proveedores.cuit` en once dígitos: se comparan los dígitos. Medido 14/09/2026 sobre 2026:
--   · 578 compras vinculan por CUIT, las 578 contra un proveedor del maestro;
--   · 380 no traen CUIT; 102 de ellas las resuelve el nombre (VILLA DEL PINO, Pedro Tello…);
--   · CUIT y nombre discrepan en 0 compras.
-- Una compra CON CUIT nunca cae al nombre: un CUIT que no está en el maestro es otra persona, y
-- colgarla de un nombre parecido es el error que la resolución existe para evitar. Para las que no
-- tienen CUIT se reusa `proveedor_nombre_resuelto`, la definición que ya decide quién es quién en la
-- ficha y en `proveedor_papel` — no una normalización nueva.
--
-- `via` dice cuál de las dos fue: un vínculo por nombre es un CÁLCULO, uno por CUIT es un HECHO, y la
-- pantalla no puede presentarlos con la misma cara.
--
-- ═══ LO QUE QUEDA AFUERA ═══
--
-- 278 compras de 2026 sin CUIT ni nombre resuelto (Sueldos, ARCA, Sindicatos, Banco…): no son de
-- ningún proveedor del maestro y no hay ficha donde mostrarlas. Siguen en Compras.

create or replace view public.proveedor_compra
with (security_invoker = true) as
select
  coalesce(pc.id, r.proveedor_id) as proveedor_id,
  case when pc.id is not null then 'cuit' else 'nombre' end as via,
  cs.fila,
  cs.clave,
  -- NULL es «esta compra no tiene fecha», no «hoy».
  cs.fecha,
  cs.tipo,
  cs.comprobante,
  cs.concepto,
  cs.obra_texto,
  cs.total,
  cs.estado,
  cs.estado_pago,
  cs.saldo_pendiente,
  cs.anulada
from public.compra_sheet cs
left join public.proveedores pc
  on cs.cuit is not null
 and pc.cuit = regexp_replace(cs.cuit, '\D', '', 'g')
left join public.proveedor_nombre_resuelto r
  on cs.cuit is null
 and r.nombre_norm = public.normalizar_nombre_proveedor(cs.proveedor)
 and r.estado = 'vinculado'
 and r.proveedor_id is not null
where coalesce(pc.id, r.proveedor_id) is not null
  -- El portero va en `(select …)`: una vez por consulta, no una por fila. La cerradura real sigue
  -- siendo la policy de `compra_sheet`, que `security_invoker` hace valer con el rol de quien mira.
  and (select public.es_administracion());

comment on view public.proveedor_compra is
  'Cada compra de la pestaña Compras con el proveedor del maestro al que pertenece: por CUIT, o por nombre resuelto cuando la compra no trae CUIT (via). No une el papel: eso lo hace papelesDeCadaFila, igual que Compras.';

-- RLS NO ES GRANT: sin esto PostgREST devuelve «permission denied» y la solapa se vería vacía.
grant select on public.proveedor_compra to authenticated;
