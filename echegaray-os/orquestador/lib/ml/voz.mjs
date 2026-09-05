// EL PARTE DE OBRA POR VOZ. Transcribir es la parte fácil; lo difícil es no registrar de más.
//
// ═══ LA REGLA QUE GOBIERNA ESTA CAPACIDAD ═══
//
// Un audio produce una PROPUESTA, nunca un registro. «Trabajaron ocho horas» dicho al pasar no
// puede convertirse solo en ocho horas-hombre imputadas a una obra con su costo: si el modelo
// entendió «ocho» donde el jefe dijo «nueve», nadie se entera hasta la liquidación. La transcripción
// entra al OS cuando una persona la confirma, y hasta entonces es lo que es: lo que se escuchó.
//
// ═══ POR QUÉ EL MODELO ES CHICO ═══
//
// `whisper-base` cuantizado son 180 MB y corre en esta CPU; `whisper-small` son 547 MB y en una VM
// de 7 GB que además sostiene Postgres, el motor documental y ocho procesos del orquestador, eso es
// la diferencia entre andar y competir por memoria. La calidad se mide sobre audios reales de obra,
// no sobre el leaderboard: el ruido de una obra en San Juan no está en ningún benchmark.
//
// ═══ QUÉ SE EXTRAE, Y CON QUÉ SE CRUZA ═══
//
// El texto se parsea con reglas —los partes de obra son formulaicos: nombres, horas, tareas,
// faltantes— y los nombres se resuelven con la capa de identidad que ya existe. No hay un segundo
// emparejador de personas acá.

import { normalizar } from './normalizar.mjs'

export const MODELO = Object.freeze({
  id: 'onnx-community/whisper-base',
  revision: '1846881b6b',
  licencia: 'Apache-2.0 (base openai/whisper-base)',
  dtype: 'q8', discoMb: 180, idioma: 'es',
  porQue: 'el más chico que transcribe español corrido; 547 MB de whisper-small no entran cómodos junto al resto de la VM',
})

/** Las horas dichas en un parte. «ocho horas», «8 hs», «media jornada». */
const RE_HORAS = /\b(\d{1,2})(?:[.,](\d))?\s*(?:h|hs|horas?)\b/gi
const PALABRA_NUMERO = {
  una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12,
}
const RE_HORAS_PALABRA = new RegExp(`\\b(${Object.keys(PALABRA_NUMERO).join('|')})\\s+horas?\\b`, 'gi')

/** Lo que frenó la obra. Es el dato que más se pierde y el que más vale: una hora parada tiene
 *  costo y casi nunca queda escrita. */
// EL `\b` FINAL NO CIERRA DESPUÉS DE UNA VOCAL ACENTUADA, y eso hacía que la palabra más
// importante del parte no se detectara nunca. `\b` es ASCII: después de la «ó» de «Faltó» viene un
// espacio, y entre dos caracteres que ASCII considera «no palabra» no hay frontera. La frase
// «Faltó hierro del ocho» daba `false` con una regex que la nombra explícitamente.
// `(?![a-záéíóúñ])` sí funciona: dice «que no siga otra letra», que es lo que se quería decir.
const RE_IMPEDIMENTO = /\b(falt[óo]|faltaron|no hab[íi]a|sin|parad[oa]s?|par[óo]|demora|rotur[ao]|se rompi[óo]|lluvia|corte de luz)(?![a-záéíóúñ])/i
const RE_AVANCE = /\b(terminamos|terminaron|termin[óo]|complet(?:amos|aron)|listo|finaliz)(?![a-záéíóúñ])/i

/**
 * Lo que un parte dicho contiene. NÚCLEO PURO: no llama a nada y no registra nada.
 *
 * @param {string} texto la transcripción
 * @returns {{horas:Array, personas:Array, impedimentos:Array, avances:Array, crudo:string}}
 */
