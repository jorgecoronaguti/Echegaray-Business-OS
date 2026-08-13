// CUÁNTO CUESTA CADA FORMA DE PAGO DE LA CAMIONETA — DERIVADO, NUNCA TIPEADO.
//
// EL PEDIDO (13/08/2026). El dueño pasó el presupuesto real del DFSK C32 doble cabina con dos formas
// de pago y la pregunta que decide es una sola: **¿conviene pagar al contado o firmar los seis
// eCheq?** No se contesta con la sensación de que "el plazo siempre conviene": se contesta midiendo
// el sobreprecio contra lo que cuesta la plata en esta empresa, que es el descubierto del Santander.
//
// ═══ POR QUÉ NINGÚN NÚMERO DE ACÁ ES UN LITERAL ═══
//
// El recargo, el plazo promedio, la TNA y la TEA implícitas salen de `rodados-datos.mjs` por fórmula.
// Si alguien corrige el importe del eCheq en la transcripción, todo esto se mueve solo. Un recargo
// escrito a mano se vuelve mentira el día que cambia el presupuesto y nadie se entera — y ese día ya
// pasó en este repo con otras cifras.
//
// ═══ LAS DOS FORMAS SÓLO SE PUEDEN COMPARAR PORQUE EL CRÉDITO ES EL MISMO ═══
//
// Las dos financian $24.517.500 con el mismo crédito UVA a 24 meses. Entonces el crédito se cancela
// de los dos lados de la comparación y lo único que difiere es cómo se paga el resto: $12.482.500 hoy
// (forma A) contra seis eCheq de $2.579.717 (forma B). Esa cancelación no se asume: si las dos formas
// no financiaran lo mismo, `compararFormasDePago` devuelve `comparable: false` y no da un veredicto.
// Comparar sin esa condición sería restar peras y manzanas con cara de cálculo.
//
// ═══ LA VARA: EL DESCUBIERTO, MEDIDO DE DOS MANERAS QUE TIENEN QUE COINCIDIR ═══
//
// Diferir un pago vale lo que se ahorra de descubierto por no hacerlo hoy. Se calcula por dos caminos
// independientes y el veredicto sólo se emite si los dos dan lo mismo:
//
//   1 · DÍA POR DÍA sobre el saldo retenido, con el modelo de `costo-descubierto.mjs` — TNA 55% del
//       acuerdo N° 00007 más IVA 10,5% y percepción 1,5%, verificado al centavo contra el cargo real
//       que el banco hizo el 14/07. Es el camino fino: respeta que el saldo retenido baja con cada
//       eCheq y que después del quinto ya se pagó MÁS que al contado.
//   2 · BULLET al CFT declarado del acuerdo (`ACUERDO.cft`), sobre el plazo promedio. Es el camino
//       grueso, el que haría cualquiera en una servilleta.
//
// Si los dos caminos discreparan en el veredicto, la recomendación no sería robusta y hay que decirlo
// en vez de elegir el que gusta. Un test lo verifica.
//
// LO QUE ESTE MÓDULO NO SABE, Y CAMBIA EL RESULTADO SI APARECE: si el descubierto tiene cupo libre
// (el acuerdo es de $18.200.000 y puede estar usado), si hay caja para pagar al contado sin tocarlo,
// y el ajuste UVA del crédito —que es igual en las dos formas y por eso no altera CUÁL conviene,
// pero sí cuánto cuesta la camioneta—. Nada de eso se supone acá: se declara en `limites`.

import { PRESUPUESTOS_RODADOS } from './rodados-datos.mjs'
import { ACUERDO } from './banco-santander.mjs'
import { TASAS, costoConImpuestos } from './costo-descubierto.mjs'

/** Base anual con la que se anualiza. La misma que liquida el banco: 365, no 360. */
export const BASE_ANUAL = 365

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// NÚCLEO PURO — aritmética financiera, sin datos adentro
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Promedio simple. Con la lista vacía devuelve null, no 0: "no hay plazo" no es "plazo cero". */
export const promedio = (xs) => (xs?.length ? xs.reduce((a, b) => a + Number(b), 0) / xs.length : null)

/**
 * TASA NOMINAL ANUAL implícita en un recargo: proporcional, sin capitalizar.
 * Es la que se compara contra una TNA publicada (la del acuerdo, por ejemplo).
 */
export const tnaImplicita = (recargoRelativo, dias) =>
  (dias > 0 ? Number(recargoRelativo) * BASE_ANUAL / dias : null)

/**
 * TASA EFECTIVA ANUAL implícita: capitaliza el recargo tantas veces como entre el plazo en un año.
 * Siempre mayor que la TNA cuando el plazo es menor a un año, y es la única comparable contra otra
 * TEA. Confundirlas subestima el costo del plazo corto — que es justo el caso de un cheque a 30 días.
 */
