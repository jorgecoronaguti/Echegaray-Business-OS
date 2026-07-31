// POR QUÉ ESTE ARCHIVO Y NO EL OTRO — el ranking, explicable y determinístico.
//
// Drive devuelve "todo lo que contiene el texto" en un orden que no significa nada. Devolver
// el primero es tirar una moneda con el presupuesto de otra obra. Acá cada candidato saca un
// puntaje a partir de señales que se pueden nombrar, y el desglose viaja con el resultado:
// si algún día ordena mal, se puede ver POR QUÉ ordenó mal en vez de adivinar.
//
// Ninguna señal viene de un modelo. Todas se calculan de `name`, `path`, `tipo`,
// `modified_time` y de cuántas veces alguien aceptó ese archivo para esta misma consulta.
//
// La escala está pensada para que las señales de NOMBRE dominen a las de ruta y a la
// frescura: un archivo que se llama como lo pedido gana siempre contra uno que apenas lo
// menciona en la carpeta, por más nuevo que sea. La frescura desempata, no decide.

import { plano, sinExtension, canonico } from './normalizar.mjs'
import { naturalezaDe } from './senales.mjs'

/** Los pesos, en un solo lugar y con nombre. Cambiar el orden de los resultados es cambiar
 *  un número de acá, no leer trescientas líneas. */
export const PESOS = Object.freeze({
  NOMBRE_EXACTO: 1000,      // el nombre ES lo que pidió (ya normalizado)
  NOMBRE_PREFIJO: 400,      // el nombre EMPIEZA con lo que pidió
  NOMBRE_CONTIENE: 200,     // la frase entera aparece dentro del nombre
  TOKEN_NOMBRE: 120,        // cada palabra pedida que está en el nombre, entera
  TOKEN_NOMBRE_PREFIJO: 70, // ídem, pero como prefijo de una palabra del nombre
  TOKEN_NOMBRE_PARCIAL: 35, // ídem, sueltа adentro de una palabra
  TOKEN_RUTA: 25,           // la palabra aparece en la carpeta, no en el nombre
  TODOS_LOS_TOKENS: 250,    // están TODAS las palabras que pidió (en nombre o ruta)
  COBERTURA: 150,           // proporción de lo pedido que se encontró
  CARPETA_EXACTA: 60,       // la carpeta contenedora se llama como algo que pidió
  TIPO_PEDIDO: 80,          // pidió "excel" y esto es una planilla
  ES_CARPETA: -40,          // ante la duda, la gente quiere el archivo, no la carpeta
  PROFUNDIDAD: -4,          // por nivel de anidamiento: lo enterrado suele ser menos probable
  FRESCURA_MAX: 60,         // el desempate por fecha, acotado para que nunca decida solo
  APRENDIZAJE: 90,          // por cada aceptación previa de este archivo para esta consulta
  APRENDIZAJE_PROPIO: 140,  // ídem, pero elegida por ESTA persona: pesa más que la del resto
  APRENDIZAJE_TOPE: 450,

  // ── Qué clase de documento es (ver senales.mjs) ──
  TOKEN_ALIAS: 60,          // la palabra está en cómo el OS llama a esta fuente, no en el nombre
  FUENTE_REGISTRADA: 120,   // el OS lo tiene declarado como fuente de negocio
  FUENTE_VIGENTE: 100,      // …y declarada vigente
  FUENTE_ACTUALIZADA: 80,   // …y al día
  FUENTE_CRITICA: 40,       // …y de criticidad alta
  FUENTE_USO_MAX: 60,       // …y el OS la leyó hace poco
  FUENTE_TOPE: 300,         // techo del bloque: un documento activo no gana por acumulación
  DOC_VIVO: 60,             // Sheet/Doc de Google: se edita, no es una foto de una planilla
  HISTORICO: -200,          // cuelga de "Archivos Viejos", "AÑO 2025" y similares
  COPIA: -120,              // "Copia de …", "algo (1)"
  REEMPLAZADO: -150,        // el propio registro dice que otra fuente lo reemplazó
  ANTIGUEDAD_MAX: -150,     // sin tocar hace mucho; escala, no es un escalón

  // ── Lo que la empresa declara (drive_documento_estado) ──
  ESTADO_CANONICO: 260,     // "éste es EL documento de esto"
  ESTADO_OPERATIVO: 130,    // se usa, sin ser el único
  ESTADO_ARCHIVADO: -260,   // dado de baja a mano: más fuerte que inferirlo por la carpeta
  ESTADO_DUPLICADO: -320,   // es una copia de otro, declarada
  SUCESOR: 240,             // es el documento que reemplazó a otro de esta misma búsqueda

  // ── Alias aprendido (drive_alias_documento) ──
  ALIAS_DOCUMENTO: 320,     // "cuando pedís esto, querés este documento" — se multiplica por
})                          // la confianza del alias, así que un alias flojo pesa poco

