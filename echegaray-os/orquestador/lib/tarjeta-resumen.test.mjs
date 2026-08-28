// EL PARSEO DEL RESUMEN ES LO ÚNICO DE ESTE CAMINO QUE PUEDE FALLAR EN SILENCIO.
//
// Un importe mal leído no rompe nada: deja un número plausible. Cada caso de abajo es un modo de
// falla REAL del resumen del Santander —varios se cazaron corriendo el parser contra el PDF del
// 20/08/2026, no imaginándolos—, y ninguno da error por su cuenta.
//
// EL FIXTURE ES EL DOCUMENTO REAL, RECORTADO. Las columnas son las que importan: este informe es de
// ancho fijo y todo el parser depende de en qué carácter empieza cada campo. Un fixture "parecido"
// con los espacios acomodados a ojo probaría un documento que no existe.

import test from 'node:test'
import assert from 'node:assert/strict'
import { importe, tipoDeCambio, mesAr, fechaLarga, plan, clasificarLinea, parsearCabecera, parsearDetalle, parsearCuotasAVencer, parsearDebito, parsearTalon, parsearResumen, tcDeducido } from './tarjeta-resumen.mjs'

/** Tal como lo devuelve `page.get_text()` de PyMuPDF sobre el resumen Nro 202120. */
const HOJA1 = [
  'Santander Río',
  'RESUMEN DE CUENTA',
  '02',
  ' 921127486',
  'N987',
  '  202120',
  '01/05',
  'AT: ECHEGARAY OVIEDO RO',
  'CIERRE  20 Ago 26 VENCIMIENTO 01 Set 26',
  'Cierre Ant.: 23 Jul 26',
  'Vto. Ant.: 03 Ago 26',
  'Prox.Cierre: 24 Set 26',
  'Prox.Vto.: 05 Oct 26',
  'LIMITES:',
  'COMPRA   $  10.000.000,00',
  '   CUOTAS  $  10.000.000,00',
  'FINANCIACION  $   7.000.000,00',
  '                        SALDO ANTERIOR                                          1090.924,47             193,25',
  '26 Agosto  03           SU PAGO EN PESOS            1384.664,47 TC1520,000      1090.924,47-            193,25-',
  '________________________________________________________________________________________________________________',
  '26 Enero   12 387306 *  MERPAGO*MODICAMOTOS         C.08/18                      355.413,33',
  '           23 297925 *  MERPAGO*CORREOARG                                         24.000,00',
  '           28 007824 K  DLO*STARLINK ARGENTINA                                    32.500,00',
  '           30 306019 K  ANTHROPIC                 USD       20,00                                        20,00',
  '           31 918810 K  ANTHROPIC        in1TzGiCBUSD       45,00                                        45,00',
  '26 Agosto  05 000984 *  GRUAS SAN BLAS SA           C.01/06                      854.068,60',
  '',
  'Tarjeta 3319 Total Consumos de OVIEDO RO ECHEGARAY                              1265.981,93 *           65,00 *',
  '',
  '26 Agosto  20           IMPUESTO DE SELLOS        $                               10.533,61',
  '           20           IMPUESTO DE SELLOS      P $                                3.922,14',
  '           20           DB.RG 5617  30% (   815850,03 )                          244.755,00',
  '',
  '                Cuotas a vencer:',
  '                 Setiembre/26   Octubre/26 Noviembre/26 Diciembre/26     Enero/27   Febrero/27',
  '                $1.546.611,33$1.282.797,42$1.282.797,42$1.282.797,42$1.282.797,42  $355.413,33',
  '                A partir de      Marzo/27 $1.421.653,32',
  '                DEBITAREMOS DE SU  C.C.00000000913836 LA SUMA DE  $     1525192,68 + U$S     65,00',
  '=== PAG 6 ===',
  'SALDO ACTUAL',
  'PAGO MINIMO',
  '    1525.192,68  ',
  '          65,00  ',
  '    1138.130,00',
].join('\n')

