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
  bloqueSeries, ubicarSeries, saldoHistorico, saldoProyectado, saldoSinCobrar, topContraparte,
  saldoEfectivoProyectado, saldoBancoProyectado,
  ingresosDelMes, egresosDelMes, necesidadDelDia,
  ROTULOS, LARGO, COL, DIAS_HISTORIA, DIAS_PROYECCION, DIAS_NECESIDAD, TOP_N, MESES,
} from './caja-anexo-series.mjs'
import {
  COL_NECESIDAD, SALIDAS, PENDIENTES, BALDES, EJECUTADO, baldeDeSalida, repartirSalidas,
} from './caja-necesidad-baldes.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { NO_REAL } from './caja-tarjetas.mjs'
import { DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { ANCHO_ANEXO, ANCHOS_ANEXO } from './caja-anexo.mjs'

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
  // EL ÍNDICE ARRANCA EN 2: `QUERY` con `group by` antepone su fila de encabezado aunque se le pase
  // 0 en headers. Sin esto el anexo publicaba el texto "sum " en vez del primer importe.
  assert.ok(topContraparte(-1, 1, 2).includes(');2;2)'), 'el primer dato de un QUERY agrupado está en la fila 2')
  assert.ok(topContraparte(-1, 5, 2).includes(');6;2)'), 'el k-ésimo dato está en la fila k+1')

  const nombre = topContraparte(-1, 1, 1)
  assert.ok(nombre.startsWith('=IFERROR(INDEX(QUERY('))
  assert.ok(nombre.includes('group by J order by sum(C) desc limit'))
  assert.ok(nombre.includes("where B = -1"), 'el signo separa pagos de cobranzas')
  assert.ok(topContraparte(1, 1, 1).includes('where B = 1'))
  assert.ok(nombre.includes("H <> 'REAL'"), 'lo que ya pasó por el banco no es un pago futuro')
})

