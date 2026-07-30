// DIRECTOR IA — la única autoridad de ruteo de la interfaz conversacional del OS.
//
// Decide QUÉ ESPECIALISTA interviene ante un mensaje. No sabe de asistencia, ni de compras,
// ni de ningún dominio: sólo conoce el REGISTRO de especialistas y el ÁREA del canal.
// Si mañana hay que agregar Compras, este archivo no se toca.
//
// CÓMO DECIDE, en orden, y por qué en ese orden:
//
//   1. RECLAMO DEL ESPECIALISTA. Se le pregunta a cada especialista si reconoce el texto
//      con su propia gramática. Es determinístico, cuesta 0 y es el caso masivo: el jefe
//      que escribe `3 ausente` no necesita que un modelo lo interprete, y meter un modelo
//      ahí sería más caro y menos confiable. Si reclama exactamente uno, gana.
//
//   2. ÁREA DEL CANAL. Cada canal privado ES un contexto operativo declarado en
//      `comunicacion.canales_area`. Si nadie reclamó, el canal ya dice de qué se está
//      hablando: el mensaje va al especialista de esa área. Esto es lo que hace que el
//      canal Compras enrute a Compras IA sin una línea de código nueva.
//
//   3. RAZONAMIENTO. Si el canal no determina el área (un DM, un canal sin binding) o si
//      dos especialistas reclamaron, recién ahí interviene el modelo, eligiendo entre los
//      especialistas REGISTRADOS a partir de sus descripciones. Es el único camino que
//      gasta API, y es el minoritario a propósito.
//
//   4. SIN DESTINO. Se responde el catálogo real de lo que el OS sabe hacer hoy — nunca un
//      "comando no soportado" que no dice nada.
//
// Nota sobre el paso 3: si no hay motor de razonamiento disponible (sin crédito, sin clave),
// NO se inventa un destino. Se degrada al catálogo. Un ruteo adivinado es peor que un
// "decime en qué canal" — sobre todo si el destino escribe en la planilla de jornales.

import { especialistas, especialistaDeArea, catalogo } from './registro-especialistas.mjs'

export const VIA = Object.freeze({
  RECLAMO: 'reclamo_especialista', // el especialista reconoció su propia gramática
  AREA_CANAL: 'area_del_canal', // el canal declara el contexto operativo
  RAZONAMIENTO: 'razonamiento', // lo decidió el modelo entre los registrados
  SIN_DESTINO: 'sin_destino',
})

/**
 * Área operativa del canal, desde la tabla de binding. Es DATO, no código.
 * @returns {Promise<{area:string, canal:string}|null>}
 */
export async function areaDelCanal(port, channelId) {
  if (!port?.query || !channelId) return null
  try {
    const { rows } = await port.query(
      `select area_clave, canal_nombre from comunicacion.canales_area
        where plataforma = 'mattermost' and channel_id = $1 and activo limit 1`, [channelId])
    return rows.length ? { area: rows[0].area_clave, canal: rows[0].canal_nombre } : null
  } catch { return null }
}

/**
 * Resuelve el destino de un mensaje.
 *
 * @param {object} o
 * @param {string} o.texto
 * @param {{query:Function}} [o.port]
 * @param {string} [o.channelId]
 * @param {Function} [o.razonar]  (texto, candidatos) => Promise<slug|null>  — inyectable
 * @returns {Promise<{especialista:object|null, via:string, area:string|null,
 *                    intencion:object|null, candidatos:Array, catalogo?:Array}>}
 */
export async function resolver({ texto, port, channelId, razonar } = {}) {
  const todos = await especialistas()
  const ctxCanal = await areaDelCanal(port, channelId)
  const area = ctxCanal?.area ?? null

  // 1) ¿Algún especialista reconoce el texto con su propia gramática?
  const reclamos = []
  for (const e of todos) {
    let r = null
    try { r = await e.reconoce(texto, { area, canal: ctxCanal?.canal ?? null }) } catch { r = null }
    if (r) reclamos.push({ especialista: e, intencion: r })
  }
  if (reclamos.length === 1) {
    const [r] = reclamos
    return { especialista: r.especialista, intencion: r.intencion, via: VIA.RECLAMO, area: r.especialista.area, candidatos: [] }
  }
  // Empate resuelto por el canal: si dos reclaman y el canal declara un área, manda el canal.
  if (reclamos.length > 1 && area) {
    const propio = reclamos.find((r) => r.especialista.area === area)
    if (propio) {
      return { especialista: propio.especialista, intencion: propio.intencion, via: VIA.AREA_CANAL, area, candidatos: reclamos.map((r) => r.especialista.slug) }
    }
  }

  // 2) El canal ES el contexto operativo.
  if (!reclamos.length && area) {
    const e = await especialistaDeArea(area)
    if (e) return { especialista: e, intencion: null, via: VIA.AREA_CANAL, area, candidatos: [] }
  }

  // 3) Ambiguo o sin canal: que decida el modelo entre los REGISTRADOS.
  const candidatos = reclamos.length > 1 ? reclamos.map((r) => r.especialista) : todos
  if (typeof razonar === 'function') {
    let slug = null
    try {
      slug = await razonar(texto, candidatos.map((e) => ({
        slug: e.slug, area: e.area, titulo: e.titulo, descripcion: e.descripcion, ejemplos: e.ejemplos,
      })))
    } catch { slug = null }
    const elegido = candidatos.find((e) => e.slug === slug) ?? null
    if (elegido) {
      const rec = reclamos.find((r) => r.especialista.slug === elegido.slug)
      return { especialista: elegido, intencion: rec?.intencion ?? null, via: VIA.RAZONAMIENTO, area: elegido.area, candidatos: candidatos.map((e) => e.slug) }
    }
  }

  // 4) Sin destino: se dice qué SÍ se puede, con datos del registro.
  return { especialista: null, intencion: null, via: VIA.SIN_DESTINO, area, candidatos: candidatos.map((e) => e.slug), catalogo: await catalogo() }
}

/** Texto de ayuda armado desde el REGISTRO (no hay lista escrita a mano en ningún lado). */
export function renderCatalogo(cat, { area = null } = {}) {
  const l = ['**No supe a quién derivarlo.** Esto es lo que el OS sabe hacer hoy:', '']
  for (const e of cat) {
    const ej = e.ejemplos?.length ? ` — por ejemplo: ${e.ejemplos.map((x) => `\`${x}\``).join(' · ')}` : ''
    l.push(`· **${e.titulo}**${e.operativo ? '' : ' _(declarado, todavía sin capacidades)_'}${ej}`)
  }
  if (area) l.push('', `_Estás en el canal de **${area}**: acá te entiendo directamente sin explicar de qué área es._`)
  return l.join('\n')
}
