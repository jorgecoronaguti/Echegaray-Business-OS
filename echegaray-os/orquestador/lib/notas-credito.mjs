// QUÉ HACE CADA NOTA DE CRÉDITO — ¿el costo desapareció, o sólo cambió de factura?
//
// POR QUÉ EXISTE (21/07). Saber que una nota de crédito RESTA (lib/comprobante-arca.mjs) arregla la
// aritmética pero no contesta la pregunta de negocio, que es distinta y más importante:
//
//   · DEVOLUCIÓN     → se anuló la compra. El costo de la obra baja de verdad.
//   · REFACTURACIÓN  → se anuló la factura y se emitió otra. El costo NO baja: cambia de número,
//                      de fecha y muchas veces de MES.
//
// Son dos cosas opuestas y el libro de IVA no las distingue: las dos son "tipo 3". La diferencia se
// ve cruzando la nota contra las facturas del MISMO CUIT por el MISMO importe.
//
// ═══ EL CASO QUE LO JUSTIFICA, MEDIDO ═══
//
// ACEROLATINA: la NC 17-6948 del 22/05 anula exacto la factura 7-21385 del 07/04 ($9.823.178), y el
// mismo día emiten la 17-10223 por $9.823.175. FRIOLATINA hace lo mismo con $9.272.821. Son
// refacturaciones: $19.095.999 de costo que sigue existiendo.
//
// Y la consecuencia cara: **Compras tiene cargadas las facturas de ABRIL, que son las anuladas**
// (filas 274 y 276). El importe está bien, pero el comprobante fiscal ya no existe y el costo quedó
// imputado a un mes que no corresponde. Nadie lo veía porque el total cerraba.
//
// ═══ LO QUE ESTA LIB NO HACE ═══
//
// No afirma que una nota "es" una devolución. Empareja por CUIT + importe y devuelve la evidencia
// para que alguien decida. Una nota de crédito PARCIAL (un descuento, una bonificación) no anula
// ninguna factura por su importe exacto y va a aparecer como "sin factura que anule" — que es
// verdad, no un error. Por eso el resultado se llama `clase` y una de las clases es "revisar".

import { esNotaDeCredito } from './comprobante-arca.mjs'

// TOLERANCIAS — y por qué una es ABSOLUTA y la otra RELATIVA.
//
// La primera versión usaba 0,1% para la anulación. Sobre una factura de $9,8M eso son $9.823 de
// margen, y se tragaba la factura de REEMPLAZO (que difería en $3): toda refacturación quedaba
// clasificada como devolución. Lo detectó el test antes de que llegara al Sheet.
//
// La distinción real no es de escala: una anulación es EXACTA —el mismo importe, al peso— y una
// refacturación es "parecida pero no igual". Por eso la anulación va con tolerancia absoluta de $1
// (los casos reales dan diferencia 0) y la refacturación con un 2% relativo, que es el reajuste de
// precio que suele traer: ACEROLATINA refacturó $3 menos, FRIOLATINA $14 menos.
export const TOL_ANULA_PESOS = 1  // absoluta: "es el mismo importe"
export const TOL_REFACTURA = 0.02 // 2% relativo: "casi el mismo importe, reajustado"

/**
 * NÚCLEO PURO: qué hace cada nota de crédito de una lista de comprobantes.
 *
 * @param {Array<{tipo_comprobante, emisor_cuit, punto_venta, numero, fecha_emision, imp_total}>} comprobantes
 * @returns {Array<{nota, anula, refactura, clase, monto}>}
 *   clase: 'refacturacion' | 'devolucion' | 'revisar'
 */
