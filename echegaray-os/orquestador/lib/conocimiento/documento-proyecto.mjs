// QUÉ DICE UN DOCUMENTO DEL PROYECTO QUE EL PLANO NO PUEDE DECIR. PURO — sin red, sin modelo.
//
// ═══ POR QUÉ NO ALCANZA CON `hechosDeTexto` ═══
//
// `plano/proyecto.mjs` ya saca de un texto los atributos TÉCNICOS de una pieza: resistencia,
// espesor, armadura, terminación. Eso es lo que hace falta para computar. Pero un contrato y una
// memoria dicen además cinco cosas que ningún plano dice y que cambian el precio antes de que se
// compute nada:
//
//   · QUÉ ENTRA y QUÉ NO ENTRA en el alcance — «el entrepiso y la escalera quedan excluidos»;
//   · QUIÉN HACE QUÉ — permisos, materiales, transporte, instalación de carpinterías;
//   · QUÉ EXIGE EL CONTRATO — plazo, anticipo, certificación, adicionales por escrito, ART;
//   · A QUÉ PLANO REMITE — «según plano de estructura aprobado por la DPDU»;
//   · QUÉ TODAVÍA NO ESTÁ DEFINIDO — «espesor según cálculo de presión de viento».
//
// Ese último grupo es el que más importa y el que más se pierde: un documento que declara su propio
// hueco es la mejor fuente posible de un FALTA_DATO, mucho mejor que deducirlo de que el plano no
// lo trae. Acá se leen los cinco, cada uno con la FRASE ENTERA que lo dice.
//
// ═══ NO PRODUCE NÚMEROS PARA COTIZAR ═══
//
// Ningún hallazgo de este módulo es un precio ni una cantidad de cómputo. Son afirmaciones de
// alcance y de condición, con su cita. Lo que hacen es habilitar o bloquear una partida y explicar
// por qué, no reemplazar la medición.
import { alcanceDe, hechosDeTexto, CLASE_FUENTE } from '../plano/proyecto.mjs'

/** Las categorías del pedido. Cada una responde una pregunta distinta y no se mezclan. */
export const CATEGORIA = Object.freeze({
  ALCANCE: 'ALCANCE',
  EXCLUSION: 'EXCLUSION',
  RESPONSABILIDAD: 'RESPONSABILIDAD',
  REQUISITO_CONTRACTUAL: 'REQUISITO_CONTRACTUAL',
  CRITERIO_TECNICO: 'CRITERIO_TECNICO',
  REFERENCIA_PLANO: 'REFERENCIA_PLANO',
  PARTIDA: 'PARTIDA',
  SIN_DEFINIR: 'SIN_DEFINIR',
})

/**
 * LOS MARCADORES DE CADA CATEGORÍA.
 *
 * Están escritos sobre el castellano de los contratos y memorias de este data room, no sobre una
 * gramática general: «quedan completamente excluidas», «tendrá a su exclusivo cargo», «según plano».
 * Cada patrón que se agregue tiene que venir de una frase REAL vista en un documento, porque un
 * marcador inventado produce hallazgos que nadie escribió.
 */
