// LA MEMORIA CONVERSACIONAL DE XSAS — lo hablado sobrevive al chat, sin transcripts en el modelo.
//
// ═══ TRES CAPAS, DOS YA EXISTÍAN ═══
//
// · CHAT RAW        → `orq.xsas_mensaje` (acá): cada mensaje original, evidencia histórica.
// · TRABAJO         → `orq.xsas_contexto` (xsas-contexto.mjs): estado de UNA conversación.
// · CONSOLIDADA     → `orq.xsas_memoria` (acá): hechos reutilizables ENTRE conversaciones.
//
// ═══ HECHO ≠ CONVERSACIÓN ═══
//
// Que alguien lo haya dicho no lo hace verdad empresarial: cada memoria guarda QUIÉN lo dijo,
// CUÁNDO, en QUÉ conversación y mensaje, y con qué ESTADO (mencionado ≠ decidido ≠ confirmado).
// Superar una memoria no borra la historia: la fila vieja queda con estado 'superado' y la
// genealogía (`supersede_a` / `superada_por`) une las dos.
//
// ═══ MEMORIA ≠ LEARNING ═══
//
// «decidimos usar el proveedor Y en la obra Z» es una decisión contextual y vive acá. «el
// proveedor Y es mejor para este tipo de obra» sería conocimiento general y exige evidencia de
// outcomes (`xsas-aprendizaje.mjs`). Este módulo NUNCA escribe aprendizaje.
//
// ═══ DETERMINÍSTICO Y AISLADO POR ACTOR ═══
//
// Extracción, consolidación y recuperación son patrones + SQL: cero llamadas a modelo. Toda
// lectura filtra por el actor que puso el SERVIDOR; compartir memoria entre actores requerirá
// una decisión explícita del dueño. Los extractores pecan de cortos: un falso negativo deja la
// frase sin memoria (recuperable); un falso positivo inventaría un hecho.

const TOPE_MENSAJE = 20_000       // el raw es evidencia, no un vertedero: se acota, no se reescribe
const TOPE_CONTENIDO = 500        // una memoria es una frase, no un documento
const TOPE_VIGENTES = 400         // cuántas memorias vigentes se traen para consolidar/recuperar
const MAX_RECUPERADAS = 5         // recuperación JIT: pocas memorias útiles, no el historial

/** Normaliza para comparar: minúsculas, sin acentos, sin puntuación pegada. PURA. */
export function normalizarMemoria(texto) {
  return String(texto ?? '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:()«»"']/g, ' ').replace(/\s+/g, ' ').trim()
}

const STOPWORDS = new Set([
  'para', 'esta', 'este', 'esa', 'ese', 'esos', 'esas', 'con', 'por', 'que', 'una', 'uno', 'unos',
  'unas', 'los', 'las', 'del', 'las', 'nos', 'sobre', 'como', 'cuando', 'donde', 'entre', 'desde',
  'hasta', 'vamos', 'usar', 'usamos', 'decidimos', 'elegimos', 'acordamos', 'cambiamos', 'pasamos',
  'queda', 'quedamos', 'ahora', 'partir', 'finalmente', 'tambien', 'despues', 'siempre', 'nunca',
  'todo', 'toda', 'todos', 'todas', 'hay', 'ser', 'era', 'eran', 'son', 'esta', 'estan', 'tiene',
  'tienen', 'mas', 'menos', 'muy', 'bien', 'mal', 'dije', 'dijiste', 'ayer', 'hoy',
])

/** Palabras significativas de una frase, para tema y búsqueda. PURA. */
export function palabrasTema(texto) {
  return [...new Set(normalizarMemoria(texto).split(' ')
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w)))]
}

// Sustantivos genéricos que siguen a «obra/cliente/de» sin nombrar a nadie.
const NO_ENTIDAD = new Set([
  'obra', 'obras', 'cliente', 'clientes', 'proyecto', 'empresa', 'caja', 'banco', 'semana', 'mes',
  'proveedor', 'proveedores', 'material', 'materiales', 'plano', 'planos', 'cotizacion', 'anio',
])

/**
 * Entidades nombradas en la frase: lo que sigue a «obra …», «cliente …», «proyecto …» o «de …».
 * Determinístico y conservador — detecta el nombre pegado al rótulo, no analiza gramática. PURA.
 */
export function entidadesEn(texto) {
  const norm = normalizarMemoria(texto)
  const out = new Set()
  for (const m of norm.matchAll(/\b(?:obra|cliente|proyecto|de)\s+(?:la\s+|el\s+|los\s+|las\s+)?([a-z][a-z0-9-]{3,})/g)) {
    const w = m[1]
    if (!STOPWORDS.has(w) && !NO_ENTIDAD.has(w)) out.add(w)
  }
  return [...out]
}