test('el importe se lee con las TRES formas que usa el mismo documento', () => {
  assert.equal(importe('355.413,33'), 355413.33)
  // El banco no pone el separador del millón: "1090.924,47" son un millón noventa mil, no mil.
  assert.equal(importe('1090.924,47'), 1090924.47)
  // Y la frase DEBITAREMOS lo imprime sin ningún separador.
  assert.equal(importe('2208958,42'), 2208958.42)
  // El signo va ATRÁS: es un crédito (el pago aplicado al saldo).
  assert.equal(importe('1090.924,47-'), -1090924.47)
  // Y el marcador de total no es parte del número.
  assert.equal(importe('1949.747,67 *'), 1949747.67)
})

test('lo que no es un importe devuelve null, nunca cero', () => {
  // Un cero inventado entra en la suma y hace cerrar un control que no cerraba.
  assert.equal(importe(''), null)
  assert.equal(importe('SALDO ANTERIOR'), null)
  assert.equal(importe('00      1090.924,47-'), null)
  assert.equal(importe(null), null)
})

test('el tipo de cambio del pago NO se lee con `importe`: tiene tres decimales', () => {
  // Aflojar `importe` para que entre "TC1520,000" habría hecho entrar cualquier número del renglón.
  assert.equal(importe('1520,000'), null)
  assert.equal(tipoDeCambio('SU PAGO EN PESOS            1384.664,47 TC1520,000'), 1520)
  assert.equal(tipoDeCambio('SU PAGO EN PESOS'), null)
})

test('septiembre se escribe de tres formas en el mismo resumen', () => {
  assert.equal(mesAr('Set 26'), 9)
  assert.equal(mesAr('Setiembre'), 9)
  assert.equal(mesAr('Septiembre'), 9)
  assert.equal(mesAr('Ago'), 8)
  assert.equal(mesAr('cualquiera'), null)
  assert.equal(fechaLarga('20 Ago 26'), '2026-08-20')
  assert.equal(fechaLarga('01 Set 26'), '2026-09-01')
  assert.equal(fechaLarga('no es fecha'), null)
})

test('la cabecera sale del documento, y el número de resumen se ancla en la hoja', () => {
  const c = parsearCabecera(HOJA1.split('\n'))
  assert.equal(c.numero, '202120')
  assert.equal(c.cuentaTarjeta, '921127486')
  assert.equal(c.titular, 'ECHEGARAY OVIEDO RO')
  assert.equal(c.cierre, '2026-08-20')
  assert.equal(c.vencimiento, '2026-09-01')
  assert.equal(c.cierreAnterior, '2026-07-23')
  assert.equal(c.vencimientoAnterior, '2026-08-03')
  assert.equal(c.proximoCierre, '2026-09-24')
  assert.equal(c.proximoVencimiento, '2026-10-05')
  assert.equal(c.limiteCompra, 10000000)
  assert.equal(c.limiteFinanciacion, 7000000)
})

// ═══ EL DEFECTO QUE ESTE PARSER YA TUVO: LA COLUMNA DE PESOS ARRANCABA EN LA 72 ═══
//
// La línea del pago imprime el tipo de cambio pegado a la descripción ("… 1384.664,47 TC1520,000")
// y su cola cae en las columnas 72 y 73. Leyendo desde la 72, el campo era "00      1090.924,47-",
// no matcheaba y el importe se leía como NULO: un pago de $1,38 M convertido en cero, sin un error.

test('el pago del período se lee entero: el crédito, el tipo de cambio y lo que salió de la cuenta', () => {
  const { movimientos } = parsearDetalle(HOJA1.split('\n'))
  const pago = movimientos.find((m) => m.tipo === 'pago')
  assert.equal(pago.pesos, -1090924.47, 'el crédito aplicado al saldo en pesos')
  assert.equal(pago.dolares, -193.25)
  assert.equal(pago.tc, 1520)
  // Lo que salió de la cuenta NO es la columna de pesos: incluye el saldo en dólares convertido, y
  // sólo está escrito en la descripción. Es el número que después se busca en el extracto.
  assert.equal(pago.importePagado, 1384664.47)
  assert.equal(Math.round((1090924.47 + 193.25 * 1520) * 100) / 100, 1384664.47)
})

