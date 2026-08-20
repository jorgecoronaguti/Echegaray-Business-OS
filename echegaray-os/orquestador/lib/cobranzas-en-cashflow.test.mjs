import test from 'node:test'
import assert from 'node:assert/strict'
import {
  C, auditar, leerCobro, repasar, porMes, esPendiente, esCobrado, ubicarCuadro, SUB_COBRANZAS,
} from './cobranzas-en-cashflow.mjs'
import { ROTULO_CONCEPTO } from './cash-flow-matriz.mjs'

// El serial de Sheets de una fecha ISO, para escribir fixtures legibles.
const serial = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000)
const HOY = new Date('2026-08-04T00:00:00Z')
// El tipo de cambio del archivo vivo con el que se generó `_MOVIMIENTOS` el 14/08/2026.
const TC = 1491.727

/** Arma una fila de la grilla de Cobranzas con sólo las columnas que importan. */
function fila({ total, unidad = 'Civil', cliente = 'X', estado = 'Pendiente', cobro = null, venta = null, comprobante = '', banco = '', moneda = '' }) {
  const f = []
  const set = (j, valor, numero = null) => { f[j] = { valor, numero, formula: null, formato: null, derivada: false } }
  set(C.total, String(total), total)
  set(C.unidad, unidad); set(C.cliente, cliente); set(C.estado, estado); set(C.comprobante, comprobante)
  set(C.banco, banco); set(C.moneda, moneda)
  if (cobro) set(C.fechaCobro, cobro, serial(cobro))
  if (venta) set(C.fechaVenta, venta, serial(venta))
  return f
}

