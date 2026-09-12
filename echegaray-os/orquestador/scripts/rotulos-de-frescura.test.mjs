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
  // "Cheques Emitidos" construye su grilla en la lib desde el rediseño del 06/08 (el script quedó con
  // lo que sólo se puede hacer contra Google). El canario apunta a donde vive el RÓTULO, que es lo que
  // puede regresar; el script sigue vigilado abajo por el test que prohíbe estampar la fecha.
  'orquestador/lib/cheques-emitidos-cabecera.mjs',
  // CAJA construye su grilla en la lib desde el rediseño del 05/08 (el script quedó con lo que sólo se
  // puede hacer contra Google). El canario apunta a donde vive el RÓTULO, que es lo que puede regresar;
  // el script sigue vigilado abajo por el test que prohíbe estampar la fecha de la corrida.
  'orquestador/lib/caja-grilla.mjs',
  'orquestador/scripts/impuestos-pestana.mjs',
  'orquestador/scripts/cargas-sociales-pestana.mjs',
]

/**
 * LAS DE FUENTES MIXTAS — las que NO pueden resumir su frescura en una sola fecha.
 *
 * Cruzan una fuente viva (ARCA, el extracto, Compras) con una congelada (el F931 y las DDJJ de IIBB,
 * que salen de PDF del data room y se quedan en el último período presentado). Acá el `MAX` es peor
 * que el texto estampado: le presta la fecha de la viva a la congelada y el dueño lee como fresco un
 * número que tiene un mes y medio. Tienen que declarar cada fuente por separado.
 */
const FUENTES_MIXTAS = [
  'orquestador/scripts/impuestos-pestana.mjs',
  'orquestador/scripts/cargas-sociales-pestana.mjs',
]

/**
 * LAS EXCEPCIONES, DECLARADAS POR ESCRITO — no en silencio, que es donde se cuela el agujero.
 *
 * Estos dos SÍ estampan la fecha de la corrida, y está BIEN que lo hagan: lo que rotulan no es un
 * rango vivo de la planilla sino una marca que el OS congeló en esa corrida (la columna "Estado en el
 * OS", el cruce de conciliación de Proveedores). Una fórmula ahí no daría frescura: daría frescura
 * FALSA sobre un dato que no se mueve, que es peor que el texto honesto.
 */
