// LA LÍNEA BASE SÓLO LA MUEVE `sellarBaseline`. NADIE MÁS.
//
// Es la regla dura del módulo de obras: `inicio_base`/`fin_base` son el plan aprobado, y el desvío
// de plazo de toda la empresa se mide contra ellos. Si la edición de una actividad —o el avance, o
// el archivado— escribiera también la base, cada replanificación dejaría el desvío en cero y el
// tablero diría para siempre que la obra va en fecha. El daño no se ve: no hay error, no hay
// excepción, sólo un número que deja de significar algo.
//
// Por eso se prueba sobre el CÓDIGO y no sobre el resultado de una llamada: lo que hay que impedir
// es que alguien agregue la columna al `update` de la acción equivocada. Un test que escribiera y
// leyera contra la base pasaría igual mientras nadie sellara, que es justo el estado de hoy —0 de
// 344 actividades tienen línea base—, y no protegería nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(
  new URL('../../src/features/obras/services/actions.ts', import.meta.url),
  'utf8',
)

/**
 * El cuerpo de una acción exportada: de su firma hasta la línea `}` que la cierra.
 *
 * Se corta en la llave de cierre a nivel cero y no en el `export` siguiente, porque entre una acción
 * y la otra hay comentarios: arrastrar el docblock del vecino haría que este test fallara por una
 * palabra escrita en un comentario, y un test que acusa al archivo equivocado se termina borrando.
 */
function cuerpoDe(nombre) {
  const desde = FUENTE.indexOf(`export async function ${nombre}(`)
  assert.notEqual(desde, -1, `no existe la acción ${nombre}`)
  const fin = FUENTE.indexOf('\n}\n', desde)
  assert.notEqual(fin, -1, `no encontré el final de ${nombre}`)
  return FUENTE.slice(desde, fin)
}

const COLUMNAS_DE_BASE = ['inicio_base', 'fin_base', 'sellada_en']

// Todo lo que escribe sobre una actividad y NO es el sellado.
const NO_SELLAN = ['crearActividad', 'editarActividad', 'registrarAvance', 'marcarHito', 'archivarActividad']

for (const accion of NO_SELLAN) {
  test(`${accion} no toca la linea base`, () => {
    const cuerpo = cuerpoDe(accion)
    for (const col of COLUMNAS_DE_BASE) {
      assert.ok(
        !cuerpo.includes(col),
        `${accion} menciona «${col}»: la línea base sólo la escribe sellarBaseline`,
      )
    }
  })
}

test('editarActividad SI escribe el plan: es lo que tiene que mover', () => {
  const cuerpo = cuerpoDe('editarActividad')
  assert.ok(cuerpo.includes('inicio_plan'), 'la edición mueve el plan')
  assert.ok(cuerpo.includes('fin_plan'))
})

test('sellarBaseline es el unico que escribe la base, y sella una sola vez', () => {
  const cuerpo = cuerpoDe('sellarBaseline')
  for (const col of COLUMNAS_DE_BASE) {
    assert.ok(cuerpo.includes(col), `el sellado tiene que escribir «${col}»`)
  }
  // El candado: si ya hay una actividad sellada, no vuelve a sellar. Sin esto, re-sellar sería
  // gratis y el desvío volvería a cero cada vez que alguien reprograma.
  assert.ok(cuerpo.includes("not('sellada_en', 'is', null)"), 'falta el chequeo de que ya está sellada')
  assert.ok(/ya tiene línea base sellada/i.test(cuerpo), 'falta el mensaje que explica por qué no se re-sella')
})

test('la base se copia del plan en el sellado, no de un valor nuevo', () => {
  const cuerpo = cuerpoDe('sellarBaseline')
  assert.ok(
    /inicio_base:\s*a\.inicio_plan/.test(cuerpo) && /fin_base:\s*a\.fin_plan/.test(cuerpo),
    'sellar es congelar el plan de hoy, no escribir una fecha inventada',
  )
})
