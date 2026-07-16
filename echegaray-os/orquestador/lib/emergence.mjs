// PRP-018 F3 — EMERGENCIA DE CAPACIDADES. Cuando un pedido del chat NO lo cubre ninguna
// skill/especialista y el patrón se REPITE, el OS propone (con tu visto bueno) activar un
// especialista existente o crear una capacidad nueva. NO crea nada solo: registra en el
// Backlog Autónomo. Disparo de ALTA SEÑAL / BAJO RUIDO: solo cuando el modelo ADMITE que
// no pudo (no adivina desde el texto). Recurrencia (clase A→B del CLAUDE.md): la 1ª vez es
// una observación; recién al repetirse se marca como propuesta firme. Reusa backlog_autonomo
// como contador + propuesta (sin tabla nueva).
import { query } from './db.mjs'

// El modelo confiesa que no pudo. Conservador: frases claras de incapacidad, no dudas.
const NO_PUDO_RE =
  /\bno (puedo|s[eé] c[oó]mo|cuento con|tengo (la|esa|una|acceso|forma|manera|capacidad|herramienta)|me es posible|est[aá] (a mi alcance|dentro de mis))/i
const STOP = new Set('de la el los las un una unos unas y o a en que se su por con para del al lo me te nos es esta este esto como cuanto cual donde porfa por favor'.split(' '))

/** Slug de las palabras significativas del pedido — clave de clustering (imperfecta pero
 *  conservadora: solo agrupa pedidos casi iguales, así no sobre-propone). */
