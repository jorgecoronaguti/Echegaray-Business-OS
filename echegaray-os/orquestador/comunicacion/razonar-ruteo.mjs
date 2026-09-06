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
// slug de una lista cerrada es lo más SIMPLE que hay— y la puerta resuelve con qué modelo.
//
// ═══ Y DESDE EL 06/09/2026 TAMPOCO SE ELIGE EL PROVEEDOR ═══
//
// Pasa por `lib/ia/gateway.mjs` en vez de `lib/ia/cliente.mjs`. El cambio no es de librería: el
// gateway aplica la POLÍTICA DE DATOS antes de elegir a quién preguntarle, y con eso este camino
// puede atenderlo Hugging Face en vez de Claude.
//
// Por qué ÉSTE y no otro: lo que viaja es el mensaje de la persona y la lista de especialistas —
// `intenciones`, INTERNAL— y la respuesta se valida contra una LISTA CERRADA tres líneas más abajo.
// Un modelo que invente un destino no puede hacer daño: su salida no está en la lista y se
// descarta. Si además el mensaje trae un CUIT, un importe o un nombre propio, el guardián de
// contenido del gateway saca a HF de la cadena y lo atiende Claude — sin que este archivo tenga que
// saberlo.
import { CAPACIDAD } from '../lib/ia/capacidad.mjs'
import { textoONull } from '../lib/ia/gateway.mjs'
import { huggingface } from '../lib/ia/proveedores/huggingface.mjs'

// `ORQ_RUTEO_MODELO` se retira: fijar el modelo acá saltearía la elección de PROVEEDOR que hace el
// gateway, que es lo que decide si esto lo atiende HF o Claude. El modelo se cambia donde vive esa
// decisión —`ORQ_HF_LLM_RAPIDO` / los alias de Anthropic—, no por una escotilla en un call site.
const MAX_TOKENS = 24

/**
 * Devuelve una función `(texto, candidatos) => Promise<slug|null>` lista para inyectar como
 * `ctx.razonarRuteo`, o null si no hay con qué razonar.
 * @param {{apiKey?:string, fetchImpl?:Function}} [o]
 */
export function crearRazonadorDeRuteo({ apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  // ANTES: sin clave de Anthropic no había razonador. Eso dejó de ser cierto — con el token de HF
  // el OS puede rutear solo. Exigir la clave de Claude para poder usar el proveedor que no la
  // necesita sería atarse al costo que se quiere evitar.
  if ((!apiKey && !huggingface.configurado()) || typeof fetchImpl !== 'function') return null

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
    const r = await textoONull({
      tarea: 'rutear',
      // EL DOMINIO ES DEL DATO QUE VIAJA, no del especialista al que se rutea. Lo que sale es una
      // frase y un catálogo de slugs: eso es `intenciones` y es INTERNAL. Etiquetarlo con el
      // dominio del destino —`cobranzas`, `jornales`— sería clasificar por la respuesta que
      // todavía no existe, y cerraría la puerta para nada.
      dominio: 'intenciones',
      calidad: CAPACIDAD.SIMPLE,
      mensajes: [{ role: 'user', content: prompt }],
      maxTokens: MAX_TOKENS,
      agente: 'director',
      funcion: 'rutear',
      apiKey,
      fetchImpl,
    })
    const salida = String(r.texto ?? '').trim().toLowerCase()

    // LISTA CERRADA: se acepta sólo un slug que exista de verdad. Un destino inventado puede
    // terminar escribiendo en la planilla de jornales.
    return candidatos.some((c) => c.slug === salida) ? salida : null
  }
}