export const teaImplicita = (recargoRelativo, dias) =>
  (dias > 0 ? (1 + Number(recargoRelativo)) ** (BASE_ANUAL / dias) - 1 : null)

/**
 * TIR ANUAL EFECTIVA del flujo real, sin colapsarlo a un plazo promedio.
 *
 * POR QUÉ ADEMÁS DE LA TEA. El plazo promedio de 105 días trata a los seis cheques como si fueran uno
 * solo a 105 días, y no lo son: el primero vence a 30. La TIR descuenta cada pago en su fecha y da la
 * tasa a la que las dos formas de pago son indiferentes. Es más alta que la TEA del promedio, y es la
 * correcta. Se exponen las dos porque la del promedio es la que se puede reproducir a mano.
 *
 * Bisección y no Newton: no necesita derivada, no diverge, y 200 iteraciones sobre un intervalo
 * acotado son instantáneas. El techo de 100 (10.000% anual) es un absurdo deliberado: si la respuesta
 * se le acerca, el insumo está mal y se ve.
 */
export function tirEfectivaAnual(montoHoy, pagos, { techo = 100, iteraciones = 200 } = {}) {
  const m = Number(montoHoy)
  if (!(m > 0) || !pagos?.length) return null
  const valorPresente = (r) =>
    pagos.reduce((s, p) => s + Number(p.importe) / (1 + r) ** (Number(p.dias) / BASE_ANUAL), 0)
  if (valorPresente(0) <= m) return null // no hay recargo: no hay tasa implícita que buscar
  let lo = 0
  let hi = techo
  for (let i = 0; i < iteraciones; i++) {
    const medio = (lo + hi) / 2
    if (valorPresente(medio) > m) lo = medio
    else hi = medio
  }
  return (lo + hi) / 2
}

/**
 * INTERÉS DE DESCUBIERTO QUE SE AHORRA POR NO PAGAR HOY, día por día.
 *
 * El saldo retenido arranca en `montoHoy` y baja con cada pago. Después del último tramo puede quedar
 * NEGATIVO —ya se pagó más que al contado— y ahí el signo se conserva a propósito: esos días cuestan
 * en lugar de ahorrar. Redondear ese tramo a cero inflaría el ahorro y ensuciaría el veredicto.
 */
export function ahorroDeDescubierto(montoHoy, pagos, tna = TASAS.tna) {
  const m = Number(montoHoy)
  if (!Number.isFinite(m) || !pagos?.length) return null
  const hitos = [...new Set([0, ...pagos.map((p) => Number(p.dias))])].sort((a, b) => a - b)
  let pesoDias = 0
  for (let i = 0; i < hitos.length - 1; i++) {
    const pagado = pagos
      .filter((p) => Number(p.dias) <= hitos[i])
      .reduce((s, p) => s + Number(p.importe), 0)
    pesoDias += (m - pagado) * (hitos[i + 1] - hitos[i])
  }
  return costoConImpuestos(pesoDias * tna / BASE_ANUAL)
}

/** El mismo ahorro, a lo bruto: un solo saldo por el plazo promedio, a la tasa efectiva del acuerdo. */
export const ahorroDeDescubiertoBullet = (montoHoy, dias, cft = ACUERDO.cft) =>
  Number(montoHoy) * ((1 + Number(cft)) ** (Number(dias) / BASE_ANUAL) - 1)

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LECTURA DE UNA FORMA DE PAGO — traduce el dato transcripto a un flujo de fondos
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Los pagos de una forma, con su día. El contado es un pago en el día 0; los cheques, uno por plazo.
 * NO incluye el crédito UVA: es idéntico en las dos formas y su ajuste no está declarado.
 */
export function pagosDe(forma) {
  if (forma?.anticipoEfectivo != null) return [{ dias: 0, importe: forma.anticipoEfectivo }]
  const ch = forma?.cheques
  if (!ch?.plazosDias?.length) return []
  return ch.plazosDias.map((dias) => ({ dias, importe: ch.importeCadaUno }))
}

/** Lo que se entrega en total por fuera del crédito, sin descontar: la suma de los pagos. */
export const nominalDe = (forma) => pagosDe(forma).reduce((s, p) => s + p.importe, 0)

/** El plazo promedio de esa forma. Contado = 0 días. */
export const plazoPromedioDias = (forma) => promedio(pagosDe(forma).map((p) => p.dias)) ?? 0

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LA COMPARACIÓN
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** El presupuesto que se compara: el único con precio. Sin precio no hay nada que comparar. */
export const presupuestoCotizado = (presupuestos = PRESUPUESTOS_RODADOS) =>
  presupuestos.find((p) => p.total != null) ?? null

/**
 * LAS DOS FORMAS, O EL MOTIVO POR EL QUE NO SE PUEDEN COMPARAR.
 *
 * Está separado del cálculo a propósito: la condición de comparabilidad es una decisión, no un paso
 * aritmético, y tiene que poder leerse y testearse sin atravesar las fórmulas.
 */