export function interpretarParte(texto) {
  const t = String(texto ?? '')
  const horas = []
  for (const m of t.matchAll(RE_HORAS)) horas.push({ valor: Number(m[1]) + (m[2] ? Number(m[2]) / 10 : 0), dijo: m[0] })
  for (const m of t.matchAll(RE_HORAS_PALABRA)) horas.push({ valor: PALABRA_NUMERO[m[1].toLowerCase()], dijo: m[0] })

  // Los nombres propios de un parte llegan sueltos («trabajaron Ochoa y Castillo»). Se detectan por
  // mayúscula inicial y se resuelven DESPUÉS contra el padrón: acá sólo se marcan como candidatos.
  // ═══ UNA MAYÚSCULA NO ES UN NOMBRE: LA PRIMERA PALABRA DE CADA ORACIÓN TAMBIÉN LA LLEVA ═══
  //
  // Medido contra audio real: «Una de las variantes más sólidas» daba «Una» como persona, y «Las
  // dependencias entre especies» daba «Las». Una lista negra de palabras no alcanza —el español
  // tiene demasiadas— y el problema no es la palabra: es la POSICIÓN. Se descartan las que abren
  // oración, salvo que vengan seguidas de otra mayúscula («Ochoa Martínez» sí, «Una de» no).
  //
  // El patrón lleva las vocales acentuadas EN EL CUERPO, no sólo en la inicial: sin eso «Faltó» se
  // parte en «Falt» y entra a la lista como si fuera un apellido.
  const PALABRA = /[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/g
  const NO_ES_NOMBRE = /^(hoy|ayer|mañana|falt|falt[óo]|faltaron|estuvimos|trabajaron|terminamos|termin[óo]|par[óo]|hubo|vino|lleg[óo])$/i
  const candidatos = []
  for (const oracion of t.split(/(?<=[.!?])\s+|\n+/)) {
    const enOracion = [...String(oracion).trim().matchAll(PALABRA)]
    enOracion.forEach((m, i) => {
      // La primera palabra de la oración sólo cuenta si la siguiente TAMBIÉN es mayúscula.
      const abreOracion = m.index === 0
      const siguePegada = enOracion[i + 1] && enOracion[i + 1].index === m.index + m[0].length + 1
      if (abreOracion && !siguePegada) return
      if (NO_ES_NOMBRE.test(m[0])) return
      candidatos.push(m[0])
    })
  }
  const personas = [...new Set(candidatos)].map((nombre) => ({ nombre, norm: normalizar(nombre) }))

  const frases = t.split(/[.;]|\by\b(?=\s+[a-z])/i).map((f) => f.trim()).filter(Boolean)
  const impedimentos = frases.filter((f) => RE_IMPEDIMENTO.test(f))
  const avances = frases.filter((f) => RE_AVANCE.test(f))

  return {
    horas, personas, impedimentos, avances, crudo: t,
    // NADA de esto es un registro. El estado lo dice para que ningún consumidor lo confunda.
    estado: 'propuesta',
    porQue: 'transcripción interpretada por reglas: requiere que una persona la confirme antes de imputar horas o costo',
  }
}

/** Carga el modelo de voz. Perezoso: 180 MB no se pagan hasta que llega un audio. */
export async function cargarVoz() {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = new URL('../../datos/modelos/', import.meta.url).pathname
  const t0 = Date.now()
  const asr = await pipeline('automatic-speech-recognition', MODELO.id, { dtype: MODELO.dtype, device: 'cpu' })
  return { asr, msCarga: Date.now() - t0, modelo: MODELO }
}

/**
 * Audio → texto → propuesta. El audio no sale de la VM.
 * @param {Float32Array} audio muestreado a 16 kHz mono
 */
export async function transcribirParte(audio, { motor = null } = {}) {
  const m = motor ?? await cargarVoz()
  const t0 = Date.now()
  const r = await m.asr(audio, { language: 'spanish', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
  const texto = String(r?.text ?? '').trim()
  return { ...interpretarParte(texto), texto, ms: Date.now() - t0, modelo: MODELO.id, revision: MODELO.revision }
}
