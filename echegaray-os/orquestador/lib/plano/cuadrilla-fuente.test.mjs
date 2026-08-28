// LA VERIFICACIÓN CONTRA LA FUENTE PRIMARIA — no contra nuestro propio código.
//
// ═══ POR QUÉ ESTE ARCHIVO ESTÁ SEPARADO DE `cuadrilla.test.mjs` ═══
//
// Aquél prueba que el módulo hace lo que el módulo dice. Éste prueba otra cosa, y es la que el
// dueño pidió: que lo que el módulo dice COINCIDA CON EL PAPER. Los números de acá abajo NO salen
// de correr nuestro código: están transcritos de la Tabla 1 del Anexo (p. 160) del PDF original,
// que es una IMAGEN y hubo que leer a ojo. Cada fila es un oráculo independiente.
//
//   Navas R. F., Ridl M. R., Torés L. (2012). «Mano de obra en la construcción: determinación de la
//   cuadrilla óptima por medio de una herramienta de simulación». Ingeniería, Revista Académica de
//   la FI-UADY, 16-2, pp 151-163, ISSN 1665-529-X.
//   Descargado el 28/08/2026 de https://www.revista.ingenieria.uady.mx/volumen16/mano.pdf
//
// Datos del ejemplo, del encabezado de la propia Tabla 1:
//   Actividad: Revoque a la cal – enlucido · Cof = 0,22 h/m² · Cay = 0,08 h/m² · γi = 2,75
//   P = 345 m² · jornada 7,50 h/J · Salarios: Oficial 40 $/h · Ayudante 34 $/h
//
// ═══ LAS TRES INCONSISTENCIAS DE LA PROPIA FUENTE ═══
//
// Verificar contra la fuente sirve para esto: se encontraron tres, y quedan anotadas porque después
// nadie se acuerda de por qué un número no cierra al último decimal.
//
//   1. La conclusión dice «el exclusivo análisis de los costos (columna 14)». Los costos son la
//      columna 16; la 14 es el desperdicio de ayudante en jornadas.
//   2. La conclusión dice que por costo la óptima es la 3 [5*2] «seguida por la 8 [7*3] y la 9
//      [4*2]». Por la propia Tabla 1, la tercera NO es la 9 ($ 4.326,30): son la 2 [3*1] y la 10
//      [6*2], empatadas en $ 4.250,40. La 9 está quinta, empatada con la 1.
//   3. La columna 15 usa la relación salarial redondeada a 1,18 mientras la columna 16 usa los
//      salarios exactos (40/34 = 1,17647). Por eso la fila 6 da 5,43 con 1,18 y 5,41 con 40/34.
//      Las dos son correctas: son dos convenciones, y la fuente las mezcla.
//
// Ninguna de las tres se «corrigió» en el código. Se declaran: la fuente dice lo que dice.
import test from 'node:test'
import assert from 'node:assert/strict'
import { contenidos, horasNecesarias, evaluarCuadrilla, cuadrillaOptima, desperdicioHorario } from './cuadrilla.mjs'

const P = 345
const COF = 0.22
const CAY = 0.08
const SALARIO_OFICIAL = 40
const SALARIO_AYUDANTE = 34
const RELACION_EXACTA = SALARIO_OFICIAL / SALARIO_AYUDANTE   // 1,17647 — la que usa la columna 16
const RELACION_IMPRESA = 1.18                                 // la que usa la columna 15

/**
 * TABLA 1 DEL ANEXO, p. 160. Transcrita de la imagen del PDF.
 * [N°, OF, AY, TN_of, TN_ay, J(col5), H(col6), TD_of(col7), TD_ay(col8), d_of h(col11),
 *  d_ay h(col12), dE Jay(col15), Costo $ (col16)]
 * Un guion de la tabla («—») se transcribe como 0: significa «no hay desperdicio de esa categoría».
 */
const TABLA_1 = Object.freeze([
  [3, 5, 2, 75.90, 27.60, 2.02, 15.18, 75.90, 30.36, 0, 2.76, 0.37, 4068.24],
  [2, 3, 1, 75.90, 27.60, 3.68, 27.60, 82.80, 27.60, 6.90, 0, 1.09, 4250.40],
  [1, 2, 1, 75.90, 27.60, 5.05, 37.95, 75.90, 37.95, 0, 10.35, 1.38, 4326.30],
  [4, 1, 1, 75.90, 27.60, 10.12, 75.90, 75.90, 75.90, 0, 48.30, 6.44, 5616.60],
  [5, 3, 2, 75.90, 27.60, 3.37, 25.30, 75.90, 50.60, 0, 23.00, 3.07, 4756.40],
  [6, 4, 1, 75.90, 27.60, 3.68, 27.60, 110.40, 27.60, 34.50, 0, 5.43, 5354.40],
  [7, 7, 2, 75.90, 27.60, 1.84, 13.80, 96.60, 27.60, 20.70, 0, 3.26, 4802.40],
  [8, 7, 3, 75.90, 27.60, 1.45, 10.84, 75.90, 32.53, 0, 4.93, 0.66, 4141.97],
  [9, 4, 2, 75.90, 27.60, 2.53, 18.98, 75.90, 37.95, 0, 10.35, 1.38, 4326.30],
  [10, 6, 2, 75.90, 27.60, 1.84, 13.80, 82.80, 27.60, 6.90, 0, 1.09, 4250.40],
])

