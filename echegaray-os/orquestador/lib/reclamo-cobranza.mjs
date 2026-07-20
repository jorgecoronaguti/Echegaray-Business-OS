// RECLAMO DE COBRANZA — convierte una cobranza vencida en un documento listo para mandar.
//
// Por qué: hoy el OS detecta que hay $15M vencidos desde el 02/07 y ahí se termina. Detectar no
// cobra. El trabajo real —abrir el Sheet, buscar la factura, calcular la antigüedad, redactar,
// mandar— lo sigue haciendo una persona, y por eso a veces no se hace.
//
// CRITERIO PROFESIONAL aplicado (finanzas-tesoreria-construccion + derecho-construccion-contratos):
//  - Un reclamo es un acto comercial, no una queja: se apoya en el comprobante concreto, su fecha y
//    su monto. Sin número de factura no se reclama formalmente — se pide conciliar.
//  - Se escala por antigüedad. A los 5 días es un recordatorio; a los 60 es una intimación previa.
//    Mandar la carta equivocada quema la relación o regala plazo.
//  - Lo PROYECTADO no se reclama: todavía no se facturó. Reclamar algo no emitido expone a la
//    empresa y desgasta la credibilidad del resto del reclamo.
//  - Nunca se afirma un interés punitorio que el contrato no pactó.

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/** Días corridos entre dos fechas (fecha sin hora, sin desfase de zona). PURA. */
export function diasVencido(fechaCobro, hoy = new Date()) {
  const s = String(fechaCobro)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const f = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(fechaCobro)
  if (isNaN(f)) return null
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.floor((h - f) / 86400000)
}

/** Tono del reclamo según antigüedad. PURA. Escalar mal cuesta plata o relación. */
export function tonoPorAntiguedad(dias) {
  if (dias === null) return 'recordatorio'
  if (dias <= 15) return 'recordatorio'
  if (dias <= 45) return 'reclamo'
  return 'intimacion_previa'
}

const ENCABEZADO = {
  recordatorio: 'Recordatorio de pago',
  reclamo: 'Reclamo de pago pendiente',
  intimacion_previa: 'Reclamo formal de pago — deuda vencida',
}

/**
 * NÚCLEO PURO: compone el reclamo con los comprobantes reales.
 * @param {object} d cliente, comprobantes:[{numero_comprobante,factura,fecha_emision,fecha_cobro,total,concepto,estado}]
 */
