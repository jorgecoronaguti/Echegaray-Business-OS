// EL EJEMPLO DEL PAPER, NÚMERO POR NÚMERO.
//
// La verificación de este módulo no es «devuelve algo razonable»: es que reproduce el caso resuelto
// que publicaron los autores —«Revoque a la cal - enlucido», 345 m², Cof 0,22 h/m², Cay 0,08 h/m²—
// con los valores que están impresos en las páginas 155 a 158. Si alguien toca una fórmula, alguno
// de estos números deja de dar y el test se pone rojo contra la fuente, no contra mi criterio.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contenidos, horasNecesarias, evaluarCuadrilla, desperdicioHorario, cuadrillasBasicas,
  cuadrillaOptima, planDeMano, contenidosDesdeComposicion, JORNADA_PAPER, RELACION_SALARIAL_PAPER,
} from './cuadrilla.mjs'

const EJEMPLO = { oficial_h_u: 0.22, ayudante_h_u: 0.08 }
const PRODUCCION = 345
const SALARIAL = RELACION_SALARIAL_PAPER.valor
const cerca = (a, b, tol, que) => assert.ok(Math.abs(a - b) <= tol, `${que}: ${a} vs ${b} esperado (tolerancia ${tol})`)

test('paper p.155: la relación ideal del ejemplo es 2,75 y el contenido total 0,30 h/m²', () => {
  const c = contenidos(EJEMPLO)
  assert.equal(c.ok, true)
  assert.equal(c.total_h_u, 0.3)
  assert.equal(c.relacionIdeal, 2.75)
})

test('paper p.155-156: 345 m² piden 103,5 h totales, 75,90 de oficial y 27,60 de ayudante', () => {
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  assert.equal(h.total_h, 103.5)
  assert.equal(h.oficial_h, 75.9)
  assert.equal(h.ayudante_h, 27.6)
})

test('paper p.157-158: la cuadrilla [5*2] da 2,02 jornadas, 15,18 h y 2,76 h de ayudante desperdiciadas', () => {
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const e = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: SALARIAL })
  assert.equal(e.jornadas, 2.02, 'columna 5: tiempo total de ejecución en jornadas')
  assert.equal(e.jornadasAyudante, 1.84, 'los 2 ayudantes necesitan 1,84 J y esperan al oficial')
  assert.equal(e.horasEjecucion, 15.18, 'columna 6')
  assert.equal(e.disponibleOficial_h, 75.9, 'columna 7')
  assert.equal(e.disponibleAyudante_h, 30.36, 'columna 8')
  assert.equal(e.desperdicioOficial_h, 0, 'columna 11: el oficial no desperdicia, es el que manda')
  assert.equal(e.desperdicioAyudante_h, 2.76, 'columna 12')
  assert.equal(e.desperdicioAyudante_j, 0.37, 'columna 14')
  cerca(e.costo_jornalesAyudante, 15.96, 0.05, 'columna 16: costo en jornales de ayudante')
})

test('paper p.158 ec. 7 y 10: el desperdicio horario de [5*2] es −0,50 h de oficial y 0,18 h de ayudante', () => {
  const d = desperdicioHorario({ oficiales: 5, ayudantes: 2 }, 2.75)
  assert.equal(d.oficial_h, -0.5, 'negativo = no hay desperdicio de oficial, hay holgura')
  cerca(d.ayudante_h, 0.18, 0.005, 'desperdicio horario de ayudante — el paper lo imprime redondeado a 2 decimales')
})

test('la verificación cruzada del paper cierra: desperdicio horario × horas de ejecución = desperdicio total', () => {
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const e = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: SALARIAL })
  const d = desperdicioHorario({ oficiales: 5, ayudantes: 2 }, 2.75)
  cerca(d.ayudante_h * e.horasEjecucion, e.desperdicioAyudante_h, 0.02, 'las dos vías tienen que dar lo mismo')
})

test('paper p.158: la cuadrilla óptima del ejemplo es [5*2]', () => {
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const r = cuadrillaOptima(h, { relacionSalarial: SALARIAL })
  assert.equal(r.estado, 'ELEGIDA')
  assert.equal(r.elegida.oficiales, 5)
  assert.equal(r.elegida.ayudantes, 2)
})

