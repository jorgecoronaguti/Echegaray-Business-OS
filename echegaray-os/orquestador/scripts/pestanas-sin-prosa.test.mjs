import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { llamadasA, celdaDeColumnaA } from '../lib/literales-de-generador.mjs'
import { esProsa, encabezadoRoto, auditarDiseno, TOPE_PROSA } from '../lib/diseno-unificado.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { grillaObras } from '../lib/obras-grilla.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { construir } from '../lib/subcontratistas/pestana.mjs'
import { grilla as grillaJornales } from './jornales-pestana.mjs'

// EL CONTRATO DE DISEÑO, MEDIDO EN EL GENERADOR Y NO EN EL ARCHIVO VIVO.
//
// ═══ POR QUÉ HACEN FALTA LOS DOS CONTROLES Y NINGUNO REEMPLAZA AL OTRO (06/09/2026) ═══
//
// `auditar-diseno-unificado.mjs` mide lo que el lector VE hoy: es la evidencia del efecto y sigue
// siendo la que cierra. Pero sólo puede bajar después de correr el pipeline contra el Sheet real, y
// eso no se hace desde un worktree —este repositorio ya perdió una pestaña entera así—. Entre el
// commit que saca la prosa y la corrida que la borra de la pestaña, el único control disponible es
// éste; y después de la corrida, es el que impide que la prosa VUELVA sin que nadie lo note.
//
// Lo que mide: los textos que cada generador manda a su primera columna, juzgados con las mismas dos
// varas del contrato —largo y argumento— que se aplican al archivo. Cuesta cero llamadas a la API.
//
// CÓMO SE AGREGA UNA PESTAÑA: se la limpia en su generador y se la anota acá. Estar en esta lista es
// la afirmación de que esa pestaña no publica una sola explicación; sacarla de la lista para que el
// test pase sería apagar el control, y el diff lo muestra.
const LIMPIAS = [
  {
    // EL TRAMO TERMINA DONDE ESTABA «Plantel». Esa pestaña se retiró el 09/09 (el dueño: «sí,
    // borrala») y con ella su entrada en esta lista; el marcador de corte sigue siendo un texto que
    // EXISTE en el generador, porque `tramo` con un `hasta` inexistente no corta nada y mediría el
    // archivo entero — un control que se afloja solo.
    titulo: 'Nómina',
    gen: 'nomina-pestana.mjs',
    desde: 'fila(PESTANA)',
    hasta: '«Plantel» SE RETIRÓ DEL ARCHIVO',
  },
]

const fuente = (gen) => readFileSync(new URL(`./${gen}`, import.meta.url), 'utf8')

/** TODAS las celdas de la columna A, SIN filtrar las vacías: el encabezado son tres filas contadas. */
function celdasDeA(src, fn = 'fila') {
  return llamadasA(src, fn).map(celdaDeColumnaA)
}

/** Las tres celdas del encabezado: A1, A2 y A3. */
const encabezadoDe = (p) => celdasDeA(tramo({ ...p, desde: p.encDesde ?? p.desde }), p.fn).slice(0, 3)

/** El tramo del generador que le corresponde a una pestaña. */
function tramo({ gen, desde, hasta }) {
  let s = fuente(gen)
  if (desde) { const i = s.indexOf(desde); if (i >= 0) s = s.slice(i) }
  if (hasta) { const i = s.indexOf(hasta); if (i >= 0) s = s.slice(0, i) }
  return s
}