test('LA VENTANA DEL QUERY SE COMPARA CONTRA EL SERIAL, no contra un literal `date`', () => {
  // La columna A de `_MOVIMIENTOS` guarda el NÚMERO DE SERIE (46254), no un valor de tipo fecha.
  // El filtro decía `A >= date '2026-08-20'`, y QUERY comparando un número contra una fecha no
  // matchea NADA: con 56 filas que cumplían el resto de las condiciones, los dos gráficos de CAJA
  // salían vacíos y nada decía por qué. Se compara número contra número.
  const f = topContraparte(-1, 1, 2)
  assert.ok(f.includes('TEXT(TODAY();"0")'), 'el borde de la ventana es el serial de hoy, sin formato')
  assert.ok(!f.includes("date '"), 'un literal `date` no se puede comparar contra una columna numérica')
  assert.ok(f.includes('A >= "&'), 'el serial entra concatenado, no como texto de fecha')
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

test('UN RANKING SIN CONTRAPARTES NO SE DIBUJA: rótulo presente y filas vacías devuelven null', () => {
  // "El gráfico que no tiene nada" (el dueño lo mandó borrar el 07/08): las fórmulas de
  // top-contraparte devuelven "" cuando no hay contrapartes en la ventana — la fila existe, el dato
  // no, y el gráfico salía dibujado vacío. El rótulo solo no alcanza: tiene que haber dato.
  const h = hojaFalsa()
  bloqueSeries(h)
  // Lo que VE ubicarSeries en la corrida real es el VALOR leído, no la fórmula: un ranking sin
  // contrapartes rinde "". Acá se simula esa lectura vaciando toda celda que era fórmula.
  const colA = h.filas.map((f) => {
    const celda = String(f?.[0] ?? '')
    return [celda.startsWith('=') ? '' : celda]
  })
  const u = ubicarSeries(colA)
  assert.equal(u.pagos, null, 'un ranking de pagos sin datos se dibujaba vacío')
  assert.equal(u.cobranzas, null, 'un ranking de cobranzas sin datos se dibujaba vacío')
  // Y las series cuya columna A viene vacía POR DISEÑO siguen ubicándose: el control no las mata.
  assert.ok(u.proyeccion, 'proyección tiene la columna A vacía por diseño y se dibuja igual')
  assert.ok(u.historia, 'historia tiene la columna A vacía por diseño y se dibuja igual')
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE YA SALIÓ CONTRA LO QUE FALTA PAGAR (28/08/2026)
//
// El defecto que estos tests protegen es el del 28/08: el gráfico dibujó $4.200.000 de «Proveedores»
// para HOY, y eran una compra en efectivo ya pagada. La plata estaba bien sumada y contestaba la
// pregunta equivocada — nadie tiene que conseguir lo que ya salió.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('EL BALDE DE LO EJECUTADO SUMA SÓLO REAL, Y LOS CINCO RUBROS SÓLO LO QUE FALTA PAGAR', () => {
  // Es la regla absoluta de tesorería: "nunca se suman dos categorías distintas en la misma columna
  // sin distinguirlas". Sin el filtro, un pago hecho y una deuda viva caen en la misma barra.
  const ventana = { desde: 'TODAY()+2', hasta: 'TODAY()+3', medida: 'magnitud', signo: -1 }
  assert.equal(necesidadDelDia(2, 'sueldos'),
    `=${terminoLibro({ ...ventana, estados: NO_REAL, rubros: [...BALDES.sueldos] })}`)
  // CONTRATO NUEVO (02/09, regla del dueño): «Cheques» = rubro 'Cheques emitidos' (cartera viva y
  // cuotas de cobertura), no el medio PREVISTO del plan — el aval del egreso es el cheque emitido.
  assert.equal(necesidadDelDia(2, 'cheques'),
    `=${terminoLibro({ ...ventana, estados: NO_REAL, rubros: ['Cheques emitidos'] })}`)
  assert.equal(necesidadDelDia(2, EJECUTADO), `=${terminoLibro({ ...ventana, estados: ['REAL'] })}`)
  // Y ningún balde pendiente deja pasar un REAL, ni el de lo ejecutado un COMPROMETIDO.
  for (const b of PENDIENTES) assert.ok(!necesidadDelDia(0, b.clave).includes('="REAL"'), b.clave)
  assert.ok(!necesidadDelDia(0, EJECUTADO).includes('="COMPROMETIDO"'))
})

test('EL RESTO SE RESUELVE DENTRO DE SU PROPIO GRUPO DE ESTADOS', () => {
  // «Proveedores» es el resto de lo PENDIENTE, no el resto de todo: restarle un cheque ya debitado
  // daría un negativo inventado, y una barra negativa en una pila apilada corrompe el día entero.
  const f = necesidadDelDia(0, 'proveedores')
  const ventana = { desde: 'TODAY()', hasta: 'TODAY()+1', medida: 'magnitud', signo: -1, estados: NO_REAL }
  const esperado = `=${terminoLibro(ventana)}`
    + `-${terminoLibro({ ...ventana, rubros: ['Cheques emitidos'] })}`
    + `-${terminoLibro({ ...ventana, rubros: [...BALDES.sueldos] })}`
    + `-${terminoLibro({ ...ventana, rubros: [...BALDES.cargas] })}`
    + `-${terminoLibro({ ...ventana, rubros: [...BALDES.impuestos] })}`
  assert.equal(f, esperado)
})

test('UN BALDE QUE NO EXISTE FALLA FUERTE: una barra que falta se lee como un día sin vencimientos', () => {
  assert.throws(() => necesidadDelDia(0, 'proveedorez'), /no existe el balde/)
})

test('LA CURVA DEL PISO NO RESTA LO QUE YA SALIÓ: eso es pedir dos veces la misma plata', () => {
  // EL DEFECTO (28/08): `saldoSinCobrar` restaba TODOS los egresos del tramo, sin mirar el estado.
  // Un REAL ya está descontado adentro de CAJA_TOTAL_DISPONIBLE (el extracto, la línea de posteriores
  // al corte o el arqueo lo absorben — ver caja-canales.mjs), así que restarlo otra vez hunde la
  // curva del piso por plata que nadie tiene que conseguir. Si alguien saca este filtro, el gráfico
  // vuelve a decir "no alcanza" un día que alcanza.
  assert.equal(saldoSinCobrar(4),
    `=${DESDE_CAJA.total}-${terminoLibro({ desde: 'TODAY()', hasta: 'TODAY()+5', signo: -1, estados: NO_REAL, medida: 'magnitud' })}`)
  assert.ok(!saldoSinCobrar(4).includes('="REAL"'))
})

test('LAS BARRAS QUE SE COMPARAN CONTRA EL SALDO SON EXACTAMENTE LAS QUE LO MUEVEN', () => {
  // La coherencia que hace legible el gráfico: lo que las dos curvas descuentan en el tramo [hoy, d]
  // es la suma de los baldes PENDIENTES de esos días — misma medida, mismo signo, mismos estados.
  // Si una barra usara un grupo de estados distinto del de la curva, el día que la línea cruza el
  // cero no sería el día que muestran las barras, y no habría forma de darse cuenta mirando.
  const filtroDeEstados = (f) => [...f.matchAll(/\$H\$2:\$H="([A-Z]+)"/g)].map((m) => m[1]).sort()
  for (const b of PENDIENTES) {
    assert.deepEqual(new Set(filtroDeEstados(necesidadDelDia(0, b.clave))), new Set(NO_REAL), b.clave)
  }
  assert.deepEqual(new Set(filtroDeEstados(saldoSinCobrar(0))), new Set(NO_REAL))
  assert.deepEqual(new Set(filtroDeEstados(saldoProyectado(0))), new Set(NO_REAL))
  assert.deepEqual(filtroDeEstados(necesidadDelDia(0, EJECUTADO)), ['REAL'])
})

test('EL DÍA CON UN PAGO HECHO Y DEUDA VIVA MUESTRA LOS DOS, Y NINGUNO EN CERO', () => {
  // EL TEST NEGATIVO, con los números del caso que lo originó. Si el reparto vuelve a ignorar el
  // estado, «ya salió» cae a 0 y los $4,2M se suman a «Proveedores» pendiente: el gráfico pide
  // $10,6M el mismo día en que hacen falta $6,4M. Los dos totales tienen que poder ser distintos de
  // cero a la vez — un control que no puede mostrar las dos cosas no separa nada.
  const dia = [
    // f834 de Compras: PEDRO TELLO, efectivo, Estado = Pagado. Plata que YA SALIÓ.
    { signo: -1, importe: 4200000, estado: 'REAL', rubro: 'Materiales', instrumento: 'efectivo' },
    // Y deuda comercial viva del mismo día, la que sí hay que conseguir.
    { signo: -1, importe: 6462880.16, estado: 'COMPROMETIDO', rubro: 'Materiales', instrumento: 'transferencia' },
    { signo: -1, importe: 1000000, estado: 'COMPROMETIDO', rubro: 'Nómina · Jornales de obra', instrumento: 'transferencia' },
    // El plan «a pagar con echeq» sin cheque emitido es deuda de proveedores (regla 02/09)…
    { signo: -1, importe: 500000, estado: 'COMPROMETIDO', rubro: 'Materiales', instrumento: 'echeq' },
    // …y la cobertura de un cheque EMITIDO vivo, con su rubro propio, es el balde Cheques.
    { signo: -1, importe: 350000, estado: 'COMPROMETIDO', rubro: 'Cheques emitidos', instrumento: 'echeq' },
    // Una cobranza del día: no es una salida y no cae en ningún balde.
    { signo: 1, importe: 9000000, estado: 'COMPROMETIDO', rubro: 'Cobranzas', instrumento: 'transferencia' },
  ]
  const r = repartirSalidas(dia)
  assert.equal(r.yaSalio, 4200000, 'lo ejecutado del día, en su propia barra')
  assert.equal(r.faltaPagar, 8312880.16, 'lo que todavía hay que conseguir')
  assert.ok(r.yaSalio > 0 && r.faltaPagar > 0, 'los dos a la vez: es el caso que el gráfico no distinguía')
  assert.equal(r.por.ejecutado, 4200000)
  assert.equal(r.por.proveedores, 6962880.16, 'el plan con medio echeq sigue siendo deuda del proveedor')
  assert.equal(r.por.sueldos, 1000000)
  assert.equal(r.por.cheques, 350000, 'sólo el cheque EMITIDO (rubro de cartera) es «Cheques»')
  assert.equal(r.por.impuestos, 0)
  // Y la suma de las barras sigue siendo TODO lo que sale ese día: se separó, no se borró.
  const suma = Object.values(r.por).reduce((a, b) => a + b, 0)
  assert.equal(Math.round(suma * 100) / 100, 12512880.16)
  assert.equal(r.faltaPagar, 8312880.16, 'lo pendiente incluye la cobertura del cheque vivo')
})

test('EL REPARTO NO DEJA UNA SALIDA AFUERA NI LA CUENTA DOS VECES', () => {
  // Los baldes tienen que ser mutuamente excluyentes Y exhaustivos: si una fila cae en dos, el total
  // del día miente hacia arriba; si no cae en ninguna, se pierde un vencimiento sin que nada avise.
  const casos = [
    [{ signo: -1, importe: 1, estado: 'VENCIDO', rubro: 'Impuestos', instrumento: 'transferencia' }, 'impuestos'],
    [{ signo: -1, importe: 1, estado: 'PROYECTADO', rubro: 'Nómina · Cargas sociales', instrumento: '' }, 'cargas'],
    [{ signo: -1, importe: 1, estado: 'REAL', rubro: 'Impuestos', instrumento: 'cheque' }, EJECUTADO],
    [{ signo: -1, importe: 1, estado: 'COMPROMETIDO', rubro: 'Un rubro que nadie enumeró', instrumento: '' }, 'proveedores'],
    // Un sueldo A PAGAR con cheque sigue en SUELDOS mientras el cheque no exista (regla 02/09):
    // el aval del balde Cheques es el cheque emitido, que llega con rubro 'Cheques emitidos'.
    [{ signo: -1, importe: 1, estado: 'COMPROMETIDO', rubro: 'Nómina · Jornales de obra', instrumento: 'cheque' }, 'sueldos'],
    [{ signo: -1, importe: 1, estado: 'COMPROMETIDO', rubro: 'Cheques emitidos', instrumento: 'cheque' }, 'cheques'],
  ]
  for (const [mov, esperado] of casos) assert.equal(baldeDeSalida(mov), esperado, JSON.stringify(mov))
  assert.equal(baldeDeSalida({ signo: 1, importe: 1, estado: 'REAL' }), null, 'una cobranza no es una salida')
  // Un estado que el libro no emite no se inventa un balde: quedaría sumado en una barra equivocada.
  assert.equal(baldeDeSalida({ signo: -1, importe: 1, estado: '' }), null)
})

test('EL BLOQUE PUBLICA UNA COLUMNA POR BALDE Y EL ANEXO ES LO BASTANTE ANCHO', () => {
  // EL MODO DE FALLA QUE ATRAPA: agregar un balde y no agrandar la grilla. `addChart` devuelve
  // «exceeds grid limits» y NINGÚN gráfico se dibuja —el lote es uno solo—, así que el síntoma no es
  // "falta una barra": es una pestaña sin gráficos y sin explicación.
  const h = hojaFalsa()
  const r = bloqueSeries(h)
  assert.equal(r.fNec1 - r.fNec0 + 1, DIAS_NECESIDAD)
  const cab = h.filas[r.fNec0 - 2]
  assert.equal(cab[COL_NECESIDAD.dia - 1], 'Día')
  SALIDAS.forEach((b, i) => assert.equal(cab[COL_NECESIDAD.salidas[i] - 1], b.rotulo, b.clave))
  assert.equal(cab[COL_NECESIDAD.saldoCobrando - 1], 'Saldo si cobra')
  assert.equal(cab[COL_NECESIDAD.saldoSinCobrar - 1], 'Saldo si NO cobra')
  const fila = h.filas[r.fNec0 - 1]
  SALIDAS.forEach((b, i) => assert.equal(fila[COL_NECESIDAD.salidas[i] - 1], necesidadDelDia(0, b.clave)))
  assert.equal(fila[COL_NECESIDAD.saldoSinCobrar - 1], saldoSinCobrar(0))
  // Las dos curvas del reparto viven en sus columnas y son el saldo de hoy partido en efectivo y banco.
  assert.equal(fila[COL_NECESIDAD.saldoEfectivo - 1], saldoEfectivoProyectado(0))
  assert.equal(fila[COL_NECESIDAD.saldoBanco - 1], saldoBancoProyectado(0))
  // La identidad que no se puede romper: efectivo + banco parte del mismo saldo del plan (saldoProyectado).
  assert.ok(saldoBancoProyectado(0).includes(saldoEfectivoProyectado(0).slice(1)),
    'el banco se define como el plan menos el efectivo: comparten el término del efectivo')
  assert.ok(ANCHO_ANEXO >= COL_NECESIDAD.saldoSinCobrar,
    `el anexo tiene ${ANCHO_ANEXO} columnas y el bloque llega a la ${COL_NECESIDAD.saldoSinCobrar}`)
  assert.equal(ANCHOS_ANEXO.length, ANCHO_ANEXO, 'cada columna declara su ancho en píxeles')
})
