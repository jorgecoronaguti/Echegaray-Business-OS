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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DICTAR PARTE (25/09/2026) — parakeet-tdt-0.6b-v3 int8 con sherpa-onnx, LOCAL en la VM.
//
// ═══ POR QUÉ ESTE MODELO Y NO WHISPER-BASE ═══
//
// Whisper local nunca pudo recibir un audio: `transformers.js` en Node exige Float32 y la VM no tiene
// ffmpeg ni decodificador de Opus. Dictar parte resuelve eso DEL LADO DEL NAVEGADOR: graba PCM mono
// de 16 kHz y lo arma como WAV, así que acá sólo hay que leer un WAV (`leerWav`, sin dependencias).
// Parakeet con sherpa-onnx se midió hoy en esta VM sobre un parte sintético: RTF 0,14 (un minuto de
// audio en ~8 s), ~1,1 GB de RAM mientras transcribe, WER 8,8 %. Es 3,6 veces el disco de
// whisper-base (670 MB), y por eso se carga SÓLO cuando hay un audio en la cola y se suelta al
// terminar la vuelta: no vive en memoria junto al chat.
//
// ═══ LICENCIA Y ATRIBUCIÓN (CC-BY-4.0) ═══
//
// «parakeet-tdt-0.6b-v3» es de NVIDIA, publicado bajo Creative Commons Attribution 4.0
// (https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3). La exportación ONNX int8 que se usa es de
// Fangjun Kuang (k2-fsa/sherpa-onnx), repo `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8`,
// revisión fijada abajo. CC-BY-4.0 permite uso comercial con atribución; la atribución es este
// bloque y `MODELO_DICTADO.atribucion`. sherpa-onnx es Apache-2.0.
//
// ═══ LA REVISIÓN ESTÁ FIJADA, Y SE VERIFICA ═══
//
// Los pesos se instalan con `scripts/voz-instalar-modelo.mjs`, que baja esa revisión exacta (o copia
// una carpeta local) y controla el sha256 de cada archivo contra `MODELO_DICTADO.archivos`. Un peso
// que no coincide no se usa: `verificarModelo` lo dice antes de tomar un audio de la cola.

import { createRequire } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const MODELO_DICTADO = Object.freeze({
  id: 'csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
  revision: '2bda32ec70b097a55adaa07d9a7173915b43cc78',
  base: 'nvidia/parakeet-tdt-0.6b-v3',
  licencia: 'CC-BY-4.0',
  atribucion: 'parakeet-tdt-0.6b-v3 © NVIDIA, CC-BY-4.0 (https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3); exportación ONNX int8 de k2-fsa/sherpa-onnx (Apache-2.0)',
  runtime: 'sherpa-onnx-node@1.13.8',
  discoMb: 670,
  ramMb: 1100,
  hilos: 2,
  archivos: Object.freeze({
    'encoder.int8.onnx': 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247',
    'decoder.int8.onnx': '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e',
    'joiner.int8.onnx': '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3',
    'tokens.txt': 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d',
  }),
})

/** Dónde viven los pesos instalados. Una carpeta por revisión: cambiar de revisión no pisa la vieja. */
export function carpetaDelModelo(env = process.env) {
  if (env.ORQ_VOZ_MODELO_DIR) return env.ORQ_VOZ_MODELO_DIR
  return join(homedir(), '.local/share/echegaray-os/modelos', MODELO_DICTADO.id.split('/')[1], MODELO_DICTADO.revision.slice(0, 12))
}

/** Dónde está `sherpa-onnx-node`: su propio `package.json` en `orquestador/voz/`, fuera del build de Next. */
export function carpetaDelRuntime(env = process.env) {
  return env.ORQ_VOZ_RUNTIME ?? new URL('../../voz/', import.meta.url).pathname
}

/** Qué falta para poder transcribir. Se pregunta ANTES de tomar un audio de la cola. */
export function verificarModelo(env = process.env) {
  const falta = []
  const dir = carpetaDelModelo(env)
  for (const f of Object.keys(MODELO_DICTADO.archivos)) {
    if (!existsSync(join(dir, f))) falta.push(`el peso ${f} en ${dir} (instalar con voz-instalar-modelo.mjs)`)
  }
  if (!existsSync(join(carpetaDelRuntime(env), 'node_modules/sherpa-onnx-node/package.json'))) {
    falta.push('sherpa-onnx-node (npm ci --prefix orquestador/voz)')
  }
  // Lo que instala el script deja una constancia de que verificó los hash; sin ella, no se usa.
  if (!falta.length && !existsSync(join(dir, 'VERIFICADO'))) falta.push(`la constancia de sha256 en ${dir} (reinstalar)`)
  return falta
}

/**
 * EL WAV DEL NAVEGADOR → muestras Float32 en [-1, 1]. Sin dependencias: PCM de 16 bits, mono o
 * estéreo (se mezcla), cualquier frecuencia (sherpa remuestrea). Lo que no es eso se rechaza con un
 * motivo en castellano: un WAV raro no puede colgar la cola.
 * @param {Buffer|Uint8Array} buf
 */