test('paper Figura 1: 49 cruces hasta 7×7, y 35 de ellos son cuadrillas básicas', () => {
  assert.equal(cuadrillasBasicas({ max: 7 }).length, 49, 'Figura 1: 7×7 cruces, múltiplos incluidos')
  const basicas = cuadrillasBasicas({ max: 7, incluirMultiplos: false })
  // 35 = la cantidad de pares (of, ay) de 1 a 7 con máximo común divisor 1. Es aritmética, no un
  // número copiado: por eso se recalcula acá en vez de escribirlo.
  const mcd = (a, b) => (b === 0 ? a : mcd(b, a % b))
  let coprimos = 0
  for (let of = 1; of <= 7; of++) for (let ay = 1; ay <= 7; ay++) if (mcd(of, ay) === 1) coprimos += 1
  assert.equal(coprimos, 35)
  assert.equal(basicas.length, 35, 'las circuladas de la Figura 1 son los pares coprimos')
  assert.ok(basicas.some((c) => c.oficiales === 3 && c.ayudantes === 2), '[3*2] es básica')
  assert.ok(!basicas.some((c) => c.oficiales === 6 && c.ayudantes === 4), '[6*4] es múltiplo entero de [3*2] y no se circula')
})

test('paper Tabla 2 (nota) y conclusión: los múltiplos ENTRAN, y se declaran como frentes en paralelo', () => {
  // «También deben tenerse en cuenta las que son múltiplos enteros de las cuadrillas básicas»
  // —nota de la Tabla 2— y la conclusión termina eligiendo la cuadrilla 9 [4*2], que es 2 × [2*1].
  const todas = cuadrillasBasicas({ max: 7 })
  const cuatroPorDos = todas.find((c) => c.oficiales === 4 && c.ayudantes === 2)
  assert.ok(cuatroPorDos, '[4*2] tiene que estar: es la cuadrilla que el paper termina recomendando')
  assert.deepEqual(cuatroPorDos.base, { oficiales: 2, ayudantes: 1 })
  assert.equal(cuatroPorDos.frentes, 2, 'son 2 cuadrillas [2*1] independientes una de otra')
})

test('una cuadrilla y su propio múltiplo NO son dos alternativas: no se declara AMBIGUO entre ellas', () => {
  // [5*2] y [10*4] cuestan exactamente lo mismo por construcción. Si el desempate mirara al de
  // al lado sin más, todo óptimo con múltiplo disponible saldría AMBIGUO — una duda inventada.
  // Con el ábaco abierto hasta 22, la relación ideal 2,75 la clava [11*4] — y [22*8] es su doble,
  // que cuesta exactamente lo mismo. Sin la regla, el desempate por costo los vería empatados y
  // devolvería AMBIGUO sobre una duda que no existe.
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const r = cuadrillaOptima(h, { relacionSalarial: SALARIAL, max: 22 })
  assert.equal(r.estado, 'ELEGIDA', r.porQue)
  // La aserción va sobre la COMPOSICIÓN, no sobre la relación: [11*4] y [22*8] tienen la misma
  // relación, así que `relacion === 2.75` pasaba igual con 30 personas trabajando. Un test que no
  // distingue lo que el cambio cambia no está probando el cambio.
  assert.equal(r.elegida.oficiales, 11)
  assert.equal(r.elegida.ayudantes, 4)
  assert.equal(r.elegida.frentes, 1, 'a igual costo gana la composición básica, no su múltiplo')
  assert.ok(r.ranking.some((c) => c.oficiales === 22 && c.ayudantes === 8), 'el múltiplo está en el ranking')
  assert.ok(r.frentesPosibles.some((f) => f.frentes === 2 && f.integrantes === 30), 'y se ofrece como decisión de obra, con su gente y sus días')
})

test('NEGATIVO: el múltiplo no puede ganar por terminar antes — cuesta lo mismo y lleva el doble de gente', () => {
  // Medido: con el desempate por duración, Cof=Cay=0,50 devolvía [7*7] —CATORCE personas— donde la
  // composición del método es [1*1]. El paper dice que los múltiplos ENTRAN a la selección, nunca
  // que se elija el mayor; y su conclusión descarta las más rápidas por no caber en el frente.
  const h = horasNecesarias(100, contenidos({ oficial_h_u: 0.5, ayudante_h_u: 0.5 }))
  const r = cuadrillaOptima(h, { relacionSalarial: SALARIAL })
  assert.equal(r.elegida.integrantes, 2, `eligió ${r.elegida.integrantes} personas: ${r.porQue}`)
  assert.equal(r.elegida.frentes, 1)
  const siete = r.frentesPosibles.find((f) => f.frentes === 7)
  assert.ok(siete && siete.integrantes === 14, 'los 7 frentes existen y se ofrecen, pero como decisión')
  assert.ok(siete.jornadas < r.elegida.jornadas, 'y se dice que terminan antes: no se esconde el dato, se deja elegir')
})

