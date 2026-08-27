// PROVEEDOR PRINCIPAL: GOOGLE VERTEX AI (Imagen).
//
// ═══ POR QUÉ ÉSTE Y NO OTRO ═══
//
// La única credencial de IA que la empresa tiene contratada es `ANTHROPIC_API_KEY`, y Claude no
// genera imágenes. No hay clave de OpenAI, Stability ni Replicate, y fabricar una dependencia que
// el dueño no contrató sería inventar un secreto.
//
// Vertex es la única vía que NO necesita una credencial nueva: el service account de Google ya
// existe, ya funciona y ya se usa para Drive, Sheets y Slides. Lo único que cambia es el SCOPE
// (`cloud-platform` en vez de `drive`) y que la API esté habilitada en el proyecto.
//
// ═══ LO QUE SE PROBÓ DE VERDAD (27/08/2026) ═══
//
// Contra la API real, con la key del SA de la VM (`/home/jorge/.config/echegaray-orq/google-sa.json`):
//
//   · el token con scope `cloud-platform` se emite OK (1024 caracteres) → la identidad alcanza;
//   · los tres modelos —`imagen-3.0-generate-002`, `imagen-3.0-fast-generate-001`,
//     `imagegeneration@006`— devuelven el MISMO 403:
//       "Agent Platform API has not been used in project echegaray-business-os before or it is
//        disabled … reason: SERVICE_DISABLED"
//
// O sea: no falta una credencial, falta HABILITAR `aiplatform.googleapis.com` en el proyecto
// `echegaray-business-os` (y que el proyecto tenga facturación). Eso lo hace una persona en la
// consola de Google Cloud, una vez. Por eso el adapter queda escrito y probado hasta el borde: el
// día que se habilite, no hay que escribir código — hay que correrlo.
//
// El 403 SERVICE_DISABLED se traduce a un mensaje que dice exactamente eso, con la URL de la
// consola: un error que no nombra la acción que lo destraba obliga a investigar de nuevo cada vez.

const env = (k, d = null) => {
  const v = process.env[k]
  return v && String(v).trim() ? String(v).trim() : d
}

export const SCOPE_VERTEX = 'https://www.googleapis.com/auth/cloud-platform'

/** Región y modelo son configuración, no una decisión escondida en el código. */
export const REGION_POR_DEFECTO = 'us-central1'
export const MODELO_POR_DEFECTO = 'imagen-3.0-generate-002'

/** El proyecto sale del env o del `project_id` del propio key del service account. */
export function proyectoDe({ config = {}, credencial = null } = {}) {
  return env('ORQ_VERTEX_PROJECT') || config?.ORQ_VERTEX_PROJECT || credencial?.project_id || null
}

/** `16:9` → el `aspectRatio` que Vertex entiende. Los cinco que soporta son los cinco del
 *  contrato; cualquier otro cae en 1:1 antes que fallar la generación entera. PURA. */
export function aspectoVertex(aspecto) {
  return ['1:1', '9:16', '16:9', '3:4', '4:3'].includes(String(aspecto)) ? String(aspecto) : '1:1'
}

/**
 * Traduce el error de Vertex a algo accionable. El caso que importa es SERVICE_DISABLED: sin esta
 * traducción, «403 PERMISSION_DENIED» manda a revisar permisos del SA —que están bien— en vez de
 * habilitar la API. PURA.
 */
