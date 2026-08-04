// INTERPRETAR — de lo que la persona escribió a UNA intención con parámetros.
//
// DOS CAMINOS, Y EL ORDEN NO ES CASUAL. Primero una gramática determinística que cubre el
// vocabulario real del equipo ("recordame el jueves a las 8", "buscame el contrato de la
// Estrella", "agendá reunión con Rodrigo"). Ese camino es el masivo y cuesta CERO. Recién si
// no alcanzó se consulta al modelo, UNA sola vez, con un prompt de cientos de tokens. El
// gasto de API fue históricamente el primer modo de falla de este OS: la asimetría es la
// defensa, no una optimización prematura.
//
// LAS FECHAS NO LAS TOCA NI EL MODELO NI UNA REGEX NUEVA. Las resuelve `tiempo.mjs`, que
// tiene calendario y tests. El modelo, cuando interviene, devuelve la FRASE temporal tal como
// la dijo la persona; la cuenta la hace acá abajo. Un modelo errando el día de la semana no
// se nota hasta que el recordatorio llegó tarde.
//
// VOSEO. Todas las raíces verbales van con el `\b` SÓLO AL INICIO. En JS el boundary es
// ASCII: `/record[aá]\b/` NO matchea "recordá" (la tilde no es `\w`) y `/program[aá]\b/` no
// matchea "programame". Ese bug ya mordió en `schedule-intent.mjs` y la regla quedó escrita
// ahí; acá se respeta igual. Además se compara contra el texto SIN ACENTOS, que elimina de
// raíz media docena de variantes.

import { INTENCION, CAPACIDAD, zSolicitud, TZ_EMPRESA } from './contratos.mjs'
import { parseCuando, quitarTiempo } from './tiempo.mjs'
import { parseCadence } from '../../lib/schedule-intent.mjs'
import { tokenizar, VERBOS_PEDIDO } from '../../lib/drive-busqueda/normalizar.mjs'

const MODELO = process.env.ORQ_ASISTENTE_MODELO || 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 300

/** La pregunta que se hace cuando el pedido es "creá algo con fecha" y nada más. */
export const PREGUNTA_TIPO =
  '¿Querés que lo cree como recordatorio interno, evento de Calendar o tarea de Google Tasks?'

