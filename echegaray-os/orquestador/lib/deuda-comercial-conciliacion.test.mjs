// LA DEUDA COMERCIAL SE CALCULA DOS VECES Y NADIE MIDE LA DIFERENCIA — el defecto, en tests.
//
// Medido contra el archivo vivo el 17/08/2026 con `auditar-deuda-comercial.mjs`:
//
//   Proveedores!B11              $12.497.040 · 17 facturas   (deuda comercial, aritmética de Compras)
//   componente comercial del libro $13.678.022 · 13 filas     (lo que CAJA publica como deuda)
//   diferencia NETA                 $1.180.982  ← 9%: parece un redondeo
//   diferencia BRUTA               $18.300.332  ← 15 veces más: casi ninguna factura está en las dos
//
// Las dos listas comparten TRES filas de veintisiete. El neto chico es una casualidad de dos
// conjuntos que no se tocan, y un control que mire sólo el neto lo bendice. Estos tests fijan que el
// control publique las dos medidas y que nombre cada peso de la diferencia con su motivo.
//
// Y lo que apareció al abrirla fila por fila —el motivo de que valga la pena tener este control—:
//
//   3 facturas VENCIDAS   $3.937.365   las dos fuentes las ven igual. Es TODO lo que coincide.
//   14 facturas DEL MES   $8.559.675   el libro las tiene como PROYECTADO: la tarjeta las publica
//                                      como plan de gasto, al lado de la nafta estimada.
//   10 ya pagadas         $9.740.657   con cheque sin debitar: caja comprometida que no es deuda.
//
// LOS CASOS SON FILAS REALES, con su número de fila de Compras al lado: si mañana el criterio cambia,
// se puede ir a mirar la factura.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'
import { conciliar, MOTIVOS } from './deuda-comercial-conciliacion.mjs'

const FIN = 46266 // 01/09/2026 — el `hasta` EXCLUIDO de la tarjeta (`EOMONTH(TODAY();0)+1`)

/** Los índices REALES del encabezado de Compras (fila 3), leídos del archivo el 17/08/2026. */
const IX = Object.freeze({
  proveedor: 4, comprobante: 7, cliente: 9, obra: 10, total: 14, tipoPago: 15, fechaPago: 16,
  totalOParcial: 18, montoPagado: 19, parcial1: 20, parcial2: 22, estado: 23, rubro: 27,
  fechaCaja: 29, comercial: 35, cuit: 38,
})

/** El encabezado de Compras tal como lo resuelve `columnasDeCompras`: por rótulo, no por posición.
 *  Los rótulos que el módulo resuelve salen de `NOMBRES_COMPRAS` para que no puedan divergir. */
function encabezado() {
  const h = new Array(40).fill('')
  h[IX.proveedor] = NOMBRES_COMPRAS.proveedor
  h[IX.comprobante] = NOMBRES_COMPRAS.comprobante
  h[IX.cliente] = NOMBRES_COMPRAS.cliente
  h[IX.obra] = NOMBRES_COMPRAS.obra
  h[IX.total] = NOMBRES_COMPRAS.importe
  h[IX.tipoPago] = NOMBRES_COMPRAS.tipoPago
  h[IX.montoPagado] = NOMBRES_COMPRAS.montoPagado
  h[IX.estado] = NOMBRES_COMPRAS.estado
  h[IX.rubro] = NOMBRES_COMPRAS.rubro
  h[IX.fechaCaja] = NOMBRES_COMPRAS.fechaCaja
  h[IX.cuit] = NOMBRES_COMPRAS.cuit
  h[IX.fechaPago] = 'Fecha prevista de pago (día)'
  h[IX.parcial1] = 'Monto Parcial 1'
  h[IX.parcial2] = 'Monto Parcial 2'
  h[IX.totalOParcial] = 'Total o Parcial'
  h[IX.comercial] = '¿Proveedor comercial? (OS)'
  return h
}

