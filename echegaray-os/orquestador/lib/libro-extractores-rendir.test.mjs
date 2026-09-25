// EFECTIVO A RENDIR EN EL CASH FLOW (22/09/2026): el período cierra contra CAJA.
//
// La cuenta que se fija: la línea de fondos = −entregado + devuelto + rendido, el gasto sigue en su
// rubro, y el Resultado del período es la variación real de la caja (sólo entregas y devoluciones).
// Se evalúa con el MISMO evaluador que persiste los períodos en Postgres (flujo-persistencia) y con
// los mismos términos que escribe la hoja (cash-flow-medidas): no con una suma armada para el test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deEfectivoARendir, rendidoDelLibro, fuenteViva, RUBRO_FONDOS_A_RENDIR, ORIGEN_RENDIR,
} from './libro-extractores-rendir.mjs'
import { movimiento, SALE, ENTRA } from './libro-movimientos.mjs'
import { medidasDeVentana, rubrosDeVentana } from './flujo-persistencia.mjs'
import { RUBROS_EGRESO, esDevolucion } from './cash-flow-rubros.mjs'
import { celdaEstado, celdaImporte } from './libro-estado-vivo.mjs'
import { duenoDe, verificarCobertura, problemasDeRol } from './cash-flow-cobertura.mjs'

// Seriales de Sheets: 01/09/2026 = 46266, 19/09 = 46284, 22/09 = 46287, 23/09 = 46288, 01/10 = 46296.
const SEP = 46266; const OCT = 46296; const D19 = 46284; const D22 = 46287; const D23 = 46288

// La réplica tal como la escribe efectivo-raw-pestana.mjs: título, nota, rótulos y los datos desde la 4.
const RAW = [
  ['_EFECTIVO_RAW — …'], ['nota'], ['Fecha', 'Entrega', 'Persona', 'Destino', 'Movimiento', 'Importe'],
  [D19, 'ER-0001', 'Gerson', 'Galpón 9', 'Entrega', -1000000],
  [D22, 'ER-0002', 'Tello', 'Quattropani', 'Entrega', -800000],
  [D22, 'ER-0002', 'Tello', 'Quattropani', 'Devolución', 300000],
  // Fecha como TEXTO: CAJA la ignora (ISNUMBER), el libro también — y avisa.
  ['2026-09-22', 'ER-0003', 'X', '', 'Entrega', -5000],
]

/** El ticket rendido, como lo emite `deCompras`: Materiales, «A rendir», pagado el 23/09. */
const ticket = (o = {}) => ({
  ...movimiento({
    fecha: D23, signo: SALE, importe: 19999.9, concepto: 'Corralón Progreso', contraparte: 'Corralón Progreso',
    rubro: 'Materiales Civil', estado: 'REAL', instrumento: 'a_rendir', cliente: '', obra: 'Galpón 9',
    cuit: '23369111574', comprobante: '0003-00001234', origen: { pestana: 'Compras', fila: 994 }, ...o,
  }),
  saldoVivo: true,
})

function libroDePrueba(extra = []) {
  const avisos = []
  const entregas = deEfectivoARendir(RAW, { aviso: (m) => avisos.push(m) })
  const base = [...entregas, ticket(), ...extra]
  return { libro: [...base, ...rendidoDelLibro(base)], avisos, entregas }
}

const fila = (filas, rubro) => filas.find((f) => f.rubro === rubro)

test('la réplica entra al libro con el signo del TIPO, REAL, y la fecha-texto se saltea avisando', () => {
  const { entregas, avisos } = libroDePrueba()
  assert.equal(entregas.length, 3)
  assert.deepEqual(entregas.map((m) => [m.signo, m.importe, m.estado, m.rubro]), [
    [SALE, 1000000, 'REAL', RUBRO_FONDOS_A_RENDIR],
    [SALE, 800000, 'REAL', RUBRO_FONDOS_A_RENDIR],
    [ENTRA, 300000, 'REAL', RUBRO_FONDOS_A_RENDIR],
  ])
  assert.equal(entregas[0].instrumento, 'efectivo', 'la entrega es billete del cajón')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /f7/)
})

