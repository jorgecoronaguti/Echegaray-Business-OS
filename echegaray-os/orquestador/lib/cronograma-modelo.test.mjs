// EL MODELO DEL CRONOGRAMA DE LA WEB, probado contra la forma REAL de los datos.
//
// Los casos no son inventados: salen de leer `obra_actividad` en la base el 18/08/2026. Lo que se
// prueba es lo que se puede romper sin que se vea —un promedio tomado sobre el denominador
// equivocado, una cabecera colgada del grupo de arriba— y no que la función devuelva algo.
//
// Se importa el `.ts` directo: Node 24 le saca los tipos solo. La alternativa que usa
// `claves-actividad.test.mjs` —leer el archivo y reconstruir el cuerpo con `new Function`— hace
// falta cuando el módulo se comparte con un `.mjs`, y acá no se comparte con nadie.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADO_LABEL, SIN_GRUPO, agruparActividades, estadoDe, filasVisibles, haceCiclo,
} from '../../src/features/obras/services/cronograma.ts'

/** Una actividad con lo mínimo. El resto de las columnas no participan de estas decisiones. */
const act = (o) => ({
  id: o.nombre, obra_id: 'le-comedor', clave: 'x/' + o.nombre, codigo: null, codigo_padre: null,
  seccion: null, tipo: 'tarea', orden: 0, inicio_plan: null, fin_plan: null, dias_plan: null,
  inicio_real: null, fin_real: null, dias_real: null, inicio_base: null, fin_base: null, pct: null,
  estado: null, cuadrilla: null, comentario: null, editado_a_mano: false, fuente_pestana: null,
  sellada_en: null, responsable_id: null, hh_plan: null, hh_real: null, archivada: false,
  creada_en_web: false, ...o,
})

// La forma exacta de «le-comedor»: la cabecera de un grupo arrastra la `seccion` del grupo ANTERIOR.
const LE_COMEDOR = [
  act({ nombre: 'Comedor-Vestuario', tipo: 'resumen', seccion: null, codigo: '2', pct: 0, orden: 0 }),
  act({ nombre: 'Compra ceramicos', seccion: 'Comedor-Vestuario', inicio_plan: '2026-07-13', fin_plan: '2026-07-15', pct: 100, orden: 1 }),
  act({ nombre: 'Piso de goma', seccion: 'Comedor-Vestuario', inicio_plan: '2026-07-27', fin_plan: '2026-07-27', pct: 0, orden: 2 }),
  act({ nombre: 'Portones', tipo: 'resumen', seccion: 'Comedor-Vestuario', codigo: '3', orden: 3 }),
  act({ nombre: 'Puerta de baranda', seccion: 'Portones', inicio_plan: '2026-07-13', fin_plan: '2026-07-13', pct: 100, orden: 4 }),
]

test('la cabecera de un grupo NO se cuelga de la seccion que trae arrastrada', () => {
  const g = agruparActividades(LE_COMEDOR)
  assert.deepEqual(g.map((x) => x.nombre), ['Comedor-Vestuario', 'Portones'])
  // Si se agrupara por `seccion`, «Portones» caería como hija de «Comedor-Vestuario» y el
  // cronograma mostraría dos grupos donde hay dos, pero con la cabecera adentro del de arriba.
  assert.equal(g[0].hijas.length, 2, 'Comedor-Vestuario tiene DOS hijas, no tres')
  assert.equal(g[1].cabecera?.nombre, 'Portones')
  assert.equal(g[1].hijas.length, 1)
})

test('la fila de resumen se consume como cabecera y no vuelve a contarse como hija', () => {
  const [comedor] = agruparActividades(LE_COMEDOR)
  assert.ok(!comedor.hijas.some((h) => h.tipo === 'resumen'), 'ninguna hija puede ser de resumen')
  // 100 y 0 sobre DOS actividades = 50. Si la cabecera entrara al promedio serían 3 filas → 33.
  assert.equal(comedor.medidas, 2)
  assert.equal(comedor.pct, 50)
})

test('el avance guardado en la fila de resumen se ignora: en la base dice 0% con hijas al 100%', () => {
  const [comedor] = agruparActividades(LE_COMEDOR)
  assert.equal(comedor.cabecera?.pct, 0, 'el dato podrido sigue estando en la fila')
  assert.notEqual(comedor.pct, 0, 'pero el grupo NO puede publicarlo')
  assert.equal(comedor.pct, 50)
})

test('la ventana del grupo se deriva de las hijas, porque la cabecera no trae fechas', () => {
  const [comedor] = agruparActividades(LE_COMEDOR)
  assert.equal(comedor.cabecera?.inicio_plan, null)
  assert.equal(comedor.inicio, '2026-07-13')
  assert.equal(comedor.fin, '2026-07-27')
})

test('una actividad sin fecha no entra al promedio, y un grupo sin ninguna medible da null', () => {
  const g = agruparActividades([
    act({ nombre: 'A', seccion: 'PISOS', pct: 100 }),
    act({ nombre: 'B', seccion: 'PISOS', inicio_plan: '2026-07-01', pct: 40 }),
  ])
  assert.equal(g[0].medidas, 1, 'sólo la que tiene fecha se puede medir')
  assert.equal(g[0].pct, 40, 'si «A» entrara, el grupo diría 70% de un trabajo que nadie planificó')

  const sinMedir = agruparActividades([act({ nombre: 'C', seccion: 'MUROS', pct: 80 })])
  assert.equal(sinMedir[0].pct, null, 'sin fecha no hay avance medible: null, nunca 0')
  assert.equal(sinMedir[0].medidas, 0)
})

