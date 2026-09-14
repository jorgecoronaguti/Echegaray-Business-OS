// EL ORDEN DEL CUADRO: BLANCO · NEGRO · TOTAL · cómo se paga (dueño, 14/09/2026).
//
// Antes: *«quiero q la columna de valor hora este primero y dp cuanto cobra total (eso de "le falta
// pagar", esta mal no quiero q sea asi)»*. Después: *«realmente no se entiende nada el cuadro de liq de
// hs, vamos a rehacer»* con el sueldo partido en blanco (recibo) y negro. Lo que se sigue protegiendo:
// el orden de lectura, que la frase «le falta pagar» no vuelva, y que el rojo de la fila sea un control
// que puede dar rojo (`estadoDelPago` es puro y se ejecuta).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { estadoDelPago, tituloDeJornales } from './estadoDelPago.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const GRILLA = fuente('../GrillaEspejoQuincena.tsx')
const CELDAS = fuente('./CeldasBlancoNegro.tsx')

test('EL ENCABEZADO: Persona · Horas · BLANCO (Hs, $/h cat., Neto) · NEGRO (Hs, $/h negro, Importe) · Total · descuentos · efectivo', () => {
  const plata = GRILLA.slice(GRILLA.indexOf('const PLATA'), GRILLA.indexOf('const GAP'))
  const columnas = [...plata.matchAll(/clave: '([a-zA-Z]+)', rotulo: '([^']+)'(?:, px: \d+)?(?:, banda: '([a-z]+)')?/g)]
    .map((m) => ({ clave: m[1], rotulo: m[2], banda: m[3] ?? null }))
  assert.deepEqual(columnas.map((c) => c.clave),
    ['horas', 'hsBlanco', 'horaCategoria', 'neto', 'hsNegro', 'horaNegro', 'negro', 'total', 'adelanto', 'yaTransferido', 'enEfectivo', 'efectivoRedondeado'])
  assert.deepEqual(columnas.filter((c) => c.banda === 'blanco').map((c) => c.rotulo), ['Hs', '$/h cat.', 'Neto (banco)'])
  assert.deepEqual(columnas.filter((c) => c.banda === 'negro').map((c) => c.rotulo), ['Hs', '$/h negro ✎', 'Importe'])
  // LAS DOS BANDAS ROTULADAS: sin ellas «Hs» dos veces no se puede leer.
  assert.match(GRILLA, /'Blanco · recibo'/)
  assert.match(GRILLA, /banda\(inicioDe\('negro'\), 'Negro'/)
  // Y LA FILA DIBUJA EN ESE ORDEN.
  const fila = GRILLA.slice(GRILLA.indexOf('function Fila('), GRILLA.indexOf('function Total('))
  const orden = ['<CeldaHorasPagas', '<CeldaHorasBlanco', '<CeldaHoraCategoria', '<CeldaNeto', '<CeldaHorasNegro', '<CeldaTarifa',
    '<CeldaImporteNegro', '<CeldaTotal', 'campo="adelanto"', 'campo="yaTransferido"', '<CeldaEfectivoDelSueldo', '<CeldaRedondeo']
    // `lastIndexOf`: el $/h aparece dos veces desde que el mensual tiene su celda propia (QA, 14/09/2026); la
    // del obrero, en las bandas, es la última.
    .map((s) => (s === '<CeldaTarifa' ? fila.lastIndexOf(s) : fila.indexOf(s)))
  assert.ok(orden.every((i) => i > 0), 'están todas las celdas')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden pedido')
})

test('LA FRASE NO QUEDA ESCRITA EN EL CUADRO, EL PIE, EL PANEL NI CAJA', () => {
  for (const rel of ['../GrillaEspejoQuincena.tsx', './CeldasDelEspejo.tsx', './CeldasBlancoNegro.tsx', './PanelDeLaPersona.tsx', '../solapas/caja-nomina.tsx', '../solapas/cierre.tsx']) {
    const texto = fuente(rel)
    assert.ok(!/le falta pagar|leFaltaPagar|le-falta-pagar|CeldaLeFaltaPagar/i.test(texto), `${rel} todavía la tiene`)
  }
})

test('EL EFECTIVO SE PINTA DE ROJO SÓLO SI LA FILA NO CIERRA; EL ESTIMADO SE VE APAGADO CON «est.»', () => {
  const cuerpo = CELDAS.slice(CELDAS.indexOf('export function CeldaEfectivoDelSueldo('))
  assert.match(cuerpo, /estadoDelPago\(l\)/)
  assert.match(cuerpo, /e\.noCierra \? V\.neg/)
  assert.match(CELDAS, /const ESTIMADO: CSSProperties = \{ color: V\.apagado, fontStyle: 'italic' \}/)
  assert.match(CELDAS, /estimado && <Est \/>/)
  // ÁMBAR SÓLO PARA EL PROBLEMA: el recibo que paga más horas que las cargadas.
  assert.match(CELDAS, /reciboExcedeHoras[\s\S]{0,200}color: V\.warn/)
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(CELDAS), 'sin hex sueltos: tokens V')
})

const base = { cobra: 552156, adelanto: 0, yaTransferido: 200000, porBanco: 230240.12, enEfectivo: 121915.88, total: 352156, reciboNeto: 230240.12, blancoAcuerdo: 276078, efectivoAcuerdo: 276078 }

test('UNA FILA QUE NO CIERRA SE MARCA Y DICE POR CUÁNTO; UNA QUE CIERRA NO MUESTRA NADA', () => {
  const bien = estadoDelPago(base)
  assert.equal(bien.noCierra, false)
  assert.match(bien.titulo, /Cobra \$552\.156 − adelanto \$0 − ya transferido \$200\.000 = banco/)
  const mal = estadoDelPago({ ...base, enEfectivo: 169759.88, total: 400000 })
  assert.equal(mal.noCierra, true)
  assert.match(mal.titulo, /^No cierra: .*diferencia \$47\.844/)
  assert.equal(estadoDelPago({ ...base, cobra: null, total: null }).noCierra, false)
})

test('JORNALES VA ENTERO EN EL TITLE Y NO MANDA: horas, cobra, banco y efectivo', () => {
  assert.equal(
    tituloDeJornales({ referenciaJornales: { horas: 94, cobra: 552156, porBanco: 250000, enEfectivo: 121915.88, difiere: false } }),
    'JORNALES (referencia): 94 h · cobra $552.156 · banco $250.000 · efectivo $121.915,88',
  )
  assert.equal(tituloDeJornales({ referenciaJornales: null }), null)
})
