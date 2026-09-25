// LA ESCOTILLA DEL MODELO DE LENGUAJE EN «DICTAR PARTE» — OPCIONAL Y APAGADA.
//
// El dueño pidió reducir al máximo el gasto de API (25/09/2026). El dictado se interpreta con
// reglas (`voz-parte.mjs`); esto sólo existe para el caso en que las reglas fallan en algo CLARO:
// un dictado largo del que no salió ningún dato, o que quedó casi entero en Novedades. Y aun así
// sólo corre con `ORQ_VOZ_LLM=1` en el entorno de la VM. Por defecto no está.
//
// ═══ LO QUE EL MODELO PUEDE Y NO PUEDE HACER ═══
//
// Recibe el texto de las Novedades y la lista cerrada de personas y tareas de la obra (sólo ids y
// nombres). Todo lo que devuelve se descarta si nombra un id que no está en esa lista, y lo que
// queda entra como DUDOSO («lo propuso el modelo: confirmalo»): nunca como dato dictado.

import { etiqueta, rotuloDePersona } from './voz-parte.mjs'

export const VARIABLE = 'ORQ_VOZ_LLM'
export const encendido = (env = process.env) => String(env[VARIABLE] ?? '').trim() === '1'

/** ¿Fallaron las reglas en algo claro? Dictado largo sin datos, o casi todo en Novedades. */
export function fallaClara(p) {
  const palabras = String(p.texto ?? '').split(/\s+/).filter(Boolean).length
  if (palabras < 12) return false
  const datos = p.personas.length + p.avances.length + p.materiales.length
  const enNovedades = p.novedades.reduce((s, n) => s + n.texto.length, 0)
  return datos === 0 || enNovedades > 0.6 * String(p.texto).length
}

const SISTEMA = 'Sos un asistente que lee el parte diario dictado por un jefe de obra en Argentina. Devolvés SOLO JSON. Usás SOLO los ids de las listas dadas; si no estás seguro, no lo incluís.'

/**
 * @param {object} p la propuesta de las reglas
 * @param {object} contexto el de `contextoDeObra`
 * @param {{pedirTexto:Function, env?:object}} dep — `pedirTexto` de `lib/ia/cliente.mjs` (inyectado: los tests no llaman a nadie)
 */
export async function completarConModelo(p, contexto, { pedirTexto, env = process.env } = {}) {
  if (!encendido(env) || !fallaClara(p) || typeof pedirTexto !== 'function') return p
  const personas = new Map((contexto.personas ?? []).map((x) => [x.id, x]))
  const tareas = new Map((contexto.tareas ?? []).map((x) => [x.id, x]))
  const pedido = {
    texto: p.novedades.map((n) => n.texto).join(' '),
    personas: [...personas.values()].map((x) => ({ id: x.id, nombre: rotuloDePersona(x) })),
    tareas: [...tareas.values()].map((x) => ({ id: x.id, nombre: etiqueta(x) })),
    formato: { personas: [{ persona_id: 'id', estado: 'presente|ausente', horas: 8, tarea_id: 'id|null' }] },
  }
  let crudo
  try {
    const r = await pedirTexto({
      capacidad: 'simple', agente: 'dictar-parte', funcion: 'completar-dictado', sistema: SISTEMA, maxTokens: 800,
      mensajes: [{ role: 'user', content: JSON.stringify(pedido) }],
    })
    crudo = JSON.parse(String(r?.texto ?? '').replace(/^```json\s*|```$/g, ''))
  } catch {
    return p // sin modelo el dictado sigue: las reglas ya dejaron todo en Novedades
  }
  const ya = new Set(p.personas.map((f) => f.persona_id).filter(Boolean))
  const nuevas = (Array.isArray(crudo?.personas) ? crudo.personas : [])
    .filter((x) => personas.has(x?.persona_id) && !ya.has(x.persona_id) && ['presente', 'ausente'].includes(x.estado))
    .map((x) => ({
      persona_id: x.persona_id, nombre: rotuloDePersona(personas.get(x.persona_id)), estado: x.estado,
      horas: x.estado === 'presente' && Number(x.horas) > 0 && Number(x.horas) <= 24 ? Number(x.horas) : null,
      tarea_id: tareas.has(x.tarea_id) ? x.tarea_id : null, tarea_nombre: etiqueta(tareas.get(x.tarea_id)),
      tarea_candidatos: [], confianza: 'baja', dudoso: true, motivo: 'lo propuso el modelo de lenguaje: confirmalo',
      tramo: null, origen: 'modelo',
    }))
  if (!nuevas.length) return p
  return { ...p, personas: [...p.personas, ...nuevas], resumen: { ...p.resumen, dudas: p.resumen.dudas + nuevas.length }, asistidoPorModelo: true }
}
