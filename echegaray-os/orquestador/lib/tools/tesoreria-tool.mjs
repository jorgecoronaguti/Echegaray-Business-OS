// Tool: TESORERO INVERSOR — expone el análisis de excedente al chat, al Director IA y a la web.
//
// Es el MISMO motor que corre el timer: nadie recalcula. Y no hay una sola tool de escritura acá —
// este agente no opera, así que no existe la herramienta con la que podría hacerlo.

import { correrCiclo } from '../tesoreria/ciclo.mjs'
import { reconstruirPosicion } from '../tesoreria/posicion-caja.mjs'
import { leerFlujoDeFondos, vencidoComercialDe } from '../tesoreria/lectura-flujo.mjs'
import { proyectarLiquidez } from '../tesoreria/proyeccion-liquidez.mjs'
import { calcularExcedente } from '../tesoreria/excedente.mjs'
import { formatoAplicarADeuda, formatoPropuesta } from '../tesoreria/formato-mattermost.mjs'

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/**
 * Las políticas se leen de la base también acá. Si el chat no las leyera, el dueño aprobaría la
 * reserva por comando y el chat le seguiría contestando NO_ACCIONABLE — dos verdades sobre el mismo
 * estado, que es exactamente lo que la realidad única prohíbe.
 */
async function politicas() {
  try {
    const { query } = await import('../db.mjs')
    const { politicaVigente, filaCajaRestringida, composicionAnterior } = await import('../tesoreria/ledger.mjs')
    return {
      filaReserva: await politicaVigente(query, 'reserva_minima'),
      filaRestringida: await filaCajaRestringida(query),
      composicionAnterior: await composicionAnterior(query),
    }
  } catch (e) {
    // "LA TABLA NO EXISTE" ES unknown, NO unavailable. Son estados distintos: uno dice que nadie lo
    // declaró nunca, el otro que la fuente falló. Colapsarlos hace que un despliegue pendiente se
    // reporte como un incidente. Los dos bloquean igual, pero el motivo tiene que ser el verdadero.
    const noDesplegado = /relation .* does not exist|schema "tesoreria" does not exist/i.test(String(e?.message ?? ''))
    return {
      filaReserva: null,
      filaRestringida: noDesplegado ? null : { error: String(e?.message ?? e).slice(0, 120) },
    }
  }
}

function textoExcedente(posicion, excedente) {
  const titulo = posicion.accionable ? '💰 *Excedente aprobado*' : '📐 *Techo técnico preliminar* (NO accionable)'
  const L = [titulo]
  L.push(`Caja hoy: ${fmt(posicion.caja_real)} · comprometida: ${fmt(posicion.caja_comprometida)} · reserva: ${fmt(posicion.caja_minima)}`)
  const cr = posicion.caja_restringida
  L.push(`Caja restringida: ${cr?.restricted_cash_amount == null ? `sin dato (${cr?.restricted_cash_status})` : fmt(cr.restricted_cash_amount)}`)
  if (excedente.deuda_cancelable?.monto > 0) {
    L.push(`⚠ Descubierto utilizado: ${fmt(excedente.deuda_cancelable.monto)} — esa porción va a la línea antes que a cualquier instrumento`)
  }
  for (const v of excedente.ventanas ?? []) {
    L.push(v.monto_maximo > 0
      ? `• ${v.titulo}: hasta ${fmt(v.monto_maximo)} (${v.moneda}), libre hasta ${v.fecha_limite} · vara ${((v.referencia?.hurdle_periodo ?? 0) * 100).toFixed(2)}% del período (${v.referencia?.modo ?? 'n/d'})`
      : `• ${v.titulo}: ${v.motivo}`)
  }
  if (!posicion.accionable) {
    L.push(`\n*Por qué NO es accionable:*\n${(posicion.bloqueos_accionabilidad ?? []).map((b) => `• ${b}`).join('\n')}`)
    L.push('\nPara habilitarlo: `node orquestador/scripts/tesoreria-politica.mjs proponer reserva_minima` y después `aprobar`.')
  }
  if (posicion.datos_faltantes?.length) L.push(`\n_Faltan: ${posicion.datos_faltantes.join(' · ')}_`)
  L.push('\n_Toda colocación requiere aprobación humana (Nivel E). Este análisis no ejecuta nada._')
  return L.join('\n')
}

