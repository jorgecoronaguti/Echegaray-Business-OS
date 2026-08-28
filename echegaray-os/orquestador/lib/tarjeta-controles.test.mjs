// CADA CONTROL TIENE QUE PODER DAR ROJO. Si no, no es un control: es una constante.
//
// Es la trampa que ya se pagó en este repo —un control que compara una suma contra el total que él
// mismo calculó cierra siempre—. Por eso cada test de acá tiene DOS mitades: el resumen bien leído
// pasa, y el MISMO resumen con un solo número movido falla. Si alguien rompe el control, la segunda
// mitad se pone verde y el test se cae.

import test from 'node:test'
import assert from 'node:assert/strict'
import { verificarResumen, verificarTotalConsumos, verificarADebitar, verificarRG5617, verificarPagoAnterior, verificarProximaCuota, verificarConLosControlesViejos } from './tarjeta-controles.mjs'

/** El resumen del 20/08/2026, en la forma que devuelve el parser. Números del documento real. */
const bueno = () => ({
  resumen: {
    consumosPesosDeclarado: 1949747.67,
    consumosDolaresDeclarado: 544.99,
    consumosPesos: 1949747.67,
    consumosDolares: 544.99,
    cargosPesos: 259210.75,
    aDebitarPesos: 2208958.42,
    aDebitarDolares: 544.99,
    pagoAnterior: { fecha: '2026-08-03', importe: 1384664.47, tc: 1520, aplicadoPesos: -1090924.47, aplicadoDolares: -193.25 },
    pagoMinimo: 1138130,
    pagoMinimoVerificado: true,
  },
  movimientos: [
    { orden: 1, tipo: 'saldo_anterior', concepto: null, pesos: 1090924.47, dolares: 193.25 },
    { orden: 2, tipo: 'pago', concepto: null, pesos: -1090924.47, dolares: -193.25, tc: 1520, importePagado: 1384664.47 },
    { orden: 3, tipo: 'consumo', concepto: null, comercio: 'MERPAGO*MODICAMOTOS', cuota: 8, cuotas: 18, pesos: 355413.33, dolares: 0 },
    { orden: 4, tipo: 'consumo', concepto: null, comercio: 'PINTURERIAS CORDOBA', cuota: 2, cuotas: 3, pesos: 263813.91, dolares: 0 },
    { orden: 5, tipo: 'consumo', concepto: null, comercio: 'GRUAS SAN BLAS SA', cuota: 1, cuotas: 6, pesos: 854068.60, dolares: 0 },
    { orden: 6, tipo: 'consumo', concepto: null, comercio: 'MERPAGO*BAIRES4', cuota: 1, cuotas: 6, pesos: 73315.55, dolares: 0 },
    { orden: 7, tipo: 'consumo', concepto: null, comercio: 'PINTURERIAS CORDOBA', cuota: 3, cuotas: 3, pesos: 346636.28, dolares: 0 },
    { orden: 8, tipo: 'consumo', concepto: null, comercio: 'MERPAGO*CORREOARG', cuota: null, cuotas: null, pesos: 24000, dolares: 0 },
    { orden: 9, tipo: 'consumo', concepto: null, comercio: 'DLO*STARLINK ARGENTINA', cuota: null, cuotas: null, pesos: 32500, dolares: 0 },
    { orden: 10, tipo: 'consumo', concepto: null, comercio: 'ANTHROPIC', cuota: null, cuotas: null, pesos: 0, dolares: 544.99 },
    { orden: 11, tipo: 'cargo', concepto: 'sellos', pesos: 10533.61, dolares: 0 },
    { orden: 12, tipo: 'cargo', concepto: 'sellos_provinciales', pesos: 3922.14, dolares: 0 },
    { orden: 13, tipo: 'cargo', concepto: 'rg5617', pesos: 244755, dolares: 0, base: 815850.03 },
  ],
  cuotas: {
    porMes: [{ mes: '2026-09-01', importe: 1546611.33 }, { mes: '2026-10-01', importe: 355413.33 }],
    cola: { desde: '2027-03-01', total: 1421653.32, cuotas: 4, cuota: 355413.33 },
    total: 3323677.98,
  },
  rechazos: [],
})

const estado = (l, nombre) => l.find((x) => x.nombre.startsWith(nombre))?.estado

test('el resumen real cierra: las once identidades en verde', () => {
  const v = verificarResumen(bueno())
  assert.equal(v.cierra, true, v.fallas.map((f) => f.nombre).join(' · '))
  assert.equal(v.controles.filter((c) => c.estado === 'ok').length, 11)
})

// ═══ UNA LÍNEA PERDIDA AL LEER EL PDF ═══

test('si se pierde un consumo, la suma NO da el total que imprime el banco', () => {
  const p = bueno()
  p.movimientos = p.movimientos.filter((m) => m.comercio !== 'MERPAGO*CORREOARG')
  assert.equal(estado(verificarTotalConsumos(p), 'total de consumos en pesos'), 'falla')
})

test('si se pierde un consumo en dólares, lo grita la columna de dólares', () => {
  const p = bueno()
  p.movimientos = p.movimientos.map((m) => (m.dolares > 0 ? { ...m, dolares: 500 } : m))
  assert.equal(estado(verificarTotalConsumos(p), 'total de consumos en dólares'), 'falla')
})

