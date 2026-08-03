// EL CANARIO: NINGÚN GENERADOR DEL FLUJO DE FONDOS VUELVE A ESTAMPAR LA FECHA DE SU CORRIDA.
//
// Este test no prueba una fórmula: prueba que el DEFECTO no pueda volver a entrar por otro archivo.
// Arreglar "Cheques Emitidos", "CAJA" y "Jornales" a mano no sirve de nada si el próximo generador
// —o el próximo retoque de uno de estos tres— vuelve a escribir `al ${new Date()}` en un subtítulo.
// Es barato de correr y es lo único que sostiene el arreglo en el tiempo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * Las pestañas ya convertidas. Su subtítulo TIENE que salir del dato.
 * Se listan por archivo porque es el archivo el que puede regresar.
 */
const CONVERTIDAS = [
  'orquestador/scripts/cheques-emitidos-tablero.mjs',
  'orquestador/scripts/caja-pestana.mjs',
  'orquestador/scripts/jornales-pestana.mjs',
]

/**
 * LAS EXCEPCIONES, DECLARADAS POR ESCRITO — no en silencio, que es donde se cuela el agujero.
 *
 * Estos dos SÍ estampan la fecha de la corrida, y está BIEN que lo hagan: lo que rotulan no es un
 * rango vivo de la planilla sino una marca que el OS congeló en esa corrida (la columna "Estado en el
 * OS", el cruce de conciliación de Proveedores). Una fórmula ahí no daría frescura: daría frescura
 * FALSA sobre un dato que no se mueve, que es peor que el texto honesto.
 */
const ESTAMPADO_HONESTO = [
  'orquestador/scripts/cheques-cobertura-sheet.mjs',
  'orquestador/scripts/proveedores-materiales-pestana.mjs',
]

const leer = (f) => readFile(f, 'utf8')

/**
 * El código, SIN los comentarios. Los comentarios de este repo explican por qué, y para explicar el
 * defecto hay que citarlo — este mismo archivo se acusaba a sí mismo por la línea que documenta
 * `al ${new Date()}` como lo que se sacó. Un canario que se dispara con su propia explicación se
 * termina apagando, que es la peor forma de perder un control.
 */
const sinComentarios = (src) => src
  .split('\n')
  .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
  .join('\n')

test('las pestañas convertidas NO estampan la fecha de la corrida en un rótulo "al …"', async () => {
  for (const f of CONVERTIDAS) {
    const src = sinComentarios(await leer(f))
    // El patrón exacto del defecto: un rótulo "al <algo>" interpolado en la misma expresión que un
    // reloj. Se buscan las dos formas que este repo usó (`toLocaleDateString` e `toISOString`).
    for (const m of src.matchAll(/`[^`]*\bal \$\{[^}]*\}[^`]*`/g)) {
      assert.doesNotMatch(m[0], /new Date\(\)|Date\.now\(\)/, `${f} volvió a estampar la fecha de la corrida: ${m[0].slice(0, 90)}`)
    }
  }
})

test('las pestañas convertidas construyen su subtítulo con rotuloAlDia', async () => {
  for (const f of CONVERTIDAS) {
    assert.match(await leer(f), /rotuloAlDia\(/, `${f} dejó de usar el rótulo vivo`)
  }
})

test('el rótulo vivo nunca muestra TODAY() como si fuera el corte', async () => {
  // TODAY() puede aparecer para COMPARAR (descartar el futuro, contar la antigüedad), nunca dentro
  // del TEXT() que imprime la fecha: eso sería volver a declarar la frescura del reloj.
  const src = await leer('orquestador/lib/fecha-de-frescura.mjs')
  assert.doesNotMatch(src, /TEXT\(TODAY\(\);"dd/)
})

test('las excepciones siguen siendo excepciones declaradas, y dicen por qué', async () => {
  // Si una de éstas deja de estampar, hay que sacarla de la lista: una excepción que ya no existe
  // esconde el próximo caso real detrás de un permiso que nadie revisa.
  for (const f of ESTAMPADO_HONESTO) {
    const src = await leer(f)
    assert.match(src, /new Date\(\)/, `${f} ya no estampa: sacalo de ESTAMPADO_HONESTO`)
    assert.match(src, /no es una fórmula|congel|de esa corrida|de la corrida/i,
      `${f} estampa la fecha sin decir por qué está bien que lo haga`)
  }
})

test('ningún generador nuevo se cuela: el inventario de estampados está cerrado', async () => {
  const { readdir } = await import('node:fs/promises')
  const dir = 'orquestador/scripts'
  const permitidos = new Set(ESTAMPADO_HONESTO.map((f) => f.split('/').pop()))
  const culpables = []
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.mjs') || f.includes('.test.') || permitidos.has(f)) continue
    const src = sinComentarios(await leer(`${dir}/${f}`))
    // Sólo cuenta lo que se ESCRIBE en la planilla: un console.log con la fecha del día no engaña a
    // nadie porque no queda en ninguna celda.
    for (const m of src.matchAll(/`[^`]*\bal \$\{[^}]*\}[^`]*`/g)) {
      const linea = src.slice(0, src.indexOf(m[0])).split('\n').length
      const contexto = src.split('\n').slice(linea - 2, linea + 1).join('\n')
      if (/console\.log|console\.error|console\.warn/.test(contexto)) continue
      if (/new Date\(\)|Date\.now\(\)/.test(m[0])) culpables.push(`${f}:${linea} → ${m[0].slice(0, 70)}`)
    }
  }
  assert.deepEqual(culpables, [], `hay rótulos "al …" con la fecha de la corrida:\n${culpables.join('\n')}`)
})