const ES_PREGUNTA = /\?|^\s*(?:que|cual|cuales|como|cuanto|cuanta|cuantos|donde|quien|por que|porque)\b/

const GATILLO_DECISION = /\b(?:decidimos|decidi|elegimos|acordamos|quedamos en|queda decidido|vamos a usar|usemos|usaremos|cambiamos a|pasamos a|a partir de ahora|el criterio (?:es|va a ser)|la regla (?:es|va a ser))\b/
const GATILLO_CONFIRMACION = /\b(?:confirmo|confirmamos|queda confirmado|esta confirmado)\b/
const GATILLO_DATO = /\b(?:es|son|mide|miden|tiene|tienen|vale|cuesta|salen?)\s+(?:de\s+|unos\s+)?[$\d]/

/**
 * Candidatas a memoria en un mensaje de usuario: frases con un gatillo explícito de decisión,
 * confirmación o dato. NO guarda cada frase — una charla sin gatillos no produce memoria. PURA.
 */
export function extraerCandidatas(texto) {
  const out = []
  for (const cruda of String(texto ?? '').split(/[.;\n]+/)) {
    const frase = cruda.trim()
    if (!frase || frase.split(/\s+/).length < 4) continue
    const norm = normalizarMemoria(frase)
    if (ES_PREGUNTA.test(norm)) continue
    let estado = null
    if (GATILLO_CONFIRMACION.test(norm)) estado = 'confirmado'
    else if (GATILLO_DECISION.test(norm)) estado = 'decidido'
    else if (GATILLO_DATO.test(norm)) estado = 'mencionado'
    if (!estado) continue
    out.push({
      contenido: frase.slice(0, TOPE_CONTENIDO),
      estado,
      tema: palabrasTema(frase),
      entidades: entidadesEn(frase),
    })
  }
  return out
}

const GATILLO_CORRECCION = /\b(?:estaba mal|estuvo mal|era incorrecto|me equivoque|te corrijo|corrijo|no era asi|no es asi)\b/

/**
 * ¿El mensaje corrige algo dicho antes? Devuelve `{es, nuevo, viejo}` — el par de valores cuando
 * la frase lo trae («son 450 m², no 540» / «no son 540, son 450»), o nulls si sólo hay gatillo. PURA.
 */
export function detectarCorreccion(texto) {
  const norm = normalizarMemoria(texto)
  const es = GATILLO_CORRECCION.test(norm)
  if (!es) return { es: false, nuevo: null, viejo: null }
  let m = norm.match(/\bno (?:es|son|era|eran)\s+(.+?)\s+(?:es|son|sino)\s+(.+?)(?:\s+(?:porque|ya que)\b|$)/)
  if (m) return { es: true, viejo: m[1].trim(), nuevo: m[2].trim() }
  m = norm.match(/\b(?:es|son|era|eran)\s+(.+?)\s+no\s+(.+?)(?:\s+(?:porque|ya que)\b|$)/)
  if (m) return { es: true, nuevo: m[1].trim(), viejo: m[2].trim() }
  return { es: true, nuevo: null, viejo: null }
}

// ═══ ¿ESTA FRASE PREGUNTA POR LA MEMORIA? ═══
//
// Se detecta la INTENCIÓN («qué habíamos decidido», «por qué elegimos», «seguí con lo de X»), no
// el objeto: el resto de la frase queda como filtro de tema. Los aspectos de ESTA conversación
// (referenciaContextual) corren antes en el gateway; acá se llega cuando el chat es nuevo.
const PIDE = [
  ['decision', /\b(?:que|cual)(?: es| era)? (?:habiamos |hemos |se habia |ya )?(?:decidido|acordado|definido)\b|\bque (?:decidimos|acordamos|definimos)\b|\b(?:cual|que) (?:es|era) el criterio\b|\bque criterio (?:usamos|acordamos|quedo)\b/],
  ['porque', /\bpor ?que (?:lo )?(?:hicimos|decidimos|elegimos|usamos|cambiamos|acordamos|definimos)\b/],
  ['pendiente', /\bque (?:quedo|quedaba|habia quedado|nos quedo) pendiente\b|\bque (?:nos )?falta(?:ba)? (?:hacer|cerrar|resolver)\b/],
  ['retomar', /\bsegui(?:me)? con lo (?:que|de)\b|\bretom(?:a|emos|alo)\b|\bcontinu(?:a|emos) con lo (?:que|de)\b|\blo que (?:habiamos|veniamos) (?:hablado|hablando|charlado|visto)\b|\bel mismo criterio que (?:acordamos|usamos)\b/],
]