/** Texto para comparar: minúsculas, sin acentos, sin puntuación de sobra. */
export function plano(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Gatillos ─────────────────────────────────────────────────────────────────
// Se evalúan contra el texto PLANO (sin acentos), en el orden de `CLASIFICADORES`.

// Ojo con aflojar esto: "que sabes DE la obra" no es un pedido de ayuda, es una consulta de
// dominio de otro especialista. El gatillo exige la forma completa a propósito.
const RE_AYUDA = /\b(que sabes hacer|que podes hacer|que cosas podes|en que me podes ayudar|en que me ayudas|que funciones (tenes|hay|tiene)|que puedo pedirte|para que servis|como te uso|que se puede pedir)/
const RE_AYUDA_SOLA = /^(ayuda|help|ayudame|\?+)$/

const RE_REC_LISTAR = /\b(que recordatorios|mis recordatorios|list[a-z]* (mis |los )?recordatorios|tengo recordatorios|que me tenes que recordar|que tengo para recordar)/
const RE_REC_CANCELAR = /\b(cancel|borr|elimin|anul|sac)[a-z]* (el |los |mi |mis |ese |este )?recordatorio|\bdeja de recordarme/
const RE_REC_CREAR = /\b(record|avis|acordame|acordate|no me dejes olvidar|no te olvides de)/
const RE_CANCELAR_FRASE = /\b(cancel|borr|elimin|anul|sac)[a-zá]*\s+(el|los|mi|mis|ese|este)?\s*recordatorios?\s*(de|del)?/i

const RE_TAREA = /\b(cre|agreg|anot|sum|pon|met|carg)[a-z]* ?(me|le)? ?(un[ao]? |la |como |a mis |en mis )?tareas?\b|\bnueva tarea\b|\bgoogle tasks\b|\ben (mis|las) tareas\b/
const RE_EVENTO = /\b(agend|(cre|arm|pon|met)[a-z]* (me |le )?(un[ao]? |el |la )?(evento|reunion|meeting|junta)|reunion (con|el|a las|mañana|manana)|en (el|mi) calendario|\bal calendario\b)/

const RE_DRIVE_VERBO = /\b(busc|trae|traeme|pasame|mandame|encontr|consegu|necesito|necesitaria|quiero|queria|dame|donde esta|donde queda|donde tenemos|tenes (el|la|los|las)|mostr|abri|mand)/
// Los verbos que en esta empresa NO significan otra cosa: pedir un archivo. Alcanzan solos,
// sin que la persona nombre el sustantivo. "pasame vision" es un pedido de archivo tanto como
// "pasame el archivo vision", y obligar a decir "archivo" era pedirle a la gente que hable
// como la base de datos. Va ÚLTIMO entre los clasificadores: si el mensaje era un
// recordatorio, una tarea o un evento, esos ya se lo llevaron.
const RE_DRIVE_VERBO_SOLO = /\b(pasame|abrime|mostrame|traeme|mandame|buscame|encontrame|conseguime|donde esta|donde queda|donde tenemos)\b/
const RE_DRIVE_OBJETO = /\b(archivo|carpeta|contrato|factura|planilla|sheet|excel|documento|doc\b|pdf|presupuesto|remito|comprobante|flujo de caja|cash flow|p&l|p y l|informe|acta|plano|certificado|recibo|boleta)/

// "Creá algo para el jueves" sin decir QUÉ tipo de cosa: es el caso que se pregunta.
const RE_CREAR_GENERICO = /\b(cre|arm|pon|anot|carg|met|agreg|program)[a-z]*/
const RE_CALENDARIO_FRASE = /\b(pon[eé][a-z]*|met[eé][a-z]*|carg[aá][a-z]*|agreg[aá][a-z]*)?\s*(en|al)\s+(el\s+|mi\s+)?calendario/i

// Sólo hay recurrencia si la persona la DIJO. `parseCadence` toma un día de semana suelto
// ("el lunes") como semanal — correcto en su contexto original, veneno si se lo llama crudo:
// convertiría "recordame el lunes" en un recordatorio para todos los lunes de la eternidad.
const RE_RECURRENCIA = /\b(todos los|todas las|cada |diariamente|semanalmente|mensualmente)/

const RE_SELF = /\b(recordame|avisame|acordame|recordamelo|avisamelo|record[a-z]*melo|me recordas|me avisas)/
const RE_DESTINATARIO = /\b(?:record|avis|dec|escrib|manda)[a-z]*\s+(?:a|al)\s+(@?[a-záéíóúñ][\wáéíóúñ]*(?:\s+[a-záéíóúñ][\wáéíóúñ]*)?)/i
const CORTE = new Set(['que', 'de', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'y', 'sobre', 'por', 'lo', 'le', 'su', 'en', 'con', 'mañana', 'manana', 'hoy'])

const VERBOS_SOBRANTES = /\b(record[aá][a-z]*|avis[aá][a-z]*|acord[aá][a-z]*|agend[aá][a-z]*|program[aá][a-z]*|cre[aá][a-z]*|arm[aá][a-z]*|anot[aá][a-z]*|agreg[aá][a-z]*|busc[aá][a-z]*|traeme|trae|pas[aá]me|mand[aá][a-z]*|consegu[ií][a-z]*|encontr[aá][a-z]*|mostr[aá][a-z]*|necesito|quiero que|quiero|me pod[eé]s|pod[eé]s|por favor|hac[eé]me)/gi

// ── Piezas comunes ───────────────────────────────────────────────────────────

const RE_FRASE_RECURRENCIA = /\b(?:todos los|todas las|cada)\s+[a-záéíóúñ]+|\b(?:diariamente|semanalmente|mensualmente)\b/i

/** Tiempo + recurrencia del mensaje, resueltos por `tiempo.mjs` (nunca por el modelo). */
function analizarTiempo(texto, ahora) {
  const t = parseCuando(texto, ahora ? { ahora } : {})
  const rec = RE_RECURRENCIA.test(plano(texto)) ? parseCadence(texto) : null
  const spans = [...(t?.spans ?? [])]
  // "todos los lunes" se saca ANTES que "lunes": si no, queda un "todos los" huérfano
  // pegado al contenido del recordatorio.
  const frase = rec ? texto.match(RE_FRASE_RECURRENCIA) : null
  if (frase) spans.unshift(frase[0])
  return {
    cuando: t?.instante ?? null,
    conHora: t?.conHora ?? false,
    cadencia: rec?.cadence ?? null,
    spans,
    ambiguo: t?.ambiguo === true,
    opciones: t?.opciones ?? [],
  }
}

/** Lo que queda del mensaje cuando se le sacan el tiempo, los verbos de pedido y la mención. */
function contenidoDe(texto, spans, extras = []) {
  let d = quitarTiempo(texto, spans)
  for (const e of extras) if (e) d = d.replace(e, ' ')
  d = d.replace(/^\s*@\w+[,:\s]+/, ' ').replace(/@\w+/g, ' ')
  d = d.replace(VERBOS_SOBRANTES, ' ')
  d = d.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3; i++) {
    d = d.replace(/^(que|de|a|al|el|la|los|las|un|una|para|,|:|;|\.|-)\s+/i, '').trim()
    d = d.replace(/\s+(que|de|a|al|el|la|los|las|para|en|con|y)$/i, '').trim()
  }
  return d.replace(/\s+([.,;:])/g, '$1').replace(/[,:;-]+$/, '').trim()
}