for (const p of LIMPIAS) {
  test(`«${p.titulo}» no escribe una sola explicación: el porqué vive en el generador`, () => {
    const celdas = celdasDeA(tramo(p), p.fn)
    assert.ok(celdas.filter(Boolean).length >= 5, `no leí los literales de «${p.titulo}»: encontré ${celdas.length}`)
    // El encabezado se descarta POR SU TEXTO y no por posición: A1 y A2 tienen su propia regla y su
    // propio tope (`encabezadoRoto`, abajo), y en «OBRAS» ni siquiera son las primeras celdas del
    // archivo — los cuadros se escriben en funciones auxiliares definidas más arriba.
    // Sin control de encabezado no se descarta nada: la línea de procedencia de esa pestaña no se
    // escribe como literal acá, así que no hay riesgo de medirla con la vara equivocada.
    const enc = p.encabezado === false ? [] : encabezadoDe(p)
    const cuerpo = celdas.filter((t) => t && !enc.includes(t))
    const prosa = cuerpo.map((t) => [t, esProsa(t)]).filter(([, x]) => x)
    assert.deepEqual(prosa.map(([t]) => t), [],
      `volvió una explicación a «${p.titulo}» (tope ${TOPE_PROSA} car.): ${prosa.map(([t]) => t.slice(0, 70)).join(' | ')}`)
  })

  if (p.encabezado === false) continue
  test(`«${p.titulo}» arranca con las tres filas del encabezado y la tercera vacía`, () => {
    const [, procedencia, tercera] = encabezadoDe(p)
    // A1 se escribe con la constante `PESTANA` y no como literal, así que acá va el nombre: lo que se
    // juzga es la fila 2 (que declare y no argumente) y que la 3 quede libre.
    const mal = encabezadoRoto([[p.titulo], [procedencia], [tercera]], { pestana: p.titulo })
    assert.deepEqual(mal, [], mal.map((x) => `fila ${x.fila}: ${x.regla} — ${x.detalle}`).join(' | '))
  })
}

// ═══ Y CUANDO EL GENERADOR ES PURO, NO SE LEE SU CÓDIGO: SE LO CORRE ═══
//
// Leer los literales de un archivo es lo mejor que se puede hacer con un generador que necesita la
// red para armar su grilla. Cuando NO la necesita —`grillaObras` y `construir` devuelven la grilla
// con datos de muestra— hay algo estrictamente mejor: correrlo y pasarle el MISMO auditor que mide
// el archivo vivo. No se juzga una aproximación del texto: se juzga la grilla que se va a escribir,
// con sus tres filas de encabezado, su numeración de bloques y toda su prosa mire donde mire.
//
// ═══ Y SE CORRE CON DATOS, PORQUE SIN ELLOS EL CONTROL NO PUEDE DAR ROJO (06/09/2026) ═══
//
// Decía `grillaObras({})`. Medido: esa llamada devuelve VEINTISIETE filas y CERO ítems en el cuadro
// 5 —el default de `obras` es la lista vacía, no `OBRAS_FUTURAS`—, así que el test verde afirmaba
// que la pestaña no tenía prosa mirando una pestaña sin cuadro 5. Los dos desvíos que el archivo
// vivo sí tenía (`F46` y `F48`, la columna «Nota») estaban fuera de la grilla medida.
//
// La mutación lo probó: devolver la nota a la fila del cuadro 5 dejaba este test en verde. Con
// `OBRAS_FUTURAS` —las mismas obras que le pasa el script— la grilla trae sus diecisiete ítems y el
// control puede decir que no.
const PURAS = [
  { titulo: 'OBRAS', grilla: () => grillaObras({ obras: OBRAS_FUTURAS }).filas },
  { titulo: 'SUBCONTRATISTAS', grilla: () => construir().filas },
]

// ═══ «Jornales por Quincena»: SE CORRE, NO SE LEE (09/09/2026) ═══
//
// Estaba arriba en `LIMPIAS`, juzgada por los literales de su código. Eso alcanzaba cuando su grilla
// necesitaba la red; no la necesita: `grilla()` es pura y con dos bloques de muestra devuelve la
// pestaña entera —secciones, encabezados, filas y totales—. Se juzga lo que se va a ESCRIBIR.
//
// Y CON UNA VARA MÁS DURA QUE EL TOPE DE CARACTERES. El dueño no pidió «textos más cortos»: nombró
// los glifos, uno por uno. «▲ Escala vencida…», «· El jornal por hora más bajo que pagamos», «✓ los
// tres canales suman lo pagado», «⇒ El escalón que viene — sin acuerdo publicado». Cada uno es una
// celda que ARGUMENTA en una pestaña donde todo lo demás es un número o su rótulo.
const GLIFOS_PROHIBIDOS = [
  { glifo: '·', re: /^\s*·/, por: 'una glosa: la abre `sub()`, y esta pestaña no la usa más' },
  { glifo: '▲', re: /▲/, por: 'una alarma dibujada todos los días deja de significar algo el día que importa' },
  { glifo: '✓', re: /✓/, por: 'un control que repite «todo bien» en cada corrida se vuelve invisible' },
  { glifo: '⇒ El', re: /^⇒\s+(El|La|Los|Las)\b/, por: 'un total se NOMBRA; con artículo empieza a explicar' },
  { glifo: '—' + ' + explicación', re: /—\s+\S+(\s+\S+){3,}/, por: 'un rótulo con cuatro palabras después del guión ya no rotula' },
]

