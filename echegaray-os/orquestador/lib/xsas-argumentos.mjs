// SACAR DE LA FRASE LOS ARGUMENTOS QUE LA TOOL PIDE — el último eslabón que le faltaba a la puerta.
//
// ═══ EL AGUJERO, CON NOMBRE ═══
//
// `argumentosPara` llena los argumentos de una tool desde el CONTEXTO VERIFICADO del pedido: el
// `obra_id` que mandó la pantalla, la entidad que trae el timer. Eso es correcto y es lo que hace
// que un contexto no pueda inyectar lo que la tool no pidió. Pero deja afuera un caso entero: el
// dueño escribiendo en Mattermost. Cuando alguien dice «analizá los planos de Quattropani», el
// argumento `proyecto` existe, está dicho y no está en ningún contexto — y el gateway, que ya había
// elegido bien la tool, la descartaba por «falta proyecto» y escalaba a una respuesta en palabras.
//
// El resultado era el peor de los dos mundos: el ruteo determinístico acertaba la capacidad y la
// capacidad no corría. Una tool con parámetros era, desde el chat, inalcanzable.
//
// ═══ POR QUÉ ESTO NO ES «DARLE LAS TOOLS AL MODELO» ═══
//
// El modelo NO elige la tool: eso ya lo decidió el ruteo determinístico. NO la ejecuta: la ejecuta
// el gateway, con los permisos del actor y la lista de autorizadas. NO puede agregar parámetros:
// sólo se aceptan claves que la tool DECLARA en su `input_schema`, y todo lo demás se tira. Lo
// único que hace es leer una frase y decir qué parte de esa frase es el valor del parámetro — que
// es traducción, no decisión, y es exactamente lo que un modelo hace mejor que un `switch`.
//
// Y si no puede, no pasa nada malo: se devuelve lo que había y el gateway sigue su camino de
// siempre. Esta capa sólo puede AGREGAR una respuesta que antes no existía.

import { CAPACIDAD } from './ia/capacidad.mjs'

/** El pedido al modelo: la frase, los parámetros que faltan con su descripción, y nada más. PURA. */
export function prompt({ texto, tool, faltan = [] }) {
  const props = tool?.schema?.input_schema?.properties ?? {}
  const lista = faltan.map((k) => `- "${k}": ${props[k]?.description ?? 'sin descripción'}`).join('\n')
  return [
    'Extraé de esta frase los valores que faltan. No interpretes la intención, no contestes la',
    'pregunta, no agregues nada: sólo copiá de la frase lo que corresponde a cada parámetro.',
    '',
    `FRASE: «${texto}»`,
    '',
    `CAPACIDAD que se va a ejecutar: ${tool?.schema?.name ?? 'sin nombre'}`,
    'PARÁMETROS que faltan:',
    lista,
    '',
    'Devolvés SÓLO un JSON con esos parámetros. Si la frase no dice uno, poné null — nunca lo',
    'inventes ni lo deduzcas de lo que suele pedirse.',
    'Ejemplo: {"proyecto":"Quattropani"}',
  ].join('\n')
}

function extraerJson(texto) {
  const s = String(texto ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const a = s.indexOf('{'); const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return null }
}

/**
 * COMPLETAR LOS ARGUMENTOS QUE FALTAN. Devuelve `{args, falta, uso}`.
 *
 * `falta` sale recalculado sobre lo que efectivamente se pudo llenar: si el modelo devolvió null
 * para un requerido, el parámetro SIGUE faltando y el gateway no ejecuta. Poner un valor plausible
 * para que la tool corra sería inventar el pedido de otro.
 */
export async function completarArgumentos({ ia, texto, tool, args = {}, falta = [], logger = null } = {}) {
  if (!falta.length || !ia?.pedirTextoONull) return { args, falta, uso: null }
  const declaradas = new Set(Object.keys(tool?.schema?.input_schema?.properties ?? {}))
  const pedibles = falta.filter((k) => declaradas.has(k))
  if (!pedibles.length) return { args, falta, uso: null }

  // `pedirTextoONull` devuelve el TEXTO, no el objeto con `.texto` que devuelve `pedirTexto`. Leer
  // `r.texto` acá daba siempre `undefined` y el argumento nunca se completaba, con la extracción
  // funcionando perfecto del otro lado — una falla muda que sólo se ve mirando el valor devuelto.
  const texto_ = await ia.pedirTextoONull({
    // Copiar un nombre propio de una frase es lo más simple que hay: el modelo barato alcanza y
    // pagar el potente por esto sería pagar razonamiento para hacer un recorte.
    capacidad: CAPACIDAD.SIMPLE,
    sistema: 'Extraés parámetros de una frase. Devolvés SÓLO JSON válido, sin markdown.',
    mensajes: [{ role: 'user', content: prompt({ texto, tool, faltan: pedibles }) }],
    maxTokens: 300,
    agente: 'xsas-gateway',
    funcion: 'completar-argumentos',
    logger,
  })
  const crudo = extraerJson(texto_)
  if (!crudo) return { args, falta, uso: texto_ }

  const salida = { ...args }
  for (const k of pedibles) {
    const v = crudo[k]
    if (typeof v === 'string' && v.trim()) salida[k] = v.trim()
    else if (typeof v === 'number' || typeof v === 'boolean') salida[k] = v
  }
  return { args: salida, falta: falta.filter((k) => salida[k] === undefined || salida[k] === null || salida[k] === ''), uso: texto_ }
}
