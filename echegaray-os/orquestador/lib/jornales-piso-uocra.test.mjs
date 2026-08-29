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
  pisoDeQuincena, quincenasBajoPiso, formulaControlAumento, expresionSinEscala,
} from './jornales-piso-uocra.mjs'
import { sigmaConAumentoDelPlantel, formulaSigmaConAumento } from './proyeccion-convenio.mjs'
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
// LA TARIFA DE HOY, SINTÉTICA (29/08). Desde que la proyección es «lo de hoy + el aumento», la
// columna W del espejo entra en el número: sin ella la Σ sería sólo el aumento y este archivo estaría
// midiendo otra cosa. Los valores son del orden de los reales, no copiados del archivo vivo.
const TARIFA = { OF: 5600, 'OF M': 5200, A: 4500, 'A M': 4300 }

/** El espejo `_J_OBREROS` como lo lee el motor: col B nombre, col D categoría, col W $/hora de hoy. */
const espejo = () => {
  const filas = []
  for (const [cod, n] of PLANTEL) {
    for (let i = 0; i < n; i++) {
      const f = [null, `Persona ${filas.length + 1}`, null, cod]
      f[22] = TARIFA[cod]
      filas.push(f)
    }
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
 * LA PROYECCIÓN DE UNA QUINCENA, COMO LA ARMA LA PESTAÑA HOY: Σ$/hora CON AUMENTO × factor del mes ×
 * horas por persona y día × días laborables. SIN `MAX` contra la demanda de obras: ese MAX murió el
 * 14/08 —`formulaProyectadoQuincena` devuelve la expresión sola— porque hacía que la columna cambiara
 * de naturaleza fila por fila. El campo `demanda` de las quincenas se conserva sólo como dato
 * histórico de las fixtures; ninguna cuenta de este archivo lo usa.
 */
const proyectar = (sigma, escrito) => PENDIENTES.map((q) => {
  // EL PISO SE MIDE CONTRA LA OBLIGACIÓN, NO CONTRA LO QUE LA PESTAÑA HAYA LOGRADO RESOLVER. Ésta es
  // la parte que hace que el test sirva: si el piso saliera del MISMO `escrito` que la proyección, una
  // categoría que se cae de la resolución se caería también del piso y las dos bajarían juntas — el
  // control diría "cubre" con doce personas sin escala adentro. Es la regla del repo: un control nunca
  // se valida contra la misma información que produce.
  const obligacion = sigmaConAumentoDelPlantel(espejo(), BLOQUE, ESCALON)
  const s = sigmaConAumentoDelPlantel(espejo(), BLOQUE, ESCALON, undefined, escrito)
  const factor = FACTOR[q.hasta.getMonth() + 1] / FACTOR[8]
  const dias = diasHabilesObra(q.desde, q.hasta)
  return {
    ...q,
    porCategoria: obligacion.porCategoria,
    factor,
    horasPorDia: HORAS_POR_DIA,
    dias,
    // `sigma:false` simula la Σ apagada (réplica caída): la proyección se queda en cero y el control
    // tiene que verlo. Antes ese cero lo tapaba el MAX contra la demanda.
    proyectado: sigma ? s.total * factor * HORAS_POR_DIA * dias : 0,
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

test('EL MÍNIMO LEGAL SIGUE CUBIERTO: el aumento suma sobre la tarifa, no la reemplaza', () => {
  // ═══ QUÉ PREGUNTA CONTESTA ESTE TEST DESDE EL 29/08 ═══
  //
  // Ya no es «¿la proyección llega al 100% del convenio?» —el dueño rechazó ese criterio: el convenio
  // no reemplaza la tarifa de nadie—. Es la otra, que sigue siendo obligatoria: la masa proyectada
  // con `hoy + aumento` ($130.486/hora) ¿queda por encima del mínimo legal del plantel ($97.772/hora)?
  // Con estas tarifas sí, y con margen. Es un control INDEPENDIENTE: el piso sale de la escala y la
  // proyección de la planilla, dos fuentes distintas — si empatan, empatan por el hecho.
  const r = quincenasBajoPiso(proyectar(true, ESCRITO_VIVO))
  assert.equal(r.cortas, 0,
    `${r.cortas} quincena(s) por debajo del mínimo legal, faltan $${Math.round(r.falta).toLocaleString('es-AR')}`)
  assert.equal(Math.round(r.falta), 0)
  // Y el piso NO es cero: un control que compara contra nada siempre da verde.
  assert.ok(r.filas.every((f) => f.piso > 0), 'alguna quincena se midió contra un piso de $0')
})

test('EL CONTROL PUEDE DECIR QUE NO: con la Σ apagada, las NUEVE quincenas quedan cortas', () => {
  // UN CONTROL QUE NO SE PUEDE PONER ROJO NO ES UN CONTROL. Con la réplica caída la Σ se apaga y la
  // proyección queda en cero: las nueve tienen que aparecer cortas por el piso entero.
  //
  // Antes acá había otra medición —«sin piso de convenio faltan $28.864.019 en seis quincenas»— y las
  // otras tres «zafaban» porque el `MAX` contra la demanda de obras las tapaba. Ese MAX no existe
  // desde el 14/08, así que hoy no hay nada que tape un cero: son nueve, y eso es más honesto.
  const r = quincenasBajoPiso(proyectar(false, ESCRITO_VIVO))
  assert.equal(r.cortas, 9)
  assert.ok(r.falta > 0)
  assert.deepEqual(r.filas.slice(0, 3).map((f) => f.falta > 0), [true, true, true],
    'con la proyección en cero ninguna quincena puede estar cubierta')
})

test('el piso se abre POR CATEGORÍA, que es como el dueño preguntó', () => {
  const s = sigmaConAumentoDelPlantel(espejo(), BLOQUE, ESCALON, undefined, ESCRITO_VIVO)
  const { piso, detalle } = pisoDeQuincena({ porCategoria: s.porCategoria, factor: 1, horasPorDia: 1, dias: 1 })
  assert.equal(Math.round(piso), 97772, 'la Σ al convenio del plantel de agosto 2026')
  const porConvenio = new Map()
  for (const x of detalle) porConvenio.set(x.categoria, (porConvenio.get(x.categoria) ?? 0) + x.piso)
  // 12 personas a $6.348 (Oficial: OF y OF M) y 4 a $5.399 (Ayudante: A y A M).
  assert.equal(porConvenio.get('Oficial'), 12 * 6348)
  assert.equal(porConvenio.get('Ayudante'), 4 * 5399)
})

test('la línea de la pestaña avisa cuándo el aumento NO llega a todos, y a cuántos', () => {
  const f = formulaControlAumento({ celdasPersonas: '$B$76:$B$79', celdasBasico: '$F$76:$F$79', nQuincenas: 9 })
  assert.match(f, /9 quincenas proyectadas llevan el aumento/)
  assert.match(f, /▲/, 'la marca de alerta tiene que ser la que se dibuja en el PDF')
  assert.match(f, /SUMPRODUCT\(\$B\$76:\$B\$79;1-\(ISNUMBER\(\$F\$76:\$F\$79\)\*\(\$F\$76:\$F\$79>0\)\)\)/,
    'el control dejó de medirse sobre las dos columnas que arman la Σ')
  assert.doesNotMatch(f, /,/, 'separador es-AR')
  // Y NOMBRA EL NÚMERO CON EL QUE SE ARREGLA: cuántas personas quedaron sin escala. Un aviso que dice
  // "algo anda mal" no se puede accionar.
  assert.match(f, /persona\(s\) SIN AUMENTO/)
  // Y NINGUNA PALABRA GREMIAL: esta celda vive ARRIBA del calendario, y la pestaña prohíbe ahí
  // «convenio», «categoría», «básico», «escalón» y «paritaria» (orden de diseño del dueño).
  for (const palabra of [/convenio/i, /categor[íi]a/i, /b[áa]sico/i, /escal[óo]n/i, /paritaria/i]) {
    assert.doesNotMatch(f, palabra, 'volvió a entrar material gremial arriba del calendario')
  }
  // Ningún literal de la columna A puede pasar de 60 caracteres (`LARGO_NOTA`).
  for (const lit of f.match(/"[^"]*"/g) ?? []) {
    assert.ok(lit.length - 2 <= 60, `literal de ${lit.length - 2} caracteres en la columna A: ${lit}`)
  }
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

test('EL CONTROL SIGUE USANDO LA DEFINICIÓN COMPARTIDA DE «SIN ESCALA»', () => {
  // Las dos celdas se separaron una vez y costó la mitad del plantel: la Σ publicó $46.988 (sin «OF
  // M») mientras el control de al lado decía ✓. Que las dos citen la MISMA expresión es lo que impide
  // que vuelvan a contar historias distintas sobre el mismo plantel.
  const sinEscala = expresionSinEscala('$B$79:$B$82', '$F$79:$F$82')
  // LA Σ YA NO LLEVA ESE GUARD, Y ES UNA DECISIÓN, NO UN OLVIDO. Con un piso, una categoría sin
  // básico apagaba la Σ entera: un piso incompleto no es un piso. Con un aumento aditivo, apagarla
  // escondería lo que las otras dieciséis personas cobran HOY —que es un hecho de la planilla— por
  // una escala que falta. Lo que falta lo cuenta el control, que para eso mira las mismas dos
  // columnas y publica el número de personas.
  assert.ok(!formulaSigmaConAumento(79, 82, 83).includes(sinEscala),
    'la Σ volvió a apagarse entera por una categoría sin escala')
  assert.ok(formulaControlAumento({ celdasPersonas: '$B$79:$B$82', celdasBasico: '$F$79:$F$82', nQuincenas: 9 })
    .includes(sinEscala), 'el control dejó de usar la definición compartida de «sin escala»')
  assert.doesNotMatch(sinEscala, /,/, 'separador es-AR: una coma y las dos celdas son #ERROR!')
})

test('EL MARGEN SOBRE EL MÍNIMO LEGAL, MEDIDO — y qué pasa si la Σ se parte a la mitad', () => {
  // ═══ LA PREGUNTA, CON NÚMERO ═══
  //
  // La proyección con aumento vale $130.486/hora ($81.600 de tarifas de hoy + $48.886 de aumento) y
  // el mínimo legal del mismo plantel vale $97.772/hora. El margen es del 33,5%: el aumento no sólo
  // cubre la escala, la deja bien arriba. Eso hay que MEDIRLO y no suponerlo, porque es la única
  // razón por la que se puede publicar una masa aditiva sin revisar persona por persona.
  const conSigma = (sigma) => PENDIENTES.map((q) => {
    const obligacion = sigmaConAumentoDelPlantel(espejo(), BLOQUE, ESCALON)
    const factor = FACTOR[q.hasta.getMonth() + 1] / FACTOR[8]
    const dias = diasHabilesObra(q.desde, q.hasta)
    return {
      ...q,
      porCategoria: obligacion.porCategoria,
      factor,
      horasPorDia: HORAS_POR_DIA,
      dias,
      proyectado: sigma * factor * HORAS_POR_DIA * dias,
    }
  })

  const s = sigmaConAumentoDelPlantel(espejo(), BLOQUE, ESCALON)
  assert.equal(s.hoy, 81600, 'la tarifa de hoy de las 16 personas')
  assert.equal(s.aumento, 48886, '12 Oficiales × $3.174 + 4 Ayudantes × $2.699,50')
  assert.equal(s.total, 130486)
  // EL CONTRASTE QUE PRUEBA QUE NO ES UN PISO: valuar el plantel A LA ESCALA daría $97.772 —menos que
  // esto— porque hoy se paga por debajo del convenio. Si alguien vuelve al piso, la Σ BAJA, y por eso
  // el número que se publicaría seguiría pareciendo razonable. Este assert es el que lo agarra.
  assert.equal(s.total > 97772, true, 'la Σ con aumento tiene que ser MAYOR que valuar al convenio')
  assert.equal(Number((s.total / 97772).toFixed(3)), 1.335)

  const pleno = quincenasBajoPiso(conSigma(s.total))
  assert.equal(pleno.cortas, 0,
    `${pleno.cortas} quincena(s) por debajo del mínimo legal, faltan $${Math.round(pleno.falta).toLocaleString('es-AR')}`)
  assert.equal(pleno.filas[0].detalle.reduce((s2, x) => s2 + x.personas, 0), 16,
    'el piso se mide contra las 16 personas, no contra las que sobrevivan a un agujero')

  // Y LA MUTACIÓN: con la Σ partida a la mitad —el defecto del 14/08, una categoría que se cae— seis
  // quincenas quedan por debajo del mínimo legal. El control tiene que verlas.
  const partida = quincenasBajoPiso(conSigma(46988))
  assert.ok(partida.cortas > 0, 'con la mitad del plantel adentro el control siguió diciendo que sí')
  assert.equal(partida.cortas, 9)
})
