// LAS SERIES DE LOS GRÁFICOS, VERIFICADAS EN FRÍO.
//
// POR QUÉ EXISTE (05/08/2026). Un gráfico miente distinto que una tabla: dibuja una curva perfecta y
// nadie sospecha de los números que hay detrás. Los dos modos de falla que este archivo protege son
// exactamente ésos —una serie que se calcula mal y una serie que se ubica mal— y ninguno de los dos se
// ve mirando el gráfico.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bloqueSeries, ubicarSeries, saldoHistorico, saldoProyectado, topContraparte,
  ROTULOS, LARGO, COL, DIAS_HISTORIA, DIAS_PROYECCION, TOP_N,
} from './caja-anexo-series.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { NO_REAL } from './caja-tarjetas.mjs'
import { DESDE_CAJA } from './caja-anexo-nombres.mjs'

/** Un constructor de grilla mínimo, con la misma forma que el del anexo (`push` devuelve la fila). */
const hojaFalsa = (desde = 0) => {
  const filas = new Array(desde).fill(null)
  return { filas, get n() { return filas.length }, push: (c = []) => filas.push(c) }
}

test('EL DÍA DE HOY VALE EXACTAMENTE EL TOTAL DE CAJA: las dos curvas se tocan sin salto', () => {
  // Si la historia y la proyección no coincidieran en el punto de hoy, el gráfico mostraría un escalón
  // en el medio y la primera pregunta del dueño sería cuál de los dos números es el bueno. La ventana
  // que se resta arranca MAÑANA, así que en el día de hoy queda vacía.
  assert.equal(saldoHistorico(0), `=${DESDE_CAJA.total}-${terminoLibro({ desde: 'TODAY()+1', hasta: 'TODAY()+1', estados: ['REAL'] })}`)
})

test('LA HISTORIA SE RECONSTRUYE CON LO REAL Y LA PROYECCIÓN CON LO QUE FALTA PASAR', () => {
  // Es la simetría que evita el doble conteo: `REAL` sólo entra en la historia y los tres estados
  // pendientes sólo en la proyección. Si un estado entrara en las dos, el punto de hoy contaría dos
  // veces la misma plata y todo el gráfico quedaría corrido.
  assert.equal(saldoHistorico(-3), `=${DESDE_CAJA.total}-${terminoLibro({ desde: 'TODAY()-2', hasta: 'TODAY()+1', estados: ['REAL'] })}`)
  assert.equal(saldoProyectado(5), `=${DESDE_CAJA.total}+${terminoLibro({ desde: 'TODAY()', hasta: 'TODAY()+6', estados: NO_REAL })}`)
  assert.ok(!saldoProyectado(5).includes('="REAL"'))
  assert.ok(!saldoHistorico(-3).includes('="COMPROMETIDO"'))
})

test('CADA PUNTO ES INDEPENDIENTE: no es un saldo corrido', () => {
  // Un saldo corrido arrastra el error de una fila a todas las de abajo, y una fila rota deja la curva
  // entera mal sin que nada avise. Acá cada día se calcula desde la posición de hoy: una fila mala
  // ensucia un punto.
  for (const f of [saldoHistorico(-10), saldoProyectado(10)]) {
    assert.ok(!/\$C\d+/.test(f), 'ningún punto referencia la celda de otro punto')
    assert.ok(f.includes(DESDE_CAJA.total), 'todos parten del mismo ancla')
  }
})

test('EL TOP DE CONTRAPARTES NO PEGA VALORES Y NO DERRAMA', () => {
  // Agrupar por contraparte necesita la lista de contrapartes ÚNICAS, y esa lista cambia sola: una
  // columna auxiliar con nombres pegados es un ranking que se congela el día que aparece un proveedor
  // nuevo. Y se pide `INDEX(...;k;col)`, una celda por vez: un QUERY que derrama es incontrolable para
  // un generador que reescribe la pestaña entera.
  const nombre = topContraparte(-1, 1, 1)
  assert.ok(nombre.startsWith('=IFERROR(INDEX(QUERY('))
  assert.ok(nombre.includes('group by J order by sum(C) desc limit'))
  assert.ok(nombre.includes("where B = -1"), 'el signo separa pagos de cobranzas')
  assert.ok(topContraparte(1, 1, 1).includes('where B = 1'))
  assert.ok(nombre.includes("H <> 'REAL'"), 'lo que ya pasó por el banco no es un pago futuro')
})

