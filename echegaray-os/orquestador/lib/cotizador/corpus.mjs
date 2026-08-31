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
  /no\s+se\s+(incluye|incluyen|incluir[aá]n?|contempla|contemplan|considera|consideran|preve|prev[eé]n|ejecuta|ejecutan|realiza|realizan|cotiza|cotizan)\s+/i,
  /no\s+incluye[n]?\s+/i,
  /se\s+exclu(ye|yen)\s+(de\s+\w+\s+)?/i,
  /(se\s+)?(deja|dejan)\s+(expresamente\s+)?fuera\s+(de\s+\w+\s+)?/i,
  /sin\s+incluir\s+/i,
  /(queda|quedan)\s+a\s+cargo\s+d[eo]l\s+(comitente|cliente|propietario)\s*:?\s*/i,
  // «Quedan fuera DEL PRESENTE PRESUPUESTO los revoques»: la marca abre la frase y lo excluido
  // viene DESPUÉS del complemento. Es la misma forma verbal que el sufijo «X queda fuera de», y por
  // eso el sufijo se prueba primero: cuando matchea en la posición 0 deja un tramo vacío y cae acá.
  /(queda|quedan)\s+fuera\s+(?:de[l]?\s+(?:\w+\s+){0,3})?/i,
  // «No SE ENCUENTRA incluido el entrepiso» y «el presupuesto NO COMPRENDE la escalera»: la
  // negación abre y lo excluido viene después. Estaban en la familia equivocada —el sufijo devolvía
  // «El presupuesto»— y por eso el término salía mal en vez de no salir, que es peor.
  /no\s+se\s+encuentran?\s+(inclui[dr]\w*|contemplad\w*|comprendid\w*|previst\w*)\s+/i,
  /no\s+(comprende|comprenden|abarca|abarcan|alcanza|alcanzan|contempla|contemplan)\s+/i,
]
const NEGACIONES_SUFIJO = [
  /,?\s*quedan?\s+(completamente\s+)?exclui[dr]\w*/i,
  /,?\s*(est[aá]n?|son)\s+exclui[dr]\w*/i,
  // «El entrepiso NO ESTÁ INCLUIDO» · «Los revoques no están contemplados» · «no forma parte»
  /,?\s*no\s+(est[aá]n?|ser[aá]n?|ha\s+sido|han\s+sido)\s+(inclui[dr]\w*|contemplad\w*|considerad\w*|cotizad\w*|previst\w*)/i,
  /,?\s*no\s+(forma|forman)\s+parte/i,
  /,?\s*(queda|quedan)\s+fuera\s+(de|del)/i,
  /,?\s*(corre|corren|ser[aá]n?)\s+por\s+cuenta\s+d[eo]l\s+(comitente|cliente|propietario)/i,
  // Cuatro formas de la MISMA familia que la re-auditoría encontró ciegas. «corre por cuenta del
  // comitente» estaba cubierto y «queda A CARGO del comitente» no: media forma, que es peor que
  // ninguna porque el límite las daba por cubiertas.
  /,?\s*(queda|quedan)\s+a\s+cargo\s+d[eo]l\s+(comitente|cliente|propietario)/i,
  /,?\s*(queda|quedan)\s+exceptuad\w*/i,
]
/**
 * LA LISTA ENCABEZADA. «EXCLUSIONES: entrepiso, escalera, revoques» no tiene verbo que negar: la
 * negación está en el título. Es la forma más común en un pliego y la que ningún patrón verbal ve.
 */
const ENCABEZADO_LISTA = /^\s*(exclusi[oó]n(es)?|no\s+incluye|excluido[s]?|fuera\s+de\s+alcance)\s*[:：-]\s*/i
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
  // El encabezado de lista se prueba PRIMERO: «EXCLUSIONES: no se incluye el entrepiso» tiene las
  // dos formas y lo que manda es el título.
  const enc = ENCABEZADO_LISTA.exec(t)
  if (enc) {
    const resto = t.slice(enc[0].length).trim()
    if (resto) return resto
  }
  // El SUFIJO se prueba antes que el prefijo: «no se incluye X» y «X queda excluido» pueden convivir, y si gana
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

/**
 * LO QUE ESTE EXTRACTOR **NO VE**, ENUMERADO.
 *
 * La auditoría adversarial encontró que 8 de 10 redacciones castellanas comunes pasaban de largo, y
 * que el límite declarado subdeclaraba el problema cuatro veces. Se cubrieron las formas verbales y
 * la lista encabezada. Queda ciego a esto, y la lista es la lista COMPLETA de lo probado:
 *
 *   · TABLAS. Un pliego con una columna «Incluido S/N» no tiene ninguna frase que negar.
 *   · NEGACIÓN POR OMISIÓN. «El alcance comprende A, B y C» excluye D sin nombrarlo. Es
 *     indecidible sin saber qué existe, y por eso ni se intenta.
 *   · CONDICIONALES. «Se incluirá el entrepiso sólo si el comitente provee el cálculo» no es una
 *     exclusión ni una inclusión: es una condición, y aplicarla en cualquiera de los dos sentidos
 *     sería decidir por el cliente.
 *   · REFERENCIAS CRUZADAS. «Según lo indicado en el Anexo II» — el anexo puede no estar en el
 *     corpus.
 *   · NEGACIÓN EN OTRO IDIOMA o en un PDF escaneado sin texto.
 *   · IRONÍA / DOBLE NEGACIÓN. «No es cierto que no se incluya el entrepiso».
 *
 * Todo eso devuelve `tramoNegado(...) === null`, y eso NO bloquea nada: la exclusión simplemente no
 * se ve. Es el modo de falla peligroso —silencioso— y por eso está escrito acá y en el DoD.
 */

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
    // `parseado` estaba escrito `true` a mano, y la `etapa` del corpus se descartaba. Sobre ARCOR
    // eso publicaba como leídos 2 documentos que el corpus marca NO_LEIDO: un control incapaz de
    // decir que no. La etapa manda; sólo cuando el corpus no la trae se declara desconocida —y
    // desconocido no es leído, así que `parseado` sale `null` y no `true`.
    documentos: documentos.map((d) => ({
      hash: d.hash,
      nombre: (String(d.titulo ?? '').split('/').pop()),
      etapa: d.etapa ?? null,
      parseado: d.etapa === undefined || d.etapa === null ? null : d.etapa !== 'NO_LEIDO',
      formato: d.formato,
    })),
    conocimientos, huecos,
    estado: documentos.length ? ESTADO.EXTRAIDO : ESTADO.FALTA_DATO,
  }
}

/** Los clientes del corpus, sacados de la ruta de Drive. PURA. Alimenta el barrido de fuga. */
export const clientesDelCorpus = (biblioteca) => [...new Set((biblioteca.documentos ?? [])
  .map((d) => (String(d.titulo ?? '').match(/PRESUPUESTOS - CLIENTES\/([^/]+)\//) ?? [])[1])
  .filter(Boolean))]
