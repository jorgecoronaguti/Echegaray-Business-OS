// EL REPORTE DE RESIDUO, VERIFICADO EN FRÍO.
//
// Lo que este test cuida no es el formato del informe: es que NO recomiende borrar una celda del dueño.
// Un reporte que dice "✔ mía" sobre algo ajeno es peor que no tener reporte, porque la persona lo va a
// borrar con confianza.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { residuo } from './caja-residuo-del-rediseno.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'

const fila = (...c) => c
const NUEVA = [
  fila('POSICIÓN DE CAJA', VACIO, VACIO, VACIO, VACIO, VACIO, '=X', VACIO),
  fila('Arqueo en pesos — conteo a mano', 'ARS', undefined, VACIO, VACIO, undefined, VACIO, VACIO),
]

test('lo que el generador reescribe NO es residuo', () => {
  const actual = [['POSICIÓN DE CAJA', '', '', '', '', '', 'al 05/08', '']]
  const r = residuo(actual, NUEVA)
  assert.deepEqual(r.adentro, [])
  assert.deepEqual(r.afuera, [])
})

test('la celda de CARGA del dueño nunca se propone: el generador la declara AUSENTE', () => {
  // Es el arqueo. Sale `undefined` para que la fusión lo preserve, y proponer su borrado sería
  // proponer borrar justo lo único que una persona escribe en toda la pestaña.
  const actual = [[], ['Caja en pesos — contado', 'ARS', 15000000, '', '', 46233, '', '']]
  const r = residuo(actual, NUEVA)
  assert.deepEqual([...r.adentro, ...r.afuera], [])
})

test('lo que quedó DEBAJO de la grilla nueva se reporta como residuo puro', () => {
  const actual = [[], [], [], ['7.7 · TIPO DE CAMBIO', '', 1450]]
  const r = residuo(actual, NUEVA)
  assert.equal(r.afuera.length, 2, 'el rótulo y la cotización de la fila 4, que la grilla nueva no tiene')
  assert.equal(r.afuera[0].ref, 'A4')
  assert.equal(r.afuera[1].ref, 'C4')
  assert.deepEqual(r.adentro, [])
})

test('una celda que el generador declara SUYA y VACÍA y sigue con contenido va a "adentro"', () => {
  // Es el caso de D34/E34: el generador manda el centinela, `no-borrar` lo corrige y el número viejo
  // sobrevive a todas las corridas. Se separa de "afuera" porque se decide distinto: ésta va a estar
  // ahí para siempre si nadie la saca.
  const actual = [['POSICIÓN DE CAJA', '', '', 54036925.28, '', '', 'al 05/08', '']]
  const r = residuo(actual, NUEVA)
  assert.equal(r.adentro.length, 1)
  assert.equal(r.adentro[0].ref, 'D1')
  assert.deepEqual(r.afuera, [])
})

test('SIN HUELLA NO SE RECOMIENDA BORRAR: "mía" es una prueba, no un default', () => {
  const actual = [[], [], [], ['algo viejo']]
  assert.equal(residuo(actual, NUEVA).afuera[0].mia, false, 'sin prueba, la celda va a la lista de "mirar"')
  assert.equal(residuo(actual, NUEVA, () => true).afuera[0].mia, true)
})

test('EL SCRIPT NO PUEDE ESCRIBIR: sale sin scopes de escritura', () => {
  // No alcanza con "no llama a ninguna función de escritura": alcanza con que NO TENGA el permiso. Un
  // reporte sobre qué borrar tiene que ser incapaz de borrar aunque alguien le agregue una llamada.
  const src = readFileSync(new URL('./caja-residuo-del-rediseno.mjs', import.meta.url), 'utf8')
  assert.ok(!src.includes('WRITE_SCOPES'), 'el reporte no puede pedir permisos de escritura')
  assert.ok(!src.includes('spreadsheetBatchUpdate') && !src.includes('escribirPreservando'),
    'y no puede llamar a ninguna escritura')
})
