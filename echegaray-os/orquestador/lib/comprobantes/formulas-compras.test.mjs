import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EVALUADORES, VEREDICTO, esqueletoDeFormula, filaPorClave, formulaVigente, mismoValor, veredictoDeCelda,
} from './formulas-compras.mjs'
import { contratoContra, indiceDe, NATURALEZA } from './contrato-columnas.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from '../encabezados-referencia.mjs'

// Los evaluadores se llaman por CLAVE y sus fórmulas se resuelven contra la fila de rótulos VIVA.
// Con «Obra» insertada en L (14/09) todo lo de la derecha se corrió una columna: el control viejo,
// llaveado por letra, comparaba «Tipo pago» contra la fórmula de Fecha prevista (30/09).
const VIVO = contratoContra(COMPRAS_CON_OBRA)
const ANTIGUO = contratoContra(COMPRAS_2508)
const letraDe = (contrato, clave) => contrato.find((c) => c.clave === clave)?.letra

test('el esqueleto ignora la fila y el formato, no la referencia', () => {
  assert.equal(esqueletoDeFormula('=U900-P900'), '=U-P')
  assert.equal(esqueletoDeFormula('=U4-P4'), '=U-P')
  assert.equal(esqueletoDeFormula('= U900 - P900 '), '=U-P')
  assert.equal(esqueletoDeFormula('=IF(F900="pago";C900;"Pendiente")'), '=IF(F="PAGO";C;"PENDIENTE")')
  // Una columna distinta NO colapsa al mismo esqueleto: si colapsara, el guard no serviría de nada.
  assert.notEqual(esqueletoDeFormula('=U900-P900'), esqueletoDeFormula('=U900-O900'))
})

test('las letras salen del encabezado vivo: con «Obra» en L todo se corre una', () => {
  assert.equal(letraDe(VIVO, 'prevDia'), 'R')
  assert.equal(letraDe(VIVO, 'pagado'), 'U')
  assert.equal(letraDe(VIVO, 'parcial1'), 'V')
  assert.equal(letraDe(VIVO, 'estado'), 'Y')
  assert.equal(letraDe(ANTIGUO, 'prevDia'), 'Q', 'sin Obra, Fecha prevista era Q: la letra que el control viejo seguía usando')
  assert.equal(letraDe(VIVO, 'formaPago'), 'Q', 'hoy Q es «Tipo pago»: texto que pone una persona')
})

test('las fórmulas de la fila 1036 del Sheet vivo coinciden con la réplica, con las letras vivas', () => {
  // Copiadas textualmente de la lectura con `valueRenderOption=FORMULA` del 30/09/2026.
  const vivas = {
    prevDia: '=IF(F1036="pago";C1036;"Pendiente")',
    prevMes: '=R1036',
    total: '=O1036+N1036',
    pagado: '=IF(F1036="pago";P1036;0)',
    parcial1: '=U1036-P1036',
    estado: '=IF($E1036="";"";IF(ABS(N($U1036)+N($X1036)-N($P1036))<1;"Pagado";IF(N($U1036)+N($X1036)<N($P1036);"Pendiente";"Revisar")))',
  }
  for (const [clave, texto] of Object.entries(vivas)) {
    assert.equal(esqueletoDeFormula(texto), esqueletoDeFormula(formulaVigente(clave, VIVO)), clave)
  }
})

test('contra las letras del 25/08 la misma réplica NO coincide con el Sheet de hoy (el guard sirve)', () => {
  assert.notEqual(esqueletoDeFormula('=U1036-P1036'), esqueletoDeFormula(formulaVigente('parcial1', ANTIGUO)))
})

test('una clave que la fórmula nombra y el contrato no tiene lanza: no se compara contra letras inventadas', () => {
  const sinIva = VIVO.filter((c) => c.clave !== 'iva')
  assert.throws(() => formulaVigente('total', sinIva), /iva/)
  assert.equal(formulaVigente('columnaSinEvaluador', VIVO), null)
})

test('filaPorClave lee cada valor en su columna viva', () => {
  const cruda = []
  cruda[indiceDe(letraDe(VIVO, 'formaPago'))] = 'Efectivo'
  cruda[indiceDe(letraDe(VIVO, 'prevDia'))] = 46293
  const f = filaPorClave(cruda, VIVO)
  assert.equal(f.formaPago, 'Efectivo')
  assert.equal(f.prevDia, 46293)
})

test('la pestaña de hoy: «Tipo pago» = Efectivo no es una fórmula ni se evalúa como fecha prevista', () => {
  // El defecto del 30/09: «Q67: hoy "Efectivo" · la fórmula daría 46.055». Con las claves, la celda
  // «Tipo pago» ni siquiera es de fórmula: no se evalúa.
  const tipoPago = VIVO.find((c) => c.clave === 'formaPago')
  assert.notEqual(tipoPago.naturaleza, NATURALEZA.FORMULA_FILA)
  const fila = { modalidad: 'Pago', fecha: 46055, prevDia: 46055, formaPago: 'Efectivo' }
  assert.equal(veredictoDeCelda('prevDia', 46055, fila).veredicto, VEREDICTO.NO_OP)
})

