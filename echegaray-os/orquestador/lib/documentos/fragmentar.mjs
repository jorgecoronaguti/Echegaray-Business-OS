// PARTIR UN DOCUMENTO EN PEDAZOS BUSCABLES. NÚCLEO PURO.
//
// ═══ POR QUÉ NO SE INDEXA EL DOCUMENTO ENTERO ═══
//
// Una página de libro de sueldos son 10.000 caracteres con 30 empleados. Indexada entera, ese
// documento es la respuesta más parecida a CUALQUIER pregunta sobre sueldos — y no contesta
// ninguna, porque devolver «está en este PDF de 40 páginas» es lo mismo que no saber.
//
// ═══ POR QUÉ SE CORTA POR BLOQUE Y NO CADA N CARACTERES ═══
//
// PyMuPDF ya devuelve los bloques que el PDF tiene dibujados: un renglón de tabla, un párrafo, una
// celda. Cortar cada 500 caracteres parte un CUIT al medio y pega el final de un concepto con el
// principio de otro. Los bloques se AGRUPAN hasta llenar el tamaño buscado, respetando sus bordes.
//
// El solapamiento existe porque un dato puede caer justo en la costura: sin él, «Importe Total» y
// su número quedan en dos fragmentos y ninguno de los dos contesta la pregunta.

/** Cuánto texto entra en un fragmento. Ni tan chico que pierda contexto ni tan grande que deje de
 *  señalar un lugar. */
export const TAMANO = Number(process.env.ORQ_DOC_FRAGMENTO || 700)
export const SOLAPE = Number(process.env.ORQ_DOC_SOLAPE || 120)
/** Menos que esto no es un fragmento, es ruido: un número de página, un sello, una viñeta. */
export const MINIMO = 40

/**
 * @param {{paginas:Array<{pagina:number, bloques:Array<{bbox:number[], texto:string}>, texto:string}>}} doc
 * @returns {Array<{pagina:number, orden:number, texto:string, bbox:number[]|null, caracteres:number}>}
 */
export function fragmentar(doc, { tamano = TAMANO, solape = SOLAPE } = {}) {
  const out = []
  for (const p of doc?.paginas ?? []) {
    const bloques = (p.bloques ?? []).filter((b) => String(b.texto ?? '').trim())
    // Sin bloques (una imagen, o un PDF que no los expone) se cae al texto plano de la página: es
    // peor —no hay bbox— pero es MEJOR que no indexar el documento.
    const unidades = bloques.length
      ? bloques
      : (String(p.texto ?? '').match(new RegExp(`[\\s\\S]{1,${tamano}}`, 'g')) ?? []).map((t) => ({ texto: t, bbox: null }))

    let buffer = []
    let largo = 0
    let orden = 0
    const volcar = () => {
      const texto = buffer.map((b) => b.texto.trim()).join('\n').trim()
      if (texto.length >= MINIMO) {
        out.push({ pagina: p.pagina, orden, texto, bbox: unirBbox(buffer), caracteres: texto.length })
        orden += 1
      }
      // El solapamiento se lleva los ÚLTIMOS bloques, no los últimos caracteres: así el fragmento
      // siguiente arranca en un borde real y no a mitad de un número.
      const cola = []
      let acc = 0
      for (let i = buffer.length - 1; i >= 0 && acc < solape; i -= 1) { cola.unshift(buffer[i]); acc += buffer[i].texto.length }
      buffer = cola
      largo = acc
    }

    for (const b of unidades) {
      const t = String(b.texto).trim()
      if (!t) continue
      if (largo + t.length > tamano && buffer.length) volcar()
      buffer.push({ texto: t, bbox: b.bbox })
      largo += t.length
    }
    if (buffer.length) {
      const texto = buffer.map((b) => b.texto.trim()).join('\n').trim()
      if (texto.length >= MINIMO) out.push({ pagina: p.pagina, orden, texto, bbox: unirBbox(buffer), caracteres: texto.length })
    }
  }
  return out
}

/** El rectángulo que contiene a todos los bloques del fragmento. Null si ninguno traía geometría —
 *  y null significa «no sé dónde», no «arriba a la izquierda». */
function unirBbox(bloques) {
  const cajas = bloques.map((b) => b.bbox).filter((c) => Array.isArray(c) && c.length === 4)
  if (!cajas.length) return null
  return [
    Math.min(...cajas.map((c) => c[0])), Math.min(...cajas.map((c) => c[1])),
    Math.max(...cajas.map((c) => c[2])), Math.max(...cajas.map((c) => c[3])),
  ].map((v) => Number(v.toFixed(1)))
}
