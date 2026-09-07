import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { llamadasA, celdaDeColumnaA } from '../lib/literales-de-generador.mjs'
import { esProsa, encabezadoRoto, auditarDiseno, TOPE_PROSA } from '../lib/diseno-unificado.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { grillaObras } from '../lib/obras-grilla.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { construir } from '../lib/subcontratistas/pestana.mjs'

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
    titulo: 'Nómina',
    gen: 'nomina-pestana.mjs',
    desde: 'fila(PESTANA)',
    hasta: '─── DESDE ACÁ, TODO VA A «Plantel» ───',
  },
  {
    titulo: 'Plantel',
    gen: 'nomina-pestana.mjs',
    desde: '─── DESDE ACÁ, TODO VA A «Plantel» ───',
    hasta: 'LO QUE NO SE PUEDE DECIR',
  },
  {
    // SIN CONTROL DE ENCABEZADO, Y ESTÁ DICHO POR QUÉ. «Jornales por Quincena» empuja la fila 2 como
    // centinela y le asigna la línea de procedencia MIL LÍNEAS DESPUÉS, cuando ya conoce las filas
    // del registro (`filas[fSubtitulo - 1][0] = rotuloAlDia(…)`). Leyendo el código en orden, la
    // tercera celda del archivo no es la fila 3 de la pestaña: un test de encabezado acá afirmaría
    // algo que no midió. El encabezado de esta pestaña lo sigue midiendo `auditar-diseno-unificado`
    // contra el archivo vivo, donde hoy da conforme.
    titulo: 'Jornales por Quincena',
    gen: 'jornales-pestana.mjs',
    fn: 'push',
    encabezado: false,
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

/**
 * El centinela dice «esta celda es MÍA y va vacía» y en el archivo se ve VACÍA. Sin traducirlo, el
 * auditor lee «\u0000::VACIO::\u0000» como contenido y marca dos desvíos que el lector no tiene:
 * un título acompañado y una fila 3 ocupada.
 */
const comoSeVe = (filas) => filas.map((f) => (f || []).map((c) => (c === VACIO ? '' : c)))

for (const p of PURAS) {
  test(`«${p.titulo}» cumple el contrato entero en la grilla que el generador devuelve`, () => {
    const mal = auditarDiseno(comoSeVe(p.grilla()), { pestana: p.titulo })
    assert.deepEqual(mal, [],
      mal.map((x) => `${x.col ?? ''}${x.fila} · ${x.regla} · ${x.detalle}`).join('\n'))
  })
}
