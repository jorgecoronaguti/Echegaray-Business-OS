// QUE LA REGLA 8 NO DEPENDA DE QUE ALGUIEN SUME A MANO.
//
// Cada test de acá reproduce un defecto MEDIDO sobre el archivo vivo el 06/09/2026, no un caso
// inventado. Revertir el arreglo que cada uno protege lo pone rojo:
//
//   · 3 quincenas por $14.992.277 fechadas el 01/01/2027 que no aparecen en ninguna celda de ninguna
//     de las dos vistas, porque las dos están acotadas al ejercicio.
//   · 13 filas de Compras por $6.502.878 que el Libro descarta por colisión de clave, y otras 13 que
//     PARECÍAN descartadas y no lo estaban: viajaban partidas en cuotas de cheque, con la fila citada
//     como texto ("76 · cheque 104"). Leerlas con `Number` daba un falso positivo del mismo tamaño.
//   · 21 filas de Compras por $903.794 sin "Fecha de caja": desaparecen y ninguna exclusión las explica.
//   · 2 cobros endosados por $20.000.000 que el emparejamiento por orden de aparición le adjudicaba a
//     la primera fila de ese importe —que estaba cubierta—, publicando un rojo falso.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CENSADAS, EXCLUSIONES_COBRANZAS, EXCLUSIONES_COMPRAS, SIN_CENSO_DE_FILA,
  censoDeCobranzas, censoDeCompras, coberturaDeFuente, filasCubiertas, fueraDeLaVentana,
  marcarEndosos, origenesSinDeclarar, resumenDeCobertura, serialDe, ventanaDelEjercicio,
} from './cobertura-archivo.mjs'

const V = ventanaDelEjercicio(2026)
const mov = (o) => ({ origen: 'Compras', fila: 1, importe: 1, fecha: serialDe(2026, 6, 1), rubro: '', estado: 'REAL', ...o })

// Las columnas que devolvería `columnasDeCompras` sobre el encabezado real; acá se fijan a mano para
// que el test no dependa de un archivo.
const COLS_COMPRAS = { importe: 0, fechaCaja: 1, rubro: 2, proveedor: 3, comprobante: 4, cuit: 5, estado: 6, tipoPago: 7 }
const COLS_COBRANZAS = { importe: 0, estado: 1, cliente: 2, fechaEsperada: 3 }
/** Compras con 3 filas de relleno arriba (título, agrupador, encabezado) para que los datos vayan en la 4. */
const hojaCompras = (filas) => [[], [], [], ...filas]
/** Cobranzas con 4 de relleno: los datos arrancan en la 5. */
const hojaCobranzas = (filas) => [[], [], [], [], ...filas]

test('la ventana del ejercicio es el año entero y ni un día más', () => {
  assert.equal(V.desde, serialDe(2026, 1, 1))
  assert.equal(V.hasta, serialDe(2027, 1, 1))
})

test('ESLABÓN 2 · una quincena fechada el 01/01/2027 no la muestra ninguna celda', () => {
  const movs = [
    mov({ origen: 'Jornales por Quincena', fila: 'Quincenas proyectadas:9', importe: 14_992_277, fecha: serialDe(2027, 1, 1) }),
    mov({ importe: 1_000_000, fecha: serialDe(2026, 12, 31) }),
  ]
  const r = fueraDeLaVentana(movs, V)
  assert.equal(r.n, 1, 'el 31/12 está DENTRO y el 01/01 del año siguiente está afuera')
  assert.equal(r.monto, 14_992_277)
  assert.match(r.porOrigen[0].clave, /Jornales por Quincena · posterior al ejercicio/)
})

test('ESLABÓN 2 · un movimiento anterior al ejercicio tampoco se ve, y se nombra distinto', () => {
  const r = fueraDeLaVentana([mov({ importe: 500, fecha: serialDe(2025, 12, 31) })], V)
  assert.equal(r.n, 1)
  assert.equal(r.detalle[0].motivo, 'anterior al ejercicio')
})

test('ESLABÓN 2 · una fecha que no es número no la suma ninguna fórmula (ISNUMBER)', () => {
  // `terminoLibro` antepone ISNUMBER(fecha) a todo filtro. Una celda vacía compara como 0 y caería
  // dentro de cualquier ventana que arranque en el serial 0: por eso el libro la excluye y el control
  // tiene que contarla como plata que no se ve.
  const r = fueraDeLaVentana([mov({ importe: 777, fecha: '' }), mov({ importe: 888, fecha: 'ver nota' })], V)
  assert.equal(r.n, 2)
  assert.equal(r.monto, 1665)
  assert.equal(r.detalle[0].motivo, 'fecha que no es un número')
})

