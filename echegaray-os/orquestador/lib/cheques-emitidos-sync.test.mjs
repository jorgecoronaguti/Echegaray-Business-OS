// Tests del sync del registro de "Cheques Emitidos". Herméticos: sin red, sin base, sin Google.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  norm, debitadoDe, instrumentoDe, clave, planSync, filaRegistro, verificarEncabezado, aFechaAR,
  sinComprobante, COL, comprobantesQueCubre, deducirComprobantes,
} from './cheques-emitidos-sync.mjs'

const ORIGEN_ECHEQ = 'Santander Empresas · pantalla ECHEQs Emitidos (PDF 30/07/2026 09:06)'
const emitido = (numero, estado, extra = {}) => ({
  numero, estado, importe: 317000, contraparte: 'NEUMAGOM SAS', fecha_pago: '2026-08-03',
  origen: ORIGEN_ECHEQ, cuenta: 'CC - 00000913836', corte: '2026-07-30', ...extra,
})

test('norm: "00000303" y "303" son el mismo cheque', () => {
  assert.equal(norm('00000303'), '303')
  assert.equal(norm('303'), '303')
  assert.equal(norm('Nº 0306'), '306')
  assert.equal(norm(''), '')
  assert.equal(norm(null), '')
})

test('debitadoDe: sólo Pagado sale de la cuenta; el muerto no se toca', () => {
  assert.equal(debitadoDe('Pagado'), 'SI')
  assert.equal(debitadoDe('Aceptado'), 'No')
  assert.equal(debitadoDe('Por aceptar'), 'No')
  // «Emitido» (22/08): salió del banco y el beneficiario aún no aceptó — compromiso vivo, no muerto.
  assert.equal(debitadoDe('Emitido'), 'No')
  // Un anulado/repudiado/rechazado NO se marca: contarlo inventaría una deuda que no existe.
  assert.equal(debitadoDe('Rechazado'), null)
  assert.equal(debitadoDe('Anulado'), null)
  assert.equal(debitadoDe('Repudiado'), null)
  assert.equal(debitadoDe(''), null)
  // La mayúscula del desplegable es estricta: "SI"/"No", no "Si" ni "NO".
  assert.equal(debitadoDe('pagado'), 'SI')
})

test('instrumentoDe: se DEDUCE del origen declarado, y si no se puede, es null', () => {
  assert.equal(instrumentoDe({ origen: ORIGEN_ECHEQ }), 'ECHEQ')
  assert.equal(instrumentoDe({ origen: 'chequera física del talonario 3' }), 'FISICO')
  // No se adivina: antes de poner un cheque en la chequera equivocada, se reporta.
  assert.equal(instrumentoDe({ origen: 'orden de pago de un cliente' }), null)
  assert.equal(instrumentoDe({}), null)
})

test('aFechaAR: es-AR, DD/MM/AAAA — una fecha al revés no da error, da el día equivocado', () => {
  assert.equal(aFechaAR('2026-08-15'), '15/08/2026')
  assert.equal(aFechaAR('2026-08-15T00:00:00Z'), '15/08/2026')
  assert.equal(aFechaAR(null), '')
})

// ═══ LA TRAMPA REAL DEL REGISTRO (30/07) ═══
//
// El registro tiene el número 313 DOS VECES: FISICO 313 (Corralón Progreso, $470.945) y ECHEQ 313
// (Maderas Lliteras, $383.175). Las chequeras física y electrónica numeran por separado. Cruzar sólo
// por número marca el DEBITADO del cheque equivocado — y no da error, da un dato falso en la pestaña
// con la que se decide qué se puede pagar.

test('la clave es (instrumento, número): el FISICO 313 y el ECHEQ 313 son cheques distintos', () => {
  assert.notEqual(clave('FISICO', '313'), clave('ECHEQ', '313'))
  assert.equal(clave('echeq', '00000313'), clave('ECHEQ', '313'), 'insensible a mayúsculas y ceros')
})

test('EL BUG QUE ESTO EVITA: el sync no le toca el DEBITADO al FISICO homónimo', () => {
  const registro = [
    { fila: 76, tipo: 'ECHEQ', numero: '313', debitado: 'No', proveedor: 'Maderas Lliteras SRL' },
    { fila: 84, tipo: 'FISICO', numero: '313', debitado: 'No', proveedor: 'Corralon Progreso' },
  ]
  const p = planSync([emitido('00000313', 'Pagado')], registro)
  assert.equal(p.updates.length, 1, 'una sola corrección')
  assert.equal(p.updates[0].fila, 76, 'la del ECHEQ, no la del FISICO')
  assert.equal(p.updates[0].a, 'SI')
  // Y el físico queda entre los "sólo en la pestaña": no se toca, pero se reporta.
  assert.equal(p.soloEnPestana.length, 1)
  assert.equal(p.soloEnPestana[0].fila, 84)
})