/** Cuánto vale cada estado declarado. Fuera de esta tabla no hay estados: agregar uno es
 *  agregar una fila acá y la constante correspondiente. */
const PESO_ESTADO = {
  canonico: 'ESTADO_CANONICO',
  operativo: 'ESTADO_OPERATIVO',
  historico: 'ESTADO_ARCHIVADO',
  archivado: 'ESTADO_ARCHIVADO',
  reemplazado: 'ESTADO_ARCHIVADO',
  duplicado: 'ESTADO_DUPLICADO',
}

/** Desde cuándo empieza a pesar la antigüedad y cuándo llega a su techo. Medio año sin tocar
 *  un documento no dice nada; dos años sí. */
const ANTIGUEDAD_DESDE = 180
const ANTIGUEDAD_HASTA = 730

const DIA_MS = 86_400_000

/** Frescura acotada: hoy vale el máximo, un año vale cero. Nunca da vuelta un resultado por
 *  sí sola — el archivo correcto de 2024 le gana igual a uno irrelevante de ayer. */
export function puntajeFrescura(modificado, ahora = Date.now()) {
  if (!modificado) return 0
  const t = new Date(modificado).getTime()
  if (Number.isNaN(t)) return 0
  const dias = Math.max(0, (ahora - t) / DIA_MS)
  if (dias >= 365) return 0
  return Math.round(PESOS.FRESCURA_MAX * (1 - dias / 365))
}

/**
 * Cuánto castiga el tiempo sin tocar. Escala entre medio año y dos años: un escalón haría que
 * dos archivos gemelos, uno de 179 días y otro de 181, se separaran por nada.
 */
export function puntajeAntiguedad(dias) {
  if (dias == null || dias <= ANTIGUEDAD_DESDE) return 0
  const t = Math.min(1, (dias - ANTIGUEDAD_DESDE) / (ANTIGUEDAD_HASTA - ANTIGUEDAD_DESDE))
  return Math.round(PESOS.ANTIGUEDAD_MAX * t)
}

/**
 * Lo que el OS sabe de este documento como FUENTE: si lo tiene declarado, si está vigente, al
 * día, es crítico y hace cuánto lo usó. Es el bloque que hace que un documento operativo le
 * gane a su versión archivada — acotado a `FUENTE_TOPE` para que no gane por acumulación.
 */
export function puntajeFuente(fuente, ahora = Date.now()) {
  if (!fuente) return 0
  let p = PESOS.FUENTE_REGISTRADA
  if (fuente.vigente) p += PESOS.FUENTE_VIGENTE
  if (fuente.actualizada) p += PESOS.FUENTE_ACTUALIZADA
  if (fuente.critica) p += PESOS.FUENTE_CRITICA
  if (fuente.usadoEn) {
    const t = new Date(fuente.usadoEn).getTime()
    if (!Number.isNaN(t)) {
      const dias = Math.max(0, (ahora - t) / 86_400_000)
      if (dias < 30) p += Math.round(PESOS.FUENTE_USO_MAX * (1 - dias / 30))
    }
  }
  return Math.min(p, PESOS.FUENTE_TOPE)
}

/** Los tramos de una ruta, sin espacios de más. El trim NO es cosmético: hay archivos cuyo
 *  NOMBRE lleva una barra —"Vision / Tracción"— y al partir la ruta dejan tramos como
 *  "Vision " que después se muestran así al dueño. */
const segmentos = (path) => String(path ?? '').split('/').map((x) => x.trim()).filter(Boolean)

/** La carpeta que contiene al archivo, tal como se ve en la ruta. */
export function carpetaDe(path = '') {
  const partes = segmentos(path)
  partes.pop()
  return partes.length ? partes[partes.length - 1] : null
}

