import test from 'node:test'
import assert from 'node:assert/strict'
import {
  correccionUsd, saldosEnDosVersiones, flujosDelEscenario, impactoEnCaja, semanaCritica,
  egresoMensualPromedio, cargaEnRegimen, picoDeCarga, tnaEquivalenteACft, alternativasParaLasDos,
  costoDeLaDemora,
} from './rodados-plan-caja.mjs'
import { CAJA, CORRECCION_USD, EGRESOS_REALES, FUENTES_DE_FONDOS, UVA } from './rodados-plan-datos.mjs'
import { planDeTresUnidades } from './rodados-plan.mjs'
import { compararFormasDePago } from './rodados-financiacion.mjs'

const PESO = 1

test('la corrección del cobro en USD no cuenta dos veces los $15.400 ya cargados', () => {
  // EL DEFECTO: sumar los USD convertidos completos ($22.984.869,60) regala $15.400 que el Sheet ya
  // tiene adentro —tomados como pesos—. La corrección es el convertido MENOS lo cargado.
  const c = correccionUsd()
  assert.ok(Math.abs(c - 22_969_469.60) < PESO, `corrección=${c}`)
  assert.notEqual(Math.round(c), Math.round(CORRECCION_USD.usd * CORRECCION_USD.tipoCambio))
  assert.equal(c, CORRECCION_USD.usd * CORRECCION_USD.tipoCambio - CORRECCION_USD.yaCargadoEnElSheet)
})

test('los saldos van en DOS versiones y la corrección arranca en el mes del cobro', () => {
  const s = saldosEnDosVersiones()
  const ajuste = correccionUsd()
  assert.equal(s.length, CAJA.cierres.length)
  for (const x of s) {
    // El cobro fue el 31/07: todos los meses del cuadro (agosto en adelante) lo arrastran.
    assert.ok(x.mes >= CORRECCION_USD.desdeMes)
    assert.ok(Math.abs(x.corregido - x.comoEsta - ajuste) < PESO, `${x.mes}`)
  }
  assert.equal(s.find((x) => x.mes === '2026-12').comoEsta, 28_200_688)
})

test('no comprar nada NO mueve la caja: el escenario base son los saldos del Sheet', () => {
  // Un escenario "sin comprar" que devuelva algo distinto de la proyección significa que se está
  // contando dos veces algo que ya estaba adentro (el Ford, por ejemplo).
  const cero = impactoEnCaja(0)
  for (const f of cero) {
    assert.equal(f.flujoDelMes, 0)
    assert.equal(f.comoEsta, CAJA.cierres.find((c) => c.mes === f.mes).cierre)
  }
})

test('las cuotas de FONDEFIN NO tocan la caja de 2026: empiezan en enero 2027', () => {
  const f = flujosDelEscenario(3)
  const dic = f.find((x) => x.mes === '2026-12')
  // En diciembre sale el aporte propio (gastos de retiro de las dos unidades), no cuotas del crédito.
  assert.ok(dic.gastosRetiro < 0)
  const cuotasDeFondefinEn2026 = f.reduce((s, x) => s + x.cuotas, 0)
  const soloU1 = flujosDelEscenario(1).reduce((s, x) => s + x.cuotas, 0)
  assert.ok(Math.abs(cuotasDeFondefinEn2026 - soloU1) < PESO, 'en 2026 las únicas cuotas son las del UVA')
})

test('con las TRES unidades la semana del 28/12 toca el descubierto pero NO perfora el acuerdo', () => {
  // Éste es el número que decide si el plan entra: el CIERRE de diciembre queda positivo ($6,2M) y
  // aun así la semana crítica se da vuelta. Mirar sólo el cierre habría dado luz verde en falso.
  const dic = impactoEnCaja(3).find((x) => x.mes === '2026-12')
  assert.ok(dic.comoEsta > 0, 'el cierre de diciembre queda positivo')
  const s3 = semanaCritica(3)
  assert.equal(s3.tocaDescubierto, true)
  assert.equal(s3.perforaAcuerdo, false)
  assert.ok(s3.comoEsta < 0 && s3.comoEsta > -CAJA.acuerdoDescubierto, `semana=${s3.comoEsta}`)
  // Con la corrección del USD aplicada, ni siquiera lo toca: el bache es del Sheet, no del plan.
  assert.ok(s3.corregido > 20_000_000)
  // Y con menos unidades no lo toca en ninguna versión.
  assert.equal(semanaCritica(2).tocaDescubierto, false)
  assert.equal(semanaCritica(1).tocaDescubierto, false)
})

