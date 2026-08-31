// EL CIRCUITO DE APRENDIZAJE. Lo que se prueba acá es que PUEDE DECIR QUE NO.
//
// Hay 10 CANDIDATO en la base y ninguno atravesó el circuito completo. Un circuito que nunca
// rechazó nada no está probado: está sin ejercitar, que no es lo mismo que estar bien.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  distribucionDe, expedienteDe, promocionDe, regresionDe, ESTADO_APRENDIZAJE,
} from './aprender.mjs'

const caso = (o) => ({
  obraId: 'q', actividadId: 'a1', tareaTipoId: 't-excav', unidad: 'm3',
  hsUnitarias: 3.4, fecha: '2026-08-20', fuente: 'obra_ejecucion', confianza: 'media', ...o,
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA DISTRIBUCIÓN · un promedio que viaja solo esconde dos mediciones que se contradicen
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('con UN solo caso la dispersión es null, NO 0: una medición sola no coincide con nada', () => {
  // MUTACIÓN CORRIDA: `desvio: xs.length > 1 ? … : 0` →
  //   AssertionError: 0 !== null
  // Un cv de 0 dice «todas las mediciones coinciden» sobre una sola medición, y es el número que
  // después justifica promover un caso aislado a regla general.
  const d = distribucionDe([3.4])
  assert.equal(d.n, 1)
  assert.equal(d.desvio, null)
  assert.equal(d.cv, null)
  assert.equal(d.promedio, 3.4)
})

test('sin ningún valor la distribución es toda null, y n es 0', () => {
  const d = distribucionDe([null, undefined, 'x'])
  assert.deepEqual({ n: d.n, promedio: d.promedio, cv: d.cv }, { n: 0, promedio: null, cv: null })
})

test('dos mediciones que se contradicen dan un cv alto, y el cv viaja SIEMPRE', () => {
  const d = distribucionDe([2, 6])
  assert.equal(d.promedio, 4)
  assert.equal(d.min, 2)
  assert.equal(d.max, 6)
  assert.ok(d.cv > 0.5, `un cv de ${d.cv} tiene que gritar que las dos mediciones no se confirman`)
})

test('promedio 0 no da cv infinito ni cv 0: no hay proporción posible', () => {
  assert.equal(distribucionDe([-2, 2]).cv, null)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL EXPEDIENTE · las nueve cosas que permiten decir que no
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el expediente trae las nueve piezas y ninguna se completa sola', () => {
  const e = expedienteDe({
    clave: 'rendimiento:excavacion-manual', condicion: 'se cotiza excavación manual en m3',
    afirmacion: 'x', casos: [caso(), caso({ obraId: 'sf', actividadId: 'a2', hsUnitarias: 4.1, fecha: '2026-08-25' })],
  })
  assert.equal(e.sampleCount, 2)
  assert.deepEqual([...e.obras], ['q', 'sf'])
  assert.deepEqual([...e.unidades], ['m3'])
  assert.deepEqual(e.rangoDeFechas, { desde: '2026-08-20', hasta: '2026-08-25', casosSinFecha: 0 })
  assert.deepEqual([...e.procedencia], ['obra_ejecucion'])
  assert.equal(e.evidencia.length, 2)
  assert.ok(e.dispersion > 0)
  assert.equal(e.tipo, 'CANDIDATO', 'nace CANDIDATO SIEMPRE: el expediente no promueve')
})

test('un caso sin fecha NO recibe la de hoy: el rango declara cuántos le faltan', () => {
  // MUTACIÓN CORRIDA: `fecha: c.fecha ?? hoy` al armar `fechas` →
  //   AssertionError: 0 !== 1
  // Rellenar la fecha hace que el rango parezca completo y que un dato viejo pase por reciente.
  const e = expedienteDe({ clave: 'k', casos: [caso(), caso({ fecha: null })] })
  assert.equal(e.rangoDeFechas.casosSinFecha, 1)
  assert.equal(e.rangoDeFechas.hasta, '2026-08-20')
})

test('un expediente que mezcla unidades lo DECLARA en vez de elegir una', () => {
  const e = expedienteDe({ clave: 'k', casos: [caso(), caso({ unidad: 'm2' })] })
  assert.equal(e.unidades.length, 2, 'dos unidades no son un aprendizaje: son dos superpuestos')
})

test('un aprendizaje sin clave no se puede volver a encontrar: levanta', () => {
  assert.throws(() => expedienteDe({ casos: [caso()] }), /sin clave/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA PROMOCIÓN · el circuito tiene que poder frenar
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un caso aislado es CANDIDATO: una obra NO es una regla universal', () => {
  const p = promocionDe(caso(), [])
  assert.equal(p.estado, ESTADO_APRENDIZAJE.CANDIDATO)
  assert.equal(p.vecesConfirmado, 1)
})

test('dos casos consistentes de LA MISMA obra siguen siendo CANDIDATO', () => {
  // Comparten cuadrilla, encargado, terreno y clima: confirman menos de lo que parece.
  const p = promocionDe(caso({ actividadId: 'a2' }), [caso()])
  assert.equal(p.estado, ESTADO_APRENDIZAJE.CANDIDATO)
  assert.match(p.porQue, /misma obra/)
})

test('dos casos consistentes de OBRAS DISTINTAS sí validan — y la regla NO la decide este archivo', () => {
  const p = promocionDe(caso({ obraId: 'sf', actividadId: 'a2', hsUnitarias: 3.6 }), [caso()])
  assert.equal(p.estado, ESTADO_APRENDIZAJE.VALIDADO)
  assert.equal(p.gobernanza, 'obra-plan-real.mjs')
})

test('CONTRASTADO: se midió en otra obra y NO se confirmó — no es lo mismo que no haberlo probado', () => {
  // MUTACIÓN CORRIDA: devolver `g` tal cual sin la rama `deOtraObra` →
  //   AssertionError: 'CANDIDATO' !== 'CONTRASTADO'
  // Mezclados en un solo estado, «primer caso de la vida» y «se contradijo contra evidencia
  // independiente» van a la misma cola y nadie los separa. El segundo es una pregunta abierta.
  const p = promocionDe(caso({ obraId: 'sf', actividadId: 'a2', hsUnitarias: 9.9 }), [caso()])
  assert.equal(p.estado, ESTADO_APRENDIZAJE.CONTRASTADO)
  assert.match(p.porQue, /no se confirman entre sí/)
  assert.match(p.porQue, /la diferencia es la pregunta/)
})

test('CONTRASTADO nunca se produce solo: VALIDADO pasa tal cual y este archivo no lo fabrica', () => {
  const p = promocionDe(caso({ obraId: 'sf', actividadId: 'a2', hsUnitarias: 3.5 }), [caso()])
  assert.notEqual(p.estado, ESTADO_APRENDIZAJE.CONTRASTADO)
  assert.equal(p.estado, ESTADO_APRENDIZAJE.VALIDADO)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA REGRESIÓN · si empeora lo conocido, no se promueve
// ══════════════════════════════════════════════════════════════════════════════════════════════

const predecir = (c, v) => c.cantidad * v

test('un valor nuevo que EMPEORA los casos conocidos NO se promueve', () => {
  // MUTACIÓN CORRIDA: `promueve: true` fijo →
  //   AssertionError: true !== false
  // Una compuerta de regresión que siempre deja pasar es la constante disfrazada de control que
  // este repo ya pagó una vez.
  const r = regresionDe({
    casosConocidos: [{ cantidad: 10, real: 34 }, { cantidad: 20, real: 68 }],
    valorViejo: 3.4, valorNuevo: 9.9, predecir,
  })
  assert.equal(r.resultado, 'EMPEORA')
  assert.equal(r.promueve, false)
  assert.ok(r.errorNuevo > r.errorViejo)
  assert.match(r.porQue, /NO se promueve/)
})

test('un valor nuevo que mejora sí pasa la compuerta', () => {
  const r = regresionDe({
    casosConocidos: [{ cantidad: 10, real: 41 }, { cantidad: 20, real: 82 }],
    valorViejo: 3.4, valorNuevo: 4.1, predecir,
  })
  assert.equal(r.resultado, 'MEJORA_O_IGUAL')
  assert.equal(r.promueve, true)
  assert.equal(r.errorNuevo, 0)
})

test('sin casos conocidos la regresión NO dice «pasa»: dice SIN_REGRESION y frena', () => {
  // MUTACIÓN CORRIDA: `promueve: true` en la rama SIN_REGRESION →
  //   AssertionError: true !== false
  // No haber podido probar no es haber probado. Dejar pasar por falta de casos convierte a la
  // compuerta en un trámite: cuanto menos se sabe, más fácil se promueve.
  const r = regresionDe({ casosConocidos: [], valorViejo: 3.4, valorNuevo: 4.1, predecir })
  assert.equal(r.resultado, 'SIN_REGRESION')
  assert.equal(r.promueve, false)
})

test('casos conocidos SIN valor real no cuentan como aciertos: no hay error que comparar', () => {
  const r = regresionDe({
    casosConocidos: [{ cantidad: 10, real: null }, { cantidad: 20, real: undefined }],
    valorViejo: 3.4, valorNuevo: 4.1, predecir,
  })
  assert.equal(r.resultado, 'SIN_REGRESION')
  assert.equal(r.promueve, false)
})

test('sin referencia previa el conocimiento nuevo no empeora nada, y se dice por qué', () => {
  const r = regresionDe({ casosConocidos: [{ cantidad: 10, real: 41 }], valorViejo: null, valorNuevo: 4.1, predecir })
  assert.equal(r.resultado, 'SIN_REFERENCIA')
  assert.equal(r.promueve, true)
  assert.match(r.porQue, /no había nada/)
})
