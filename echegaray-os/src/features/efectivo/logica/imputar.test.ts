// «IMPUTAR UN COMPROBANTE YA CARGADO» (24/09/2026): qué se lista, qué se dice antes de apretar y cómo se
// nombra el viaje al Sheet. Lo que estas pruebas impiden: ofrecer una compra que no es imputable (otra forma
// de pago, anulada, ya atada a otra entrega) y afirmar «A rendir en el Sheet» antes de que el worker lo escriba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatasDe, desdeDia, efectoDeImputar, enSheetDe, filtrarCandidatas, type FilaCandidata } from './imputar.ts'

const fila = (x: Partial<FilaCandidata>): FilaCandidata => ({
  fila: 1008, clave: 'c:30716676214|0005-00002405', fecha: '2026-09-24', proveedor: 'Ferreteria Eficiencia Energetica SAS',
  concepto: null, comprobante: '0005-00002405', obra: 'Galpón 9', total: 19600, tipo_pago: 'Efectivo', estado: 'Pagado', anulada: false, ...x,
})
const sinTomar = { claves: new Set<string>(), filas: new Set<number>() }

// 01/10/2026 — dueño: «no está contemplado el caso de que la compra haya sido cargada a través del canal del bot
// comprobantes gastos y después asignársela a la rendición de una persona». Antes sólo se ofrecían las de Efectivo
// CON número: una transferencia, una fila sin número o una que ya decía «A rendir» no se podían asignar.
test('se ofrece toda compra PAGADA y viva, con cualquier medio y con o sin número; las sin pagar se cuentan aparte', () => {
  const filas = [
    fila({}),
    fila({ fila: 1000, clave: 'c:1|a', fecha: '2026-09-23', tipo_pago: 'Transferencia' }),
    fila({ fila: 1001, clave: 'c:1|b', anulada: true }),
    fila({ fila: 1002, clave: 'c:1|c', total: 0 }),
    fila({ fila: 1003, clave: 'c:1|d' }),
    fila({ fila: 1004, clave: null, fecha: '2026-09-21' }),
    fila({ fila: 1005, clave: null, fecha: '2026-09-20' }),
    fila({ fila: 1006, clave: 'c:1|f', fecha: '2026-09-19', estado: 'Pendiente' }),
    fila({ fila: 1007, clave: 'c:1|g', fecha: '2026-09-18', tipo_pago: ' A rendir ' }),
    fila({ fila: 999, clave: 'c:1|e', fecha: '2026-09-22', tipo_pago: ' Efectivo ' }),
  ]
  const { candidatas, sinPagar } = candidatasDe(filas, { claves: new Set(['c:1|d']), filas: new Set([1005]) }, new Set([999]))
  assert.deepEqual(candidatas.map((c) => c.fila), [1008, 1000, 999, 1004, 1007])
  assert.equal(sinPagar, 1)
  assert.equal(candidatas.find((c) => c.fila === 1004)?.clave, null, 'sin número se ofrece igual: se ata por fila')
  assert.equal(candidatas.find((c) => c.fila === 1007)?.yaARendir, true)
  assert.equal(candidatas.find((c) => c.fila === 1000)?.tipoPago, 'Transferencia')
  assert.equal(candidatas.find((c) => c.fila === 999)?.conPagoEnCola, true, 'con un pago en cola se muestra, pero trabada')
})

test('por defecto se ven Efectivo y «A rendir»; «todos los medios» agrega el resto; buscar no distingue tildes', () => {
  const { candidatas } = candidatasDe([
    fila({}),
    fila({ fila: 7, clave: 'x', proveedor: 'Combustibles Barceló', obra: null }),
    fila({ fila: 8, clave: 'y', proveedor: 'Corralón', obra: null, tipo_pago: 'Transferencia' }),
    fila({ fila: 9, clave: null, proveedor: null, obra: null, concepto: 'Flete de arena', tipo_pago: 'A rendir' }),
  ], sinTomar, new Set())
  assert.deepEqual(filtrarCandidatas(candidatas, '', false).map((c) => c.fila).sort((a, b) => a - b), [7, 9, 1008])
  assert.equal(filtrarCandidatas(candidatas, '', true).length, 4)
  assert.deepEqual(filtrarCandidatas(candidatas, 'barcelo', false).map((c) => c.fila), [7])
  assert.deepEqual(filtrarCandidatas(candidatas, 'galpon', false).map((c) => c.fila), [1008])
  assert.deepEqual(filtrarCandidatas(candidatas, '1008', false).map((c) => c.fila), [1008])
  assert.deepEqual(filtrarCandidatas(candidatas, 'flete', false).map((c) => c.fila), [9])
  // BUSCAR ENCUENTRA EN TODOS LOS MEDIOS: quien escribe «corralon» busca esa compra, no un filtro.
  assert.deepEqual(filtrarCandidatas(candidatas, 'corralon', false).map((c) => c.fila), [8])
})

test('el efecto dicho antes de apretar, según el medio de pago de la fila; negativo, se avisa', () => {
  const [a, b, c] = efectoDeImputar({ total: 19600, enSuPoder: 20000, persona: 'Emiliano Maldonado', codigo: 'ER-0020', tipoPago: 'Efectivo', yaARendir: false })
  assert.match(a, /«Efectivo» a «A rendir».*ER-0020/)
  assert.match(b, /\$ 20\.000.*\$ 400/)
  assert.equal(c, undefined)
  const neg = efectoDeImputar({ total: 25000, enSuPoder: 20000, persona: 'X', codigo: 'ER-0020', tipoPago: 'Efectivo', yaARendir: false })
  assert.match(neg[2], /negativo.*\$ 5\.000/)
  const transf = efectoDeImputar({ total: 100, enSuPoder: 200, persona: 'X', codigo: 'ER-0020', tipoPago: 'Transferencia', yaARendir: false })
  assert.match(transf[0], /«Transferencia» a «A rendir»/)
  assert.doesNotMatch(transf[0], /CAJA deja de restarla/, 'una transferencia no la restaba CAJA: no se afirma')
  const ya = efectoDeImputar({ total: 100, enSuPoder: 200, persona: 'X', codigo: 'ER-0020', tipoPago: 'A rendir', yaARendir: true })
  assert.match(ya[0], /ya dice «A rendir».*sin tocar el Sheet/)
})

test('el viaje al Sheet: «A rendir» sólo con el pedido aplicado', () => {
  assert.equal(enSheetDe('aplicado'), 'en_sheet')
  assert.equal(enSheetDe('pendiente'), 'pendiente')
  assert.equal(enSheetDe('procesando'), 'pendiente')
  assert.equal(enSheetDe('rechazado'), 'rechazado')
  assert.equal(enSheetDe(undefined), 'sin_dato')
})

test('90 días para atrás desde hoy en San Juan', () => {
  assert.equal(desdeDia('2026-09-25'), '2026-06-27')
})
