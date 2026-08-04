// LAS LÍNEAS DEL CASH FLOW DE LAS QUE CUELGA LA PROYECCIÓN DE IVA.
//
// Por qué esto merece test propio: si el rótulo no se encuentra, la alternativa silenciosa es
// escribir una referencia a una fila que no existe, que devuelve 0 sin dar error — y el cuadro
// vuelve a mostrar $0 de IVA hasta diciembre, que es exactamente el defecto que se vino a arreglar.
// La columna A de acá es la real del Sheet al 04/08/2026, con sus sangrías y su guion largo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ubicarLineas } from './impuestos-pestana.mjs'

const FUENTE = readFileSync(new URL('./impuestos-pestana.mjs', import.meta.url), 'utf8')

/** La columna A del "Cash Flow Mensual" real, con las filas que importan en su posición real. */
function colaAReal() {
  const a = Array.from({ length: 55 }, () => [''])
  a[5] = ['Cobros por ventas y servicios (ya cobrado)']
  a[9] = ['Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)']
  a[13] = ['(–) Pagos al personal y cargas sociales']
  a[22] = ['(–) Pagos a proveedores de obra']
  a[23] = ['    Materiales e insumos de obra civil']
  a[24] = ['    Materiales de mantenimiento']
  a[25] = ['    Cheques sin factura cargada']
  a[26] = ['    Cuotas de tarjeta sin factura cargada']
  a[28] = ['    Gastos de estructura y administración']
  a[29] = ['    Servicios recurrentes']
  return a
}

test('importar el generador NO lo ejecuta contra el Sheet real', async () => {
  // El defecto que atrapa: este archivo llamaba a main() en el tope, sin la guarda de entrypoint que
  // el resto de los generadores tiene. Importarlo —por ejemplo, para probar una función pura como
  // ubicarLineas— corría la pestaña entera contra el archivo de producción. La primera corrida de
  // este test lo hizo: sólo el freno de mano evitó la escritura, y el freno es una red que puede no
  // estar puesta. Si alguien saca la guarda, este test se cuelga o falla en vez de escribir el Sheet.
  const mod = await import('./impuestos-pestana.mjs')
  assert.equal(typeof mod.ubicarLineas, 'function')
  // Que el import haya terminado sin pedir credenciales ni tocar la red ya es la prueba: si main()
  // corriera, el import no resolvería hasta terminar de leer y escribir el Sheet.
})

test('un mes con dato en la hoja pero sin DDJJ se PRESERVA, no se vacía', () => {
  // El defecto que atrapa: la columna de julio del bloque de IVA la escribió una persona (débito,
  // crédito, libre disponibilidad y "⚠ PROYECCIÓN — DDJJ vence 20/08") y en Drive no hay F.2051 de
  // julio. Sin esto el generador le escribía VACIO —"es mi celda y va vacía"— y se la borraba; y
  // como julio es el mes que ancla la proyección, además la falseaba (arrancaría de los $19,3M de
  // junio en vez de los $7,05M de julio, y el cuadro diría que el saldo aguanta todo el año).
  // Las cuatro filas mensuales del bloque tienen que resolver por `ofOAjeno`, nunca por `of`.
  assert.match(FUENTE, /const AJENO = /, 'tiene que existir el centinela de "no es mi celda"')
  assert.match(FUENTE, /x === AJENO \? ''/, 'push tiene que traducir AJENO a cadena vacía, que es lo que fusionar() preserva')
  for (const campo of ['debito', 'credito', 'a_pagar_efectivo', 'libre_disp']) {
    assert.match(FUENTE, new RegExp(`ofOAjeno\\(m, '${campo}'\\)`), `la fila "${campo}" tiene que preservar el mes ajeno`)
    assert.equal(FUENTE.includes(`: of(m, '${campo}')`), false,
      `la fila "${campo}" sigue usando of(), que vacía el mes que escribió una persona`)
  }
})

test('ubica las líneas por rótulo y devuelve la fila real del Sheet', () => {
  const a = colaAReal()
  assert.deepEqual(ubicarLineas(a, [
    'Cobros por ventas y servicios (ya cobrado)',
    'Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)',
  ]), [6, 10])
  assert.deepEqual(ubicarLineas(a, [
    'Materiales e insumos de obra civil',
    'Materiales de mantenimiento',
    'Gastos de estructura y administración',
    'Servicios recurrentes',
  ]), [24, 25, 29, 30])
})

test('la sangría del cash flow no impide encontrar la línea', () => {
  // Los rótulos hijos llevan cuatro espacios adelante; el buscado no los lleva.
  assert.deepEqual(ubicarLineas(colaAReal(), ['Servicios recurrentes']), [30])
})

test('un rótulo que no está ROMPE — nunca devuelve una fila inventada ni un cero', () => {
  assert.throws(
    () => ubicarLineas(colaAReal(), ['Cobranzas de Marte']),
    /no encuentro.*Cobranzas de Marte/s,
  )
  // Y nombra TODOS los que faltan, no sólo el primero: si el cash flow cambió de forma, hace falta
  // ver la lista entera de una vez.
  assert.throws(
    () => ubicarLineas(colaAReal(), ['Cobranzas de Marte', 'Servicios recurrentes', 'Otra que no está']),
    /Cobranzas de Marte · Otra que no está/,
  )
})

test('las líneas SIN FACTURA quedan deliberadamente fuera del crédito fiscal', () => {
  // No hay crédito fiscal sin comprobante. Si alguien las agrega a LINEAS_CREDITO, el crédito se
  // infla y hace desaparecer un pago de IVA que sí va a ocurrir. Este test fija la intención: las
  // filas existen en el cuadro (25 y 26 de la grilla base) y NO son las que la proyección usa.
  const a = colaAReal()
  const sinFactura = ubicarLineas(a, ['Cheques sin factura cargada', 'Cuotas de tarjeta sin factura cargada'])
  const credito = ubicarLineas(a, [
    'Materiales e insumos de obra civil', 'Materiales de mantenimiento',
    'Gastos de estructura y administración', 'Servicios recurrentes',
  ])
  for (const f of sinFactura) assert.equal(credito.includes(f), false, `la fila ${f} no tiene factura: no da crédito fiscal`)
})

test('el subtotal "(–) Pagos a proveedores de obra" NO se usa como base de crédito', () => {
  // Usar el subtotal metería adentro los cheques y la tarjeta sin factura por la puerta de atrás.
  const a = colaAReal()
  const [subtotal] = ubicarLineas(a, ['(–) Pagos a proveedores de obra'])
  const credito = ubicarLineas(a, [
    'Materiales e insumos de obra civil', 'Materiales de mantenimiento',
    'Gastos de estructura y administración', 'Servicios recurrentes',
  ])
  assert.equal(credito.includes(subtotal), false)
})
