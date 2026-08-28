// LO QUE SE APRENDE DE UN DEFECTO NO ES SU NÚMERO.
//
// La prueba central es la del ejemplo del dueño: de «librería rotulada 0,15 % y aplicada 1 % en 55
// casos» tiene que salir «existe inconsistencia histórica frecuente entre rótulo y fórmula para
// librería», y NO «librería = 1 %». La forma de probarlo es al revés: comprobar que el candidato
// sale sin valor y que su afirmación no contiene el número aplicado.
//
// Los patrones se arman sobre hallazgos producidos por la RUTA DE PRODUCCIÓN, con .xlsx reales
// pasados por `estudiarTanda`, para que el agrupado se pruebe contra las claves y las citas que las
// reglas escriben de verdad.
import assert from 'node:assert/strict'
import test from 'node:test'
import { estudiar, libro } from './cotizacion-fixture.mjs'
import { ESTADO, PROCEDENCIA, incorporar } from './biblioteca.mjs'
import { TIPO } from './hallazgo.mjs'
import {
  AREA_APRENDIZAJE, CLASE, CLASE_POR_TIPO, ESTADO_DE_APRENDIZAJE, aCandidato, aprendizajes,
  claveDelPatron, patrones, porQueNoSeAprendeElValor, resumenDeAprendizaje,
} from './aprendizaje-cotizacion.mjs'

const RUTA = (cliente, obra, archivo) => `administracion/PRESUPUESTOS - CLIENTES/${cliente}/${obra}/${archivo}`

/** Tres cotizaciones de clientes distintos donde el rótulo de GG promete 0,6 % y la planilla aplica
 *  otra cosa: es la forma exacta del caso «librería» del dueño, en chico. */
const tresConRotuloRoto = () => [
  libro('a.xlsx', RUTA('FIMA SA', 'GALPON', 'a.xlsx'), { rotuloGG: 'Libreria (0.15 % de CD)', coeficienteGG: 0.01 }),
  libro('b.xlsx', RUTA('COLEGIO INGLES', 'AULAS', 'b.xlsx'), { rotuloGG: 'Libreria (0.15 % de CD)', coeficienteGG: 0.01 }),
  libro('c.xlsx', RUTA('ARCOR - SAN JUAN', 'NUEVA CALLE', 'c.xlsx'), { rotuloGG: 'Libreria (0.15 % de CD)', coeficienteGG: 0.01 }),
]

const hallazgosDe = async (libros) => (await estudiar(libros)).hallazgos

// ═══════════════════ EL EJEMPLO DEL DUEÑO ═══════════════════

test('de «librería 0,15 % rotulada y 1 % aplicada» sale la INCONSISTENCIA, nunca «librería = 1 %»', async () => {
  const h = await hallazgosDe(tresConRotuloRoto())
  const p = patrones(h).find((x) => x.tipo === TIPO.ROTULO_CONTRADICE_COEFICIENTE)
  assert.ok(p, 'no se detectó el patrón del rótulo contra el coeficiente')
  assert.equal(p.casos, 3)
  assert.equal(p.cotizaciones, 3)
  assert.equal(p.valorAprendido, null, 'se aprendió un valor de un defecto')

  const k = aCandidato(p)
  assert.equal(k.valor, null, 'el candidato trae un valor: alguien podría cotizar con él')
  assert.match(k.afirmacion, /existe inconsistencia histórica/)
  assert.ok(!/=\s*0?\.01\b/.test(k.afirmacion), `la afirmación publica el coeficiente aplicado: ${k.afirmacion}`)
  assert.match(k.condicion, /convertiría un error repetido en la norma de la casa/)
})

test('el aprendizaje se convierte en control: el candidato dice cuál lo detecta', async () => {
  const h = await hallazgosDe(tresConRotuloRoto())
  const k = aprendizajes(h).find((x) => x.evidencia.tipoDeHallazgo === TIPO.ROTULO_CONTRADICE_COEFICIENTE)
  assert.equal(k.evidencia.controlQueLoDetecta, 'rotulo-contra-coeficiente')
})

test('ningún candidato de aprendizaje sale con un valor: la regla vale para TODOS los tipos', async () => {
  const h = await hallazgosDe([
    ...tresConRotuloRoto(),
    libro('d.xlsx', RUTA('CLI', 'D', 'd.xlsx'), { subtotalRoto: true, coeficientesAjuste: [1.5], tareasExtra: ['#REF!'] }),
    libro('e.xlsx', RUTA('CLI', 'E', 'e.xlsx'), { subtotalRoto: true, coeficientesAjuste: [1.5], tareasExtra: ['#REF!'] }),
  ])
  const ks = aprendizajes(h)
  assert.ok(ks.length >= 2, 'no salieron candidatos suficientes para que la prueba signifique algo')
  for (const k of ks) {
    assert.equal(k.valor, null, `${k.clave} salió con un valor`)
    assert.equal(k.unidad, null)
    assert.match(k.condicion, /describe un DEFECTO/)
  }
})

// ═══════════════════ NADA ASCIENDE Y NADA SE FIRMA SOLO ═══════════════════

test('todo candidato entra INFERIDO y CANDIDATO: no se mide, se deduce, y nadie lo firmó', async () => {
  const ks = aprendizajes(await hallazgosDe(tresConRotuloRoto()))
  for (const k of ks) {
    assert.equal(k.procedencia, PROCEDENCIA.INFERIDO)
    assert.equal(k.estado, ESTADO.CANDIDATO)
    assert.equal(k.area, AREA_APRENDIZAJE)
  }
})

