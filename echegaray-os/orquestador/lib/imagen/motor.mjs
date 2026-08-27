// EL PIPELINE COMPLETO: pedido → contexto ECSAS → objetivo → prompt visual → proveedor → imagen →
// QA → Drive → resultado.
//
// ═══ LA DECISIÓN QUE ORDENA TODO EL ARCHIVO ═══
//
// Cada etapa produce evidencia y ninguna afirma el éxito de la siguiente. La generación devuelve
// bytes, no «listo»; el QA los mide en vez de confiar en el 200; la publicación para Slides se
// VERIFICA bajando la URL sin credenciales, que es exactamente lo que va a hacer Google. Si no se
// pudo verificar, `imagen_url` sale en null con el motivo — nunca una URL que «debería andar».
//
// ═══ LA REGLA QUE GOBIERNA LA SALIDA ═══
//
// Todo resultado pasa por `sellarProcedencia` y por `forzarNoEvidencia`. No hay una rama que
// devuelva una imagen sin sello, y no la puede haber: `resultadoDe` es la única constructora.

import { aspectoDe, marcaDe } from './contrato.mjs'
import { generarImagen } from './cliente.mjs'
import { construirPrompt } from './prompt.mjs'
import { forzarNoEvidencia, sellarProcedencia } from './procedencia.mjs'
import { revisar } from './qa.mjs'

/** Nombre del archivo en Drive. Lleva el tipo y la fecha adelante para que la carpeta se ordene
 *  sola, y dice GENERADA en el propio nombre: el nombre sobrevive a que el JSON se pierda. PURA. */