test('las actividades sin seccion van a su propio cajon, no al ultimo grupo abierto', () => {
  const g = agruparActividades([
    act({ nombre: 'A', seccion: 'PISOS' }),
    act({ nombre: 'suelta', seccion: null }),
    act({ nombre: 'B', seccion: '   ' }),
  ])
  const cajon = g.find((x) => x.clave === SIN_GRUPO)
  assert.ok(cajon, 'existe el cajón')
  assert.deepEqual(cajon.hijas.map((h) => h.nombre), ['suelta', 'B'], 'la sección en blanco también cae acá')
  assert.equal(g.find((x) => x.clave === 'PISOS').hijas.length, 1)
})

// ── ESTADO ────────────────────────────────────────────────────────────────────

test('el avance le gana a la fecha: lo terminado no se marca atrasado', () => {
  const hoy = '2026-08-18'
  const terminada = { inicio_plan: '2026-07-01', fin_plan: '2026-07-15', pct: 100 }
  assert.equal(estadoDe(terminada, hoy), 'terminada')
  // El mismo trabajo sin terminar, con la misma fecha vencida, SÍ está atrasado.
  assert.equal(estadoDe({ ...terminada, pct: 99 }, hoy), 'atrasada')
})

test('los cuatro estados restantes salen de la ventana contra hoy', () => {
  const hoy = '2026-08-18'
  assert.equal(estadoDe({ inicio_plan: null, fin_plan: null, pct: null }, hoy), 'sin_fecha')
  assert.equal(estadoDe({ inicio_plan: '2026-08-20', fin_plan: '2026-08-25', pct: 0 }, hoy), 'por_empezar')
  assert.equal(estadoDe({ inicio_plan: '2026-08-17', fin_plan: '2026-08-19', pct: 30 }, hoy), 'en_curso')
  // El borde: hoy es el último día. Todavía no está atrasada.
  assert.equal(estadoDe({ inicio_plan: '2026-08-18', fin_plan: '2026-08-18', pct: 0 }, hoy), 'en_curso')
  assert.equal(estadoDe({ inicio_plan: '2026-08-17', fin_plan: '2026-08-17', pct: 0 }, hoy), 'atrasada')
  // Un hito no tiene fin: se mide por su inicio.
  assert.equal(estadoDe({ inicio_plan: '2026-08-01', fin_plan: null, pct: 0 }, hoy), 'atrasada')
})

test('cada estado tiene rotulo, y ninguno filtra jerga al usuario', () => {
  for (const e of ['sin_fecha', 'por_empezar', 'en_curso', 'atrasada', 'terminada']) {
    assert.ok(ESTADO_LABEL[e], `falta el rótulo de ${e}`)
    assert.ok(!ESTADO_LABEL[e].includes('_'), `«${ESTADO_LABEL[e]}» parece el nombre de la columna`)
  }
})

// ── FILAS VISIBLES ────────────────────────────────────────────────────────────

test('colapsar un grupo esconde sus hijas y deja la cabecera', () => {
  const g = agruparActividades(LE_COMEDOR)
  const abiertas = filasVisibles(g, new Set())
  assert.equal(abiertas.length, 5, '2 cabeceras + 3 actividades')

  const cerrado = filasVisibles(g, new Set(['Comedor-Vestuario']))
  assert.deepEqual(
    cerrado.map((f) => (f.tipo === 'grupo' ? 'G:' + f.grupo.nombre : f.actividad.nombre)),
    ['G:Comedor-Vestuario', 'G:Portones', 'Puerta de baranda'],
  )
})

test('las claves de fila son unicas: son las que React usa para no mezclar filas', () => {
  const filas = filasVisibles(agruparActividades(LE_COMEDOR), new Set())
  assert.equal(new Set(filas.map((f) => f.clave)).size, filas.length)
})

// ── DEPENDENCIAS ──────────────────────────────────────────────────────────────

test('el circulo largo se detecta: es el que la base NO puede ver', () => {
  // A→B→C ya cargadas. La base acepta C→A sin chistar: no repite pareja y no es contra sí misma.
  const aristas = [
    { origen_id: 'A', destino_id: 'B' },
    { origen_id: 'B', destino_id: 'C' },
  ]
  assert.equal(haceCiclo(aristas, 'C', 'A'), true, 'C antes que A cierra el círculo A→B→C→A')
  assert.equal(haceCiclo(aristas, 'A', 'C'), false, 'A antes que C es un atajo válido, no un círculo')
})

test('la dependencia contra si misma tambien es un circulo', () => {
  assert.equal(haceCiclo([], 'A', 'A'), true)
})

test('dos ramas que se juntan no son un circulo', () => {
  // A→C y B→C: dos actividades habilitan la misma. Es normal y tiene que poder cargarse.
  const aristas = [{ origen_id: 'A', destino_id: 'C' }]
  assert.equal(haceCiclo(aristas, 'B', 'C'), false)
})

test('un grafo con rombo no marea al detector ni lo cuelga', () => {
  // A→B, A→C, B→D, C→D. Se visita D por dos caminos: sin marcar lo visitado, esto se va de manos.
  const aristas = [
    { origen_id: 'A', destino_id: 'B' },
    { origen_id: 'A', destino_id: 'C' },
    { origen_id: 'B', destino_id: 'D' },
    { origen_id: 'C', destino_id: 'D' },
  ]
  assert.equal(haceCiclo(aristas, 'D', 'A'), true)
  assert.equal(haceCiclo(aristas, 'A', 'D'), false)
})

test('sin ninguna seccion no se dibuja una cabecera que no agrupa nada', () => {
  const g = agruparActividades([act({ nombre: 'A' }), act({ nombre: 'B' })])
  const filas = filasVisibles(g, new Set())
  assert.equal(filas.length, 2, 'las dos actividades, sin cabecera de relleno')
  assert.ok(filas.every((f) => f.tipo === 'actividad'))
})