// 06/09/2026 — «proveedores-materiales-pestana.mjs» salió de acá porque dejó de estampar: el
// minimalismo extremo le sacó la glosa donde vivía la fecha congelada. Una excepción que ya no
// existe esconde el próximo caso real detrás de un permiso que nadie revisa, así que se saca.
const ESTAMPADO_HONESTO = [
  'orquestador/scripts/cheques-cobertura-sheet.mjs',
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

/** Los que ESCRIBEN una pestaña convertida sin construir su rótulo: no pueden estampar la fecha igual. */
const SOLO_ESCRITURA = [
  'orquestador/scripts/caja-pestana.mjs', 'orquestador/scripts/caja-anexo-pestana.mjs',
  // ═══ «JORNALES» BAJÓ ACÁ EL 12/09/2026: SU SUBTÍTULO YA NO TIENE FECHA (rediseño del 09/09) ═══
  //
  // Estaba en CONVERTIDAS, que exige construir el rótulo con la frescura del dato. El rediseño del
  // 09/09 —«los diseños de todas las pestañas son distintos, tenés que mejorar y unificar», y después
  // «sin subtítulo, sin explicación»— dejó la fila 2 en «Fuente: planilla JORNALES y escala UOCRA»: se
  // fue el tramo «· al 08/09» porque era una fecha que envejecía en la celda. No hay rótulo vivo que
  // exigir donde no hay fecha, y exigirlo obligaría a devolver el texto que el dueño mandó sacar — el
  // mismo error que este archivo ya se hizo a sí mismo con «Cheques Emitidos» (nota del 06/08).
  //
  // LO QUE NO SE AFLOJA: sigue en el test que prohíbe estampar la fecha de la corrida, y la cobertura
  // de la carga se declara igual, por `registrarSincronizacion` y por el log — que es lo que el
  // rediseño puso en su lugar. El test de abajo lo exige.
  'orquestador/scripts/jornales-pestana.mjs',
]

/**
 * LA FRESCURA QUE SALE DEL SUBTÍTULO TIENE QUE SALIR POR OTRO LADO, O SE PERDIÓ.
 *
 * Sacar la fecha de la celda es una decisión de diseño; dejar de saber hasta qué día llega la carga es
 * perder el control. `jornales-pestana.mjs` la declara en la corrida: si alguien saca eso también, la
 * pestaña queda sin una sola forma de decir de cuándo es su dato.
 */
test('el que sacó la fecha del subtítulo la sigue declarando en la corrida', async () => {
  const src = await leer('orquestador/scripts/jornales-pestana.mjs')
  assert.match(src, /registrarSincronizacion\(/, 'JORNALES dejó de registrar hasta dónde llega su carga')
  assert.match(src, /frescura JORNALES/, 'la corrida dejó de decir la cobertura de la planilla')
})

test('las pestañas convertidas NO estampan la fecha de la corrida en un rótulo "al …"', async () => {
  for (const f of [...CONVERTIDAS, ...SOLO_ESCRITURA]) {
    const src = sinComentarios(await leer(f))
    // El patrón exacto del defecto: un rótulo "al <algo>" interpolado en la misma expresión que un
    // reloj. Se buscan las dos formas que este repo usó (`toLocaleDateString` e `toISOString`).
    for (const m of src.matchAll(/`[^`]*\bal \$\{[^}]*\}[^`]*`/g)) {
      assert.doesNotMatch(m[0], /new Date\(\)|Date\.now\(\)/, `${f} volvió a estampar la fecha de la corrida: ${m[0].slice(0, 90)}`)
    }
  }
})

test('las pestañas convertidas construyen su subtítulo con un rótulo vivo de la lib', async () => {
  // LO QUE SE MIDE ES LA PROPIEDAD, NO EL NOMBRE DE LA FUNCIÓN (06/08). Pedía `rotuloAlDia(` o
  // `rotuloPorFuente(`, que son los DOS envoltorios de prosa de la lib. El rediseño de "Cheques
  // Emitidos" sacó la prosa del subtítulo a propósito —el rótulo quedó en "al 06/08/2026 · 12 cheques
  // vivos"— y arma la fecha con `formulaFrescuraDe(formulaUltimaFecha(…))`, que es exactamente el
  // mismo cálculo vivo sobre el dato y de la misma lib. Con el chequeo atado al envoltorio, el canario
  // habría obligado a devolver la prosa para poder pasar: un control que fuerza un defecto de diseño
  // dejó de medir lo que dice medir. La propiedad es "la fecha SALE DEL DATO", y se sigue exigiendo.
  for (const f of CONVERTIDAS) {
    assert.match(await leer(f), /rotuloAlDia\(|rotuloPorFuente\(|formulaFrescuraDe\(|formulaUltimaFecha\(/,
      `${f} dejó de usar el rótulo vivo`)
  }
})

test('las de fuentes mixtas declaran CADA fuente: un MAX le presta frescura a la congelada', async () => {
  for (const f of FUENTES_MIXTAS) {
    const src = await leer(f)
    assert.match(src, /rotuloPorFuente\(/,
      `${f} tiene fuentes con frescuras distintas y las está resumiendo en una sola fecha`)
    // Y la mensual declara su PERÍODO, no el día en que alguien bajó el PDF: una DDJJ de junio
    // presentada el 16/07 habla de junio, y decir "al 16/07" es declarar frescura de la gestión.
    assert.match(src, /formulaUltimoPeriodo\(/, `${f} no declara el período de su fuente mensual`)
  }
})

test('ninguna pestaña nueva se cuela sin control: las tres de la tanda siguen en el inventario', () => {
  // Si alguien saca una de la lista para "simplificar", el canario se cae: una pestaña que deja de
  // estar en el inventario deja de estar controlada. Lo que se exige es que esté VIGILADA, en una de
  // las dos listas — no en una en particular:
  //
  //   · CONVERTIDAS      construye su rótulo con la frescura del dato, y se le exige el rótulo vivo;
  //   · SOLO_ESCRITURA   no tiene fecha en el subtítulo, y se le exige no estampar la de la corrida.
  //
  // `jornales-pestana.mjs` pasó de la primera a la segunda el 12/09/2026 cuando el rediseño le sacó
  // el tramo «· al 08/09» del subtítulo. El inventario no se afloja: cambia de lista, y el archivo
  // sigue en los dos tests que lo miran (el de la fecha de la corrida y el de declararla en la corrida).
  const vigiladas = [...CONVERTIDAS, ...SOLO_ESCRITURA]
  for (const f of ['impuestos-pestana.mjs', 'cargas-sociales-pestana.mjs', 'jornales-pestana.mjs']) {
    assert.ok(vigiladas.some((c) => c.endsWith(f)), `${f} salió del inventario de pestañas vigiladas`)
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
