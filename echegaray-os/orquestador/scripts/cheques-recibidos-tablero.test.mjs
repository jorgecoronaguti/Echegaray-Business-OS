// EL APLICADOR de la cabecera de "Cheques Recibidos". Sin red, sin base, sin Sheet.
//
// Lo que se prueba acá es la GUARDA, que es lo único de este archivo que puede destruir algo: el
// registro de la pestaña es el derrame de UNA QUERY en A28, y escribir la cabecera con el registro
// corrido lo dejaría en #REF!. La guarda tiene que fallar CERRADA ante cualquier duda.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registroIntacto } from './cheques-recibidos-tablero.mjs'
import { PASOS } from '../lib/flujo-caja-pasos.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
/** La columna A tal como se lee hoy: 26 filas de cabecera, el encabezado en la 27 y la QUERY en la 28. */
const colA = (hdr = 'N° de cheque', query = '=IFERROR(QUERY(\'_CHEQUES_RAW\'!$A$4:$L;"select B, C";0);"sin cheques")') => [
  ...Array.from({ length: 26 }, () => ['']), [hdr], [query],
]

test('el registro se reconoce por SUS DOS ANCLAS: el encabezado y la QUERY', () => {
  assert.equal(registroIntacto(colA()), true)
})

test('si el encabezado se movió, ABORTA: escribir la cabecera pisaría el derrame', () => {
  assert.equal(registroIntacto(colA('N° operación')), false, 'ése es el encabezado del registro VIEJO')
  assert.equal(registroIntacto(colA('')), false)
  // Una lectura corta (la pestaña todavía no tiene 28 filas) tampoco alcanza para decidir.
  assert.equal(registroIntacto([['CHEQUES RECIBIDOS']]), false)
  assert.equal(registroIntacto([]), false)
})

test('si la QUERY ya no está, ABORTA: sin ella no hay registro que proteger ni que respetar', () => {
  // Un valor pegado en A28 significa que alguien ya rompió el derrame: no es el momento de escribir.
  assert.equal(registroIntacto(colA('N° de cheque', '00000514')), false)
  assert.equal(registroIntacto(colA('N° de cheque', '')), false)
  assert.equal(registroIntacto(colA('N° de cheque', '=QUERY(_CHEQUES_RAW!A4:L;"select B";0)')), false,
    'sin el IFERROR no es la QUERY del contrato: una pestaña vacía dejaría #N/A a la vista')
})

// ═══ EL RETIRO DE LOS DOS GENERADORES MUERTOS (06/08) ═══
//
// `cheques-recibidos-pestana.mjs` escribía un registro por OPERACIÓN —el mismo cheque como
// Aceptación, Custodia, Depósito y Endoso— con el que la cartera no se podía sumar: el endoso de
// $20.000.000 figuraba dos veces. `cheques-recibidos-cobro.mjs` le agregaba dos columnas a ESE
// registro y arrancaba con un `throw`. Los dos describían columnas que ya no existen.
//
// No alcanza con sacarlos de PASOS: cualquiera puede correr un script a mano, y un archivo que
// escribe una pestaña con un layout de hace dos diseños la destruye igual. Se borran.

test('los dos generadores viejos NO están más en el repo', () => {
  for (const muerto of ['cheques-recibidos-pestana.mjs', 'cheques-recibidos-cobro.mjs']) {
    assert.equal(existsSync(join(AQUI, muerto)), false, `${muerto} sigue en el repo y puede correrse a mano`)
  }
})

test('el pipeline apunta a ESTE script, y le dice a qué pestaña escribir', () => {
  const pasos = PASOS.filter(([, , tabs = []]) => tabs.includes('Cheques Recibidos'))
  assert.equal(pasos.length, 1, 'dos dueños de la misma pestaña es lo que produce el candado falso')
  const [script, , , args = []] = pasos[0]
  assert.equal(script, 'cheques-recibidos-tablero.mjs')
  assert.deepEqual(args, ['--pestana', 'Cheques Recibidos'])
  assert.ok(existsSync(join(AQUI, script)), 'el paso declara un archivo que no existe')
})