test('ESLABÓN 2 · la magnitud, no el neto: una devolución que se pierde es tan invisible como un pago', () => {
  const r = fueraDeLaVentana([
    mov({ importe: 1000, signo: -1, fecha: serialDe(2027, 2, 1) }),
    mov({ importe: -1000, signo: 1, fecha: serialDe(2027, 2, 1) }),
  ], V)
  assert.equal(r.monto, 2000, 'si se netearan darían $0 y el control publicaría que no falta nada')
})

test('ESLABÓN 1 · la compra partida en cuotas de cheque SÍ está cubierta (cita su fila como texto)', () => {
  // El defecto: `Number("76 · cheque 104")` es NaN, así que la fila 76 aparecía como no cubierta y el
  // control denunciaba $6,5M que sí estaban en el cuadro.
  const cub = filasCubiertas([
    mov({ origen: 'Compras', fila: '76 · cheque 104' }),
    mov({ origen: 'Compras', fila: 75 }),
    mov({ origen: 'Cobranzas', fila: 200 }),
  ], 'Compras')
  assert.ok(cub.has(76), 'la fila 76 viaja en cuotas de cheque y está cubierta')
  assert.ok(cub.has(75))
  assert.ok(!cub.has(200), 'una fila de otra pestaña no cubre nada acá')
})

test('ESLABÓN 1 · la fila de Compras sin "Fecha de caja" se censa y sale como HUECO', () => {
  const filas = hojaCompras([
    [4903, null, 'Materiales Civil', 'Corralon Progreso', '', '', 'Pendiente', ''],
    [100000, serialDe(2026, 5, 5), 'Materiales Civil', 'Alumetal', '0001-1', '30-1-1', 'Pagado', 'Transferencia'],
  ])
  const renglones = censoDeCompras(filas, COLS_COMPRAS)
  assert.equal(renglones.length, 2, 'la fila sin fecha se CENSA: dejarla afuera la haría invisible para su control')
  const r = coberturaDeFuente({
    pestana: 'Compras', renglones, cubiertas: filasCubiertas([mov({ fila: 5 })], 'Compras'),
    exclusiones: EXCLUSIONES_COMPRAS,
  })
  assert.equal(r.cubierto, 100000)
  assert.equal(r.hueco, 4903)
  assert.equal(r.declarado, 0)
  assert.match(r.porMotivoHueco[0].clave, /"Fecha de caja" está vacía/)
})

test('ESLABÓN 1 · la nómina y la cadena de cargas son exclusiones DECLARADAS, no huecos', () => {
  const filas = hojaCompras([
    [142_559_222, serialDe(2026, 3, 1), 'Nómina · Jornales de obra', 'varios', '', '', 'Pagado', ''],
    [26_000_000, serialDe(2026, 3, 1), 'Nómina · Cargas sociales', 'ARCA', '', '', 'Pendiente', ''],
  ])
  const r = coberturaDeFuente({
    pestana: 'Compras', renglones: censoDeCompras(filas, COLS_COMPRAS),
    cubiertas: new Set(), exclusiones: EXCLUSIONES_COMPRAS,
  })
  assert.equal(r.hueco, 0)
  assert.equal(r.declarado, 168_559_222)
})

test('ESLABÓN 1 · una carga social PAGADA no la explica la cadena: entra por Compras o es hueco', () => {
  // La cadena reemplaza sólo lo PROYECTADO. Si una fila pagada no llegó al libro, es un hueco real.
  const filas = hojaCompras([[9_000_000, serialDe(2026, 3, 1), 'Nómina · Cargas sociales', 'ARCA', '', '', 'Pagado', '']])
  const r = coberturaDeFuente({
    pestana: 'Compras', renglones: censoDeCompras(filas, COLS_COMPRAS),
    cubiertas: new Set(), exclusiones: EXCLUSIONES_COMPRAS,
  })
  assert.equal(r.hueco, 9_000_000)
  assert.equal(r.declarado, 0)
})

