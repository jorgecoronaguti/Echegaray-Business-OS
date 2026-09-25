'use client'

// LA GRABADORA DE «DICTAR PARTE» — PCM crudo del micrófono, sin MediaRecorder.
//
// MediaRecorder graba Opus/WebM (o AAC en Safari) y la VM no tiene con qué abrirlo. Acá se captura
// la señal cruda: con un AudioWorklet (hilo de audio, no traba la pantalla) y, si el navegador no lo
// tiene, con ScriptProcessor (viejo, pero está en todos). Al terminar se baja a 16 kHz mono y se
// arma el WAV (`wavDelNavegador.ts`). Pedirle 16 kHz al AudioContext ahorra el remuestreo donde se
// puede; donde no, lo hace `remuestrear`.

import { FRECUENCIA, MAX_SEGUNDOS, codificarWav, motivoSinMicrofono, nivel, remuestrear, unir } from '../../services/wavDelNavegador'

export interface Grabacion {
  /** Termina y devuelve el WAV. */
  terminar: () => Promise<{ wav: Blob; segundos: number }>
  /** Suelta el micrófono sin devolver nada. */
  cancelar: () => void
}

export type ErrorDeMicrofono = { error: string }

const CODIGO_WORKLET = `
class CapturaDictado extends AudioWorkletProcessor {
  process(entradas) {
    const c = entradas[0] && entradas[0][0]
    if (c && c.length) this.port.postMessage(c.slice(0))
    return true
  }
}
registerProcessor('captura-dictado', CapturaDictado)
`

/**
 * Pide el micrófono y empieza. `alNivel` recibe 0–1 unas diez veces por segundo (la onda) y
 * `alTope` avisa cuando se llega a los 3 minutos: la grabación se corta sola ahí.
 */
export async function empezarGrabacion({ alNivel, alTope }: {
  alNivel: (n: number, segundos: number) => void
  alTope: () => void
}): Promise<Grabacion | ErrorDeMicrofono> {
  const hayApi = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  const seguro = typeof window !== 'undefined' && window.isSecureContext
  if (!seguro || !hayApi) return { error: motivoSinMicrofono(undefined, seguro, hayApi) }

  let flujo: MediaStream
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (e) {
    return { error: motivoSinMicrofono((e as { name?: string })?.name, seguro, hayApi) }
  }

  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  let ctx: AudioContext
  try { ctx = new Ctx({ sampleRate: FRECUENCIA }) } catch { ctx = new Ctx() }
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
  const fuente = ctx.createMediaStreamSource(flujo)
  const pedazos: Float32Array[] = []
  let muestras = 0
  let cortado = false
  const tope = MAX_SEGUNDOS * ctx.sampleRate

  const recibir = (p: Float32Array) => {
    if (cortado) return
    pedazos.push(p)
    muestras += p.length
    alNivel(nivel(p), muestras / ctx.sampleRate)
    if (muestras >= tope) { cortado = true; alTope() }
  }

  let nodo: AudioNode
  let url: string | null = null
  try {
    if (!ctx.audioWorklet) throw new Error('sin worklet')
    url = URL.createObjectURL(new Blob([CODIGO_WORKLET], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(url)
    const w = new AudioWorkletNode(ctx, 'captura-dictado')
    w.port.onmessage = (ev: MessageEvent<Float32Array>) => recibir(ev.data)
    nodo = w
  } catch {
    const sp = ctx.createScriptProcessor(4096, 1, 1)
    sp.onaudioprocess = (ev) => recibir(new Float32Array(ev.inputBuffer.getChannelData(0)))
    nodo = sp
  }
  fuente.connect(nodo)
  // El nodo tiene que llegar al destino para que el navegador lo haga correr; con ganancia 0 no suena.
  const mudo = ctx.createGain()
  mudo.gain.value = 0
  nodo.connect(mudo).connect(ctx.destination)

  const soltar = () => {
    cortado = true
    try { fuente.disconnect(); nodo.disconnect(); mudo.disconnect() } catch { /* ya estaba suelto */ }
    for (const t of flujo.getTracks()) t.stop()
    void ctx.close().catch(() => {})
    if (url) URL.revokeObjectURL(url)
  }

  return {
    cancelar: soltar,
    terminar: async () => {
      const frecuencia = ctx.sampleRate
      soltar()
      const pcm = remuestrear(unir(pedazos), frecuencia)
      const wav = codificarWav(pcm)
      return { wav: new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), segundos: pcm.length / FRECUENCIA }
    },
  }
}
