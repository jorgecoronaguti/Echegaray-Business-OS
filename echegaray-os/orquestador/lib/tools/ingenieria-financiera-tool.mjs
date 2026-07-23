// Tool: INGENIERÍA FINANCIERA — expone el motor de tesorería (ingenieria-financiera.mjs) al chat,
// al Director IA, al scheduler y a la web. Es el contrato único: nadie recalcula, todos consumen.
// 0 razonamiento del modelo sobre los números — salen de fuentes únicas verificadas.
import {
  modeloLiquidez, recomendaciones, compararFinanciamiento, priorizarPagos, fmt,
} from '../ingenieria-financiera.mjs'

function formatModelo(m, recs) {
  const L = []
  L.push(`💧 *Modelo de liquidez · ${m.fecha}*`)
  const d = m.disponible
  if (d.estado === 'ok') {
    L.push(`Caja hoy: ${fmt(d.caja_hoy)} · vencimientos 7 días: ${fmt(d.vencimientos_7dias)} · proyección 7 días: ${fmt(d.proyeccion_7dias)}`)
    L.push(`Por cobrar del mes: ${fmt(d.cobranzas_por_cobrar_mes)}${d.cobranzas_vencidas ? ` · vencidas: ${fmt(d.cobranzas_vencidas)}` : ''}`)
  } else L.push(`Caja: sin dato (${d.motivo})`)
  const o = m.comprometido
  if (o.estado === 'ok') L.push(`Obligaciones: ${fmt(o.saldo_total)}${o.vencido ? ` · vencido ${fmt(o.vencido)}` : ''} · próx. 30 días ${fmt(o.entra_30_dias)}`)
  const dl = m.lineas?.descubierto
  if (dl) L.push(`Descubierto: límite ${fmt(dl.limite)}${dl.disponible_aprox != null ? ` · disponible ~${fmt(dl.disponible_aprox)}` : ''} (${m.lineas.costo_marginal})`)
  if (m.colchon_total != null) L.push(`Colchón total (caja + línea − vencido): ${fmt(m.colchon_total)}`)
  if (recs?.length) {
    L.push('\n*Recomendaciones:*')
    for (const r of recs) L.push(`• [${r.prioridad}] ${r.titulo} — ${r.explicacion} (riesgo ${r.riesgo}). ${r.fundamentos}.`)
  }
  return L.join('\n')
}

export function ingenieriaFinancieraTools(google) {
  return {
    'finanzas.modelo_liquidez': {
      capability: 'os.read',
      schema: {
        name: 'modelo_liquidez',
        description:
          'MOTOR DE INGENIERÍA FINANCIERA — arma el modelo único de liquidez de la empresa (dinero disponible, comprometido, líneas de crédito, colchón total) y devuelve RECOMENDACIONES concretas de tesorería. Compone fuentes únicas ya verificadas (caja, obligaciones, descubierto), 0 recálculo. Usalo cuando el dueño pregunte "¿cómo está la liquidez?", "¿qué me conviene hacer con la plata?", "¿cómo optimizo la caja?", "panorama financiero", "¿estoy holgado o ajustado?". Devolvé el texto y ofrecé profundizar (priorizar pagos, comparar financiamiento).',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const m = await modeloLiquidez({ google })
          const recs = recomendaciones(m)
          return { modelo: m, recomendaciones: recs, texto: formatModelo(m, recs) }
        } catch (e) { return { error: `no pude armar el modelo de liquidez: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'finanzas.comparar_financiamiento': {
      capability: 'os.read',
      schema: {
        name: 'comparar_financiamiento',
        description:
          'INGENIERÍA DE FINANCIAMIENTO — ante una necesidad de fondos, compara TODAS las alternativas (caja propia, descubierto, descuento de cheque, préstamo, esperar, pronto pago) y elige la más barata factible, con la justificación económica. Usalo cuando el dueño pregunte "¿me conviene el descubierto o esperar?", "¿descuento el cheque?", "¿pago ya para ganar el descuento?", "¿cómo financio este pago?". Las tasas que el OS no tiene cargadas (descuento de cheque, préstamo) se pasan por parámetro; sin ellas la alternativa se marca "falta la tasa", nunca se inventa.',
        input_schema: {
          type: 'object',
          properties: {
            monto: { type: 'number', description: 'necesidad de fondos en pesos' },
            dias: { type: 'number', description: 'por cuántos días se necesita el financiamiento' },
            cajaLibre: { type: 'number', description: 'caja propia disponible sin entrar al descubierto (opcional)' },
            limiteDescubiertoDisp: { type: 'number', description: 'margen del acuerdo sin usar (opcional)' },
            tasaDescuentoChequeTNA: { type: 'number', description: 'TNA de descuento de cheque, ej 0.60 (opcional)' },
            tasaPrestamoTNA: { type: 'number', description: 'TNA de un préstamo puntual (opcional)' },
            descuentoProntoPago: { type: 'number', description: 'fracción 0..1 que rebaja el proveedor por pagar ya (opcional)' },
            multaEspera: { type: 'number', description: 'costo cierto de esperar/mora (opcional)' },
          },
          required: ['monto', 'dias'],
        },
      },
      async run(args) {
        try { return compararFinanciamiento(args || {}) } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },

    'finanzas.priorizar_pagos': {
      capability: 'os.read',
      schema: {
        name: 'priorizar_pagos',
        description:
          'INGENIERÍA DE PAGOS — ordena una lista de pagos por prioridad real (vencimiento + costo de no pagar + criticidad del proveedor/obra + liquidez), NO sólo por fecha, y reparte la caja disponible: lo que no entra pasa a "esperar". Usalo cuando el dueño pregunte "¿qué pago primero?", "¿a quién le pago esta semana?", "¿qué puede esperar?". Cada pago vuelve con su decisión (pagar/parcial/esperar) y el motivo económico.',
        input_schema: {
          type: 'object',
          properties: {
            obligaciones: {
              type: 'array',
              description: 'lista de pagos a priorizar',
              items: {
                type: 'object',
                properties: {
                  proveedor: { type: 'string' },
                  monto: { type: 'number' },
                  dias_a_vencer: { type: 'number', description: 'negativo = vencido' },
                  criticidad: { type: 'string', enum: ['critico', 'obra', 'comercial', 'normal'] },
                  interesMoraDiario: { type: 'number', description: 'fracción diaria de mora (opcional)' },
                  descuentoProntoPago: { type: 'number', description: 'fracción de descuento por pronto pago (opcional)' },
                  obra: { type: 'string', description: 'obra a la que sirve el pago (opcional)' },
                },
                required: ['proveedor', 'monto'],
              },
            },
            cajaDisponible: { type: 'number', description: 'caja para repartir entre los pagos (opcional)' },
          },
          required: ['obligaciones'],
        },
      },
      async run(args) {
        try { return { pagos: priorizarPagos(args?.obligaciones || [], { cajaDisponible: args?.cajaDisponible }) } } catch (e) { return { error: String(e?.message ?? e).slice(0, 180) } }
      },
    },
  }
}
