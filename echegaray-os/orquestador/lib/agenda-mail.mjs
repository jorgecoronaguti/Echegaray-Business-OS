// FASE A — AGENDA y MAILS en el chat. Respuestas determinísticas (0 API del modelo) que
// leen Calendar y Gmail del usuario vía OAuth (el OS actúa COMO él). Ahora que las APIs de
// Gmail/Calendar están habilitadas, "qué tengo esta semana" o "mis mails de hoy" se responden
// directo, sin pasar por el modelo. Solo LECTURA (Nivel A); enviar/eventos van por las tools
// con aprobación.
import { loadConfig } from './config.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from './google.mjs'
import { operadorPara, getTokenFor } from './google-oauth.mjs'

async function clienteDe(userEmail) {
  const email = await operadorPara(userEmail)
  if (!email) return null
  return makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(email) })
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
function fechaEvento(iso) {
  if (!iso) return { dia: '', hora: '' }
  const soloFecha = !iso.includes('T') // evento de día completo
  const d = new Date(soloFecha ? iso + 'T00:00:00' : iso)
  const dia = `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  const hora = soloFecha ? 'todo el día' : d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  return { dia, hora }
}

/** Agenda de los próximos `days` días. Determinística (0 API modelo). */
export async function agendaResumen(userEmail, { days = 7 } = {}) {
  const g = await clienteDe(userEmail)
  if (!g) return 'No hay una cuenta de Google conectada. Reconectá desde la extensión (⚙) para ver tu agenda.'
  let eventos
  try {
    eventos = await g.calendarUpcoming({ max: 25, days })
  } catch (e) {
    return `No pude leer el calendario: ${String(e?.message ?? e).slice(0, 140)}`
  }
  const rango = days <= 1 ? 'hoy' : days <= 7 ? 'esta semana' : `próximos ${days} días`
  if (!eventos.length) return `No tenés eventos en tu agenda (${rango}).`
  const porDia = new Map()
  for (const e of eventos) {
    const { dia, hora } = fechaEvento(e.start)
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia).push(`  ${hora} — ${e.summary}`)
  }
  const out = [`## Tu agenda (${rango})`]
  for (const [dia, items] of porDia) {
    out.push(`\n**${dia}**`)
    out.push(...items)
  }
  out.push('', '_Fuente: Google Calendar (0 API). Para crear/editar un evento, pedímelo y queda para tu aprobación._')
  return out.join('\n')
}

/** Mails según query Gmail. Determinística (0 API modelo). */
export async function mailsResumen(userEmail, { query = 'in:inbox newer_than:2d', titulo = 'Tus mails recientes' } = {}) {
  const g = await clienteDe(userEmail)
  if (!g) return 'No hay una cuenta de Google conectada. Reconectá desde la extensión (⚙) para ver tus mails.'
  let mails
  try {
    mails = await g.gmailSearch(query, { max: 12 })
  } catch (e) {
    return `No pude leer los mails: ${String(e?.message ?? e).slice(0, 140)}`
  }
  if (!mails.length) return `No encontré mails (${query}).`
  const limpiarFrom = (f) => f.replace(/<[^>]+>/g, '').replace(/"/g, '').trim() || f
  const out = [`## ${titulo}`, `${mails.length} mail(s):`, '']
  for (const m of mails) {
    out.push(`- **${limpiarFrom(m.from)}** — ${m.subject}`)
    if (m.snippet) out.push(`  _${m.snippet.slice(0, 100)}…_`)
  }
  out.push('', '_Fuente: Gmail (0 API). Para responder/archivar, pedímelo._')
  return out.join('\n')
}