const horas = () => horasNecesarias(P, contenidos({ oficial_h_u: COF, ayudante_h_u: CAY }))
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: nuestro ${a} vs el paper ${b} (tolerancia ${tol})`)

test('fuente p.155: los datos de entrada del ejemplo dan γi = 2,75 y Ctot = 0,30 h/m²', () => {
  const c = contenidos({ oficial_h_u: COF, ayudante_h_u: CAY })
  assert.equal(c.relacionIdeal, 2.75)
  assert.equal(c.total_h_u, 0.30)
})

test('fuente p.155-156: TN = P·C da 103,50 h totales, 75,90 de oficial y 27,60 de ayudante', () => {
  const h = horas()
  assert.equal(h.total_h, 103.5)
  assert.equal(h.oficial_h, 75.9)
  assert.equal(h.ayudante_h, 27.6)
})

test('fuente Tabla 1: las 10 filas del paper, columna por columna', () => {
  const h = horas()
  const fallas = []
  for (const [n, of_, ay, tnOf, tnAy, J, H, tdOf, tdAy, dOf, dAy, dE, costo] of TABLA_1) {
    const e = evaluarCuadrilla({ oficiales: of_, ayudantes: ay }, h, { relacionSalarial: RELACION_IMPRESA })
    const chequear = (nuestro, delPaper, tol, col) => {
      if (Math.abs(nuestro - delPaper) > tol) fallas.push(`N°${n} [${of_}*${ay}] col.${col}: nuestro ${nuestro} vs paper ${delPaper}`)
    }
    // Las columnas 3 y 4 son constantes de la producción y no dependen de la cuadrilla.
    chequear(h.oficial_h, tnOf, 0.001, '3 TN_of')
    chequear(h.ayudante_h, tnAy, 0.001, '4 TN_ay')
    chequear(e.jornadas, J, 0.011, '5 J')
    chequear(e.horasEjecucion, H, 0.02, '6 H')
    chequear(e.disponibleOficial_h, tdOf, 0.03, '7 TD_of')
    chequear(e.disponibleAyudante_h, tdAy, 0.03, '8 TD_ay')
    chequear(e.desperdicioOficial_h, dOf, 0.03, '11 d_of')
    chequear(e.desperdicioAyudante_h, dAy, 0.03, '12 d_ay')
    chequear(e.desperdicioEquivalente_j, dE, 0.011, '15 dE')
    // La columna 16 está en pesos y nuestro módulo la lleva en jornales de ayudante. Se rehace la
    // cuenta del paper con SUS salarios: TD_of · 40 + TD_ay · 34.
    const enPesos = e.disponibleOficial_h * SALARIO_OFICIAL + e.disponibleAyudante_h * SALARIO_AYUDANTE
    chequear(Math.round(enPesos * 100) / 100, costo, 0.6, '16 costo $')
  }
  assert.deepEqual(fallas, [], `la implementación no reproduce la Tabla 1:\n${fallas.join('\n')}`)
})

test('fuente p.158 ec. 7 y 10: el desperdicio horario de [5*2] es −0,50 h de oficial y 0,18 h de ayudante', () => {
  const d = desperdicioHorario({ oficiales: 5, ayudantes: 2 }, 2.75)
  cerca(d.oficial_h, -0.50, 0.001, 'd_of horario (negativo: no hay desperdicio de oficial)')
  cerca(d.ayudante_h, 0.18, 0.005, 'd_ay horario')
})

test('fuente p.158: la verificación cruzada del paper cierra — d_horario × TE = d_total', () => {
  const h = horas()
  const e = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: RELACION_IMPRESA })
  const d = desperdicioHorario({ oficiales: 5, ayudantes: 2 }, 2.75)
  cerca(d.ayudante_h * e.horasEjecucion, 2.76, 0.02, 'la propia verificación impresa en el paper')
})

test('fuente Tabla 1: el ORDEN por costo que sale de la tabla, no el que dice la conclusión', () => {
  const h = horas()
  const porCosto = TABLA_1
    .map(([n, of_, ay]) => {
      const e = evaluarCuadrilla({ oficiales: of_, ayudantes: ay }, h, { relacionSalarial: RELACION_EXACTA })
      return { n, of_, ay, pesos: Math.round((e.disponibleOficial_h * SALARIO_OFICIAL + e.disponibleAyudante_h * SALARIO_AYUDANTE) * 100) / 100 }
    })
    .sort((a, b) => a.pesos - b.pesos || a.n - b.n)
  assert.equal(porCosto[0].n, 3, 'la más barata es la 3 [5*2], como dice la conclusión')
  assert.equal(porCosto[1].n, 8, 'la segunda es la 8 [7*3], como dice la conclusión')
  // Y acá la conclusión de la fuente se contradice con su propia tabla: la tercera NO es la 9.
  assert.deepEqual([porCosto[2].n, porCosto[3].n].sort((a, b) => a - b), [2, 10], 'las terceras son la 2 y la 10, empatadas en $ 4.250,40')
  assert.deepEqual([porCosto[4].n, porCosto[5].n].sort((a, b) => a - b), [1, 9], 'la 9 está quinta, empatada con la 1 en $ 4.326,30')
})

test('fuente Tabla 2: para γi = 2,75 el intervalo 2,667–3,000 propone (2*1), (3*1) y (5*2)', () => {
  // El paper acota los candidatos por intervalo; nuestro módulo evalúa TODO el ábaco y elige por
  // costo. Las dos vías tienen que coincidir en el ganador, o una de las dos está mal.
  const h = horas()
  const delIntervalo = [[2, 1], [3, 1], [5, 2]]
    .map(([of_, ay]) => evaluarCuadrilla({ oficiales: of_, ayudantes: ay }, h, { relacionSalarial: RELACION_EXACTA }))
    .sort((a, b) => a.costo_jornalesAyudante - b.costo_jornalesAyudante)
  assert.equal(delIntervalo[0].oficiales, 5)
  assert.equal(delIntervalo[0].ayudantes, 2)

  const nuestra = cuadrillaOptima(h, { relacionSalarial: RELACION_EXACTA, max: 7 })
  assert.equal(nuestra.estado, 'ELEGIDA', nuestra.porQue)
  assert.equal(nuestra.elegida.relacion, 2.5, 'recorriendo el ábaco entero se llega a la misma composición [5*2]')
})

// ═══════════════ LOS CASOS QUE TIENEN QUE FALLAR ═══════════════
//
// Un control que no puede dar rojo no es un control. Estos cinco existen para probar que los de
// arriba detectarían el error si el error estuviera.

test('NEGATIVO: con la jornada equivocada, la Tabla 1 NO cierra', () => {
  const h = horas()
  // Si alguien cambiara la jornada efectiva a las 8,00 h nominales, las jornadas de la cuadrilla 3
  // dejarían de dar 2,02. El test de la Tabla 1 tiene que ser capaz de verlo.
  const e = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: RELACION_IMPRESA, jornadaEfectiva_h: 8 })
  assert.ok(Math.abs(e.jornadas - 2.02) > 0.011, `con jornada de 8 h da ${e.jornadas} y el paper dice 2,02: el control lo detecta`)
})

test('NEGATIVO: si se sumaran los desperdicios de las dos categorías, la columna 15 se rompería', () => {
  const h = horas()
  const e = evaluarCuadrilla({ oficiales: 4, ayudantes: 1 }, h, { relacionSalarial: RELACION_IMPRESA })
  // En la fila 6 el desperdicio es de OFICIAL. Si el módulo confundiera las categorías y devolviera
  // el de ayudante, daría 0 y el paper dice 5,43.
  assert.notEqual(e.desperdicioEquivalente_j, e.desperdicioAyudante_j)
  assert.equal(e.desperdicioAyudante_h, 0, 'la fila 6 no desperdicia ayudante')
})

test('NEGATIVO: manda el que TARDA MÁS, no el promedio — cambiarlo rompe la columna 5', () => {
  const h = horas()
  const e = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: RELACION_IMPRESA })
  const promedio = (h.oficial_h / (5 * 7.5) + h.ayudante_h / (2 * 7.5)) / 2
  assert.ok(Math.abs(promedio - 2.02) > 0.011, `el promedio da ${promedio.toFixed(3)} y el paper dice 2,02`)
  assert.equal(e.jornadas, 2.02)
})

test('NEGATIVO: sin relación salarial no hay óptima — y no se supone una', () => {
  const r = cuadrillaOptima(horas(), {})
  assert.equal(r.estado, 'FALTA_DATO')
  assert.match(r.porQue, /paritaria UOCRA/)
})

test('NEGATIVO: una cantidad que no existe no produce horas inventadas', () => {
  assert.equal(horasNecesarias(null, contenidos({ oficial_h_u: COF, ayudante_h_u: CAY })), null)
  assert.equal(horasNecesarias(-5, contenidos({ oficial_h_u: COF, ayudante_h_u: CAY })), null)
})
