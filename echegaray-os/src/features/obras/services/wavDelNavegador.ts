// EL WAV QUE ARMA EL NAVEGADOR PARA «DICTAR PARTE» — puro, se prueba con node --test.
//
// La VM transcribe con sherpa-onnx y NO tiene ffmpeg: no puede abrir el Opus/WebM que graba
// `MediaRecorder`. Por eso el navegador captura PCM crudo (AudioWorklet o ScriptProcessor, ver
// `grabadora.ts`), lo baja a 16 kHz mono y lo envuelve en un WAV de 16 bits. El servidor sólo lee.

/** La frecuencia que espera el modelo. Tres minutos a 16 kHz × 16 bits = 5,8 MB. */
export const FRECUENCIA = 16000
/** El techo de una grabación (lo dice la maqueta: unos 3 minutos). */
export const MAX_SEGUNDOS = 180

/**
 * De la frecuencia del micrófono (44,1 o 48 kHz casi siempre) a 16 kHz, promediando cada ventana:
 * tomar una muestra de cada tres sin promediar deja pasar el ruido agudo como si fuera voz.
 */
export function remuestrear(muestras: Float32Array, de: number, a: number = FRECUENCIA): Float32Array {
  if (de === a) return muestras
  const razon = de / a
  const n = Math.floor(muestras.length / razon)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const ini = Math.floor(i * razon)
    const fin = Math.min(muestras.length, Math.max(ini + 1, Math.floor((i + 1) * razon)))
    let s = 0
    for (let j = ini; j < fin; j++) s += muestras[j]
    out[i] = s / (fin - ini)
  }
  return out
}

/** Junta los pedazos que fue entregando la captura. */
export function unir(pedazos: readonly Float32Array[]): Float32Array {
  const total = pedazos.reduce((s, p) => s + p.length, 0)
  const out = new Float32Array(total)
  let o = 0
  for (const p of pedazos) { out.set(p, o); o += p.length }
  return out
}

/** PCM de 16 bits, mono, con su cabecera RIFF de 44 bytes. */
export function codificarWav(muestras: Float32Array, frecuencia: number = FRECUENCIA): Uint8Array {
  const datos = muestras.length * 2
  const buf = new ArrayBuffer(44 + datos)
  const v = new DataView(buf)
  const texto = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  texto(0, 'RIFF'); v.setUint32(4, 36 + datos, true); texto(8, 'WAVE')
  texto(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, frecuencia, true); v.setUint32(28, frecuencia * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  texto(36, 'data'); v.setUint32(40, datos, true)
  for (let i = 0; i < muestras.length; i++) {
    const s = Math.max(-1, Math.min(1, muestras[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

/** El nivel de un pedazo (0–1), para la onda de «Dictando el parte». RMS con una ganancia que se ve. */
export function nivel(pedazo: Float32Array): number {
  if (!pedazo.length) return 0
  let s = 0
  for (let i = 0; i < pedazo.length; i++) s += pedazo[i] * pedazo[i]
  return Math.min(1, Math.sqrt(s / pedazo.length) * 6)
}

/** Lo que se le dice a la persona cuando el navegador no da el micrófono. */
export function motivoSinMicrofono(nombreError: string | undefined, seguro: boolean, hayApi: boolean): string {
  if (!seguro) return 'El micrófono sólo funciona entrando por https://app.ecsas.com.ar.'
  if (!hayApi) return 'Este navegador no deja grabar audio. Probá con Chrome o Safari actualizados.'
  if (nombreError === 'NotAllowedError' || nombreError === 'SecurityError') {
    return 'No hay permiso para usar el micrófono. Tocá el candado de la barra de direcciones → Micrófono → Permitir, y volvé a tocar «Dictar parte».'
  }
  if (nombreError === 'NotFoundError' || nombreError === 'OverconstrainedError') return 'No encontré un micrófono en este equipo.'
  if (nombreError === 'NotReadableError') return 'El micrófono lo está usando otra aplicación (una llamada, otra pestaña). Cerrala y probá de nuevo.'
  return 'No se pudo abrir el micrófono. Probá de nuevo o cargá el parte a mano.'
}
