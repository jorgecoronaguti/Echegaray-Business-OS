// RESOLUCIÓN DE IDENTIDAD. QUIÉN ES QUIÉN, CON EL ORDEN QUE IMPIDE QUE UN PARECIDO PISE UN HECHO.
//
// ═══ EL ORDEN NO ES UNA PREFERENCIA: ES LA REGLA ═══
//
//   identificador fuerte (CUIT/DNI/código) → exacto normalizado → alias verificado
//   → fuzzy → embeddings → score combinado
//
// Un resultado probabilístico JAMÁS sobreescribe una identidad verificada. Si el CUIT dice que son
// dos empresas distintas, no importa que los nombres sean casi iguales: son distintas, y el
// embedding no opina.
//
// ═══ POR QUÉ ESTO NO SE PUEDE HACER SÓLO CON UN MODELO, MEDIDO ═══
//
// El ground truth verificado por CUIT del 04/09/2026 tiene estos pares REALES, que son el mismo
// proveedor:
//
//   «Corralon Progreso»  = «PEREZ GARCIA MARISOL BIBIANA»
//   «DUPEC»              = «DUBOS UGARTE PEDRO LUIS RAUL»
//   «Industrias Castel»  = «MARTINEZ JORGE ROBERTO»
//
// Nombre de fantasía contra el titular que factura. NINGÚN modelo de lenguaje puede resolver eso:
// no hay nada en el texto que los relacione. Sólo el CUIT, o un alias que alguien verificó una vez.
// Por eso los aliases no son una comodidad: son el único camino para el caso más común del rubro.
//
// Y al revés: «Acerolatina SA» y «Friolatina SA» dan 0,9415 de coseno y son empresas distintas con
// CUIT distinto. El embedding solo las fusionaría.
//
// ═══ ANTE LA DUDA, AMBIGUO ═══
//
// En datos de una empresa, una fusión incorrecta es mucho peor que una sugerencia de más: mete la
// factura de un proveedor en la cuenta de otro. Si dos candidatos pasan el umbral y están cerca
// entre sí, el resultado es `ambiguo` y lo mira una persona.

import { normalizar, embeber, coseno } from './embeddings.mjs'
import { confianzaDeCoseno } from './calibracion.mjs'

/** Los estados posibles de una resolución. Es un enum, no una escala. */
export const ESTADO = Object.freeze({
  AUTO_RESUELTO: 'auto_resuelto',
  SUGERIDO: 'sugerido',
  AMBIGUO: 'ambiguo',
  SIN_MATCH: 'sin_match',
  VERIFICADO_HUMANO: 'verificado_humano',
})

/** Un CUIT/CUIL en sus 11 dígitos, o null si no lo es. No valida el dígito verificador a propósito:
 *  un CUIT mal tipeado no debe convertirse en «no hay CUIT», debe fallar el match y verse. */
export function cuitCanonico(v) {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

/** Similitud de cadenas por trigramas. Es lo que `pg_trgm` hace en Postgres, replicado acá para
 *  poder resolver en memoria sin una ida a la base por candidato. */
export function trigramas(s) {
  const t = `  ${String(s ?? '').toLowerCase()} `
  const out = new Set()
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3))
  return out
}