/**
 * La ruta legible para mostrarle a una persona: "administracion > Estrategia".
 *
 * Recibe el NOMBRE del archivo y no sólo la ruta, y no por comodidad: hay archivos cuyo
 * nombre lleva una barra —"Vision / Tracción"— y partir la ruta a ciegas los cuenta como dos
 * tramos. Sacando "un" tramo quedaba "… > Vision > Vision": la carpeta repetida, que es
 * justo el tipo de detalle que hace desconfiar de todo lo demás. Con el nombre se puede
 * cortar por donde de verdad termina la carpeta.
 */
export function rutaLegible(path = '', { max = 3, name = null } = {}) {
  const partes = segmentos(path)
  const delNombre = name ? segmentos(name).length : 1
  partes.splice(-Math.min(delNombre, partes.length))
  if (!partes.length) return null
  const visibles = partes.length > max ? ['…', ...partes.slice(-max)] : partes
  return visibles.join(' > ')
}

/**
 * Cuánto pesa UN token pedido contra el nombre del archivo.
 * Palabra entera > prefijo de palabra > pedazo suelto. La diferencia importa: "obra" como
 * palabra en "Avances de Obra" es una señal fuerte; "obra" adentro de "maniobras" no lo es.
 */
function pesoTokenEnNombre(token, palabrasNombre) {
  if (palabrasNombre.includes(token)) return PESOS.TOKEN_NOMBRE
  if (palabrasNombre.some((p) => p.startsWith(token) || token.startsWith(p))) return PESOS.TOKEN_NOMBRE_PREFIJO
  if (palabrasNombre.some((p) => p.includes(token))) return PESOS.TOKEN_NOMBRE_PARCIAL
  return 0
}

/**
 * Todo lo que no es parecido de nombre: qué clase de documento es y qué sabe el OS de él.
 * Se separó de `puntuar` porque son dos preguntas distintas —"¿se parece?" y "¿es este el
 * documento que la empresa usa?"— y mezclarlas hace ilegible a las dos.
 */
function puntuarNaturaleza(nat, sumar, ahora) {
  sumar('fuente_operativa', puntajeFuente(nat.fuente, ahora))
  if (nat.fuente?.reemplazada) sumar('reemplazado', PESOS.REEMPLAZADO)
  if (nat.vivo) sumar('documento_vivo', PESOS.DOC_VIVO)
  if (nat.copia) sumar('copia', PESOS.COPIA)
  sumar('antiguedad', puntajeAntiguedad(nat.dias))

  // LO DECLARADO REEMPLAZA A LO INFERIDO, NO SE SUMA A ELLO.
  //
  // Se cobraba dos veces: un archivo marcado "archivado" se llevaba el castigo por estar
  // declarado Y el castigo por parecer viejo, y en el desglose aparecían las dos líneas como
  // si fueran dos razones distintas. Es una sola. Y en el otro sentido importa más todavía:
  // un documento declarado canónico no puede seguir arrastrando la penalización de la carpeta
  // donde alguien lo guardó — decir "éste es EL documento" tiene que alcanzar.
  if (nat.declarado && PESO_ESTADO[nat.declarado]) {
    sumar(`estado_${nat.declarado}`, PESOS[PESO_ESTADO[nat.declarado]])
  } else if (nat.historico) {
    sumar('historico', PESOS.HISTORICO)
  }
}

/**
 * El aprendizaje: lo que ESTA persona eligió antes pesa más que lo que eligió el resto.
 *
 * Puede ser negativo. "No era ese" resta una aceptación: la corrección de una persona vale lo
 * mismo que su elección, en la dirección contraria. Con el mismo techo, para que diez rechazos
 * no puedan hundir un resultado que de verdad coincide.
 */
function puntuarAprendizaje(aceptaciones, sumar) {
  const { propias = 0, ajenas = 0 } = typeof aceptaciones === 'number'
    ? { ajenas: aceptaciones }
    : (aceptaciones ?? {})
  const p = (propias * PESOS.APRENDIZAJE_PROPIO) + (ajenas * PESOS.APRENDIZAJE)
  if (p === 0) return
  const tope = PESOS.APRENDIZAJE_TOPE
  sumar('aprendizaje', Math.max(-tope, Math.min(p, tope)))
}

/**
 * Puntúa un candidato contra la consulta ya tokenizada.
 *
 * @param {{name:string, path?:string, tipo?:string, is_folder?:boolean, modified_time?:string, depth?:number}} e
 * @param {{frase:string, tokens:string[], tipo?:string|null}} consulta
 * @param {{ahora?:number, aceptaciones?:number|{propias:number,ajenas:number}, fuente?:object|null}} [opts]
 * @returns {{score:number, senales:object}}
 */
