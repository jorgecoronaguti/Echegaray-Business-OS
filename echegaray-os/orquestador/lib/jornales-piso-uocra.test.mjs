// EL CONTROL QUE EL DUEÑO PIDIÓ: ¿LAS QUINCENAS PROYECTADAS CUBREN EL 100% DE LA ESCALA UOCRA?
//
// *"me aseguras que las proyecciones de aqui a fin de año de obreros se calcularon llegando a cubrir
// el 100% de lo q pide uocra en cada parte de la escala…? sino tambien hacelo"*.
//
// El 14/08 la respuesta era NO y nada lo decía. Este archivo la vuelve medible: si alguien revierte la
// corrección de la columna «Convenio», la Σ del plantel se apaga, el `MAX(convenio; demanda)` cae
// entero del lado de la demanda y seis de las nueve quincenas quedan por debajo del piso — y el test
// que sigue se pone rojo con el importe exacto.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIAS_POR_HORA, categoriaDelConvenio, expresionClaveConvenio,
  pisoDeQuincena, quincenasBajoPiso, formulaControlPiso,
} from './jornales-piso-uocra.mjs'
import { sigmaConvenioDelPlantel } from './proyeccion-convenio.mjs'
import { ESCALA_VERIFICADA } from './uocra-paritaria.mjs'
import { diasHabilesObra } from './jornales-demanda-obras.mjs'

// ═══ EL PLANTEL Y LA ESCALA REALES, LEÍDOS DEL ARCHIVO VIVO EL 14/08 ═══
//
// Bloque 4.1 de la pestaña: 2 «A M», 8 «OF M», 4 «OF», 2 «A» = 16 personas. La escala de agosto 2026,
// Zona A (San Juan), verificada contra dos fuentes el 07/08. Σ al convenio = 12 × $6.348 + 4 × $5.399
// = $97.772/hora, que es el número que la corrida imprime.
const PLANTEL = [['A M', 2], ['OF M', 8], ['OF', 4], ['A', 2]]
const ESCALON = {
  categorias: Object.fromEntries(Object.entries(ESCALA_VERIFICADA)
    .map(([c, b], i) => [c, { fila: 10 + i, basico: b, zonaA: b }])),
}
/** El espejo `_J_OBREROS` como lo lee el motor: columna B nombre, columna D código de categoría. */
const espejo = () => {
  const filas = []
  for (const [cod, n] of PLANTEL) {
    for (let i = 0; i < n; i++) filas.push([null, `Persona ${filas.length + 1}`, null, cod])
  }
  return filas
}
const BLOQUE = { inicio: 1, fin: PLANTEL.reduce((s, [, n]) => s + n, 0) }

// ═══ LO QUE HABÍA ESCRITO EN «CONVENIO (TUYA)» — BASURA DE UN LAYOUT VIEJO, NO CATEGORÍAS ═══
//
// Leído tal cual de la pestaña el 14/08. Son celdas que el generador nunca escribe (bien: son del
// dueño) y que al moverse las filas del rediseño quedaron con lo que el layout ANTERIOR tenía ahí.
const ESCRITO_VIVO = { 'A M': '46237', 'OF M': '', OF: 'Se paga el', A: '46063' }

// ═══ LAS NUEVE QUINCENAS PROYECTADAS Y SU FACTOR DE PARITARIA (cuadro 4.2 del archivo vivo) ═══
const FACTOR = { 8: 1.0190, 9: 1.0384, 10: 1.0581, 11: 1.0782, 12: 1.0987 }
const HORAS_POR_DIA = 7.20
const d = (dia, mes) => new Date(2026, mes - 1, dia)
/** Lo que la pestaña publicaba el 14/08 en la columna «Obreros»: la demanda de obras, sin piso. */
const PENDIENTES = [
  { desde: d(16, 8), hasta: d(31, 8), demanda: 18759425 },
  { desde: d(1, 9), hasta: d(15, 9), demanda: 21576937 },
  { desde: d(16, 9), hasta: d(30, 9), demanda: 19100252 },
  { desde: d(1, 10), hasta: d(15, 10), demanda: 5655120 },
  { desde: d(16, 10), hasta: d(31, 10), demanda: 3122271 },
  { desde: d(1, 11), hasta: d(15, 11), demanda: 2657724 },
  { desde: d(16, 11), hasta: d(30, 11), demanda: 2923497 },
  { desde: d(1, 12), hasta: d(15, 12), demanda: 2979043 },
  { desde: d(16, 12), hasta: d(31, 12), demanda: 2979043 },
]

