// LA ÚNICA PRUEBA QUE PUEDE DECIR QUE `COMPRAS_1809` SIGUE SIENDO CIERTA: LEER LA PESTAÑA.
//
// ═══ POR QUÉ EXISTE, APARTE (18/09/2026) ═══
//
// `contrato-columnas.test.mjs` prueba coherencia interna: que el contrato resuelva contra los 41
// rótulos medidos y que ese layout coincida con el construido. Nada de eso mira el Sheet, así que
// una columna insertada por el dueño NO pone nada en rojo — el comentario del repo decía que sí, y
// era falso. La revisión del 18/09 lo marcó y éste es el arreglo: la afirmación «así está la
// pestaña» la sostiene una lectura de la pestaña, no otra constante.
//
// ═══ POR QUÉ NO CORRE EN LA SUITE ═══
//
// Necesita credenciales de Google y toca la red: en `npm run orq:test` sería una prueba unitaria
// leyendo el archivo vivo del dueño, y fallaría en cualquier máquina sin credencial por una razón
// que no es un defecto del código. Se pide a mano y se saltea solo, con el mismo patrón `{ skip }`
// que usan los tests que necesitan la base (`SIN_BASE` en `vistas-security-invoker.test.mjs`).
//
//   ORQ_TEST_SHEET_VIVO=1 node --test orquestador/lib/comprobantes/encabezado-vivo-compras.vivo.test.mjs
//
// CUÁNDO CORRERLO: antes de desplegar el bot, y cada vez que el dueño diga que tocó Compras. Si se
// pone rojo, la pestaña cambió: se actualiza `COMPRAS_1809` con lo que devuelve y el test de la
// suite dirá qué letras se movieron. Es SÓLO LECTURA — no escribe una celda, ni una fórmula.

import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPRAS_1809, LETRAS_1809 } from './encabezado-vivo-compras.mjs'
import { colDelCargador, contratoContra } from './contrato-columnas.mjs'
import { rangoEncabezado } from '../columnas-por-encabezado.mjs'

/** Se saltea salvo que se lo pidan explícitamente. Sin la marca, este archivo no toca la red. */
const APAGADO = process.env.ORQ_TEST_SHEET_VIVO !== '1'

/** El Cash Flow. Mismo id que usa el cargador; se puede pisar con `ORQ_CASHFLOW_ID`. */
const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** El cliente de sólo lectura. Se arma adentro del test para no pedir credenciales al importar. */
async function leerRotulos() {
  const { makeGoogleClient, READONLY_SCOPES } = await import('../google.mjs')
  const { loadConfig } = await import('../config.mjs')
  const g = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  // El rango sale de `rangoEncabezado`, que es el mismo que usa el cargador. Leerlo hasta AN —como
  // se hizo el 17/09— deja afuera el rótulo 41 y da un falso «el contrato no coincide»: ése fue el
  // falso positivo que costó medio día de diagnóstico.
  const filas = await g.readSheetValues(ID, rangoEncabezado('Compras'))
  return filas?.[0] ?? []
}

test('la fila de rótulos VIVA de Compras es exactamente la que el código tiene medida', { skip: APAGADO }, async () => {
  const vivo = await leerRotulos()
  assert.deepEqual(vivo, [...COMPRAS_1809],
    `la pestaña cambió. Actualizá COMPRAS_1809 con esto:\n${JSON.stringify(vivo, null, 2)}`)
})

test('y cada columna que el cargador escribe sigue cayendo en la letra medida', { skip: APAGADO }, async () => {
  const col = colDelCargador(contratoContra(await leerRotulos()))
  for (const [clave, letra] of Object.entries(LETRAS_1809)) {
    assert.equal(col[clave], letra, `«${clave}» se movió de ${letra} a ${col[clave]}: el cargador escribiría en la columna equivocada`)
  }
})