/** Una fila de Compras. Todo lo que no se declara queda vacío, igual que en la planilla. */
function fila({ proveedor = 'Proveedor SA', total = 0, fechaPago = null, pagado = 0, parcial1 = 0,
  parcial2 = 0, estado = 'Pendiente', fechaCaja = null, comercial = 1, tipoPago = 'Cheque',
  comprobante = '0001-00000001' } = {}) {
  const f = new Array(40).fill('')
  f[IX.proveedor] = proveedor
  f[IX.comprobante] = comprobante
  f[IX.total] = total
  f[IX.tipoPago] = tipoPago
  if (fechaPago !== null) f[IX.fechaPago] = fechaPago
  f[IX.montoPagado] = pagado
  f[IX.parcial1] = parcial1
  f[IX.parcial2] = parcial2
  f[IX.estado] = estado
  if (fechaCaja !== null) f[IX.fechaCaja] = fechaCaja
  f[IX.comercial] = comercial
  return f
}

/** Compras con su fila 1 de título, la 2 de agrupador, la 3 de encabezado y las filas de datos. */
const compras = (...filas) => [[], [], encabezado(), ...filas]

/** El encabezado real de `_MOVIMIENTOS`, leído del archivo el 17/08/2026. */
const H_MOV = ['Fecha', 'Signo', 'Importe', 'Moneda', 'Concepto', 'Rubro', 'Actividad', 'Estado',
  'Instrumento', 'Contraparte', 'CUIT', 'Comprobante', 'Obra', 'Origen', 'Fila', 'Clave', 'Cliente']

/** Un movimiento del libro que sale de una fila de Compras. */
function mov({ fecha = 0, importe = 0, estado = 'COMPROMETIDO', origen = 'Compras', filaOrigen = 0,
  signo = -1, concepto = 'Proveedor SA' } = {}) {
  const m = new Array(H_MOV.length).fill('')
  m[0] = fecha; m[1] = signo; m[2] = importe; m[3] = 'ARS'; m[4] = concepto
  m[7] = estado; m[13] = origen; m[14] = filaOrigen
  return m
}

const movimientos = (...ms) => [H_MOV, ...ms]

/** El motivo pedido, o `undefined`. */
const motivo = (r, clave) => r.motivos.find((m) => m.clave === clave)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO 1 — $8.559.675 DE FACTURAS REALES PUBLICADAS COMO "PLAN DE GASTO"
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la factura cargada que vence este mes se publica como PLAN y no como deuda', () => {
  // Compras f797 · Alumetal · comprobante 0038-00025942 · $2.014.940,07 · "Pendiente" · echeq · vence
  // el 31/08. En `_MOVIMIENTOS` está, con estado PROYECTADO — porque `estadoDeEgreso` devuelve
  // PROYECTADO para TODA compra no pagada y `estadoContraCorte` sólo la asciende a VENCIDO cuando la
  // fecha ya pasó. La tarjeta de DEUDA no suma PROYECTADO (se sacó el 16/08, con razón: adentro había
  // "Estructura esperada" y "Recurrente esperado · Movistar"), así que esta factura se publica al lado
  // del presupuesto de nafta. Son 14 filas por $8.559.675: el 68% de la deuda comercial del archivo.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Alumetal', comprobante: '0038-00025942', total: 2014940.07, parcial1: -2014940.07, fechaPago: 46265, fechaCaja: 46265, tipoPago: 'Echeq' })),
    movimientos: movimientos(mov({ fecha: 46265, importe: 2014940.07, estado: 'PROYECTADO', filaOrigen: 4 })),
    hasta: FIN,
  })

  assert.equal(Math.round(r.proveedores.monto), 2014940, 'Proveedores sí la ve: es deuda viva')
  assert.equal(Math.round(r.libro.monto), 0, 'y la tarjeta de deuda no la cuenta')

  const m = motivo(r, MOTIVOS.PUBLICADA_COMO_PLAN)
  assert.ok(m, 'la diferencia tiene que salir NOMBRADA, no como un residuo sin explicación')
  assert.equal(Math.round(m.monto), 2014940)
  assert.equal(m.defecto, true, 'una factura con comprobante y vencimiento no es presupuesto')
  assert.equal(m.filas[0].fila, 4, 'con el número de fila de Compras, para poder ir a mirarla')
  assert.equal(m.filas[0].estadoLibro, 'PROYECTADO',
    'y con el estado que le puso el LIBRO: el problema está ahí y no en la factura')
})

