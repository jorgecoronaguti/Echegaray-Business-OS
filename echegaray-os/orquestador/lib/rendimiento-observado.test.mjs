// LOS TRES DEFECTOS QUE ESTA CONVERSIÓN PUEDE TENER, CON UNA PRUEBA CADA UNO.
//
// Las cantidades de mano de obra de T1180…T1185 salieron de acá y quedaron escritas en
// `20260828T1500_lo_que_ya_mediamos_de_estructura_metalica_se_puede_cotizar.sql`. Si esta
// conversión cambia sin que cambie la migración, las dos dejan de decir lo mismo y nadie se entera:
// por eso las nueve observaciones REALES son el fixture, y los seis resultados publicados son la
// aserción.

import test from 'node:test'
import assert from 'node:assert/strict'
import { dispersionDe, personasDe, rendimientoDeProceso, repartoDe } from './rendimiento-observado.mjs'

// Las nueve filas de `public.rendimiento_historico` que salen de «Horas Hombre.xlsm», hoja
// DESCRIPCION DE TAREAS, copiadas con sus valores reales. Cada una lleva la celda de la que salió.
const OBSERVACIONES = Object.freeze({
  T1180: [ // MONTAJE DE CMP - 6M
    { origen: 'A11:G11', hs_unitarias: 32.0,  cuadrilla: { oficial: 2, ayudante: 2 } },
    { origen: 'A6:G6',   hs_unitarias: 28.8,  cuadrilla: { oficial: 4, ayudante: 2 } },
  ],
  T1181: [{ origen: 'A7:G7', hs_unitarias: 32.0, cuadrilla: { oficial: 2, ayudante: 4 } }],
  T1182: [ // MONTAJE DE VM
    { origen: 'A5:G5', hs_unitarias: 16.0, cuadrilla: { oficial: 2, ayudante: 2 } },
    { origen: 'A8:G8', hs_unitarias: 24.0, cuadrilla: { oficial: 1, ayudante: 3 } },
  ],
  T1183: [{ origen: 'A10:H10', hs_unitarias: 3.657, cuadrilla: { oficial: 1, ayudante: 1 } }],
  T1184: [{ origen: 'A4:G4',   hs_unitarias: 10.0,  cuadrilla: { oficial: 3, ayudante: 3 } }],
  T1185: [
    { origen: 'A2:G2', hs_unitarias: 5.76,  cuadrilla: { oficial: 1, ayudante: 2 } },
    { origen: 'A3:G3', hs_unitarias: 6.261, cuadrilla: { oficial: 2, ayudante: 4 } },
  ],
})

// Exactamente lo que la migración escribe en `analisis_linea`. Si un número de acá cambia, la
// migración quedó mintiendo sobre de dónde salió el suyo.
const PUBLICADO = Object.freeze({
  T1180: { oficial: 17.6,   ayudante: 12.8,   hs: 30.4 },
  T1181: { oficial: 10.667, ayudante: 21.333, hs: 32.0 },
  T1182: { oficial: 7.0,    ayudante: 13.0,   hs: 20.0 },
  T1183: { oficial: 1.829,  ayudante: 1.829,  hs: 3.657 },
  T1184: { oficial: 5.0,    ayudante: 5.0,    hs: 10.0 },
  T1185: { oficial: 2.003,  ayudante: 4.007,  hs: 6.011 },
})

test('las nueve observaciones reales producen exactamente la composición que publicó la migración', () => {
  for (const [codigo, esperado] of Object.entries(PUBLICADO)) {
    const r = rendimientoDeProceso(OBSERVACIONES[codigo])
    assert.equal(r.porCategoria.oficial, esperado.oficial, `${codigo}: horas de oficial`)
    assert.equal(r.porCategoria.ayudante, esperado.ayudante, `${codigo}: horas de ayudante`)
    assert.equal(r.hsUnitarias, esperado.hs, `${codigo}: rendimiento`)
  }
})

test('el reparto lo hace la cuadrilla observada, no una mitad y mitad', () => {
  // EL DEFECTO: repartir 32 h entre «oficial» y «ayudante» por partes iguales cuando la observación
  // anota 2 oficiales y 4 ayudantes. Son 16/16 contra 10,667/21,333, y como el oficial cuesta
  // 6.120 $/h y el ayudante 4.452, la diferencia se va derecho al precio de la partida.
  const r = repartoDe({ hs_unitarias: 32, cuadrilla: { oficial: 2, ayudante: 4 } })
  assert.equal(Math.round(r.oficial * 1000) / 1000, 10.667)
  assert.equal(Math.round(r.ayudante * 1000) / 1000, 21.333)
  assert.notEqual(r.oficial, r.ayudante, 'repartió en partes iguales una cuadrilla que no lo era')
  assert.equal(personasDe({ oficial: 2, ayudante: 4 }), 6)
})

test('sin observaciones el rendimiento es null, y sin cuadrilla también: nunca cero', () => {
  // EL DEFECTO: devolver 0 cuando no hay con qué contestar. Un 0 se promedia, se suma y se cotiza —
  // una partida a 0 h/un sale gratis y nadie lo nota hasta que se ejecuta. Un null obliga a preguntar.
  assert.equal(rendimientoDeProceso([]), null)
  assert.equal(rendimientoDeProceso(), null)
  assert.equal(rendimientoDeProceso([{ hs_unitarias: 10 }]), null, 'publicó un rendimiento sin saber quién hizo las horas')
  assert.equal(rendimientoDeProceso([{ hs_unitarias: 0, cuadrilla: { oficial: 1 } }]), null)
  assert.equal(repartoDe({ hs_unitarias: 10, cuadrilla: {} }), null)
})

test('una sola observación no tiene dispersión — y eso no es dispersión cero', () => {
  assert.equal(dispersionDe([5]), null)
  assert.equal(dispersionDe([]), null)
  assert.equal(rendimientoDeProceso(OBSERVACIONES.T1181).dispersion, null)
  // Las dos de montaje de viga difieren 40% entre sí: la partida publica el promedio y la
  // dispersión es el aviso de que el promedio tapa algo.
  assert.equal(Math.round(dispersionDe([16, 24]) * 1000) / 1000, 0.4)
})

test('promediar procesos distintos es lo que esta separación impide', () => {
  // Si las cuatro observaciones de correa colgaran de UNA sola partida, el promedio sería 6,42 —
  // ni el armado (3,657), ni la colocación (10), ni la pintura (6,011), ni la suma de los tres
  // (19,668). Ése es el número que `rendimiento_contra_lo_cotizado` compararía contra el análisis.
  const todas = [...OBSERVACIONES.T1183, ...OBSERVACIONES.T1184, ...OBSERVACIONES.T1185]
  const juntas = rendimientoDeProceso(todas)
  const suma = ['T1183', 'T1184', 'T1185'].reduce((a, k) => a + rendimientoDeProceso(OBSERVACIONES[k]).hsUnitarias, 0)
  assert.equal(juntas.hsUnitarias, 6.42)
  assert.equal(Math.round(suma * 1000) / 1000, 19.668)
  assert.notEqual(juntas.hsUnitarias, Math.round(suma * 1000) / 1000)
})
