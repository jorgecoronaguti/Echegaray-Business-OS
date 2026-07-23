// EL CANDADO CONTRA LOS GENERADORES QUE PISAN LO QUE EL DUEÑO EDITA.
//
// POR QUÉ EXISTE (23/07). El dueño, después de dos días de arreglos: **"no estás respetando q yo
// hago ediciones en las pestañas y me las ignoras"**. Tenía razón, y era medible: la regla que él
// había pedido esa misma mañana —`respetar-ediciones.mjs`, que hace ganar SU texto sobre el mío—
// estaba construida y probada, pero la usaban **4 generadores de 19**. Los otros quince le pisaban
// los rótulos en cada corrida, y el worker corre solo cada dos horas: su edición no llegaba al día.
//
// La causa no fue que quince autores se olvidaran. Fue que la regla se aplicaba A MANO, en cada
// script, después de armar la grilla. Una regla que hay que acordarse de invocar se incumple; una
// que vive en el portón por el que pasa toda escritura, no. Por eso ahora `escribirPreservando`
// la aplica sola y por defecto.
//
// Este test cierra el último agujero: un generador que se saltee ese portón y escriba en crudo.
// Puede hacerlo —hay motivos legítimos, ver abajo— pero tiene que DECIDIRLO explícitamente, no
// heredarlo por descuido.
//
// LAS DOS SALIDAS VÁLIDAS, Y NINGUNA ES "no hice nada":
//   · llamar a `conEdicionesRespetadas(...)` antes de escribir  → respeta los textos del dueño
//   · pasar `respetar: false` con el motivo escrito al lado     → declara que esa pestaña no lleva
//     texto de nadie (los espejos _RAW: cada rótulo es el nombre de un campo del banco o de ARCA)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPTS = new URL('../scripts/', import.meta.url).pathname

/**
 * Los que leen y no escriben. No se listan por nombre suelto: se los reconoce porque no llaman a
 * ninguna API de escritura, y eso ya lo decide el propio test. Esta lista es sólo para los casos
 * en que un script escribe pero NO sobre una pestaña de negocio.
 */
const NO_SON_GENERADORES = new Set([
  // Reescribe la grilla de FORMATO (colores, anchos, bordes), no valores: no hay rótulo que pisar.
  'formato-pestanas.mjs',
])

test('todo generador que escribe una pestaña decide explícitamente qué hace con las ediciones del dueño', () => {
  const culpables = []
  for (const f of readdirSync(SCRIPTS)) {
    if (!f.endsWith('.mjs') || f.includes('.test.') || NO_SON_GENERADORES.has(f)) continue
    const src = readFileSync(join(SCRIPTS, f), 'utf8')

    // ¿Escribe VALORES en el Sheet? El formato y los merges no cuentan: no pisan texto de nadie.
    const escribe = /\b(batchUpdateValues|updateSheetValues|appendSheetValues|escribirPreservando)\s*\(/.test(src)
    if (!escribe) continue

    // Salida 1: aplica la Regla 0 a mano (o la hereda del portón, que la aplica por defecto).
    const respetaAMano = /\bconEdicionesRespetadas\s*\(/.test(src)
    const usaElPorton = /\bescribirPreservando\s*\(/.test(src)
    // Salida 2: la apagó a propósito. Se exige que esté escrito, no que se deduzca.
    const laApago = /respetar:\s*false/.test(src)
    // Escribir en crudo SIN pasar por el portón y SIN respetar a mano es el defecto que se persigue.
    const escribeEnCrudo = /\b(batchUpdateValues|updateSheetValues|appendSheetValues)\s*\(/.test(src)

    if (respetaAMano || laApago) continue
    if (usaElPorton && !escribeEnCrudo) continue   // sólo el portón: ya respeta por defecto
    if (!usaElPorton && escribeEnCrudo) culpables.push(f)
  }

  assert.deepEqual(culpables, [],
    `estos generadores escriben en el Sheet sin decidir qué pasa con lo que el dueño editó: ${culpables.join(', ')}. `
    + 'Pasá la grilla por escribirPreservando(), o llamá a conEdicionesRespetadas() antes de escribir, '
    + 'o declará respetar:false con el motivo si esa pestaña de verdad no lleva texto de una persona.')
})

test('la Regla 0 viene activa por defecto: apagarla exige escribirlo', () => {
  const lib = readFileSync(new URL('./preservar-anotaciones.mjs', import.meta.url).pathname, 'utf8')
  assert.match(lib, /respetar\s*=\s*true/,
    'escribirPreservando tiene que respetar las ediciones POR DEFECTO. Si el default fuera false, '
    + 'volveríamos al problema original: quince generadores que no la aplican porque nadie se acordó.')
})