test('lo que YA VENCIÓ sí coincide: el libro lo asciende a VENCIDO y las dos fuentes lo ven', () => {
  // Las únicas 3 facturas de 27 que coinciden en el archivo vivo son las vencidas, $3.937.365. Fija
  // que el arreglo del defecto de arriba no puede romper el único tramo que hoy funciona.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Vencida', total: 500000, parcial1: -500000, fechaPago: 46240, fechaCaja: 46240 })),
    movimientos: movimientos(mov({ fecha: 46240, importe: 500000, estado: 'VENCIDO', filaOrigen: 4 })),
    hasta: FIN,
  })
  assert.equal(r.enAmbas, 1)
  assert.equal(r.motivos.length, 0, 'sin diferencia no hay nada que gritar')
  assert.equal(r.hayDefecto, false)
})

test('la factura SIN "Fecha de caja" desaparece del libro entero, y tiene su propio motivo', () => {
  // `deCompras` corta con `if (importe === null || cargada === null) continue`: sin Fecha de caja no
  // hay movimiento de ningún estado. Hoy vale $0 en el archivo (las 14 filas SÍ la tienen cargada),
  // pero el camino existe en el código y es distinto del de arriba: ahí la plata está en el libro con
  // el estado equivocado, acá no está. Confundirlos manda a arreglar el archivo que no es.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Sin caja', total: 300000, parcial1: -300000, fechaPago: 46265 })),
    movimientos: movimientos(),
    hasta: FIN,
  })
  const m = motivo(r, MOTIVOS.SIN_FECHA_DE_CAJA)
  assert.ok(m, 'el motivo tiene que existir aunque hoy no tenga plata: el día que la tenga, nadie mira')
  assert.equal(Math.round(m.monto), 300000)
  assert.equal(m.defecto, true)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO 2 — UN CONTROL QUE MIRA EL NETO BENDICE DOS LISTAS QUE NO SE TOCAN
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el NETO esconde el desacuerdo: el control publica también el BRUTO', () => {
  // Dos facturas distintas por importes parecidos: una sólo la ve Proveedores, la otra sólo el libro.
  // El neto da $40.000 —"cierra al 2%"— y la verdad es que NINGUNA de las dos coincide: $1.960.000 de
  // desacuerdo. Es exactamente la forma del archivo vivo: 3 filas compartidas de 27.
  const r = conciliar({
    compras: compras(
      fila({ proveedor: 'Sólo Proveedores', total: 1000000, parcial1: -1000000, fechaPago: 46260 }),
      fila({ proveedor: 'Sólo el libro', total: 960000, pagado: 960000, estado: 'Pagado', fechaPago: 46260, fechaCaja: 46260 }),
    ),
    movimientos: movimientos(mov({ fecha: 46260, importe: 960000, filaOrigen: 5 })),
    hasta: FIN,
  })

  assert.equal(Math.round(r.neto), 40000, 'el neto es chico y no significa nada')
  assert.equal(Math.round(r.bruto), 1960000,
    'el bruto es la suma de los desacuerdos fila por fila: es el número que decide si hay que mirar')
  assert.equal(r.enAmbas, 0, 'y ninguna factura está en las dos listas')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA GARANTÍA ALGEBRAICA — NINGÚN PESO DE DIFERENCIA SIN MOTIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('los motivos explican la diferencia AL PESO: el residuo tiene que ser CERO', () => {
  // Sin esto, "medir la diferencia" es publicar un número y encogerse de hombros. El residuo se
  // calcula contra los DOS TOTALES agregados, no contra la suma de las filas: si la descomposición se
  // saltea una fila, la resta no cierra y el control se pone rojo en vez de mentir prolijo.
  const r = conciliar({
    compras: compras(
      fila({ proveedor: 'Sin fecha de caja', total: 500000, parcial1: -500000, fechaPago: 46260 }),
      fila({ proveedor: 'Pagada con cheque', total: 300000, pagado: 300000, estado: 'Pagado', fechaPago: 46260, fechaCaja: 46260 }),
      fila({ proveedor: 'Las dos la ven', total: 200000, parcial1: -200000, fechaPago: 46260, fechaCaja: 46260 }),
    ),
    movimientos: movimientos(
      mov({ fecha: 46260, importe: 300000, filaOrigen: 5 }),
      mov({ fecha: 46260, importe: 200000, filaOrigen: 6 }),
    ),
    hasta: FIN,
  })

  assert.equal(Math.round(r.residuo), 0, 'hay diferencia sin motivo: el control no está explicando nada')
  const suma = r.motivos.reduce((a, m) => a + m.monto, 0)
  assert.equal(Math.round(suma), Math.round(r.neto))
  assert.equal(r.enAmbas, 1, 'la tercera factura la ven las dos por el mismo importe')
})