function elegirFormas(formas = []) {
  const contado = formas.find((f) => f.anticipoEfectivo != null)
  const plazo = formas.find((f) => f.cheques?.plazosDias?.length)
  if (!contado || !plazo) {
    return { motivo: 'el presupuesto no tiene las dos formas de pago (contado y a plazo)' }
  }
  if (contado.financiado !== plazo.financiado) {
    return {
      motivo: `las dos formas no financian lo mismo (${contado.financiado} vs ${plazo.financiado}): la diferencia entre ellas ya no es sólo el plazo`,
    }
  }
  return { contado, plazo }
}

/**
 * CONTADO CONTRA PLAZO, con el veredicto y por qué.
 *
 * Devuelve `comparable: false` con el motivo cuando las dos formas no son comparables —no financian
 * lo mismo, o falta una de las dos—. Un veredicto igual, con un número que parece bien calculado,
 * sería el peor resultado posible.
 */
export function compararFormasDePago(presupuesto = presupuestoCotizado()) {
  const { contado, plazo, motivo } = elegirFormas(presupuesto?.formasDePago)
  if (motivo) return { comparable: false, motivo }
  return armarComparacion(presupuesto, contado, plazo)
}

/** El cálculo, una vez que ya se sabe que las dos formas son comparables. */
function armarComparacion(presupuesto, contado, plazo) {
  const base = nominalDe(contado)
  const pagos = pagosDe(plazo)
  const nominalPlazo = nominalDe(plazo)
  const recargo = nominalPlazo - base
  const recargoRelativo = recargo / base
  const dias = plazoPromedioDias(plazo)

  const ahorroFino = ahorroDeDescubierto(base, pagos)
  const ahorroBruto = ahorroDeDescubiertoBullet(base, dias)
  const ventajaFina = ahorroFino - recargo      // > 0 ⇒ conviene el plazo
  const ventajaBruta = ahorroBruto - recargo
  const coinciden = Math.sign(ventajaFina) === Math.sign(ventajaBruta)

  return {
    comparable: true,
    presupuesto: presupuesto.clave,
    contado: { clave: contado.clave, letra: contado.letra, importe: base },
    plazo: {
      clave: plazo.clave,
      letra: plazo.letra,
      cantidad: plazo.cheques.cantidad,
      importeCadaUno: plazo.cheques.importeCadaUno,
      plazosDias: plazo.cheques.plazosDias,
      nominal: nominalPlazo,
      plazoPromedioDias: dias,
    },
    recargo,
    recargoRelativo,
    tnaImplicita: tnaImplicita(recargoRelativo, dias),
    teaImplicita: teaImplicita(recargoRelativo, dias),
    tirEfectivaAnual: tirEfectivaAnual(base, pagos),
    descubierto: {
      tna: TASAS.tna,
      cft: ACUERDO.cft,
      ahorroDiaPorDia: ahorroFino,
      ahorroBullet: ahorroBruto,
      fuente: 'costo-descubierto.mjs (TNA 55% + IVA 10,5% + percepción 1,5%, verificado contra el cargo del 14/07) y banco-santander.mjs (ACUERDO.cft)',
    },
    ventajaDelPlazo: ventajaFina,
    ventajaDelPlazoBullet: ventajaBruta,
    metodosCoinciden: coinciden,
    veredicto: coinciden ? (ventajaFina > 0 ? 'plazo' : 'contado') : 'sin_veredicto',
    porQue: explicar(coinciden, ventajaFina),
    limites: LIMITES,
  }
}

/** La frase que acompaña al veredicto. Un número sin la razón no se puede discutir. */
const explicar = (coinciden, ventaja) => {
  if (!coinciden) return 'los dos métodos de valuación del descubierto dan veredictos distintos: la diferencia es demasiado chica para decidir con esto solo'
  return ventaja > 0
    ? 'el sobreprecio del plazo es menor que el interés de descubierto que se ahorra por no pagar hoy'
    : 'el sobreprecio del plazo supera lo que cuesta financiar el pago contado con el descubierto: sale más barato pagar al contado, incluso tomando la plata del acuerdo'
}

/** Lo que esta comparación NO contempla. Va pegado al resultado: una limitación suelta no la lee nadie. */
export const LIMITES = [
  'no se verificó si el acuerdo de descubierto tiene cupo libre para adelantar el pago contado (límite $18.200.000, saldo utilizado no consultado acá)',
  'no contempla el ajuste UVA del crédito: es igual en las dos formas y no altera cuál conviene, pero sí cuánto cuesta la camioneta',
  'el seguro que la cuota del crédito lleva ("+ SEGURO", sin importe en el presupuesto) no está en ninguno de los dos lados',
  'si el presupuesto venció (10/08/2026), el precio y por lo tanto el recargo pueden haber cambiado: la comparación vale para los números del 06/08',
]
