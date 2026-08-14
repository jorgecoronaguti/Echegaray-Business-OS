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
  pisoDeQuincena, quincenasBajoPiso, formulaControlPiso, expresionSinEscala,
} from './jornales-piso-uocra.mjs'
import { sigmaConvenioDelPlantel, formulaSigmaConvenio } from './proyeccion-convenio.mjs'
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
  assert.match(f, /SUMPRODUCT\(\$B\$76:\$B\$79;1-\(ISNUMBER\(\$F\$76:\$F\$79\)\*\(\$F\$76:\$F\$79>0\)\)\)/,
    'el control dejó de medirse sobre las dos columnas que arman la Σ')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
  // Y NOMBRA EL NÚMERO CON EL QUE SE ARREGLA: cuántas personas quedaron sin escala. Un aviso que dice
  // "algo anda mal" no se puede accionar.
  assert.match(f, /persona\(s\) sin escala/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL FALSO POSITIVO DEL 14/08: LA CELDA QUE NO ESTABA VACÍA, ESTABA MAL
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * UN EVALUADOR MÍNIMO DE `SUMPRODUCT(P;1-(ISNUMBER(F)*(F>0)))` CON LAS REGLAS DE GOOGLE SHEETS.
 *
 * Existe porque la única forma de probar este defecto es evaluar la expresión que va a la CELDA, no
 * una copia en JS de lo que uno cree que hace. Y la regla que hace la diferencia es contraintuitiva:
 * en Sheets **un TEXTO comparado con un número da VERDADERO** (`"Banco">0` es TRUE), así que un `>0`
 * a secas deja pasar el residuo. Ese comportamiento está codificado acá abajo, y si el emisor se
 * corrige hacia una expresión que no evalúa con estas reglas, la comparación contra la fórmula
 * emitida —el `assert.equal(expr, …)` de cada caso— se pone roja.
 */
function evaluarSinEscala(expr, personas, basicos) {
  const esperada = expresionSinEscala('P', 'F')
  assert.equal(expr, esperada, 'el evaluador sólo sabe leer la expresión que este módulo emite')
  return personas.reduce((s, p, i) => {
    const b = basicos[i]
    const esNumero = typeof b === 'number'
    // `"Banco" > 0` → TRUE en Sheets; `"" > 0` → FALSE (una celda vacía se coacciona a 0).
    const mayorQueCero = esNumero ? b > 0 : String(b ?? '') !== ''
    return s + p * (1 - (esNumero ? 1 : 0) * (mayorQueCero ? 1 : 0))
  }, 0)
}

test('EL DEFECTO: una celda con la palabra "Banco" NO está vacía — el control la dejaba pasar', () => {
  const expr = expresionSinEscala('P', 'F')
  // El plantel del archivo vivo el 14/08: A M · OF M · OF · A, y «OF M» con el texto "Banco".
  const personas = [2, 8, 4, 2]
  const vivo = [5399, 'Banco', 6348, 5399]
  assert.equal(evaluarSinEscala(expr, personas, vivo), 8,
    'las 8 personas de «OF M» tienen que contar como SIN escala: es la mitad del plantel')
  // El predicado ANTERIOR —`--(F="")`— sobre estos mismos datos daba 0, y por eso la pestaña publicó
  // el ✓. Se deja medido para que la reversión sea visible, no una opinión.
  const anterior = personas.reduce((s, p, i) => s + p * (String(vivo[i] ?? '') === '' ? 1 : 0), 0)
  assert.equal(anterior, 0, 'el predicado viejo veía cero personas sin escala con 8 afuera')
})

test('el control sigue rojo con la celda VACÍA, y verde sólo con las cuatro resueltas', () => {
  const expr = expresionSinEscala('P', 'F')
  assert.equal(evaluarSinEscala(expr, [2, 8, 4, 2], [5399, '', 6348, 5399]), 8, 'vacía = sin escala')
  assert.equal(evaluarSinEscala(expr, [2, 8, 4, 2], [5399, 0, 6348, 5399]), 8,
    'un básico en 0 es una escala que el mes no trajo, no una escala de $0')
  assert.equal(evaluarSinEscala(expr, [2, 8, 4, 2], [5399, 6348, 6348, 5399]), 0,
    'con las cuatro categorías resueltas el control tiene que dar verde')
  // Una categoría sin NADIE no puede encender la alerta: no hay persona sin escala.
  assert.equal(evaluarSinEscala(expr, [2, 0, 4, 2], [5399, 'Banco', 6348, 5399]), 0)
})

test('LA Σ DEL CONVENIO Y EL CONTROL PREGUNTAN LO MISMO — una sola definición', () => {
  // Las dos celdas se separaron una vez y costó la mitad del plantel: la Σ publicó $46.988 (sin «OF
  // M») mientras el control de al lado decía ✓. Que las dos citen la MISMA expresión es lo que impide
  // que vuelvan a contar historias distintas sobre el mismo plantel.
  const sinEscala = expresionSinEscala('$B$79:$B$82', '$F$79:$F$82')
  assert.ok(formulaSigmaConvenio(79, 82).includes(sinEscala),
    'el guard de la Σ dejó de usar la definición compartida de «sin escala»')
  assert.ok(formulaControlPiso({ celdasPersonas: '$B$79:$B$82', celdasBasico: '$F$79:$F$82', nQuincenas: 9 })
    .includes(sinEscala), 'el control del piso dejó de usar la definición compartida')
  assert.doesNotMatch(sinEscala, /,/, 'separador es-AR: una coma y las dos celdas son #ERROR!')
})

test('EL RECÁLCULO: la Σ partida dejó SEIS quincenas cortas por $23.754.205', () => {
  // ═══ LA PREGUNTA QUE ABRIÓ ESTA TAREA, CON NÚMERO ═══
  //
  // Una vez que la Σ deja de estar partida a la mitad, ¿el piso sigue cerrando? La respuesta no es
  // obvia: con «OF M» adentro la Σ pasa de $46.988 a $97.772, así que el piso de CADA quincena se
  // duplica y hay que medirlo, no suponerlo.
  //
  // Lo que la pestaña publica hoy en «Obreros» son $84.868.442 hasta diciembre. Contra el piso del
  // plantel COMPLETO faltan $23.754.205 repartidos en las seis quincenas de octubre a diciembre; las
  // tres de agosto y septiembre zafan porque la demanda de las obras vendidas es más alta que el
  // convenio, no porque el piso se estuviera aplicando. (Con las 7,2020 h/día exactas que mide la
  // pestaña en vez de las 7,20 declaradas acá arriba, el faltante da $23.762.470: el criterio no
  // cambia, la cifra se mueve $8k.)
  //
  // No son los $28.864.019 del hueco de ayer: aquél medía la proyección SIN ningún término de
  // convenio, y éste mide una Σ a medias. Dos defectos distintos sobre la misma celda.
  const SIGMA_PUBLICADA = 2 * 5399 + 8 * 0 + 4 * 6348 + 2 * 5399 // F80="Banco" vale 0 en SUMPRODUCT
  assert.equal(SIGMA_PUBLICADA, 46988, 'la Σ que la pestaña publicaba el 14/08 en F90')

  const conSigma = (sigma) => PENDIENTES.map((q) => {
    const obligacion = sigmaConvenioDelPlantel(espejo(), BLOQUE, ESCALON)
    const factor = FACTOR[q.hasta.getMonth() + 1] / FACTOR[8]
    const dias = diasHabilesObra(q.desde, q.hasta)
    return {
      ...q,
      porCategoria: obligacion.porCategoria,
      factor,
      horasPorDia: HORAS_POR_DIA,
      dias,
      proyectado: Math.max(sigma * factor * HORAS_POR_DIA * dias, q.demanda),
    }
  })

  const publicado = quincenasBajoPiso(conSigma(SIGMA_PUBLICADA))
  assert.equal(publicado.cortas, 6)
  assert.equal(Math.round(publicado.falta), 23754205)
  assert.deepEqual(publicado.filas.slice(0, 3).map((f) => Math.round(f.falta)), [0, 0, 0],
    'agosto y septiembre los cubre la demanda de obras, no el convenio')

  // Y con la Σ del plantel completo el MAX cubre el piso POR CONSTRUCCIÓN: ninguna queda corta.
  const pleno = quincenasBajoPiso(conSigma(97772))
  assert.equal(pleno.cortas, 0,
    `${pleno.cortas} quincena(s) cortas con el plantel completo, faltan $${Math.round(pleno.falta).toLocaleString('es-AR')}`)
  assert.equal(pleno.filas[0].detalle.reduce((s, x) => s + x.personas, 0), 16,
    'el piso se mide contra las 16 personas, no contra las 8 que sobrevivían al agujero')
})
