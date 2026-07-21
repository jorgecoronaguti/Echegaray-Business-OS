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

test('ningún grupo queda sin pestaña dueña', () => {
  // ESTE TEST NACIÓ AL REVÉS Y ESO IMPORTA. Afirmaba que el impuesto al cheque y el costo del
  // descubierto no tenían dueño, y era falso: el Cash Flow Mensual tiene las dos líneas. Llegué a
  // publicar esa alerta en CAJA. Un test que consagra una conclusión sin verificarla contra el
  // archivo la vuelve permanente — por eso ahora exige lo contrario: todo grupo tiene dueño, y si
  // aparece uno sin dueño hay que ir a buscar dónde debería estar antes de declararlo huérfano.
  assert.deepEqual(sinPestanaDuena().map((g) => g.naturaleza), [])
})

test('cada grupo dice qué significa la comparación', () => {
  for (const g of GRUPOS) assert.ok(g.nota && g.nota.length > 30, `${g.naturaleza} sin nota`)
})

/** Quita los literales entre comillas: lo que queda es la sintaxis de la fórmula. */
const sinLiterales = (f) => String(f).replace(/"(?:[^"]|"")*"/g, '""')

test('el grupo de cheques trae detalle accionable, no sólo un total', () => {
  // Un desvío de $899.154 no le sirve a nadie; "N° 218 Corralón Progreso $200.000" se resuelve en
  // dos minutos. El detalle lista los cheques que el banco debitó y la pestaña no marca.
  const g = GRUPOS.find((x) => x.naturaleza === 'Cheques y echeq')
  assert.ok(typeof g.detalle === 'function', 'el grupo de cheques tiene que traer detalle')
  const f = g.detalle()
  assert.ok(f.includes('Cheques Emitidos'), 'lee la pestaña de cheques')
  assert.ok(f.includes('<>"SI"'), 'sólo los NO debitados')
  // La coma sólo se prohíbe FUERA de un literal: dentro de un patrón como "$#,##0" es correcta y
  // necesaria —los patrones de formato de Sheets usan siempre la coma para los miles, sin importar
  // el locale—. Chequear la cadena entera marcaba como error una fórmula bien escrita.
  assert.ok(!sinLiterales(f).includes(','), `es-AR: coma fuera de un literal en ${f}`)
})