test('Monto Parcial 1 es pagado − total: cero cuando está pagada, el saldo en negativo cuando no', () => {
  assert.equal(EVALUADORES.parcial1.evaluar({ pagado: 304515.98, total: 304515.98 }), 0)
  assert.equal(EVALUADORES.parcial1.evaluar({ pagado: 0, total: 304515.98 }), -304515.98)
  // Un texto vale 0, igual que `N()` en el Sheet — no NaN, que envenenaría la comparación.
  assert.equal(EVALUADORES.parcial1.evaluar({ pagado: 'Pendiente', total: 4300 }), -4300)
  assert.equal(EVALUADORES.parcial1.evaluar({}), 0)
})

test('Monto Pagado es el total sólo si la modalidad es Pago', () => {
  assert.equal(EVALUADORES.pagado.evaluar({ modalidad: 'Pago', total: 423621 }), 423621)
  assert.equal(EVALUADORES.pagado.evaluar({ modalidad: 'Cuenta Corriente', total: 423621 }), 0)
})

test('Estado: vacío sin proveedor, Pagado si cubre el total, Pendiente si falta, Revisar si sobra', () => {
  const base = { proveedor: 'ZURICH', total: 1000, parcial2: 0 }
  assert.equal(EVALUADORES.estado.evaluar({ ...base, proveedor: '' }), '')
  assert.equal(EVALUADORES.estado.evaluar({ ...base, pagado: 1000 }), 'Pagado')
  assert.equal(EVALUADORES.estado.evaluar({ ...base, pagado: 0 }), 'Pendiente')
  assert.equal(EVALUADORES.estado.evaluar({ ...base, pagado: 400, parcial2: 600 }), 'Pagado')
  assert.equal(EVALUADORES.estado.evaluar({ ...base, pagado: 1500 }), 'Revisar')
})

test('Fecha prevista devuelve la fecha sólo cuando la modalidad es pago', () => {
  assert.equal(EVALUADORES.prevDia.evaluar({ modalidad: 'pago', fecha: 46264 }), 46264)
  assert.equal(EVALUADORES.prevDia.evaluar({ modalidad: 'Pago', fecha: 46264 }), 46264, 'el IF del Sheet no distingue mayúsculas')
  assert.equal(EVALUADORES.prevDia.evaluar({ modalidad: 'Cuenta Corriente', fecha: 46264 }), 'Pendiente')
})

test('mismoValor tolera el medio centavo y NO cruza tipos', () => {
  assert.ok(mismoValor(304515.98, 304515.981))
  assert.ok(mismoValor(187035.89, 187035.88999999998), 'el ruido de coma flotante de la suma no es un cambio')
  assert.ok(!mismoValor(136000, -136000), 'el signo invertido no puede pasar por igual')
  assert.ok(mismoValor('Pendiente', 'pendiente'))
  assert.ok(!mismoValor(0, 'Pendiente'), 'un texto no es el número cero')
})

test('una celda que ya es fórmula no se toca', () => {
  assert.equal(veredictoDeCelda('pagado', '=IF(F900="pago";P900;0)', {}).veredicto, VEREDICTO.YA_ES_FORMULA)
})

test('el valor pegado que la fórmula reproduce es no-op', () => {
  const v = veredictoDeCelda('pagado', 3331599.98, { modalidad: 'Pago', total: 3331599.98, pagado: 3331599.98 })
  assert.equal(v.veredicto, VEREDICTO.NO_OP)
})

test('la fila 1037 —Pago con Monto Pagado en 0 y parcial en positivo— NO se repara sola', () => {
  const fila = { modalidad: 'Pago', total: 423621, pagado: 0, parcial1: 423621 }
  const u = veredictoDeCelda('pagado', 0, fila)
  assert.equal(u.veredicto, VEREDICTO.DATO_HUMANO)
  assert.equal(u.esperado, 423621)
  const v = veredictoDeCelda('parcial1', 423621, fila)
  assert.equal(v.veredicto, VEREDICTO.DATO_HUMANO)
  assert.equal(v.esperado, -423621)
})

test('un pago hecho desde la app sobre una compra a crédito no se pisa', () => {
  // Filas 996/1031: Cuenta Corriente, la persona pagó desde la app (Monto Pagado = total).
  const v = veredictoDeCelda('pagado', 111530, { modalidad: 'Cuenta Corriente', total: 111530 })
  assert.equal(v.veredicto, VEREDICTO.DATO_HUMANO)
})

test('una columna sin evaluador nunca se repara, aunque sea fórmula por fila', () => {
  for (const clave of ['id', 'mes', 'estadoPago', 'ordenPago', 'ordenSinFecha', 'colAH', 'proveedor']) {
    assert.equal(veredictoDeCelda(clave, 1234, { [clave]: 1234 }).veredicto, VEREDICTO.SIN_EVALUADOR, clave)
  }
})

test('la celda vacía no es un valor pegado', () => {
  assert.equal(veredictoDeCelda('pagado', '', {}).veredicto, VEREDICTO.VACIA)
  assert.equal(veredictoDeCelda('pagado', null, {}).veredicto, VEREDICTO.VACIA)
})
