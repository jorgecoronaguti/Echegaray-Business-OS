// UNA FACTURA CARGADA NO ES UN PLAN DE GASTO — el defecto que publicaba $8,6M en la línea equivocada.
//
// ═══ EL PEDIDO (17/08), TEXTUAL ═══
//
// *"no estás tomando bien los conceptos que surgen de compras proveedores cobranzas"* y
// *"no dejes nada que pueda hacer que arrastre error"*.
//
// ═══ EL DEFECTO, MEDIDO CON `auditar-deuda-comercial.mjs` ═══
//
// De los $37.977.593 que la tarjeta publicaba como PLAN dentro del mes, $11.528.318 salían de
// `Compras` — y ahí adentro hay facturas con número de comprobante, proveedor, vencimiento y echeq
// asignado. Alumetal 0038-00025942, $2.014.940,07, vence el 31/08. Eso no es presupuesto.
//
// La causa es una línea: `estadoDeEgreso` devolvía `PROYECTADO` para TODA compra no pagada, sin
// mirar si la fila era una factura o una estimación. `PROYECTADO` significaba las dos cosas, y
// cuando el 16/08 se lo sacó del titular de deuda —con razón, porque adentro estaban "Estructura
// esperada", "Recurrente esperado · Movistar" y la nafta por cuota— se fueron también las facturas.
//
// ═══ LA DISTINCIÓN SALE DEL DATO, NO DE UNA LISTA ═══
//
// Lo que separa una factura de una estimación está escrito en la propia fila de Compras y no hace
// falta enumerar nada:
//
//   · tiene N° DE COMPROBANTE — una estimación no lo tiene ni lo puede tener. Es el dato decisivo.
//   · el ESTADO dice "Pendiente" — la declaración del dueño de que es una obligación viva. La fila
//     f478 de ARCA dice "Proyectado" en esa misma columna: la planilla ya sabe distinguirlas.
//   · tiene FECHA DE CAJA — garantizada, porque `deCompras` descarta la fila que no la tiene.
//
// Medido sobre el archivo del 17/08, de los $11.528.318 de `Compras` que viajaban como plan:
//
//   $8.598.826 · 13 filas   pasan a DEUDA (12 comerciales + la cuota de plan de ARCA f725)
//   $2.455.725 ·  2 filas   NO pasan: Hormiserv y La Isla Metal no tienen comprobante cargado.
//                           Siguen como plan y el auditor las sigue gritando con el motivo exacto.
//   $  473.767 ·  1 fila    NO pasa: la f478 de ARCA dice "Proyectado" — es una estimación de verdad.

import test from 'node:test'
import assert from 'node:assert/strict'

import { estadoDeEgreso } from './caja-canales.mjs'
import { estadoContraCorte, sumar } from './libro-movimientos.mjs'
import { deCompras } from './libro-extractores.mjs'
import { NOMBRES_COMPRAS, esFacturaCargada } from './libro-extractores-compras.mjs'
import { DEUDA, PLAN } from './caja-tarjetas.mjs'

const CORTE = 46248 // 14/08/2026, hasta donde llega el extracto
const FIN = 46266 // 01/09/2026, el `hasta` EXCLUIDO de las tarjetas

const IX = Object.freeze({
  // Las posiciones son las REALES del archivo: «Monto Parcial 2» es la W (22), el segundo tramo de
  // pago, entre «Monto Pagado» (T, 19) y «Estado» (X, 23).
  proveedor: 4, comprobante: 7, cliente: 9, obra: 10, total: 14, tipoPago: 15,
  montoPagado: 19, parcial2: 22, estado: 23, rubro: 27, fechaCaja: 29, cuit: 38,
})

function encabezado() {
  const h = new Array(40).fill('')
  h[IX.proveedor] = NOMBRES_COMPRAS.proveedor
  h[IX.comprobante] = NOMBRES_COMPRAS.comprobante
  h[IX.cliente] = NOMBRES_COMPRAS.cliente
  h[IX.obra] = NOMBRES_COMPRAS.obra
  h[IX.total] = NOMBRES_COMPRAS.importe
  h[IX.tipoPago] = NOMBRES_COMPRAS.tipoPago
  h[IX.montoPagado] = NOMBRES_COMPRAS.montoPagado
  h[IX.parcial2] = NOMBRES_COMPRAS.parcial2
  h[IX.estado] = NOMBRES_COMPRAS.estado
  h[IX.rubro] = NOMBRES_COMPRAS.rubro
  h[IX.fechaCaja] = NOMBRES_COMPRAS.fechaCaja
  h[IX.cuit] = NOMBRES_COMPRAS.cuit
  return h
}