/** A quién apunta el pedido: null = a quien lo pide. */
function destinatarioDe(texto) {
  if (RE_SELF.test(plano(texto))) return null
  const m = texto.match(RE_DESTINATARIO)
  if (!m) return null
  const partes = m[1].trim().split(/\s+/)
  if (partes.length > 1 && CORTE.has(plano(partes[1]))) partes.pop()
  const nombre = partes.join(' ').replace(/^@/, '')
  return CORTE.has(plano(nombre)) ? null : nombre
}

const RE_DURACION = /\b(?:de|por|dura[a-z]*)\s+(\d{1,3}|una|dos|tres|media)\s*(horas?|hs\b|h\b|minutos?|min\b)/i
const NUM = { una: 1, dos: 2, tres: 3, media: 0.5 }

function duracionDe(texto) {
  const m = texto.match(RE_DURACION)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM[plano(m[1])]
  if (!n) return null
  return /^h/i.test(m[2]) ? Math.round(n * 60) : Math.round(n)
}

const TIPO_DRIVE = [
  [/\b(planilla|sheet|excel|flujo de caja|cash flow|p&l|p y l)/, 'planilla'],
  [/\b(carpeta)/, 'carpeta'],
  [/\b(pdf|factura|comprobante|remito|boleta|recibo|certificado)/, 'pdf'],
  [/\b(documento|doc\b|acta|informe|contrato)/, 'documento'],
]

// ── Clasificadores ───────────────────────────────────────────────────────────
// Cada uno mira el texto plano y, si es lo suyo, arma la solicitud entera. El ORDEN es la
// desambiguación: "recordame agendar la reunión" es un recordatorio, no un evento, porque el
// verbo que gobierna el pedido es el primero de la lista que aparece.

