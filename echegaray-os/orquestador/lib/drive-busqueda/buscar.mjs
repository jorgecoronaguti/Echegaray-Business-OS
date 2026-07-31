// EL PIPELINE DE BÚSQUEDA — cinco etapas, sin una sola llamada a un modelo.
//
// "pasame el archivo vision/traccion" no encontraba "Vision / Tracción" porque se le pedía a
// Drive `name contains 'vision/traccion'`: texto literal contra un nombre con otra
// puntuación y otros acentos. La respuesta era "no existe" y el archivo estaba ahí.
//
// El arreglo no es una consulta más astuta: es dejar de preguntarle a Drive por texto. El OS
// ya tiene el índice —`public.drive_index`, 2.465 archivos que un timer refresca cada 6 h— y
// nunca lo miraba. Buscar contra el índice, en memoria, permite hacer lo que una sola query
// no puede: probar de lo más estricto a lo más laxo y PARAR en cuanto algo gana claro.
//
// ── LAS CINCO ETAPAS ──────────────────────────────────────────────────────────────────
//   1. exacta        el nombre ES lo pedido
//   2. normalizada   ídem, ya sin acentos, barras, puntos ni plurales
//   3. parcial       el nombre CONTIENE lo pedido            ("vision" → "Vision / Tracción")
//   4. todos         están TODAS las palabras (nombre o ruta) ("vision estrategia")
//   5. alguna        está AL MENOS UNA palabra                (último recurso)
//
// Se toma la PRIMERA etapa que devuelve algo y se rankea adentro de ella. Bajar de etapa con
// candidatos en la mano sería cambiar precisión por cantidad: si el nombre exacto existe, lo
// que apenas comparte una palabra no compite.
//
// ── CERO IA, Y ES VERIFICABLE ─────────────────────────────────────────────────────────
// Este módulo no importa el cliente de Anthropic ni nada que llegue a él, ni directa ni
// transitivamente: sólo el normalizador y el ranking, que son funciones puras. Hay un test
// que recorre el árbol de imports y falla si alguna vez aparece uno.

import { plano, sinExtension, tokenizar, tipoPedido, cargarSinonimos } from './normalizar.mjs'
import { rankear, hayGanador, rutaLegible } from './ranking.mjs'

/** Cuánto vale el índice cargado en memoria antes de volver a leerlo de Postgres. El timer
 *  de Drive corre cada 6 h: cinco minutos de desfasaje no pierde nada y ahorra 2.465 filas
 *  por búsqueda. */
export const TTL_INDICE_MS = 5 * 60 * 1000

const MAX_OPCIONES = 5

/** Las columnas que el buscador necesita. `nombre_norm`/`tokens` son de la migración nueva:
 *  se piden si están y se calculan al vuelo si no, así el buscador funciona igual antes y
 *  después de aplicarla. La correctitud no depende del schema; la velocidad sí. */
const COLUMNAS = 'drive_file_id, name, path, tipo, mime_type, is_folder, modified_time, depth'

// ── Carga del índice ─────────────────────────────────────────────────────────

/**
 * Lee el índice entero una vez y lo deja en memoria del proceso.
 *
 * Son 2.465 filas: cargarlas cuesta menos que las cinco consultas que harían falta para
 * hacer lo mismo en SQL, y deja el algoritmo entero del lado de Node, donde se puede probar
 * sin base.
 */