test('SETIEMBRE: la línea de fondos = −entregado + devuelto + rendido, al centavo', () => {
  const { libro } = libroDePrueba()
  const tot = medidasDeVentana(libro, SEP, OCT)
  const f = fila(rubrosDeVentana(libro, SEP, OCT, tot), RUBRO_FONDOS_A_RENDIR)
  // El cuadro muestra los egresos en positivo: +1.480.000,10 de egreso es −1.480.000,10 de caja.
  assert.equal(f.egreso_real, 1000000 + 800000 - 300000 - 19999.9)
  assert.equal(f.resultado, -1000000 - 800000 + 300000 + 19999.9)
  // El gasto NO se pierde: sigue en su rubro.
  assert.equal(fila(rubrosDeVentana(libro, SEP, OCT, tot), 'Materiales Civil').egreso_real, 19999.9)
  // Y el período entero cierra contra la caja: sólo se movieron la entrega y la devolución.
  assert.equal(tot.resultado, -1000000 - 800000 + 300000)
})

test('el día del ticket la caja no se mueve: Materiales −19.999,90 y la línea de fondos +19.999,90', () => {
  const { libro } = libroDePrueba()
  const tot = medidasDeVentana(libro, D23, D23 + 1)
  const filas = rubrosDeVentana(libro, D23, D23 + 1, tot)
  assert.equal(fila(filas, 'Materiales Civil').egreso_real, 19999.9)
  assert.equal(fila(filas, RUBRO_FONDOS_A_RENDIR).egreso_real, -19999.9)
  assert.equal(tot.resultado, 0)
  // El espejo no es un ingreso: netea del lado del egreso, así que ingresos reales sigue en cero.
  assert.equal(tot.ingreso_real, 0)
})

test('el día de la entrega la línea sale −800.000 + 300.000 devueltos', () => {
  const { libro } = libroDePrueba()
  const tot = medidasDeVentana(libro, D22, D22 + 1)
  assert.equal(fila(rubrosDeVentana(libro, D22, D22 + 1, tot), RUBRO_FONDOS_A_RENDIR).egreso_real, 500000)
  assert.equal(tot.resultado, -500000)
})

test('un gasto «A rendir» todavía pendiente se espeja PENDIENTE: la proyección tampoco lo cuenta como caja', () => {
  const pend = ticket({ estado: 'PROYECTADO', fecha: OCT + 3, origen: { pestana: 'Compras', fila: 995 }, comprobante: '' })
  const { libro } = libroDePrueba([pend])
  const tot = medidasDeVentana(libro, OCT, OCT + 31)
  assert.equal(tot.egreso_proyectado, 0, 'el fondo ya salió con la entrega: el gasto pendiente no vuelve a restar')
  assert.equal(tot.resultado, 0)
})

test('sólo se espeja «A rendir», nunca un espejo, y el espejo no choca con la clave de la factura', () => {
  const efectivo = ticket({ instrumento: 'efectivo', origen: { pestana: 'Compras', fila: 10 } })
  const base = [ticket(), efectivo]
  const esp = rendidoDelLibro(base)
  assert.equal(esp.length, 1)
  assert.equal(rendidoDelLibro([...base, ...esp]).length, 1, 'el espejo no se espeja')
  assert.notEqual(esp[0].clave, base[0].clave)
  assert.equal(esp[0].origen.pestana, ORIGEN_RENDIR)
  assert.equal(esp[0].cliente, '')
  assert.equal(esp[0].obra, '', 'el espejo no es costo de ninguna obra')
  assert.ok(esDevolucion(esp[0]), 'entra con rubro de egreso: netea su propio rubro')
})