test('«Jornales por Quincena» no publica un solo glifo de prosa en la grilla que va a escribir', () => {
  const bloques = [{ filaFecha: 6, inicio: 7, fin: 20 }, { filaFecha: 30, inicio: 31, fin: 44 }]
  const pendientes = [{ desde: new Date(2026, 7, 1) }, { desde: new Date(2026, 7, 16) }]
  const bloquesOfi = [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }]
  const filas = comoSeVe(grillaJornales({ bloques, pendientes, bloquesOfi }).filas)
  // Que la grilla tenga tamaño es parte del control: con una grilla vacía todo pasa (es la mutación
  // que dejó verde el test de OBRAS mirando una pestaña sin su cuadro 5).
  assert.ok(filas.length > 50, `no armé la pestaña: ${filas.length} filas`)

  const malas = []
  filas.forEach((f, i) => {
    ;(f || []).forEach((celda, j) => {
      const t = String(celda ?? '').trim()
      // Las fórmulas no se juzgan por su texto: lo que rinden no está acá. Las que RINDEN prosa se
      // miden contra el archivo vivo, con `auditar-diseno-unificado`.
      if (!t || t.startsWith('=')) return
      for (const g of GLIFOS_PROHIBIDOS) {
        if (g.re.test(t)) malas.push(`${LETRA(j)}${i + 1} «${t.slice(0, 60)}» — ${g.glifo}: ${g.por}`)
      }
    })
  })
  assert.deepEqual(malas, [], `volvió la prosa a «Jornales por Quincena»:\n  ${malas.join('\n  ')}`)
})

test('y su encabezado de bloque sigue siendo el del patrón: dos secciones y cinco sub-secciones', () => {
  // Sin esto, «sacar la prosa» se podría cumplir borrando también los títulos, que son lo que hace
  // navegable la pestaña. El patrón los reconoce por su forma (`N · TÍTULO`), la misma que usan
  // «Cargas Sociales» y «Nómina».
  const bloques = [{ filaFecha: 6, inicio: 7, fin: 20 }, { filaFecha: 30, inicio: 31, fin: 44 }]
  const filas = comoSeVe(grillaJornales({
    bloques, pendientes: [{ desde: new Date(2026, 7, 1) }], bloquesOfi: [{ mes: 6, inicio: 5, fin: 8 }],
  }).filas)
  const colA = filas.map((f) => String(f[0] ?? '').trim())
  assert.deepEqual(colA.filter((c) => /^\d+ · /.test(c)).length, 2, 'la pestaña tiene DOS secciones')
  assert.deepEqual(colA.filter((c) => /^\d+\.\d+ · /.test(c)).length, 5, '1.1, 1.2, 2.1, 2.2 y 2.3')
})

/**
 * El centinela dice «esta celda es MÍA y va vacía» y en el archivo se ve VACÍA. Sin traducirlo, el
 * auditor lee «\u0000::VACIO::\u0000» como contenido y marca dos desvíos que el lector no tiene:
 * un título acompañado y una fila 3 ocupada.
 */
const comoSeVe = (filas) => filas.map((f) => (f || []).map((c) => (c === VACIO ? '' : c)))

/** La letra de una columna, para que el rojo diga la celda y no un índice. */
const LETRA = (n) => String.fromCharCode(65 + n)

for (const p of PURAS) {
  test(`«${p.titulo}» cumple el contrato entero en la grilla que el generador devuelve`, () => {
    const mal = auditarDiseno(comoSeVe(p.grilla()), { pestana: p.titulo })
    assert.deepEqual(mal, [],
      mal.map((x) => `${x.col ?? ''}${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
  })
}
