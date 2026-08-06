// LAS SERIES DE LOS GRÁFICOS, VERIFICADAS EN FRÍO.
//
// POR QUÉ EXISTE (05/08/2026). Un gráfico miente distinto que una tabla: dibuja una curva perfecta y
// nadie sospecha de los números que hay detrás. Los dos modos de falla que este archivo protege son
// exactamente ésos —una serie que se calcula mal y una serie que se ubica mal— y ninguno de los dos se
// ve mirando el gráfico.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  bloqueSeries, ubicarSeries, saldoHistorico, saldoProyectado, topContraparte,
  ingresosDelMes, egresosDelMes,
  ROTULOS, LARGO, COL, DIAS_HISTORIA, DIAS_PROYECCION, TOP_N, MESES,
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

test('EL AÑO SE SUMA CONTRA EL LIBRO, NO CONTRA UNA SEGUNDA CUENTA', () => {
  // El defecto que atrapa: alguien "arregla" la serie del equilibrio escribiendo un SUMIFS contra
  // Cobranzas o Compras. Ahí habría dos definiciones de "lo que entra en marzo" y el gráfico y las
  // tarjetas de CAJA discreparían sin que nada avise. Se compara contra el CONSTRUCTOR, no contra un
  // texto copiado: si `terminoLibro` cambia, este test se mueve con él.
  const ventana = (m) => ({ desde: `DATE(YEAR(TODAY());${m};1)`, hasta: `DATE(YEAR(TODAY());${m + 1};1)` })
  assert.equal(ingresosDelMes(3), `=${terminoLibro({ ...ventana(3), signo: 1, medida: 'magnitud' })}`)
  assert.equal(egresosDelMes(3), `=${terminoLibro({ ...ventana(3), signo: -1, medida: 'magnitud' })}`)
  assert.ok(ingresosDelMes(1).includes('_MOVIMIENTOS!$A$2:$A'), 'la fuente es el libro, con rango abierto')
  assert.ok(!/\$[A-Z]+\$\d+:\$?[A-Z]+\$\d+/.test(egresosDelMes(1)), 'ningún rango con tope: el libro crece con cada corrida')
})

test('DICIEMBRE CIERRA EN ENERO DEL AÑO SIGUIENTE, y ningún mes se pisa con el otro', () => {
  // `hasta` es EXCLUSIVO en todo el repo: si diciembre cerrara en DATE(y;12;31) se perdería el 31, y si
  // dos meses compartieran el borde, un movimiento del 1° se contaría dos veces.
  assert.ok(egresosDelMes(12).includes('DATE(YEAR(TODAY());13;1)'), 'DATE normaliza el mes 13 al 1° de enero')
  for (let m = 1; m < MESES; m++) {
    const cierre = `<DATE(YEAR(TODAY());${m + 1};1)`
    assert.ok(ingresosDelMes(m).includes(cierre))
    assert.ok(ingresosDelMes(m + 1).includes(`>=DATE(YEAR(TODAY());${m + 1};1)`), 'el mes siguiente arranca donde cierra el anterior')
  }
})

test('EL AÑO SALE DE TODAY(), NUNCA ESCRITO: el timer estuvo detenido semanas', () => {
  // Un "2026" pegado convierte el gráfico del año en el gráfico del año pasado el 1° de enero, y sin
  // dar un solo error. Vale para las celdas Y para el rótulo, que es lo que ubica la serie.
  for (const f of [ingresosDelMes(7), egresosDelMes(7)]) assert.doesNotMatch(f, /\b20\d\d\b/)
  assert.doesNotMatch(ROTULOS.equilibrio, /\b20\d\d\b/)
})

test('LOS DOS SIGNOS VAN EN MAGNITUD: en neto las curvas no se cruzarían nunca', () => {
  // Es el defecto que anula el gráfico entero. El egreso vive en el libro con signo −1: en `neto` se
  // dibuja debajo del cero, el azul queda siempre arriba y el "punto de equilibrio" no existe.
  assert.ok(!egresosDelMes(5).includes('*N(_MOVIMIENTOS!$B$2:$B)'), 'el egreso no se multiplica por su signo')
  assert.ok(egresosDelMes(5).includes('(_MOVIMIENTOS!$B$2:$B=-1)'), 'pero sí se FILTRA por signo −1')
  assert.ok(ingresosDelMes(5).includes('(_MOVIMIENTOS!$B$2:$B=1)'))
})

test('EL AÑO ENTRA CON TODOS LOS ESTADOS: lo cobrado y lo esperado', () => {
  // Con sólo REAL, los meses que todavía no pasaron valdrían cero y el cruce se leería donde no está.
  for (const f of [ingresosDelMes(9), egresosDelMes(9)]) {
    assert.ok(!f.includes('="REAL"'), 'ningún filtro de estado: entra todo el año')
    assert.ok(!f.includes('="PROYECTADO"'))
  }
})

test('el bloque del equilibrio emite doce meses con sus dos columnas de plata', () => {
  const h = hojaFalsa()
  const r = bloqueSeries(h)
  assert.equal(r.fEq1 - r.fEq0 + 1, MESES)
  const primera = h.filas[r.fEq0 - 1]
  const ultima = h.filas[r.fEq1 - 1]
  assert.equal(String(primera[COL.fecha - 1]), '=DATE(YEAR(TODAY());1;1)')
  assert.equal(String(ultima[COL.fecha - 1]), `=DATE(YEAR(TODAY());${MESES};1)`)
  assert.equal(String(primera[COL.importe - 1]), ingresosDelMes(1))
  assert.equal(String(primera[COL.egreso - 1]), egresosDelMes(1))
  // LA FILA DEL RÓTULO LLEVA LOS NOMBRES DE LAS DOS SERIES: es de donde el gráfico saca la leyenda.
  const cab = h.filas[r.fEq0 - 2]
  assert.equal(cab[0], ROTULOS.equilibrio)
  assert.equal(cab[COL.importe - 1], 'Ingresos')
  assert.equal(cab[COL.egreso - 1], 'Egresos')
})

test('el generador le da a la columna del mes el formato "mmm", o el eje se dibuja ilegible', () => {
  // Se verifica sobre el FUENTE porque formatear() pide el cliente de Google. La columna F del anexo
  // entero es dd/mm/yyyy: sin esta excepción, el eje de abajo son doce "01/03/2026" rotados y pisados.
  const src = readFileSync(new URL('../scripts/caja-anexo-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /fEq0/, 'el formateador tiene que ubicar el bloque del equilibrio por su fila real')
  assert.match(src, /pattern: 'mmm'/)
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
