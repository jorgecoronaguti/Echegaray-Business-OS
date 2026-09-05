// VISIÓN: CLASIFICAR UNA IMAGEN SIN ENTRENAR NADA Y SIN LICENCIA CONTAMINANTE.
//
// ═══ POR QUÉ SigLIP Y NO UN DETECTOR DE EPP ═══
//
// El primer intento fue detección de casco y chaleco. Revisado el catálogo el 04/09/2026, TODO el
// ecosistema de EPP en Hugging Face corre sobre Ultralytics, que es AGPL-3.0: usarlo en el servidor
// que sirve la app obligaría a publicar la app entera bajo AGPL. Los pesos MIT no cambian eso,
// porque el runtime es el que contamina.
//
// SigLIP resuelve el mismo problema por otro camino y con Apache-2.0: en vez de detectar cajas,
// compara la imagen contra FRASES. «una persona con casco de seguridad» y «una persona sin casco»
// son dos frases, y el modelo dice cuál se parece más. No hay caja, hay una confianza — que es
// exactamente lo que el OS necesita, porque la salida nunca puede ser «incumplimiento»: es «posible
// ausencia de casco, revisar».
//
// ═══ Y LO PRIMERO QUE HACE FALTA EN ESTE CORPUS NO ES EPP ═══
//
// El Drive tiene 169 imágenes que el motor documental marca «necesita OCR» y deja sin tipo: son
// DNI escaneados, planos, diagramas y logos mezclados. Tiparlas es la capacidad que sirve HOY, y la
// misma llamada al mismo modelo contesta las dos preguntas — sólo cambian las frases.

/** El modelo. Revisión clavada: sin ella no se sabe qué corrió. */
export const MODELO = Object.freeze({
  id: 'Xenova/siglip-base-patch16-224',
  revision: '4649052661e53c7000355844105f8a1792088239',
  licencia: 'Apache-2.0 (base google/siglip-base-patch16-224)',
  dtype: 'q8', discoMb: 94,
  porQue: 'zero-shot con licencia permisiva y ONNX propio: contesta comparando la imagen contra frases, sin depender de Ultralytics ni de ningún runtime AGPL',
})

/**
 * LAS PREGUNTAS QUE EL OS SABE HACERLE A UNA IMAGEN.
 *
 * Cada juego es un conjunto CERRADO y MUTUAMENTE EXCLUYENTE de frases. Un zero-shot devuelve la
 * más parecida de las que se le dan: si falta la opción correcta, contesta la menos mala con
 * confianza alta. Por eso cada juego incluye una salida «ninguna de éstas».
 */
export const JUEGOS = Object.freeze({
  tipoDeImagen: {
    porQue: 'las 169 imágenes del Drive que el motor documental no puede leer',
    etiquetas: {
      dni: 'una foto o escaneo de un documento nacional de identidad argentino',
      plano: 'un plano técnico de arquitectura o ingeniería con líneas y cotas',
      diagrama: 'un diagrama, gráfico de barras o cronograma de proyecto',
      logo: 'un logotipo o isotipo de una empresa sobre fondo liso',
      comprobante: 'la foto de una factura, ticket o comprobante de papel',
      obra: 'una fotografía de una obra en construcción',
      firma: 'la foto de una firma manuscrita o de un formulario firmado',
      otra: 'otra cosa distinta de todas las anteriores',
    },
  },
  // LA PREGUNTA BINARIA Y EN DISTRIBUCIÓN. SigLIP se entrenó con fotos naturales y sus captions;
  // «un escaneo de un DNI argentino» está fuera de esa distribución y por eso la clasificación en
  // ocho tipos documentales midió 31,8%. Separar UNA FOTO de UN PAPEL sí es lo que el modelo sabe
  // hacer, y es la pregunta que de verdad hace falta: decide si una imagen va al control de EPP o
  // al motor documental.
  esFotografia: {
    porQue: 'la puerta: una foto de obra va a seguridad, un papel va al motor documental',
    etiquetas: {
      fotografia: 'a photograph of a real scene taken with a camera',
      documento: 'a scan or photo of a paper document, form or printed text',
      grafico: 'a computer generated graphic, logo, chart or technical drawing',
    },
  },

  seguridad: {
    porQue: 'primera capacidad de seguridad e higiene, sin detección y sin AGPL',
    etiquetas: {
      con_casco: 'una persona trabajando que lleva puesto un casco de seguridad',
      sin_casco: 'una persona trabajando con la cabeza descubierta, sin casco',
      sin_personas: 'una escena de obra sin ninguna persona visible',
      no_es_obra: 'una imagen que no es una obra en construcción',
    },
  },
})

// ═══ LOS PUNTAJES DE SigLIP NO SE LEEN COMO PROBABILIDADES ═══
//
// SigLIP se entrena con pérdida SIGMOIDE, no softmax: cada frase se puntúa por separado y los
// valores no suman uno ni se parecen a una probabilidad. Medido sobre las imágenes reales del
// Drive, la frase ganadora se lleva entre 0,000 y 0,81 — un logo evidente puntúa 0,01. Un umbral
// absoluto de 0,35 declaraba «no sé» en el 90% de los casos, incluidos los que acertaba.
//
// Es exactamente el error que ya se pagó con el coseno de los proveedores: un número que parece
// una probabilidad y no lo es. Lo que sí significa algo es la RELACIÓN entre la mejor y la segunda.
// Se decide por cociente, no por altura.

