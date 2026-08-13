// EL PLAN DE TRES RODADOS CONTRA LA CAJA — escenarios, régimen y el costo de demorar la carpeta.
//
// ═══ POR QUÉ ESTÁ SEPARADO DE `rodados-plan.mjs` ═══
//
// Aquél calcula las CUOTAS: aritmética financiera pura que vale con cualquier caja. Éste las cruza
// contra la caja REAL de esta empresa, que tiene dos defectos conocidos y declarados (el cobro en USD
// sin convertir y las cuotas 27–60 del Ford sin cargar). Mezclarlos escondería que el segundo depende
// de datos con fecha de vencimiento y el primero no.
//
// ═══ EL CIERRE DE MES NO ES EL PISO DEL MES ═══
//
// Diciembre cierra en $28,2M y dentro del mes toca $20,3M la semana del 28. Una compra que "entra
// cómoda" mirando el cierre puede perforar el acuerdo de descubierto una semana antes. Por eso todo
// escenario se mide DOS veces: contra el cierre y contra el mínimo semanal conocido.

import { CAJA, CORRECCION_USD, EGRESOS_REALES, FUENTES_DE_FONDOS, PRENDARIO_FORD, UVA, C31 } from './rodados-plan-datos.mjs'
import { calendarioDeCuotas, cuadroFrances, diffMeses, inflacionDeTrabajo, planDeTresUnidades, rangoDeMeses, valorPresente } from './rodados-plan.mjs'
import { compararFormasDePago } from './rodados-financiacion.mjs'

const MESES_ANIO = 12

/**
 * NÚCLEO PURO: la corrección del cobro en dólares.
 * Es el convertido MENOS lo ya cargado. Sumar el convertido entero contaría dos veces los $15.400 que
 * el Sheet sí tiene —tomados como pesos— y regalaría plata que no existe.
 */
export const correccionUsd = (c = CORRECCION_USD) => c.usd * c.tipoCambio - c.yaCargadoEnElSheet

/** Los saldos de cierre, en las dos versiones: como está el Sheet hoy y corregido por el USD. */
export function saldosEnDosVersiones(caja = CAJA, c = CORRECCION_USD) {
  const ajuste = correccionUsd(c)
  return caja.cierres.map((x) => ({
    mes: x.mes,
    comoEsta: x.cierre,
    corregido: x.mes >= c.desdeMes ? x.cierre + ajuste : x.cierre,
  }))
}

/**
 * LOS FLUJOS NUEVOS DE CADA ESCENARIO, mes a mes. Sólo lo que la compra AGREGA: el Ford y todo lo
 * demás ya están dentro de los saldos proyectados de 2026 y volver a restarlos sería contarlo dos
 * veces (el error que ya deformó el rubro Financiero en la pestaña Impuestos).
 *
 * `variante` 'efectivo' | 'echeq' cambia sólo cómo se paga el anticipo de la unidad 1. El recargo del
 * eCheq NO se tipea: sale de `compararFormasDePago`, que lo mide contra el descubierto por dos vías.
 */
export function flujosDelEscenario(unidades, { plan = planDeTresUnidades(), variante = 'efectivo', desde = '2026-09', hasta = '2026-12' } = {}) {
  const meses = rangoDeMeses(desde, hasta)
  const cuotas = calendarioDeCuotas(plan, { desde, hasta })
  const gastosPorUnidadFondefin = plan.gastosRetiroC31.importe
  const comparacion = compararFormasDePago()
  const chequesU1 = variante === 'echeq' && comparacion.comparable
    ? comparacion.plazo.plazosDias.map((d) => ({ mes: sumarDiasAMes(plan.unidades[0].mesEntrega, d), importe: comparacion.plazo.importeCadaUno }))
    : []

  return meses.map((mes) => {
    const u1 = unidades >= 1
    const fondefin = Math.max(0, Math.min(unidades, 3) - 1)
    const anticipo = u1 && mes === plan.unidades[0].mesEntrega && variante === 'efectivo' ? -plan.unidades[0].desembolsoPropio : 0
    const echeq = -chequesU1.filter((c) => c.mes === mes).reduce((s, c) => s + c.importe, 0)
    const fila = cuotas.find((c) => c.mes === mes)
    const cuotasNuevas = -fila.porUnidad
      .filter((x) => x.unidad <= unidades)
      .reduce((s, x) => s + x.cuota, 0)
    const gastosRetiro = fondefin > 0 && mes === plan.unidades[1].mesEntrega ? -gastosPorUnidadFondefin * fondefin : 0
    return { mes, anticipo, echeq, cuotas: cuotasNuevas, gastosRetiro, total: anticipo + echeq + cuotasNuevas + gastosRetiro }
  })
}