export const MARCADORES = Object.freeze({
  [CATEGORIA.EXCLUSION]: [
    /\bqueda(?:n|r[aá]n)?\s+(?:expresamente\s+|completamente\s+|totalmente\s+)?exclu[ií]d/i,
    /\bno\s+(?:se\s+)?(?:contempla|incluye|comprende|forma\s+parte|est[aá]\s+inclu)/i,
    /\bno\s+ser[aá]n?\s+ejecutad/i, /\bexclusiones?\s+expl[ií]cit/i, /\bfase\s+exclu[ií]da/i,
    /\bexclu[ií]d[oa]s?\s+(?:de|del)\s+(?:los\s+trabajos|el\s+alcance|la\s+oferta|la\s+cotizaci)/i,
  ],
  [CATEGORIA.ALCANCE]: [
    /\bcomprende\s+(?:exclusivamente|[uú]nicamente|solamente)/i,
    /\balcance\s+(?:de\s+la\s+(?:obra|oferta|empresa)|operativo|contractual)/i,
    /\bse\s+circunscribe\b/i, /\bobjeto\s+del\s+presente\s+contrato/i,
    /\bla\s+cotizaci[oó]n\s+aprobada\s+(?:forma\s+parte|comprende)/i,
    /\btrabajos?\s+a\s+ejecutar\b/i,
  ],
  [CATEGORIA.RESPONSABILIDAD]: [
    /\b(?:ser[aá]|es)\s+(?:de\s+)?responsabilidad\s+d/i, /\btendr[aá]\s+a\s+su\s+(?:exclusivo\s+)?cargo/i,
    /\ba\s+(?:exclusivo\s+)?cargo\s+d(?:el|e\s+l)/i, /\b(?:el\s+)?(?:locador|locatario|comitente|cliente|contratista|empresa)\s+(?:deber[aá]|se\s+obliga|se\s+compromete|asumir[aá]|gestionar[aá]|proveer[aá]|suministrar[aá])/i,
    /\bser[aá]n?\s+(?:gestionad|costead|provist|adquirid)[oa]s?\s+por\b/i,
    /\b[uú]nico\s+y\s+exclusivo\s+empleador/i, /\bmantener\s+(?:plenamente\s+)?indemne/i,
  ],
  [CATEGORIA.REQUISITO_CONTRACTUAL]: [
    /\bplazo\s+(?:estimado\s+)?de\s+(?:ejecuci[oó]n|obra|entrega)/i, /\bforma\s+de\s+pago/i,
    /\banticipo\b/i, /\bcertificaci(?:[oó]n|ones)\s+(?:quincenal|mensual|de\s+avance)/i,
    /\badicional(?:es)?\s+(?:deber[aá]n|ser[aá]n?)/i, /\brescisi[oó]n\b/i, /\bjurisdicci[oó]n\b/i,
    /\bfondo\s+de\s+reparo|garant[ií]a\s+de\s+(?:obra|cumplimiento)|retenci[oó]n\s+de\s+garant/i,
    /\b(?:multa|penalidad)(?:es)?\b/i, /\bvalidez\s+de\s+la\s+oferta/i,
    /\bcobertura\s+de\s+aseguradora\s+de\s+riesgos|\bART\b/,
  ],
  [CATEGORIA.CRITERIO_TECNICO]: [
    /\bCIRSOC|INPRES|\bIRAM\b|\bAEA\b|\bDPDU\b|\bIERIC\b/,
    /\bzona\s+s[ií]smica|zona\s+4\b|sismorresistente/i, /\breglamento\s+d/i,
    /\bc[oó]digo\s+de\s+edificaci[oó]n/i, /\bnormativa\s+(?:vigente|de\s+drenaje|municipal)/i,
    /\bseg[uú]n\s+(?:norma|c[aá]lculo|reglamento)/i, /\breglas\s+del\s+arte/i,
  ],
  [CATEGORIA.REFERENCIA_PLANO]: [
    /\bseg[uú]n\s+(?:se\s+indica\s+en\s+)?(?:el\s+|los\s+)?plano/i, /\bs\/\s?plano/i,
    /\bconforme\s+a\s+los\s+planos/i, /\bplanos?\s+(?:ejecutiv|de\s+estructura|de\s+mensura|aprobad|de\s+proyecto)/i,
    /\bplanilla\s+de\s+doblado/i, /\bplano\s+el[eé]ctrico/i,
  ],
  [CATEGORIA.SIN_DEFINIR]: [
    /\bseg[uú]n\s+c[aá]lculo|\bs\/\s?c[aá]lculo/i, /\ba\s+(?:definir|determinar|confirmar|verificar)\b/i,
    /\bno\s+se\s+dispone\s+d/i, /\buna\s+vez\s+que\s+el\s+cliente\s+defina/i,
    /\bpor\s+definir\b/i, /\bpendiente\s+de\s+(?:definici[oó]n|aprobaci[oó]n|confirmaci[oó]n)/i,
    /\bestimad[oa]\b.*\b(?:sujeto|podr[aá]\s+modificarse)/i,
  ],
})

/** Las unidades que aparecen de verdad en estos documentos. El orden importa: `m²` antes que `m`. */
const UNIDADES = String.raw`m²|m2|mm|cm|ml|m3|m³|kg|tn|lts?|litros?|l\b|un\b|gl\b|hs?\b|d[ií]as?|meses|m\b|%|\$|U\$S`

/** Una cantidad con su unidad, tal como está escrita. PURA. */
export const CANTIDADES = new RegExp(String.raw`(?:Ø\s*)?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(${UNIDADES})`, 'gi')

/** Cuántas de una cosa, cuando el documento lo escribe con letra y número: «dos (2) tanques». Es la
 *  forma en que un pliego declara una CANTIDAD sin ambigüedad, y la que hay que leer. PURA. */
export const CANTIDAD_ESCRITA = /\b([a-záéíóúñ]+)\s*\((\d{1,4})\)\s+([a-záéíóúñ][\wáéíóúñ]{2,})/gi

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * PARTIR EL TEXTO EN FRASES CITABLES, RECORDANDO BAJO QUÉ TÍTULO ESTABA CADA UNA. PURA.
 *
 * La sección importa tanto como la frase: «quedan completamente excluidas» abajo del título
 * «PROTOCOLO DE PREVISIÓN PARA FUTURO ENTREPISO (FASE EXCLUIDA)» dice de qué habla, y la frase sola
 * no lo dice. Sin sección, la exclusión más importante del contrato de QUATTROPANI queda sin sujeto.
 */