const CLASIFICADORES = [
  (p) => (RE_AYUDA.test(p) || RE_AYUDA_SOLA.test(p) ? { intencion: CAPACIDAD.AYUDA, parametros: {} } : null),
  (p) => (RE_REC_LISTAR.test(p) ? { intencion: CAPACIDAD.RECORDATORIO_LISTAR, parametros: {} } : null),
  (p, texto) => (RE_REC_CANCELAR.test(p)
    ? { intencion: CAPACIDAD.RECORDATORIO_CANCELAR, parametros: { referencia: contenidoDe(texto, [], [RE_CANCELAR_FRASE]) } }
    : null),
  (p, texto, tiempo) => (RE_REC_CREAR.test(p) ? recordatorio(texto, tiempo) : null),
  (p, texto, tiempo) => (RE_TAREA.test(p) ? tarea(texto, tiempo) : null),
  (p, texto, tiempo) => (RE_EVENTO.test(p) ? evento(texto, tiempo) : null),
  (p, texto) => (RE_DRIVE_VERBO.test(p) && RE_DRIVE_OBJETO.test(p) ? drive(texto) : null),
  // Sin el sustantivo: alcanza el verbo de pedir un archivo, o el sustantivo sin verbo
  // ("archivo vision"). Siempre que quede ALGO para buscar además de la palabra que disparó
  // la regla — "pasame" a secas no es una búsqueda, es una frase a medias.
  (p, texto) => ((RE_DRIVE_VERBO_SOLO.test(p) || RE_DRIVE_OBJETO.test(p)) && hayQueBuscar(texto) ? drive(texto) : null),
  // EL SUSTANTIVO SOLO: "vision", "cash flow", "avances obra".
  //
  // Es cómo pide la gente cuando ya sabe qué quiere, y mandarlo al modelo para que dictamine
  // lo obvio es gastar plata en adivinar. Pero un mensaje corto sin verbo es también la forma
  // de TODO lo demás, así que esta regla reclama con confianza BAJA (`floja`): si otro
  // especialista también lo reclama —"jornales" es de Personal IA— el Director desempata por
  // confianza declarada y gana el otro. Reclamar fuerte acá sería quedarse con media empresa.
  (p, texto, tiempo) => (esSustantivoSuelto(p, tiempo) ? { ...drive(texto), floja: true } : null),
]

/** ¿Queda algo que buscar una vez sacadas las muletillas del pedido? Usa el MISMO
 *  tokenizador que el buscador: si él no va a encontrar términos, esto no es una búsqueda. */
function hayQueBuscar(texto) {
  return tokenizar(texto).length > 0
}

/** Lo que la gente escribe para saludar o asentir. No es una búsqueda de nada. */
const RE_SOCIAL = /^(hola|buenas|buen dia|buenas tardes|buenas noches|gracias|ok|oka|dale|listo|perfecto|barbaro|si|no|chau|nos vemos|como estas|que tal|dsp|despues)\b/
/** Una pregunta abierta ("cuánto llevamos gastado") pide un análisis, no un archivo. */
const RE_PREGUNTA = /^(cuant|cuand|cual|que |qué |quien|quién|como|cómo|por que|por qué|donde no)/
/** Empieza con un número: es la taquigrafía de la carga de asistencia ("3 ausente"), no un
 *  nombre de archivo. Reclamarla sería quitarle a Personal IA su forma de trabajo diaria. */
const RE_EMPIEZA_NUMERO = /^\d/
/** Verbos de OPERACIÓN: quien escribe "cargar asistencia" quiere hacer algo, no leer algo. */
const RE_VERBO_OPERAR = /\b(cargar|carga|registrar|registra|anotar|anota|marcar|marca|actualizar|actualiza|corregir|corrige|cerrar|cierra|aprobar|aprueba)\b/

/**
 * ¿Es un pedido de archivo escrito como un sustantivo suelto?
 *
 * Corto (hasta cuatro palabras útiles), sin fecha, sin pregunta abierta, sin verbo de
 * operación y sin arrancar con un número. Los límites son a propósito: cuanto más larga o
 * más verbal la frase, más probable que sea trabajo de otro dominio y no el nombre de un
 * archivo. Y aun pasando todos los filtros, reclama flojo — el desempate lo hace el Director.
 */
