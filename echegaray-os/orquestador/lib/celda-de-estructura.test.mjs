import test from 'node:test'
import assert from 'node:assert/strict'
import { esCeldaDeEstructura } from './celda-de-estructura.mjs'

// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN (04/09/2026) ═══
//
// «Impuestos y Financieros» pasó de 105 filas a 68. Las huellas de celda quedaron apuntando a
// coordenadas donde hoy no hay nada, y el generador leyó eso como «la vaciaste vos»: se negó a
// escribir A23 («Concepto», el encabezado del cuadro de IIBB) y A42 («⇒ Total otros impuestos»).
// Quedaron dos filas con importes y sin nada que dijera qué son — dos defectos del auditor de patrón.

test('un ENCABEZADO de tabla es estructura: nadie borra "Concepto" y deja los doce importes', () => {
  assert.equal(esCeldaDeEstructura('Concepto'), true)
  assert.equal(esCeldaDeEstructura('Período'), true)
  assert.equal(esCeldaDeEstructura('Fecha y concepto'), true)
})

test('una fila de TOTAL es estructura', () => {
  assert.equal(esCeldaDeEstructura('⇒ Total otros impuestos'), true)
  assert.equal(esCeldaDeEstructura('⇒ IVA a pagar en efectivo'), true)
})

test('un TÍTULO de sección es estructura', () => {
  assert.equal(esCeldaDeEstructura('1 · IVA — LA DDJJ OFICIAL (F.2051)'), true)
  assert.equal(esCeldaDeEstructura('4.1 · SUB'), true)
})

test('UN IMPORTE BORRADO SIGUE BORRADO: el seguro es estrecho o desarma la protección', () => {
  // Ésta es la mitad que importa. Si `esCeldaDeEstructura` devolviera true de más, el generador
  // volvería a resucitar datos que el dueño borró a mano — el defecto opuesto y más caro.
  for (const v of [1419600, '1419600', '=SUM(B40:B41)', '$1.234,56', '', null, undefined, '—', 's/d']) {
    assert.equal(esCeldaDeEstructura(v), false, JSON.stringify(v))
  }
})

test('un texto libre del dueño no es estructura', () => {
  assert.equal(esCeldaDeEstructura('ojo con esto, preguntar al contador'), false)
  assert.equal(esCeldaDeEstructura('Prendario Ford XLS · Santander — cuota'), false)
})
