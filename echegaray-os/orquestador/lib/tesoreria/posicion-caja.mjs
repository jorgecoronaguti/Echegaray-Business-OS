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
import {
  modelarCajaRestringida, estadoReserva, evaluarAccionabilidad, ESTADO_POLITICA,
} from './politicas.mjs'
import { leerChequesFirmados, cajaRestringidaViva, dobleConteoConCompras } from './cheques-firmados.mjs'
import { restringidaDeVentana, VENTANAS_DIAS } from './excedente-ventana.mjs'

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
  const out = { ars_liquida: 0, moneda_extranjera: 0, valores_a_depositar: 0, invertido: 0, sin_clasificar: 0, detalle: [] }
  for (const c of cuentas) {
    const n = String(c.cuenta ?? '').toLowerCase()
    const saldo = Number(c.saldo) || 0
    let clase
    // LO INVERTIDO SE CLASIFICA PRIMERO (06/08): "Balanz · inversiones ARS ‖ invertido" contiene
    // "ars" y sin este corte caía en `ars_liquida` — plata YA colocada contada como colocable, y el
    // excedente recomendaría invertir dos veces la misma comitente. Desde el 06/08 la pestaña además
    // la excluye de su total (orden del dueño: disponible = operativo, estilo JPM), así que el cruce
    // de coherencia también tiene que restarla.
    if (/balanz|‖ invertido|inversi[oó]n/.test(n)) clase = 'invertido'
    else if (/valores a depositar|cheques? (en )?cartera|a depositar/.test(n)) clase = 'valores_a_depositar'
    else if (/\busd\b|d[oó]lar|u\$s/.test(n)) clase = 'moneda_extranjera'
    else if (/pesos|ars|cta cte|cuenta corriente|caja|banco|santander|movimientos/.test(n)) clase = 'ars_liquida'
    else clase = 'sin_clasificar'
    // AJUSTE ≠ CUENTA. Las filas "Movimientos posteriores al corte" son correcciones al saldo de una
    // cuenta, no cuentas propias. Suman al total en pesos igual —por eso conservan su clase— pero
    // NO pueden leerse como una cuenta en rojo: la corrida real del 01/08 daba "descubierto
    // utilizado $67.612" por un ajuste negativo, con las tres cuentas del banco en positivo. Un
    // descubierto inventado dispara la vara alta y hace descartar toda colocación.
    const esAjuste = /movimientos (posteriores|de efectivo)|\(\+\)|\(−\)|\(-\)|^\s*·/.test(n)
    out[clase] += saldo
    out.detalle.push({ cuenta: c.cuenta, saldo, clase, es_ajuste: esAjuste })
  }
  return out
}

/**
 * CONTROL DE COHERENCIA DEL TOTAL — el que faltaba, y que la corrida del 01/08 hizo falta.
 *
 * La pestaña CAJA se rompió con `#REF!` en "Total disponibilidades" mientras este agente corría.
 * `parseMonto('#REF!')` devuelve 0, el total de la pestaña es la fuente autoritativa, y el OS pasó a
 * informar **caja hoy $0** con cara de hecho. Cero no es "no sé", y una fórmula rota no puede
 * convertirse en una posición financiera sin que nadie se entere.
 *
 * El control es un CRUCE: compara el total que declara la pestaña contra la suma de las cuentas que
 * el lector detectó por su cuenta. Son dos informaciones distintas —el total lo calcula una fórmula
 * de la planilla, el detalle son filas— así que el control no se valida contra sí mismo.
 *
 * La relación esperada la fijó la verificación manual del 01/08: el total de la pestaña EXCLUYE los
 * valores a depositar (los cheques en cartera todavía no son caja). Si esa relación deja de cumplirse
 * por encima de la tolerancia, el total no es confiable y se declara `sin_dato`.
 */
export const TOLERANCIA_COHERENCIA = 200000