function esSustantivoSuelto(p, tiempo) {
  if (!p || RE_SOCIAL.test(p) || RE_PREGUNTA.test(p)) return false
  if (RE_EMPIEZA_NUMERO.test(p) || RE_VERBO_OPERAR.test(p)) return false
  if (tiempo?.cuando || tiempo?.cadencia) return false
  if (/[¿?]/.test(p)) return false
  const palabras = p.split(' ').filter(Boolean)
  // SIN VERBO. Es lo que separa un nombre de archivo de una orden: "vision" es un sustantivo
  // suelto; "buscá a Juan" tiene verbo y es un pedido —de lo que sea— que no me toca a mí
  // reclamar por las dudas. Los pedidos CON verbo ya los tomó la regla de arriba, que para
  // eso lista los verbos que sólo significan "dame un archivo".
  if (palabras.some((w) => VERBOS_PEDIDO.has(w))) return false
  if (palabras.length > 3) return false
  const t = tokenizar(p)
  return t.length >= 1 && t.length <= 3
}

function recordatorio(texto, tiempo) {
  const destinatario = destinatarioDe(texto)
  const m = destinatario ? texto.match(RE_DESTINATARIO) : null
  const contenido = contenidoDe(texto, tiempo.spans, [m?.[0]])
  return {
    intencion: CAPACIDAD.RECORDATORIO_CREAR,
    parametros: {
      contenido, destinatario, destinatarioUserId: null,
      cuando: tiempo.cuando, cadencia: tiempo.cadencia, zonaHoraria: TZ_EMPRESA,
    },
    faltantes: [
      ...(contenido ? [] : ['contenido']),
      ...(tiempo.cuando || tiempo.cadencia ? [] : ['cuando']),
    ],
  }
}

function tarea(texto, tiempo) {
  const titulo = contenidoDe(texto, tiempo.spans, [/\b(como |una |la |a mis |en mis |mis )?tareas?\b/i])
  return {
    intencion: CAPACIDAD.TASKS_TAREA_CREAR,
    parametros: { titulo, notas: null, vence: tiempo.cuando, lista: '@default' },
    faltantes: titulo ? [] : ['titulo'],
  }
}

function evento(texto, tiempo) {
  // Los invitados se leen sobre el texto YA SIN las frases temporales: si no,
  // "con Rodrigo el jueves a las 10" convierte media oración en un nombre propio.
  const invitacion = invitacionDe(quitarTiempo(texto, tiempo.spans).replace(RE_DURACION, ' '))
  const dicho = tituloDicho(texto)
  // El orden de los `extras` importa: la duración se saca ANTES que el "con Fulano" anclado
  // al final, o "con Rodrigo … de 2 horas" deja de estar al final y no se limpia. La frase de
  // los invitados sale también: "agregános a mí y a Rodrigo de invitados" es a QUIÉN se
  // invita, no de qué se trata la reunión.
  const titulo = dicho ?? contenidoDe(texto, tiempo.spans,
    [RE_DURACION, RE_CALENDARIO_FRASE, invitacion.frase, /\bcon\s+[a-záéíóúñ\s]+$/i])
  return {
    intencion: CAPACIDAD.CALENDAR_EVENTO_CREAR,
    parametros: {
      titulo, inicio: tiempo.cuando, fin: null, duracionMin: duracionDe(texto),
      descripcion: null, participantes: [], invitados: invitacion.nombres,
    },
    faltantes: [...(titulo ? [] : ['titulo']), ...(tiempo.cuando ? [] : ['inicio'])],
  }
}

// ── El título, cuando la persona lo DIJO ─────────────────────────────────────
//
// «q el titulo sea "Reu Alonso Construcciones"» y el evento salió llamándose «evento para a mi
// y a rodrigo de invitados y q el titulo sea "Reu Alonso Construcciones"». El dato estaba
// escrito, entre comillas y anunciado: no había nada que inferir. Un título entre comillas es
// un DATO EXPLÍCITO, y un dato explícito le gana siempre a lo que quede de limpiar la frase.