export function similitudTrigram(a, b) {
  const A = trigramas(a); const B = trigramas(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

/** Índice de aliases por conjunto de palabras, calculado una vez por Map recibido. Se memoiza con
 *  un WeakMap para no recalcularlo en cada consulta de un lote. */
const _idxTokens = new WeakMap()
function aliasesPorTokens(aliases) {
  let idx = _idxTokens.get(aliases)
  if (idx) return idx
  idx = new Map()
  for (const [k, v] of aliases) {
    const clave = String(k).split(' ').filter(Boolean).sort().join(' ')
    if (clave && !idx.has(clave)) idx.set(clave, v)
  }
  _idxTokens.set(aliases, idx)
  return idx
}

/** Una señal que no aplica vale `null`, NUNCA 0: un 0 dice «lo miré y no se parece», y `null` dice
 *  «no había con qué mirarlo». Confundirlos convierte la falta de un dato en evidencia en contra. */
const SIN_SENAL = null

/**
 * Resuelve UNA consulta contra un padrón de candidatos.
 *
 * @param {{nombre:string, cuit?:string, codigo?:string}} consulta
 * @param {Array<{id:*, nombre:string, cuit?:string, codigo?:string}>} padron
 * @param {object} opts
 *   umbrales: { auto, sugerido, margen } — salen del benchmark por entidad, no se inventan acá
 *   aliases: Map<nombreNormalizado, id> verificados
 *   usarEmbeddings: si false, resuelve sin cargar el modelo (para tests y para degradar)
 */
export async function resolverIdentidad(consulta, padron = [], {
  umbrales, aliases = new Map(), usarEmbeddings = true, entidad = 'proveedor',
} = {}) {
  if (!umbrales) throw new Error('resolverIdentidad necesita umbrales: salen del benchmark de la entidad, no de un default')
  const nombreQ = normalizar(consulta?.nombre)
  const cuitQ = cuitCanonico(consulta?.cuit)
  const claveTokens = (t) => normalizar(t).split(' ').filter(Boolean).sort().join(' ')
  const claveQ = claveTokens(consulta?.nombre)
  const base = { entidad, consulta: { nombre: consulta?.nombre ?? null, cuit: cuitQ }, resolverVersion: VERSION }

  if (!nombreQ && !cuitQ) {
    return { ...base, estado: ESTADO.SIN_MATCH, match: null, señales: {}, porQue: 'la consulta no trae ni nombre ni CUIT' }
  }

  // ── 1. IDENTIFICADOR FUERTE. Manda sobre todo lo demás. ──
  if (cuitQ) {
    const porCuit = padron.filter((c) => cuitCanonico(c.cuit) === cuitQ)
    if (porCuit.length === 1) {
      return {
        ...base,
        estado: ESTADO.AUTO_RESUELTO,
        match: porCuit[0],
        señales: { strong_id_score: 1, exact_score: SIN_SENAL, alias_score: SIN_SENAL, fuzzy_score: SIN_SENAL, embedding_score: SIN_SENAL, combined_score: 1 },
        confianza: 1,
        porQue: `CUIT ${cuitQ} coincide con «${porCuit[0].nombre}»`,
      }
    }
    if (porCuit.length > 1) {
      return {
        ...base, estado: ESTADO.AMBIGUO, match: null, candidatos: porCuit,
        señales: { strong_id_score: 1, combined_score: 1 }, confianza: 1,
        porQue: `${porCuit.length} candidatos comparten el CUIT ${cuitQ}: hay duplicados en el padrón, lo resuelve una persona`,
      }
    }
    // EL CUIT NO ESTÁ EN EL PADRÓN. No se cae al parecido de nombres: se declara. Que el nombre se
    // parezca a otro proveedor no lo convierte en ese proveedor — el CUIT dice explícitamente que no.
    const chocan = padron.filter((c) => cuitCanonico(c.cuit) && cuitCanonico(c.cuit) !== cuitQ && normalizar(c.nombre) === nombreQ)
    if (chocan.length) {
      return {
        ...base, estado: ESTADO.AMBIGUO, match: null, candidatos: chocan,
        señales: { strong_id_score: 0, exact_score: 1, combined_score: 0 }, confianza: 0,
        porQue: `el nombre coincide exacto con «${chocan[0].nombre}» pero el CUIT es distinto (${cuitQ} contra ${cuitCanonico(chocan[0].cuit)}): son entidades distintas`,
      }
    }
  }

  // ── 2. EXACTO NORMALIZADO ──
  //
  // Incluye el mismo nombre CON LAS PALABRAS EN OTRO ORDEN. No es una sutileza: el smoke del
  // 04/09 falló justo ahí — «JORGE ROBERTO MARTINEZ» en el registro de cheques y «MARTINEZ JORGE
  // ROBERTO» en ARCA son la misma persona, y el fuzzy los dejaba en 0,139 porque los trigramas de
  // un nombre invertido casi no se tocan. En este rubro la inversión apellido/nombre es la regla,
  // no la excepción: ARCA publica «APELLIDO NOMBRE» y las planillas se escriben al revés.
  //
  // Se compara el conjunto de palabras, no su orden. Sigue siendo un match EXACTO —las mismas
  // palabras, todas— así que no abre la puerta a ningún parecido: «LOPEZ JOSE LUIS» y «GIMENEZ
  // JOSE LUIS» no comparten el conjunto.
  const exactos = padron.filter((c) => nombreQ && (normalizar(c.nombre) === nombreQ || (claveQ && claveTokens(c.nombre) === claveQ)))
  if (exactos.length === 1) {
    return {
      ...base, estado: ESTADO.AUTO_RESUELTO, match: exactos[0],
      señales: { strong_id_score: cuitQ ? 0 : SIN_SENAL, exact_score: 1, alias_score: SIN_SENAL, fuzzy_score: SIN_SENAL, embedding_score: SIN_SENAL, combined_score: 1 },
      confianza: 1,
      porQue: normalizar(exactos[0].nombre) === nombreQ
        ? `el nombre normalizado es idéntico: «${nombreQ}»`
        : `las mismas palabras en otro orden: «${nombreQ}» y «${normalizar(exactos[0].nombre)}»`,
    }
  }
  if (exactos.length > 1) {
    return {
      ...base, estado: ESTADO.AMBIGUO, match: null, candidatos: exactos,
      señales: { exact_score: 1, combined_score: 1 }, confianza: 1,
      porQue: `${exactos.length} candidatos tienen exactamente el mismo nombre normalizado`,
    }
  }

  // ── 3. ALIAS VERIFICADO. Es el único camino para «Corralon Progreso» = «PEREZ GARCIA MARISOL». ──
  //
  // Se busca por el nombre normalizado Y por el conjunto de palabras, por la misma razón que el
  // match exacto: ARCA guarda «MARTINEZ JORGE ROBERTO» y el registro de cheques escribe «JORGE
  // ROBERTO MARTINEZ». Sin esto, el alias resolvía en un sentido y no en el otro — que es peor que
  // no tenerlo, porque el resultado depende de en qué planilla se tipeó el nombre.
  const idAlias = aliases.get(nombreQ) ?? (claveQ ? aliasesPorTokens(aliases).get(claveQ) : undefined)
  if (idAlias != null) {
    const m = padron.find((c) => String(c.id) === String(idAlias))
    if (m) {
      return {
        ...base, estado: ESTADO.AUTO_RESUELTO, match: m,
        señales: { strong_id_score: SIN_SENAL, exact_score: 0, alias_score: 1, fuzzy_score: SIN_SENAL, embedding_score: SIN_SENAL, combined_score: 1 },
        confianza: 1, porQue: `alias verificado: «${nombreQ}» ya fue confirmado como «${m.nombre}» por una persona`,
      }
    }
  }

  // ── 4 y 5. FUZZY Y EMBEDDINGS, sobre los mismos candidatos ──
  const puntuados = []
  for (const c of padron) {
    const n = normalizar(c.nombre)
    if (!n) continue
    puntuados.push({ c, fuzzy: similitudTrigram(nombreQ, n), emb: SIN_SENAL })
  }
  if (!puntuados.length) {
    return { ...base, estado: ESTADO.SIN_MATCH, match: null, señales: {}, porQue: 'el padrón está vacío' }
  }
  puntuados.sort((a, b) => b.fuzzy - a.fuzzy)

  // Los embeddings sólo se calculan sobre los mejores por fuzzy: embeber 3.000 candidatos por
  // consulta costaría 20 s y no cambia el resultado — el que gana está entre los primeros.
  const aEmbeber = puntuados.slice(0, Math.min(20, puntuados.length))
  if (usarEmbeddings) {
    try {
      const vq = await embeber(nombreQ, 'documento')
      for (const p of aEmbeber) {
        const vc = await embeber(p.c.nombre, 'documento')
        p.emb = coseno(vq, vc)
      }
    } catch (e) {
      // El motor no está o no hay RAM: se sigue con fuzzy. Degradar no es fallar.
      base.degradado = `sin embeddings: ${e.message.slice(0, 80)}`
    }
  }

  for (const p of aEmbeber) {
    const cEmb = p.emb == null ? SIN_SENAL : confianzaDeCoseno(p.emb)
    // El combinado toma la señal MÁS FUERTE de las dos, no un promedio: promediar deja que una
    // señal ausente o débil hunda a una fuerte, y con dos señales de naturaleza distinta el
    // promedio no significa nada.
    p.combinado = Math.max(p.fuzzy, cEmb ?? 0)
    p.cEmb = cEmb
  }
  aEmbeber.sort((a, b) => b.combinado - a.combinado)

  const mejor = aEmbeber[0]
  const segundo = aEmbeber[1] ?? null
  const señales = {
    strong_id_score: cuitQ ? 0 : SIN_SENAL,
    exact_score: 0,
    alias_score: aliases.size ? 0 : SIN_SENAL,
    fuzzy_score: Number(mejor.fuzzy.toFixed(4)),
    embedding_score: mejor.cEmb == null ? SIN_SENAL : Number(mejor.cEmb.toFixed(4)),
    combined_score: Number(mejor.combinado.toFixed(4)),
  }
  const porQue = `fuzzy ${mejor.fuzzy.toFixed(3)}${mejor.cEmb == null ? '' : ` · embedding ${mejor.cEmb.toFixed(3)}`}` +
    (segundo ? ` · el segundo («${segundo.c.nombre}») combina ${segundo.combinado.toFixed(3)}` : ' · sin segundo candidato')

  // ── PROTECCIÓN CONTRA COLISIÓN ──
  if (segundo && mejor.combinado >= umbrales.sugerido && (mejor.combinado - segundo.combinado) < umbrales.margen) {
    return {
      ...base, estado: ESTADO.AMBIGUO, match: null, candidatos: [mejor.c, segundo.c],
      señales, confianza: mejor.combinado,
      porQue: `${porQue} — dos candidatos demasiado cerca (margen ${(mejor.combinado - segundo.combinado).toFixed(3)} < ${umbrales.margen}): no se resuelve solo`,
    }
  }
  if (mejor.combinado >= umbrales.auto) {
    return { ...base, estado: ESTADO.AUTO_RESUELTO, match: mejor.c, señales, confianza: mejor.combinado, porQue }
  }
  if (mejor.combinado >= umbrales.sugerido) {
    return { ...base, estado: ESTADO.SUGERIDO, match: mejor.c, señales, confianza: mejor.combinado, porQue }
  }
  return { ...base, estado: ESTADO.SIN_MATCH, match: null, señales, confianza: mejor.combinado, porQue }
}

/** La versión del resolver. Va en cada decisión persistida: sin ella no se puede saber con qué
 *  lógica se resolvió una fusión de hace tres meses. */
export const VERSION = '1.0.0'
