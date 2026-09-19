// LA CONECTIVIDAD DE LAS DOS VISTAS, EN FRÍO — cada caso es uno medido sobre el archivo vivo el 06/08.
//
// Ningún test acá inventa una situación: los cuatro defectos tienen fila, monto y fecha reales, y por
// eso revertir el arreglo los pone en rojo con el número puesto.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rejilla, medidaDe, ubicar, plataSinColumna, dobleConteoDelAncla,
  valorPorDosPuertas, rubrosEnOtros, bordesEntreVistas, RUBRO_CARTERA,
} from './cash-flow-conectividad.mjs'
import { filaDeConcepto } from './cash-flow-matriz.mjs'
import { claveSub, OTROS } from './cash-flow-rubros.mjs'
import { deCobranzas } from './libro-extractores.mjs'

const ANIO = 2026
/** CAJA_FECHA_SALDO leída del archivo vivo el 06/08/2026. */
const FECHA_SALDO = 46240
const mov = (o) => ({ signo: -1, importe: 0, estado: 'REAL', rubro: 'Materiales Civil', instrumento: 'transferencia', origen: 'Compras', ...o })

// ══ LA GEOMETRÍA: DÓNDE CAE CADA MÉTODO DE PAGO ═══════════════════════════════════════════════════

test('la rejilla de 2026 son 53 semanas y 12 meses, y AHORA cubren el mismo período', () => {
  const s = rejilla('semana', ANIO)
  const m = rejilla('mes', ANIO)
  assert.equal(s.length, 53)
  assert.equal(m.length, 12)
  // ═══ ACÁ SE EXIGÍA EL DEFECTO (hasta el 13/08/2026) ═══
  //
  // Decía `s[0].desde === 46020` (29/12/2025) y `s[52].hasta > m[11].hasta` — "el semanal se derrama
  // sobre enero de 2027". Se leía como una propiedad inevitable de las semanas ISO y no lo era: lo que
  // tiene que caer de un solo lado es la SEMANA, no la PLATA. La columna del 28/12 sigue existiendo y
  // sigue rotulada 28/12; lo que se recortó es su ventana.
  assert.equal(s[0].desde, 46023, 'la primera columna semanal arranca el 1/1/2026, igual que el mensual')
  assert.equal(m[0].desde, 46023)
  assert.equal(s[s.length - 1].hasta, m[m.length - 1].hasta, 'y las dos vistas terminan el 1/1/2027')
})

test('cada método de pago de Compras cae en la fila que le corresponde, con su rubro', () => {
  const g = rejilla('semana', ANIO)
  // Transferencia/débito/efectivo pagados → REAL → "Egresos reales", sub-línea de su rubro.
  const real = ubicar(mov({ fecha: 46237, estado: 'REAL', rubro: 'Materiales Civil' }), 'semana', g)
  assert.equal(real.medida, 'egresoReal')
  assert.equal(real.fila, filaDeConcepto('semana', claveSub('egresoReal', 'Materiales Civil')))
  assert.equal(real.columna, 'AG', 'la semana del 3/08 es la columna AG')
  assert.equal(real.enOtros, false)
  // Cheque/echeq de fecha futura → COMPROMETIDO → "Egresos proyectados", en la columna del VENCIMIENTO.
  const cheque = ubicar(mov({ fecha: 46264, estado: 'COMPROMETIDO', instrumento: 'echeq' }), 'semana', g)
  assert.equal(cheque.medida, 'egresoProyectado')
  assert.notEqual(cheque.columna, real.columna, 'el compromiso pesa el día que vence, no el día que se firmó')
  // Cuenta corriente pendiente → PROYECTADO; una fecha que ya pasó → VENCIDO. Los dos, proyectados.
  assert.equal(medidaDe(mov({ estado: 'PROYECTADO' })), 'egresoProyectado')
  assert.equal(medidaDe(mov({ estado: 'VENCIDO' })), 'egresoProyectado')
})