function fila({ proveedor = 'Proveedor SA', comprobante = '', total = 0, estado = 'Pendiente',
  fechaCaja = 46260, tipoPago = 'Echeq', montoPagado = 0, parcial2 = 0, rubro = 'Materiales Civil' } = {}) {
  const f = new Array(40).fill('')
  f[IX.proveedor] = proveedor
  f[IX.comprobante] = comprobante
  f[IX.total] = total
  f[IX.tipoPago] = tipoPago
  f[IX.montoPagado] = montoPagado
  f[IX.parcial2] = parcial2
  f[IX.estado] = estado
  f[IX.rubro] = rubro
  f[IX.fechaCaja] = fechaCaja
  return f
}

const compras = (...filas) => [[], [], encabezado(), ...filas]
const sinRuido = { aviso: () => {} }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA DECISIÓN, PURA — QUÉ FILA ES UNA FACTURA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('es factura la fila con comprobante y Estado "Pendiente"', () => {
  assert.equal(esFacturaCargada({ estado: 'Pendiente', comprobante: '0038-00025942' }), true)
  assert.equal(esFacturaCargada({ estado: '✅ Pendiente', comprobante: '0038-00025942' }), true,
    'el mismo trato que `estaPagada` le da a la decoración: se compara sólo lo alfabético')
})

test('NO es factura la fila sin comprobante: una estimación no lo tiene ni lo puede tener', () => {
  // Hormiserv f820 ($2.355.725) y La Isla Metal f745 ($100.000) son compras reales a las que nadie
  // les tipeó el número. NO se las asciende: afirmar que hay una factura donde no está el dato es
  // fabricarlo. Se quedan como plan y `auditar-deuda-comercial.mjs` las nombra con su motivo, que se
  // arregla llenando una celda.
  assert.equal(esFacturaCargada({ estado: 'Pendiente', comprobante: '' }), false)
  assert.equal(esFacturaCargada({ estado: 'Pendiente', comprobante: '   ' }), false)
})

test('NO es factura la fila cuyo Estado dice "Proyectado": la planilla ya la declaró estimación', () => {
  // Es la f478 de ARCA, $473.767. Sin esta condición, alguien que copie un comprobante viejo sobre
  // una fila de proyección la convertiría en deuda — que es exactamente "arrastrar error".
  assert.equal(esFacturaCargada({ estado: 'Proyectado', comprobante: '0038-00025942' }), false)
  assert.equal(esFacturaCargada({ estado: '', comprobante: '0038-00025942' }), false,
    'sin estado no se afirma nada: cae al comportamiento anterior')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ESTADO CON EL QUE ENTRA AL LIBRO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('una compra NO pagada pero FACTURADA entra COMPROMETIDA, no proyectada', () => {
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: false, fecha: 46265, corte: CORTE, facturada: true }),
    'COMPROMETIDO', 'hay una factura: es una obligación, no un plan')
})

test('una compra NO pagada y NO facturada sigue siendo PROYECTADO', () => {
  // La otra punta. Sin esto, el arreglo se comería la distinción entera y el titular volvería a
  // incluir presupuesto — el defecto que el dueño rechazó el 16/08.
  for (const i of ['cheque', 'echeq', 'transferencia', 'efectivo', 'desconocido']) {
    assert.equal(estadoDeEgreso({ instrumento: i, pagado: false, fecha: 46265, corte: CORTE }), 'PROYECTADO')
    assert.equal(estadoDeEgreso({ instrumento: i, pagado: false, fecha: 46265, corte: CORTE, facturada: false }), 'PROYECTADO')
  }
})

