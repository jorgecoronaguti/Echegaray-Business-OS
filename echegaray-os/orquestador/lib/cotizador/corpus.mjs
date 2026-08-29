// DEL CONOCIMIENTO YA EXTRAÍDO AL ESTADO DEL MOTOR — sin volver a leer un documento.
//
// ═══ QUÉ TRADUCE ═══
//
// `orquestador/datos/conocimiento/biblioteca.json` tiene 170 documentos ya leídos, con sus
// conocimientos clasificados (EXCLUSION, ALCANCE, CRITERIO_TECNICO, REQUISITO_CONTRACTUAL…) y sus
// huecos (FALTA_DATO, CONFLICTO) con dueño. Ese trabajo está hecho y cerrado: acá no se reinterpreta
// nada, se TRADUCE a las formas que el cotizador consume.
//
// ═══ EL PATRÓN DE EXCLUSIÓN NO SE APLICA SOLO, Y ÉSTE ES EL MOTIVO ═══
//
// Medido sobre el contrato REAL de Quattropani. Sus cinco frases de exclusión son:
//
//   1. «no se incluye entrepiso ni escalera; en caso de ser requeridos, se cotizarán como adicional»
//   2. «la responsabilidad … se circunscribe … a los componentes detallados en esta memoria»
//   3. «No se contempla revoques ni pintura en los muros.»
//   4. «las estructuras correspondientes al entrepiso como su escalera metálica … quedan excluidas»
//   5. «— No se contempla entrepiso ni escalera.»
//
// Un extractor que tomara todos los sustantivos de la parte negada sacaría de (3) el término
// **«muros»** — que es el complemento locativo, no lo excluido— y en el presupuesto real de esa
// obra existe la partida `T1017 CAPA AISLADORA HORIZONTAL EN MUROS`, que NO está excluida. El
// motor la habría sacado del total sin que nadie lo notara.
//
// La regla que lo evita NO está afinada a este caso: es CORROBORACIÓN. Un término negado que
// aparece en frases de DOS documentos distintos se aplica; uno que aparece en uno solo sale
// CANDIDATO con su pregunta. Sobre Quattropani da exactamente lo correcto —`entrepiso` y `escalera`
// aparecen en los dos contratos, `revoques`, `pintura` y `muros` en uno— y sobre cualquier otro
// proyecto se comporta igual de conservadora, que es la dirección segura.
//
// Es la misma lógica que gobierna `seleccion.mjs`: la duda no se resuelve sola.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'
import { entradaDeAlcance, ALCANCE } from './alcance.mjs'

const normal = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * LAS DOS FAMILIAS DE NEGACIÓN, Y POR QUÉ HAY QUE SEPARARLAS.
 *
 * En «no se contempla entrepiso ni escalera» lo excluido va DESPUÉS de la marca. En «las
 * estructuras del entrepiso y su escalera quedan completamente excluidas de los trabajos» va
 * ANTES: la marca es el final de la oración, no el principio.
 *
 * Tratarlas igual —la primera versión de este archivo lo hacía— daba de la segunda frase el tramo
 * «de los trabajos a ejecutar por la empresa constructora», o sea el término «ejecutar», y perdía
 * `entrepiso` y `escalera` justo en el documento que los corrobora. Con eso, la exclusión mejor
 * documentada del corpus quedaba como CANDIDATA. Lo encontró correr el extractor sobre el contrato
 * real, no leerlo.
 */
const NEGACIONES_PREFIJO = [
  /no\s+se\s+(incluye|incluyen|contempla|contemplan|considera|consideran|preve|preven)\s+/i,
  /no\s+incluye[n]?\s+/i,
]
const NEGACIONES_SUFIJO = [
  /,?\s*quedan?\s+(completamente\s+)?exclui[dr]\w*/i,
  /,?\s*(est[aá]n?|son)\s+exclui[dr]\w*/i,
]
const CORTES = /[.;]|\s+en\s+caso\s+de\s+|\s+quedan?\s+|\s+se\s+cotizar/i
/** Lo que precede al sujeto en una frase de exclusión por sufijo: no aporta términos. */
const PREAMBULO = /^.*?\b(que|:)\s+/i