test('planSync: corrige el DEBITADO desactualizado (el caso del 305 que infló $893.098,79)', () => {
  const registro = [{ fila: 85, tipo: 'ECHEQ', numero: '305', debitado: 'No' }]
  const p = planSync([emitido('00000305', 'Pagado', { importe: 893098.79 })], registro)
  assert.equal(p.updates.length, 1)
  assert.deepEqual({ de: p.updates[0].de, a: p.updates[0].a }, { de: 'No', a: 'SI' })
})

test('planSync es IDEMPOTENTE: si ya está bien, no propone nada', () => {
  const registro = [
    { fila: 85, tipo: 'ECHEQ', numero: '305', debitado: 'SI' },
    { fila: 92, tipo: 'ECHEQ', numero: '307', debitado: 'No' },
  ]
  const p = planSync([emitido('00000305', 'Pagado'), emitido('00000307', 'Aceptado')], registro)
  assert.deepEqual(p.updates, [])
  assert.deepEqual(p.agregar, [])
  assert.equal(p.iguales, 2)
})

test('planSync: un DEBITADO en blanco cuenta como desactualizado (no como "ya está bien")', () => {
  const p = planSync([emitido('307', 'Aceptado')], [{ fila: 92, tipo: 'ECHEQ', numero: '307', debitado: '' }])
  assert.equal(p.updates.length, 1)
  assert.equal(p.updates[0].de, '∅')
  assert.equal(p.updates[0].a, 'No')
})

test('planSync: el que falta se agrega; el MUERTO no', () => {
  const p = planSync([
    emitido('400', 'Aceptado'),
    emitido('401', 'Rechazado'),
  ], [])
  assert.equal(p.agregar.length, 1)
  assert.equal(norm(p.agregar[0].numero), '400')
  assert.equal(p.agregar[0].debitado, 'No')
  assert.equal(p.muertos.length, 1, 'el rechazado NO se agrega: sería inventar una deuda')
})

test('planSync: sin instrumento deducible, NO se agrega — se reporta', () => {
  const p = planSync([emitido('500', 'Aceptado', { origen: 'papel suelto', cuenta: null })], [])
  assert.deepEqual(p.agregar, [])
  assert.equal(p.sinInstrumento.length, 1)
})

test('planSync: los físicos del registro quedan intactos y se cuentan aparte', () => {
  const registro = [
    { fila: 20, tipo: 'FISICO', numero: '193', debitado: 'SI' },
    { fila: 21, tipo: 'FISICO', numero: '203', debitado: 'SI' },
    { fila: 92, tipo: 'ECHEQ', numero: '307', debitado: 'No' },
  ]
  const p = planSync([emitido('307', 'Aceptado')], registro)
  assert.deepEqual(p.updates, [])
  assert.equal(p.soloEnPestana.length, 2, 'los dos físicos: el banco no los lista, no se tocan')
  assert.ok(p.soloEnPestana.every((r) => /fisico/i.test(r.tipo)))
})

test('planSync ignora las filas vacías del registro (el rango abierto trae cola)', () => {
  const registro = [{ fila: 92, tipo: 'ECHEQ', numero: '307', debitado: 'No' }, { fila: 93, tipo: '', numero: '', debitado: '' }]
  const p = planSync([emitido('307', 'Aceptado')], registro)
  assert.deepEqual(p.updates, [])
  assert.deepEqual(p.soloEnPestana, [], 'una fila sin número no es un cheque que falte en la base')
})