export function crearIndice({ port, ttlMs = TTL_INDICE_MS, ahora = () => Date.now() } = {}) {
  let filas = null
  let usos = new Map()
  let cargadoEn = 0
  let sinonimosCargados = false

  async function cargarAlias() {
    if (sinonimosCargados || !port?.query) return
    sinonimosCargados = true
    try {
      const { rows } = await port.query('select canonico, variante from public.drive_alias')
      if (rows?.length) cargarSinonimos(rows)
    } catch { /* la tabla puede no existir todavía: el diccionario de fábrica alcanza */ }
  }

  // EL APRENDIZAJE VIAJA CON EL ÍNDICE, NO POR BÚSQUEDA.
  //
  // Primera versión: una consulta a `drive_busqueda_uso` por cada búsqueda. Medido contra la
  // base real, eso costaba ~400 ms de ida y vuelta — más que todo el resto del algoritmo
  // junto, y por una tabla que hoy pesa nada. Se carga entera con el índice y la búsqueda
  // queda en memoria pura.
  async function cargarUsos() {
    try {
      const { rows } = await port.query('select consulta_norm, drive_file_id, veces from public.drive_busqueda_uso')
      const m = new Map()
      for (const r of rows ?? []) {
        if (!m.has(r.consulta_norm)) m.set(r.consulta_norm, new Map())
        m.get(r.consulta_norm).set(r.drive_file_id, Number(r.veces) || 0)
      }
      usos = m
    } catch { usos = new Map() /* la tabla puede no existir: el aprendizaje suma, no es requisito */ }
  }

  return {
    async filasVigentes() {
      const t = ahora()
      if (filas && t - cargadoEn < ttlMs) return filas
      await cargarAlias()
      // SI EL ÍNDICE NO SE PUEDE LEER, NO SE MUERE LA BÚSQUEDA.
      //
      // La tabla puede no existir (un entorno nuevo, la vertical contra un Postgres
      // desechable) o la base puede estar caída un minuto. Tirar acá dejaba a la persona con
      // un "no puedo buscar" teniendo a Drive a un llamado de distancia. Un índice vacío es
      // una respuesta válida: el pipeline se queda sin candidatos y cae al Drive en vivo, que
      // es exactamente el camino previsto para lo que el índice todavía no tiene.
      try {
        const { rows } = await port.query(`select ${COLUMNAS} from public.drive_index`)
        filas = rows ?? []
      } catch { filas = [] }
      await cargarUsos()
      cargadoEn = t
      return filas
    },
    /** Aceptaciones de esta consulta, ya en memoria. */
    aceptaciones(consultaNorm) { return usos.get(consultaNorm) ?? new Map() },
    /** Suma una aceptación al mapa vivo, para que la MISMA sesión ya la vea. */
    anotarAceptacion(consultaNorm, driveFileId) {
      if (!usos.has(consultaNorm)) usos.set(consultaNorm, new Map())
      const m = usos.get(consultaNorm)
      m.set(driveFileId, (m.get(driveFileId) ?? 0) + 1)
    },
    /** Sólo para tests y para el cierre de una corrida: obliga a releer. */
    invalidar() { filas = null; usos = new Map(); cargadoEn = 0; sinonimosCargados = false },
    get cargado() { return Boolean(filas) },
  }
}

// ── Aprendizaje ──────────────────────────────────────────────────────────────

/**
 * Registra que para esta consulta se aceptó este archivo. Es lo que hace que la décima vez
 * que alguien escribe "vision" el archivo correcto ya venga primero.
 *
 * No tira nunca: que el aprendizaje falle no puede romper una búsqueda que ya salió bien.
 */
export async function registrarAceptacion(port, consultaNorm, driveFileId) {
  if (!port?.query || !consultaNorm || !driveFileId) return false
  try {
    await port.query(
      `insert into public.drive_busqueda_uso (consulta_norm, drive_file_id, veces, ultima_at)
       values ($1, $2, 1, now())
       on conflict (consulta_norm, drive_file_id)
       do update set veces = public.drive_busqueda_uso.veces + 1, ultima_at = now()`,
      [consultaNorm, driveFileId],
    )
    return true
  } catch { return false }
}

// ── Las etapas ───────────────────────────────────────────────────────────────

const nombrePlano = (e) => plano(sinExtension(e.name))
const todoPlano = (e) => `${nombrePlano(e)} ${plano(e.path ?? '')}`

/** Las cinco, en orden, cada una más laxa que la anterior. Cada etapa es una función pura
 *  de (filas, consulta) → candidatos: se prueban solas y se leen de un vistazo. */
