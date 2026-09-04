// LOS DATOS DE UN DOCUMENTO, CON EL LUGAR DONDE SE LEYERON. NÚCLEO PURO.
//
// ═══ POR QUÉ CADA CAMPO ARRASTRA SU PROCEDENCIA ═══
//
// Un total extraído sin página ni posición no es un dato: es una afirmación del OS sobre un papel
// que nadie volvió a mirar. Cuando el sistema diga «esta factura son $1.234.567», tiene que poder
// contestar «página 1, a la derecha del renglón que dice Importe Total» — porque el día que el
// número esté mal, ésa es la única forma de saber si se equivocó el extractor o el documento.
//
// Es la misma regla que gobierna todo el OS: HECHO · DATO REAL · CÁLCULO · INFERENCIA. Un campo
// extraído es DATO REAL sólo mientras pueda señalar de dónde salió.
//
// ═══ LOS NÚMEROS ARGENTINOS SE LEEN AL REVÉS QUE LOS DE JAVASCRIPT ═══
//
// «1.234.567,89» tiene el punto de miles y la coma decimal. `Number()` sobre eso da NaN, y
// `parseFloat` da 1,234 — que es peor, porque es un número plausible. Un importe leído mal no
// explota: se guarda, se suma y sale en un cuadro.

/** Un CUIT/CUIL argentino en cualquiera de sus escrituras. */
const RE_CUIT = /\b(\d{2})[-\s.]?(\d{8})[-\s.]?(\d)\b/g
/** dd/mm/aaaa y dd/mm/aa, con barras o guiones. */
const RE_FECHA = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g
/** Un importe con formato argentino: miles con punto, decimales con coma. */
const RE_IMPORTE = /(?:\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})/g
/** El período de una liquidación: «PRIMERA QUINCENA 07/2022», «Período: JULIO 2022», «05/2026». */
const RE_PERIODO = /(?:PRIMERA|SEGUNDA|1RA\.?|2DA\.?)\s+QUINCENA\s+(\d{2})\/(\d{4})|Per[íi]odo:?\s*([A-ZÁÉÍÓÚ]+)\s+(\d{4})/i
/** Punto de venta y número de un comprobante fiscal. */
const RE_COMPROBANTE = /\b(\d{4,5})\s*-\s*(\d{7,8})\b/

/** Un importe argentino a número. Devuelve null si no se puede leer — nunca 0, que es un importe. */
export function aNumero(txt) {
  if (txt == null) return null
  const s = String(txt).replace(/[$\s]/g, '')
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(s)) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Una fecha dd/mm/aaaa a ISO. El año de dos dígitos se resuelve al siglo XXI: en este archivo no
 *  hay documentos de 1926, y «26» significa 2026 en todas las planillas de la empresa. */
export function aFecha(d, m, a) {
  const dd = Number(d), mm = Number(m)
  let aa = Number(a)
  if (aa < 100) aa += 2000
  if (!(dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && aa >= 2000 && aa <= 2100)) return null
  return `${aa}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** El dígito verificador de un CUIT. Se calcula para PUNTUAR, no para descartar: en un OCR o en un
 *  PDF con ligaduras raras, un dígito cambiado no significa que no sea un CUIT. */
export function cuitValido(c) {
  const d = String(c).replace(/\D/g, '')
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const resto = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  return dv === Number(d[10])
}

/**
 * Extrae los campos de un documento ya leído.
 *
 * @param {{paginas:Array<{pagina:number, texto:string, bloques:Array}>}} doc lo que devuelve `leerDocumento`
 * @param {{tipo?:string|null, cuitPropio?:string}} opts
 * @returns {{campos:object, evidencia:object}}
 */
export function extraerCampos(doc, { tipo = null, cuitPropio = '30716304643' } = {}) {
  const campos = {}
  const evidencia = {}

  /** Guarda un campo CON su procedencia. Si ya estaba, no lo pisa: gana la primera aparición, que en
   *  un formulario es la de la cabecera — la de abajo suele ser una repetición del pie. */
  const poner = (nombre, valor, pagina, texto) => {
    if (valor == null || campos[nombre] !== undefined) return
    campos[nombre] = valor
    evidencia[nombre] = { pagina, texto: String(texto).slice(0, 80), metodo: 'regex' }
  }

  const cuits = []
  const fechas = []
  const importes = []

  for (const p of doc?.paginas ?? []) {
    const t = p.texto ?? ''

    for (const m of t.matchAll(RE_CUIT)) {
      const c = `${m[1]}${m[2]}${m[3]}`
      cuits.push({ cuit: c, pagina: p.pagina, texto: m[0], valido: cuitValido(c) })
    }
    for (const m of t.matchAll(RE_FECHA)) {
      const f = aFecha(m[1], m[2], m[3])
      if (f) fechas.push({ fecha: f, pagina: p.pagina, texto: m[0] })
    }
    for (const m of t.matchAll(RE_IMPORTE)) {
      const n = aNumero(m[1])
      if (n != null) importes.push({ importe: n, pagina: p.pagina, texto: m[0] })
    }
    const comp = t.match(RE_COMPROBANTE)
    if (comp) poner('comprobante', `${comp[1]}-${comp[2]}`, p.pagina, comp[0])
    const per = t.match(RE_PERIODO)
    if (per) poner('periodo', per[1] ? `${per[2]}-${per[1]}` : `${per[4]} ${per[3]}`, p.pagina, per[0])
  }

  // ── EL CUIT: SE SEPARAN EL PROPIO Y EL DE LA OTRA PARTE ──
  // Casi todo documento de la empresa lleva el CUIT de Echegaray. Tomar «el primer CUIT» daría
  // siempre el propio y jamás el del proveedor, que es el único que sirve para cruzar.
  const propio = String(cuitPropio).replace(/\D/g, '')
  const ajenos = cuits.filter((c) => c.cuit !== propio)
  const validosAjenos = ajenos.filter((c) => c.valido)
  const elegido = validosAjenos[0] ?? ajenos[0] ?? null
  if (elegido) poner('cuit', elegido.cuit, elegido.pagina, elegido.texto)
  if (cuits.some((c) => c.cuit === propio)) campos.esDeLaEmpresa = true

  // ── LA FECHA: la más temprana de las plausibles ──
  // En un recibo conviven la fecha de ingreso del empleado y la del período. La de ingreso puede ser
  // de hace diez años; se toma la PRIMERA que aparece, que en estos formularios es la de cabecera.
  if (fechas.length) poner('fecha', fechas[0].fecha, fechas[0].pagina, fechas[0].texto)

  // ── EL TOTAL: el importe MÁS GRANDE, y se declara que es una inferencia ──
  // No hay una etiqueta confiable: cada emisor rotula distinto («TOTAL», «Importe Total», «NETO A
  // PAGAR»). El mayor es correcto en un comprobante y NO lo es siempre; por eso va con su método
  // dicho, y el que lo consuma decide si le alcanza.
  if (importes.length) {
    const may = importes.reduce((a, b) => (b.importe > a.importe ? b : a))
    campos.total = may.importe
    evidencia.total = { pagina: may.pagina, texto: may.texto, metodo: 'mayor-importe-de-la-pagina' }
  }

  return {
    campos,
    evidencia,
    // Lo crudo queda disponible: un consumidor que sepa más del tipo documental puede elegir mejor
    // que esta heurística general, y no tiene por qué volver a parsear el documento para hacerlo.
    crudo: { cuits, fechas, importes: importes.slice(0, 50) },
    tipo,
  }
}