/**
 * Clasifica la frase como consulta de memoria: `{es, aspecto, resto}`. Para los aspectos de
 * pregunta el gatillo tiene que ESTAR preguntando (arranca la frase, o hay «?», o un «decime»):
 * «hacé lo que decidimos ayer» es una orden y no se secuestra. PURA.
 */
export function pideMemoria(texto) {
  const conSigno = /\?/.test(String(texto ?? ''))
  const norm = normalizarMemoria(texto)
  const pideDecir = /^(?:decime|mostrame|recordame|contame|me record)/.test(norm)
  for (const [aspecto, re] of PIDE) {
    const m = norm.match(re)
    if (!m) continue
    if (aspecto !== 'retomar' && !(conSigno || pideDecir || m.index === 0)) continue
    return { es: true, aspecto, resto: norm.replace(re, ' ').trim() }
  }
  return { es: false, aspecto: null, resto: null }
}

// ═══ PERSISTENCIA — nada de acá lanza: perder memoria degrada la continuidad, no la respuesta ═══

/** Guarda un mensaje RAW. El contenido se acota, jamás se reescribe. */
export async function guardarMensaje(query, { conversationId, messageId, actorId, emisor, contenido, adjuntos = null }) {
  if (!query || !conversationId || !actorId || !contenido) return false
  try {
    await query(
      `insert into orq.xsas_mensaje (conversation_id, message_id, actor_id, emisor, contenido, adjuntos)
       values ($1,$2,$3,$4,$5,$6)`,
      [String(conversationId), String(messageId ?? ''), String(actorId), emisor,
        String(contenido).slice(0, TOPE_MENSAJE), adjuntos ? JSON.stringify(adjuntos) : null],
    )
    return true
  } catch { return false }
}

async function vigentesDe(query, actorId) {
  const { rows } = await query(
    `select id, tema, entidades, contenido, estado, supersede_a, conversation_id, message_id, creado_en
       from orq.xsas_memoria where actor_id = $1 and vigente = true
       order by creado_en desc limit ${TOPE_VIGENTES}`,
    [String(actorId)],
  )
  return rows ?? []
}

async function insertarMemoria(query, { actorId, m, conversationId, messageId, supersedeA = null }) {
  const { rows } = await query(
    `insert into orq.xsas_memoria (actor_id, tema, entidades, contenido, estado, supersede_a, dicho_por, conversation_id, message_id)
     values ($1,$2,$3,$4,$5,$6,$1,$7,$8) returning id`,
    [String(actorId), m.tema ?? [], m.entidades ?? [], m.contenido, m.estado, supersedeA,
      String(conversationId), messageId ?? null],
  )
  return rows?.[0]?.id ?? null
}

async function superarMemoria(query, { id, superadaPor }) {
  await query(
    `update orq.xsas_memoria set vigente = false, estado = 'superado', superada_por = $2 where id = $1`,
    [id, superadaPor],
  )
}

/** ¿La candidata habla del mismo asunto que la memoria existente? Conservador: dos palabras de
 *  tema en común, o una más la misma entidad. Entidades distintas NUNCA se mezclan. PURA. */
export function comparteTema(a, b) {
  const ta = new Set(a.tema ?? []); const tb = b.tema ?? []
  const solape = tb.filter((w) => ta.has(w)).length
  const ea = new Set(a.entidades ?? []); const eb = b.entidades ?? []
  const entidadComun = eb.some((e) => ea.has(e))
  if (ea.size && eb.length && !entidadComun) return false
  return solape >= 2 || (solape >= 1 && entidadComun)
}

/**
 * Consolida un mensaje de usuario en memoria: CREA hechos nuevos, ACTUALIZA por supersesión los
 * que cambiaron, marca CONFLICTO cuando una corrección alcanza a más de un asunto y no puede
 * decidir. No duplica el mismo hecho. Determinístico, nunca lanza.
 */