test('un consumo en dólares no se confunde con uno en pesos: son dos columnas distintas', () => {
  const { movimientos } = parsearDetalle(HOJA1.split('\n'))
  const usd = movimientos.filter((m) => m.tipo === 'consumo' && m.dolares > 0)
  assert.equal(usd.length, 2)
  assert.deepEqual(usd.map((m) => m.pesos), [0, 0], 'un consumo en dólares NO suma pesos')
  assert.deepEqual(usd.map((m) => m.dolares), [20, 45])
  // El comercio viene recortado a 17 caracteres para hacerle lugar a la referencia del comercio,
  // que el banco pega a la sigla USD sin un espacio ("in1TzGiCBUSD").
  assert.deepEqual(usd.map((m) => m.comercio), ['ANTHROPIC', 'ANTHROPIC'])
  assert.equal(usd[1].referencia, 'in1TzGiCB')
})

test('el comercio de un consumo en pesos NO se recorta: "DLO*STARLINK ARGENTINA" tiene 22', () => {
  const { movimientos } = parsearDetalle(HOJA1.split('\n'))
  const s = movimientos.find((m) => String(m.comercio).startsWith('DLO'))
  assert.equal(s.comercio, 'DLO*STARLINK ARGENTINA')
  assert.equal(s.pesos, 32500)
})

test('el año y el mes se arrastran: el banco los imprime UNA vez por grupo', () => {
  const { movimientos, rechazos } = parsearDetalle(HOJA1.split('\n'))
  const correo = movimientos.find((m) => String(m.comercio).includes('CORREOARG'))
  // "23" a secas, tres renglones después de "26 Enero": sin arrastre, la compra queda sin fecha, y
  // la fecha es lo que después permite reconocer un consumo recurrente.
  assert.equal(correo.fecha, '2026-01-23')
  assert.equal(rechazos.length, 0)
})

test('un cargo NO es un consumo, y cada uno se reconoce por su concepto', () => {
  const { movimientos } = parsearDetalle(HOJA1.split('\n'))
  const cargos = movimientos.filter((m) => m.tipo === 'cargo')
  assert.deepEqual(cargos.map((m) => m.concepto), ['sellos', 'sellos_provinciales', 'rg5617'])
  // El sellos PROVINCIAL se distingue del nacional por una sola letra en la línea: si se leyeran
  // iguales, el cuadro de "qué me están cobrando" mostraría dos veces el mismo rótulo.
  assert.deepEqual(cargos.map((m) => m.pesos), [10533.61, 3922.14, 244755])
  assert.equal(cargos[2].base, 815850.03, 'la base de la percepción verifica el consumo en dólares')
  assert.equal(clasificarLinea('INTERESES POR FINANCIACION').concepto, 'interes_financiacion')
  assert.equal(clasificarLinea('MERPAGO*MODICAMOTOS').tipo, 'consumo', 'lo que no se reconoce se ve, no se reparte')
})

test('el plan de cuotas se abre: cuota 8 de 18', () => {
  assert.deepEqual(plan('MERPAGO*MODICAMOTOS         C.08/18'), { cuota: 8, cuotas: 18 })
  assert.deepEqual(plan('DLO*STARLINK ARGENTINA'), { cuota: null, cuotas: null })
})

// ═══ EL RENGLÓN QUE MIENTE SI SE LEE RÁPIDO ═══