test('ESLABÓN 1 · el endoso explica sólo a la fila que el LIBRO dejó afuera', () => {
  // El rojo falso: la primera fila de $10.000.000 estaba cubierta y se llevaba el endoso, así que la
  // fila 43 —la realmente excluida— salía como hueco de $10.000.000.
  const filas = hojaCobranzas([
    [10_000_000, 'Cobrado', 'ARCOR', serialDe(2026, 7, 1)],   // fila 5, cubierta
    [10_000_000, 'Cobrado', 'LA ESTRELLA', serialDe(2026, 8, 15)], // fila 6, endosada
  ])
  const cubiertas = filasCubiertas([mov({ origen: 'Cobranzas', fila: 5 })], 'Cobranzas')
  const renglones = marcarEndosos(censoDeCobranzas(filas, COLS_COBRANZAS), [10_000_000], cubiertas)
  assert.equal(renglones[0].endosado, false, 'la fila cubierta no consume el endoso')
  assert.equal(renglones[1].endosado, true)
  const r = coberturaDeFuente({ pestana: 'Cobranzas', renglones, cubiertas, exclusiones: EXCLUSIONES_COBRANZAS })
  assert.equal(r.hueco, 0)
  assert.equal(r.declarado, 10_000_000)
})

test('ESLABÓN 1 · uno a uno: dos cobros endosados consumen dos valores, no uno', () => {
  const filas = hojaCobranzas([
    [10_000_000, 'Cobrado', 'LA ESTRELLA', serialDe(2026, 8, 15)],
    [10_000_000, 'Cobrado', 'LA ESTRELLA', serialDe(2026, 8, 31)],
    [10_000_000, 'Cobrado', 'LA ESTRELLA', serialDe(2026, 9, 15)],
  ])
  const renglones = marcarEndosos(censoDeCobranzas(filas, COLS_COBRANZAS), [10_000_000, 10_000_000], new Set())
  assert.deepEqual(renglones.map((r) => r.endosado), [true, true, false])
  const r = coberturaDeFuente({ pestana: 'Cobranzas', renglones, cubiertas: new Set(), exclusiones: EXCLUSIONES_COBRANZAS })
  assert.equal(r.hueco, 10_000_000, 'el tercer cobro sin endoso libre sigue siendo un hueco')
})

test('EL CONTROL PUEDE DAR ROJO Y PUEDE DAR VERDE — las dos ramas, sobre los mismos datos', () => {
  const renglones = [{ fila: 5, monto: 1000, rubro: 'Materiales Civil', motivoHueco: 'x' }]
  const limpio = resumenDeCobertura({
    fuentes: [coberturaDeFuente({ pestana: 'Compras', renglones, cubiertas: new Set([5]) })],
    fuera: fueraDeLaVentana([], V),
  })
  assert.equal(limpio.ok, true)
  assert.equal(limpio.noLlegaALaVista, 0)

  const sucio = resumenDeCobertura({
    fuentes: [coberturaDeFuente({ pestana: 'Compras', renglones, cubiertas: new Set() })],
    fuera: fueraDeLaVentana([], V),
  })
  assert.equal(sucio.ok, false)
  assert.equal(sucio.noLlegaALaVista, 1000)
})

test('el eslabón 1 limpio NO alcanza para dar verde: la ventana también cuenta', () => {
  const r = resumenDeCobertura({
    fuentes: [coberturaDeFuente({ pestana: 'Compras', renglones: [{ fila: 5, monto: 1000 }], cubiertas: new Set([5]) })],
    fuera: fueraDeLaVentana([mov({ importe: 14_992_277, fecha: serialDe(2027, 1, 1) })], V),
  })
  assert.equal(r.hueco, 0)
  assert.equal(r.ok, false, 'toda la plata produjo movimiento y aun así hay $15M que ninguna celda muestra')
  assert.equal(r.noLlegaALaVista, 14_992_277)
})

test('un origen nuevo en el Libro que nadie declaró deja la regla 8 sin medir, y se dice', () => {
  assert.deepEqual(origenesSinDeclarar([mov({ origen: 'Compras' }), mov({ origen: 'SUBCONTRATISTAS' })]), ['SUBCONTRATISTAS'])
  assert.deepEqual(origenesSinDeclarar([mov({ origen: 'Estructura' })]), [], 'lo declarado sin censo NO es un origen sin declarar')
})

test('el inventario de fuentes no se contradice a sí mismo', () => {
  const todas = [...CENSADAS, ...SIN_CENSO_DE_FILA.map((s) => s.pestana)]
  assert.equal(new Set(todas).size, todas.length, 'una pestaña no puede estar censada y sin censar a la vez')
  for (const s of SIN_CENSO_DE_FILA) {
    assert.ok(s.porque.length > 40, `"${s.pestana}" se declara sin censo sin explicar por qué`)
  }
  for (const e of [...EXCLUSIONES_COMPRAS, ...EXCLUSIONES_COBRANZAS]) {
    assert.ok(e.porque.length > 40, `la exclusión "${e.motivo}" no dice por qué esa plata no va al cuadro`)
  }
})