function topicSlug(directive) {
  const words = String(directive || '').toLowerCase().replace(/[^\wáéíóúñ\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
  return words.slice(0, 6).join(' ').slice(0, 60)
}

/** Registra/escala un gap de capacidad si el modelo admitió no poder. Nunca lanza.
 *  Devuelve {registrado, escalado, motivo}. Solo para pedidos SIN dominio (general). */
export async function registerChatGap({ directive, answer, capability }) {
  try {
    if (capability && capability !== 'general') return { registrado: false, motivo: 'ya cubierto por un dominio' }
    if (!NO_PUDO_RE.test(String(answer || ''))) return { registrado: false, motivo: 'el modelo no admitió incapacidad' }
    const slug = topicSlug(directive)
    if (slug.length < 6) return { registrado: false, motivo: 'pedido muy corto/ambiguo' }
    const titulo = `Posible capacidad faltante: "${slug}"`
    const { rows: existe } = await query(
      `select id, confianza from public.backlog_autonomo where tipo='mejora_potencial' and estado='abierto' and titulo=$1 limit 1`,
      [titulo],
    )
    if (existe.length) {
      // RECURRENCIA → propuesta firme: sube impacto/urgencia y deja recomendación concreta.
      await query(
        `update public.backlog_autonomo
            set impacto='media', urgencia='media', confianza='observado',
                evidencia=$2, recomendacion=$3, updated_at=now()
          where id=$1`,
        [
          existe[0].id,
          `Pedido del chat sin cobertura, visto MÁS DE UNA VEZ. Último: "${String(directive || '').slice(0, 200)}". El OS respondió que no puede.`,
          'Recurrencia confirmada: mapear contra los 24 agentes / skills existentes; con tu aprobación, activar el especialista adecuado o crear la capacidad (detector de gaps + skill-creator). Nunca duplicar lo existente.',
        ],
      )
      return { registrado: true, escalado: true, motivo: 'gap recurrente → propuesta firme' }
    }
    // PRIMERA vez → observación (aún NO es propuesta firme): por_confirmar, impacto bajo.
    await query(
      `insert into public.backlog_autonomo
         (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo, recomendacion, nivel_autonomia_permitido, estado)
       values ('mejora_potencial', $1, $2, 'chat interactivo (pedido no cubierto)', 'observado', 'baja', 'por_confirmar', 'medio', $3, 'D', 'abierto')`,
      [
        titulo,
        `Pedido del chat que el OS no pudo resolver: "${String(directive || '').slice(0, 200)}". Primera vez — observación, no propuesta aún (se confirma si se repite).`,
        'Observar si se repite. Un gap aislado NO crea capacidad; requiere recurrencia.',
      ],
    )
    return { registrado: true, escalado: false, motivo: 'observación registrada (1ª vez)' }
  } catch (e) {
    return { registrado: false, motivo: `error: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}

// El dueño RECHAZA la respuesta anterior: señal fuerte de que algo del OS falló. Conservador:
// frases claras de rechazo, no dudas. Es 0-API (solo patrón observado, nunca se fabrica).
const RECHAZO_RE =
  /\b(no\s+(sirve|funciona|anda|es\s+eso|es\s+lo\s+que|hiciste|me\s+sirve|era\s+eso)|sigue\s+(sin|fallando|igual|mal)|segu[ií]\s+(sin|con\s+el\s+error)|est[aá]\s+mal|de\s+nuevo\s+mal|otra\s+vez\s+(mal|lo\s+mismo)|es\s+una\s+mierda|una\s+mierda|no\s+lo\s+(hizo|hiciste)|es\s+tonto|no\s+es\s+inteligente|un\s+desastre|mal\s+de\s+nuevo)\b/i

/** Registra que la respuesta ANTERIOR probablemente falló, cuando el dueño la rechaza en el
 *  turno actual. Toma el TEMA del pedido previo (no del rechazo). Recurrencia → propuesta firme.
 *  0-API, fire-and-forget. Nunca lanza. */
export async function registerRespuestaFallida({ directive, history }) {
  try {
    if (!RECHAZO_RE.test(String(directive || ''))) return { registrado: false, motivo: 'no hay rechazo claro' }
    if (!Array.isArray(history) || !history.length) return { registrado: false, motivo: 'sin contexto previo' }
    // El pedido que falló = último mensaje del dueño en la charla previa.
    const previo = [...history].reverse().find((m) => (m.role === 'me' || m.role === 'user') && String(m.text || '').trim())
    const slug = topicSlug(previo?.text || '')
    if (slug.length < 6) return { registrado: false, motivo: 'pedido previo muy corto/ambiguo' }
    const titulo = `Respuesta del chat que falló (revisar): "${slug}"`
    const { rows: existe } = await query(
      `select id from public.backlog_autonomo where tipo='respuesta_fallida' and estado='abierto' and titulo=$1 limit 1`,
      [titulo],
    )
    if (existe.length) {
      await query(
        `update public.backlog_autonomo set impacto='alta', urgencia='alta', confianza='observado',
            evidencia=$2, updated_at=now() where id=$1`,
        [existe[0].id, `El dueño rechazó la respuesta MÁS DE UNA VEZ para este tema. Último rechazo: "${String(directive || '').slice(0, 160)}".`],
      )
      return { registrado: true, escalado: true, motivo: 'fallo recurrente → propuesta firme' }
    }
    await query(
      `insert into public.backlog_autonomo
         (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo, recomendacion, nivel_autonomia_permitido, estado)
       values ('respuesta_fallida', $1, $2, 'chat interactivo (rechazo del dueño)', 'observado', 'media', 'media', 'medio', $3, 'D', 'abierto')`,
      [
        titulo,
        `El dueño rechazó la respuesta del OS. Pedido que falló: "${String(previo?.text || '').slice(0, 200)}". Rechazo: "${String(directive || '').slice(0, 120)}".`,
        'Revisar por qué falló ese tipo de pedido (ruteo, comprensión, o capacidad faltante) y proponer el arreglo. Verificar en vivo con la frase real antes de dar por resuelto.',
      ],
    )
    return { registrado: true, escalado: false, motivo: 'fallo registrado (1ª vez)' }
  } catch (e) {
    return { registrado: false, motivo: `error: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}