/**
 * LA PROYECCIÓN DE UNA QUINCENA, COMO LA ARMA LA PESTAÑA: `MAX(convenio; demanda)`, y el convenio es
 * Σ$/hora × factor del mes × horas por persona y día × días laborables. Cuando la Σ se apaga, el
 * `IFERROR(convenio;0)` de la celda hace que el MAX resuelva SIEMPRE por la demanda — ése es el modo
 * de falla que este archivo persigue, así que se reproduce igual: con un 0, no con un error.
 */
const proyectar = (sigma, escrito) => PENDIENTES.map((q) => {
  // EL PISO SE MIDE CONTRA LA OBLIGACIÓN, NO CONTRA LO QUE LA PESTAÑA HAYA LOGRADO RESOLVER. Ésta es
  // la parte que hace que el test sirva: si el piso saliera del MISMO `escrito` que la proyección, una
  // categoría que se cae de la resolución se caería también del piso y las dos bajarían juntas — el
  // control diría "cubre" con doce personas sin escala adentro. Es la regla del repo: un control nunca
  // se valida contra la misma información que produce.
  const obligacion = sigmaConvenioDelPlantel(espejo(), BLOQUE, ESCALON)
  const s = sigmaConvenioDelPlantel(espejo(), BLOQUE, ESCALON, undefined, escrito)
  const factor = FACTOR[q.hasta.getMonth() + 1] / FACTOR[8]
  const dias = diasHabilesObra(q.desde, q.hasta)
  const convenio = sigma ? s.total * factor * HORAS_POR_DIA * dias : 0
  return {
    ...q,
    porCategoria: obligacion.porCategoria,
    factor,
    horasPorDia: HORAS_POR_DIA,
    dias,
    proyectado: Math.max(convenio, q.demanda),
  }
})

test('la basura de un layout viejo NO es una categoría: la equivalencia declarada gana', () => {
  // "46237" es un número de serie de fecha y "Se paga el" es un encabezado. Con la regla anterior
  // —`IF($E="";equivalencia;$E)`— los dos ganaban, el MATCH del básico no encontraba nada y esas
  // categorías entraban al total valuadas en $0.
  assert.deepEqual(categoriaDelConvenio('46237', 'Ayudante'),
    { categoria: 'Ayudante', origen: 'declarada', descartado: '46237' })
  assert.deepEqual(categoriaDelConvenio('Se paga el', 'Oficial'),
    { categoria: 'Oficial', origen: 'declarada', descartado: 'Se paga el' })
  // Y la celda VACÍA no descarta nada: no hay nada que avisar.
  assert.deepEqual(categoriaDelConvenio('', 'Oficial'),
    { categoria: 'Oficial', origen: 'declarada', descartado: null })
})

test('lo que el dueño escribe GANA cuando la escala lo reconoce — eso no cambió', () => {
  // La columna sigue siendo suya. Lo que se le quitó es la potestad de gobernar con un texto que la
  // escala no conoce, que no es una decisión sino un resto de otro layout.
  for (const c of CATEGORIAS_POR_HORA) {
    assert.equal(categoriaDelConvenio(c, 'Ayudante').categoria, c)
    assert.equal(categoriaDelConvenio(c, 'Ayudante').origen, 'dueño')
  }
  assert.equal(categoriaDelConvenio('  oficial  ', 'Ayudante').categoria, 'Oficial',
    'la planilla trae espacios y mayúsculas: no puede depender de cómo se tipeó')
  // El Sereno cobra por MES: no está entre las categorías por hora y no puede ganar en una columna
  // que después se multiplica por horas y días.
  assert.equal(categoriaDelConvenio('Sereno', 'Ayudante').categoria, 'Ayudante')
})

test('la fórmula dice lo MISMO que el JS: una sola regla, dos caminos', () => {
  const f = expresionClaveConvenio({ celda: '$E11', equivalencia: 'Oficial', rangoCategorias: "'_UOCRA_RAW'!$B$2:$B$5" })
  assert.equal(f, `IF(ISNUMBER(MATCH($E11;'_UOCRA_RAW'!$B$2:$B$5;0));$E11;"Oficial")`)
  // Separador es-AR: una coma acá y la celda entera es #ERROR! en este archivo.
  assert.doesNotMatch(f, /,/)
  // Sin equivalencia declarada no se inventa una: manda la celda, y el bloque dice que falta.
  assert.equal(expresionClaveConvenio({ celda: '$E11', equivalencia: null, rangoCategorias: 'x' }), '$E11')
})