test('`facturada` no toca lo ya pagado: ahí decide el instrumento contra el corte', () => {
  assert.equal(estadoDeEgreso({ instrumento: 'echeq', pagado: true, fecha: 46264, corte: CORTE, facturada: true }), 'COMPROMETIDO')
  assert.equal(estadoDeEgreso({ instrumento: 'transferencia', pagado: true, fecha: 46246, corte: CORTE, facturada: true }), 'REAL')
})

test('la factura CON VENCIMIENTO PASADO sigue diciendo VENCIDO, no se pierde el atraso', () => {
  // ═══ EL CASO QUE OBLIGÓ A TOCAR `estadoContraCorte`: Compras f667 ═══
  //
  // Mariana SA, $763.365, comprobante 0015-00000147, Estado "Pendiente", vencida. Hoy llega a VENCIDO
  // por la rama de PROYECTADO. Con el arreglo nace COMPROMETIDA — y sin extender `estadoContraCorte`
  // habría dejado de ser VENCIDO en silencio: el titular de la tarjeta no se mueve (los dos estados
  // son DEUDA) pero la línea de contexto "▲ sin probar" y las alertas de proyecciones vencidas leen
  // exactamente ese estado. Habría sido cambiar un defecto por otro más difícil de ver.
  //
  // Las otras dos vencidas (f821 y f834, PEDRO TELLO) no tienen comprobante: siguen el camino viejo y
  // terminan igual de VENCIDAS. Las tres llegan al mismo lugar por dos caminos, que es lo que hay que
  // probar.
  assert.equal(estadoContraCorte('COMPROMETIDO', 46200, CORTE), 'VENCIDO')
  assert.equal(estadoContraCorte('PROYECTADO', 46200, CORTE), 'VENCIDO')
  assert.equal(estadoContraCorte('COMPROMETIDO', 46264, CORTE), 'COMPROMETIDO', 'lo que no venció, no vence')
})

test('de punta a punta: la factura vencida CON comprobante y la SIN comprobante llegan las dos a VENCIDO', () => {
  const libro = deCompras(compras(
    fila({ proveedor: 'Mariana SA', comprobante: '0015-00000147', total: 763365, fechaCaja: 46240 }),
    fila({ proveedor: 'PEDRO TELLO', comprobante: '', total: 224000, fechaCaja: 46240 }),
  ), CORTE, sinRuido)
  assert.deepEqual(libro.map((m) => m.estado), ['VENCIDO', 'VENCIDO'],
    'el atraso no puede depender de si alguien tipeó el número de factura')
})

test('el compromiso SIN FECHA no se declara vencido: cae al serial 0 y ahí no hay atraso que afirmar', () => {
  // `cuotasEnCheque` manda `q.fechaPago ?? 0`, y su comentario lo dice: *"un compromiso sin fecha no
  // es uno que no vence, es uno que puede vencer mañana"*. Serial 0 < corte, así que sin esta guarda
  // todo cheque sin fecha pasaría a VENCIDO de golpe.
  assert.equal(estadoContraCorte('COMPROMETIDO', 0, CORTE), 'COMPROMETIDO')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// DE PUNTA A PUNTA — LO QUE `deCompras` EMITE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: la factura de Alumetal salía como plan de gasto y ahora sale como deuda', () => {
  // Compras f797, con sus números reales.
  const libro = deCompras(compras(
    fila({ proveedor: 'Alumetal', comprobante: '0038-00025942', total: 2014940.07, fechaCaja: 46265 }),
  ), CORTE, sinRuido)

  assert.equal(libro.length, 1)
  assert.equal(libro[0].estado, 'COMPROMETIDO')
  assert.equal(libro[0].importe, 2014940.07)
  assert.equal(sumar(libro, { estados: DEUDA, hasta: FIN }).total, -2014940.07,
    'y la tarjeta de DEUDA la ve')
  assert.equal(sumar(libro, { estados: PLAN, hasta: FIN }).total, 0,
    'y la línea de plan ya no la publica')
})