test('pagar la unidad 1 con eCheq alivia diciembre y por eso hay que mirar el recargo', () => {
  const efectivo = impactoEnCaja(1).find((x) => x.mes === '2026-12')
  const echeq = impactoEnCaja(1, { variante: 'echeq' }).find((x) => x.mes === '2026-12')
  assert.ok(echeq.comoEsta > efectivo.comoEsta, 'diferir el anticipo deja más caja en diciembre')
  // El recargo NO se tipea acá: sale del módulo que ya lo midió contra el descubierto por dos vías.
  const comp = compararFormasDePago()
  assert.equal(comp.comparable, true)
  assert.equal(comp.veredicto, 'contado', 'el sobreprecio del eCheq supera lo que ahorra')
  // Septiembre queda intacto con eCheq: el primer cheque vence a 30 días.
  assert.equal(flujosDelEscenario(1, { variante: 'echeq' }).find((x) => x.mes === '2026-09').total, 0)
})

test('el egreso mensual promedio sale de meses CERRADOS, no del mes en curso', () => {
  const e = egresoMensualPromedio()
  assert.equal(e.meses, 7)
  assert.equal(e.hasta, '2026-07', 'agosto está en curso: su total todavía se mueve')
  const suma = EGRESOS_REALES.meses.reduce((s, m) => s + m.total, 0)
  assert.ok(Math.abs(e.promedio - suma / 7) < 0.01)
  assert.ok(e.promedio > 60_000_000 && e.promedio < 70_000_000, `promedio=${e.promedio}`)
})

test('la carga en régimen se mide contra el egreso ACTUALIZADO, no contra el de 2026', () => {
  const r = cargaEnRegimen({ desde: '2027-07', hasta: '2027-12' })
  const { promedio } = egresoMensualPromedio()
  assert.ok(r[0].egresoProyectado > promedio, 'el denominador también corre con la inflación')
  // El defecto: comparar una cuota de 2027 contra un egreso de 2026 exagera el peso en la misma
  // proporción en que corre la inflación, que acá es la mitad del análisis.
  assert.ok(r[0].total / promedio > r[0].pesoSobreEgresos)
  assert.ok(r.every((x) => x.pesoSobreEgresos < 0.10), 'la carga no llega al 10% de los egresos')
  const jun = cargaEnRegimen({ desde: '2027-06', hasta: '2027-06' })[0]
  assert.ok(r[0].total > jun.total, 'julio 2027 es el primer mes con capital de FONDEFIN')
})

test('el pico de carga de todo el plan cae en la última cuota del UVA', () => {
  const p = picoDeCarga()
  assert.equal(p.mes, '2028-09', 'la cuota 24 del UVA es la más ajustada por inflación')
  assert.ok(p.total > 4_500_000 && p.total < 6_000_000, `pico=${p.total}`)
  assert.ok(p.pesoSobreEgresos < 0.10)
})

test('la TNA equivalente reconstruye el CFT publicado: el prendario se compara por su costo TOTAL', () => {
  const cft = FUENTES_DE_FONDOS.find((f) => f.clave === 'prendario-mercado').cft
  const tna = tnaEquivalenteACft(cft)
  assert.ok(Math.abs((1 + tna / 12) ** 12 - 1 - cft) < 1e-12, 'ida y vuelta exacta')
  // El defecto: comparar FONDEFIN contra la TNA DE VIDRIERA del prendario (38,90%) en vez de su CFT
  // (65,10%) borra justamente el IVA, el seguro y los gastos — o sea, borra el motivo del análisis.
  assert.ok(tna > 0.389 && tna < cft, `tna equivalente=${tna}`)
})

