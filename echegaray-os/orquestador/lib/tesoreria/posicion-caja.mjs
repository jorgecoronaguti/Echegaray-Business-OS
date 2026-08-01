// SKILL 2 · RECONSTRUIR POSICIÓN DE CAJA — criterio PERCIBIDO, sin una sola mezcla con el devengado.
//
// ═══ LA DISTINCIÓN QUE HACE ÚTIL A ESTA SKILL ═══
//
// "Caja" no es un número: son cinco números distintos que la gente llama igual, y confundirlos es
// exactamente cómo una empresa con margen se queda sin plata.
//
//   REAL         lo que hay hoy en las cuentas. Percibido. Es un HECHO.
//   COMPROMETIDA lo que ya tiene destino y fecha (cheques, obligaciones, proveedores).
//   RESTRINGIDA  lo que está en la cuenta pero no es de libre disposición.
//   MÍNIMA       el piso operativo que no se perfora ni para ganar plata.
//   EXCEDENTE    lo único que se puede pensar en invertir = real − comprometida − restringida − mínima.
//
// Una factura emitida no es caja. Un cheque recibido en cartera no es caja hasta que se acredita. Una
// cobranza probable no es caja. Esta skill no las suma nunca, y por eso su excedente es más chico —y
// más verdadero— que el de cualquier planilla optimista.
//
// ═══ CONSUME, NO RECALCULA ═══
//
// El saldo, las obligaciones, las líneas y el costo del descubierto salen de `modeloLiquidez()`, que
// a su vez los toma de sus fuentes únicas. Acá no se recalcula un peso: se CLASIFICA.

import { EVIDENCIA, CONFIANZA, evidenciaCombinada } from './contratos.mjs'

/**
 * RESERVA MÍNIMA OPERATIVA. El default es 0 a propósito: un piso inventado por el software sería un
 * número de plata sin origen, que es justo lo que la regla de oro del Sheet prohíbe. El piso real es
 * una POLÍTICA del dueño y entra por `politica.reserva_minima`; mientras no exista, el agente lo
 * declara faltante y baja la confianza en vez de suponerlo.
 */
export const RESERVA_POR_DEFECTO = 0

/**
 * ¿La empresa está EN descubierto? Es la primera pregunta de toda decisión de inversión de esta
 * empresa y casi nadie la hace: con saldo negativo no hay excedente que discutir, porque cada peso
 * ocioso está costando la tasa del acuerdo. Se responde con el saldo, no con una impresión.
 */
export function enDescubierto(cajaHoy) {
  return Number.isFinite(Number(cajaHoy)) && Number(cajaHoy) < 0
}

/**
 * COMPOSICIÓN DE LA CAJA — "total disponibilidades" no es "pesos disponibles hoy".
 *
 * Lo destapó el control independiente contra la pestaña CAJA cruda el 01/08: el total de $126.190.287
 * que el OS calcula bien —coincide exactamente con el que la pestaña computa sola— está compuesto por
 * cosas que NO son lo mismo para invertir:
 *
 *   $87,9M  Santander cta cte ARS        → pesos, hoy, en el banco. Esto sí.
 *   $15,2M  caja en pesos (efectivo)     → pesos, hoy, en la caja física.
 *   $22,3M  U$S 15.000 + U$S 581         → dólares. No se colocan en un instrumento en pesos.
 *   $10,3M  valores a depositar          → cheques en cartera. NO son caja hasta que se acreditan.
 *
 * Recomendar $119M a T+0 en pesos con esa composición sería contar dos veces la misma mentira: la
 * moneda equivocada y plata que todavía no entró. El total sigue viniendo de su fuente única —acá no
 * se recalcula nada— pero se clasifica, y el excedente se topea con la parte que de verdad es pesos.
 *
 * La clasificación es por RÓTULO, como todo lo que este repo lee de la pestaña CAJA: la columna se
 * mueve, el nombre de la cuenta no.
 */
export function clasificarCuentas(cuentas = []) {
  const out = { ars_liquida: 0, moneda_extranjera: 0, valores_a_depositar: 0, sin_clasificar: 0, detalle: [] }
  for (const c of cuentas) {
    const n = String(c.cuenta ?? '').toLowerCase()
    const saldo = Number(c.saldo) || 0
    let clase
    if (/valores a depositar|cheques? (en )?cartera|a depositar/.test(n)) clase = 'valores_a_depositar'
    else if (/\busd\b|d[oó]lar|u\$s/.test(n)) clase = 'moneda_extranjera'
    else if (/pesos|ars|cta cte|cuenta corriente|caja|banco|santander|movimientos/.test(n)) clase = 'ars_liquida'
    else clase = 'sin_clasificar'
    out[clase] += saldo
    out.detalle.push({ cuenta: c.cuenta, saldo, clase })
  }
  return out
}

/**
 * SKILL 2. Reconstruye la posición financiera con criterio percibido.
 *
 * @param {object} deps {google}
 * @param {object} [opts] {hoy, politica:{reserva_minima}, vencidoComercial}
 */