test('Cobranzas: cobrado a "Ingresos reales", esperado a proyectados, el valor a "Valores en cartera"', () => {
  const g = rejilla('mes', ANIO)
  const cobrado = ubicar(mov({ signo: 1, fecha: 46237, estado: 'REAL', rubro: 'Cobranzas' }), 'mes', g)
  assert.equal(cobrado.fila, filaDeConcepto('mes', claveSub('ingresoReal', 'Cobranzas')))
  assert.equal(cobrado.columna, 'I', 'agosto es la columna I')
  const cartera = ubicar(mov({ signo: 1, fecha: 46234, estado: 'COMPROMETIDO', rubro: RUBRO_CARTERA }), 'mes', g)
  assert.equal(cartera.fila, filaDeConcepto('mes', claveSub('ingresoProyectado', RUBRO_CARTERA)))
  assert.equal(cartera.columna, 'H', 'el valor impacta en el mes de su fecha de ACREDITACIÓN')
})

// ══ EL DEFECTO 1: PLATA QUE NO ESTÁ EN NINGUNA COLUMNA ════════════════════════════════════════════

test('EL DEFECTO: un proyectado de 2027 no cae en NINGUNA columna del cuadro 2026', () => {
  // Medido en vivo: tres quincenas de jornales y una cuota de impuestos con fecha 2027, $23.358.443
  // en total. No dan #REF! ni cero: simplemente no existen en el cuadro. El Mensual no las muestra.
  const libro = [
    mov({ fecha: 46237, importe: 1000, estado: 'PROYECTADO' }),
    mov({ fecha: 46400, importe: 21079943, estado: 'PROYECTADO', origen: 'Jornales por Quincena' }),
    mov({ fecha: 46410, importe: 2278500, estado: 'PROYECTADO', origen: 'Impuestos y Financieros' }),
  ]
  const v = plataSinColumna(libro, 'mes', ANIO)
  assert.equal(v.filas, 2)
  assert.equal(Math.round(v.neto), -23358443)
  assert.deepEqual(v.porOrigen.map((o) => o.origen), ['Jornales por Quincena', 'Impuestos y Financieros'])
  // Y el que SÍ tiene columna no aparece en el veredicto: un falso positivo enseña a ignorar el control.
  assert.ok(!v.movimientos.some((m) => m.fecha === 46237))
})

test('EL DEFECTO CERRADO: no queda plata que esté en el TOTAL del semanal y no en el del mensual', () => {
  // ═══ QUÉ COSTABA, MEDIDO EN EL ARCHIVO VIVO EL 13/08/2026 ═══
  //
  // Egresos proyectados: $364.126.253 en el Semanal contra $351.052.936 en el Mensual. La diferencia
  // exacta —$13.073.317— eran dos movimientos fechados el 1/1/2027 que la última columna del Semanal
  // capturaba porque filtraba hasta el 3/1: jornales $9.110.600,82 y oficina $3.962.716,30.
  //
  // `bordesEntreVistas` medía ese borde y lo informaba como inevitable. Ahora es un DETECTOR DE
  // REGRESIÓN: si alguien vuelve a abrir la ventana del semanal, esto se pone rojo.
  const nomina2027 = mov({ fecha: 46389, importe: 13073317, estado: 'PROYECTADO', origen: 'Jornales por Quincena' })
  const b = bordesEntreVistas([nomina2027], ANIO)
  assert.deepEqual(b.soloSemanal, [], 'el 1/1/2027 ya no cae en ninguna columna del cuadro 2026')
  assert.equal(b.neto, 0)
  assert.equal(b.semanal.desde, b.mensual.desde)
  assert.equal(b.semanal.hasta, b.mensual.hasta)
  // Y lo de adentro sigue contándose una sola vez: un movimiento de 2026 no es "sólo del semanal".
  assert.deepEqual(bordesEntreVistas([mov({ fecha: 46237, importe: 1000 })], ANIO).soloSemanal, [])
})

// ══ EL DEFECTO 2: EL SALDO DECLARADO YA LO TIENE, Y LA COLUMNA LO CUENTA OTRA VEZ ═════════════════