export function puntuar(e, consulta, opts = {}) {
  const ahora = opts.ahora ?? Date.now()
  const fuente = opts.fuente ?? null
  const aliasDoc = opts.alias ?? null

  const nombrePlano = plano(sinExtension(e.name))
  const rutaPlana = plano(e.path ?? '')
  const palabrasNombre = nombrePlano.split(' ').filter(Boolean).map(canonico)
  const palabrasRuta = rutaPlana.split(' ').filter(Boolean).map(canonico)
  const frase = plano(consulta.frase ?? '')
  const tokens = consulta.tokens ?? []

  const senales = {}
  let score = 0
  const sumar = (nombre, valor) => { if (valor) { senales[nombre] = (senales[nombre] ?? 0) + valor; score += valor } }

  // ── La frase entera contra el nombre ──
  if (frase && nombrePlano === frase) sumar('nombre_exacto', PESOS.NOMBRE_EXACTO)
  else if (frase && nombrePlano.startsWith(frase)) sumar('nombre_prefijo', PESOS.NOMBRE_PREFIJO)
  else if (frase && nombrePlano.includes(frase)) sumar('nombre_contiene', PESOS.NOMBRE_CONTIENE)

  // ── Token por token ──
  // El tercer lugar donde puede estar lo pedido es CÓMO EL OS LLAMA a esta fuente: "padrón de
  // flota" no está en el nombre del archivo VEHICULOS, pero está en el registro.
  const alias = (fuente?.tokens ?? []).map(canonico)
  let enNombre = 0
  let enRuta = 0
  let enAlias = 0
  for (const t of tokens) {
    const p = pesoTokenEnNombre(t, palabrasNombre)
    if (p) { sumar('tokens_nombre', p); enNombre += 1; continue }
    if (palabrasRuta.includes(t) || palabrasRuta.some((w) => w.startsWith(t))) {
      sumar('tokens_ruta', PESOS.TOKEN_RUTA); enRuta += 1; continue
    }
    if (alias.includes(t)) { sumar('tokens_alias', PESOS.TOKEN_ALIAS); enAlias += 1 }
  }

  // ── Cobertura: cuánto de lo que pidió aparece en algún lado ──
  //
  // EL ALIAS SUMA COBERTURA PERO NO ALCANZA PARA "ESTÁN TODAS LAS PALABRAS". Medido contra el
  // índice real: `CONTROL DE GASTOS.xlsx` está registrado como "Ledger DIARIO de caja", así que
  // pedir "daily" lo hacía coincidir por alias y se llevaba el bono entero de cobertura total,
  // quedando segundo detrás del Daily Meeting. Que el OS describa así a un documento no es lo
  // mismo que la persona lo haya nombrado.
  if (tokens.length) {
    const nombrados = enNombre + enRuta
    if (nombrados === tokens.length) sumar('todos_los_tokens', PESOS.TODOS_LOS_TOKENS)
    sumar('cobertura', Math.round(PESOS.COBERTURA * ((nombrados + enAlias) / tokens.length)))
  }

  // ── Contexto de carpeta ──
  const carpeta = canonico(plano(carpetaDe(e.path ?? '') ?? ''))
  if (carpeta && tokens.includes(carpeta)) sumar('carpeta_exacta', PESOS.CARPETA_EXACTA)

  // ── Tipo, forma y lugar ──
  if (consulta.tipo && e.tipo === consulta.tipo) sumar('tipo_pedido', PESOS.TIPO_PEDIDO)
  if (e.is_folder) sumar('es_carpeta', PESOS.ES_CARPETA)
  if (Number.isFinite(e.depth)) sumar('profundidad', PESOS.PROFUNDIDAD * Number(e.depth))

  // ── El alias aprendido ──
  //
  // Cuenta como PARECIDO, no como bonificación de naturaleza, y la diferencia es deliberada:
  // un alias es la forma más fuerte de "este texto significa este documento". Si contara
  // aparte, el filtro de parecido lo descartaría justo en el caso donde el alias sirve —
  // cuando la gente le dice a un documento algo que no se parece a su nombre.
  if (aliasDoc?.confianza > 0) {
    sumar('alias_documento', Math.round(PESOS.ALIAS_DOCUMENTO * Number(aliasDoc.confianza)))
  }

  // TODO LO DE ARRIBA ES PARECIDO DE TEXTO, Y SE GUARDA APARTE.
  //
  // Sirve para dos cosas que el score total no puede: filtrar lo que no se parece en nada
  // (que un documento operativo no entre por su bonificación si nadie lo nombró) y medir si
  // una alternativa merece mostrarse. Un archivo castigado hasta números rojos sigue siendo un
  // resultado; lo que no se parece en nada, no.
  const texto = score

  // ── Qué clase de documento es ──
  puntuarNaturaleza(naturalezaDe(e, { ahora, fuente, estado: opts.estado ?? null }), sumar, ahora)

  // MARCAR ALGO COMO REEMPLAZADO SIRVE PARA MANDAR A LA GENTE AL REEMPLAZO.
  //
  // Sin esto, `reemplazado_por` era una columna decorativa: se bajaba el viejo y nadie subía
  // el nuevo, así que el resultado quedaba a merced de qué otra cosa hubiera cerca.
  if (opts.sucesor) sumar('sucesor', PESOS.SUCESOR)

  // ── Desempates ──
  sumar('frescura', puntajeFrescura(e.modified_time, ahora))
  puntuarAprendizaje(opts.aceptaciones, sumar)

  return { score, texto, senales }
}