test('los candidatos entran a la MISMA biblioteca: no hay una segunda base de aprendizajes', async () => {
  const ks = aprendizajes(await hallazgosDe(tresConRotuloRoto()))
  const bib = incorporar({ version: 0, documentos: [], conocimientos: [], huecos: [] }, { conocimientos: ks })
  assert.equal(bib.conocimientos.length, ks.length)
  for (const k of bib.conocimientos) assert.equal(k.estado, ESTADO.CANDIDATO)
})

test('el recuento dice cuántos están pendientes: mientras nadie firme, todos', async () => {
  const ks = aprendizajes(await hallazgosDe(tresConRotuloRoto()))
  const r = resumenDeAprendizaje(ks)
  assert.equal(r.generados, ks.length)
  assert.equal(r.validados, 0)
  assert.equal(r.rechazados, 0)
  assert.equal(r.pendientes, ks.length)
})

// ═══════════════════ UNA VEZ NO ES UN PATRÓN ═══════════════════

test('un hallazgo solo NO genera candidato: una observación aislada ya está en el dataset', async () => {
  const h = await hallazgosDe([libro('a.xlsx', RUTA('CLI', 'A', 'a.xlsx'), { rotuloGG: 'Libreria (0.15 % de CD)', coeficienteGG: 0.01 })])
  assert.ok(h.some((x) => x.tipo === TIPO.ROTULO_CONTRADICE_COEFICIENTE), 'el hallazgo suelto tiene que existir igual')
  assert.deepEqual(patrones(h).filter((p) => p.tipo === TIPO.ROTULO_CONTRADICE_COEFICIENTE), [])
})

test('dos conceptos distintos no se mezclan en un patrón: el aprendizaje dice CUÁL rótulo', async () => {
  const h = await hallazgosDe([
    libro('a.xlsx', RUTA('CLI', 'A', 'a.xlsx'), { rotuloGG: 'Libreria (0.15 % de CD)', coeficienteGG: 0.01 }),
    libro('b.xlsx', RUTA('CLI', 'B', 'b.xlsx'), { rotuloGG: 'Libreria (0.15 % de CD)', coeficienteGG: 0.01 }),
    libro('c.xlsx', RUTA('CLI', 'C', 'c.xlsx'), { rotuloGG: 'Gastos contables (0.6 % de CD)', coeficienteGG: 0.04 }),
    libro('d.xlsx', RUTA('CLI', 'D', 'd.xlsx'), { rotuloGG: 'Gastos contables (0.6 % de CD)', coeficienteGG: 0.04 }),
  ])
  const ps = patrones(h).filter((p) => p.tipo === TIPO.ROTULO_CONTRADICE_COEFICIENTE)
  assert.equal(ps.length, 2, 'los dos rótulos se agruparon como uno solo')
  assert.deepEqual(ps.map((p) => p.casos), [2, 2])
  assert.notEqual(claveDelPatron(ps[0]), claveDelPatron(ps[1]))
})

test('la clave normaliza el concepto: el mismo rótulo no abre dos entradas por la capitalización', () => {
  const a = claveDelPatron({ tipo: TIPO.ROTULO_CONTRADICE_COEFICIENTE, concepto: 'Librería (0,15 % de CD)' })
  const b = claveDelPatron({ tipo: TIPO.ROTULO_CONTRADICE_COEFICIENTE, concepto: 'LIBRERIA (0,15 % DE CD)' })
  assert.equal(a, b)
})

// ═══════════════════ LAS SIETE ETIQUETAS: CINCO CLASES Y DOS ESTADOS ═══════════════════

test('las cinco clases y los dos estados están separados, no aplastados en una lista', () => {
  assert.deepEqual(Object.keys(CLASE).sort(), [
    'CONOCIMIENTO_TECNICO', 'DECISION_COMERCIAL', 'ERROR_HISTORICO', 'EXPERIENCIA_ECSAS', 'PRACTICA_HISTORICA',
  ])
  assert.equal(ESTADO_DE_APRENDIZAJE.CANDIDATO_APRENDIZAJE, ESTADO.CANDIDATO)
  assert.equal(ESTADO_DE_APRENDIZAJE.VALIDADO, ESTADO.VALIDADO)
  // Y no se cuelan como si fueran clases: un aprendizaje es ERROR_HISTORICO Y CANDIDATO a la vez.
  assert.equal('CANDIDATO_APRENDIZAJE' in CLASE, false)
  assert.equal('VALIDADO' in CLASE, false)
})

test('todo tipo de hallazgo se clasifica, y todos como ERROR_HISTORICO: un hallazgo dice que algo salió mal', () => {
  for (const t of Object.values(TIPO)) {
    assert.equal(CLASE_POR_TIPO[t], CLASE.ERROR_HISTORICO, `${t} quedó sin clase`)
  }
  assert.match(porQueNoSeAprendeElValor(TIPO.ROTULO_CONTRADICE_COEFICIENTE), /librería = 1 %/)
})

test('patrones() sobre una lista vacía devuelve una lista vacía, no una excepción', () => {
  assert.deepEqual(patrones([]), [])
  assert.deepEqual(aprendizajes([]), [])
  assert.deepEqual(resumenDeAprendizaje([]), { generados: 0, validados: 0, rechazados: 0, pendientes: 0 })
})
