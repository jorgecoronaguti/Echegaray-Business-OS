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

// EL MODELO YA NO SE ELIGE ACÁ (25/08/2026). Se declara la CAPACIDAD que hace falta —elegir un
// slug de una lista cerrada es lo más SIMPLE que hay— y `lib/ia/cliente.mjs` resuelve con qué
// modelo. `ORQ_RUTEO_MODELO` sigue funcionando como escotilla, pero ahora pasa por la puerta única y
// queda registrada en el costo junto al resto.
import { CAPACIDAD, pedirTextoONull } from '../lib/ia/cliente.mjs'

const MODELO = process.env.ORQ_RUTEO_MODELO || null
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

    // Sigue devolviendo null ante cualquier problema —el Director muestra el catálogo y nadie se
    // queda sin respuesta—, pero ahora el motivo quedó clasificado y registrado, y si era falta de
    // saldo el OS entero se enteró en vez de seguir intentando en silencio.
    const salida = String(await pedirTextoONull({
      capacidad: CAPACIDAD.SIMPLE,
      mensajes: [{ role: 'user', content: prompt }],
      maxTokens: MAX_TOKENS,
      agente: 'director',
      funcion: 'rutear',
      modelo,
      apiKey,
      fetchImpl,
    }) ?? '').trim().toLowerCase()

    // LISTA CERRADA: se acepta sólo un slug que exista de verdad. Un destino inventado puede
    // terminar escribiendo en la planilla de jornales.
    return candidatos.some((c) => c.slug === salida) ? salida : null
  }
}
