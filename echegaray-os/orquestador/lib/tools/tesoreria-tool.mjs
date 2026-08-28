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
import { relevar } from '../tesoreria/balanz-navegador.mjs'
import { configRuntime, tomarCerrojo, soltarCerrojo } from '../tesoreria/navegador-runtime.mjs'
import { prepararNavegador } from '../tesoreria/preparar-navegador.mjs'
import { verificarEstructuraFlujo, idDeSheet } from '../tesoreria/estructura-flujo.mjs'

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
          'EXCEDENTE DE CAJA POR HORIZONTE — cuánta plata puede inmovilizarse hoy sin comprometer la operación, separada en bloques (T+0, 2-7, 8-30, 31-90 y +90 días), con la reserva preservada, las obligaciones que cubre y las condiciones que invalidan cada ventana. Aplica criterio PERCIBIDO: una cobranza esperada no es caja. Y la vara contra la que se mide depende del caso: con descubierto utilizado es el CFT del acuerdo (por el monto que alcanza a cancelarlo), sin descubierto es superar cero neto, y si inmovilizar provoca el rojo entra el costo del descubierto ponderado. Mientras falte una política aprobada el monto es un TECHO TÉCNICO, no un excedente, y nada es accionable. Usalo cuando el dueño pregunte "cuánta plata me sobra", "puedo invertir algo", "qué hago con la plata parada", "me conviene un plazo fijo".',
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
      // ═══ `externo.navegar` — MANDA EL EFECTO, NO LA LETRA (27/08/2026, auditoría) ═══
      //
      // Decía `os.read` y es cierto que no escribe en la base. Pero su propia descripción dice
      // «ENTRA A BALANZ»: levanta un navegador contra la cuenta del broker con la sesión de la
      // empresa. `os.read` lo tiene `jefe_obra`, y en la auditoría un jefe de obra la ejecutó.
      //
      // Un efecto sobre un sistema externo no es una lectura del OS, aunque no escriba una fila.
      // La capability nombra el efecto, y con eso pasa las dos cerraduras y queda firmada.
      // `tesoreria.excedente_invertible` se queda en `os.read`: sólo lee el Flujo y la base.
      capability: 'externo.navegar',
      schema: {
        name: 'analisis_inversion',
        description:
          'CICLO COMPLETO DEL TESORERO, A PEDIDO — lee el Flujo de Caja, reconstruye la posición, proyecta la liquidez, calcula el excedente por horizonte, ENTRA A BALANZ en el momento y en SOLO LECTURA (fondos, letras, bonos, cauciones, cedears, corporativos y acciones), y propone una colocación por bloque ya pasada por una validación independiente. Tarda varios minutos porque recorre todas las pantallas. NUNCA ejecuta una operación financiera. Si la sesión de Balanz no está iniciada devuelve el análisis de caja igual y avisa cómo entrar; si hay una corrida programada en curso, contesta la caja y dice que espere. Usalo cuando el dueño pida "analizá si conviene invertir", "fijate qué hay disponible en Balanz", "buscá opciones para la plata que sobra", "qué rinde más para lo que tengo libre".',
        input_schema: {
          type: 'object',
          properties: {
            forzar: { type: 'boolean', description: 'devolver el análisis aunque no haya cambio material' },
            sheet: {
              type: 'string',
              description: 'ID o URL del Sheet a analizar. Si no se indica, usa el Flujo de Fondos de la empresa. Sólo sirve para libros con la MISMA estructura (pestañas Caja, Cobranzas, Compras y Cheques Emitidos): contra cualquier otro se niega en vez de devolver ceros.',
            },
          },
        },
      },
      async run(args) {
        try {
          // ═══ DESDE EL CHAT SÍ SE MIRA EL MERCADO ═══
          //
          // Antes no: el chat analizaba la caja y avisaba que el mercado se relevaba "en la corrida
          // programada". El motivo era real —con el navegador en la Mac del dueño, una consulta
          // interactiva y el timer se peleaban por la MISMA pestaña, y las dos terminaban leyendo la
          // pantalla equivocada— pero el efecto era que el dueño no podía pedir el análisis cuando lo
          // necesitaba, que es justo cuando sirve.
          //
          // Ahora el navegador es de la casa y hay un cerrojo que arbitra. Así que se releva, salvo
          // que haya una corrida en curso: en ese caso se contesta la caja y se dice por qué falta el
          // mercado, en vez de pelear por la pestaña.
          // ── EL LIBRO QUE SE VA A LEER ──────────────────────────────────────────────────────
          //
          // Por defecto el Flujo de Fondos de la empresa. Si el dueño indica otro, se verifica la
          // ESTRUCTURA antes de leer un peso: este lector pide pestañas concretas, y contra un libro
          // con otra forma no falla — devuelve ceros, que es peor que un error porque no se
          // distingue de una caja realmente vacía.
          let libro = null
          if (args?.sheet) {
            libro = idDeSheet(args.sheet)
            if (!libro) return { error: `no reconocí "${String(args.sheet).slice(0, 60)}" como un Sheet: pegá el enlace completo o el ID.` }
            const forma = await verificarEstructuraFlujo(google, libro)
            if (!forma.ok) return { error: forma.motivo, faltantes: forma.faltantes ?? null }
          }
          const cerrojo = await tomarCerrojo(configRuntime())
          const deps = { google }
          if (cerrojo.tomado) {
            deps.prepararNavegador = () => prepararNavegador(configRuntime())
            deps.relevar = relevar
          }
          try {
            const base = { ...(await politicas()), publicarSiempre: Boolean(args?.forzar), dias: 90, spreadsheetId: libro }
            const r = await correrCiclo(cerrojo.tomado ? deps : { google }, base)
            if (!cerrojo.tomado) r.mercado_omitido = cerrojo.motivo
            return armarRespuesta(r, cerrojo)
          } finally {
            // El cerrojo se suelta SIEMPRE. Si queda tomado, el vigía deja de supervisar el navegador
            // hasta que venza solo — media hora de ceguera por una consulta del chat.
            if (cerrojo.tomado) await soltarCerrojo(configRuntime())
          }
        } catch (e) { return { error: `no pude correr el análisis: ${String(e?.message ?? e).slice(0, 180)}` } }
      },
    },
  }
}