export async function consolidar(query, { actorId, conversationId, messageId, texto }) {
  const nada = { creadas: 0, superadas: 0, conflictos: 0 }
  if (!query || !actorId || !conversationId) return nada
  try {
    const correccion = detectarCorreccion(texto)
    let candidatas = extraerCandidatas(texto)
    if (!correccion.es && !candidatas.length) return nada
    const vigentes = await vigentesDe(query, actorId)
    const r = { creadas: 0, superadas: 0, conflictos: 0 }

    if (correccion.es && correccion.viejo) {
      const tocadas = vigentes.filter((m) => normalizarMemoria(m.contenido).includes(correccion.viejo))
      const nueva = {
        contenido: String(texto).trim().slice(0, TOPE_CONTENIDO),
        estado: 'decidido',
        tema: palabrasTema(texto),
        entidades: entidadesEn(texto),
      }
      const entidadesDistintas = new Set(tocadas.flatMap((m) => m.entidades ?? [])).size > 1
        && tocadas.some((m, i) => i > 0 && !comparteTema(m, tocadas[0]))
      if (tocadas.length > 1 && entidadesDistintas) {
        // Dos asuntos distintos contienen el valor corregido: elegir en silencio sería inventar.
        await insertarMemoria(query, { actorId, m: { ...nueva, estado: 'conflicto' }, conversationId, messageId })
        r.conflictos += 1
      } else {
        const id = await insertarMemoria(query, { actorId, m: nueva, conversationId, messageId, supersedeA: tocadas[0]?.id ?? null })
        for (const t of tocadas) { await superarMemoria(query, { id: t.id, superadaPor: id }); r.superadas += 1 }
        r.creadas += 1
      }
      // La frase de la corrección no se vuelve a guardar como dato suelto.
      candidatas = candidatas.filter((c) => !String(texto).includes(c.contenido) || c.estado !== 'mencionado')
    }

    for (const c of candidatas) {
      if (vigentes.some((m) => normalizarMemoria(m.contenido) === normalizarMemoria(c.contenido))) continue
      const supera = (c.estado === 'decidido' || c.estado === 'confirmado')
        ? vigentes.filter((m) => m.estado !== 'mencionado' && comparteTema(c, m))
        : []
      const id = await insertarMemoria(query, { actorId, m: c, conversationId, messageId, supersedeA: supera[0]?.id ?? null })
      for (const s of supera) { await superarMemoria(query, { id: s.id, superadaPor: id }); r.superadas += 1 }
      if (id) r.creadas += 1
    }
    return r
  } catch { return nada }
}

/** Recuperación JIT: las POCAS memorias vigentes que hablan del asunto, no el historial. */
export async function recuperar(query, { actorId, texto, limite = MAX_RECUPERADAS }) {
  if (!query || !actorId) return []
  try {
    const palabras = new Set(palabrasTema(texto))
    const entidades = new Set(entidadesEn(texto))
    // Sin filtro de tema no hay recuperación: traer «todo lo vigente» es el historial de vuelta.
    if (!palabras.size && !entidades.size) return []
    const vigentes = await vigentesDe(query, actorId)
    return vigentes
      .map((m) => {
        const eMem = m.entidades ?? []
        // La pregunta nombra una entidad y la memoria es de OTRA: no se mezclan obras ni clientes.
        if (entidades.size && eMem.length && !eMem.some((w) => entidades.has(w))) return { m, puntos: 0 }
        const t = (m.tema ?? []).filter((w) => palabras.has(w)).length
        const e = eMem.filter((w) => entidades.has(w) || palabras.has(w)).length
        return { m, puntos: t + e * 2 }
      })
      .filter((x) => x.puntos >= 1)
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, limite)
      .map((x) => x.m)
  } catch { return [] }
}

const fechaCorta = (v) => { try { return new Date(v).toISOString().slice(0, 10) } catch { return '' } }

/** Una memoria dicha con su provenance: estado, fecha y conversación de origen. PURA. */
export function formatearMemoria(m, { superada = null } = {}) {
  const base = `· ${m.contenido} — ${m.estado} el ${fechaCorta(m.creado_en)} (conversación ${m.conversation_id})`
  return superada
    ? `${base}\n  (reemplazó a: «${superada.contenido}», ${fechaCorta(superada.creado_en)})`
    : base
}

/**
 * Contesta una consulta de memoria SIN modelo: decisiones con su genealogía, el porqué con la cita
 * del mensaje original, lo pendiente desde los contextos de trabajo. Devuelve `null` sólo si no
 * hay base; si no hay memoria del asunto lo DICE — no inventa. Nunca lanza.
 */