test('el frente físico sigue mandando: con un tope de gente, el múltiplo grande no entra', () => {
  const h = horasNecesarias(100, contenidos({ oficial_h_u: 0.5, ayudante_h_u: 0.5 }))
  const r = cuadrillaOptima(h, { relacionSalarial: SALARIAL, maxIntegrantes: 6 })
  assert.ok(r.elegida.integrantes <= 6)
  assert.ok(!r.frentesPosibles.some((f) => f.integrantes > 6), 'lo que no cabe no se ofrece')
})

test('SIN relación salarial no calcula: devuelve el hueco con dueño en vez de suponer una escala', () => {
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const r = cuadrillaOptima(h, {})
  assert.equal(r.estado, 'FALTA_DATO')
  assert.match(r.porQue, /paritaria UOCRA/)
  assert.equal(r.elegida, undefined)
})

test('un contenido de ayudante en 0 no se divide por cero: se declara por qué no hay relación ideal', () => {
  const c = contenidos({ oficial_h_u: 0.22, ayudante_h_u: 0 })
  assert.equal(c.ok, false)
  assert.match(c.porQue, /relación ideal/)
})

test('planDeMano encadena cantidad → HH → cuadrilla → duración en una sola llamada', () => {
  const p = planDeMano({ cantidad: PRODUCCION, unidad: 'm2', ...EJEMPLO, relacionSalarial: SALARIAL })
  assert.equal(p.estado, 'ELEGIDA')
  assert.equal(p.horas.total_h, 103.5)
  assert.equal(p.cuadrilla.oficiales, 5)
  assert.equal(p.duracion_jornadas, 2.02)
})

test('la restricción física del frente cambia la cuadrilla, como en la conclusión del paper', () => {
  // «las características físicas de las viviendas hacen imposible la implementación de las
  // cuadrillas 8, 3 y 7» — con el frente limitado a 3 personas, [5*2] deja de ser una opción.
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const r = cuadrillaOptima(h, { relacionSalarial: SALARIAL, maxIntegrantes: 3 })
  assert.equal(r.estado, 'ELEGIDA')
  assert.ok(r.elegida.integrantes <= 3)
  assert.notEqual(`${r.elegida.oficiales}*${r.elegida.ayudantes}`, '5*2')
})

test('DOS CORRIDAS IDÉNTICAS dan exactamente el mismo plan', () => {
  const uno = planDeMano({ cantidad: PRODUCCION, ...EJEMPLO, relacionSalarial: SALARIAL })
  const dos = planDeMano({ cantidad: PRODUCCION, ...EJEMPLO, relacionSalarial: SALARIAL })
  assert.deepEqual(uno, dos)
})

test('la jornada efectiva es un parámetro, no una constante escondida', () => {
  const h = horasNecesarias(PRODUCCION, contenidos(EJEMPLO))
  const conPaper = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: SALARIAL })
  const conOcho = evaluarCuadrilla({ oficiales: 5, ayudantes: 2 }, h, { relacionSalarial: SALARIAL, jornadaEfectiva_h: 8 })
  assert.equal(JORNADA_PAPER.efectiva_h, 7.5)
  assert.ok(conOcho.jornadas < conPaper.jornadas, 'una jornada más larga termina antes: si no cambia nada, el parámetro no se está usando')
})

test('los contenidos salen de la composición de la Base Maestra, y el «MO varios» se ve en vez de promediarse', () => {
  const r = contenidosDesdeComposicion([
    { tipo: 'material', nombre: 'Cal hidráulica', cantidad: 12 },
    { tipo: 'mano_obra', nombre: 'Oficial albañil', cantidad: 0.22 },
    { tipo: 'mano_obra', nombre: 'Ayudante', cantidad: 0.05 },
    { tipo: 'mano_obra', nombre: 'Peón general', cantidad: 0.03 },
    { tipo: 'mano_obra', nombre: 'MO varios', cantidad: 0.4 },
  ])
  assert.equal(r.oficial_h_u, 0.22)
  assert.equal(r.ayudante_h_u, 0.08, 'ayudante + peón son la misma categoría a los efectos del método')
  assert.equal(r.sinCategoria.length, 1)
  assert.equal(r.sinCategoria[0].nombre, 'MO varios')
})
