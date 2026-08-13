import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sumarMeses, diffMeses, rangoDeMeses, encadenar, aMensual, aAnual, inflacionDeTrabajo, tasaReal,
  cuotaFrancesa, cuadroFrances, cuadroUva, valorPresente, montoASolicitar, garantiaPrendaria,
  gastosRetiroC31, planDeTresUnidades, costoDeCadaUnidad, compararFuentes, calendarioDeCuotas,
} from './rodados-plan.mjs'
import { C31, C32, CAJA, CORRECCION_USD, FONDEFIN, PRENDARIO_FORD, UVA } from './rodados-plan-datos.mjs'
import { IPC } from './ipc-publicado.mjs'
import { CONDICION_FONDEFIN, IVA_SOBRE_INTERESES } from './linea-fondefin.mjs'

const CENTAVO = 0.01

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CALENDARIO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('la aritmética de meses cruza el año en las dos direcciones', () => {
  // El defecto clásico: (mes-1+n) % 12 con n negativo devuelve un mes negativo y arma '2026-00'.
  assert.equal(sumarMeses('2026-12', 1), '2027-01')
  assert.equal(sumarMeses('2026-01', -1), '2025-12')
  assert.equal(sumarMeses('2026-08', 12), '2027-08')
  assert.equal(diffMeses('2026-08', '2027-01'), 5)
  assert.equal(diffMeses('2027-01', '2026-08'), -5)
  assert.equal(diffMeses('2026-09', '2026-09'), 0)
  assert.equal(rangoDeMeses('2026-11', '2027-02').join(','), '2026-11,2026-12,2027-01,2027-02')
  for (const malo of [null, 'agosto', '2026', '2026-13-01']) assert.equal(sumarMeses(malo, 1), null)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INFLACIÓN Y TASA REAL
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('la inflación de trabajo SE DERIVA del IPC publicado, no se tipea', () => {
  const inf = inflacionDeTrabajo()
  const esperado = aMensual(encadenar(IPC.slice(-3).map((m) => m.variacion)), 3)
  assert.equal(inf.mensual, esperado)
  assert.equal(inf.anual, aAnual(esperado))
  // Si el INDEC publica otro mes y alguien lo agrega a ipc-publicado.mjs, esto se mueve solo.
  assert.deepEqual(inf.meses, IPC.slice(-3).map((m) => m.periodo))
  // El orden de magnitud verificable a mano: 2,6% · 2,1% · 1,9% encadenados y anualizados ≈ 29,8%.
  assert.ok(Math.abs(inf.anual - 0.2983) < 0.0005, `anual=${inf.anual}`)
})

test('la tasa real es Fisher, NO la resta ingenua — y la diferencia decide', () => {
  const infl = 0.2983421231215264
  const real = tasaReal(0.1787873722313813, infl)
  assert.ok(real < 0, 'FONDEFIN tiene tasa real NEGATIVA: se devuelve con pesos que valen menos')
  assert.ok(Math.abs(real - -0.0921) < 0.0005, `real=${real}`)
  // La resta ingenua daría −12,0 puntos: 3 puntos de diferencia sobre $60M a 4 años no es redondeo.
  assert.notEqual(Math.round(real * 1000), Math.round((0.1787873722313813 - infl) * 1000))
  assert.ok(tasaReal(0.6278, infl) > 0, 'el descubierto es real POSITIVO: destruye valor')
  // Si alguien invierte numerador y denominador, los dos signos se dan vuelta y esto se rompe.
  assert.ok(tasaReal(infl, infl) === 0)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// CUOTAS
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('la cuota francesa a tasa CERO no se indefine: es capital/n', () => {
  // El defecto: la fórmula general divide por (1-(1+0)^-n) = 0. El crédito UVA es exactamente eso.
  assert.equal(cuotaFrancesa(24_000_000, 0, 24), 1_000_000)
  assert.ok(Number.isFinite(cuotaFrancesa(24_000_000, 0, 24)))
  for (const malo of [[0, 0.01, 12], [1000, 0.01, 0], [1000, -0.01, 12], [1000, NaN, 12]]) {
    assert.equal(cuotaFrancesa(...malo), null, `cuotaFrancesa(${malo}) debería ser null`)
  }
})

test('el cuadro francés amortiza el capital ENTERO y termina en saldo cero', () => {
  const c = cuadroFrances(30_000_000, 0.136875, { cuotas: 48, gracia: 6, iva: 0.21 })
  const amortizado = c.filas.reduce((s, f) => s + f.amortizacion, 0)
  assert.ok(Math.abs(amortizado - 30_000_000) < CENTAVO, `amortizado=${amortizado}`)
  assert.ok(Math.abs(c.filas[c.filas.length - 1].saldo) < CENTAVO)
  assert.equal(c.filas.length, 48)
  // La cuota total es capital + interés + IVA: si el IVA se olvidara, esto queda corto un 21%.
  const suma = c.filas.reduce((s, f) => s + f.amortizacion + f.interes + f.iva, 0)
  assert.ok(Math.abs(suma - c.totalPagado) < CENTAVO)
})

test('la GRACIA no es gratis: no amortiza y encarece el total', () => {
  const con = cuadroFrances(30_000_000, 0.136875, { cuotas: 48, gracia: 6, iva: 0 })
  const sin = cuadroFrances(30_000_000, 0.136875, { cuotas: 48, gracia: 0, iva: 0 })
  for (let k = 0; k < 6; k++) {
    assert.equal(con.filas[k].amortizacion, 0, `la cuota ${k + 1} está en gracia: no amortiza`)
    assert.equal(con.filas[k].saldo, 30_000_000, 'durante la gracia el saldo queda intacto')
  }
  assert.ok(con.filas[6].amortizacion > 0, 'la cuota 7 ya amortiza')
  // El defecto que esto atrapa: presentar la gracia como un beneficio sin costo.
  assert.ok(con.totalIntereses > sin.totalIntereses, 'seis meses sin amortizar cuestan intereses extra')
  assert.ok(con.filas[0].cuota < sin.filas[0].cuota, 'a cambio, la primera cuota es más liviana')
})

test('el IVA DESCONOCIDO no es IVA cero: el cuadro devuelve null y se declara PISO', () => {
  // Misma regla que costoEfectivo en condiciones-financieras.mjs. Tratar un IVA desconocido como 0
  // subestimaría el egreso hasta 21 puntos de los intereses sin decir una palabra.
  const c = cuadroFrances(30_000_000, 0.136875, { cuotas: 48, gracia: 6, iva: null })
  assert.equal(c.filas[0].iva, null)
  assert.equal(c.totalIva, null)
  assert.equal(c.esPiso, true)
  assert.equal(c.filas[0].cuota, c.filas[0].interes, 'sin IVA declarado la cuota de gracia es sólo interés')
})

// ═══ EL DEFECTO QUE DESTAPÓ LA CORRECCIÓN DEL IVA (13/08/2026) ═══
//
// `esPiso` se resolvía leyendo `FONDEFIN.ivaSobreInteresesDeclarado` desde una función genérica.
// Mientras ese campo fue null devolvía `true` para todos y el defecto no se veía. En cuanto el dueño
// declaró el IVA, el MISMO renglón empezó a devolver `false` para el cuadro de FONDEFIN — o sea, a
// afirmar TOTAL sobre un crédito sin CFT, sin sellos, sin seguro de vida y sin tasación. Un dato que
// llega no puede convertir un piso en un total.
//
// Si alguien vuelve a atar `esPiso` al IVA en vez de al CFT, este test se pone rojo.
test('lo que separa un PISO de un TOTAL es el CFT, no el IVA', () => {
  const conIvaSinCft = cuadroFrances(30_000_000, 0.136875, { cuotas: 48, gracia: 6, iva: 0.105 })
  assert.equal(conIvaSinCft.esPiso, true, 'con IVA declarado pero sin CFT sigue siendo un PISO')
  assert.equal(cuadroFrances(30_000_000, 0.136875, { cuotas: 48, gracia: 6, iva: 0.21 }).esPiso, true)
  // Con CFT publicado sí es un total — y ése es el caso del prendario de mercado.
  assert.equal(cuadroFrances(30_000_000, 0.389, { cuotas: 48, iva: 0, cftPublicado: 0.651 }).esPiso, false)
  // Pero un CFT publicado NO tapa un IVA desconocido: siguen siendo dos huecos distintos.
  assert.equal(cuadroFrances(30_000_000, 0.389, { cuotas: 48, iva: null, cftPublicado: 0.651 }).esPiso, true)
  // Y el cuadro real de FONDEFIN, que no tiene CFT, se declara PISO aunque el IVA tenga dueño y fecha.
  assert.equal(CONDICION_FONDEFIN.cft, null)
  assert.equal(planDeTresUnidades().unidades[1].cuadro.esPiso, true)
})

test('la UVA 0% cuesta CERO EN TÉRMINOS REALES: el valor presente es el capital exacto', () => {
  const inf = inflacionDeTrabajo().mensual
  const c = cuadroUva(24_517_500, 24, inf)
  assert.ok(Math.abs(c.valorPresente - 24_517_500) < CENTAVO, `vp=${c.valorPresente}`)
  // Y sin embargo NO es gratis en pesos: el ajuste del capital es plata que sale de la caja.
  assert.ok(c.costoNominal > 8_000_000, `costo nominal=${c.costoNominal}`)
  assert.equal(c.cuotaNominal, 24_517_500 / 24)
  // El defecto que atrapa: si alguien indexa la cuota pero descuenta a otra tasa, o corre el índice
  // un mes, el valor presente deja de dar el capital y el "0% real" se vuelve una frase.
  const desalineado = valorPresente(c.filas.map((f) => ({ k: f.k + 1, importe: f.cuota })), inf)
  assert.ok(Math.abs(desalineado - 24_517_500) > 100_000)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FONDEFIN: MONTO Y GARANTÍA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('los gastos de otorgamiento se DIVIDEN, no se restan', () => {
  const solicitado = montoASolicitar(29_400_000)
  assert.equal(solicitado, 30_000_000)
  // La prueba del efecto: descontado el 2%, al proveedor le llega el precio EXACTO.
  assert.ok(Math.abs(solicitado * (1 - FONDEFIN.gastosOtorgamiento) - 29_400_000) < CENTAVO)
  // El defecto: restar el 2% deja la operación corta por $588.000 y el rodado sin pagar.
  assert.notEqual(solicitado, 29_400_000 * (1 - FONDEFIN.gastosOtorgamiento))
  assert.equal(montoASolicitar(0), null)
  assert.equal(montoASolicitar(29_400_000, 1), null)
})

test('la prenda cubre el 200% del CRÉDITO: las dos unidades nuevas NO alcanzan', () => {
  const g = garantiaPrendaria(60_000_000, 58_800_000)
  assert.equal(g.requerida, 120_000_000)
  assert.equal(g.alcanza, false)
  assert.equal(g.faltante, 61_200_000)
  // El defecto que atrapa: leer "200%" como "la unidad tiene que valer el doble de sí misma" o como
  // "alcanza con prendar lo comprado". Sin garantía adicional no hay desembolso, y eso frena el plan.
  assert.equal(garantiaPrendaria(60_000_000, 120_000_000).alcanza, true)
})

test('los gastos de retiro del C31 salen marcados ESTIMACIÓN, nunca como dato', () => {
  const g = gastosRetiroC31()
  assert.equal(g.clase, 'ESTIMACIÓN')
  assert.equal(C31.gastosRetiro, null, 'no hay presupuesto cerrado del C31')
  // Es la proporción REAL del C32, no un porcentaje elegido: $3.600.000 sobre $33.400.000.
  assert.equal(g.proporcion, (C32.total - C32.precioUnidad) / C32.precioUnidad)
  assert.ok(Math.abs(g.importe - g.proporcion * C31.precioLista) < CENTAVO)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EL PLAN
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('el plan respeta la estructura de la decisión: UVA para septiembre, FONDEFIN para diciembre', () => {
  const p = planDeTresUnidades()
  assert.equal(p.unidades.length, 3)
  assert.equal(p.unidades[0].mesEntrega, '2026-09')
  assert.equal(p.unidades[0].financiado, UVA.capital)
  // Las 2 y 3 son CABINA SIMPLE: FONDEFIN no financia doble cabina. Si alguien pone el C32 acá, el
  // crédito no sale y el plan entero es papel.
  assert.match(p.unidades[1].modelo, /Cabina Simple/)
  assert.match(p.unidades[2].modelo, /Cabina Simple/)
  assert.equal(p.unidades[1].mesEntrega, '2026-12')
  assert.equal(p.unidades[1].mesPrimeraCuota, '2027-01')
  assert.equal(p.unidades[1].cuadro.gracia, 6)
})

test('la unidad 1 tiene costo financiero real CERO y las de FONDEFIN, NEGATIVO', () => {
  const costos = costoDeCadaUnidad()
  assert.ok(Math.abs(costos[0].costoFinancieroReal) < 1, `u1 real=${costos[0].costoFinancieroReal}`)
  assert.ok(costos[0].costoFinancieroNominal > 8_000_000, 'pero en pesos corrientes sí cuesta')
  for (const u of [costos[1], costos[2]]) {
    assert.ok(u.costoFinancieroReal < -3_000_000, `FONDEFIN devuelve menos valor del que recibe: ${u.costoFinancieroReal}`)
    assert.ok(u.costoFinancieroNominal > 0, 'y sin embargo en pesos corrientes se paga más')
  }
  // Los tres son PISO: falta el CFT de FONDEFIN y el "+ SEGURO" sin importe del presupuesto UVA.
  assert.deepEqual(costos.map((c) => c.esPiso), [true, true, true])
  assert.equal(costos[0].mesUltimaCuota, '2028-09')
  assert.equal(costos[1].mesUltimaCuota, '2030-12')
})

test('las fuentes se ordenan por TASA REAL y FONDEFIN queda primera', () => {
  const f = compararFuentes()
  assert.equal(f[0].clave, 'fondefin')
  assert.ok(f[0].tasaReal < 0)
  // El orden por tasa NOMINAL pondría primero al UVA 0%, que es exactamente el error del informe
  // anterior: una TNA de 0 no es plata gratis cuando el capital se indexa.
  assert.notEqual([...f].sort((a, b) => a.tna - b.tna)[0].clave, 'fondefin')
  assert.ok(f.every((x, i, arr) => i === 0 || x.tasaReal >= arr[i - 1].tasaReal), 'ordenada')
  const desc = f.find((x) => x.clave === 'descubierto')
  assert.equal(desc.esPiso, false, 'el descubierto es la única con CFT publicado e IVA verificado')
  assert.equal(f.find((x) => x.clave === 'fondefin').esPiso, true, 'FONDEFIN sin CFT: es un PISO')
  // La TNA con IVA de FONDEFIN: 13,6875% × 1,105 = 15,1247%. Con el 21% del contrato anterior era
  // 16,5619%. El IVA ya NO es un supuesto del OS —lo declaró el dueño el 13/08— pero tampoco está
  // verificado contra la norma, y eso tiene que llegar impreso a la tabla.
  assert.ok(Math.abs(f[0].tnaConIva - 0.151246875) < 1e-9, `tnaConIva=${f[0].tnaConIva}`)
  assert.equal(f[0].ivaEsSupuesto, false)
  assert.match(f[0].ivaNota, /dueño/)
  assert.match(f[0].ivaNota, /no verificado/)
})

test('el calendario de cuotas ubica la gracia y avisa qué cuotas del Ford no están en el Sheet', () => {
  const cal = calendarioDeCuotas(planDeTresUnidades(), { desde: '2026-09', hasta: '2027-12' })
  const sep = cal.find((c) => c.mes === '2026-09')
  assert.equal(sep.totalUnidades, 0, 'la unidad 1 se entrega en septiembre: la primera cuota es octubre')
  assert.ok(cal.find((c) => c.mes === '2026-10').totalUnidades > 0)
  const jun = cal.find((c) => c.mes === '2027-06')
  const jul = cal.find((c) => c.mes === '2027-07')
  assert.ok(jun.porUnidad[1].enGracia && !jul.porUnidad[1].enGracia, 'la gracia termina en junio 2027')
  assert.ok(jul.total - jun.total > 1_000_000, 'el salto de julio 2027 es el fin de la gracia')
  // El defecto de caja: las cuotas 27–60 del Ford NO están en la proyección del Cash Flow.
  assert.equal(cal.find((c) => c.mes === '2026-12').fordCargadoEnElSheet, true)
  assert.equal(cal.find((c) => c.mes === '2027-01').fordCargadoEnElSheet, false)
  assert.equal(jul.ford, PRENDARIO_FORD.cuota)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LOS DATOS DECLARAN LO QUE NO SABEN
// ─────────────────────────────────────────────────────────────────────────────────────────────────

test('lo que no se sabe viaja como DESCONOCIDO, nunca como cero', () => {
  assert.equal(C31.gastosRetiro, null)
  assert.ok(C31.desconocido.length >= 3)
  assert.equal(FONDEFIN.ivaPublicadoPorElRop, null, 'el ROP no publica el IVA sobre intereses')
  // El IVA con el que se calcula NO es un supuesto del OS ni sale de un literal de este archivo: lo
  // declaró el dueño y vive UNA sola vez, en linea-fondefin.mjs. Dos literales fue el defecto que
  // casi deja la tabla 3 y la tabla 7 del mismo informe con dos costos distintos del mismo crédito.
  assert.equal(FONDEFIN.ivaSobreIntereses, IVA_SOBRE_INTERESES)
  assert.equal(FONDEFIN.ivaSobreIntereses, CONDICION_FONDEFIN.iva_sobre_intereses)
  assert.equal(FONDEFIN.ivaSobreIntereses, 0.105, 'dato del dueño 13/08/2026, corrige su propio 21%')
  assert.equal(FONDEFIN.origenIva.verificado_contra_la_norma, false, 'tener padre no es estar verificado')
  assert.equal(CONDICION_FONDEFIN.cft, null, 'sin CFT, todo número de FONDEFIN es un PISO')
  assert.ok(CORRECCION_USD.estado.includes('todavía no aplicada'))
  assert.ok(CAJA.acuerdoDescubierto > 0 && CAJA.semanaMasAjustada.cierre > 0)
})