export function traducirError(status, cuerpo) {
  const t = String(cuerpo ?? '')
  if (status === 403 && /SERVICE_DISABLED|has not been used in project|is disabled/i.test(t)) {
    const proyecto = /project ([\w-]+)/i.exec(t)?.[1] ?? '(el proyecto del service account)'
    return {
      falta: 'habilitar_api',
      mensaje: `Vertex AI no está habilitado en el proyecto de Google Cloud «${proyecto}». `
        + 'No falta ninguna credencial: el service account ya existe y su token se emite bien. '
        + `Hay que habilitar aiplatform.googleapis.com en https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=${proyecto} `
        + 'y que el proyecto tenga facturación activa. Es una acción única, de una persona, en la consola.',
    }
  }
  if (status === 403) {
    return {
      falta: 'permiso_vertex',
      mensaje: 'Vertex AI está habilitado pero el service account no tiene permiso para predecir. '
        + 'Hay que darle el rol «Vertex AI User» (roles/aiplatform.user) al service account del OS en el proyecto.',
    }
  }
  if (status === 404) {
    return { falta: 'modelo', mensaje: 'El modelo de imagen pedido no existe en esa región. Revisar ORQ_VERTEX_MODELO_IMAGEN y ORQ_VERTEX_REGION.' }
  }
  if (status === 401) return { falta: 'credencial', mensaje: 'El token del service account de Google no se pudo emitir o venció.' }
  return { falta: null, mensaje: `Vertex ${status}: ${t.slice(0, 240)}` }
}

export const vertexImagen = {
  nombre: 'vertex-imagen',

  /**
   * ¿Se puede intentar? Basta con que exista la credencial de Google y se conozca el proyecto: NO
   * se chequea acá si la API está habilitada, porque eso sólo lo sabe la API. Declararlo «no
   * configurado» por una corazonada escondería el 403 que dice qué hacer.
   */
  configurado({ credencial = null, config = {} } = {}) {
    return Boolean(credencial && proyectoDe({ config, credencial }))
  },

  modelo() {
    return env('ORQ_VERTEX_MODELO_IMAGEN') || MODELO_POR_DEFECTO
  },

  /**
   * @param token   access token con scope cloud-platform (lo emite quien llama: este adapter no
   *                lee credenciales del disco — así se testea sin secretos).
   * @returns {{imagenes: Array<{base64:string, mime:string}>, modelo:string, proveedor:string}}
   * @throws  Error con `.falta` y `.status` puestos.
   */
  async generar({
    prompt, negativo = null, aspecto = '1:1', proyecto, token, cantidad = 1,
    region = env('ORQ_VERTEX_REGION') || REGION_POR_DEFECTO,
    modelo = vertexImagen.modelo(),
    fetchImpl = globalThis.fetch,
    señal,
  } = {}) {
    if (!proyecto) { const e = new Error('vertex-imagen: no se conoce el proyecto de Google Cloud'); e.falta = 'proyecto'; throw e }
    if (!token) { const e = new Error('vertex-imagen: sin token de Google'); e.status = 401; e.falta = 'credencial'; throw e }

    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(proyecto)}`
      + `/locations/${region}/publishers/google/models/${encodeURIComponent(modelo)}:predict`
    const parameters = { sampleCount: Math.max(1, Math.min(4, cantidad)), aspectRatio: aspectoVertex(aspecto) }
    if (negativo) parameters.negativePrompt = String(negativo).slice(0, 900)

    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt: String(prompt).slice(0, 3800) }], parameters }),
      signal: señal,
    })
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '')
      const t = traducirError(res.status, cuerpo)
      const err = new Error(t.mensaje)
      err.status = res.status
      err.falta = t.falta
      err.cuerpo = cuerpo.slice(0, 400)
      throw err
    }
    const json = await res.json()
    const imagenes = (json?.predictions ?? [])
      .map((p) => ({ base64: p?.bytesBase64Encoded ?? null, mime: p?.mimeType || 'image/png' }))
      .filter((i) => i.base64)
    if (!imagenes.length) {
      // Vertex responde 200 con `predictions: []` cuando su filtro de seguridad bloquea el prompt.
      // Un 200 vacío tratado como éxito devolvería «listo» sin imagen: eso es peor que un error.
      const err = new Error('Vertex respondió sin imágenes: el prompt fue bloqueado por su filtro de contenido o no produjo resultado.')
      err.status = 200
      err.falta = 'contenido_bloqueado'
      throw err
    }
    return { imagenes, modelo, proveedor: vertexImagen.nombre }
  },
}