test('EL DEFECTO: un REAL posterior a CAJA_FECHA_SALDO está en el saldo Y en su columna', () => {
  // Los tres movimientos medidos que componen la línea viva "Movimientos posteriores al corte" de
  // CAJA (−$67.612, reproducida exactamente desde Compras y Cobranzas). Están adentro de
  // CAJA_TOTAL_DISPONIBLE, el término "REAL transcurrido" del ancla no los alcanza —su ventana
  // termina en CAJA_FECHA_SALDO— y la columna de su fecha los vuelve a sumar.
  const libro = [
    mov({ signo: 1, fecha: 46241, importe: 232320, estado: 'REAL', origen: 'Cobranzas', rubro: 'Cobranzas' }),
    mov({ signo: -1, fecha: 46241, importe: 96800, estado: 'REAL', origen: 'Cobranzas', rubro: 'Cobranzas' }),
    mov({ signo: -1, fecha: 46246, importe: 203132, estado: 'REAL', instrumento: 'debito' }),
    // Un REAL anterior al corte SÍ lo resta el ancla: no es doble conteo y no puede aparecer acá.
    mov({ signo: -1, fecha: 46239, importe: 5000000, estado: 'REAL' }),
    // Un proyectado posterior tampoco: el saldo declarado no contiene lo que no ocurrió.
    mov({ signo: -1, fecha: 46250, importe: 7000000, estado: 'PROYECTADO' }),
  ]
  const d = dobleConteoDelAncla(libro, FECHA_SALDO)
  assert.equal(d.filas, 3)
  assert.equal(Math.round(d.neto), -67612, 'el mismo neto que la celda viva de CAJA')
  assert.equal(d.entra, 232320)
  assert.equal(d.sale, 299932, 'las dos magnitudes por separado: un cobro y un pago de más se cancelarían')
})

test('sin CAJA_FECHA_SALDO el control ROMPE, no devuelve cero huecos', () => {
  assert.throws(() => dobleConteoDelAncla([], null), /CAJA_FECHA_SALDO/)
  assert.throws(() => dobleConteoDelAncla([], undefined), /ancla/)
})

// ══ EL DEFECTO 3: EL MISMO VALOR POR DOS PUERTAS ══════════════════════════════════════════════════

test('EL DEFECTO: el echeq de LA ESTRELLA suma en Cobranzas Y en Valores en cartera', () => {
  // Cobranzas f37 (Echeq, Pendiente, $10.000.000, 46234) y _CHEQUES_RAW f10 (echeq 90020099,
  // Alimentos Del Sur, $10.000.000, fecha de pago 46234) son el MISMO e-cheque. Claves de dedup
  // distintas —Cobranzas no trae el número— así que los dos entran a "Ingresos proyectados".
  const libro = [
    mov({ signo: 1, fecha: 46234, importe: 10000000, estado: 'VENCIDO', rubro: 'Cobranzas', instrumento: 'echeq', origen: 'Cobranzas' }),
    mov({ signo: 1, fecha: 46234, importe: 10000000, estado: 'COMPROMETIDO', rubro: RUBRO_CARTERA, instrumento: 'echeq', origen: '_CHEQUES_RAW' }),
    // Un valor en cartera de otra fecha no empareja con nada: el control no puede inventar pares.
    mov({ signo: 1, fecha: 46234, importe: 290000, estado: 'COMPROMETIDO', rubro: RUBRO_CARTERA, instrumento: 'cheque', origen: '_CHEQUES_RAW' }),
    // Y una transferencia del mismo monto y día NO es un valor: no entra por la puerta de la cartera.
    mov({ signo: 1, fecha: 46234, importe: 10000000, estado: 'REAL', rubro: 'Cobranzas', instrumento: 'transferencia', origen: 'Cobranzas' }),
  ]
  const pares = valorPorDosPuertas(libro)
  assert.equal(pares.length, 1)
  assert.equal(pares[0].importe, 10000000)
  assert.equal(pares[0].cobranzas.origen, 'Cobranzas')
  assert.equal(pares[0].cartera.origen, '_CHEQUES_RAW')
})

// ══ EL DEFECTO 4, YA CERRADO: LA DEVOLUCIÓN QUE SE MOSTRABA COMO INGRESO ══════════════════════════