export function tesoreriaTools(google) {
  return {
    'tesoreria.excedente_invertible': {
      capability: 'os.read',
      schema: {
        name: 'excedente_invertible',
        description:
          'EXCEDENTE DE CAJA POR HORIZONTE — cuánta plata puede inmovilizarse hoy sin comprometer la operación, separada en bloques (T+0, 2-7, 8-30, 31-90 y +90 días), con la reserva preservada, las obligaciones que cubre y las condiciones que invalidan cada ventana. Aplica criterio PERCIBIDO: una cobranza esperada no es caja. Y aplica la tasa de corte de la empresa: si la cuenta está en descubierto, el excedente es CERO y la respuesta es cancelar la línea. Usalo cuando el dueño pregunte "cuánta plata me sobra", "puedo invertir algo", "qué hago con la plata parada", "me conviene un plazo fijo".',
        input_schema: { type: 'object', properties: {} },
      },
      async run() {
        try {
          const hoy = new Date()
          const pol = await politicas()
          const flujo = await leerFlujoDeFondos({ google }, { hoy, dias: 90 })
          const posicion = await reconstruirPosicion({ google }, { hoy, ...pol, vencidoComercial: vencidoComercialDe(flujo) })
          if (posicion.estado !== 'ok') return { error: `sin posición de caja: ${posicion.motivo}` }
          const proyeccion = proyectarLiquidez(flujo, { cajaInicial: posicion.caja_real })
          const excedente = await calcularExcedente(posicion, proyeccion, { hoy, dias: flujo.dias })
          return { posicion, excedente, texto: textoExcedente(posicion, excedente) }
        } catch (e) { return { error: `no pude calcular el excedente: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },

    'tesoreria.analisis_inversion': {
      capability: 'os.read',
      schema: {
        name: 'analisis_inversion',
        description:
          'CICLO COMPLETO DEL TESORERO — lee el Flujo de Caja, reconstruye la posición, proyecta la liquidez, calcula el excedente por horizonte, releva Balanz en SOLO LECTURA y propone una colocación por bloque, ya pasada por una validación independiente. NUNCA ejecuta una operación financiera. Si la sesión de Balanz no está disponible devuelve el análisis de caja igual y avisa. Usalo cuando el dueño pida "analizá si conviene invertir", "buscá opciones para la plata que sobra", "qué rinde más para lo que tengo libre".',
        input_schema: {
          type: 'object',
          properties: { forzar: { type: 'boolean', description: 'devolver el análisis aunque no haya cambio material' } },
        },
      },
      async run(args) {
        try {
          // Sin `relevar` y sin `publicar`: desde el chat se ANALIZA, no se navega ni se publica solo.
          // Abrir el navegador desde una consulta interactiva pelearía con la corrida del timer por la
          // misma sesión de Chrome, y las dos leerían la pantalla equivocada.
          const r = await correrCiclo({ google }, { ...(await politicas()), publicarSiempre: Boolean(args?.forzar), dias: 90 })
          if (r.sin_excedente) {
            return { ...r, texto: formatoAplicarADeuda(r.recomendacion_estructural, r.posicion) }
          }
          const textos = (r.recomendaciones ?? []).map((rec) => formatoPropuesta(rec, r.posicion, {}))
          return {
            ...r,
            texto: textos.length
              ? textos.join('\n\n---\n\n')
              : `${textoExcedente(r.posicion, r.excedente)}\n\n_No hay alternativas relevadas: el mercado se releva en la corrida programada, no desde el chat._`,
          }
        } catch (e) { return { error: `no pude correr el análisis: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },
  }
}
