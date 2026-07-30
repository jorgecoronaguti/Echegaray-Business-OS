// RAZONAMIENTO DE RUTEO — la parte del Director IA que sí necesita un modelo.
//
// SÓLO se invoca cuando el ruteo determinístico no alcanzó: nadie reclamó el mensaje Y el
// canal no declara un área (un DM suelto), o dos especialistas se lo disputan. El camino
// masivo —el jefe escribiendo `3 ausente` en el canal Asistencia— no pasa por acá y no
// cuesta un centavo. Esa asimetría es deliberada: el gasto de API fue históricamente el
// primer modo de falla del OS.
//
// Lo que se le pide al modelo es lo MÍNIMO: elegir un slug de una lista cerrada. No redacta
// la respuesta, no interpreta el dominio y no toca datos. Si no hay clave, si no hay
// crédito o si contesta cualquier cosa, devuelve null y el Director muestra el catálogo —
// nunca un destino inventado, porque un destino inventado puede terminar escribiendo en la
// planilla de jornales.

const MODELO = process.env.ORQ_RUTEO_MODELO || 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 24

/**
 * Devuelve una función `(texto, candidatos) => Promise<slug|null>` lista para inyectar como
 * `ctx.razonarRuteo`, o null si no hay con qué razonar.
 * @param {{apiKey?:string, fetchImpl?:Function, modelo?:string}} [o]
 */
export function crearRazonadorDeRuteo({ apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = globalThis.fetch, modelo = MODELO } = {}) {
  if (!apiKey || typeof fetchImpl !== 'function') return null

  return async function razonarRuteo(texto, candidatos) {
    if (!Array.isArray(candidatos) || !candidatos.length) return null
    const lista = candidatos.map((c) => `- ${c.slug}: ${c.titulo} — ${c.descripcion}${c.ejemplos?.length ? ` (ej.: ${c.ejemplos.join('; ')})` : ''}`).join('\n')
    const prompt = [
      'Sos el Director del Business OS de una constructora. Recibiste un mensaje de una persona',
      'de la empresa y tenés que decidir QUÉ ESPECIALISTA lo atiende. No respondas el mensaje.',
      '',
      'Especialistas disponibles:',
      lista,
      '',
      `Mensaje: ${String(texto).slice(0, 500)}`,
      '',
      'Respondé ÚNICAMENTE el slug del especialista, o la palabra NINGUNO si no corresponde a ninguno.',
    ].join('\n')

    try {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
      })
      if (!res.ok) return null
      const j = await res.json()
      const salida = String(j?.content?.[0]?.text ?? '').trim().toLowerCase()
      // Lista cerrada: se acepta sólo un slug que exista de verdad.
      return candidatos.some((c) => c.slug === salida) ? salida : null
    } catch {
      return null
    }
  }
}