test('LA OTRA PUNTA: los materiales estimados siguen siendo plan y no entran a la deuda', () => {
  // "Estructura esperada", "Recurrente esperado · Movistar" y los materiales de obra no salen de
  // Compras —los emiten otros extractores—, pero Compras también tiene filas sin comprobante, y ésas
  // son las que este test protege. Si el arreglo se pasara de largo, el titular volvería a mezclar
  // presupuesto con deuda y sería la cuarta corrección del mismo cuadro.
  const libro = deCompras(compras(
    fila({ proveedor: 'Hormiserv', comprobante: '', total: 2355725, fechaCaja: 46264 }),
    fila({ proveedor: 'ARCA', comprobante: '', total: 473767, estado: 'Proyectado', fechaCaja: 46260 }),
  ), CORTE, sinRuido)

  assert.equal(libro.length, 2)
  for (const m of libro) assert.equal(m.estado, 'PROYECTADO')
  assert.equal(sumar(libro, { estados: DEUDA, hasta: FIN }).total, 0,
    'sin comprobante no se afirma que hay una factura')
  assert.equal(sumar(libro, { estados: PLAN, hasta: FIN }).total, -(2355725 + 473767))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA PLATA NO SE CREA: CAMBIA DE COLUMNA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('SALDO AL CIERRE no se mueve ni un peso cuando una factura pasa de plan a deuda', () => {
  // La tarjeta de cierre es `disponible − deuda + cobros − plan`. Mover plata de PLAN a DEUDA le
  // resta lo mismo por un lado que le suma por el otro: el cierre TIENE que quedar idéntico. Si
  // alguien vuelve a tocar `DEUDA`/`PLAN` y rompe esa compensación, el escenario de cierre empieza a
  // mentir sin que ninguna otra prueba se entere.
  const comunes = compras(
    fila({ proveedor: 'Ya vencida', comprobante: '0001-1', total: 500000, fechaCaja: 46240 }),
    fila({ proveedor: 'Estimación', comprobante: '', total: 300000, fechaCaja: 46260 }),
  )
  const antes = deCompras(comunes, CORTE, sinRuido)
  const conFactura = deCompras([...comunes,
    fila({ proveedor: 'Alumetal', comprobante: '0038-00025942', total: 2014940.07, fechaCaja: 46265 })],
  CORTE, sinRuido)

  const cierre = (libro) => {
    const deuda = sumar(libro, { estados: DEUDA, hasta: FIN, signo: -1 }).total
    const plan = sumar(libro, { estados: PLAN, hasta: FIN, signo: -1 }).total
    return deuda + plan // ambos negativos: es lo que el cierre descuenta del disponible
  }
  // Al centavo y no al peso: los importes son flotantes y la suma de tres arrastra ruido en el
  // decimal 13. Comparar con `equal` fallaría por -2014940.0700000003, que no es una diferencia.
  const alCentavo = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg} — ${a} vs ${b}`)

  // La factura nueva mueve $2.014.940,07 dentro de la resta, no la agranda ni la achica.
  alCentavo(cierre(conFactura) - cierre(antes), -2014940.07, 'la factura entra por su importe exacto')
  // Y la comprobación que importa: la MISMA fila, sin comprobante, descuenta exactamente lo mismo
  // del cierre. Cambia de línea, no de peso.
  const comoPlan = deCompras([...comunes,
    fila({ proveedor: 'Alumetal', comprobante: '', total: 2014940.07, fechaCaja: 46265 })],
  CORTE, sinRuido)
  alCentavo(cierre(conFactura), cierre(comoPlan),
    'el cierre no puede depender de en qué línea está la plata, sólo de cuánta hay')
  assert.notEqual(sumar(conFactura, { estados: DEUDA, hasta: FIN }).total,
    sumar(comoPlan, { estados: DEUDA, hasta: FIN }).total,
    'y sin embargo la DEUDA sí cambia: si no, el arreglo no hizo nada')
})

test('DEUDA y PLAN siguen siendo disjuntos y exhaustivos después del cambio', () => {
  // La garantía algebraica de la que depende el test de arriba. Vive también en
  // `caja-tarjetas-conceptos.test.mjs`; se repite acá porque es la premisa de esta historia y sin
  // ella el "no se mueve ni un peso" sería una casualidad.
  assert.equal(DEUDA.filter((e) => PLAN.includes(e)).length, 0)
  assert.deepEqual([...DEUDA, ...PLAN].sort(), ['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])
})