// ═══ UN TYPO EN CUALQUIERA DE LOS SUMANDOS ═══

test('un cargo mal transcripto rompe la identidad del documento entero', () => {
  const p = bueno()
  p.movimientos = p.movimientos.map((m) => (m.concepto === 'sellos' ? { ...m, pesos: 10533.16 } : m))
  const v = verificarADebitar(p)
  assert.equal(estado(v, 'a debitar en pesos'), 'falla')
  assert.equal(Math.abs(v[0].diferencia), 0.45)
})

test('y también rompe el control viejo de banco-santander, que cruza los cargos uno por uno', () => {
  const p = bueno()
  p.movimientos = p.movimientos.map((m) => (m.concepto === 'rg5617' ? { ...m, pesos: 244755.99 } : m))
  assert.equal(estado(verificarConLosControlesViejos(p), 'consumos + sellos'), 'falla')
})

test('el control viejo NO se fuerza cuando el resumen no tiene su forma: dice que no aplica', () => {
  // Un resumen con intereses de financiación (el saldo anterior no se canceló) no cumple la
  // identidad de los cuatro sumandos. Decir "ok" ahí sería un verde inventado.
  const p = bueno()
  p.movimientos.push({ orden: 14, tipo: 'cargo', concepto: 'interes_financiacion', pesos: 5000, dolares: 0 })
  assert.equal(estado(verificarConLosControlesViejos(p), 'consumos + sellos'), 'no_aplica')
})

// ═══ LA PERCEPCIÓN SE VERIFICA A SÍ MISMA, Y VERIFICA LOS DÓLARES ═══

test('si la base de la percepción no da el 30%, se cae', () => {
  const p = bueno()
  p.movimientos = p.movimientos.map((m) => (m.concepto === 'rg5617' ? { ...m, base: 800000 } : m))
  assert.equal(estado(verificarRG5617(p), 'percepción RG 5617 = 30%'), 'falla')
})

test('la base en PESOS explica el consumo en DÓLARES: el TC deducido es 1.497', () => {
  const v = verificarRG5617(bueno())
  assert.equal(v[1].suma, 1497)
  assert.match(v[1].detalle, /TC deducido/)
})

// ═══ EL PAGO ANTERIOR: LA IDENTIDAD QUE CONVIERTE UN DÉBITO EN PRUEBA ═══

test('el pago anterior explica los dos saldos que canceló, al centavo', () => {
  assert.equal(estado(verificarPagoAnterior(bueno()), 'el pago anterior'), 'ok')
})

test('si el importe pagado no es la suma de los dos saldos convertidos, se cae', () => {
  const p = bueno()
  p.resumen.pagoAnterior = { ...p.resumen.pagoAnterior, importe: 1300000 }
  assert.equal(estado(verificarPagoAnterior(p), 'el pago anterior'), 'falla')
})

test('sin tipo de cambio declarado y con dólares en juego, NO se afirma nada', () => {
  const p = bueno()
  p.resumen.pagoAnterior = { ...p.resumen.pagoAnterior, tc: null }
  assert.equal(estado(verificarPagoAnterior(p), 'pago del período anterior'), 'no_verificable')
})

// ═══ EL CONTROL QUE SOSTIENE LA PROYECCIÓN ═══

test('la primera fila de "cuotas a vencer" se reconstruye desde las compras en cuotas vivas', () => {
  // 355.413,33 + 263.813,91 + 854.068,60 + 73.315,55 = 1.546.611,39 contra 1.546.611,33 publicados:
  // 6 centavos, que son el redondeo que el propio banco arrastra por plan.
  const v = verificarProximaCuota(bueno())
  assert.equal(v[0].estado, 'ok')
  assert.equal(v[0].suma, 1546611.39)
  assert.equal(v[0].diferencia, 0.06)
})

test('si una cuota viva se leyó mal, el piso de la proyección deja de ser un hecho y se avisa', () => {
  const p = bueno()
  p.movimientos = p.movimientos.map((m) => (m.comercio === 'GRUAS SAN BLAS SA' ? { ...m, pesos: 854068.60 + 500 } : m))
  assert.equal(verificarProximaCuota(p)[0].estado, 'falla')
})

test('una compra en la ÚLTIMA cuota no vuelve a facturarse, y no entra en la reconstrucción', () => {
  // PINTURERIAS C.03/03 se paga en este resumen y ya está: contarla inflaría la proyección del mes
  // que viene en $346.636,28 todos los meses.
  const p = bueno()
  const conUltima = verificarProximaCuota(p)[0].suma
  p.movimientos = p.movimientos.filter((m) => !(m.cuota === 3 && m.cuotas === 3))
  assert.equal(verificarProximaCuota(p)[0].suma, conUltima)
})

// ═══ EL PAGO MÍNIMO NO VERIFICADO NO ES UNA FALLA, ES UN HUECO DECLARADO ═══

test('un resumen sin pago mínimo identificable entra igual, con el hueco a la vista', () => {
  const p = bueno()
  p.resumen.pagoMinimoVerificado = false
  p.resumen.pagoMinimo = null
  p.resumen.pagoMinimoMotivo = 'el talón no repite el importe a debitar'
  const v = verificarResumen(p)
  assert.equal(v.cierra, true, 'no bloquea la carga')
  assert.equal(estado(v.controles, 'pago mínimo'), 'no_verificable')
})