test('filaRegistro respeta el ancho ROTULADO (A–L) y no escribe fuera del cuadro', () => {
  const f = filaRegistro({ ...emitido('00000364', 'Aceptado', { contraparte: 'ALVARADO MARIEL EDITH', contraparte_cuit: '27123456789', importe: 429048.5, fecha_pago: '2026-08-08', obra: 'MESSINA' }), instrumento: 'ECHEQ', debitado: 'No' })
  assert.equal(f.length, 12, 'doce columnas: A–L. Escribir en M metería datos en una columna sin rótulo')
  assert.equal(f[COL.tipo], 'ECHEQ')
  assert.equal(f[COL.numero], '364')
  assert.equal(f[COL.proveedor], 'ALVARADO MARIEL EDITH')
  assert.equal(f[COL.monto], 429048.5, 'número, no texto: la banda lo suma con SUMPRODUCT/ISNUMBER')
  assert.equal(f[COL.pago], '08/08/2026')
  assert.equal(f[COL.debitado], 'No')
  assert.equal(f[COL.unidad], 'MESSINA')
  // Las columnas que el dueño llena a mano quedan vacías: no se inventa fecha de emisión ni comprobante.
  assert.equal(f[COL.emision], '')
  assert.equal(f[COL.tipoComp], '')
  assert.equal(f[COL.nroComp], '')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL AVISO SE DA AL CARGAR, NO SEIS MESES DESPUÉS AL CONCILIAR
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('todo cheque que entra por el banco nace SIN N° de comprobante — y hay que decirlo ahí', () => {
  // `filaRegistro` deja la columna vacía y no puede hacer otra cosa: el banco informa el cheque, no
  // la factura que paga. Si nadie avisa en ese momento, el hueco se descubre meses después — que fue
  // exactamente lo que pasó con los 11 cheques no debitados por $8.424.279 medidos el 05/08.
  const nuevos = [{ instrumento: 'ECHEQ', numero: '372', contraparte: 'Alumetal', importe: 500000 }]
  assert.equal(sinComprobante({ agregar: nuevos }).seEstanAgregando.length, 1, 'los agregó en silencio')
})

test('avisa por los NO debitados del registro, no por los que ya salieron de la cuenta', () => {
  // Un cheque debitado sin N° también es un hueco, pero es un hueco de archivo: su plata ya está
  // dentro del saldo del banco. Mezclarlos hacía una lista de 50 que nadie iba a leer.
  const registro = [
    { fila: 118, nroComp: '', debitado: 'No', proveedor: 'Con-Sec', monto: '1.700.000' },
    { fila: 20, nroComp: '', debitado: 'SI', proveedor: 'ya salió', monto: '500.000' },
    { fila: 121, nroComp: '0038-00025872', debitado: 'No', proveedor: 'Alumetal', monto: '16.649.000' },
    { fila: 23, nroComp: '7206', debitado: 'No', proveedor: 'número corto', monto: '265.000' },
  ]
  assert.deepEqual(sinComprobante({ registro }).yaEnElRegistro.map((x) => x.fila), [118, 23],
    'tiene que avisar por los no debitados sin llave útil — y "7206" no es una llave útil')
})

test('verificarEncabezado: el layout REAL de la pestaña pasa', () => {
  const real = ['Tipo', 'Nro', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad de Negocio']
  assert.deepEqual(verificarEncabezado(real), [])
})

test('verificarEncabezado ABORTA si el dueño insertó una columna y todo se corrió', () => {
  const corrido = ['Tipo', 'Nro', 'NUEVA', 'fecha de emision', 'CUIT', 'Proveedor', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO']
  const p = verificarEncabezado(corrido)
  assert.ok(p.length >= 2, 'lo detecta en más de una columna')
  assert.ok(p.some((s) => /columna F/.test(s)), 'F ya no dice Monto')
  assert.ok(p.some((s) => /columna K/.test(s)), 'K ya no dice DEBITADO — ahí iba a escribir el sync')
})

test('comprobantesQueCubre: si las pendientes del CUIT suman el cheque al centavo, ése es el N°', () => {
  const pend = [
    { cuit: '30-71135522-3', comprobante: '0006-00008111', saldo_pendiente: 112349.35 },
    { cuit: '30711355223', comprobante: '0006-00008199', saldo_pendiente: 166734.37 },
    { cuit: '30711355223', comprobante: '0006-00009000', saldo_pendiente: 0 },
    { cuit: '30999999999', comprobante: '0001-00000001', saldo_pendiente: 279083.72 },
  ]
  assert.equal(comprobantesQueCubre({ contraparte_cuit: '30711355223', importe: 279083.72 }, pend), '0006-00008111 + 0006-00008199')
  // Un peso de diferencia no se adivina.
  assert.equal(comprobantesQueCubre({ contraparte_cuit: '30711355223', importe: 279084.72 }, pend), null)
  assert.equal(comprobantesQueCubre({ contraparte_cuit: null, importe: 279083.72 }, pend), null)
})

// ── 30/09/2026 · eCheq 389 y 390 de SURI: varios cheques que juntos cancelan una factura YA pagada ──
const SURI = '30642815977'
const ch = (numero, importe, extra = {}) => ({ numero, importe, contraparte: 'SURI S.A.', contraparte_cuit: SURI, estado: 'Emitido', fecha_pago: null, corte: '2026-09-30', origen: ORIGEN_ECHEQ, cuenta: 'CC - 00000913836', ...extra })
// La fila 1031 de compra_sheet: el CUIT viene con guiones y el del cheque sin ellos — son el mismo.
const suri1031 = { cuit: '30-64281597-7', comprobante: '0027-00026284', estado: 'Pagado', tipo_pago: 'Echeq', fecha_caja: '2026-09-30', saldo_pendiente: 0, monto_pagado: 1821532.26 }

test('389 + 390 de SURI: juntos cancelan la FA ya Pagado por Echeq el 30/09 → ambos con el mismo N°', () => {
  const r = deducirComprobantes([ch('389', 821532.26), ch('390', 1000000)], { pagadas: [suri1031] })
  assert.deepEqual(r, ['0027-00026284', '0027-00026284'])
})

test('varias facturas pagadas ese día por Echeq → «A + B»; una de otro día o de otro medio no entra', () => {
  const pagadas = [
    { ...suri1031, comprobante: 'A', monto_pagado: 1000 },
    { ...suri1031, comprobante: 'B', monto_pagado: 500 },
    { ...suri1031, comprobante: 'C', monto_pagado: 77, fecha_caja: '2026-09-29' },
    { ...suri1031, comprobante: 'D', monto_pagado: 88, tipo_pago: 'Transferencia' },
  ]
  assert.deepEqual(deducirComprobantes([ch('1', 900), ch('2', 600)], { pagadas }), ['A + B', 'A + B'])
})

test('(a) varios cheques del CUIT y corte que juntos suman lo PENDIENTE también deducen', () => {
  const pendientes = [{ cuit: SURI, comprobante: 'X-1', saldo_pendiente: 300 }, { cuit: SURI, comprobante: 'X-2', saldo_pendiente: 700 }]
  assert.deepEqual(deducirComprobantes([ch('1', 400), ch('2', 600)], { pendientes }), ['X-1 + X-2', 'X-1 + X-2'])
})

test('un cheque que no suma → null, no se adivina (cincuenta centavos de más tampoco)', () => {
  const pagadas = [suri1031]
  assert.deepEqual(deducirComprobantes([ch('389', 821532.26), ch('390', 1000000.5)], { pagadas }), [null, null])
  assert.deepEqual(deducirComprobantes([ch('389', 821532.26)], { pagadas }), [null], 'uno solo no alcanza')
  assert.deepEqual(deducirComprobantes([ch('389', 1821532.26, { contraparte_cuit: null })], { pagadas }), [null], 'sin CUIT no hay cruce')
})

test('cortes distintos son grupos distintos: no se suman cheques de corridas diferentes', () => {
  assert.deepEqual(deducirComprobantes([ch('389', 821532.26), ch('390', 1000000, { corte: '2026-09-29' })], { pagadas: [suri1031] }), [null, null])
})

test('ambiguo: pendientes y pagadas cierran con facturas DISTINTAS → no se deduce', () => {
  const pendientes = [{ cuit: SURI, comprobante: 'PEND-1', saldo_pendiente: 1821532.26 }]
  assert.deepEqual(deducirComprobantes([ch('389', 821532.26), ch('390', 1000000)], { pendientes, pagadas: [suri1031] }), [null, null])
})

test('una factura de la lista sin N° de comprobante → no se deduce una lista a medias', () => {
  assert.deepEqual(deducirComprobantes([ch('1', 1821532.26)], { pagadas: [{ ...suri1031, comprobante: '' }] }), [null])
})

test('comprobantesQueCubre es el mismo motor con un grupo de uno', () => {
  assert.equal(comprobantesQueCubre(ch('1', 1821532.26), [], [suri1031]), '0027-00026284')
})

test('fecha_pago NULL → la celda de fecha del registro queda VACÍA (nunca «null»)', () => {
  const f = filaRegistro({ ...ch('390', 1000000), instrumento: 'ECHEQ', debitado: 'No' })
  assert.equal(f[COL.pago], '')
  assert.ok(f.every((v) => v !== null && v !== 'null' && v !== undefined))
})