/** Suma días a un mes 'AAAA-MM' tratando el mes como su día 1. Sirve para ubicar un eCheq a 30/60/90. */
function sumarDiasAMes(mes, dias) {
  const [a, m] = String(mes).split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, 1))
  d.setUTCDate(d.getUTCDate() + Number(dias))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * EL IMPACTO EN CAJA de un escenario, en las dos versiones del Sheet y contra los dos umbrales:
 * el cero (toca el descubierto) y el acuerdo (lo perfora).
 */
export function impactoEnCaja(unidades, opciones = {}) {
  const flujos = flujosDelEscenario(unidades, opciones)
  const saldos = saldosEnDosVersiones()
  let acumulado = 0
  return flujos.map((f) => {
    acumulado += f.total
    const base = saldos.find((s) => s.mes === f.mes)
    return {
      mes: f.mes, flujoDelMes: f.total, acumulado,
      comoEsta: base.comoEsta + acumulado,
      corregido: base.corregido + acumulado,
      tocaDescubierto: base.comoEsta + acumulado < 0,
      perforaAcuerdo: base.comoEsta + acumulado < -CAJA.acuerdoDescubierto,
    }
  })
}

/**
 * LA SEMANA MÁS AJUSTADA DEL AÑO con el escenario encima. Es el número que decide si la compra entra:
 * el cierre de diciembre puede quedar en positivo y la semana del 28 igual perforar el acuerdo.
 */
export function semanaCritica(unidades, opciones = {}) {
  const impacto = impactoEnCaja(unidades, opciones)
  const dic = impacto[impacto.length - 1]
  const ajuste = correccionUsd()
  const base = CAJA.semanaMasAjustada.cierre
  return {
    semanaDel: CAJA.semanaMasAjustada.semanaDel,
    unidades,
    comoEsta: base + dic.acumulado,
    corregido: base + ajuste + dic.acumulado,
    margenHastaElCero: base + dic.acumulado,
    margenHastaElAcuerdo: base + dic.acumulado + CAJA.acuerdoDescubierto,
    tocaDescubierto: base + dic.acumulado < 0,
    perforaAcuerdo: base + dic.acumulado < -CAJA.acuerdoDescubierto,
  }
}

/** El egreso mensual promedio de meses CERRADOS. El denominador de la sostenibilidad. */
export function egresoMensualPromedio(e = EGRESOS_REALES) {
  const total = e.meses.reduce((s, m) => s + m.total, 0)
  return { promedio: total / e.meses.length, meses: e.meses.length, desde: e.meses[0].mes, hasta: e.meses[e.meses.length - 1].mes }
}

/**
 * LA CARGA EN RÉGIMEN — cuando ya no hay gracia y corren las tres cuotas más el Ford.
 *
 * Se mide contra el egreso promedio ACTUALIZADO por inflación al mes en cuestión, no contra el
 * promedio histórico: comparar una cuota de 2027 contra un egreso de 2026 exagera el peso de la cuota
 * en la misma proporción en que corre la inflación, que acá es la mitad del análisis.
 */