export const ETAPAS = Object.freeze([
  {
    nombre: 'exacta',
    filtrar: (filas, { frase }) => filas.filter((e) => plano(e.name) === frase),
  },
  {
    nombre: 'normalizada',
    filtrar: (filas, { frase, tokens }) => filas.filter((e) => {
      if (nombrePlano(e) === frase) return true
      const tn = tokenizar(e.name)
      return tokens.length > 0 && tn.length === tokens.length && tokens.every((t) => tn.includes(t))
    }),
  },
  {
    nombre: 'parcial',
    filtrar: (filas, { frase }) => (frase ? filas.filter((e) => nombrePlano(e).includes(frase)) : []),
  },
  {
    nombre: 'todos_los_tokens',
    filtrar: (filas, { tokens }) => (tokens.length
      ? filas.filter((e) => { const t = todoPlano(e); return tokens.every((x) => t.includes(x)) })
      : []),
  },
  {
    nombre: 'alguna_palabra',
    filtrar: (filas, { tokens }) => (tokens.length
      ? filas.filter((e) => { const t = todoPlano(e); return tokens.some((x) => t.includes(x)) })
      : []),
  },
])

/** Lo que la persona escribió, convertido en lo que se va a buscar. */
export function analizarConsulta(texto, { tipo = null } = {}) {
  const tokens = tokenizar(texto)
  return {
    original: String(texto ?? ''),
    frase: tokens.join(' '),
    fraseCruda: plano(sinExtension(texto)),
    tokens,
    tipo: tipo && tipo !== 'cualquiera' ? tipo : tipoPedido(texto),
    norm: tokens.join(' '),
  }
}

/**
 * Busca. Devuelve SIEMPRE la misma forma, gane uno o haya que preguntar.
 *
 * No recibe `port`: todo lo que necesita —el índice, los sinónimos y el aprendizaje— ya está
 * en memoria. Una búsqueda no toca la base, y por eso tarda milisegundos.
 *
 * @returns {Promise<{etapa:string|null, ganador:object|null, opciones:object[], consulta:object, evaluados:number, ms:number}>}
 */
export async function buscar({ indice, texto, tipo = null, ahora = Date.now(), limite = MAX_OPCIONES }) {
  const t0 = Date.now()
  const consulta = analizarConsulta(texto, { tipo })
  const filas = await indice.filasVigentes()
  const aceptacionesPor = indice.aceptaciones(consulta.norm)

  // La frase se prueba primero como la escribió la persona y después ya tokenizada: "vision
  // traccion" y "vision/traccion" tienen que llegar al mismo lado.
  const variantes = Array.from(new Set([consulta.fraseCruda, consulta.frase].filter(Boolean)))

  for (const etapa of ETAPAS) {
    let candidatos = []
    for (const frase of variantes) {
      candidatos = candidatos.concat(etapa.filtrar(filas, { ...consulta, frase }))
    }
    // Sin `tipo` el filtro no se aplica: pedir "el excel de estrategia" y no tener ninguno no
    // puede terminar en "no hay nada" si existe el documento.
    const porTipo = consulta.tipo ? candidatos.filter((e) => e.tipo === consulta.tipo) : []
    const usar = porTipo.length ? porTipo : candidatos
    const unicos = Array.from(new Map(usar.map((e) => [e.drive_file_id, e])).values())
    if (!unicos.length) continue

    const rankeados = rankear(unicos, consulta, { ahora, aceptacionesPor })
    if (!rankeados.length) continue
    return {
      etapa: etapa.nombre,
      ganador: hayGanador(rankeados) ? rankeados[0] : null,
      opciones: rankeados.slice(0, limite),
      consulta,
      evaluados: filas.length,
      ms: Date.now() - t0,
    }
  }

  return { etapa: null, ganador: null, opciones: [], consulta, evaluados: filas.length, ms: Date.now() - t0 }
}

export { rutaLegible }