test('"A partir de Marzo/27 $1.421.653,32" es un TOTAL, no una cuota mensual', () => {
  const q = parsearCuotasAVencer(HOJA1.split('\n'))
  assert.equal(q.porMes.length, 6)
  assert.deepEqual(q.porMes[0], { mes: '2026-09-01', importe: 1546611.33 })
  assert.deepEqual(q.porMes[5], { mes: '2027-02-01', importe: 355413.33 })
  assert.equal(q.cola.total, 1421653.32)
  // 1.421.653,32 = 4 × 355.413,33 EXACTO. Leerlo como cuota mensual multiplicaría por N un
  // compromiso que ya terminó, y el error crecería con cada mes que se proyecte.
  assert.equal(q.cola.cuotas, 4)
  assert.equal(q.cola.cuota, 355413.33)
})

test('si la cola NO es múltiplo exacto de la última cuota, no se afirma en cuántas se reparte', () => {
  const roto = HOJA1.replace('A partir de      Marzo/27 $1.421.653,32', 'A partir de      Marzo/27 $1.421.000,00')
  const q = parsearCuotasAVencer(roto.split('\n'))
  assert.equal(q.cola.total, 1421000)
  assert.equal(q.cola.cuotas, null, 'sin división exacta no hay deducción: queda declarado el hueco')
})

test('la frase DEBITAREMOS separa las dos monedas: no se suman', () => {
  const d = parsearDebito(HOJA1.split('\n'))
  assert.equal(d.pesos, 1525192.68)
  assert.equal(d.dolares, 65)
  assert.equal(d.cuentaDebito, '00000000913836')
})

// ═══ EL PAGO MÍNIMO SE IDENTIFICA POR LOS DOS ANCLAS QUE YA SE SABEN ═══
//
// En el talón los rótulos y los números son bloques de texto separados: extraído, queda una lista de
// números sueltos. Leer "el tercero" sería una superstición.

test('el pago mínimo sale del talón sólo si los otros dos números son los que ya se saben', () => {
  const t = parsearTalon(HOJA1.split('\n').slice(-6), { pesos: 1525192.68, dolares: 65 })
  assert.equal(t.verificado, true)
  assert.equal(t.pagoMinimo, 1138130)
})

test('si el talón no repite el importe a debitar, NO se inventa un pago mínimo', () => {
  // Un pago mínimo equivocado hace creer que se puede pagar menos de lo que hay que pagar, y la
  // diferencia financia al 6,411% mensual.
  const t = parsearTalon(['    999.999,99  ', '    1138.130,00'], { pesos: 1525192.68, dolares: 65 })
  assert.equal(t.verificado, false)
  assert.equal(t.pagoMinimo, null)
  assert.match(t.motivo, /no puedo afirmar/)
})

test('el resumen completo se arma, y el TC del cierre es un CÁLCULO declarado', () => {
  const p = parsearResumen(HOJA1)
  assert.equal(p.resumen.numero, '202120')
  assert.equal(p.resumen.tarjeta, 'Visa 3319')
  assert.equal(p.resumen.aDebitarPesos, 1525192.68)
  assert.equal(p.resumen.aDebitarDolares, 65)
  assert.equal(p.resumen.consumosPesos, 1265981.93)
  assert.equal(p.resumen.consumosDolares, 65)
  assert.equal(p.resumen.cargosPesos, 259210.75)
  assert.equal(p.resumen.pagoMinimo, 1138130)
  // El resumen NO imprime el tipo de cambio: sale de dividir la base de la percepción por el consumo
  // en dólares. Por eso viaja rotulado como cálculo y no se usa para convertir nada.
  assert.equal(tcDeducido(815850.03, 544.99), 1497)
  assert.equal(p.resumen.tcCierre, tcDeducido(815850.03, 65))
})

test('un documento que no es un resumen de tarjeta no devuelve datos a medias', () => {
  const p = parsearResumen('esto es cualquier cosa\ny esto también')
  assert.equal(p.resumen.cierre, null)
  assert.equal(p.resumen.aDebitarPesos, null)
  assert.equal(p.movimientos.length, 0)
})