test('el prendario de mercado cuesta MUCHO más que FONDEFIN, en nominal y en pesos de hoy', () => {
  const a = alternativasParaLasDos()
  const f = a.alternativas.find((x) => x.clave === 'fondefin')
  const p = a.alternativas.find((x) => x.clave === 'prendario-mercado')
  const u = a.alternativas.find((x) => x.clave === 'uva-24')
  assert.equal(f.capital, 60_000_000, 'FONDEFIN pide de más porque le detraen el 2%')
  assert.equal(p.capital, a.precioDeLasDos, 'el prendario financia el precio')
  assert.ok(f.costoReal < 0, 'FONDEFIN devuelve menos valor del que recibe')
  assert.ok(p.costoReal > 0, 'el prendario destruye valor')
  assert.ok(a.sobrecostoPrendario.nominal > 50_000_000, `nominal=${a.sobrecostoPrendario.nominal}`)
  assert.ok(a.sobrecostoPrendario.real > 25_000_000, `real=${a.sobrecostoPrendario.real}`)
  // EL CONTROL DE QUE LA VARA ES LA MISMA PARA LAS TRES: el UVA es una indexación pura, así que su
  // costo REAL tiene que dar CERO. Cuando cada alternativa se medía contra su propio capital nominal,
  // el UVA mostraba −$3,2M de "ahorro" que eran cuatro meses de inflación regalados a las tres.
  assert.ok(Math.abs(u.costoReal) < 1, `el UVA 0% cuesta 0% real, dio ${u.costoReal}`)
  assert.ok(Math.abs(u.anticipoEnEfectivo / a.precioDeLasDos - UVA.anticipoEfectivo / UVA.precioTotal) < 1e-9)
  assert.ok(a.sobrecostoUva.real > 0 && a.sobrecostoUva.real < a.sobrecostoPrendario.real)
  // Y el bien contra el que se comparan es el mismo para todas.
  assert.ok(Math.abs(a.vpDelBien * (1 + planDeTresUnidades().inflacionMensual) ** 4 - a.precioDeLasDos) < 1)
})

// ═══ DOS TABLAS DEL MISMO INFORME NO PUEDEN COBRAR DOS IVAs (13/08/2026) ═══
//
// El defecto: `alternativasParaLasDos` tenía un `iva: 0.21` TIPEADO A MANO, mientras la tabla 3 usaba
// `FONDEFIN.ivaSobreIntereses`. Mientras los dos literales dijeron 21 nadie lo vio. El día que el
// dueño corrigió la alícuota a 10,5%, la tabla 3 y la tabla 7 del MISMO informe habrían mostrado dos
// costos distintos del mismo crédito, y el que decide no tiene forma de saber cuál mirar.
//
// El cuadro de las dos unidades es lineal en el capital: con el mismo IVA tiene que dar exactamente
// el doble de una. Si alguien vuelve a tipear una alícuota acá, este test se pone rojo.
test('la tabla 7 y la tabla 3 cobran el MISMO IVA: una sola fuente, no dos literales', () => {
  const plan = planDeTresUnidades()
  const unaUnidad = plan.unidades[1].cuadro
  const dos = alternativasParaLasDos({ plan }).alternativas.find((x) => x.clave === 'fondefin')
  assert.ok(Math.abs(dos.totalPagado - unaUnidad.totalPagado * 2) < PESO,
    `dos unidades ${dos.totalPagado} vs 2 × una ${unaUnidad.totalPagado * 2}: hay dos IVAs distintos`)
  assert.equal(dos.capital, unaUnidad.capital * 2)
  // Y sigue siendo un PISO: sin CFT no hay total, por mucho que el IVA ya tenga dueño y fecha.
  assert.equal(dos.esPiso, true)
  // El prendario, que SÍ publica CFT, es el único de los tres que no lo es.
  assert.equal(alternativasParaLasDos({ plan }).alternativas.find((x) => x.clave === 'prendario-mercado').esPiso, false)
})

test('cada mes de demora tiene un precio, y es distinto del costo de cambiar de fuente', () => {
  const d = costoDeLaDemora()
  const unMes = d.porMesDeEsperaEnElPrecio[0]
  assert.equal(unMes.mesDeDesembolso, '2027-01')
  assert.ok(unMes.sobrecosto > 1_200_000 && unMes.sobrecosto < 1_400_000, `1 mes=${unMes.sobrecosto}`)
  // Compone: seis meses NO son seis veces un mes.
  const seis = d.porMesDeEsperaEnElPrecio.find((x) => x.meses === 6)
  assert.ok(seis.sobrecosto > unMes.sobrecosto * 6)
  // Los dos costos son de naturaleza distinta y por eso van separados: uno corre por mes, el otro se
  // paga una sola vez si la demora obliga a comprar por otra vía.
  assert.ok(d.siHayQueCambiarDeFuente.real > seis.sobrecosto)
})

test('el plan es reproducible: mismos insumos, mismos números', () => {
  // Sin esto, cualquier tabla publicada es irrepetible y no se puede auditar contra su fuente.
  const a = JSON.stringify(planDeTresUnidades().unidades.map((u) => u.cuadro.totalPagado))
  const b = JSON.stringify(planDeTresUnidades().unidades.map((u) => u.cuadro.totalPagado))
  assert.equal(a, b)
})