test('las celdas vivas del espejo miran la MISMA fila de Compras que el gasto', () => {
  const pend = ticket({ estado: 'PROYECTADO', origen: { pestana: 'Compras', fila: 995 } })
  const [esp] = rendidoDelLibro([pend])
  const cols = { estado: 'X', total: 'O', montoPagado: 'T' }
  assert.equal(celdaEstado(fuenteViva(esp), 'X'), celdaEstado(pend, 'X'))
  assert.match(celdaEstado(fuenteViva(esp), 'X'), /^=IF\(INDEX\(Compras!\$X:\$X;995\)="Pagado";"REAL";"PROYECTADO"\)$/)
  assert.equal(celdaImporte(fuenteViva(esp), cols), celdaImporte(pend, cols))
  assert.equal(fuenteViva(pend), pend, 'un movimiento que no es espejo se mira a sí mismo')
})

test('la línea está en el cuadro, con dueño declarado y la réplica en el mapa como FUENTE', () => {
  assert.ok(RUBROS_EGRESO.includes(RUBRO_FONDOS_A_RENDIR))
  assert.equal(duenoDe(RUBRO_FONDOS_A_RENDIR)?.dueno, ORIGEN_RENDIR)
  assert.deepEqual(verificarCobertura(), [])
  assert.deepEqual(problemasDeRol(libroDePrueba().libro), [])
})

// ═══ EL ADELANTO DE SUELDO PAGADO CON LA PLATA DE UNA ENTREGA (dueño, 25/09/2026) ═══
//
// La cuenta con números: a Nievas le entregan $100.000 (ER-0021). Con esa plata le da $20.000 de adelanto a
// Pastrán y lo escribe en el canal Efectivo. La quincena de Pastrán son $500.000 en efectivo, y Jornales la
// resta ENTERA al pagarse (adelanto + recibo). El cajón de verdad pierde $100.000 el día de la entrega y
// $480.000 el día de pago: $580.000. Sin la vuelta del adelanto el libro restaba $600.000.
test('el adelanto de sueldo vuelve del fondo: el billete sale UNA vez (entrega + quincena − adelanto)', () => {
  const RAW_ADEL = [
    ['_EFECTIVO_RAW — …'], ['nota'], ['Fecha', 'Entrega', 'Persona', 'Destino', 'Movimiento', 'Importe'],
    [D19, 'ER-0021', 'NIEVAS VILLEGAS JUAN PABLO', 'Estructura', 'Entrega', -100000],
    [D22, 'ER-0021', 'NIEVAS VILLEGAS JUAN PABLO', 'Sueldo de PASTRAN MARCELO IVAN', 'Adelanto de sueldo', 20000],
  ]
  const fondos = deEfectivoARendir(RAW_ADEL)
  assert.deepEqual(fondos.map((m) => [m.signo, m.importe, m.rubro]), [
    [SALE, 100000, RUBRO_FONDOS_A_RENDIR],
    [ENTRA, 20000, RUBRO_FONDOS_A_RENDIR],
  ])
  assert.match(fondos[1].concepto, /Adelanto de sueldo pagado de ER-0021 · NIEVAS VILLEGAS JUAN PABLO → PASTRAN MARCELO IVAN/)
  // La quincena, pagada entera en efectivo el 01/10 (así la trae Jornales: adelanto + recibo).
  const quincena = movimiento({
    fecha: OCT, signo: SALE, importe: 500000, concepto: 'Jornales 16–30/09', contraparte: 'Plantel',
    rubro: 'Nómina · Jornales de obra', estado: 'REAL', instrumento: 'efectivo', origen: { pestana: 'Jornales por Quincena', fila: 30 },
  })
  const libro = [...fondos, quincena]
  const tot = medidasDeVentana(libro, SEP, OCT + 1)
  assert.equal(tot.resultado, -(100000 + 500000 - 20000), 'el cajón pierde 580.000, no 600.000')
  // El día del adelanto el fondo baja por 20.000 (vuelven a la empresa como sueldo) …
  const d22 = medidasDeVentana(libro, D22, D22 + 1)
  assert.equal(d22.resultado, 20000)
  // … y el sueldo de la quincena sale entero por Nómina el día de pago, como un adelanto dado desde la oficina.
  assert.equal(fila(rubrosDeVentana(libro, OCT, OCT + 1, medidasDeVentana(libro, OCT, OCT + 1)), 'Nómina · Jornales de obra').egreso_real, 500000)
})