export function coherenciaDelTotal(total, composicion) {
  // FALLABA ABIERTO EN SU FORMA TOTAL. Sin composición devolvía `coherente: true` — el control creado
  // para que un `#REF!` no se informe como caja $0 se caía del lado cómodo justo cuando la pestaña
  // estaba del todo ilegible. "No se puede cruzar" no es "está bien": es no saber.
  if (!composicion?.detalle?.length) {
    return { coherente: false, total_declarado: Math.round(Number(total) || 0), esperado: null, diferencia: null,
      motivo: 'no hay ninguna cuenta legible en la pestaña CAJA: el total no se puede cruzar contra nada, y un total sin contraste no sostiene una posición' }
  }
  // `invertido` con guarda: una composición armada por un caller viejo no trae la clase y NaN
  // convertiría el control entero en "incoherente" sin decir por qué.
  const invertido = Number(composicion.invertido) || 0
  const suma = composicion.ars_liquida + composicion.moneda_extranjera + composicion.valores_a_depositar + invertido + composicion.sin_clasificar
  // La relación vigente (06/08): el total de la pestaña excluye los valores a depositar (no son caja
  // hasta acreditarse) Y lo invertido en Balanz (orden del dueño: el disponible es operativo).
  const esperado = suma - composicion.valores_a_depositar - invertido
  // Total 0 y cuentas 0 daba diferencia 0 → "coherente". Dos ceros que coinciden no son un cruce.
  if (Number(total) === 0 && esperado === 0) {
    return { coherente: false, total_declarado: 0, esperado: 0, diferencia: 0,
      motivo: 'el total y todas las cuentas dan cero: no es una caja vacía, es una pestaña que no se pudo leer' }
  }
  const dif = Math.abs(Number(total) - esperado)
  const tolerancia = Math.max(TOLERANCIA_COHERENCIA, Math.abs(esperado) * 0.01)
  if (dif <= tolerancia) return { coherente: true, total_declarado: Math.round(total), esperado: Math.round(esperado), diferencia: Math.round(dif) }
  return {
    coherente: false,
    total_declarado: Math.round(total),
    esperado: Math.round(esperado),
    diferencia: Math.round(dif),
    motivo: `el total de la pestaña dice $${Math.round(total).toLocaleString('es-AR')} y las cuentas detectadas suman $${Math.round(esperado).toLocaleString('es-AR')} (sin los valores a depositar): `
      + 'una diferencia así significa que el total no se puede leer — típicamente un #REF! o una fórmula rota. No se informa un saldo que no se puede sostener.',
  }
}

/**
 * CUENTAS QUE DESAPARECIERON — el control que el de coherencia NO puede dar.
 *
 * El 01/08, después de arreglarse a medias el `#REF!`, la pestaña quedó con "Caja en pesos" y "Caja
 * en dólares" en `—`. El total volvió a ser COHERENTE con las cuentas legibles ($88.709.996) y el
 * control de coherencia pasó — correctamente, porque el total ya no miente. Pero la caja está
 * subvaluada en ~$37M, porque dos cuentas simplemente no están.
 *
 * Un lector no puede distinguir "esta cuenta no existe" de "esta cuenta no tiene valor" mirando una
 * sola foto. Sí puede compararla con la anterior: una cuenta que ayer estaba y hoy no, desapareció.
 * Es la única forma barata de ver este agujero, y por eso el control es contra el HISTORIAL, no
 * contra la misma lectura.
 */
export function cuentasQueDesaparecieron(composicion, composicionAnterior) {
  if (!composicion?.detalle?.length || !composicionAnterior?.detalle?.length) return []
  const hoy = new Set(composicion.detalle.map((c) => String(c.cuenta ?? '').trim()))
  return composicionAnterior.detalle
    .filter((c) => !hoy.has(String(c.cuenta ?? '').trim()) && Math.abs(Number(c.saldo) || 0) > 0)
    .map((c) => ({ cuenta: c.cuenta, saldo_anterior: Math.round(Number(c.saldo) || 0) }))
}