test('EL CONTROL QUE EL DUEÑO PIDIÓ: ninguna quincena proyectada queda bajo el piso UOCRA', () => {
  // ═══ ÉSTE ES EL TEST QUE SE PONE ROJO SI SE REVIERTE LA CORRECCIÓN ═══
  //
  // Con la columna «Convenio» resuelta bien, la Σ del plantel vale $97.772/hora y el `MAX` garantiza
  // el piso POR CONSTRUCCIÓN. Si se vuelve a dejar ganar la basura, la Σ cae a $50.784 —sólo los 8
  // «OF M», la única categoría cuya celda estaba vacía— y seis de las nueve quincenas quedan cortas.
  const r = quincenasBajoPiso(proyectar(true, ESCRITO_VIVO))
  assert.equal(r.cortas, 0,
    `${r.cortas} quincena(s) por debajo del piso UOCRA, faltan $${Math.round(r.falta).toLocaleString('es-AR')}`)
  assert.equal(Math.round(r.falta), 0)
  // Y el piso NO es cero: un control que compara contra nada siempre da verde.
  assert.ok(r.filas.every((f) => f.piso > 0), 'alguna quincena se midió contra un piso de $0')
})

test('EL DEFECTO, MEDIDO: sin piso de convenio faltan $28.864.019 en seis quincenas', () => {
  // El estado del archivo vivo el 14/08. Es la respuesta con número a la pregunta del dueño, y queda
  // fijada acá para que nadie tenga que volver a medirla a mano.
  const r = quincenasBajoPiso(proyectar(false, ESCRITO_VIVO))
  assert.equal(r.cortas, 6)
  assert.equal(Math.round(r.falta), 28864019)
  // Las tres primeras SÍ cubrían: la demanda de las obras vendidas de agosto y septiembre es más alta
  // que el convenio. Que tres de nueve zafaran por casualidad es justamente por qué hace falta el
  // control — el total de la columna se veía sano.
  assert.deepEqual(r.filas.slice(0, 3).map((f) => Math.round(f.falta)), [0, 0, 0])
})

test('el piso se abre POR CATEGORÍA, que es como el dueño preguntó', () => {
  const s = sigmaConvenioDelPlantel(espejo(), BLOQUE, ESCALON, undefined, ESCRITO_VIVO)
  const { piso, detalle } = pisoDeQuincena({ porCategoria: s.porCategoria, factor: 1, horasPorDia: 1, dias: 1 })
  assert.equal(Math.round(piso), 97772, 'la Σ al convenio del plantel de agosto 2026')
  const porConvenio = new Map()
  for (const x of detalle) porConvenio.set(x.categoria, (porConvenio.get(x.categoria) ?? 0) + x.piso)
  // 12 personas a $6.348 (Oficial: OF y OF M) y 4 a $5.399 (Ayudante: A y A M).
  assert.equal(porConvenio.get('Oficial'), 12 * 6348)
  assert.equal(porConvenio.get('Ayudante'), 4 * 5399)
})

test('la línea de la pestaña avisa cuándo el piso NO se está aplicando, y cuántos son', () => {
  const f = formulaControlPiso({ celdasPersonas: '$B$76:$B$79', celdasBasico: '$F$76:$F$79', nQuincenas: 9 })
  assert.match(f, /9 quincenas proyectadas cubren el piso UOCRA/)
  assert.match(f, /▲/, 'la marca de alerta tiene que ser la que se dibuja en el PDF')
  assert.match(f, /SUMPRODUCT\(\$B\$76:\$B\$79;--\(\$F\$76:\$F\$79=""\)\)/,
    'el control dejó de medirse sobre las dos columnas que arman la Σ')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
  // Y NOMBRA EL NÚMERO CON EL QUE SE ARREGLA: cuántas personas quedaron sin escala. Un aviso que dice
  // "algo anda mal" no se puede accionar.
  assert.match(f, /persona\(s\) sin escala/)
})
