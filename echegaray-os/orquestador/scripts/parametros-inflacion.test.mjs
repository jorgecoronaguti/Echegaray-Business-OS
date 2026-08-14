// EL BLOQUE QUE DECÍA "LO ACTUALIZA EL OS SOLO" Y NADIE ESCRIBÍA.
//
// `Parámetros!A72` lo declara desde el primer día. Un grep sobre `orquestador/` encontraba cinco
// lectores y cero escritores: los números los pegó una persona el 27/07 y ahí quedaron, divergiendo
// de `public.indice_economico` (julio 2,0% en la celda contra 1,8% en la base). Dos versiones del
// mismo concepto en dos caras del mismo sistema, sin un solo error a la vista.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ubicarBloque, filasBloque, ANCLA, FILA_DATOS, ENCABEZADOS, LECTORES_CON_FILA_FIJA } from './parametros-inflacion.mjs'

/** Parámetros tal como está hoy: el título en la 72, los encabezados en la 73, los datos en la 74. */
const parametros = () => {
  const f = Array.from({ length: 80 }, () => [])
  f[71] = [`${ANCLA} — inflación mensual esperada. Lo actualiza el OS solo desde la web (REM del BCRA).`]
  f[72] = ENCABEZADOS
  f[73] = ['1/7/2026', '0,02', '1', 'REM BCRA jun-2026']
  return f
}

test('el bloque se ubica POR SU RÓTULO, y hoy cae donde los cinco lectores lo esperan', () => {
  const u = ubicarBloque(parametros())
  assert.equal(u.encontrado, true)
  assert.equal(u.filaTitulo, 72)
  assert.equal(u.filaDatos, FILA_DATOS)
  assert.equal(u.desplazado, false)
})

test('SI EL BLOQUE SE MOVIÓ, SE AVISA — cinco fórmulas citan A74:C90 con la fila a mano', () => {
  const f = parametros()
  f.splice(10, 0, ['una fila nueva que alguien insertó arriba'])
  const u = ubicarBloque(f)
  assert.equal(u.encontrado, true)
  assert.equal(u.filaDatos, FILA_DATOS + 1)
  assert.equal(u.desplazado, true, 'sin esta señal, los cinco lectores leen el bloque equivocado sin dar error')
  assert.ok(LECTORES_CON_FILA_FIJA.length >= 4)
})

test('SI EL RÓTULO NO ESTÁ, NO SE ESCRIBE: nada de escribir en la fila 74 "porque siempre estuvo ahí"', () => {
  const u = ubicarBloque([[], ['otra cosa']])
  assert.equal(u.encontrado, false)
  assert.equal(u.filaDatos, null)
})

const INDICES = [
  { periodo: '2026-08', variacion: 0.019, tipo: 'proyeccion', fuente: 'REM BCRA', leido_en: new Date() },
  { periodo: '2026-09', variacion: 0.018, tipo: 'proyeccion', fuente: 'REM BCRA', leido_en: new Date() },
  { periodo: '2026-10', variacion: 0.017, tipo: 'proyeccion', fuente: 'REM BCRA', leido_en: new Date() },
]

test('EL FACTOR ACUMULADO ES UNA FÓRMULA ENCADENADA, no un número calculado en JavaScript', () => {
  const b = filasBloque(INDICES, 74)
  assert.equal(b[0][2], 1, 'el primer mes es la base: vale 1')
  assert.equal(b[1][2], '=$C$74*(1+$B75)')
  assert.equal(b[2][2], '=$C$75*(1+$B76)')
  // Y las fechas van como texto es-AR de primer día de mes, que es lo que la columna A ya tenía.
  assert.equal(b[0][0], '8/1/2026')
})

test('LA FECHA DE LECTURA VA EN LA CELDA: un REM de hace 40 días no puede leerse igual que uno de ayer', () => {
  const b = filasBloque(INDICES, 74)
  assert.match(String(b[0][3]), /leído hace 0 día\(s\)/)
  assert.doesNotMatch(String(b[0][3]), /CONVIENE REFRESCARLO/)
  const viejo = filasBloque([{ ...INDICES[0], leido_en: new Date(Date.now() - 40 * 86400000) }], 74)
  assert.match(String(viejo[0][3]), /▲ CONVIENE REFRESCARLO/)
})

test('un DATO publicado y una PROYECCIÓN no se leen igual', () => {
  const b = filasBloque([{ ...INDICES[0], tipo: 'dato', fuente: 'INDEC' }], 74)
  assert.match(String(b[0][3]), /^DATO publicado · INDEC/)
  assert.match(String(filasBloque(INDICES, 74)[0][3]), /^proyección/)
})

test('sin fuente declarada lo dice, no deja la celda muda', () => {
  const b = filasBloque([{ periodo: '2026-08', variacion: 0.019, tipo: 'proyeccion', fuente: null, leido_en: null }], 74)
  assert.match(String(b[0][3]), /sin fuente declarada/)
})

test('EL BLOQUE VIEJO ES MÁS LARGO QUE EL NUEVO: la cola se cuenta para poder limpiarla', () => {
  // MEDIDO en el dry contra el archivo real (06/08): la base tiene cinco meses (ago–dic) y la pestaña
  // seis (jul–dic, con julio ya vencido). Sin conocer el largo previo, la sexta fila sobrevive y el
  // bloque queda con diciembre DOS VECES — y las cuatro proyecciones que hacen MATCH sobre A74:A90
  // encuentran la primera, que puede ser la vieja. Ningún error, un mes contado dos veces.
  const f = parametros()
  f[74] = ['1/8/2026', '0,018', '1,018', 'REM BCRA jun-2026']
  f[75] = ['1/9/2026', '0,018', '1,036', 'REM BCRA jun-2026']
  f[76] = []   // el bloque termina acá
  f[77] = ['Desfase de pago de la quincena (días hábiles)', '1', 'otro parámetro, no es del bloque']
  const u = ubicarBloque(f)
  assert.equal(u.largoPrevio, 3, 'el largo se corta en la primera fila en blanco, no se come el parámetro de abajo')
})

test('un bloque recién creado no tiene cola: largoPrevio 0 y nada que limpiar', () => {
  const f = parametros()
  f[73] = []
  assert.equal(ubicarBloque(f).largoPrevio, 0)
})