export function frasesConSeccion(texto) {
  const salida = []
  let seccion = null
  for (const linea of String(texto ?? '').split('\n')) {
    const l = norm(linea)
    if (!l) continue
    // Un título: numerado o en mayúsculas, corto, y sin terminar en punto.
    if (/^(?:\d{1,2}(?:\.\d{1,2})*\.?\s+)?[^a-z]{6,90}$/.test(l) && !/\.$/.test(l) && l.length <= 95) { seccion = l; continue }
    for (const f of l.split(/(?<=[.;:])\s+(?=[A-ZÁÉÍÓÚÑ¿"«(])/)) {
      const t = norm(f)
      if (t.length >= 20) salida.push({ texto: t, seccion })
    }
  }
  return salida
}

/** Las categorías que enganchan con una frase. Una frase puede ser varias cosas a la vez, y forzarla
 *  a una sola es elegir a dedo. PURA. */
export function categoriasDe(frase) {
  const t = String(frase ?? '')
  return Object.entries(MARCADORES).filter(([, res]) => res.some((re) => re.test(t))).map(([c]) => c)
}

/** Las cantidades con unidad que trae una frase, sin repetir. PURA. */
export function cantidadesDe(frase) {
  const vistas = new Map()
  for (const m of String(frase ?? '').matchAll(CANTIDADES)) {
    const clave = `${m[1]}|${m[2].toLowerCase()}`
    if (!vistas.has(clave)) vistas.set(clave, { valor: m[1], unidad: m[2].toLowerCase(), literal: m[0] })
  }
  for (const m of String(frase ?? '').matchAll(CANTIDAD_ESCRITA)) {
    const clave = `${m[2]}|un:${m[3].toLowerCase()}`
    if (!vistas.has(clave)) vistas.set(clave, { valor: m[2], unidad: m[3].toLowerCase(), literal: norm(m[0]) })
  }
  return [...vistas.values()]
}

/** Un hallazgo documental. Sin cita no se construye: es la misma regla que gobierna la biblioteca y
 *  `plano/fuente.mjs`, y está acá otra vez porque es lo que lo hace discutible. PURA. */
export function hallazgo({ categoria, documento, seccion = null, textoLiteral, cantidades = [], alcance = null } = {}) {
  const cita = norm(textoLiteral)
  if (!categoria || !documento || cita.length < 20) return null
  return Object.freeze({
    categoria, documento, seccion, alcance,
    textoLiteral: cita.slice(0, 400),
    cantidades: Object.freeze(cantidades),
  })
}

/**
 * LEER UN DOCUMENTO DE PROYECTO. PURA.
 *
 * Devuelve los hallazgos por categoría MÁS los hechos técnicos que ya sabía sacar
 * `plano/proyecto.mjs`: no se duplica esa lógica: se la llama. Dos extractores del mismo atributo
 * sobre el mismo texto es exactamente cómo terminan conviviendo dos definiciones del mismo concepto.
 */
export function leerDocumentoDeProyecto(texto, { documento, clase = CLASE_FUENTE.MEMORIA } = {}) {
  const frases = frasesConSeccion(texto)
  const hallazgos = []
  for (const f of frases) {
    const cats = categoriasDe(f.texto)
    if (!cats.length) continue
    const cantidades = cantidadesDe(f.texto)
    for (const categoria of cats) {
      const h = hallazgo({ categoria, documento, seccion: f.seccion, textoLiteral: f.texto, cantidades, alcance: alcanceDe(f.texto) })
      if (h) hallazgos.push(h)
    }
  }
  const tecnicos = hechosDeTexto(texto, { documento, clase })
  const porCategoria = {}
  for (const h of hallazgos) porCategoria[h.categoria] = (porCategoria[h.categoria] ?? 0) + 1
  return {
    documento,
    frases: frases.length,
    hallazgos,
    tecnicos,
    porCategoria,
    resumen: `${frases.length} frase(s) · ${hallazgos.length} hallazgo(s) documentales · ${tecnicos.length} hecho(s) técnicos`,
  }
}

/**
 * DE UN HALLAZGO «SIN_DEFINIR» A UN HUECO DECLARADO. PURA.
 *
 * El documento declara su propio agujero —«espesor mínimo según cálculo de presión de viento»— y eso
 * vale más que deducirlo de que el plano no lo trae: acá hay alguien que escribió que todavía no
 * está resuelto. Se convierte en FALTA_DATO con la frase que lo dice y con quién lo tiene.
 */
export function huecosDeclarados(lectura) {
  return (lectura?.hallazgos ?? [])
    .filter((h) => h.categoria === CATEGORIA.SIN_DEFINIR)
    .map((h) => ({
      tipo: 'FALTA_DATO',
      documento: h.documento,
      seccion: h.seccion,
      textoLiteral: h.textoLiteral,
      porQue: 'el propio documento declara que este dato todavía no está definido',
      quienLoTiene: /cliente|comitente|locatario|propietario/i.test(h.textoLiteral) ? 'el cliente' : 'la dirección técnica del proyecto',
    }))
}
