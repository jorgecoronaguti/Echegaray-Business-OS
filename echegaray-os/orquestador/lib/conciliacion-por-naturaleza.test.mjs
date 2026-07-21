import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GRUPOS, segunBanco, VENTANA, sinPestanaDuena, RAW } from './conciliacion-por-naturaleza.mjs'
import { clasificarMovimiento } from './banco-santander.mjs'

test('el importe del banco se devuelve en POSITIVO', () => {
  // Los egresos vienen negativos del extracto. Compararlos contra el positivo de una pestaña sin
  // invertir el signo daría el doble y parecería un desvío enorme donde no hay ninguno.
  assert.ok(segunBanco('Sueldos').startsWith('-SUMIFS'))
})

test('sólo mira lo que SALE: un cobro no se compara contra una pestaña de pagos', () => {
  assert.match(segunBanco('Cheques y echeq'), /"sale"/)
})

test('la ventana se lee de la réplica, no se escribe a mano', () => {
  assert.match(VENTANA.desde, new RegExp(`MIN\\(${RAW.hoja}!`))
  assert.match(VENTANA.hasta, new RegExp(`MAX\\(${RAW.hoja}!`))
})

test('las fórmulas van en es-AR', () => {
  for (const g of GRUPOS) {
    if (!g.formula) continue
    const f = g.formula('D1', 'D2')
    assert.ok(!f.includes(','), `una coma rompe la fórmula en es-AR: ${g.naturaleza}`)
  }
})

test('toda naturaleza que el clasificador produce tiene su grupo', () => {
  // Si el banco trae un concepto nuevo y el clasificador inventa una naturaleza que el cuadro no
  // conoce, esa plata desaparece del control sin que nada avise.
  const conceptos = [
    'Pago Haberes - 123', 'Impuesto Ley 25.413 Debito 0,6%', 'Transferencia Realizada - A Herrajes',
    'Echeq Clearing Recibido 24hs', 'Compra Con Tarjeta De Debito - Merpago', 'Pago De Servicios - Imp.afip',
    'Prestamos Prendarios - -', 'Pago Tarjeta De Credito Visa', 'Debito Automatico - Sancor',
    'Cobro De Interes Por Descubierto', 'Cheque Debitado', 'Canje Interno Recibido 24 Hs',
  ]
  const conocidas = new Set(GRUPOS.map((g) => g.naturaleza))
  for (const c of conceptos) {
    assert.ok(conocidas.has(clasificarMovimiento(c)), `"${c}" → "${clasificarMovimiento(c)}" no tiene grupo en el cuadro`)
  }
})

test('los dos costos bancarios quedan declarados SIN pestaña dueña', () => {
  // Es el hallazgo del bloque: impuesto al cheque y costo del descubierto salen todos los meses y
  // ninguna pestaña del archivo los espera. Si alguien les asigna una, este test lo obliga a
  // revisar que de verdad los registre.
  const huerfanos = sinPestanaDuena().map((g) => g.naturaleza)
  assert.deepEqual(huerfanos, ['Impuesto al cheque (Ley 25.413)', 'Costo financiero del descubierto'])
})

test('cada grupo dice qué significa la comparación', () => {
  for (const g of GRUPOS) assert.ok(g.nota && g.nota.length > 30, `${g.naturaleza} sin nota`)
})