/**
 * Arma la respuesta del ciclo completo. Vive afuera del `run` para que la función quepa y se lea.
 *
 * Lo importante acá es POR QUÉ falta el mercado cuando falta. Son tres motivos distintos y cada uno
 * pide algo distinto de una persona: una corrida en curso se resuelve esperando, una sesión vencida
 * se resuelve entrando por la pantalla remota, y un navegador caído no se resuelve desde el celular.
 * Un único "no hay alternativas" para los tres es lo que hacía que nadie supiera qué hacer.
 */
export function armarRespuesta(r, cerrojo) {
  if (r.sin_excedente) {
    return { ...r, texto: formatoAplicarADeuda(r.recomendacion_estructural, r.posicion) }
  }
  const textos = (r.recomendaciones ?? []).map((rec) => formatoPropuesta(rec, r.posicion, {}))
  if (textos.length) return { ...r, texto: textos.join('\n\n---\n\n') }

  let porQue
  if (!cerrojo.tomado) porQue = `_No se miró el mercado: ${cerrojo.motivo}. Probá de nuevo en unos minutos._`
  else if (r.estado === 'session_required') porQue = '_No se miró el mercado: la sesión de Balanz no está iniciada. Te mandé el enlace para entrar._'
  else if (r.estado === 'browser_error') porQue = `_No se miró el mercado: ${r.motivo}._`
  else porQue = '_Se miró el mercado y ninguna alternativa superó la vara, o ninguna es apta para caja operativa._'
  return { ...r, texto: `${textoExcedente(r.posicion, r.excedente)}\n\n${porQue}` }
}