/**
 * CAJA COMPROMETIDA = LO VENCIDO, Y NADA MÁS.
 *
 * Está separada en una función propia para poder probarla sola, porque es la resta que más caro
 * costó: sumar `entra_30_dias` acá restaba dos veces las mismas obligaciones —una acá y otra en el
 * calendario, que las trae fechadas— y encima lo hacía con un nombre que sugiere lo contrario. El
 * parámetro `entra30` se recibe a propósito: entra, se informa y NO se suma.
 */
export function cajaComprometida({ vencidoFiscal = null, vencidoComercial = null } = {}) {
  return (Number(vencidoFiscal) || 0) + (Number(vencidoComercial) || 0)
}

/**
 * SKILL 2. Reconstruye la posición financiera con criterio percibido.
 *
 * @param {object} deps {google}
 * @param {object} [opts] {hoy, filaReserva, filaRestringida, vencidoComercial, extractorValidado, mercadoFresco}
 */
export async function reconstruirPosicion(deps = {}, opts = {}) {
  const { modeloLiquidez } = await import('../ingenieria-financiera.mjs')
  const { cashBriefing } = await import('../cash-briefing.mjs')
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
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
  try { composicion = clasificarCuentas((await cashBriefing(deps.google, hoy, { spreadsheetId: opts.spreadsheetId })).caja?.cuentas || []) }
  catch { faltantes.push('composición de la caja (no se pudo leer el detalle de cuentas)') }
  // EL CONTROL VA ANTES DE TODO LO DEMÁS: si el saldo no es confiable, nada de lo que sigue lo es.
  const coherencia = coherenciaDelTotal(cajaReal, composicion)
  if (!coherencia.coherente) {
    return {
      estado: 'sin_dato',
      motivo: coherencia.motivo,
      coherencia,
      composicion,
      modelo, evidencia: EVIDENCIA.SIN_DATO, confianza: CONFIANZA.NULA,
      fecha: modelo.fecha,
    }
  }

  // Una cuenta que estaba en la corrida anterior y hoy no está NO es una cuenta en cero: es una fila
  // que se rompió. Se declara y bloquea la acción, porque la caja quedó subvaluada por ese monto.
  const desaparecidas = cuentasQueDesaparecieron(composicion, opts.composicionAnterior)
  if (desaparecidas.length) {
    faltantes.push(`desaparecieron ${desaparecidas.length} cuenta(s) de la pestaña CAJA respecto de la corrida anterior: `
      + desaparecidas.map((d) => `${d.cuenta} (valía $${d.saldo_anterior.toLocaleString('es-AR')})`).join(' · '))
  }

  const oblig = modelo.comprometido?.estado === 'ok' ? modelo.comprometido : null
  const comercial = modelo.deuda_comercial?.estado === 'ok' ? modelo.deuda_comercial : null

  // ═══ COMPROMETIDO = LO VENCIDO, Y NADA MÁS ═══
  //
  // Hasta el 03/08/2026 acá se sumaba también `entra_30_dias`, y eso estaba mal por dos motivos a la
  // vez. El primero es el nombre: `entra_30_dias` NO es plata que entra, son obligaciones que VENCEN
  // dentro de 30 días (sale de `obligacion_resumen`, la misma vista que `vencido`). El segundo es que
  // esas obligaciones YA están en el calendario como egresos fechados, así que restarlas otra vez acá
  // es contar el mismo peso dos veces.
  //
  // Lo vencido, en cambio, NO está en el calendario: el calendario arranca hoy y descarta lo que
  // quedó atrás. Por eso se resta acá y por eso `entra_30_dias` viaja al detalle, informado pero sin
  // sumar — el número sigue estando, y ahora se puede auditar por qué no entra.
  const vencidoFiscal = oblig ? Number(oblig.vencido) || 0 : null
  const vencidoComercial = comercial ? Number(comercial.vencido) || 0 : null
  const entra30 = oblig ? Number(oblig.entra_30_dias) || 0 : null
  if (vencidoFiscal == null) faltantes.push('obligaciones fiscales (vista obligacion_resumen no disponible)')
  if (vencidoComercial == null) faltantes.push('deuda comercial vencida (Compras del Cash Flow)')

  const comprometida = cajaComprometida({ vencidoFiscal, vencidoComercial, entra30 })

  // ═══ RESTRINGIDA: SE RECALCULA, NO SE CONSULTA UNA FOTO ═══
  //
  // La política declarada decía $48.148.311 y los cheques reales sumaban $47.948.311: $200.000 de
  // diferencia por un cheque marcado como debitado que nadie volvió a declarar. Ahora se lee la
  // pestaña en cada corrida y la política queda de respaldo para cuando la lectura falla — un `null`
  // sigue sin ser un cero (ver `modelarCajaRestringida`).
  let cheques = []
  let restringidaModelo = modelarCajaRestringida(opts.filaRestringida ?? null, hoy)
  try {
    cheques = await leerChequesFirmados(deps.google, opts.spreadsheetId || (await import('../cash-briefing.mjs')).CASHFLOW_ID)
    restringidaModelo = cajaRestringidaViva(cheques, hoy)
  } catch (e) {
    faltantes.push(`no se pudo recalcular la caja restringida de Cheques Emitidos (${String(e?.message ?? e).slice(0, 80)}): se usa la política declarada, que puede estar vieja`)
  }
  // POR VENCIMIENTO, NO EN BLOQUE. Para decidir una colocación a 30 días sólo hay que cubrir lo que
  // vence en esos 30 días; un cheque a 60 no bloquea nada a 30. Y lo que el calendario no puede ver
  // —lo ya vencido sin debitar y lo que no tiene fecha— se resta aparte, siempre.
  const restringidaPorVentana = Object.fromEntries(
    VENTANAS_DIAS.map((d) => [d, restringidaDeVentana(cheques, hoy, d)]),
  )
  const restringida = restringidaModelo.monto_a_restar
  if (restringidaModelo.bloquea_accionable) faltantes.push(`caja restringida: ${restringidaModelo.motivo}`)

  // EL DOBLE CONTEO QUE HABÍA QUE DESCARTAR POR EVIDENCIA. Un cheque emitido que paga una factura de
  // Compras vencida estaría en `restringida` y en `vencido_comercial` a la vez.
  const dobleConteo = dobleConteoConCompras(cheques, opts.movimientosVencidos ?? [])
  if (dobleConteo.hay) {
    faltantes.push(`${dobleConteo.n} cheque(s) por $${dobleConteo.monto.toLocaleString('es-AR')} coinciden con facturas de Compras vencidas: `
      + 'ese monto se está restando dos veces (como caja restringida y como deuda comercial vencida)')
  }

  // RESERVA MÍNIMA. Es una POLÍTICA del dueño. Mientras no esté aprobada, el número que sale de acá
  // NO se llama excedente: se llama techo técnico preliminar, y nada es accionable.
  const reserva = estadoReserva(opts.filaReserva ?? null)
  const minima = Number(reserva.monto ?? RESERVA_POR_DEFECTO) || 0
  if (reserva.estado !== ESTADO_POLITICA.APROBADA) faltantes.push(`reserva mínima ${reserva.estado}: ${reserva.motivo ?? 'falta aprobación humana'}`)

  const techoAritmetico = Math.round(cajaReal - comprometida - restringida - minima)

  // ═══ ESTE NÚMERO ES EL TECHO DE HOY, NO EL EXCEDENTE DE 30 DÍAS ═══
  //
  // Resta la caja restringida ENTERA porque responde una pregunta de T+0: "¿cuánto podría mover hoy
  // mismo sin mirar el calendario?". A T+0 no hay tiempo para que entre una cobranza ni para que se
  // acredite un valor a depositar, así que todo lo firmado pesa.
  //
  // El excedente por ventana —30, 60 y 90 días— NO sale de acá y no está topeado por acá: lo calcula
  // `excedente-ventana.mjs` caminando el calendario, que es el único lugar donde entra y sale plata
  // una sola vez. Usar este techo como tope de aquél era el segundo sesgo conservador apilado: el
  // 03/08/2026 daba $0 con $99M de pesos líquidos en la cuenta.
  const arsLiquida = composicion ? Math.round(composicion.ars_liquida) : null
  const techoArs = arsLiquida == null
    ? techoAritmetico
    : Math.min(techoAritmetico, Math.max(0, arsLiquida - comprometida - restringida - minima))

  const accionabilidad = evaluarAccionabilidad({
    reserva,
    // Una cuenta desaparecida bloquea igual que una caja restringida desconocida: en los dos casos
    // hay plata cuyo estado no se conoce.
    restringida: desaparecidas.length
      ? { ...restringidaModelo, bloquea_accionable: true, motivo: `faltan cuentas en la pestaña CAJA: ${desaparecidas.map((d) => d.cuenta).join(', ')}` }
      : restringidaModelo,
    // La validación del extractor y la frescura del mercado las conoce el ciclo, no esta skill:
    // entran por opts y por defecto bloquean, que es el lado seguro.
    extractorValidado: Boolean(opts.extractorValidado),
    mercadoFresco: Boolean(opts.mercadoFresco),
  })

  return {
    estado: 'ok',
    fecha: modelo.fecha,
    en_descubierto: enDescubierto(cajaReal),
    caja_real: Math.round(cajaReal),
    caja_comprometida: Math.round(comprometida),
    caja_minima: Math.round(minima),

    // ── LOS DOS NOMBRES, Y CUÁL ESTÁ VIGENTE ────────────────────────────────
    // `techo_tecnico_preliminar` existe SIEMPRE: es lo que la aritmética permite.
    // `excedente_aprobado` existe SÓLO si todas las políticas están aprobadas. Cuando no lo está es
    // `null`, no un número más chico: un número invita a usarlo.
    techo_tecnico_preliminar: techoArs,
    excedente_aprobado: accionabilidad.accionable ? techoArs : null,
    etiqueta_monto: accionabilidad.etiqueta,
    accionable: accionabilidad.accionable,
    bloqueos_accionabilidad: accionabilidad.bloqueos,
    estado_recomendacion: accionabilidad.estado_recomendacion,

    reserva,
    caja_restringida: restringidaModelo,
    // El detalle por vencimiento es lo que permite NO restar a 30 días un cheque que vence a 60.
    caja_restringida_por_ventana: restringidaPorVentana,
    doble_conteo_cheques_compras: dobleConteo,
    techo_sin_topar: techoAritmetico, // el aritmético, antes del techo en pesos — para auditar la diferencia
    composicion,
    deficit_previsto: techoAritmetico < 0 ? Math.abs(techoAritmetico) : 0,
    detalle: {
      vencido_fiscal: vencidoFiscal, vencido_comercial: vencidoComercial,
      // INFORMADO, NO SUMADO. Son obligaciones que vencen dentro de 30 días y ya viven en el
      // calendario como egresos fechados: sumarlas acá las restaba dos veces.
      entra_30_dias: entra30,
      entra_30_dias_criterio: 'no suma a lo comprometido: son obligaciones que ya están en el calendario como egresos fechados',
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
      criterio_tope: 'el techo colocable en pesos se topea con la parte líquida en ARS: ni los dólares ni los cheques en cartera son pesos disponibles hoy',
    },
    datos_faltantes: faltantes,
    evidencia: evidenciaCombinada(EVIDENCIA.DATO, faltantes.length ? EVIDENCIA.ESTIMACION : EVIDENCIA.CALCULO),
    confianza: faltantes.length >= 3 ? CONFIANZA.BAJA : faltantes.length ? CONFIANZA.MEDIA : CONFIANZA.ALTA,
    coherencia,
    cuentas_desaparecidas: desaparecidas,
    fuente: modelo.fuentes,
    modelo,
  }
}

export const VERSION_SKILL = '1.1.0'
