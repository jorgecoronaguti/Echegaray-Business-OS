// EL GENERADOR QUE NO PIDE CREDENCIAL — el que hace que `generar_imagen` funcione HOY.
//
// ═══ POR QUÉ EXISTE, EN UNA LÍNEA ═══
//
// Los dos proveedores buenos están cerrados por una acción humana: Vertex necesita un rol de IAM que
// el service account del OS no se puede dar a sí mismo (probado el 27/08: puede habilitar APIs, no
// puede tocar la política del proyecto), y el `compatible` necesita una clave que nadie contrató.
// Sin este archivo, la capacidad queda escrita y sin funcionar — que para el que la pide es lo mismo
// que no tenerla.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// Es un servicio público de generación por HTTP: la imagen sale de pedir una URL, sin cuenta y sin
// clave. Eso lo hace utilizable hoy y también lo hace el ÚLTIMO de la fila: va después de Vertex y
// después del compatible, porque cuando haya un proveedor de verdad hay que usar ése.
//
// LO QUE HAY QUE SABER ANTES DE USARLO, y no está escondido en un README:
//
//   · LA CALIDAD ES MENOR. Medido el 27/08 contra el modelo que expone hoy (`sana`): compone bien
//     el encuadre y pierde detalle — sirve para una lámina de apoyo, no para una portada comercial.
//   · EL PROMPT SALE DE LA EMPRESA. Va a un tercero anónimo, sin contrato y sin borrado garantizado.
//     Por eso `generar_imagen` describe CONCEPTOS, nunca datos: ni importes, ni clientes, ni
//     domicilios de obra. Un prompt con un número adentro es una filtración chica y permanente.
//   · NO HAY SLA. Si no contesta, contesta el error; no hay a quién reclamarle.
//
// Se apaga con `ORQ_IMG_ABIERTO=off` y se apunta a otro host con `ORQ_IMG_ABIERTO_BASE_URL`.

const env = (k, d = null) => {
  const v = process.env[k]
  return v && String(v).trim() ? String(v).trim() : d
}

const BASE_POR_DEFECTO = 'https://image.pollinations.ai'

/** Aspecto → ancho y alto. Este dialecto pide píxeles, no relación. PURA. */
export function medidaDe(aspecto) {
  return {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '4:3': { width: 1152, height: 864 },
    '3:4': { width: 864, height: 1152 },
  }[String(aspecto)] || { width: 1024, height: 1024 }
}

/**
 * EL PROMPT QUE ESTE MODELO ENTIENDE — y por qué no es el que arma el motor.
 *
 * El motor produce un prompt estructurado y largo (SUJETO / PARA QUÉ / DIRECCIÓN DE ARTE / COLOR /
 * NEGATIVO), que es lo correcto para un modelo grande. Este proveedor expone uno chico, y medido el
 * 27/08 con el mismo pedido: con el prompt completo devolvió un holograma azul de una casa; con el
 * sujeto solo más una cola fotográfica en inglés, devolvió una escena de obra usable.
 *
 * Adaptar el prompt al modelo es trabajo DEL ADAPTER, no de la skill: quien pide sigue describiendo
 * en castellano llano y no se entera de qué proveedor le tocó. PURA.
 */
export function promptCorto(prompt) {
  const texto = String(prompt ?? '')
  // El motor rotula el sujeto; si el rótulo no está (otro caller, un test), se usa el texto entero.
  const sujeto = (texto.match(/SUJETO:\s*([^\n]+)/i)?.[1] ?? texto.split('\n')[0] ?? texto).trim()
  return `${sujeto.slice(0, 400)}. ${COLA_FOTOGRAFICA}`
}

/** La cola va en inglés a propósito: es el idioma en el que estos modelos aprendieron los términos
 *  fotográficos, y es lo único del prompt que no describe QUÉ se ve sino CÓMO se ve. */
const COLA_FOTOGRAFICA = 'documentary photograph, real construction site, realistic, natural daylight, sharp focus, 35mm, no text, no watermark'

/**
 * La URL del pedido. Separada y PURA porque es lo único que hay que revisar cuando la imagen sale
 * distinta de lo pedido: acá se ve el prompt exacto, la medida exacta y la semilla.
 */
export function urlDePedido({ prompt, aspecto = '16:9', semilla = null, base = env('ORQ_IMG_ABIERTO_BASE_URL', BASE_POR_DEFECTO) } = {}) {
  const { width, height } = medidaDe(aspecto)
  const q = new URLSearchParams({ width: String(width), height: String(height), nologo: 'true' })
  // La semilla hace el pedido REPRODUCIBLE: la misma lámina regenerada da la misma imagen, que es lo
  // que evita que una presentación cambie de aspecto cada vez que se rehace.
  if (semilla != null) q.set('seed', String(semilla))
  return `${base.replace(/\/+$/, '')}/prompt/${encodeURIComponent(String(prompt ?? '').trim())}?${q}`
}

/** Semilla determinística a partir del prompt: sin `Math.random`, misma entrada → misma imagen. PURA. */
export function semillaDe(prompt) {
  let h = 2166136261
  for (const ch of String(prompt ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) }
  return Math.abs(h) % 1_000_000
}

export const imagenAbierta = {
  nombre: 'imagenes-abierto',

  /** Encendido salvo que lo apaguen. Es el único proveedor que no necesita configuración: exigirle
   *  una variable para funcionar sería devolverle el problema al que lo tiene que usar. */
  configurado() {
    return String(env('ORQ_IMG_ABIERTO', 'on')).toLowerCase() !== 'off'
  },

  modelo() { return env('ORQ_IMG_ABIERTO_MODELO', 'sana') },

  async generar({ prompt, aspecto = '16:9', fetchImpl = globalThis.fetch, señal } = {}) {
    if (!String(prompt ?? '').trim()) {
      const err = new Error(`${imagenAbierta.nombre}: prompt vacío`)
      err.falta = 'prompt'
      throw err
    }
    const url = urlDePedido({ prompt: promptCorto(prompt), aspecto, semilla: semillaDe(prompt) })
    const res = await fetchImpl(url, { signal: señal })
    if (!res.ok) {
      const err = new Error(`${imagenAbierta.nombre}: HTTP ${res.status}`)
      err.status = res.status
      err.falta = res.status === 429 ? 'cuota' : 'proveedor'
      throw err
    }
    const mime = String(res.headers?.get?.('content-type') ?? 'image/jpeg').split(';')[0].trim()
    // Que conteste 200 no prueba que haya mandado una imagen: un servicio público puede devolver una
    // página de error con status 200. Se verifica el tipo Y que haya bytes.
    if (!mime.startsWith('image/')) {
      const err = new Error(`${imagenAbierta.nombre}: contestó ${mime}, no una imagen`)
      err.falta = 'proveedor'
      throw err
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length < 1024) {
      const err = new Error(`${imagenAbierta.nombre}: devolvió ${bytes.length} bytes — no es una imagen usable`)
      err.falta = 'proveedor'
      throw err
    }
    return {
      proveedor: imagenAbierta.nombre,
      modelo: imagenAbierta.modelo(),
      imagenes: [{ base64: bytes.toString('base64'), mime }],
    }
  },
}