export async function reconstruirPosicion(deps = {}, opts = {}) {
  const { modeloLiquidez } = await import('../ingenieria-financiera.mjs')
  const { cashBriefing } = await import('../cash-briefing.mjs')
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
  const politica = opts.politica || {}
  const faltantes = []

  const modelo = await modeloLiquidez(deps, hoy, { vencidoComercial: opts.vencidoComercial })
  const d = modelo.disponible
  if (d.estado !== 'ok') {
    return {
      estado: 'sin_dato',
      motivo: `sin saldo de caja: ${d.motivo}`,
      modelo, evidencia: EVIDENCIA.SIN_DATO, confianza: CONFIANZA.NULA,
      fecha: modelo.fecha,
    }
  }

  const cajaReal = Number(d.caja_hoy) || 0

  // La composición sale del MISMO lector que el total (cash-briefing), no de una segunda lectura con
  // otro criterio: el total nunca se recalcula acá, sólo se clasifica en qué está.
  let composicion = null
  try { composicion = clasificarCuentas((await cashBriefing(deps.google, hoy)).caja?.cuentas || []) }
  catch { faltantes.push('composición de la caja (no se pudo leer el detalle de cuentas)') }
  const oblig = modelo.comprometido?.estado === 'ok' ? modelo.comprometido : null
  const comercial = modelo.deuda_comercial?.estado === 'ok' ? modelo.deuda_comercial : null

  // COMPROMETIDO = lo vencido (que ya debería haber salido) + lo que entra en 30 días. Ni un peso de
  // esto es excedente, por más que hoy esté en la cuenta.
  const vencidoFiscal = oblig ? Number(oblig.vencido) || 0 : null
  const vencidoComercial = comercial ? Number(comercial.vencido) || 0 : null
  const entra30 = oblig ? Number(oblig.entra_30_dias) || 0 : null
  if (vencidoFiscal == null) faltantes.push('obligaciones fiscales (vista obligacion_resumen no disponible)')
  if (vencidoComercial == null) faltantes.push('deuda comercial vencida (Compras del Cash Flow)')

  const comprometida = (vencidoFiscal ?? 0) + (vencidoComercial ?? 0) + (entra30 ?? 0)

  // RESTRINGIDA. Hoy el OS no tiene ninguna fuente que declare fondos afectados en garantía o
  // embargados. Se declara el gap: 0 acá significa "no hay dato", no "no hay fondos restringidos".
  const restringida = Number(politica.caja_restringida) || 0
  if (politica.caja_restringida == null) faltantes.push('caja restringida (ninguna fuente del OS la declara hoy)')

  const minima = Number(politica.reserva_minima ?? RESERVA_POR_DEFECTO) || 0
  if (politica.reserva_minima == null) faltantes.push('reserva mínima operativa (política del dueño, no la fija el software)')

  const excedente = Math.round(cajaReal - comprometida - restringida - minima)

  // TECHO EN PESOS. Un excedente en dólares o en cheques por depositar no se coloca en un instrumento
  // en pesos: el excedente aplicable es el menor entre el aritmético y la parte líquida en ARS.
  const arsLiquida = composicion ? Math.round(composicion.ars_liquida) : null
  const excedenteArs = arsLiquida == null
    ? excedente
    : Math.min(excedente, Math.max(0, arsLiquida - comprometida - restringida - minima))

  return {
    estado: 'ok',
    fecha: modelo.fecha,
    en_descubierto: enDescubierto(cajaReal),
    caja_real: Math.round(cajaReal),
    caja_comprometida: Math.round(comprometida),
    caja_restringida: Math.round(restringida),
    caja_minima: Math.round(minima),
    caja_excedente_bruto: excedenteArs, // "bruto": todavía no pasó por el hurdle del costo del dinero
    caja_excedente_sin_topar: excedente, // el aritmético, antes del techo en pesos — para auditar la diferencia
    composicion,
    deficit_previsto: excedente < 0 ? Math.abs(excedente) : 0,
    detalle: {
      vencido_fiscal: vencidoFiscal, vencido_comercial: vencidoComercial, entra_30_dias: entra30,
      cobranzas_por_cobrar_mes: d.cobranzas_por_cobrar_mes ?? null,
      cobranzas_vencidas: d.cobranzas_vencidas ?? null,
      linea_descubierto: modelo.lineas?.descubierto ?? null,
      colchon_total: modelo.colchon_total ?? null,
    },
    // LO QUE NO ENTRA, Y POR QUÉ. Está en la salida para que nadie tenga que confiar en que se hizo.
    excluido_por_no_percibido: {
      cobranzas_por_cobrar: d.cobranzas_por_cobrar_mes ?? null,
      criterio: 'una cobranza esperada no es caja hasta que se acredita — no suma al excedente',
      valores_a_depositar: composicion ? Math.round(composicion.valores_a_depositar) : null,
      moneda_extranjera: composicion ? Math.round(composicion.moneda_extranjera) : null,
      criterio_tope: 'el excedente colocable en pesos se topea con la parte líquida en ARS: ni los dólares ni los cheques en cartera son pesos disponibles hoy',
    },
    datos_faltantes: faltantes,
    evidencia: evidenciaCombinada(EVIDENCIA.DATO, faltantes.length ? EVIDENCIA.ESTIMACION : EVIDENCIA.CALCULO),
    confianza: faltantes.length >= 3 ? CONFIANZA.BAJA : faltantes.length ? CONFIANZA.MEDIA : CONFIANZA.ALTA,
    fuente: modelo.fuentes,
    modelo,
  }
}

export const VERSION_SKILL = '1.0.0'