export function componerReclamo(d = {}, hoy = new Date()) {
  const cliente = String(d.cliente || '').trim() || 'Cliente'
  const todos = d.comprobantes || []
  // Lo proyectado NO se reclama: todavía no se emitió factura.
  const reclamables = todos.filter((c) => !/proyectad/i.test(String(c.estado || '')))
  const proyectados = todos.filter((c) => /proyectad/i.test(String(c.estado || '')))
  const sinComprobante = reclamables.filter((c) => !String(c.numero_comprobante || '').trim())
  const conComprobante = reclamables.filter((c) => String(c.numero_comprobante || '').trim())

  if (!conComprobante.length) {
    return {
      cliente,
      puede_reclamar: false,
      motivo: reclamables.length
        ? 'Hay saldo vencido pero ninguna partida tiene número de comprobante: no se puede reclamar formalmente sin identificar la factura. Corresponde pedir una conciliación de cuenta, no un reclamo.'
        : 'No hay nada vencido y facturado para reclamar.',
      proyectados_excluidos: proyectados.length,
    }
  }

  const conDias = conComprobante.map((c) => ({ ...c, dias: diasVencido(c.fecha_cobro, hoy) }))
  const maxDias = Math.max(...conDias.map((c) => c.dias ?? 0))
  const tono = tonoPorAntiguedad(maxDias)
  const total = conDias.reduce((a, c) => a + (Number(c.total) || 0), 0)

  const filas = conDias.map((c) => ({
    comprobante: `${c.factura ? c.factura + ' ' : ''}${c.numero_comprobante}`,
    concepto: c.concepto || '',
    vencimiento: c.fecha_cobro ? String(c.fecha_cobro).slice(0, 10).split('-').reverse().join('/') : 's/f',
    dias: c.dias,
    monto: Number(c.total) || 0,
  }))

  const cuerpo = []
  cuerpo.push(`Estimados de ${cliente}:`)
  cuerpo.push('')
  if (tono === 'recordatorio') {
    cuerpo.push(`Les escribimos para recordarles que registramos como pendiente de cobro el siguiente comprobante, cuya fecha de pago prevista ya transcurrió. Si el pago ya fue realizado, les agradecemos enviarnos el comprobante para imputarlo.`)
  } else if (tono === 'reclamo') {
    cuerpo.push(`Nos dirigimos a ustedes por el saldo vencido que se detalla a continuación, correspondiente a trabajos ya ejecutados y facturados. Al día de la fecha no registramos su cancelación.`)
  } else {
    cuerpo.push(`Nos dirigimos a ustedes de manera formal por la deuda vencida que se detalla a continuación, correspondiente a trabajos ejecutados y facturados oportunamente. A la fecha lleva ${maxDias} días de atraso sin cancelación ni respuesta a nuestras gestiones previas.`)
  }
  cuerpo.push('')
  cuerpo.push('DETALLE:')
  for (const f of filas) {
    cuerpo.push(`  • ${f.comprobante}${f.concepto ? ` — ${f.concepto}` : ''} — venc. ${f.vencimiento} (${f.dias} días) — ${$(f.monto)}`)
  }
  cuerpo.push('')
  cuerpo.push(`TOTAL VENCIDO: ${$(total)}`)
  cuerpo.push('')
  if (tono === 'intimacion_previa') {
    cuerpo.push('Solicitamos regularizar la situación a la brevedad o indicarnos una fecha cierta de pago. De no recibir respuesta, nos veremos obligados a evaluar las acciones que el contrato prevé.')
  } else {
    cuerpo.push('Agradecemos nos confirmen la fecha de pago prevista o nos indiquen si existe alguna diferencia a conciliar.')
  }
  cuerpo.push('')
  cuerpo.push('Quedamos a disposición.')
  cuerpo.push('Echegaray Construcciones')

  return {
    cliente,
    puede_reclamar: true,
    tono,
    dias_max: maxDias,
    total_reclamado: total,
    asunto: `${ENCABEZADO[tono]} — ${cliente} — ${$(total)}`,
    cuerpo: cuerpo.join('\n'),
    detalle: filas,
    // Se declaran, no se esconden: el dueño tiene que saber qué quedó AFUERA del reclamo y por qué.
    excluidos: [
      ...(proyectados.length ? [`${proyectados.length} partida(s) proyectadas por ${$(proyectados.reduce((a, c) => a + (Number(c.total) || 0), 0))}: todavía no se facturaron, no corresponde reclamarlas.`] : []),
      ...(sinComprobante.length ? [`${sinComprobante.length} partida(s) vencidas sin número de comprobante: no se pueden reclamar formalmente hasta identificar la factura.`] : []),
    ],
  }
}

/** Cobranzas vencidas agrupadas por cliente, desde la fuente única. */
export async function cobranzasVencidasPorCliente() {
  const { query } = await import('./db.mjs')
  const { rows } = await query(
    `select obra_cliente, numero_comprobante, factura, fecha_emision, fecha_cobro,
            total_bruto as total, concepto, estado
       from public.cobranzas
      where estado not in ('Cobrado','Efectivo') and fecha_cobro < now()
      order by obra_cliente, fecha_cobro`)
  const porCliente = new Map()
  for (const r of rows) {
    const k = r.obra_cliente || 'sin cliente'
    if (!porCliente.has(k)) porCliente.set(k, [])
    porCliente.get(k).push(r)
  }
  return [...porCliente.entries()].map(([cliente, comprobantes]) => ({ cliente, comprobantes }))
}