export function analizar(comprobantes = []) {
  const facturas = comprobantes.filter((c) => !esNotaDeCredito(c.tipo_comprobante))
  const notas = comprobantes.filter((c) => esNotaDeCredito(c.tipo_comprobante))
  const fecha = (c) => isoDe(c?.fecha_emision)

  return notas.map((n) => {
    const monto = Number(n.imp_total) || 0
    const delMismo = facturas.filter((f) => f.emisor_cuit && f.emisor_cuit === n.emisor_cuit)
    const dif = (f) => Math.abs(Number(f.imp_total) - monto)

    // La factura que la nota anula: mismo importe AL PESO, emitida ANTES o el mismo día.
    const anula = delMismo.filter((f) => fecha(f) <= fecha(n) && dif(f) <= TOL_ANULA_PESOS)
    // La factura que la reemplaza: importe parecido, emitida DESPUÉS o el mismo día, y que NO sea
    // la misma que se anuló (si no, toda anulación parecería refacturarse a sí misma).
    const anuladas = new Set(anula.map(clave))
    const refactura = delMismo.filter((f) =>
      fecha(f) >= fecha(n) && dif(f) <= monto * TOL_REFACTURA && !anuladas.has(clave(f)))

    let clase = 'revisar'
    if (refactura.length) clase = 'refacturacion'
    else if (anula.length) clase = 'devolucion'

    return { nota: n, anula, refactura, clase, monto }
  })
}

/**
 * NÚCLEO PURO: la fecha como 'YYYY-MM-DD', venga como venga.
 *
 * POR QUÉ NO ALCANZA CON String(x).slice(0,10) — y esto ya rompió una vez. El driver de Postgres
 * devuelve una columna `date` como objeto Date, y `String(new Date(...)).slice(0,10)` da
 * "Tue Apr 07": comparar dos de esos ordena por el nombre del día de la semana. En la prueba
 * suelta la consulta traía `fecha_emision::text` y andaba; en el script real venía como Date y
 * ACEROLATINA dejó de encontrar la factura que anula. El mismo código, dos resultados, según cómo
 * se hizo el select.
 */
export function isoDe(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? '' : v.toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  // 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm:ss' ya vienen ordenables.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10)
}

/** La llave de un comprobante: punto de venta + número. */
export function clave(c) {
  return `${String(c?.punto_venta ?? '').trim()}-${String(c?.numero ?? '').trim()}`
}

/**
 * NÚCLEO PURO: el resumen que importa para decidir.
 * `costoQueSigue` es plata que alguien podría estar dando por ahorrada y no lo está.
 */
export function resumen(analisis = []) {
  const por = (c) => analisis.filter((a) => a.clase === c)
  const suma = (l) => l.reduce((s, a) => s + a.monto, 0)
  return {
    total: analisis.length,
    monto: suma(analisis),
    refacturaciones: por('refacturacion').length,
    costoQueSigue: suma(por('refacturacion')),
    devoluciones: por('devolucion').length,
    costoQueBaja: suma(por('devolucion')),
    aRevisar: por('revisar').length,
    montoARevisar: suma(por('revisar')),
  }
}

/**
 * NÚCLEO PURO: las refacturaciones donde lo que está cargado en Compras es la factura VIEJA.
 * Es el hallazgo caro: el importe cierra, pero el comprobante fue anulado y el costo quedó en otro
 * mes. Un control que sólo suma no lo puede ver.
 *
 * @param {Array} analisis salida de analizar()
 * @param {Set<string>} enCompras claves normalizadas de los comprobantes cargados
 * @param {(c:any)=>string} norm normalizador de claves (el mismo que usa el resto del OS)
 */
export function facturasAnuladasCargadas(analisis = [], enCompras = new Set(), norm = clave) {
  const out = []
  for (const a of analisis) {
    if (a.clase !== 'refacturacion') continue
    for (const vieja of a.anula) {
      if (!enCompras.has(norm(vieja))) continue
      out.push({
        anulada: vieja,
        nota: a.nota,
        // Puede haber más de una candidata; se informan todas antes que elegir una por nosotros.
        reemplazos: a.refactura,
        monto: Number(vieja.imp_total) || 0,
      })
    }
  }
  return out
}