/** Palabras que no nombran una partida. `muros` NO está acá: sacarlo por lista sería afinar el
 *  extractor a Quattropani, que es exactamente lo que el §35 prohíbe. Se resuelve por corroboración. */
const RUIDO = new Set(['ni', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'por', 'que',
  'sus', 'como', 'una', 'este', 'esta', 'esas', 'esos', 'obra', 'trabajos', 'etapa', 'empresa',
  'constructora', 'asociada', 'correspondientes', 'estructuras', 'componentes', 'detallados'])

/** El tramo NEGADO de una frase de exclusión, o `null` si la frase no niega nada concreto. PURA. */
export function tramoNegado(frase) {
  const t = String(frase ?? '')
  // El SUFIJO se prueba PRIMERO: «no se incluye X» y «X queda excluido» pueden convivir, y si gana
  // el prefijo sobre una frase de sufijo se lee el complemento en vez del sujeto.
  for (const re of NEGACIONES_SUFIJO) {
    const m = re.exec(t)
    if (!m) continue
    const tramo = t.slice(0, m.index).replace(PREAMBULO, '').trim()
    if (tramo) return tramo
  }
  for (const re of NEGACIONES_PREFIJO) {
    const m = re.exec(t)
    if (!m) continue
    const desde = t.slice(m.index + m[0].length)
    const corte = CORTES.exec(desde)
    const tramo = (corte ? desde.slice(0, corte.index) : desde).trim()
    if (tramo) return tramo
  }
  return null
}

/** Los términos candidatos de un tramo negado. PURA. */
export const terminosDe = (tramo) => [...new Set(normal(tramo)
  .split(/[^a-z0-9]+/)
  .filter((w) => w.length > 4 && !RUIDO.has(w)))]

/**
 * LAS EXCLUSIONES DE UN PROYECTO, con corroboración entre documentos. PURA.
 *
 * Devuelve `{entradas, candidatas, descartadas}`. `entradas` son las que se aplican —término
 * corroborado en ≥2 documentos— y `candidatas` las que producen una pregunta dirigida en vez de
 * sacar plata del total.
 */
export function exclusionesDelProyecto(conocimientos = [], { minDocumentos = 2, partidas = null } = {}) {
  const porTermino = new Map()
  for (const c of conocimientos) {
    if (c?.evidencia?.categoria !== 'EXCLUSION') continue
    const tramo = tramoNegado(c.afirmacion)
    if (!tramo) continue
    for (const term of terminosDe(tramo)) {
      const acc = porTermino.get(term) ?? { termino: term, documentos: new Set(), frases: [] }
      acc.documentos.add(c.evidencia.archivo ?? 'sin documento')
      acc.frases.push({ documento: c.evidencia.archivo, textoLiteral: c.afirmacion })
      porTermino.set(term, acc)
    }
  }

  // ═══ UN TÉRMINO QUE NO TOCA NINGUNA PARTIDA NO PUEDE EXCLUIR NADA ═══
  // «ratifica», «ejecutar», «asociada» salen de la gramática de la frase, no del alcance de la
  // obra. Descartarlos por su efecto —no alcanzan a ninguna partida— es determinístico y no afina
  // nada: filtrarlos por una lista de palabras sí sería afinar el extractor a este contrato.
  const tocaAlgo = (term) => {
    if (!partidas) return true
    const t = normal(term)
    return partidas.some((p) => [p.descripcion, p.codigo, p.rubro].filter(Boolean).some((c) => normal(c).includes(t)))
  }

  const entradas = []
  const candidatas = []
  const descartadas = []
  for (const [term, acc] of [...porTermino.entries()].sort()) {
    const nDocs = acc.documentos.size
    // El filtro por efecto se aplica SÓLO a las candidatas. Una exclusión CORROBORADA en dos
    // documentos que no toca ninguna partida no se descarta: se aplica igual y queda como
    // constancia de que el cruce se hizo. Sobre Quattropani eso es lo que prueba que el presupuesto
    // real ya respeta el contrato —no hay partida de entrepiso ni de escalera— en vez de que el
    // motor no haya mirado.
    if (nDocs < minDocumentos && !tocaAlgo(term)) { descartadas.push({ termino: term, porQue: 'aparece en un solo documento y no alcanza a ninguna partida del presupuesto' }); continue }
    const base = {
      patron: term, estado: ALCANCE.EXCLUIDO,
      fuente: [...acc.documentos].join(' + '),
      textoLiteral: acc.frases[0].textoLiteral,
      motivo: `corroborado en ${nDocs} documento(s) del proyecto${tocaAlgo(term) ? '' : ' · no alcanza a ninguna partida de este presupuesto: queda como constancia del cruce'}`,
    }
    if (nDocs >= minDocumentos) entradas.push(entradaDeAlcance(base))
    else {
      candidatas.push({
        ...base, estado: ALCANCE.POR_DEFINIR, documentos: nDocs,
        porQue: `«${term}» aparece negado en UN solo documento («${[...acc.documentos][0]}»): puede ser lo excluido o el lugar donde algo no se hace. No se aplica solo`,
      })
    }
  }
  return { entradas, candidatas, descartadas, terminos: porTermino.size }
}

