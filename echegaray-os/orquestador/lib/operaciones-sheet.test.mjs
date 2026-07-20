// Tests de las operaciones con nombre. Herméticos: núcleo puro, sin API ni DB.
import assert from 'node:assert/strict'
import { normalizarObras, totalesAFormula, numerosComoTexto, buscarColumna, formatPropuesta } from './operaciones-sheet.mjs'

let n = 0
const t = (nombre, fn) => { fn(); n++; console.log('  ok', nombre) }
const c = (v, f = null) => ({ formula: f, valor: v === null ? null : String(v), numero: typeof v === 'number' ? v : null })
const grid = (filas) => ({ filas })

const CANON = ['La Estrella', 'San Francisco', 'Messina', 'ARCOR']
const ALIAS = { estrella: 'La Estrella', messinas: 'Messina' }

t('encuentra la columna de obra por su encabezado', () => {
  assert.equal(buscarColumna(['ID', 'Obra / Cliente', 'Monto'], /\bobra|cliente/i), 1)
  assert.equal(buscarColumna(['ID', 'Monto'], /\bobra/i), -1)
})

t('unifica un nombre que contiene a la obra canónica', () => {
  const g = grid([[c('ID'), c('Obra')], [c(1), c('LA ESTRELLA /ALIMENTOS DEL SUR SAS')]])
  const r = normalizarObras(g, { encabezado: ['ID', 'Obra'], filaDatos: 0, canonicas: CANON, alias: ALIAS })
  assert.equal(r.cambios.length, 1)
  assert.equal(r.cambios[0].a, 'La Estrella')
  assert.equal(r.cambios[0].celda, 'B2')
})

t('NO adivina cuando hay varias obras en un mismo campo', () => {
  const g = grid([[c('Obra')], [c('IMOTOR/San Francisco/JAVI SANCHEZ')], [c('ARCOR y Messina')]])
  const r = normalizarObras(g, { encabezado: ['Obra'], filaDatos: 0, canonicas: CANON, alias: ALIAS })
  // "ARCOR y Messina" matchea dos → decisión del dueño. Adivinar corrompe el costo por obra.
  const ambiguo = r.requiere_decision.find((d) => /ARCOR y Messina/.test(d.valor))
  assert.ok(ambiguo, 'dos obras en un campo no se resuelven solas')
  assert.equal(ambiguo.candidatos.length, 2)
})

t('un nombre desconocido va a decisión, no a cambio', () => {
  const g = grid([[c('Obra')], [c('LIRIO DANIEL RAMIRO')]])
  const r = normalizarObras(g, { encabezado: ['Obra'], filaDatos: 0, canonicas: CANON })
  assert.equal(r.cambios.length, 0)
  assert.equal(r.requiere_decision.length, 1)
})

t('un nombre que ya está bien NO genera cambio (no toca lo que está bien)', () => {
  const g = grid([[c('Obra')], [c('ARCOR')]])
  const r = normalizarObras(g, { encabezado: ['Obra'], filaDatos: 0, canonicas: CANON })
  assert.equal(r.cambios.length, 0)
  assert.equal(r.requiere_decision.length, 0)
})

t('respeta los alias configurados', () => {
  const g = grid([[c('Obra')], [c('MESSINAS')]])
  const r = normalizarObras(g, { encabezado: ['Obra'], filaDatos: 0, canonicas: CANON, alias: ALIAS })
  assert.equal(r.cambios[0].a, 'Messina')
})

t('nunca pisa una celda que tiene fórmula', () => {
  const g = grid([[c('Obra')], [c('estrella', '=A1')]])
  const r = normalizarObras(g, { encabezado: ['Obra'], filaDatos: 0, canonicas: CANON, alias: ALIAS })
  assert.equal(r.cambios.length, 0)
})

t('total pegado a mano → fórmula con separador es-AR', () => {
  const g = grid([[c('Concepto'), c('Monto')], [c('a'), c(100)], [c('b'), c(50)], [c('TOTAL'), c(150)]])
  const r = totalesAFormula(g, { encabezado: ['Concepto', 'Monto'], filaDatos: 0 })
  assert.equal(r.cambios.length, 1)
  assert.equal(r.cambios[0].celda, 'B4')
  assert.equal(r.cambios[0].a, '=SUMA(B2:B3)')
})

t('un total que YA es fórmula no se toca', () => {
  const g = grid([[c('C'), c('M')], [c('a'), c(100)], [c('TOTAL'), c(100, '=SUMA(B2:B2)')]])
  assert.equal(totalesAFormula(g, { encabezado: ['C', 'M'], filaDatos: 0 }).sin_cambios, true)
})

t('número escrito como texto en formato es-AR se convierte', () => {
  const g = grid([[c('Monto')], [c(1)], [c(2)], [c(3)], [c(4)], [c('1.234,56')]])
  const r = numerosComoTexto(g, { encabezado: ['Monto'], filaDatos: 0 })
  assert.equal(r.cambios.length, 1)
  assert.equal(r.cambios[0].a, 1234.56, 'punto = miles, coma = decimal')
})

t('texto que NO es un número no se borra (destruiría información del dueño)', () => {
  const g = grid([[c('Monto')], [c(1)], [c(2)], [c(3)], [c(4)], [c('s/d')], [c('pendiente')]])
  const r = numerosComoTexto(g, { encabezado: ['Monto'], filaDatos: 0 })
  assert.equal(r.cambios.length, 0)
})

t('una columna de texto NO se toca aunque tenga algún número', () => {
  const g = grid([[c('Concepto')], [c('cemento')], [c('arena')], [c('hierro')], [c('cal')], [c('100')]])
  assert.equal(numerosComoTexto(g, { encabezado: ['Concepto'], filaDatos: 0 }).sin_cambios, true)
})

t('la propuesta muestra lo que necesita decisión, separado de lo automático', () => {
  const g = grid([[c('Obra')], [c('estrella')], [c('DESCONOCIDO SA')]])
  const txt = formatPropuesta(normalizarObras(g, { encabezado: ['Obra'], filaDatos: 0, canonicas: CANON, alias: ALIAS }))
  assert.match(txt, /NECESITAN TU DECISIÓN/)
  assert.match(txt, /La Estrella/)
})

console.log(`operaciones-sheet: ${n} checks OK`)