test('LAS FECHAS DEL QUERY VIAJAN EN ISO, no en dd/mm', () => {
  // El lenguaje de QUERY es siempre en inglés y no entiende `TODAY()`: pide un literal `date
  // 'aaaa-mm-dd'`. Con el formato del archivo (dd/mm) la comparación se rompe en silencio y el ranking
  // sale vacío o con toda la historia adentro.
  const f = topContraparte(-1, 1, 2)
  assert.ok(f.includes('TEXT(TODAY();"yyyy-mm-dd")'))
  assert.ok(f.includes("A >= date '"))
})

test('el bloque emite las cuatro series con su largo declarado', () => {
  const h = hojaFalsa()
  const r = bloqueSeries(h)
  assert.equal(r.fHist1 - r.fHist0 + 1, DIAS_HISTORIA)
  assert.equal(r.fProy1 - r.fProy0 + 1, DIAS_PROYECCION)
  assert.equal(r.fPag1 - r.fPag0 + 1, TOP_N)
  assert.equal(r.fCob1 - r.fCob0 + 1, TOP_N)
  // LA HISTORIA VA DE MÁS VIEJO A MÁS NUEVO: un eje temporal al revés se lee mal y Sheets lo dibuja
  // igual, sin quejarse.
  assert.ok(String(h.filas[r.fHist0 - 1][COL.fecha - 1]).includes(`TODAY()-${DIAS_HISTORIA - 1}`))
  assert.equal(String(h.filas[r.fHist1 - 1][COL.fecha - 1]), '=TODAY()')
})

test('LA UBICACIÓN ES POR RÓTULO: un rango de gráfico mal apuntado dibuja datos equivocados', () => {
  // El anexo crece con cada control nuevo. Anclar en la posición es lo que ya dejó dos cash flow con
  // el saldo inicial en blanco — y acá el síntoma sería peor: una curva perfecta de otra cosa.
  const h = hojaFalsa(37) // el bloque no arranca en la fila 1: el anexo tiene nueve bloques antes
  bloqueSeries(h)
  const colA = h.filas.map((f) => [f?.[0] ?? ''])
  const u = ubicarSeries(colA)
  for (const [clave, rotulo] of Object.entries(ROTULOS)) {
    assert.ok(u[clave], `no ubiqué "${rotulo}"`)
    assert.equal(u[clave].f1 - u[clave].f0 + 1, LARGO[clave])
    // La primera fila de datos es la SIGUIENTE al encabezado: si el rango incluyera el encabezado, el
    // gráfico dibujaría el texto como un punto de valor cero.
    assert.equal(String(colA[u[clave].f0 - 2][0]), rotulo)
  }
})

test('MEDIA SERIE NO SE DIBUJA: si faltan filas, devuelve null y el que llama tiene que decirlo', () => {
  // Media serie dibuja media verdad, que es peor que no dibujar nada. Un anexo cortado por un 429 o
  // por una lectura con techo entra por acá.
  const h = hojaFalsa()
  bloqueSeries(h)
  const colA = h.filas.map((f) => [f?.[0] ?? '']).slice(0, 20)
  const u = ubicarSeries(colA)
  assert.equal(u.historia, null)
  assert.equal(ubicarSeries([]).pagos, null)
})

test('NINGUNA fórmula usa la coma como separador de argumentos fuera de un literal (es-AR)', () => {
  // El texto del QUERY lleva comas de su propia sintaxis ("select J, sum(C)") y está bien: vive dentro
  // de un literal. La regla que importa es la otra — una coma entre ARGUMENTOS deja #ERROR! en la celda.
  const h = hojaFalsa()
  bloqueSeries(h)
  for (const [i, fila] of h.filas.entries()) {
    for (const c of fila ?? []) {
      const s = String(c ?? '')
      if (!s.startsWith('=')) continue
      const sospechosas = s.replace(/"[^"]*"/g, '""').replace(/(?<=\d),(?=\d)/g, '')
      assert.doesNotMatch(sospechosas, /,/, `fila ${i + 1}: ${s.slice(0, 120)}`)
    }
  }
})
