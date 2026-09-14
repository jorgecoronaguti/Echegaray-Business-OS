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

// CAMBIÓ EL 14/09/2026 (dueño: «pone las hs por dia adelante y todos los calculos monetarios al reves, quiero
// q repliques la pestaña sheet jornales en liq hs»). El orden de «Obreros 26» de JORNALES, con blanco/negro
// en el medio y sin «Cliente · Obra» («esa columna no te pedi en liq hs»). Lo que se sigue protegiendo:
// el orden de lectura, las dos bandas rotuladas y que la fila dibuje en el mismo orden que el encabezado.
const ORDEN_JORNALES = [
  'Horas', 'Hs recibo', '$/h cat.', 'Banco', 'Hs', '$/h negro', 'Importe',
  'Adelanto banco / embargos', 'Adelanto efectivo', 'Total efectivo', 'Efect. red.', 'Cobra total',
]

test('EL ENCABEZADO ES EL DE JORNALES: Persona · días · Horas · BLANCO · NEGRO · adelantos · total efectivo · total quincena', () => {
  const plata = GRILLA.slice(GRILLA.indexOf('const PLATA'), GRILLA.indexOf('const GAP'))
  const columnas = [...plata.matchAll(/clave: '([a-zA-Z]+)', rotulo: '([^']+)'(?:, px: \d+)?(?:, banda: '([a-z]+)')?/g)]
    .map((m) => ({ clave: m[1], rotulo: m[2].replace(' ✎', ''), banda: m[3] ?? null }))
  assert.deepEqual(columnas.map((c) => c.rotulo), ORDEN_JORNALES, 'el orden exacto, sin Cliente · Obra')
  assert.deepEqual(columnas.filter((c) => c.banda === 'blanco').map((c) => c.rotulo), ['Hs recibo', '$/h cat.', 'Banco'])
  assert.deepEqual(columnas.filter((c) => c.banda === 'negro').map((c) => c.rotulo), ['Hs', '$/h negro', 'Importe'])
  assert.ok(!/Cliente|Obra'/.test(plata), 'no vuelve la columna Cliente · Obra')
  // LOS DÍAS ADELANTE: la plantilla pone los días antes que la plata, y el encabezado también.
  assert.match(GRILLA, /`minmax\(200px,1fr\) repeat\(\$\{nDias\},\$\{DIA\}px\) \$\{PLATA\.map/,
    'MUTACIÓN: la plata antes que los días')
  assert.match(GRILLA, /gridColumn: 2 \+ dias\.length \+ i, gridRow: 2/)
  assert.match(GRILLA, /'Blanco · recibo'/)
  // Y LA FILA DIBUJA EN ESE ORDEN: días, horas, blanco, negro, adelantos, efectivo, redondeo, total.
  const fila = GRILLA.slice(GRILLA.indexOf('function Fila('), GRILLA.indexOf('function Total('))
  const orden = ['<CeldaDeDia', '<CeldaHorasPagas', '<CeldaHorasBlanco', '<CeldaHoraCategoria', '<CeldaNeto', '<CeldaHorasNegro',
    '<CeldaImporteNegro', 'campo="yaTransferido"', 'campo="adelanto"', '<CeldaEfectivoDelSueldo', '<CeldaRedondeo', '<CeldaTotal']
    .map((x) => fila.indexOf(x))
  assert.ok(orden.every((i) => i > 0), 'están todas las celdas')
  assert.deepEqual([...orden].sort((a, b) => a - b), orden, 'en el orden pedido')
})

// «NECESITO Q EN ALGUNA COLUMNA DE LIQ HS ME DIGA CUANTO COBRA EN TOTAL» (dueño, 14/09/2026). MUTACIÓN: sacar el
// rótulo o la columna fija a la derecha → rojo.
test('«COBRA TOTAL» EN ENCABEZADO, PIE Y PANEL, Y FIJA A LA DERECHA', () => {
  const PANEL = fuente('./PanelDeLaPersona.tsx')
  assert.match(GRILLA, /clave: 'total', rotulo: 'Cobra total'/)
  assert.match(GRILLA, /cifra\('Cobra total', totales\.cobra/)
  assert.equal((PANEL.match(/rotulo="Cobra total"/g) ?? []).length, 2, 'las dos cadenas del panel')
  assert.ok(!/Total quincena/.test(GRILLA + PANEL), 'no queda el rótulo viejo')
  assert.match(GRILLA, /position: 'sticky', right: -CANAL_SCROLL/)
  // LA MISMA COLUMNA FIJA EN EL ENCABEZADO, EN CADA FILA Y EN EL TOTAL.
  assert.equal((GRILLA.match(/\.\.\.COLUMNA_COBRA/g) ?? []).length, 3)
  const fila = GRILLA.slice(GRILLA.indexOf('function Fila('), GRILLA.indexOf('function Total('))
  assert.match(fila, /style=\{\{ \.\.\.COLUMNA_COBRA[^}]*\}\}>\s*<CeldaTotal fila=\{fila\} \/>/)
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