// ── LOS CASOS REALES DEL ARCHIVO al 04/08/2026 ────────────────────────────────────────────────────
// La fila 37: $10.000.000 de LA ESTRELLA fechada el 31/07/2026 y todavía Pendiente. Es el caso que
// destapó el hueco: no está en la línea de cobrado (no entró) y la de esperadas apaga su columna
// porque julio ya cerró. Diez millones que la empresa espera y el cuadro no muestra en ningún lado.
const F37 = fila({ total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', cobro: '2026-07-31', comprobante: '01_00000213' })
// La fila 43: mismo cliente, marcada Cobrado con fecha 15/08 — once días DESPUÉS de hoy.
const F43 = fila({ total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', estado: 'Cobrado', cobro: '2026-08-15' })
// Un pendiente sano de agosto y uno de septiembre.
const F60 = fila({ total: 5000000, cliente: 'San Francisco', cobro: '2026-08-19' })
const F80 = fila({ total: 19662500, cliente: 'MESSINA', cobro: '2026-09-09' })

const cobros = [F37, F43, F60, F80].map((f, i) => leerCobro(f, i + 5))

test('un pendiente fechado ANTES del mes en curso no aparece en ninguna línea del cuadro', () => {
  const r = repasar(cobros, { hoy: HOY })
  assert.equal(r.invisiblesAlCuadro.length, 1)
  assert.equal(r.invisiblesAlCuadro[0].fila, 5, 'es la fila 37 del archivo real')
  assert.equal(r.montos.invisiblesAlCuadro, 10000000)
  // Y la contraprueba: la reconstrucción mes a mes NO lo suma a julio, igual que la fórmula.
  const m = porMes(cobros, { hoy: HOY })
  assert.equal(m.get('2026-07').esperado, 0, 'la fórmula apaga la columna de un mes cerrado')
  assert.equal(m.get('2026-07').cobrado, 0)
})

test('el mismo pendiente SÍ cuenta como vencido: el hueco existe aunque el cuadro no lo muestre', () => {
  const r = repasar(cobros, { hoy: HOY })
  assert.equal(r.montos.vencidos, 10000000)
  assert.deepEqual(r.vencidos.map((c) => c.fila), [5])
})

test('percibido: no se puede haber cobrado algo con fecha de cobro futura', () => {
  const r = repasar(cobros, { hoy: HOY })
  assert.equal(r.cobradosAFuturo.length, 1)
  assert.equal(r.montos.cobradosAFuturo, 10000000)
  assert.equal(r.cobradosAFuturo[0].fila, 6)
})

test('un pendiente sin fecha de cobro ni de venta no cae en ninguna semana ni en ningún mes', () => {
  const sin = leerCobro(fila({ total: 777000, cliente: 'SIN FECHA' }), 99)
  const r = repasar([...cobros, sin], { hoy: HOY })
  assert.equal(r.sinFecha.length, 1)
  assert.equal(r.montos.sinFecha, 777000)
  // No aparece en ningún mes: si apareciera, estaría en una ventana que nadie eligió.
  const m = porMes([...cobros, sin], { hoy: HOY })
  for (const v of m.values()) assert.ok(!String(v.esperado).includes('777'))
  assert.equal([...m.values()].reduce((s, v) => s + v.esperado, 0), 24662500, 'sólo los de agosto y septiembre')
})

test('la reconstrucción mes a mes reproduce las dos líneas del cuadro, separadas', () => {
  const m = porMes(cobros, { hoy: HOY })
  assert.equal(m.get('2026-08').cobrado, 10000000, 'fila 43: cobrada, aunque su fecha sea futura')
  assert.equal(m.get('2026-08').esperado, 5000000)
  assert.equal(m.get('2026-09').esperado, 19662500)
  // Cobrado y esperado NUNCA suman el mismo cobro: agosto tiene los dos y ninguno vale $15.000.000.
  assert.notEqual(m.get('2026-08').cobrado, m.get('2026-08').esperado)
  const total = [...m.values()].reduce((s, v) => s + v.cobrado + v.esperado, 0)
  assert.equal(total, 34662500, 'los 4 cobros menos los $10M invisibles de julio')
})

test('un valor endosado no es plata de la empresa y no entra por ninguna de las dos líneas', () => {
  const end = leerCobro(fila({ total: 3000000, cliente: 'X', cobro: '2026-09-01', banco: 'ENDOSADO a proveedor' }), 200)
  assert.equal(esPendiente(end), false)
  const m = porMes([end], { hoy: HOY })
  assert.equal(m.size, 0)
})

test('esCobrado / esPendiente parten el universo sin superponerse', () => {
  for (const estado of ['Cobrado', 'Pendiente', 'Proyectado', 'Facturado', '']) {
    const c = leerCobro(fila({ total: 1, estado, cobro: '2026-09-01' }), 1)
    assert.ok(!(esCobrado(c) && esPendiente(c)), `"${estado}" no puede ser las dos cosas`)
  }
  // "Facturado" y "Proyectado" son estados REALES del archivo y cuentan como esperados: si el repaso
  // los ignorara, la línea de esperadas del cuadro no se podría reconstruir.
  assert.equal(esPendiente(leerCobro(fila({ total: 1, estado: 'Facturado', cobro: '2026-09-01' }), 1)), true)
  assert.equal(esPendiente(leerCobro(fila({ total: 1, estado: 'Proyectado', cobro: '2026-09-01' }), 1)), true)
})

test('una fila sin monto no es un cobro vacío: no es un cobro', () => {
  assert.equal(leerCobro(fila({ total: 0 }), 1), null)
  assert.equal(leerCobro([], 1), null)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRO SE UBICA POR SU RÓTULO — EL FALSO POSITIVO DE $808,99M
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El auditor leía `A3:N9` y suponía que la fila 3 era el encabezado de meses y que las tres últimas
// del rango eran las líneas de ingreso. El 06/08 la matriz movió el encabezado a la fila 7 y unificó
// las tres líneas en "· Cobranzas". No falló: leyó el subtítulo, no reconoció ningún mes, y reportó
// que TODOS los cobros —$808.990.000— quedaban fuera de la ventana del cuadro. El residuo real era
// de tres órdenes de magnitud menos.
//
// Estos tests son ese defecto. La fila donde caen las cosas cambia en cada fixture a propósito: uno
// que las ubique contando filas se pone rojo.

/** Una celda de la grilla, como la devuelve readSheetGrid. */
const cel = (valor, numero = null) => ({ valor, numero, formula: null, formato: null, derivada: false })

/** El cuadro real, con `arriba` filas de hero antes de la cabecera. */
function cuadro({ arriba = 6, reales = [100, 200], proyectados = [0, 50] } = {}) {
  const relleno = Array.from({ length: arriba }, (_, i) => [cel(`hero ${i}`)])
  const mes = (iso) => cel(iso, serial(iso))
  return [
    ...relleno,
    [cel(ROTULO_CONCEPTO), mes('2026-01-01'), mes('2026-02-01'), cel('TOTAL')],
    [cel('Saldo inicial')],
    [cel('Ingresos reales'), cel('', reales[0]), cel('', reales[1])],
    [cel(`    ${SUB_COBRANZAS}`), cel('', reales[0]), cel('', reales[1])],
    [cel('    · Otros'), cel('', 0), cel('', 0)],
    [cel('Ingresos proyectados'), cel('', proyectados[0]), cel('', proyectados[1])],
    [cel(`    ${SUB_COBRANZAS}`), cel('', proyectados[0]), cel('', proyectados[1])],
    [cel('Egresos reales'), cel('', 999), cel('', 999)],
    [cel(`    ${SUB_COBRANZAS}`), cel('', 777), cel('', 777)], // trampa: no cuelga de un ingreso
  ]
}

test('ubicarCuadro encuentra la cabecera por su rótulo, esté en la fila que esté', () => {
  for (const arriba of [2, 6, 11]) {
    const u = ubicarCuadro(cuadro({ arriba }))
    assert.equal(u.cabecera, arriba, `con ${arriba} filas de hero, la cabecera es la ${arriba + 1}`)
    assert.deepEqual(u.meses.map((m) => m.mes), ['2026-01', '2026-02'])
  }
})

test('las líneas de ingreso son las "· Cobranzas" de ingresos — no las últimas del rango', () => {
  const u = ubicarCuadro(cuadro({ arriba: 6 }))
  assert.deepEqual(u.ingreso.map((i) => i.de), ['Ingresos reales', 'Ingresos proyectados'])
  // La sub-línea "· Cobranzas" que cuelga de EGRESOS existe en el fixture y no tiene que entrar:
  // sumarla contaría plata que sale como si entrara.
  assert.equal(u.ingreso.length, 2)
})

test('auditar lee las dos líneas de cobranzas y no declara nada fuera de ventana', () => {
  const cob = [
    fila({ total: 100, cobro: '2026-01-15', estado: 'Cobrado' }),
    fila({ total: 250, cobro: '2026-02-10', estado: 'Cobrado' }),
  ]
  const r = auditar(cob, cuadro({ reales: [100, 250], proyectados: [0, 0] }))
  assert.equal(r.noPudoUbicar, null)
  assert.deepEqual(r.fueraDeVentana, [], 'con la cabecera bien ubicada, ningún cobro cae fuera del cuadro')
  assert.equal(r.totalCashFlow, 350, 'reales (100+250) + proyectados (0+0)')
  assert.deepEqual(r.porMes.map((m) => [m.mes, m.cobranzas, m.cashflow, m.ok]), [
    ['2026-01', 100, 100, true],
    ['2026-02', 250, 250, true],
  ])
  assert.equal(r.ok, true)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL REPARTO ENTRE REAL Y PROYECTADO — LO QUE EL ✓ NO MIRABA (15/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Este fixture es, literalmente, el que tenía el test de arriba hasta hoy: febrero con $250 cobrados
// en Cobranzas y el cuadro mostrando $200 en la línea real y $50 en la proyectada. El cuadre viejo
// sumaba las dos líneas ($250), lo comparaba contra el total del mes ($250) y decía ✓ — el mismo ✓
// que sostuvo durante semanas la idea de que el Cash Flow reflejaba el estado de las cobranzas.

test('una fila del lado equivocado ya no cierra: REAL se compara contra REAL', () => {
  const cob = [
    fila({ total: 100, cobro: '2026-01-15', estado: 'Cobrado' }),
    fila({ total: 250, cobro: '2026-02-10', estado: 'Cobrado' }),
  ]
  const r = auditar(cob, cuadro({ reales: [100, 200], proyectados: [0, 50] }))
  const feb = r.porMes.find((m) => m.mes === '2026-02')
  assert.equal(feb.difLados.real + feb.difLados.proyectado, 0, 'el TOTAL cierra: por eso el cuadre viejo pasaba')
  assert.equal(feb.cobranzas, feb.cashflow, 'y la comparación de totales sigue dando igual…')
  assert.equal(feb.ok, false, '…pero el reparto no: $50 declarados cobrados están en la línea proyectada')
  assert.equal(feb.lados.real.dif, 50)
  assert.equal(feb.lados.proyectado.dif, -50)
  assert.equal(r.ok, false)
})

test('cuando falla, el control dice QUÉ FILA está del lado equivocado y por cuánto', () => {
  // El caso real: la fila 44 de Cobranzas, LA ESTRELLA, $8.234.758. Pasó a "Cobrado" en la pestaña y
  // el cuadro seguía mostrándola del lado proyectado. Encontrarla a mano llevó media hora.
  const otras = fila({ total: 30000000, cliente: 'ARCOR', estado: 'Cobrado', cobro: '2026-08-04' })
  const f44 = fila({ total: 8234758, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', estado: 'Cobrado', cobro: '2026-08-11' })
  const r = auditar([otras, f44], cuadroConProyectado(30000000, 8234758), { tipoCambio: TC })
  const ago = r.porMes.find((m) => m.mes === '2026-08')
  assert.equal(ago.ok, false)
  const [c] = ago.culpables
  assert.equal(c.fila, 6, 'la segunda fila del fixture — el auditor numera desde la 5 del archivo')
  assert.match(c.cliente, /ESTRELLA/)
  assert.equal(c.monto, 8234758)
  assert.equal(c.lado, 'real', 'Cobranzas la declara cobrada')
  assert.equal(c.haciaLado, 'proyectado', 'y el cuadro la muestra del otro lado')
  assert.equal(c.exacta, true)
  assert.equal(c.sola, true, 'una sola fila explica el desvío entero: no es una pista, es la fila')
  assert.equal(c.traspaso, true, 'los dos lados se compensan: cambió de lado, no apareció ni desapareció')
})

test('plata que falta NO se disfraza de traspaso: sin candidata exacta se dice que no la hay', () => {
  const uno = fila({ total: 1000, cliente: 'ARCOR', estado: 'Cobrado', cobro: '2026-08-04' })
  // El cuadro muestra $400 de más en real y nada de menos en proyectado: no es un reparto, falta plata.
  const r = auditar([uno], cuadroConProyectado(1400, 0), { tipoCambio: TC })
  const ago = r.porMes.find((m) => m.mes === '2026-08')
  assert.equal(ago.ok, false)
  assert.equal(ago.lados.real.dif, -400)
  assert.equal(ago.lados.proyectado.dif, 0, 'el otro lado no lo explica')
  const [c] = ago.culpables
  assert.equal(c.traspaso, false)
  assert.equal(c.fila, null, 'no hay ninguna fila proyectada de ese mes: se dice, no se inventa una')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// JULIO Y AGOSTO — LOS DOS ERRORES QUE CASI SE COMPENSABAN (14/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// MEDIDO CONTRA EL ARCHIVO VIVO. El auditor decía:
//    2026-07  Cobranzas $166.162.409  cuadro $189.119.604  ⚠ $-22.957.196
//    2026-08  Cobranzas $170.211.848  cuadro $170.308.648  ⚠ $-96.800
// y el total general cerraba casi al peso, así que nadie lo vio hasta que se miró mes a mes.
//
// NINGUNO DE LOS DOS ERA UNA IMPUTACIÓN DE MES. Los dos lados usan "Fecha cobro" y ponen cada cobro en
// el mismo mes; lo que no coincidía era CUÁNTO valía cada peso y de qué lado del cuadro caía:
//   · f62 Quattropani, U$S 15.400 al 31/07 — el libro lo valúa ($22.972.595,80), el auditor leía la
//     columna M cruda ($15.400). Comparaba pesos contra dólares.
//   · f58 MACRO, −$96.800 al 07/08 — el libro lo emite como EGRESO (cae en "Egresos reales · Otros");
//     el auditor lo restaba de la línea de INGRESOS de agosto.
// Y f43/f48, los dos echeq endosados de LA ESTRELLA en agosto, son la tercera pieza: diferencia
// legítima de $20.000.000 que el control tiene que EXIGIR, no tolerar.

/** El cuadro real de julio y agosto, con el valor que muestra cada mes EN LA LÍNEA REAL. */
const cuadroJulAgo = (julio, agosto) => [
  [cel('hero')],
  [cel(ROTULO_CONCEPTO), cel('jul', serial('2026-07-01')), cel('ago', serial('2026-08-01'))],
  [cel('Ingresos reales'), cel('', julio), cel('', agosto)],
  [cel(`    ${SUB_COBRANZAS}`), cel('', julio), cel('', agosto)],
]

/** Un solo mes (agosto) con LAS DOS líneas: es el único fixture que puede mostrar un reparto. */
const cuadroConProyectado = (real, proyectado) => [
  [cel(ROTULO_CONCEPTO), cel('ago', serial('2026-08-01'))],
  [cel('Ingresos reales'), cel('', real)],
  [cel(`    ${SUB_COBRANZAS}`), cel('', real)],
  [cel('Ingresos proyectados'), cel('', proyectado)],
  [cel(`    ${SUB_COBRANZAS}`), cel('', proyectado)],
]

// Las cuatro filas reales del archivo vivo, con sus valores exactos.
const F62_USD = fila({ total: 15400, moneda: 'USD', cliente: 'Quattropani - Melisa García SAS', estado: 'Cobrado', cobro: '2026-07-31', venta: '2026-07-27' })
const F58_NEG = fila({ total: -96800, cliente: 'MACRO CONSTRUCCIONES SRL', estado: 'Cobrado', cobro: '2026-08-07', venta: '2026-07-16' })
const F43_END = fila({ total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', estado: 'Cobrado', cobro: '2026-08-15', banco: 'ENDOSADO a ALUMETAL S.A · echeq 90020100' })
const F48_END = fila({ total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', estado: 'Cobrado', cobro: '2026-08-31', banco: 'ENDOSADO a ALUMETAL S.A · echeq 90020101' })

test('un cobro en dólares entra al cuadre EN PESOS, no en dólares', () => {
  const enPesos = 15400 * TC // 22.972.595,80 — lo que `_MOVIMIENTOS` L839 guarda de verdad
  const r = auditar([F62_USD], cuadroJulAgo(enPesos, 0), { tipoCambio: TC })
  const jul = r.porMes.find((m) => m.mes === '2026-07')
  assert.equal(jul.cobranzas, enPesos)
  assert.equal(jul.dif, 0, 'valuado, julio cierra')
  assert.ok(jul.ok)
  // Y la contraprueba del defecto: sin valuar, la diferencia es el importe entero menos el nominal.
  const c = leerCobro(F62_USD, 62, { tipoCambio: TC })
  assert.equal(c.moneda, 'USD')
  assert.equal(c.montoOrigen, 15400, 'el nativo no se pierde: es lo que deja desmentir el número')
  assert.equal(Math.round(enPesos - 15400), 22957196, 'el desvío exacto que mostraba el archivo vivo')
})

// ── LA COTIZACIÓN SE MUEVE SOLA, Y ESO NO ES UN DESVÍO ────────────────────────────────────────────
// `TIPO_CAMBIO_USD` es una cotización viva: dos lecturas del mismo rango con 15 minutos de diferencia
// dieron 1.491,766 y 1.492,521. El libro congela la suya al generarse. Julio quedó ⚠ $12.228 = los
// U$S 15.400 de la f62 por $0,794 de diferencia de cotización, sin que nadie se equivocara en nada.

test('la deriva del tipo de cambio entre el libro y el cuadre no descuadra el mes', () => {
  const tcLibro = 1491.727 // el que quedó congelado en `_MOVIMIENTOS`
  const tcAhora = 1492.521 // el que devuelve el rango con nombre al correr el cuadre
  const r = auditar([F62_USD], cuadroJulAgo(15400 * tcLibro, 0), { tipoCambio: tcAhora })
  const jul = r.porMes.find((m) => m.mes === '2026-07')
  assert.equal(jul.usd, 15400, 'el nominal se guarda en dólares, no valuado')
  assert.ok(Math.abs(jul.tcImplicito - tcLibro) < 0.001, 'se despeja el TC con el que el cuadro lo valuó')
  assert.equal(Math.round(jul.dif), 12228, 'la diferencia en pesos existe…')
  assert.equal(jul.ok, true, '…y es cotización, no imputación: el mes cierra')
})

test('la deriva NO es un colchón: un cobro de más en un mes con dólares sigue gritando', () => {
  // El colchón que un umbral en pesos habría necesitado para tragar los $12.228 se come cualquier
  // desvío chico. Acá el mismo mes, con la misma deriva, más un cobro en pesos que el cuadro afirma
  // y la pestaña no: el implícito se dispara y el mes no cierra.
  const r = auditar([F62_USD], cuadroJulAgo(15400 * 1491.727 + 500000, 0), { tipoCambio: 1492.521 })
  const jul = r.porMes.find((m) => m.mes === '2026-07')
  assert.equal(jul.ok, false)
  assert.ok(jul.tcImplicito > 1520, 'medio millón repartido entre 15.400 dólares no es una cotización')
})

test('un mes sin dólares se compara al peso: ahí no hay nada que derivar', () => {
  const r = auditar([F58_NEG], cuadroJulAgo(0, 2), { tipoCambio: 1492.521 })
  const ago = r.porMes.find((m) => m.mes === '2026-08')
  assert.equal(ago.usd, 0)
  assert.equal(ago.tcImplicito, null)
  assert.equal(ago.ok, false, 'dos pesos de diferencia sin dólares que lo expliquen es un desvío')
})

test('sin tipo de cambio un dólar NO se cuenta como peso: se declara y baja el veredicto', () => {
  // EL CUADRO EN CERO A PROPÓSITO: así los doce meses cuadran y lo ÚNICO que puede bajar el veredicto
  // es la fila declarada. Con un cuadro que no cuadra, el test pasaría aunque el veredicto ignorara
  // por completo a `sinValuar` — y entonces no probaría nada de lo que dice probar.
  const r = auditar([F62_USD], cuadroJulAgo(0, 0), { tipoCambio: null })
  assert.equal(r.sinValuar.length, 1, 'la fila queda declarada, no contada a valor nominal')
  assert.match(r.sinValuar[0].motivo, /tipo de cambio/)
  assert.equal(r.porMes.find((m) => m.mes === '2026-07').cobranzas, 0, 'no entra al mes con un valor inventado')
  assert.ok(r.porMes.every((m) => m.ok), 'los meses cuadran justamente porque la fila se sacó')
  assert.equal(r.ok, false, 'un mes que cierra porque se escondió una fila no es un mes que cierra')
})

test('un cobro fuera de la ventana del cuadro tampoco puede dar veredicto verde', () => {
  // Mismo principio: sacarlo de la cuenta hace cuadrar los meses. Si el veredicto no lo mirara, esos
  // $9.000.000 de 2027 desaparecerían con un ✓ arriba.
  const dosMilVeintisiete = fila({ total: 9000000, estado: 'Pendiente', cobro: '2027-01-15' })
  const r = auditar([dosMilVeintisiete], cuadroJulAgo(0, 0), { tipoCambio: TC })
  assert.equal(r.fueraDeVentana.length, 1)
  assert.ok(r.porMes.every((m) => m.ok))
  assert.equal(r.ok, false)
})

test('un cobro NEGATIVO es un egreso: no resta de la línea de ingresos del mes', () => {
  // El cuadro de agosto NO lo muestra —el libro lo manda al lado de los egresos— así que la línea de
  // ingresos vale 0 y el cuadre tiene que dar ✓ igual.
  const r = auditar([F58_NEG], cuadroJulAgo(0, 0), { tipoCambio: TC })
  const ago = r.porMes.find((m) => m.mes === '2026-08')
  assert.equal(ago.bruto, -96800, 'el bruto de la pestaña sí lo tiene')
  assert.equal(ago.devolucion, -96800, 'y se declara como la resta que es')
  assert.equal(ago.cobranzas, 0, 'lo comparable contra la línea de ingresos no lo incluye')
  assert.equal(ago.dif, 0)
  assert.equal(r.devoluciones.length, 1)
})

test('la diferencia de un mes tiene que ser EXACTAMENTE el endosado de ese mes, no cero ni un umbral', () => {
  const r = auditar([F43_END, F48_END], cuadroJulAgo(0, 0), { tipoCambio: TC })
  const ago = r.porMes.find((m) => m.mes === '2026-08')
  assert.equal(ago.bruto, 20000000)
  assert.equal(ago.endosado, 20000000, 'los dos echeq entregados a Alumetal, en SU mes')
  assert.equal(ago.dif, 0, 'descontado el endoso, agosto cierra')
  assert.equal(r.endosados.length, 2)
  // Y si el cuadro mostrara los $20M —o sea, si el libro dejara de excluirlos— el control TIENE que
  // gritar: la plata no pasó por la cuenta y el cash flow es percibido.
  const mal = auditar([F43_END, F48_END], cuadroJulAgo(0, 20000000), { tipoCambio: TC })
  assert.equal(mal.porMes.find((m) => m.mes === '2026-08').dif, -20000000)
  assert.equal(mal.ok, false)
})

test('los dos errores que se compensan: el total cierra y los meses no — el control mira los meses', () => {
  const cobros = [F62_USD, F58_NEG, F43_END, F48_END]
  // El cuadro tal como estaba el 14/08: julio con el dólar valuado, agosto sin el endoso ni la
  // devolución. Con la valuación y el neteo bien hechos, los dos meses cierran.
  const r = auditar(cobros, cuadroJulAgo(15400 * TC, 0), { tipoCambio: TC })
  assert.deepEqual(r.porMes.map((m) => [m.mes, m.ok]), [['2026-07', true], ['2026-08', true]])
  assert.equal(r.ok, true)

  // AHORA EL DEFECTO ORIGINAL, reproducido: julio $22.957.196 de más y agosto $19.903.200 de menos.
  // El gran total queda a $3.054.320 de distancia sobre $809M —0,4%— y por eso pasó desapercibido.
  const roto = auditar(cobros, cuadroJulAgo(15400 * TC + 22957196, -19903200), { tipoCambio: TC })
  const [jul, ago] = roto.porMes
  assert.equal(Math.round(jul.dif), -22957196)
  assert.equal(Math.round(ago.dif), 19903200)
  assert.ok(Math.abs(Math.round(jul.dif + ago.dif)) === 3053996,
    'sumados casi se anulan: comparar totales NUNCA los habría encontrado')
  assert.equal(roto.ok, false, 'mes a mes sí los encuentra')
})

test('el mes de imputación sale de Fecha cobro y NUNCA de la Fecha de Venta', () => {
  // Fecha de Venta en julio, Fecha cobro en agosto: el peso entra en agosto en los dos lados.
  const cruzado = fila({ total: 1000, estado: 'Cobrado', venta: '2026-07-16', cobro: '2026-08-07' })
  const r = auditar([cruzado], cuadroJulAgo(0, 1000), { tipoCambio: TC })
  assert.equal(r.porMes.find((m) => m.mes === '2026-07').cobranzas, 0, 'la fecha de factura es devengado: no imputa caja')
  assert.equal(r.porMes.find((m) => m.mes === '2026-08').cobranzas, 1000)
  assert.equal(r.ok, true)

  // Y sin Fecha cobro NO se cae a la de venta: el libro no produce movimiento, así que imputarla acá
  // inventaría un mes que el cuadro no tiene. Se declara.
  const soloVenta = fila({ total: 500, estado: 'Pendiente', venta: '2026-07-16' })
  const s = auditar([soloVenta], cuadroJulAgo(0, 0), { tipoCambio: TC })
  assert.equal(s.porMes.find((m) => m.mes === '2026-07').cobranzas, 0)
  assert.equal(s.sinFecha.length, 1)
  assert.match(s.sinFecha[0].motivo, /Fecha de Venta/)
  assert.equal(s.ok, false, 'plata que no cae en ninguna columna baja el veredicto')
})

test('una fila sin Unidad cuenta igual en su mes: el libro tampoco mira esa columna', () => {
  // Antes se la sacaba del lado de Cobranzas y el mes descuadraba por su importe, contra un libro que
  // sí la tenía. Se sigue declarando —no se puede clasificar por unidad de negocio— pero suma.
  const sinU = fila({ total: 7000, unidad: '', estado: 'Cobrado', cobro: '2026-07-10' })
  const r = auditar([sinU], cuadroJulAgo(7000, 0), { tipoCambio: TC })
  assert.equal(r.porMes.find((m) => m.mes === '2026-07').cobranzas, 7000)
  assert.equal(r.sinUnidad.length, 1, 'se declara igual')
  assert.equal(r.ok, true)
})

test('sin el rótulo del cuadro NO inventa un hallazgo: declara que no pudo ubicarlo', () => {
  // Es el 06/08 exacto: el layout cambió y el rango viejo devuelve celdas que no son la cabecera.
  const roto = cuadro().map((f, i) => (i === 6 ? [cel('Cash Flow Mensual 2026')] : f))
  const cob = [fila({ total: 808990000, cobro: '2026-01-15', estado: 'Cobrado' })]
  const r = auditar(cob, roto)
  assert.match(r.noPudoUbicar, /Concepto/)
  assert.deepEqual(r.fueraDeVentana, [],
    'un cuadro que no se pudo ubicar NO puede producir "$808,99M fuera de la ventana": eso es un hallazgo fabricado')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS TRES EXCLUSIONES DE DISEÑO, AHORA CON EL CUADRO PARTIDO POR LADO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Endosos, devoluciones y filas plantilla vacías NO son defectos: son diferencias legítimas entre la
// pestaña y el cuadro, cada una con su motivo (ver el encabezado de `auditar` y `libro-endosos.mjs`).
// El riesgo que trae partir el cuadre en dos es NUEVO: que la resta se aplique al lado equivocado. Un
// endoso marcado "Cobrado" tiene que restar del lado REAL — restarlo del proyectado dejaría los dos
// lados descuadrados por su importe, con el total cerrando igual que antes.

test('las tres exclusiones de diseño siguen excluidas, y cada una de SU lado', () => {
  const endosadoCobrado = fila({
    total: 10000000, cliente: 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', estado: 'Cobrado',
    cobro: '2026-08-15', banco: 'ENDOSADO a ALUMETAL S.A · echeq 90020100',
  })
  const devolucion = fila({ total: -96800, cliente: 'MACRO CONSTRUCCIONES SRL', estado: 'Cobrado', cobro: '2026-08-07' })
  const plantillaVacia = fila({ total: 0, cliente: '', estado: '' })
  const pendienteSano = fila({ total: 5000000, cliente: 'San Francisco', estado: 'Pendiente', cobro: '2026-08-19' })

  // El cuadro NO muestra ni el endoso ni la devolución en la línea de ingresos: real $0, proyectado $5M.
  const r = auditar([endosadoCobrado, devolucion, plantillaVacia, pendienteSano], cuadroConProyectado(0, 5000000), { tipoCambio: TC })
  const ago = r.porMes.find((m) => m.mes === '2026-08')
  assert.equal(r.cobros.length, 3, 'la fila plantilla sin monto no es un cobro vacío: no es un cobro')
  assert.equal(ago.lados.real.endosado, 10000000, 'el endoso resta del lado REAL: el estado es "Cobrado"')
  assert.equal(ago.lados.proyectado.endosado, 0, 'y NO del proyectado, que es donde el total lo taparía')
  assert.equal(ago.lados.real.devolucion, -96800, 'la devolución también es de una fila cobrada')
  assert.equal(ago.lados.real.cobranzas, 0, 'descontadas las dos, el lado real no espera nada del cuadro')
  assert.equal(ago.lados.proyectado.cobranzas, 5000000)
  assert.equal(ago.ok, true)
  assert.equal(r.endosados.length, 1)
  assert.equal(r.devoluciones.length, 1)
  assert.equal(r.ok, true)
})