/** Cuántas veces tiene que ganarle la mejor a la segunda para que la respuesta valga. */
export const RAZON_MINIMA = 3
/**
 * Y un piso absoluto MUY bajo, sólo para descartar la imagen que no se parece a nada.
 *
 * ES CERO A PROPÓSITO, y llegar ahí costó tres mediciones. Con 0,35 rechazaba el 90%; con 0,005 el
 * 100%, incluidas respuestas que le ganaban a la segunda por 59 VECES; con 0,0002 seguía matando
 * razones de 45. Los puntajes sigmoide de SigLIP sobre texto fuera de su distribución bajan a 1e-5
 * sin que eso signifique «no sé»: la ALTURA no tiene escala, la RAZÓN sí. Es la misma lección que
 * el coseno 0,90 de los proveedores, y es la tercera vez que aparece en este proyecto.
 */
export const PISO_ABSOLUTO = 0

let _motor = null

export async function cargarVision() {
  if (_motor) return _motor
  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = new URL('../../datos/modelos/', import.meta.url).pathname
  const t0 = Date.now()
  const clasificar = await pipeline('zero-shot-image-classification', MODELO.id, { dtype: MODELO.dtype, device: 'cpu' })
  _motor = { clasificar, msCarga: Date.now() - t0, modelo: MODELO }
  return _motor
}

export async function soltarVision() {
  await _motor?.clasificar?.dispose?.().catch(() => {})
  _motor = null
}

/**
 * Clasifica una imagen contra un juego de frases.
 *
 * @param {string|Buffer} imagen ruta o bytes
 * @param {'tipoDeImagen'|'seguridad'} juego
 * @returns {{clase:string|null, confianza:number, margen:number, porQue:string, todas:Array}}
 */
export async function clasificarImagen(imagen, juego = 'tipoDeImagen', { motor = null } = {}) {
  const j = JUEGOS[juego]
  if (!j) throw new Error(`no hay un juego de etiquetas llamado «${juego}»`)
  const m = motor ?? await cargarVision()
  const claves = Object.keys(j.etiquetas)
  const frases = claves.map((k) => j.etiquetas[k])

  const t0 = Date.now()
  const { RawImage } = await import('@huggingface/transformers')
  // `drive_index.tipo = 'imagen'` incluye archivos .dwg, que son planos de CAD y no imágenes: sharp
  // revienta con «unsupported image format» y se lleva la corrida entera. El formato REAL se decide
  // por la firma de los bytes, que es lo que ya hace el motor documental.
  let img
  try {
    img = typeof imagen === 'string' ? await RawImage.read(imagen) : await RawImage.fromBlob(new Blob([imagen]))
  } catch (e) {
    return { clase: null, confianza: 0, razon: null, margen: 0, ms: Date.now() - t0, todas: [],
      modelo: MODELO.id, revision: MODELO.revision,
      porQue: `no es una imagen que se pueda abrir: ${String(e.message).slice(0, 60)}` }
  }
  const r = await m.clasificar(img, frases)
  const ms = Date.now() - t0

  const orden = r.map((x) => ({ clase: claves[frases.indexOf(x.label)], frase: x.label, p: x.score }))
    .sort((a, b) => b.p - a.p)
  const [mejor, segundo] = orden
  const margen = mejor.p - (segundo?.p ?? 0)

  // DOS FRASES DEMASIADO CERCA NO SE DESEMPATAN. Con «con casco» a 0,36 y «sin casco» a 0,34, decir
  // cualquiera de las dos es tirar una moneda con dos decimales — y una de las dos acusa a alguien.
  const razon = segundo?.p > 0 ? mejor.p / segundo.p : Infinity
  const base = { confianza: Number(mejor.p.toFixed(4)), razon: Number.isFinite(razon) ? Number(razon.toFixed(2)) : null,
    margen: Number(margen.toFixed(4)), ms, todas: orden.slice(0, 4), modelo: MODELO.id, revision: MODELO.revision }

  if (mejor.p < PISO_ABSOLUTO) {
    return { ...base, clase: null, porQue: `la imagen no se parece a ninguna de las descripciones (la mejor, «${mejor.clase}», ${mejor.p.toFixed(4)})` }
  }
  // DOS FRASES DEMASIADO CERCA NO SE DESEMPATAN. Con «con casco» y «sin casco» a la par, decir
  // cualquiera de las dos es tirar una moneda — y una de las dos acusa a alguien.
  if (razon < RAZON_MINIMA) {
    return { ...base, clase: null, porQue: `«${mejor.clase}» le gana a «${segundo.clase}» sólo ${razon.toFixed(1)} veces (hacen falta ${RAZON_MINIMA}): lo mira una persona` }
  }
  return { ...base, clase: mejor.clase, porQue: `se parece a «${mejor.frase}» ${razon.toFixed(1)} veces más que a la siguiente («${segundo.clase}»)` }
}

/** La frase que el OS le muestra a una persona sobre seguridad. NUNCA afirma un incumplimiento. */
export function avisoDeSeguridad(r) {
  if (!r?.clase) return { texto: 'No pude distinguirlo. Revisar.', accion: 'revisar' }
  if (r.clase === 'sin_casco') return { texto: 'Posible ausencia de casco — revisar.', accion: 'revisar' }
  if (r.clase === 'con_casco') return { texto: 'Se ve casco puesto.', accion: 'ninguna' }
  if (r.clase === 'sin_personas') return { texto: 'No se ven personas en la imagen.', accion: 'ninguna' }
  return { texto: 'La imagen no parece de obra.', accion: 'ninguna' }
}
