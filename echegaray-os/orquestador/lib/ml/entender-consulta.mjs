// QUÉ ESTÁ PIDIENDO ESTA PREGUNTA, ANTES DE BUSCAR NADA. NÚCLEO PURO, SIN MODELO.
//
// ═══ POR QUÉ ESTO VA ANTES DE LOS EMBEDDINGS Y NO DESPUÉS ═══
//
// Medido el 04/09/2026 sobre 30 preguntas reales contra 2.500 fragmentos: el índice de palabras dio
// Top-1 0% y el mejor modelo de embeddings 6,7%. La conclusión fácil sería «hace falta un modelo
// más grande». Es falsa. Casi todas esas preguntas son «el volante de pago de octubre de 2023», y
// hay 47 volantes de pago que dicen exactamente lo mismo salvo por un campo: el período. Ningún
// modelo semántico puede distinguir octubre de noviembre en un documento que dice «2023-10» —
// porque no es un problema de significado, es una IGUALDAD.
//
// Un dato que tiene respuesta exacta se filtra, no se puntúa. Lo que el modelo tiene que resolver es
// lo que queda después: qué documento, entre los que YA cumplen el filtro, habla de lo que se
// preguntó. Ésa es la pregunta que un embedding contesta bien.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No adivina. Si la pregunta no nombra un período, no inventa uno: devuelve `null` y el filtro no
// se aplica. Un filtro inventado no devuelve menos resultados, devuelve los EQUIVOCADOS.

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre']
/** «setiembre» es la misma palabra que «septiembre» y en Argentina se escribe de las dos formas. */
const NUMERO_DE_MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }

/** Cómo nombra una persona cada tipo documental. Es el mismo diccionario que usa el benchmark, al
 *  revés: de las palabras al tipo. */
const TIPO_POR_PALABRA = [
  [/volante|vep\b/i, 'vep'],
  [/acuse|presentaci[óo]n de (la )?(ddjj|declaraci)/i, 'acuse_arca'],
  [/931|aportes|contribuciones/i, 'f931'],
  [/libro de sueldos|libro de haberes/i, 'libro_sueldos'],
  [/recibo de sueldo|recibo de haberes/i, 'recibo_sueldo'],
  [/nota de cr[ée]dito/i, 'nota_credito'],
  [/factura/i, 'factura'],
  [/boleta.*ieric|multa.*ieric/i, 'boleta_ieric'],
  [/ieric|libreta/i, 'ieric'],
  [/comprobante de pago|transferencia/i, 'comprobante_pago'],
  [/cumplimiento fiscal/i, 'certificado_fiscal'],
  [/certificado de obra|certificaci[óo]n/i, 'certificado_obra'],
  [/presupuesto|cotizaci[óo]n/i, 'presupuesto'],
  [/p[óo]liza|seguro|art\b/i, 'seguro'],
  [/plano/i, 'plano'],
  [/contrato/i, 'contrato'],
  [/extracto|resumen de cuenta/i, 'extracto_bancario'],
]

const RE_CUIT = /\b(\d{2})[-\s.]?(\d{8})[-\s.]?(\d)\b/
const RE_COMPROBANTE = /\b(\d{4,5})\s*-\s*(\d{7,8})\b/
const RE_IMPORTE = /(?:\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?)/

/**
 * @param {string} texto la pregunta tal como la escribió la persona
 * @returns {{tipo:string|null, periodo:string|null, anio:number|null, cuit:string|null,
 *            comprobante:string|null, importe:number|null, resto:string, filtros:number}}
 */
export function entenderConsulta(texto) {
  const t = String(texto ?? '')
  const bajo = t.toLowerCase()

  const tipo = TIPO_POR_PALABRA.find(([re]) => re.test(bajo))?.[1] ?? null

  // ── EL PERÍODO ──
  let periodo = null
  let anio = null
  const conMes = bajo.match(new RegExp(`\\b(${MES.join('|')})\\b(?:\\s+(?:de|del)\\s+)?(\\d{4})?`))
  const soloAnio = bajo.match(/\b(20\d{2})\b/)
  if (conMes) {
    anio = conMes[2] ? Number(conMes[2]) : (soloAnio ? Number(soloAnio[1]) : null)
    if (anio) periodo = `${anio}-${String(NUMERO_DE_MES[conMes[1]]).padStart(2, '0')}`
  } else {
    const numerico = bajo.match(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/)
    if (numerico) { anio = Number(numerico[2]); periodo = `${anio}-${String(Number(numerico[1])).padStart(2, '0')}` }
    else if (soloAnio) anio = Number(soloAnio[1])
  }

  const mc = t.match(RE_CUIT)
  const cp = t.match(RE_COMPROBANTE)
  // El comprobante se prueba primero: «0001-00001181» sin guiones también tiene once dígitos y
  // pasaría por CUIT, devolviendo el documento equivocado.
  const comprobante = cp ? `${cp[1]}-${cp[2]}` : null
  const cuit = !cp && mc ? `${mc[1]}${mc[2]}${mc[3]}` : null

  const mi = t.match(RE_IMPORTE)
  const importe = mi ? Number(mi[1].replace(/\./g, '').replace(',', '.')) : null

  // Lo que queda después de sacar lo estructurado es lo que el modelo tiene que entender. Dejarle
  // el «de octubre de 2023» adentro sólo lo confunde: esas palabras ya se convirtieron en un filtro.
  const resto = t
    .replace(RE_CUIT, ' ').replace(RE_COMPROBANTE, ' ')
    .replace(new RegExp(`\\b(${MES.join('|')})\\b`, 'gi'), ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ').trim()

  const filtros = [tipo, periodo, cuit, comprobante].filter(Boolean).length
  return { tipo, periodo, anio, cuit, comprobante, importe, resto, filtros }
}

/** ¿Este documento pasa los filtros que la pregunta declaró? Un filtro que la pregunta no nombró
 *  NO se aplica: ausencia no es restricción. */
export function pasaFiltros(doc, f) {
  if (!f) return true
  if (f.tipo && doc.tipo !== f.tipo) return false
  const campos = doc.campos ?? {}
  if (f.periodo) {
    const p = String(campos.periodo ?? '')
    const fecha = String(campos.fecha ?? '')
    // El período puede estar escrito como campo propio o deducirse de la fecha del documento.
    if (p !== f.periodo && fecha.slice(0, 7) !== f.periodo) return false
  } else if (f.anio) {
    const y = String(campos.periodo ?? campos.fecha ?? '').slice(0, 4)
    if (y && y !== String(f.anio)) return false
  }
  if (f.cuit && String(campos.cuit ?? '') !== f.cuit) return false
  if (f.comprobante && String(campos.comprobante ?? '') !== f.comprobante) return false
  return true
}
