// EL FALLBACK, DETRÁS DEL MISMO CONTRATO — listo y apagado.
//
// Mismo criterio que `lib/ia/proveedores/openai-compatible.mjs`: el dialecto `POST /images/generations`
// con `{prompt, size, n, response_format:"b64_json"}` lo hablan hoy OpenAI, Azure OpenAI, Together,
// Fireworks y varios gateways. Por eso el archivo no lleva el nombre de una empresa: es el
// PROTOCOLO, y el host, el modelo y la clave son configuración.
//
// NO trae credenciales, NO inventa un host por defecto y NO se activa solo. Sin
// `ORQ_IMG_ALT_BASE_URL` + `ORQ_IMG_ALT_API_KEY`, `configurado()` devuelve false y el cliente lo
// salta como si no existiera. Dejar el camino hecho sin fabricar una dependencia que el dueño no
// contrató es distinto de inventar un secreto.

const env = (k, d = null) => {
  const v = process.env[k]
  return v && String(v).trim() ? String(v).trim() : d
}

/** Aspecto → tamaño en píxeles. El dialecto pide `size`, no relación: la traducción vive acá para
 *  que el motor siga hablando de 16:9 y no de 1792×1024. PURA. */
export function tamañoDe(aspecto) {
  return {
    '1:1': '1024x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '4:3': '1024x768',
    '3:4': '768x1024',
  }[String(aspecto)] || '1024x1024'
}

export const imagenCompatible = {
  nombre: env('ORQ_IMG_ALT_NOMBRE', 'imagenes-compatible'),

  configurado() {
    return Boolean(env('ORQ_IMG_ALT_BASE_URL') && env('ORQ_IMG_ALT_API_KEY'))
  },

  modelo() {
    return env('ORQ_IMG_ALT_MODELO') || 'gpt-image-1'
  },

  async generar({ prompt, aspecto = '1:1', cantidad = 1, modelo = imagenCompatible.modelo(), fetchImpl = globalThis.fetch, señal } = {}) {
    const base = env('ORQ_IMG_ALT_BASE_URL')
    const clave = env('ORQ_IMG_ALT_API_KEY')
    if (!base || !clave) {
      const err = new Error(`${imagenCompatible.nombre}: sin credencial`)
      err.status = 401
      err.falta = 'credencial'
      throw err
    }
    const res = await fetchImpl(`${base.replace(/\/$/, '')}/images/generations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        prompt: String(prompt).slice(0, 3800),
        n: Math.max(1, Math.min(4, cantidad)),
        size: tamañoDe(aspecto),
        response_format: 'b64_json',
      }),
      signal: señal,
    })
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '')
      const err = new Error(`${imagenCompatible.nombre} ${res.status}: ${cuerpo.slice(0, 240)}`)
      err.status = res.status
      err.cuerpo = cuerpo.slice(0, 400)
      throw err
    }
    const json = await res.json()
    const imagenes = (json?.data ?? [])
      .map((d) => ({ base64: d?.b64_json ?? null, mime: 'image/png' }))
      .filter((i) => i.base64)
    if (!imagenes.length) {
      const err = new Error(`${imagenCompatible.nombre}: respondió sin imágenes`)
      err.status = 200
      err.falta = 'contenido_bloqueado'
      throw err
    }
    return { imagenes, modelo, proveedor: imagenCompatible.nombre }
  },
}