export async function responderMemoria(query, { actorId, aspecto, texto }) {
  if (!query || !actorId) return null
  try {
    if (aspecto === 'pendiente') return await responderPendiente(query, { actorId, texto })

    // «seguí con lo de X» trae las dos cosas: lo decidido del tema Y lo que quedó pendiente.
    const colaPendiente = aspecto === 'retomar' ? await responderPendiente(query, { actorId, texto }) : null

    const memorias = await recuperar(query, { actorId, texto })
    if (!memorias.length) {
      if (colaPendiente?.datos?.pendientes_en) return colaPendiente
      return {
        respuesta: 'No tengo registrado nada decidido ni hablado sobre eso en nuestras conversaciones. '
          + 'Si lo hablamos con otras palabras, nombrame la obra o el tema exacto.',
        datos: { memorias: [] },
        evidencia: [],
      }
    }
    const bloques = []
    const detalle = []
    for (const m of memorias) {
      let superada = null
      if (m.supersede_a) {
        const { rows } = await query(
          'select contenido, creado_en, conversation_id from orq.xsas_memoria where id = $1 and actor_id = $2',
          [m.supersede_a, String(actorId)],
        )
        superada = rows?.[0] ?? null
      }
      bloques.push(formatearMemoria(m, { superada }))
      detalle.push({
        id: m.id, contenido: m.contenido, estado: m.estado, entidades: m.entidades,
        conversation_id: m.conversation_id, message_id: m.message_id, creado_en: m.creado_en,
        supersede_a: m.supersede_a ?? null,
      })
      if (aspecto === 'porque' && m.message_id) {
        const { rows } = await query(
          'select contenido, creado_en from orq.xsas_mensaje where message_id = $1 and actor_id = $2 limit 1',
          [m.message_id, String(actorId)],
        )
        if (rows?.[0]) bloques.push(`  Origen: lo dijiste el ${fechaCorta(rows[0].creado_en)} — «${String(rows[0].contenido).slice(0, 240)}»`)
      }
    }
    if (colaPendiente?.datos?.pendientes_en) {
      bloques.push('', 'Lo que quedó pendiente:', colaPendiente.respuesta)
    }
    return {
      respuesta: bloques.join('\n'),
      datos: { memorias: detalle },
      evidencia: memorias.map((m) => ({
        que: `memoria ${m.estado}`,
        fuente: `orq.xsas_memoria ${m.id} ← conversación ${m.conversation_id}`,
        cuando: new Date(m.creado_en).toISOString(),
      })),
    }
  } catch { return null }
}

/** Lo pendiente de conversaciones ANTERIORES: se lee de los contextos de trabajo persistidos. */
async function responderPendiente(query, { actorId, texto }) {
  const { rows } = await query(
    `select correlation_id, datos, actualizado_en from orq.xsas_contexto
      where actor_id = $1 order by actualizado_en desc limit 20`,
    [String(actorId)],
  )
  const filtro = new Set([...palabrasTema(texto), ...entidadesEn(texto)])
  const bloques = []
  for (const f of rows ?? []) {
    const d = f.datos ?? {}
    const pendientes = []
    if (d.pendiente?.pregunta) pendientes.push(d.pendiente.pregunta)
    for (const p of d.compuesto?.pendientes ?? []) {
      if (p?.clausula) pendientes.push(`${p.clausula}${p.faltan?.length ? ` (falta: ${p.faltan.join(', ')})` : ''}`)
    }
    if (!pendientes.length) continue
    const textoPend = normalizarMemoria(pendientes.join(' '))
    if (filtro.size && ![...filtro].some((w) => textoPend.includes(w))) continue
    bloques.push(`De la conversación ${f.correlation_id} (${fechaCorta(f.actualizado_en)}):\n${pendientes.map((p) => `· ${p}`).join('\n')}`)
  }
  return {
    respuesta: bloques.length
      ? bloques.join('\n\n')
      : 'No tengo pendientes registrados de conversaciones anteriores sobre eso.',
    datos: { pendientes_en: bloques.length },
    evidencia: bloques.length ? [{ que: 'pendientes de contextos previos', fuente: 'orq.xsas_contexto', cuando: new Date().toISOString() }] : [],
  }
}

/**
 * El registro de un intercambio completo: mensaje del usuario + respuesta de XSAS al RAW, y la
 * consolidación de lo que el USUARIO afirmó (lo que XSAS contesta no es evidencia de nada —
 * borrador propio). Fire-and-forget: nunca lanza, nunca frena la respuesta.
 */
export async function registrarIntercambio(query, { conversationId, messageId, actorId, texto, adjuntos = null, respuesta = null }) {
  if (!query || !conversationId || !actorId || !texto) return { creadas: 0, superadas: 0, conflictos: 0 }
  await guardarMensaje(query, { conversationId, messageId, actorId, emisor: 'usuario', contenido: texto, adjuntos })
  if (respuesta) {
    await guardarMensaje(query, { conversationId, messageId, actorId, emisor: 'xsas', contenido: respuesta })
  }
  // Una consulta de memoria no crea memoria: preguntar no es afirmar.
  if (pideMemoria(texto).es) return { creadas: 0, superadas: 0, conflictos: 0 }
  return consolidar(query, { actorId, conversationId, messageId, texto })
}