/** Cualquiera de las comillas que se usan en el chat, rectas o tipográficas. */
const RE_COMILLADO = /["“”«»]([^"“”«»\n]{2,90})["“”«»]/g
/** Las formas de anunciar el título. Si aparece, manda la comilla que viene DESPUÉS. */
const RE_ANUNCIO_TITULO = /\b(?:el\s+)?t[ií]tulo\s+(?:sea|es|va a ser)|\bque\s+se\s+llame\b|\bq\s+se\s+llame\b|\btitulal[oa]\b|\bllamal[oa]\b|\b(?:con|de)\s+t[ií]tulo\b/i

/**
 * El título que la persona escribió entre comillas, o null si no escribió ninguno.
 *
 * Con anuncio ("el título sea …", "que se llame …") gana la primera comilla posterior al
 * anuncio; sin anuncio, la primera del mensaje. Se devuelve TAL CUAL se escribió: mayúsculas,
 * acentos y espacios son del dueño, no del parser.
 */
function tituloDicho(texto) {
  const t = String(texto ?? '')
  const citas = [...t.matchAll(RE_COMILLADO)].map((m) => ({ valor: m[1].trim(), desde: m.index ?? 0 }))
    .filter((c) => c.valor.length >= 2)
  if (!citas.length) return null
  const anuncio = t.match(RE_ANUNCIO_TITULO)
  const elegida = anuncio ? citas.find((c) => c.desde > (anuncio.index ?? 0)) : null
  return (elegida ?? citas[0]).valor
}

// ── A quién se invita ────────────────────────────────────────────────────────

/** Una enumeración de personas: "a mí y a Rodrigo", "a Juan, a Pedro y a Ana". */
const RE_LISTA_A = /\ba\s+@?[a-záéíóúñ][\wáéíóúñ.]*(?:(?:\s*,\s*|\s+y\s+|\s+e\s+)(?:a\s+)?@?[a-záéíóúñ][\wáéíóúñ.]*)*/gi
/** El rótulo con el que se cierra la enumeración: "… de invitados", "… como invitados". */
const RE_ROTULO_INVITADOS = /\b(?:de|como)\s+invitad[oa]s?\b/i
/** El verbo: "invitá a Rodrigo y a Juan Pablo". */
const RE_VERBO_INVITAR = /\binvit[aá][a-z]*\s+((?:a\s+)?[a-záéíóúñ@][\wáéíóúñ.@,\sy]{1,60})$/i
/** La forma clásica, anclada al final: "reunión con Rodrigo y Juan Pablo". */
const RE_CON_FINAL = /\bcon\s+([a-záéíóúñ@][\wáéíóúñ.@\s]{1,60})$/i

/** "a mí y a Rodrigo" → ['mi', 'Rodrigo']. Nombres como se dijeron; los resuelve el router. */
function nombresDeLista(texto) {
  return String(texto ?? '')
    .split(/\s*,\s*|\s+y\s+|\s+e\s+/)
    .map((s) => s.trim().replace(/^al?\s+/i, '').replace(/^@/, '').trim())
    .filter((s) => s.length > 1)
    .slice(0, 5)
}

/**
 * A quién hay que invitar, y con qué frase lo dijo.
 *
 * Tres formas, en orden: el rótulo ("… de invitados"), el verbo ("invitá a …") y el "con …"
 * final que ya existía. La `frase` se devuelve para sacarla del título — el defecto del 03/08
 * fue exactamente ese: la lista de invitados terminó siendo el nombre de la reunión.
 *
 * @returns {{nombres:string[], frase:string|null}}
 */
function invitacionDe(texto) {
  const t = String(texto ?? '')
  const rotulo = t.match(RE_ROTULO_INVITADOS)
  if (rotulo) {
    const previo = t.slice(0, rotulo.index)
    const listas = [...previo.matchAll(RE_LISTA_A)]
    const ultima = listas[listas.length - 1]
    if (ultima) {
      return {
        nombres: nombresDeLista(ultima[0]),
        frase: t.slice(ultima.index ?? 0, (rotulo.index ?? 0) + rotulo[0].length),
      }
    }
  }
  const verbo = t.match(RE_VERBO_INVITAR)
  if (verbo) return { nombres: nombresDeLista(verbo[1]), frase: verbo[0] }
  const con = t.match(RE_CON_FINAL)
  if (con) return { nombres: nombresDeLista(con[1]), frase: null }
  return { nombres: [], frase: null }
}

function drive(texto) {
  const p = plano(texto)
  const terminos = contenidoDe(texto, [])
  const tipo = (TIPO_DRIVE.find(([re]) => re.test(p)) ?? [null, 'cualquiera'])[1]
  return { intencion: CAPACIDAD.DRIVE_BUSCAR, parametros: { terminos, tipo }, faltantes: terminos ? [] : ['terminos'] }
}

// ── Camino determinístico ────────────────────────────────────────────────────

/**
 * Clasifica sin gastar un centavo. Devuelve una solicitud, o null si no reconoció nada
 * (recién ahí tiene sentido preguntarle a un modelo).
 * @param {string} texto
 * @param {{ahora?:Date}} [o]
 */
export function interpretarDeterministico(texto, { ahora } = {}) {
  const original = String(texto ?? '').trim()
  if (!original) return null
  const p = plano(original)
  const tiempo = analizarTiempo(original, ahora)

  for (const clasificar of CLASIFICADORES) {
    const r = clasificar(p, original, tiempo)
    if (!r) continue
    return armar(r, tiempo)
  }

  // Pidió CREAR algo con fecha, pero no dijo de qué forma. Adivinar entre recordatorio,
  // evento y tarea es exactamente el error que el usuario no perdona: se pregunta.
  if (RE_CREAR_GENERICO.test(p) && (tiempo.cuando || tiempo.cadencia)) {
    return zSolicitud.parse({
      intencion: INTENCION.DESCONOCIDO, via: 'deterministico', confianza: 0.5,
      parametros: { contenido: contenidoDe(original, tiempo.spans), cuando: tiempo.cuando, cadencia: tiempo.cadencia },
      ambiguedad: PREGUNTA_TIPO,
    })
  }
  return null
}

/** Solicitud final: agrega la ambigüedad de fecha que haya declarado `tiempo.mjs`. */
function armar(r, tiempo) {
  const ambiguedad = tiempo.ambiguo && r.intencion !== CAPACIDAD.AYUDA
    ? `Ese día tiene dos lecturas. ¿Cuál es?`
    : null
  return zSolicitud.parse({
    // `floja` = lo reconoció una regla laxa (el sustantivo suelto). Por debajo de la
    // confianza neutra con la que el Director trata a un especialista que no declara la
    // suya: ante un empate, el del dominio gana y el asistente se corre.
    intencion: r.intencion, via: 'deterministico', confianza: r.floja ? 0.4 : 1,
    parametros: r.parametros, faltantes: r.faltantes ?? [], ambiguedad,
    // Las dos lecturas del día son la materia prima de la pregunta que hace el router. Van
    // DENTRO del contrato: colgadas del objeto, el `parse()` de cualquier capa las tiraba.
    opcionesTiempo: ambiguedad ? tiempo.opciones : [],
  })
}

// ── Camino con modelo (una llamada, sólo si hizo falta) ──────────────────────

const ESQUEMA = `{"intencion":"<id de la lista>","frase_temporal":"<lo que dijo sobre cuándo, o null>",
"destinatario":"<a quién, o null>","contenido":"<de qué se trata>","confianza":<0..1>}`

/**
 * Le pide al modelo UNA cosa: elegir una capacidad de una lista cerrada y separar el
 * contenido de la frase temporal. No redacta, no ejecuta, no ve el historial del canal ni un
 * solo dato de la empresa — y por eso el prompt entra en pocos cientos de tokens.
 *
 * COSTO JUSTIFICADO: es la única llamada del asistente, y sólo ocurre cuando la gramática no
 * reconoció el mensaje. Sin clave, sin crédito o con una salida que no valida ⇒ `desconocido`,
 * nunca una capacidad adivinada: una capacidad adivinada crea un evento que nadie pidió.
 */
export async function interpretarConModelo(texto, ctx = {}) {
  const { apiKey = process.env.ANTHROPIC_API_KEY, fetchImpl = globalThis.fetch, modelo = MODELO } = ctx
  const catalogo = ctx.catalogo ?? ''
  if (!apiKey || typeof fetchImpl !== 'function' || !catalogo) return null

  const prompt = [
    'Sos el intérprete del asistente interno de una constructora. Clasificá el pedido en UNA',
    'de estas capacidades. No respondas el pedido, no inventes datos.',
    '', 'Capacidades:', catalogo, '',
    `Quien escribe: ${String(ctx.quienPide ?? 'una persona de la empresa').slice(0, 60)}`,
    `Mensaje: ${String(texto).slice(0, 500)}`,
    '',
    'Respondé SÓLO este JSON, sin texto alrededor. Si no corresponde a ninguna, intencion="desconocido".',
    'NO calcules fechas: copiá la frase temporal tal como está escrita.',
    ESQUEMA,
  ].join('\n')

  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: MAX_TOKENS, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return null
    const j = await res.json()
    return desdeModelo(j?.content?.[0]?.text, texto, ctx)
  } catch { return null }
}

