// CÓMO SE NOMBRA UN COMPROBANTE QUE QUEDÓ AFUERA. NÚCLEO PURO, CERO MODELO Y CERO RED.
//
// ═══ EL DEFECTO (14/08, textual del dueño) ═══
//
// «por ejemplo ahora no se q comprobante quedo afuera porque no estoy revisando todo el tiempo, son
// muchos». El mensaje decía esto:
//
//     ⚠ 1 no entró: IMG_7574.HEIC (falta saber quién es el proveedor)
//
// `IMG_7574.HEIC` no es una identificación: es el número de serie que le puso el iPhone a un archivo
// que él nunca vio con ese nombre. Para saber cuál es, tiene que abrir el canal, buscar el adjunto,
// mirarlo y acordarse de qué papel era — que es EXACTAMENTE el trabajo que este flujo existe para no
// hacerle hacer. Un comprobante se identifica por lo que dice: quién lo emitió, cuánta plata es y de
// qué día.
//
// ═══ LA REGLA ═══
//
// **Se nombra con lo que se pudo leer, en orden de utilidad: proveedor · importe · fecha · número.**
// Cada dato que falta no rompe la identificación, la achica. Y el nombre del archivo va igual, al
// final y entre paréntesis: sirve para volver a la foto, no para saber cuál es.
//
// LA DIFERENCIA QUE IMPORTA, y por eso `hayDatos` es parte del contrato:
//
//   · «$47.320 del 11/08 — no pude leer el proveedor (IMG_7574.HEIC)» → él sabe cuál es y lo resuelve
//     desde el celular.
//   · «no pude leer ni el importe (IMG_7574.HEIC)» → él sabe que ese papel hay que fotografiarlo de
//     nuevo. Es otra acción, y por eso tiene que ser otra frase.
//
// NUNCA INVENTA. Si el papel no dijo el proveedor, la frase no lo nombra: lo dice el hueco. Rellenar
// con «(proveedor desconocido)» sería ruido; rellenar con un nombre parecido sería fabricar el dato.

/** $ en es-AR sin centavos: es para reconocer un comprobante, no para cuadrar un asiento. */
export function plataCorta(n) {
  const v = typeof n === 'number' ? n : (n == null || n === '' ? null : Number(n))
  if (v == null || !Number.isFinite(v)) return null
  return `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('es-AR')}`
}

/** DD/MM/AAAA → DD/MM. El año sobra para reconocer un comprobante de esta semana. */
export function fechaCorta(v) {
  const m = String(v ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[1]}/${m[2]}` : null
}

/**
 * El comprobante nombrado por su CONTENIDO.
 *
 * @param {object} item        el ítem del fajo (o `{comprobante}`)
 * @returns {{texto:string|null, hayDatos:boolean, hayPlata:boolean}}
 *   `texto` null = no se leyó NADA con qué nombrarlo. Quien lo muestra tiene que decir otra cosa.
 */
export function identificar(item = {}) {
  const c = item?.comprobante ?? item ?? {}
  const partes = []
  const proveedor = String(c.proveedor ?? '').trim()
  // ═══ EL NOMBRE QUE NO ENTRÓ AL DESPLEGABLE SIGUE SIENDO EL DEL PAPEL ═══
  //
  // Cuando el proveedor no está en la lista estricta, la celda de Compras queda vacía a propósito
  // (una celda en rojo rompe los cruces). Pero para RECONOCER el comprobante ese nombre es el mejor
  // dato que hay: es lo que el dueño lee en el membrete. Se usa el leído si el resuelto no está.
  const nombre = proveedor || String(c.proveedorLeido ?? '').trim()
  if (nombre) partes.push(nombre)
  const plata = plataCorta(c.total)
  if (plata) partes.push(plata)
  const f = fechaCorta(c.fecha)
  if (f) partes.push(`del ${f}`)
  if (c.numero) partes.push(String(c.numero))
  return {
    texto: partes.length ? partes.join(' ') : null,
    hayDatos: partes.length > 0,
    // El importe es el dato que decide si el papel se puede reconocer de memoria. Sin él, casi
    // siempre hay que volver a sacar la foto.
    hayPlata: plata != null,
  }
}

/**
 * La línea de un adjunto que NO terminó cargado: identificación · motivo · archivo.
 *
 * El archivo va SIEMPRE y va ÚLTIMO: es la referencia para volver a la foto cuando la identificación
 * no alcanza, no la identificación misma.
 *
 * @param {{item?:object, nombre?:string|null, motivo?:string|null, sinLectura?:boolean}} o
 */
export function renglonDeAdjunto({ item = null, nombre = null, motivo = null, sinLectura = false } = {}) {
  const id = sinLectura ? { texto: null, hayDatos: false } : identificar(item ?? {})
  const archivo = nombre ? ` (\`${nombre}\`)` : ''
  const porque = motivo ? ` — ${motivo}` : ''
  if (id.hayDatos) return `· ${id.texto}${porque}${archivo}`
  // SIN UN SOLO DATO NO SE FINGE UNA IDENTIFICACIÓN. Se dice que no se leyó nada, que es la
  // información que le falta al dueño para saber que ese papel hay que volver a fotografiarlo.
  return `· no pude leer ni el importe${porque && motivo !== 'no pude leerlo' ? porque : ''}${archivo}`
}