export function cargaEnRegimen({ plan = planDeTresUnidades(), desde = '2027-07', hasta = '2027-12' } = {}) {
  const inf = plan.inflacionMensual
  const { promedio } = egresoMensualPromedio()
  const base = EGRESOS_REALES.meses[EGRESOS_REALES.meses.length - 1].mes
  return calendarioDeCuotas(plan, { desde, hasta }).map((f) => {
    const egreso = promedio * (1 + inf) ** diffMeses(base, f.mes)
    return {
      mes: f.mes, cuotasUnidades: f.totalUnidades, ford: f.ford, total: f.total,
      egresoProyectado: egreso, pesoSobreEgresos: f.total / egreso,
    }
  })
}

/** El mes de mayor carga de todo el plan y cuánto pesa. Un solo número para decidir. */
export function picoDeCarga(plan = planDeTresUnidades()) {
  const filas = cargaEnRegimen({ plan, desde: '2026-09', hasta: '2030-06' })
  return filas.reduce((a, b) => (b.total > a.total ? b : a))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// EL COSTO DE NO PRESENTAR LA CARPETA AHORA
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * NÚCLEO PURO: la TNA que reproduce un CFT publicado capitalizando mensualmente.
 * Se usa para armar el cuadro del prendario de mercado con SU costo total real (65,10%) en vez de con
 * su TNA de vidriera (38,90%), que deja afuera IVA, seguro y gastos — o sea, deja afuera el motivo por
 * el que FONDEFIN existe.
 */
export const tnaEquivalenteACft = (cft) =>
  (Number(cft) > -1 ? MESES_ANIO * ((1 + Number(cft)) ** (1 / MESES_ANIO) - 1) : null)

/**
 * QUÉ CUESTA COMPRAR LAS UNIDADES 2 Y 3 POR OTRA VÍA — FONDEFIN, el prendario de mercado a 48 meses
 * y el UVA a 24 (que exige anticipo en efectivo).
 *
 * ═══ LAS TRES SE COMPARAN CONTRA EL MISMO BIEN, NO CONTRA SU PROPIO CAPITAL ═══
 *
 * Cada vía pide un capital distinto para comprar exactamente lo mismo: FONDEFIN necesita $60.000.000
 * porque le detraen el 2%, el prendario $58.800.000, y el UVA financia sólo dos tercios porque el
 * presupuesto real exige anticipo. Medir el costo de cada una contra SU capital compara tres cosas
 * distintas; medirlo contra el valor presente de PAGAR LAS DOS UNIDADES AL CONTADO EN DICIEMBRE las
 * pone en la misma vara. Con esta base el UVA da exactamente cero de costo real —una indexación pura
 * no cuesta nada real— y todo lo que se aleje de cero es mérito o culpa de la fuente de fondos.
 *
 * El error que esto corrige ya estaba escrito acá: descontar las cuotas a agosto y restarles un
 * capital nominal de diciembre le regalaba a toda alternativa cuatro meses de inflación.
 */
export function alternativasParaLasDos({ plan = planDeTresUnidades() } = {}) {
  const inf = plan.inflacionMensual
  const u = plan.unidades[1]
  const precioDeLasDos = C31.precioLista * 2
  const mesesHastaDesembolso = diffMeses('2026-08', u.mesEntrega)
  const mesesHastaPrimeraCuota = diffMeses('2026-08', u.mesPrimeraCuota)
  const vp = (filas) => valorPresente(filas.map((f) => ({ k: f.k + mesesHastaPrimeraCuota - 1, importe: f.cuota })), inf)
  // La vara: lo que costaría pagar las dos unidades al contado el mes en que se entregan.
  const vpDelBien = precioDeLasDos / (1 + inf) ** mesesHastaDesembolso

  const fondefin = cuadroFrances(u.financiado * 2, u.cuadro.tasaMensual * MESES_ANIO, {
    cuotas: u.cuadro.cuotas, gracia: u.cuadro.gracia, iva: 0.21,
  })
  // El prendario no detrae gastos del desembolso: financia el precio. Su CFT ya los incluye.
  const prendarioCft = FUENTES_DE_FONDOS.find((f) => f.clave === 'prendario-mercado').cft
  const prendario = cuadroFrances(precioDeLasDos, tnaEquivalenteACft(prendarioCft), { cuotas: 48, gracia: 0, iva: 0 })
  // El UVA a 24 meses no financia el 100%: el presupuesto real exige el mismo anticipo proporcional.
  const anticipoUva = precioDeLasDos * (UVA.anticipoEfectivo / UVA.precioTotal)
  const capitalUva = precioDeLasDos - anticipoUva
  const uva = {
    capital: capitalUva, cuotas: 24, esPiso: true,
    filas: Array.from({ length: 24 }, (_, i) => ({ k: i + 1, cuota: (capitalUva / 24) * (1 + inf) ** (i + 1) })),
  }
  uva.totalPagado = uva.filas.reduce((s, f) => s + f.cuota, 0)

  const arme = (clave, cuadro, anticipo = 0) => {
    const vpAnticipo = anticipo / (1 + inf) ** mesesHastaDesembolso
    const vpTotal = vp(cuadro.filas) + vpAnticipo
    return {
      clave, capital: cuadro.capital, cuotas: cuadro.cuotas, anticipoEnEfectivo: anticipo,
      desembolsoTotal: cuadro.totalPagado + anticipo,
      cuotaInicial: cuadro.filas[0].cuota,
      cuotaMaxima: Math.max(...cuadro.filas.map((f) => f.cuota)),
      totalPagado: cuadro.totalPagado,
      costoNominal: cuadro.totalPagado + anticipo - precioDeLasDos,
      valorPresente: vpTotal,
      costoReal: vpTotal - vpDelBien,
      esPiso: cuadro.esPiso !== false,
    }
  }

  const a = arme('fondefin', fondefin)
  const b = arme('prendario-mercado', prendario)
  const c = arme('uva-24', uva, anticipoUva)
  return {
    precioDeLasDos, vpDelBien, mesDeCompra: u.mesEntrega,
    alternativas: [a, b, c],
    sobrecostoPrendario: { nominal: b.costoNominal - a.costoNominal, real: b.costoReal - a.costoReal },
    sobrecostoUva: { nominal: c.costoNominal - a.costoNominal, real: c.costoReal - a.costoReal },
  }
}

/**
 * CUÁNTO CUESTA CADA MES DE DEMORA. Dos costos distintos que se suman, no uno:
 *  · el precio de las unidades sube con la inflación mientras la carpeta espera;
 *  · si la demora obliga a comprar por otra vía, se paga el sobrecosto de esa vía UNA vez.
 * El segundo no es "por mes": es el precio de perder la ventana. Se declara aparte a propósito.
 */
export function costoDeLaDemora({ plan = planDeTresUnidades(), meses = [1, 2, 3, 6] } = {}) {
  const inf = plan.inflacionMensual
  const precioDeLasDos = C31.precioLista * 2
  const alt = alternativasParaLasDos({ plan })
  return {
    porMesDeEsperaEnElPrecio: meses.map((m) => ({
      meses: m,
      precioNuevo: precioDeLasDos * (1 + inf) ** m,
      sobrecosto: precioDeLasDos * ((1 + inf) ** m - 1),
      mesDeDesembolso: sumarMesesLocal(plan.calendario.mesDesembolsoFondefin, m),
    })),
    siHayQueCambiarDeFuente: alt.sobrecostoPrendario,
    inflacionMensual: inf,
  }
}

const sumarMesesLocal = (mes, n) => {
  const [a, m] = String(mes).split('-').map(Number)
  const t = a * MESES_ANIO + (m - 1) + Number(n)
  return `${Math.floor(t / MESES_ANIO)}-${String((t % MESES_ANIO) + 1).padStart(2, '0')}`
}

export { inflacionDeTrabajo, PRENDARIO_FORD }