/** Salida cruda del modelo → solicitud válida, o null. La fecha se recalcula acá. */
function desdeModelo(crudo, texto, ctx) {
  const m = String(crudo ?? '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let j
  try { j = JSON.parse(m[0]) } catch { return null }
  const permitidas = new Set(ctx.idsHabilitados ?? Object.values(CAPACIDAD))
  if (!permitidas.has(j.intencion)) return null

  const tiempo = analizarTiempo(j.frase_temporal ? String(j.frase_temporal) : texto, ctx.ahora)
  const contenido = String(j.contenido ?? '').trim() || contenidoDe(texto, tiempo.spans)
  const base = { cuando: tiempo.cuando, cadencia: tiempo.cadencia, contenido, titulo: contenido, terminos: contenido }
  const parametros = parametrosPorIntencion(j.intencion, base, j.destinatario ? String(j.destinatario) : null)
  const sol = { intencion: j.intencion, via: 'modelo', confianza: Number(j.confianza ?? 0.6), parametros }
  const r = zSolicitud.safeParse(sol)
  return r.success ? r.data : null
}

/**
 * Cada capacidad nombra sus parámetros a su manera; acá se traduce una sola vez.
 * EXPORTADA porque el router la necesita para el mismo contenido después de una aclaración:
 * cuando la persona elige "que sea un evento", lo entendido tiene que reetiquetarse
 * (`contenido`→`titulo`, `cuando`→`inicio`) y esa tabla de equivalencias vive acá, una vez.
 */
export function parametrosPorIntencion(intencion, b, destinatario = null) {
  if (intencion === CAPACIDAD.RECORDATORIO_CREAR) {
    return { contenido: b.contenido, destinatario, destinatarioUserId: null, cuando: b.cuando, cadencia: b.cadencia, zonaHoraria: TZ_EMPRESA }
  }
  if (intencion === CAPACIDAD.CALENDAR_EVENTO_CREAR) {
    return { titulo: b.titulo, inicio: b.cuando, fin: null, duracionMin: null, descripcion: null, participantes: [], invitados: destinatario ? [destinatario] : [] }
  }
  if (intencion === CAPACIDAD.TASKS_TAREA_CREAR) return { titulo: b.titulo, notas: null, vence: b.cuando, lista: '@default' }
  if (intencion === CAPACIDAD.DRIVE_BUSCAR) return { terminos: b.terminos, tipo: 'cualquiera' }
  return {}
}

// ── API principal ────────────────────────────────────────────────────────────

/**
 * Interpreta un mensaje. Primero gratis; el modelo sólo si hizo falta.
 * @param {string} texto
 * @param {{catalogo?:string, idsHabilitados?:string[], quienPide?:string, ahora?:Date,
 *          apiKey?:string, fetchImpl?:Function, modelo?:string}} [ctx]
 * @returns {Promise<import('zod').infer<typeof zSolicitud>>}
 */
export async function interpretar(texto, ctx = {}) {
  const det = interpretarDeterministico(texto, ctx)
  if (det) return det
  const porModelo = await interpretarConModelo(texto, ctx)
  if (porModelo) return porModelo
  return zSolicitud.parse({ intencion: INTENCION.DESCONOCIDO, via: 'modelo', confianza: 0, parametros: {} })
}