/** Las candidatas, como preguntas dirigidas para la cola de atención. PURA. */
export const issuesDeCandidatas = (candidatas = []) => candidatas.map((c) => issue({
  type: TIPO_ISSUE.AMBIGUO, severity: SEVERIDAD.MEDIA, entity: `alcance:${c.patron}`,
  evidence: { fuente: c.fuente, textoLiteral: c.textoLiteral },
  detalle: c.porQue, recommended_action: 'exclude_scope',
}))

/**
 * LOS HUECOS Y CONFLICTOS DEL PROYECTO, HEREDADOS. PURA.
 *
 * Un CONFLICTO de la biblioteca llega con `quienLoTiene: 'el dueño'`. El motor NO lo resuelve —§31
 * dice que los conflictos se mantienen y sólo evidencia o autoridad los cierra— así que se hereda
 * como issue BLOQUEANTE con su dueño escrito. Convertirlo en una advertencia sería resolverlo por
 * la vía de bajarle la severidad.
 */
export function huecosDelProyecto(huecos = []) {
  return huecos.map((h) => issue({
    type: h.tipo === 'CONFLICTO' ? TIPO_ISSUE.CONFLICTO : TIPO_ISSUE.FALTA_DATO,
    severity: h.tipo === 'CONFLICTO' ? SEVERIDAD.BLOQUEANTE : SEVERIDAD.ALTA,
    entity: h.clave ?? h.id,
    evidence: { porQue: h.porQue, opciones: h.opciones ?? null, fuentesEnConflicto: h.fuentesEnConflicto ?? null },
    detalle: `${h.porQue} · lo resuelve: ${h.quienLoTiene ?? 'sin dueño declarado'}`,
    // No hay acción del command layer que cierre un conflicto contractual: lo cierra una persona
    // con autoridad, fuera del sistema. Poner una acción acá sugeriría que se puede apretar un botón.
    recommended_action: h.tipo === 'CONFLICTO' ? null : 'evidence_query',
  }))
}

/** Todo lo de un proyecto en el corpus. PURA — recibe la biblioteca, no la lee. */
export function delProyecto(biblioteca, termino) {
  const re = new RegExp(String(termino).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  const documentos = (biblioteca.documentos ?? []).filter((d) => re.test(String(d.titulo ?? '')))
  const idsDoc = new Set(documentos.map((d) => d.id))
  const conocimientos = (biblioteca.conocimientos ?? []).filter((c) =>
    idsDoc.has(c.documentoId) || re.test(String(c.clave ?? '')) || re.test(String(c.evidencia?.archivo ?? '')))
  const huecos = (biblioteca.huecos ?? []).filter((h) => re.test(String(h.clave ?? '')))
  return {
    termino,
    documentos: documentos.map((d) => ({ hash: d.hash, nombre: (String(d.titulo ?? '').split('/').pop()), parseado: true, formato: d.formato })),
    conocimientos, huecos,
    estado: documentos.length ? ESTADO.EXTRAIDO : ESTADO.FALTA_DATO,
  }
}

/** Los clientes del corpus, sacados de la ruta de Drive. PURA. Alimenta el barrido de fuga. */
export const clientesDelCorpus = (biblioteca) => [...new Set((biblioteca.documentos ?? [])
  .map((d) => (String(d.titulo ?? '').match(/PRESUPUESTOS - CLIENTES\/([^/]+)\//) ?? [])[1])
  .filter(Boolean))]