/**
 * Ordena los candidatos y devuelve el ranking con su desglose.
 *
 * El orden final es score, y a score igual el más reciente. Ese segundo criterio existe
 * porque dos archivos con el mismo nombre en dos carpetas empatan de verdad: el que se tocó
 * la semana pasada es casi siempre el que están pidiendo.
 */
export function rankear(candidatos, consulta, opts = {}) {
  const aceptacionesPor = opts.aceptacionesPor ?? new Map()
  const registro = opts.registro ?? new Map()
  const estados = opts.estados ?? new Map()
  const alias = opts.alias ?? null
  // Los reemplazos declarados de los candidatos de ESTA búsqueda. Se arma acá y no afuera
  // porque sólo tiene sentido dentro de una comparación: ser el sucesor de algo que nadie
  // pidió no es un mérito.
  const sucesores = new Set(candidatos
    .map((e) => estados.get(e.drive_file_id))
    .filter((s) => s?.estado === 'reemplazado' && s.reemplazadoPor)
    .map((s) => s.reemplazadoPor))
  const puntuados = candidatos
    .map((e) => {
      const { score, texto, senales } = puntuar(e, consulta, {
        ahora: opts.ahora,
        aceptaciones: aceptacionesPor.get(e.drive_file_id) ?? 0,
        fuente: registro.get(e.drive_file_id) ?? null,
        estado: estados.get(e.drive_file_id) ?? null,
        alias: alias?.drive_file_id === e.drive_file_id ? alias : null,
        sucesor: sucesores.has(e.drive_file_id),
      })
      return { ...e, score, texto, senales }
    })
    // Sin parecido de texto no hay resultado: ser un documento operativo no alcanza para
    // aparecer en una búsqueda que no lo nombró.
    .filter((e) => e.texto > 0)

  // EL PISO SE MIDE EN PARECIDO, NO EN PUNTAJE FINAL.
  //
  // Medido contra el índice real, pedir "flujo de fondos" ofrecía como alternativas FONDO DE
  // CESE y carga-masiva.xlsx: entraban por ser fuentes activas de Tesorería, no por parecerse
  // a lo pedido. Un documento que la empresa usa mucho no es un documento que se parezca a
  // esto — y ofrecerlo como alternativa hace dudar de todo el resto de la lista.
  const mejor = Math.max(...puntuados.map((e) => e.texto), 0)
  const ordenados = puntuados
    .filter((e) => e.texto >= mejor * PISO_PARECIDO)
    .sort((a, b) => (b.score - a.score)
      || String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
  return colapsarIndistinguibles(ordenados)
}

/**
 * Dos entradas con el mismo nombre en la misma carpeta son UNA para una persona.
 *
 * En el Drive real hay dos accesos directos llamados "JORNALES" colgando de la misma carpeta.
 * Ofrecerlos como dos opciones era pedirle a alguien que elija entre dos filas idénticas: no
 * hay dato con el cual decidir, y la pregunta hacía dudar del buscador entero. Se queda el de
 * mayor puntaje —la lista ya viene ordenada— y se anota cuántos había, para que la evidencia
 * no esconda que existían.
 */
function colapsarIndistinguibles(ordenados) {
  const vistos = new Map()
  const salida = []
  for (const e of ordenados) {
    const clave = `${plano(sinExtension(e.name))}|${plano(carpetaDe(e.path ?? '') ?? '')}`
    const previo = vistos.get(clave)
    if (previo) { previo.duplicados = (previo.duplicados ?? 1) + 1; continue }
    vistos.set(clave, e)
    salida.push(e)
  }
  return salida
}

/** Cuánto tiene que sacarle el primero al segundo para responder solo, y para no preguntar. */
export const MARGEN = Object.freeze({ ALTA: 0.5, MEDIA: 0.15 })

/** Cuánto tiene que parecerse un candidato al mejor para seguir siendo un resultado. */
const PISO_PARECIDO = 0.35

/**
 * ¿Hay UN ganador claro, o hay que preguntar?
 *
 * Gana solo si le saca una diferencia real al segundo. "Real" es relativa a la escala: un
 * 30 % arriba del segundo es un ganador; dos archivos a diez puntos son un empate, y ahí
 * preguntar es más barato que acertar por casualidad.
 */
export function hayGanador(rankeados, { margen = 0.3 } = {}) {
  if (!rankeados.length) return false
  if (rankeados.length === 1) return true
  const [a, b] = rankeados
  if (a.score >= PESOS.NOMBRE_EXACTO && b.score < PESOS.NOMBRE_EXACTO) return true
  return a.score >= b.score * (1 + margen)
}

/**
 * De un ranking a una decisión: qué contestar y con cuánta seguridad.
 *
 * Son tres situaciones distintas y antes había dos, que es de donde salía el problema:
 *
 *   alta   un candidato claramente superior → se abre y listo
 *   media  hay un favorito pero el segundo es plausible → se propone Y se muestran los otros
 *   baja   empatan de verdad → se pregunta, que sale más barato que acertar de casualidad
 *
 * Las alternativas NO son un síntoma de duda: son transparencia. Cuando alguien pide "el flujo
 * de fondos" y el OS decide que quiso decir el Cash Flow vivo, tiene derecho a ver que el
 * archivo viejo con ese nombre exacto también existe — y a desmentir al OS en un click.
 */
export function resolver(rankeados = [], opts = {}) {
  const max = opts.maxAlternativas ?? 3
  if (!rankeados.length) return { confianza: 'baja', ganador: null, alternativas: [] }
  const [a, b] = rankeados
  const alternativas = rankeados.slice(1, 1 + max)

  // NO SE AFIRMA CON MEDIA CONSULTA SIN ENCONTRAR.
  //
  // Medido contra el índice real: "zzz-no-existe" devolvía con CONFIANZA ALTA un pliego de
  // demolición, porque "existe" es prefijo de "EXISTENTE". La palabra que identificaba algo
  // —"zzz"— no había aparecido en ninguna parte. Ser el único candidato no es ser el correcto;
  // sin cubrir todo lo que la persona escribió, el OS propone, no afirma.
  const cubreTodo = (e) => !opts.exigeCobertura
    || Boolean(e?.senales?.nombre_exacto)
    || Number(e?.senales?.cobertura ?? 0) >= PESOS.COBERTURA

  if (rankeados.length === 1) {
    return { confianza: cubreTodo(a) ? 'alta' : 'media', ganador: a, alternativas: [] }
  }

  // "COINCIDE EXACTO DE NOMBRE" SE MIRA EN LA SEÑAL, NO EN EL PUNTAJE TOTAL.
  //
  // La regla original comparaba el total contra `NOMBRE_EXACTO`, que funcionaba cuando el
  // puntaje era casi todo texto. Con las señales nuevas cualquier documento operativo pasa los
  // 1000 sin coincidir exacto: pedir "avances de obra" —dos archivos que se llaman IGUAL—
  // daba confianza alta y se comía la alternativa. El nombre exacto es una señal; se lee ahí.
  const exacto = (e) => Boolean(e?.senales?.nombre_exacto)
  const dominaPorNombre = exacto(a) && !exacto(b)
  if (dominaPorNombre || a.score >= b.score * (1 + MARGEN.ALTA)) {
    return { confianza: cubreTodo(a) ? 'alta' : 'media', ganador: a, alternativas }
  }
  if (a.score >= b.score * (1 + MARGEN.MEDIA)) return { confianza: 'media', ganador: a, alternativas }
  return { confianza: 'baja', ganador: null, alternativas: [] }
}
