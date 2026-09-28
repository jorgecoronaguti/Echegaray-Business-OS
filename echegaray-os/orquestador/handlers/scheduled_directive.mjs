// Handler de una recurrencia disparada (PRP-015 Fase 4).
//
// ═══ SIN MODELO (26/09/2026) ═══
//
// Antes mandaba la directiva en lenguaje natural al motor interactivo (localhost /ask, Claude
// Sonnet) para que ELIGIERA la herramienta. Medido: ~US$14,5 por mes para correr herramientas que ya
// eran determinísticas, y el 21/09 `sincronizar_nomina` falló y el modelo igual contestó «HECHO —
// cargado en la planilla» después de gastar US$1,71 leyendo JORNALES. El dueño: «tenemos muchas
// herramientas propias de inteligencia para que todo se siga basando en Claude — hay que cambiar eso».
//
// Ahora cada recurrencia NOMBRA su herramienta (`orq.schedules.herramienta`) y acá se corre directo.
// Sólo las de `HERRAMIENTAS_DE_AGENDA`, y ninguna escribe en Google (Sheet/Drive): una escritura
// programada en el Sheet no pasa por la aprobación del dueño. `indices_economicos` sí escribe su propia
// tabla (`public.indice_economico`): es su función, y el Sheet lo baja el pipeline con su guarda.
// Sin herramienta, la recurrencia no corre y lo deja escrito.
import { setScheduleResult, HERRAMIENTAS_DE_AGENDA } from '../lib/schedules.mjs'
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { briefingCajaTools } from '../lib/tools/briefing-caja-tool.mjs'
import { aliasPendientesTools } from '../lib/tools/alias-pendientes-tool.mjs'
import { indicesTools } from '../lib/tools/indices-tool.mjs'

/** Las herramientas que la agenda puede correr, por su nombre de tool. */
export function herramientasDeAgenda(google) {
  const mapa = new Map()
  for (const def of Object.values({ ...briefingCajaTools(google), ...aliasPendientesTools(google), ...indicesTools() })) {
    if (def.capability === 'drive.read' && HERRAMIENTAS_DE_AGENDA.includes(def.schema.name)) mapa.set(def.schema.name, def)
  }
  return mapa
}

/** PURO: el texto que queda como última corrida. */
export function textoDeResultado(r) {
  if (r == null) return '(sin respuesta)'
  if (r.error) return `error: ${r.error}`
  return String(r.texto ?? r.resumen ?? JSON.stringify(r)).slice(0, 2000)
}

export async function scheduledDirectiveHandler(task, ctx, deps = {}) {
  const { schedule_id, title, herramienta, entrada } = task.inputs || {}
  let answer
  if (!herramienta) {
    answer = 'no corrió: la recurrencia no nombra una herramienta propia (la agenda ya no usa modelo)'
  } else {
    const google = deps.google !== undefined ? deps.google : makeGoogleClient({ config: ctx.config, scopes: READONLY_SCOPES })
    const def = (deps.herramientas ?? herramientasDeAgenda(google)).get(herramienta)
    if (!def) answer = `no corrió: «${herramienta}» no es una herramienta de lectura habilitada para la agenda`
    else {
      try { answer = textoDeResultado(await def.run(entrada ?? {})) }
      catch (e) { answer = `error: ${String(e?.message ?? e).slice(0, 300)}` }
    }
  }

  if (schedule_id) await (deps.guardar ?? setScheduleResult)(schedule_id, answer)
  ctx.logger.info('scheduled_directive: corrida completada', { schedule_id, title, herramienta: herramienta ?? null })
  return { result: { schedule_id, title, herramienta: herramienta ?? null, answer: String(answer).slice(0, 600) } }
}
