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
// LAS SALIDAS VÁLIDAS, Y NINGUNA ES "no hice nada":
//   · llamar a `conEdicionesRespetadas(...)` antes de escribir  → respeta los textos del dueño
//   · pasar `respetar: false` con el motivo escrito al lado     → declara que esa pestaña no lleva
//     texto de nadie (los espejos _RAW: cada rótulo es el nombre de un campo del banco o de ARCA)
//   · escribir SÓLO vacíos con `vaciarPropio` (13/08)           → la escritura no lleva un solo
//     rótulo, así que no hay texto del dueño que pisar; lo único que hace es vaciar, y qué se vacía
//     lo decide `no-borrar.mjs` celda por celda sobre el destino que ella misma relee. Es una guarda
//     MÁS fuerte que la Regla 0, no un permiso para saltearla: por eso se exige que TODAS las
//     escrituras del archivo la lleven. Una sola llamada sin ella y el script vuelve a ser culpable.

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
  // ═══ ESCRIBE EN SU PROPIO ARCHIVO, NO EN UNA PESTAÑA DEL DUEÑO (08/09/2026) ═══
  //
  // `compras-retirar-canceladas.mjs` corre UNA VEZ, por orden del dueño, y sus únicas escrituras de
  // VALORES van a `_COMPRAS_RETIRADAS`: una pestaña oculta que crea él mismo y donde APENDA filas
  // que copió de Compras. No reescribe una grilla, no pisa una celda existente y no hay un rótulo
  // de una persona ahí adentro — la pestaña nació de esta corrida.
  //
  // LA EXCEPCIÓN NO ES UNA PROMESA: el test de abajo la comprueba leyendo el archivo. Si alguna de
  // sus escrituras de valores apuntara a otra pestaña, se pone rojo igual.
  //
  // Lo que hace sobre Compras —borrar las filas retiradas— NO es una escritura de valores: es
  // `deleteDimension`, va por `spreadsheetBatchUpdate` y esta Regla 0 nunca lo cubrió. El script se
  // guarda solo: archiva primero, RELEE el archivo y compara conteo y suma, y recién ahí borra.
  'compras-retirar-canceladas.mjs',
  // ═══ ESCRIBE EN LA COPIA QUE ACABA DE CREAR, NUNCA EN EL ARCHIVO REAL (12/09/2026) ═══
  //
  // `sheet-copia-prueba.mjs` hace `files.copy` del Flujo de Caja y siembra en ESA copia los valores de
  // las réplicas `_…` que llegan por IMPORT* —que en una copia piden autorización y quedan en #REF!—
  // para que calcule igual que el original. La pestaña que escribe nació hace un segundo y no tiene
  // una sola celda de una persona adentro: no hay edición que respetar, y `conEdicionesRespetadas`
  // sobre un archivo que se va a tirar es ceremonia.
  //
  // LA EXCEPCIÓN NO ES UNA PROMESA: el test de abajo la comprueba. Si alguna de sus escrituras de
  // valores apuntara al archivo real, se pone rojo igual.
  'sheet-copia-prueba.mjs',
])

/**
 * LA EXCEPCIÓN DE `compras-retirar-canceladas.mjs`, VERIFICADA.
 *
 * Una exención de la Regla 0 escrita en prosa es una promesa, y este repositorio ya pagó lo que
 * cuesta creerle a un comentario. Lo que la sostiene es comprobable sin red: TODAS sus escrituras
 * de valores nombran su propio archivo. El día que alguien le agregue un `updateSheetValues` sobre
 * `Compras`, la exención cae y el script vuelve a ser culpable.
 */