export function leerWav(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') {
    return { ok: false, error: 'el audio no es un WAV' }
  }
  let off = 12, fmt = null, data = null
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4)
    let tam = b.readUInt32LE(off + 4)
    const ini = off + 8
    // El navegador que corta la grabación puede dejar el tamaño del bloque de datos en 0 o de más.
    if (id === 'data' && (tam === 0 || ini + tam > b.length)) tam = b.length - ini
    if (id === 'fmt ') fmt = { formato: b.readUInt16LE(ini), canales: b.readUInt16LE(ini + 2), frecuencia: b.readUInt32LE(ini + 4), bits: b.readUInt16LE(ini + 14) }
    if (id === 'data') { data = b.subarray(ini, ini + tam); break }
    off = ini + tam + (tam % 2)
  }
  if (!fmt || !data) return { ok: false, error: 'el WAV no tiene formato o datos' }
  if (fmt.formato !== 1 || fmt.bits !== 16) return { ok: false, error: `el WAV no es PCM de 16 bits (formato ${fmt.formato}, ${fmt.bits} bits)` }
  if (fmt.canales < 1 || fmt.canales > 2) return { ok: false, error: `el WAV tiene ${fmt.canales} canales` }
  const n = Math.floor(data.length / (2 * fmt.canales))
  const muestras = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < fmt.canales; c++) s += data.readInt16LE((i * fmt.canales + c) * 2)
    muestras[i] = s / fmt.canales / 32768
  }
  return { ok: true, muestras, frecuencia: fmt.frecuencia, segundos: n / fmt.frecuencia }
}

/**
 * CARGA PARAKEET. Perezosa y una por vuelta del worker: 670 MB no se pagan si la cola está vacía.
 * `hilos` = 2 de los 4 núcleos: el chat y Postgres viven en la misma VM.
 */
export function cargarDictado({ env = process.env, hilos = MODELO_DICTADO.hilos } = {}) {
  const req = createRequire(join(carpetaDelRuntime(env), 'package.json'))
  const sherpa = req('sherpa-onnx-node')
  const dir = carpetaDelModelo(env)
  const t0 = Date.now()
  const reconocedor = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: join(dir, 'encoder.int8.onnx'), decoder: join(dir, 'decoder.int8.onnx'), joiner: join(dir, 'joiner.int8.onnx') },
      tokens: join(dir, 'tokens.txt'), numThreads: hilos, provider: 'cpu', modelType: 'nemo_transducer',
    },
  })
  return { reconocedor, msCarga: Date.now() - t0, modelo: `${MODELO_DICTADO.id}@${MODELO_DICTADO.revision.slice(0, 12)}` }
}

/** El tramo más largo que se decodifica de una vez. Ver `tramosDeAudio`. */
export const SEGUNDOS_POR_TRAMO = 25

/**
 * PARTIR EL AUDIO EN TRAMOS DE HASTA 25 s, CORTANDO EN UN SILENCIO.
 *
 * Medido el 25/09/2026: un WAV de 3 minutos decodificado de una sola vez pasó los 2,1 GB de RSS (la
 * atención del codificador crece con el largo) y quedó frenado por el techo de memoria. En tramos de
 * 25 s el pico queda en el del modelo cargado. El corte se busca en los últimos 5 s de cada tramo, en
 * la ventana de 100 ms con menos energía: cortar en medio de una palabra la parte en dos y ninguna se
 * reconoce. Puro: devuelve índices [desde, hasta) sobre las muestras.
 */
export function tramosDeAudio(muestras, frecuencia, { maximo = SEGUNDOS_POR_TRAMO, holgura = 5 } = {}) {
  const n = muestras.length
  const largo = Math.floor(maximo * frecuencia)
  if (n <= largo) return [[0, n]]
  const ventana = Math.max(1, Math.floor(frecuencia / 10))
  const out = []
  let desde = 0
  while (n - desde > largo) {
    const tope = desde + largo
    let corte = tope, menor = Infinity
    for (let v = tope - Math.floor(holgura * frecuencia); v + ventana <= tope; v += ventana) {
      let e = 0
      for (let i = v; i < v + ventana; i++) e += muestras[i] * muestras[i]
      if (e < menor) { menor = e; corte = v + Math.floor(ventana / 2) }
    }
    out.push([desde, corte])
    desde = corte
  }
  out.push([desde, n])
  return out
}

/** WAV → texto. El audio no sale de la VM. Se decodifica por tramos (ver `tramosDeAudio`). */
export function transcribirWav(motor, wav) {
  const leido = leerWav(wav)
  if (!leido.ok) return leido
  const t0 = Date.now()
  const textos = []
  for (const [a, b] of tramosDeAudio(leido.muestras, leido.frecuencia)) {
    const st = motor.reconocedor.createStream()
    st.acceptWaveform({ samples: leido.muestras.subarray(a, b), sampleRate: leido.frecuencia })
    motor.reconocedor.decode(st)
    const t = String(motor.reconocedor.getResult(st)?.text ?? '').trim()
    if (t) textos.push(t)
  }
  return { ok: true, texto: textos.join(' '), ms: Date.now() - t0, segundos: leido.segundos, modelo: motor.modelo }
}

/** Para el control de salud: ¿los pesos pesan lo que tienen que pesar? (el hash lo controla el instalador). */
export function tamanoDelModelo(env = process.env) {
  const dir = carpetaDelModelo(env)
  return Object.keys(MODELO_DICTADO.archivos).reduce((s, f) => s + (existsSync(join(dir, f)) ? statSync(join(dir, f)).size : 0), 0)
}