test('ARREGLADO: una nota de crédito de proveedor NETEA su rubro de egreso, no es un ingreso', () => {
  // El defecto medido el 06/08: 9 movimientos por $833k —7 notas de crédito de proveedores y las
  // anulaciones del impuesto al cheque— entraban con signo +1 y rubro de EGRESO, y el cuadro los
  // mostraba en "Ingresos reales · Otros". El dueño: "¿qué sería «Otros» en Ingresos reales? Son
  // valores que no sé dónde encontrar". No son ingresos: son egresos que se corrigieron.
  const libro = [
    mov({ signo: 1, fecha: 46237, importe: 531000, estado: 'REAL', rubro: 'Materiales Civil' }),
    mov({ signo: 1, fecha: 46237, importe: 136200, estado: 'REAL', rubro: 'Financiero' }),
    mov({ signo: 1, fecha: 46237, importe: 500000, estado: 'REAL', rubro: 'Cobranzas' }),
  ]
  // Ninguno de los tres se esconde ya en "· Otros": los dos primeros tienen sub-línea propia del lado
  // del egreso y el tercero es un cobro genuino. Si se revirtiera el neteo, los dos primeros vuelven.
  assert.deepEqual(rubrosEnOtros(libro).map((x) => x.rubro), [])
  const u = ubicar(libro[0], 'mes', rejilla('mes', ANIO))
  assert.equal(u.medida, 'egresoReal', 'la devolución vive del lado del egreso que corrige')
  assert.equal(u.enOtros, false)
  assert.equal(u.fila, filaDeConcepto('mes', claveSub('egresoReal', 'Materiales Civil')))
  // Y el cobro genuino sigue siendo un ingreso: el neteo no se comió lo que sí entra.
  assert.equal(ubicar(libro[2], 'mes', rejilla('mes', ANIO)).medida, 'ingresoReal')
})

test('"· Otros" SIGUE ATRAPANDO lo que la taxonomía no nombra — no quedó una fila muerta', () => {
  const g = rejilla('mes', ANIO)
  // Un rubro que el Libro empiece a emitir mañana y que ninguna lista nombre.
  const nuevo = ubicar(mov({ signo: 1, fecha: 46237, estado: 'REAL', rubro: 'Subsidio' }), 'mes', g)
  assert.equal(nuevo.enOtros, true)
  assert.equal(nuevo.fila, filaDeConcepto('mes', claveSub('ingresoReal', OTROS)))
  // Y un "Valores en cartera" con estado REAL, que no debería existir: ahora que la sub-línea no se
  // emite bajo lo real, la fila "Otros" es la que lo muestra en vez de dejarlo caer del cuadro.
  const cartera = ubicar(mov({ signo: 1, fecha: 46237, estado: 'REAL', rubro: 'Valores en cartera' }), 'mes', g)
  assert.equal(cartera.fila, filaDeConcepto('mes', claveSub('ingresoReal', OTROS)))
  // El cruce inverso NO se invierte: un cobro devuelto sale plata, y su rubro no abre del lado egreso.
  const devuelto = ubicar(mov({ signo: -1, fecha: 46237, estado: 'REAL', rubro: 'Cobranzas' }), 'mes', g)
  assert.equal(devuelto.medida, 'egresoReal')
  assert.equal(devuelto.fila, filaDeConcepto('mes', claveSub('egresoReal', OTROS)))
})

// ══ EL PUENTE CON EL EXTRACTOR: un cobro negativo no puede ser un ingreso ══════════════════════════

test('un cobro NEGATIVO de Cobranzas llega a la vista como EGRESO, no como ingreso inflado', () => {
  // Es el mismo defecto de `deCobranzas` visto desde la vista: sin el arreglo, el −$96.800 de
  // MACRO llegaba acá como `ingresoReal` de +$96.800 y la fila "· Cobranzas" mostraba $193.600 de más.
  const enc = ['x', 'Obra / Cliente', 'Estado', 'TOTAL a cobrar (neto de retenciones)', 'Fecha cobro', 'Fecha cobro', 'Forma de Cobro', 'Valor banco']
  const filas = [[], [], [], enc,
    ['', 'MACRO', 'Cobrado', 232320, 46241, 46241, 'Transferencia', ''],
    ['', 'MACRO', 'Cobrado', -96800, 46241, 46241, 'Transferencia', ''],
  ]
  const ms = deCobranzas(filas, FECHA_SALDO, { colValorBanco: 7 })
  const ubic = ms.map((m) => ubicar(m, 'semana', rejilla('semana', ANIO)))
  assert.deepEqual(ubic.map((u) => u.medida), ['ingresoReal', 'egresoReal'])
  assert.equal(ms.reduce((a, m) => a + m.signo * m.importe, 0), 135520, 'el neto que dice la fuente')
})