test('la exención del retiro de Compras se verifica: sólo escribe valores en su propio archivo', () => {
  const src = readFileSync(join(SCRIPTS, 'compras-retirar-canceladas.mjs'), 'utf8')
  const llamadas = [...src.matchAll(/\b(updateSheetValues|appendSheetValues|batchUpdateValues)\s*\(([^\n]*)/g)]
  assert.ok(llamadas.length > 0, 'el script dejó de escribir valores: sacalo de NO_SON_GENERADORES')
  const fuera = llamadas.map((m) => m[2]).filter((args) => !/ARCHIVO|_COMPRAS_RETIRADAS/.test(args))
  assert.deepEqual(fuera, [],
    'este script está exento de la Regla 0 porque sólo escribe en `_COMPRAS_RETIRADAS`. '
    + `Estas escrituras van a otra parte: ${fuera.join(' | ')}`)
})

/**
 * LA EXCEPCIÓN DE `sheet-copia-prueba.mjs`, VERIFICADA.
 *
 * Lo que la sostiene es que el primer argumento de TODA escritura de valores sea la copia recién
 * creada y nunca el id del archivo real. El día que alguien le haga sembrar el original —que es el
 * accidente que este repo ya pagó: «worktree Sheet borra la pestaña»— la exención cae.
 */
test('la exención de la copia de prueba se verifica: sólo escribe valores en la copia', () => {
  const src = readFileSync(join(SCRIPTS, 'sheet-copia-prueba.mjs'), 'utf8')
  const llamadas = [...src.matchAll(/\b(updateSheetValues|appendSheetValues|batchUpdateValues)\s*\(\s*([A-Za-z_$][\w$]*)/g)]
  assert.ok(llamadas.length > 0, 'el script dejó de escribir valores: sacalo de NO_SON_GENERADORES')
  const fuera = llamadas.map((m) => m[2]).filter((destino) => destino !== 'copia')
  assert.deepEqual(fuera, [],
    'este script está exento de la Regla 0 porque sólo escribe en la copia que acaba de crear. '
    + `Estas escrituras apuntan a otro archivo: ${fuera.join(' | ')}`)
})

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
    // Salida 3: no escribe rótulos, sólo vacía, y el vaciado lo verifica `no-borrar`. Vale sólo si
    // TODAS las escrituras del archivo llevan el pedido: una sola sin él y podría estar escribiendo
    // texto por atrás sin haber decidido nada.
    const escrituras = (src.match(/\b(batchUpdateValues|updateSheetValues|appendSheetValues)\s*\(/g) || []).length
    const conPedido = (src.match(/vaciarPropio:/g) || []).length
    const soloVacia = escrituras > 0 && conPedido >= escrituras
    // Escribir en crudo SIN pasar por el portón y SIN respetar a mano es el defecto que se persigue.
    const escribeEnCrudo = /\b(batchUpdateValues|updateSheetValues|appendSheetValues)\s*\(/.test(src)

    if (respetaAMano || laApago || soloVacia) continue
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

// ─────────────────────────────────────────────────────────────────────────────
// EL MISMO CANDADO, PARA TODOS LOS SHEETS — no sólo el Cash Flow, no sólo scripts/.
//
// POR QUÉ (23/07). El dueño: "todas las pestañas de TODOS los sheets tienen q respetar las
// modificaciones q yo hago". La Regla 0 ya se indexa por (file_id, pestaña) —lo verifica el registro
// en respetar-ediciones.mjs—, así que el mecanismo vale para CUALQUIER Sheet, no sólo el Cash Flow.
// Lo que faltaba era que el candado mirara también los escritores fuera de scripts/: un generador de
// pestañas nuevo podría nacer en lib/ o lib/tools/ y saltearse el portón sin que nadie lo viera.
//
// Los escritores de valores que NO regeneran una pestaña se listan con su MOTIVO. No es una exención
// por comodidad: cada uno o bien es una edición que pide el propio usuario (él es el editor, no hay
// texto ajeno que preservar), o la red de deshacer, o sólo formato. Un escritor nuevo que no respete
// la Regla 0 y no esté acá con su motivo hace fallar el test: obliga a DECIDIR qué es.
const LIB = new URL('./', import.meta.url).pathname
const TOOLS = new URL('./tools/', import.meta.url).pathname

const ESCRITORES_NO_GENERADORES = new Map([
  ['google.mjs', 'es el CLIENTE que DEFINE batchUpdateValues/updateSheetValues — la primitiva de escritura, no un escritor de contenido de negocio'],
  ['guarda-escritura.mjs', 'es la GUARDA CENTRAL del choke point: decide si CUALQUIER escritor puede escribir (candado+firma), no escribe contenido de negocio. Es la que hace cumplir la Regla 0/candado para todos, incluidos los crudos'],
  ['sheet-snapshot.mjs', 'red de DESHACER: restaura un snapshot guardado — sobrescritura intencional, es la marcha atrás'],
  ['drive-write.mjs', 'escritura que PIDE el usuario (drive.write, requires_approval): el dueño ES el editor, no hay edición ajena que preservar'],
  ['operaciones-sheet-tool.mjs', 'operaciones con nombre que el usuario pide y aprueba primero: edición dirigida por él, no regeneración de una pestaña'],
  ['appsheet-pedidos.mjs', 'escribe estado/alta puntual (con aprobación) en otro Sheet: write dirigido por celda, no reescribe la pestaña'],
  ['sheets-format.mjs', 'sólo FORMATO (colores/bordes/anchos), no valores: no hay rótulo que pisar'],
  ['jornales-asistencia.mjs', 'asistencia: escribe UNA celda diaria por trabajador, dirigida por el jefe de obra y confirmada por él. No regenera ninguna pestaña. Trae su propia protección, más estricta que la preservación de rótulos: relee y compara la HUELLA de cada celda antes de escribir (conflicto de concurrencia → no escribe nada), y bloquea la celda si tiene fórmula o texto. No hay rótulo ajeno que preservar: el destino es una celda numérica de horas'],
  ['jornales-fixture.mjs', 'FIXTURE de tests: su batchUpdateValues es el cliente Google FALSO en memoria (no toca ningún Sheet). Aparece acá porque el candado mira el nombre del símbolo, no si es real'],
])

test('ningún escritor de Sheets fuera de scripts/ (lib, tools) pisa ediciones sin decidirlo', () => {
  const culpables = []
  for (const dir of [LIB, TOOLS]) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.mjs') || f.includes('.test.')) continue
      const src = readFileSync(join(dir, f), 'utf8')
      // ¿Escribe VALORES en crudo? (el formato no cuenta: no pisa texto de nadie)
      const escribeEnCrudo = /\b(batchUpdateValues|updateSheetValues|appendSheetValues)\s*\(/.test(src)
      if (!escribeEnCrudo) continue
      // Respeta la Regla 0 (a mano o por el portón), o la apagó a propósito.
      const respeta = /\bconEdicionesRespetadas\s*\(/.test(src) || /\bescribirPreservando\s*\(/.test(src) || /respetar:\s*false/.test(src)
      if (respeta || ESCRITORES_NO_GENERADORES.has(f)) continue
      culpables.push(f)
    }
  }
  assert.deepEqual(culpables, [],
    `estos escritores de Sheets no respetan la Regla 0 ni están declarados como no-generadores: ${culpables.join(', ')}. `
    + 'Si regeneran el contenido de una pestaña, pasalos por escribirPreservando()/conEdicionesRespetadas(). '
    + 'Si son una edición que pide el usuario, la red de deshacer o formato, agregalos a ESCRITORES_NO_GENERADORES con el motivo.')
})
