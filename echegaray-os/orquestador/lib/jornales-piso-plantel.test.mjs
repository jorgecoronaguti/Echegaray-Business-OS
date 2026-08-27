// EL PISO SE PROYECTABA SOBRE OTRO PLANTEL Y CON LA ASISTENCIA EN VEZ DE LA JORNADA (27/08/2026).
//
// ═══ EL DEFECTO, MEDIDO CONTRA EL ARCHIVO VIVO ═══
//
// La pestaña «Jornales por Quincena» publicaba, el mismo día y a doce filas de distancia:
//
//   · cuadro de pago:  «Obreros · UOCRA · 17 personas · $5.916.500»
//   · cuadro 4.1:      «⇒ Plantel base — la última quincena cerrada · 15 · $80.400»
//   · calendario:      «✓ las 9 quincenas proyectadas cubren el piso UOCRA»
//
// Los tres son coherentes entre sí y los tres juntos son falsos. El término convenio de la proyección
// es `Σ$/hora × horas × días`, y DOS de esos tres factores no eran del convenio:
//
//   · el PLANTEL salía de la última quincena CERRADA (15 personas). Ochoa Eduardo y Castillo Carlos
//     entraron el 19/8 y están en la quincena en curso: dos personas en la nómina sin un peso de piso
//     proyectado. Σ $/hora de convenio: $91.424 con 15 · $103.171 con 17. −11,4%.
//   · las HORAS eran el promedio REAL medido sobre las cerradas —7,18 h/persona/día— y no la jornada.
//     Un piso construido con la asistencia deja de ser un piso: si el mes que viene la gente falta
//     más, la obligación "baja". −10,25%.
//
// Los dos factores se multiplican: el término convenio valía el 79,5% del piso. Y el control que lo
// vigilaba preguntaba sólo «¿cada categoría tiene básico?» —sí, las cuatro— o sea que se validaba con
// las dos entradas que NO miraba. Por eso firmaba el ✓ con $16,2M de faltante abajo.
//
// Si se revierte el arreglo, los tres tests de abajo se ponen rojos con el importe exacto.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bloqueDelPiso, rotuloDelPiso, formulaControlPiso, JORNADA_PISO_HORAS,
} from './jornales-piso-uocra.mjs'
import { sigmaConvenioDelPlantel, expresionHorasDeLaQuincena } from './proyeccion-convenio.mjs'
import { ESCALA_VERIFICADA } from './uocra-paritaria.mjs'
import { diasHabilesObra } from './jornales-demanda-obras.mjs'

const ESCALON = {
  categorias: Object.fromEntries(Object.entries(ESCALA_VERIFICADA)
    .map(([c, b], i) => [c, { fila: 10 + i, basico: b, zonaA: b }])),
}

// ═══ LOS DOS BLOQUES DEL ESPEJO `_J_OBREROS`, LEÍDOS EL 27/08 ═══
//
// El vigente es la quincena 17/8→31/8 (filas 527-543): 5 OF, 7 OF M, 3 A, 2 A M = 17. La última
// cerrada es la anterior y trae 15: los mismos códigos, sin Ochoa (OF) ni Castillo (A).
const VIGENTE = [['OF', 5], ['OF M', 7], ['A', 3], ['A M', 2]]
const CERRADA = [['OF', 4], ['OF M', 7], ['A', 2], ['A M', 2]]

/** El espejo como lo lee el motor: col B nombre, col D código de categoría. Dos bloques, uno tras otro. */
function espejoDeDosBloques() {
  const filas = []
  const push = (plantel) => {
    const inicio = filas.length + 1
    for (const [cod, n] of plantel) {
      for (let i = 0; i < n; i++) filas.push([null, `Persona ${filas.length + 1}`, null, cod])
    }
    return { inicio, fin: filas.length }
  }
  const cerrada = push(CERRADA)
  filas.push([]) // la fila de totales que separa un bloque del siguiente
  const vigente = push(VIGENTE)
  return { grid: filas, cerrada, vigente }
}

const personasDelBloque = (grid, b) => {
  let n = 0
  for (let r = b.inicio; r <= b.fin; r++) if (String((grid[r - 1] ?? [])[1] ?? '').trim()) n++
  return n
}