test('una divergencia que el control no sabe nombrar sale como SIN_CLASIFICAR, no se pierde', () => {
  // El motivo "no sé" existe a propósito y es un DEFECTO: un control que sólo conoce los casos que ya
  // vio se calla justo cuando aparece uno nuevo. El caso real: Compras f457 —FCL Junio, $800.000, con
  // Estado="Proyectado"—. No dice "Pendiente" (Proveedores no la ve) ni "Pagado" (no hay instrumento
  // en vuelo que lo explique), y el libro la publica igual. Ninguna causa conocida la cubre.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'FCL', total: 800000, estado: 'Proyectado', fechaPago: 46260, fechaCaja: 46260 })),
    movimientos: movimientos(mov({ fecha: 46260, importe: 800000, filaOrigen: 4 })),
    hasta: FIN,
  })
  const m = motivo(r, MOTIVOS.SIN_CLASIFICAR)
  assert.ok(m, 'una diferencia que no encaja en ningún motivo conocido tiene que gritar igual')
  assert.equal(Math.round(m.monto), -800000)
  assert.equal(m.defecto, true)
  assert.equal(Math.round(r.residuo), 0)
})

test('EL DEFECTO LATENTE: el libro no mira los pagos parciales U y W, y Proveedores sí', () => {
  // `pendienteDeCompra` calcula `Total − Monto Pagado` y no toca "Monto Parcial 1/2";
  // `saldoDeLaFila` calcula `O − T − max(U;0) − max(W;0)`. Son DOS definiciones vivas de "cuánto
  // falta de esta factura". Hoy no cambia un peso —las 143 filas con U/W positivo están todas en
  // "Pagado"— y por eso nadie lo vio: el día que alguien cargue un parcial sobre una factura
  // Pendiente, las dos fuentes publican distinto y sin este motivo la diferencia sale sin nombre.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Parcial', total: 1000000, pagado: 200000, parcial2: 300000, fechaPago: 46260, fechaCaja: 46260 })),
    movimientos: movimientos(mov({ fecha: 46260, importe: 800000, filaOrigen: 4 })),
    hasta: FIN,
  })
  assert.equal(Math.round(r.proveedores.monto), 500000, 'Proveedores descuenta el parcial de W')
  assert.equal(Math.round(r.libro.monto), 800000, 'y el libro lo ignora: 1.000.000 − 200.000')
  const m = motivo(r, MOTIVOS.ARITMETICA)
  assert.ok(m, 'la misma factura con dos saldos distintos tiene su propio motivo')
  assert.equal(Math.round(m.monto), -300000, 'el parcial que una fuente ve y la otra no')
  assert.equal(m.defecto, true, 'un concepto con dos definiciones vivas SÍ es un defecto')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE **NO** ES UN DEFECTO — Y POR QUÉ LA FUENTE ÚNICA NO ES "UNA DE LAS DOS GANA"
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el cheque entregado y sin debitar NO es deuda comercial y SÍ es compromiso de caja', () => {
  // Compras f671 · Alumetal · $946.981,47 · "Pagado" con cheque, Fecha de caja 30/08.
  // El proveedor ya tiene el papel en la mano: no se le debe. La plata no salió del banco: CAJA tiene
  // que reservarla. LAS DOS FUENTES TIENEN RAZÓN — miden preguntas distintas, y por eso este motivo
  // NO es un defecto. Si se marcara como error, el control gritaría todos los días sobre algo correcto
  // y en un mes nadie lo leería.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Alumetal', total: 946981.47, pagado: 946981.47, estado: 'Pagado', fechaPago: 46264, fechaCaja: 46264 })),
    movimientos: movimientos(mov({ fecha: 46264, importe: 946981.47, filaOrigen: 4 })),
    hasta: FIN,
  })
  const m = motivo(r, MOTIVOS.PAGADA_SIN_DEBITAR)
  assert.ok(m)
  assert.equal(Math.round(m.monto), -946981, 'suma del lado del libro: por eso el neto da negativo')
  assert.equal(m.defecto, false, 'es diferencia de CONCEPTO, no error de nadie')
  assert.equal(r.hayDefecto, false, 'y por lo tanto el control no puede declarar defecto')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA MISMA VENTANA — UN CONTROL QUE COMPARA DOS VENTANAS DISTINTAS GRITA SIEMPRE Y NO SIRVE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la ventana se aplica a las dos: lo que vence después del corte no entra por ningún lado', () => {
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Septiembre', total: 900000, parcial1: -900000, fechaPago: 46300, fechaCaja: 46300 })),
    movimientos: movimientos(mov({ fecha: 46300, importe: 900000, filaOrigen: 4 })),
    hasta: FIN,
  })
  assert.equal(Math.round(r.proveedores.monto), 0)
  assert.equal(Math.round(r.libro.monto), 0)
  assert.equal(r.motivos.length, 0, 'sin diferencia no hay nada que gritar')
})

