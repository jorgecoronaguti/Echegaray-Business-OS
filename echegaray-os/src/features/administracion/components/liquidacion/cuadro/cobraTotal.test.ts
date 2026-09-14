// «$/H PRIMERO Y DESPUÉS CUÁNTO COBRA TOTAL» (dueño, 14/09/2026).
//
// Textual: *«quiero q la columna de valor hora este primero y dp cuanto cobra total (eso de "le falta
// pagar", esta mal no quiero q sea asi)»*. El cuadro abría con el importe que quedaba por pagar después de
// adelantos y giros; el dueño lee la planilla al revés: primero la tarifa, después lo que cobra la
// quincena (horas × $/h), y recién ahí cómo se paga.
//
// El orden y la ausencia de la frase se prueban sobre la fuente. El control de que la fila cierre se
// ejecuta: `estadoDelPago` es puro y es lo que decide el rojo de banco y efectivo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDelPago } from './estadoDelPago.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const CELDAS = fuente('./CeldasDelEspejo.tsx')

test('EL ENCABEZADO: Persona · $/h · Cobra total · adelanto · transferido · banco · efectivo · redondeo · hs', () => {
  const plata = GRILLA.slice(GRILLA.indexOf('const PLATA'), GRILLA.indexOf('const GAP'))
  const columnas = [...plata.matchAll(/clave: '([a-zA-Z]+)', rotulo: '([^']+)'/g)].map((m) => [m[1], m[2]])
  assert.deepEqual(columnas.map((c) => c[0]),
    ['valorHora', 'cobraTotal', 'adelanto', 'yaTransferido', 'porBanco', 'enEfectivo', 'efectivoRedondeado', 'horasPagas'])
  assert.equal(columnas[1][1], 'Cobra total')
  // Y LA FILA DIBUJA EN ESE ORDEN: la tarifa antes que el cobra, el cobra antes que los descuentos.
  const fila = GRILLA.slice(GRILLA.indexOf('function Fila('), GRILLA.indexOf('function Total('))
  const orden = ['<CeldaTarifa', '<CeldaCobraTotal', 'campo="adelanto"', 'campo="yaTransferido"', '<CeldaPorBanco', '<CeldaEfectivo', '<CeldaRedondeo']
    .map((s) => fila.indexOf(s))
  assert.ok(orden.every((i) => i > 0), 'están todas las celdas')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden pedido')
})

test('LA FRASE NO QUEDA ESCRITA EN EL CUADRO, EL PIE, EL PANEL NI CAJA', () => {
  for (const rel of ['../GrillaEspejoQuincena.tsx', './CeldasDelEspejo.tsx', './PanelDeLaPersona.tsx', '../solapas/caja-nomina.tsx', '../solapas/cierre.tsx']) {
    const texto = fuente(rel)
    assert.ok(!/le falta pagar|leFaltaPagar|le-falta-pagar|CeldaLeFaltaPagar/i.test(texto), `${rel} todavía la tiene`)
  }
})

test('BANCO Y EFECTIVO SE PINTAN DE ROJO CON LA MISMA REGLA, Y SÓLO SI LA FILA NO CIERRA', () => {
  for (const celda of ['CeldaPorBanco', 'CeldaEfectivo']) {
    const cuerpo = CELDAS.slice(CELDAS.indexOf(`export function ${celda}(`))
    const hasta = cuerpo.indexOf('\n}\n')
    assert.match(cuerpo.slice(0, hasta), /estadoDelPago\(l\)/, `${celda} usa la regla`)
    assert.match(cuerpo.slice(0, hasta), /e\.noCierra \? V\.neg/, `${celda} pinta de rojo cuando no cierra`)
  }
})

const base = { cobra: 552156, adelanto: 0, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 121915.88, total: 352156, reciboNeto: 230240.12, blancoAcuerdo: 276078, efectivoAcuerdo: 276078 }

test('UNA FILA QUE NO CIERRA SE MARCA Y DICE POR CUÁNTO; UNA QUE CIERRA NO MUESTRA NADA', () => {
  // Rosales 16–31/08, la cuenta de la planilla: cierra.
  const bien = estadoDelPago(base)
  assert.equal(bien.noCierra, false)
  assert.match(bien.titulo, /Cobra \$552\.156 − adelanto \$0 − ya transferido \$200\.000 = banco/)
  // El efectivo escrito no cuadra con el total: no cierra.
  const mal = estadoDelPago({ ...base, enEfectivo: 169759.88, total: 400000 })
  assert.equal(mal.noCierra, true)
  assert.match(mal.titulo, /^No cierra: .*diferencia \$47\.844/)
  // Sin cobra no hay cierre que afirmar: no se pinta.
  assert.equal(estadoDelPago({ ...base, cobra: null, total: null }).noCierra, false)
})

test('LA MARCA 50/50 DICE «SIN RECIBO» CUANDO EL BANCO TODAVÍA NO TIENE CIFRA', () => {
  assert.equal(estadoDelPago(base).acuerdo?.texto, '50/50')
  assert.equal(estadoDelPago({ ...base, porBanco: 0, reciboNeto: null }).acuerdo?.texto, '50/50 sin recibo')
  assert.equal(estadoDelPago({ ...base, blancoAcuerdo: null }).acuerdo, null)
})