test('EL DEFECTO: el piso se medía sobre la quincena CERRADA y dejaba 2 personas de la nómina afuera', () => {
  const { grid, cerrada, vigente } = espejoDeDosBloques()
  const elegido = bloqueDelPiso({
    bloques: [cerrada, vigente], cerrada, personasDe: (b) => personasDelBloque(grid, b),
  })
  assert.equal(elegido.origen, 'vigente', 'el plantel del piso sale de la quincena EN CURSO')
  assert.equal(elegido.personas, 17)
  assert.equal(personasDelBloque(grid, cerrada), 15, 'la cerrada tenía 15: ése era el plantel proyectado')

  // La Σ $/hora al convenio, por los dos caminos. Es la diferencia que el MAX nunca vio.
  const conVigente = sigmaConvenioDelPlantel(grid, elegido.bloque, ESCALON)
  const conCerrada = sigmaConvenioDelPlantel(grid, cerrada, ESCALON)
  // 12 Oficial × $6.348 + 5 Ayudante × $5.399 = $103.171 · contra 11 × $6.348 + 4 × $5.399 = $91.424.
  assert.equal(conVigente.total, 103171)
  assert.equal(conCerrada.total, 91424)
  assert.equal(conVigente.personas, 17)
  assert.equal(conCerrada.personas, 15)
})

test('sin nadie cargado en la quincena en curso el piso VUELVE a la cerrada — y el rótulo lo dice', () => {
  const { grid, cerrada } = espejoDeDosBloques()
  const vacio = { inicio: 999, fin: 1000 }
  const elegido = bloqueDelPiso({
    bloques: [cerrada, vacio], cerrada, personasDe: (b) => personasDelBloque(grid, b),
  })
  assert.equal(elegido.origen, 'cerrada', 'un bloque abierto y sin gente no puede fijar el piso')
  assert.equal(elegido.personas, 15)
  // Y el título del cuadro no puede quedar diciendo lo del otro caso: es el dato que explica el número.
  assert.equal(rotuloDelPiso('cerrada'), 'Plantel base — última quincena cerrada')
  assert.equal(rotuloDelPiso('vigente'), 'Plantel vigente — la quincena en curso')
})

// ═══ LAS QUINCENAS PENDIENTES Y EL FACTOR DE PARITARIA, DEL CUADRO 4.2 DEL ARCHIVO VIVO ═══
const FACTOR = { 8: 1.0190, 9: 1.0384, 10: 1.0581, 11: 1.0782, 12: 1.0987 }
const d = (dia, mes) => new Date(2026, mes - 1, dia)
/** Las que se PAGAN de septiembre a diciembre: son las que arman la fila 35 del Cash Flow Mensual. */
const PENDIENTES = [
  { desde: d(27, 8), hasta: d(31, 8) },
  { desde: d(1, 9), hasta: d(15, 9) },
  { desde: d(16, 9), hasta: d(30, 9) },
  { desde: d(1, 10), hasta: d(15, 10) },
  { desde: d(16, 10), hasta: d(31, 10) },
  { desde: d(1, 11), hasta: d(15, 11) },
  { desde: d(16, 11), hasta: d(30, 11) },
  { desde: d(1, 12), hasta: d(15, 12) },
]
/** El promedio medido de las quincenas cerradas: lo que la pestaña usaba para valuar la OBLIGACIÓN. */
const HORAS_MEDIDAS = 7.18

const proyectar = (grid, bloque, horasPorDia) => PENDIENTES.map((q) => {
  const s = sigmaConvenioDelPlantel(grid, bloque, ESCALON)
  const factor = FACTOR[q.hasta.getMonth() + 1] / FACTOR[8]
  const dias = diasHabilesObra(q.desde, q.hasta)
  return { total: s.total * factor * horasPorDia * dias, dias }
})