test('la deuda SIN FECHA está DENTRO de la ventana: un vencimiento que falta puede ser mañana', () => {
  // El mismo criterio que `cuotasEnCheque` ya aplica a un cheque sin fecha de pago. Dejarla afuera
  // sería la forma más barata de hacer cerrar el control: se esconde la deuda que menos se controla.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Sin fecha', total: 400000, parcial1: -400000, fechaPago: null })),
    movimientos: movimientos(),
    hasta: FIN,
  })
  assert.equal(Math.round(r.proveedores.monto), 400000)
  assert.equal(motivo(r, MOTIVOS.SIN_FECHA_DE_CAJA).filas.length, 1)
})

test('la factura que las dos ven en MESES distintos no se disfraza de deuda perdida', () => {
  // Compras f636 y f668: la fecha prevista de pago (Q) y la fecha de caja (AD) difieren hasta en un
  // mes. Con Q dentro de la ventana y AD afuera, Proveedores la cuenta y el libro no — pero la plata
  // no se perdió: está en el mes siguiente. Nombrarla igual que a la que desaparece haría que los dos
  // casos se lean iguales, y sólo uno hay que arreglarlo.
  const r = conciliar({
    compras: compras(fila({ proveedor: 'Corrida', total: 700000, parcial1: -700000, fechaPago: 46260, fechaCaja: 46300 })),
    movimientos: movimientos(mov({ fecha: 46300, importe: 700000, filaOrigen: 4 })),
    hasta: FIN,
  })
  const m = motivo(r, MOTIVOS.FECHA_DISTINTA)
  assert.ok(m, 'Q dentro y AD afuera de la ventana tiene su propio motivo')
  assert.equal(Math.round(m.monto), 700000)
  assert.equal(m.defecto, false, 'no es plata perdida: es la misma factura en otro mes')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UN CONTROL NO SE VALIDA CONTRA LA INFORMACIÓN QUE PRODUCE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('si la aritmética JS no reproduce Proveedores!B11 PUBLICADO, el control se declara NO FIEL', () => {
  // Éste es el eslabón que impide que el control sea una conversación conmigo mismo: el lado
  // "Proveedores" lo calcula JS, y el número que el dueño mira lo calcula la fórmula del Sheet. Si los
  // dos no coinciden, lo que el control mide no es lo que la pestaña publica y su diferencia no vale.
  const arg = {
    compras: compras(fila({ proveedor: 'A', total: 1000000, parcial1: -1000000, fechaPago: 46260 })),
    movimientos: movimientos(),
    hasta: FIN,
  }
  assert.equal(conciliar({ ...arg, publicado: 1000000 }).fiel, true)
  assert.equal(conciliar({ ...arg, publicado: 1234567 }).fiel, false,
    'la celda publicada dice otra cosa: el control no puede afirmar nada sobre la diferencia')
  assert.equal(conciliar(arg).fiel, null, 'sin la celda publicada no se puede afirmar fidelidad')
})

test('la fidelidad se mide contra TODA la deuda, no contra la ventana', () => {
  // `Proveedores!B11` no tiene techo de fecha: suma los seis tramos del aging. Compararlo contra la
  // parte de la ventana daría "no fiel" todos los meses por una razón que no es un error.
  const r = conciliar({
    compras: compras(
      fila({ proveedor: 'Agosto', total: 100000, parcial1: -100000, fechaPago: 46260 }),
      fila({ proveedor: 'Octubre', total: 900000, parcial1: -900000, fechaPago: 46330 }),
    ),
    movimientos: movimientos(),
    hasta: FIN,
    publicado: 1000000,
  })
  assert.equal(r.fiel, true)
  assert.equal(Math.round(r.proveedoresTotal.monto), 1000000, 'la deuda entera, sin ventana')
  assert.equal(Math.round(r.proveedores.monto), 100000, 'y la parte que entra en la ventana')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CABLEADO — UN CONTROL QUE EXISTE Y NO CORRE ES UN ARCHIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el auditor CORRE la conciliación y sale con 1 cuando hay defecto', () => {
  // `_MOVIMIENTOS` es el precedente pagado de esta casa: existía, tenía generador, nadie lo corría, y
  // los dos cash flows recalcularon una semana sobre un libro viejo.
  const src = readFileSync(new URL('../scripts/auditar-deuda-comercial.mjs', import.meta.url), 'utf8')
  assert.match(src, /conciliar\(/, 'el auditor tiene que LLAMAR a la conciliación, no reimplementarla')
  assert.match(src, /hayDefecto/, 'y tiene que decidir su código de salida con el resultado')
  assert.match(src, /spreadsheets\.readonly/, 'SÓLO LEE: el token que pide no puede escribir el Sheet')
  // Se mira el CÓDIGO, no la cabecera: el comentario de arriba nombra `--aplicar` justamente para
  // decir que no existe, y una búsqueda sobre el archivo entero se creería su propia advertencia.
  const codigo = src.split('*/').slice(1).join('*/')
  assert.doesNotMatch(codigo, /WRITE_SCOPES|values:update|values:append|values:batchUpdate|--aplicar/,
    'un control que puede escribir la pestaña que audita es el accidente que ya borró Proveedores')
})