export function nombreDeArchivo({ tipo, contexto = {}, ahora = new Date() } = {}) {
  const f = ahora.toISOString().slice(0, 10)
  const quien = [contexto?.obra, contexto?.cliente].filter(Boolean).join(' - ').slice(0, 60)
  return `GENERADA ${f} ${tipo}${quien ? ` - ${quien}` : ''}.png`.replace(/[\\/:*?"<>|]/g, '-')
}

/** Extensión coherente con el mime REAL medido por el QA, no con el que declaró el proveedor. PURA. */
export function extensionDe(mime) {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[mime] || 'png'
}

/**
 * ¿La URL publicada sirve DE VERDAD para Google Slides? Se baja SIN credenciales, que es como la
 * va a bajar `createImage`. Devuelve la primera que responda con un content-type de imagen.
 *
 * Sin esto sólo se podría afirmar que la publicación «debería» funcionar, y una lámina con la
 * imagen faltante no avisa: el motor de Slides manda las imágenes en un lote aparte justamente
 * porque una URL que Google no puede bajar tiraría todo el batch.
 */
export async function verificarUrlPublica(urls, { fetchImpl = globalThis.fetch, señal } = {}) {
  for (const url of urls.filter(Boolean)) {
    try {
      const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: señal })
      const tipo = res.headers?.get?.('content-type') ?? ''
      if (res.ok && /^image\//i.test(tipo)) return { url, verificada: true, content_type: tipo }
    } catch { /* la siguiente */ }
  }
  return { url: null, verificada: false, content_type: null }
}

/** LA ÚNICA CONSTRUCTORA DE RESULTADO. Todo lo que sale del motor pasa por acá y por lo tanto
 *  lleva sello de procedencia, incluidos los errores. PURA. */
export function resultadoDe(base, { pedido, proveedor = null, modelo = null } = {}) {
  return forzarNoEvidencia({
    ...base,
    procedencia_sello: sellarProcedencia({
      tipo: pedido?.tipo,
      procedenciaPedida: pedido?.procedencia ?? pedido?.clasificacion ?? null,
      textoDelPedido: `${pedido?.pedido ?? ''} ${pedido?.objetivo ?? ''}`,
      proveedor, modelo,
    }),
  })
}

/**
 * GENERA, GUARDA Y DEVUELVE. `pedido` ya validado por `contrato.validarPedido`.
 *
 * @param google cliente de `lib/google.mjs` (o `null`: se genera igual y se devuelve el base64 sin
 *               guardar — así el circuito se puede probar sin tocar el Drive real).
 */
export async function producirImagen(google, pedido, {
  config = {}, fetchImpl = globalThis.fetch, señal, ahora = new Date(), generar = generarImagen,
} = {}) {
  const armado = construirPrompt(pedido)
  const correlationId = pedido?.correlation_id ?? null
  const comun = {
    tipo: pedido.tipo,
    objetivo: pedido.objetivo ?? null,
    prompt: armado.prompt,
    configuracion: { aspecto: armado.aspecto, marca: armado.marca, negativo: armado.negativo },
    entidad: {
      obra: pedido?.contexto?.obra ?? null,
      cliente: pedido?.contexto?.cliente ?? null,
      presupuesto_id: pedido?.contexto?.presupuesto_id ?? null,
      documento_id: pedido?.contexto?.documento_id ?? null,
    },
    contexto_usado: armado.contexto_usado,
    contexto_descartado: armado.contexto_descartado,
    // Si el contexto trae texto que intenta dar órdenes, sale marcado: quien lea el resultado tiene
    // que enterarse de que el documento del que salió ese nombre intentó manipular al OS.
    contexto_sospechoso: armado.contexto_sospechoso,
    fecha: ahora.toISOString(),
    correlation_id: correlationId,
  }

  const r = await generar({ prompt: armado.prompt, negativo: armado.negativo, aspecto: armado.aspecto, config, fetchImpl, señal })
  if (!r.ok) {
    return resultadoDe({ ok: false, falta: r.falta, motivo: r.motivo, que_hacer: r.que_hacer, intentos: r.intentos, ...comun }, { pedido })
  }

  const buffer = Buffer.from(r.base64, 'base64')
  const qa = revisar({ buffer, aspectoPedido: armado.aspecto })
  if (!qa.ok) {
    return resultadoDe(
      { ok: false, falta: 'imagen_invalida', motivo: qa.hallazgos.join('; '), que_hacer: 'El proveedor respondió pero lo que devolvió no es una imagen usable. Reintentar o revisar el modelo configurado.', control_de_calidad: qa, ...comun },
      { pedido, proveedor: r.proveedor, modelo: r.modelo },
    )
  }

  const base = {
    ok: true,
    proveedor: r.proveedor,
    modelo: r.modelo,
    fallback_de: r.fallbackDe ?? null,
    control_de_calidad: qa,
    bytes: buffer.length,
    mime: qa.formato,
    ms: r.ms,
    intento_de_ascenso_en_el_pedido: armado.intento,
    ...comun,
  }

  if (!google?.uploadFile) {
    // Sin Drive la imagen no se pierde: viaja en base64 y quien la pidió decide qué hacer. Se dice
    // que NO quedó guardada, en vez de devolver un link que no existe.
    return resultadoDe({ ...base, guardada: false, motivo_no_guardada: 'no hay cuenta de Google autorizada en este proceso', base64: r.base64, archivo: null, drive_url: null, imagen_url: null }, { pedido, proveedor: r.proveedor, modelo: r.modelo })
  }

  const nombre = nombreDeArchivo({ tipo: pedido.tipo, contexto: pedido.contexto ?? {}, ahora })
    .replace(/\.png$/, `.${extensionDe(qa.formato)}`)
  let subido = null
  try {
    subido = await google.uploadFile(nombre, r.base64, qa.formato, { parentId: pedido.carpeta_id || undefined })
  } catch (e) {
    return resultadoDe({ ...base, guardada: false, motivo_no_guardada: String(e?.message ?? e).slice(0, 240), base64: r.base64, archivo: null, drive_url: null, imagen_url: null }, { pedido, proveedor: r.proveedor, modelo: r.modelo })
  }

  const salida = {
    ...base,
    guardada: true,
    archivo: { id: subido.id, nombre },
    drive_url: subido.link,
    imagen_url: null,
    publicada: false,
  }

  if (pedido.publicar_para_slides && google.publicarLectura) {
    try {
      const pub = await google.publicarLectura(subido.id)
      const v = await verificarUrlPublica([pub.url_bytes, pub.url_alternativa], { fetchImpl, señal })
      salida.publicada = true
      salida.imagen_url = v.url
      salida.verificacion_url = v
      if (!v.verificada) salida.aviso_slides = 'El archivo quedó publicado pero ninguna de sus URLs devolvió bytes de imagen sin credenciales: Google Slides tampoco va a poder bajarla. No usar en una lámina.'
    } catch (e) {
      salida.aviso_slides = `no se pudo publicar para Slides: ${String(e?.message ?? e).slice(0, 200)}`
    }
  } else if (pedido.publicar_para_slides) {
    salida.aviso_slides = 'este cliente de Google no sabe publicar archivos; la imagen quedó en Drive pero no se puede insertar en una lámina'
  }

  return resultadoDe(salida, { pedido, proveedor: r.proveedor, modelo: r.modelo })
}

export { aspectoDe, marcaDe }