test('EL DEFECTO, EN PESOS: la proyección valía el 79% del piso — el plantel corto y la asistencia', () => {
  const { grid, cerrada, vigente } = espejoDeDosBloques()
  const suma = (xs) => xs.reduce((a, x) => a + x.total, 0)
  // Lo que publicaba: plantel de la cerrada × horas MEDIDAS.
  const antes = suma(proyectar(grid, cerrada, HORAS_MEDIDAS))
  // La obligación: plantel VIGENTE × la jornada. Ninguna de las dos entradas se mide sobre la otra.
  const piso = suma(proyectar(grid, vigente, JORNADA_PISO_HORAS))

  assert.ok(antes < piso, 'el término convenio quedaba POR DEBAJO del piso que decía estar cubriendo')
  // $91.424/$103.171 de Σ × 7,18/8 h = 0,7953. Los dos factores se MULTIPLICAN, y por eso el agujero
  // es mayor que cualquiera de los dos por separado: −20,5% sobre la obligación del cuatrimestre.
  // (No es 15/17: la Σ pesa por categoría, y las dos altas fueron un Oficial y un Ayudante.)
  assert.equal(Number((antes / piso).toFixed(4)), 0.7953)
  // El faltante en pesos de las ocho quincenas que se PAGAN de septiembre a diciembre — el importe
  // exacto, no un umbral: un `>` se sigue cumpliendo cuando el arreglo se revierte a medias.
  assert.equal(Math.round(antes), 54_052_195)
  assert.equal(Math.round(piso), 67_963_587)
  assert.equal(Math.round(piso - antes), 13_911_393)
})

test('EL DEFECTO: la obligación se valuaba con la asistencia — las horas las decide la fecha de pago', () => {
  // Lo que se paga DENTRO del mes en curso es caja comprometida y va con las horas medidas: es lo que
  // efectivamente va a salir. Lo de después es la obligación proyectada y va con la jornada.
  const e = expresionHorasDeLaQuincena({
    celdaPago: 'C40', celdaMedidas: '$B$12', celdaJornada: '$B$13',
  })
  assert.equal(e, 'IF(AND(N(C40)>0;C40<=EOMONTH(TODAY();0));$B$12;$B$13)')
  // Sin celda de jornada se comporta como antes: las medidas y nada más.
  assert.equal(expresionHorasDeLaQuincena({ celdaPago: 'C40', celdaMedidas: '$B$12' }), '$B$12')
  // Y la frontera es UNA sola: la misma expresión que elige la base elige las horas.
  assert.ok(e.includes('EOMONTH(TODAY();0)'), 'la frontera se reclasifica sola el 1° de cada mes')
})

test('EL CONTROL YA NO SE FIRMA A SÍ MISMO: mira el plantel y las horas, no sólo los básicos', () => {
  const f = formulaControlPiso({
    celdasPersonas: '$B$79:$B$82',
    celdasBasico: '$F$79:$F$82',
    nQuincenas: 9,
    celdaPersonasPago: '$B$7',
    celdaPersonasPiso: '$B$83',
    celdaHoras: '$B$35',
    celdaJornada: '$B$36',
  })
  // Las dos preguntas que faltaban, con las celdas que las contestan por OTRO camino que el número.
  assert.ok(f.includes('N($B$7)-N($B$83)'), 'personas de la nómina contra personas del piso')
  assert.ok(f.includes('N($B$36)-N($B$35)'), 'jornada contra horas medidas')
  assert.ok(f.includes('sin piso UOCRA'), 'y dice cuántas quedaron afuera')
  // El ✓ sólo se firma cuando ninguna de las tres dispara.
  assert.ok(f.includes('✓ las 9 quincenas proyectadas cubren el piso UOCRA'))
  // Sin las celdas testigo el control es el de antes: un llamador viejo no se rompe, pero tampoco
  // hereda una firma que no puede sostener.
  const viejo = formulaControlPiso({ celdasPersonas: '$B$79:$B$82', celdasBasico: '$F$79:$F$82', nQuincenas: 9 })
  assert.ok(!viejo.includes('faltan '))
})

test('la jornada del piso es un PISO del piso, y el número está declarado — no escondido', () => {
  assert.equal(JORNADA_PISO_HORAS, 8)
  // 8 h × días hábiles de lunes a viernes son 40 h semanales: la construcción trabaja más que eso.
  // Que el límite esté escrito es lo que impide que este número se lea como "la obligación completa".
  assert.ok(JORNADA_PISO_HORAS > HORAS_MEDIDAS, 'la jornada no puede ser menor que la asistencia medida')
})
