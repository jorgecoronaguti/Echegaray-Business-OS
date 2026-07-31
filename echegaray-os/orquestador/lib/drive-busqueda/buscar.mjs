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
// ── EL PASE DE RESCATE, Y POR QUÉ HIZO FALTA ──────────────────────────────────────────
// Parar en la primera etapa es correcto para precisión y era, a la vez, el segundo problema.
// "pasame el flujo de fondos" calzaba EXACTO con `Flujo de Fondos.xlsx` —etapa 2, carpeta AÑO
// 2025, sin tocar desde enero— y el Sheet que la empresa usa todos los días ni llegaba a
// competir: coincidía una etapa más abajo. El nombre era perfecto y la respuesta, inútil.
//
// Después de elegir la etapa se suben a la ronda las fuentes que el OS tiene declaradas en
// `public.fuentes_datos` y que nombran algo de lo pedido. Son 25 documentos: no pueden inundar
// nada. El ranking sigue decidiendo — lo que cambia es que ahora COMPITEN.
//
// ── TRES RESPUESTAS, NO DOS ───────────────────────────────────────────────────────────
// Antes había "gana uno" o "pregunto". Ahora `resolver` distingue abrir (confianza alta),
// proponer mostrando contra qué se eligió (media) y preguntar (baja). Ver ranking.mjs.
//
// ── CERO IA, Y ES VERIFICABLE ─────────────────────────────────────────────────────────
// Este módulo no importa el cliente de Anthropic ni nada que llegue a él, ni directa ni
// transitivamente: sólo el normalizador y el ranking, que son funciones puras. Hay un test
// que recorre el árbol de imports y falla si alguna vez aparece uno.

import { plano, sinExtension, tokenizar, tipoPedido, cargarSinonimos } from './normalizar.mjs'
import { rankear, resolver, rutaLegible, PESOS } from './ranking.mjs'
import { crearRegistro, crearEstados, fuenteCoincide, SQL_FUENTES, SQL_ESTADOS } from './senales.mjs'

/** Cuánto vale el índice cargado en memoria antes de volver a leerlo de Postgres. El timer
 *  de Drive corre cada 6 h: cinco minutos de desfasaje no pierde nada y ahorra 2.465 filas
 *  por búsqueda. */
export const TTL_INDICE_MS = 5 * 60 * 1000

const MAX_OPCIONES = 5

/** Lo mínimo que tiene que valer un candidato rescatado para ser un resultado. Es el peso de
 *  una palabra entera del nombre: menos que eso es una casualidad de vocabulario. */
const PISO_RESCATE = PESOS.TOKEN_NOMBRE

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
  let registro = new Map()
  let estados = new Map()
  let aliasDoc = new Map()
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
    // Se pide `usuario` y, si la columna todavía no está, se pide sin ella: el buscador tiene
    // que andar igual antes y después de la migración.
    for (const sql of [
      'select consulta_norm, drive_file_id, usuario, veces from public.drive_busqueda_uso',
      'select consulta_norm, drive_file_id, veces from public.drive_busqueda_uso',
    ]) {
      try {
        const { rows } = await port.query(sql)
        const m = new Map()
        for (const r of rows ?? []) {
          if (!m.has(r.consulta_norm)) m.set(r.consulta_norm, [])
          m.get(r.consulta_norm).push({ id: r.drive_file_id, usuario: r.usuario ?? '', veces: Number(r.veces) || 0 })
        }
        usos = m
        return
      } catch { /* se prueba la forma anterior */ }
    }
    usos = new Map() // la tabla puede no existir: el aprendizaje suma, no es requisito
  }

  // EL REGISTRO DE FUENTES DEL OS: 25 filas que dicen cuál es el documento que se usa.
  // Viaja con el índice por lo mismo que el aprendizaje — una consulta por búsqueda para una
  // tabla que pesa nada era el costo más caro de todo el algoritmo.
  async function cargarRegistro() {
    try {
      const { rows } = await port.query(SQL_FUENTES)
      registro = crearRegistro(rows)
    } catch { registro = new Map() /* sin registro se rankea sólo por texto, como antes */ }
    try {
      const { rows } = await port.query(SQL_ESTADOS)
      estados = crearEstados(rows)
    } catch { estados = new Map() /* sin estados declarados queda la inferencia */ }
    try {
      const { rows } = await port.query(
        'select alias_norm, drive_file_id, confianza, origen from public.drive_alias_documento',
      )
      aliasDoc = new Map((rows ?? []).map((r) => [r.alias_norm, {
        drive_file_id: r.drive_file_id, confianza: Number(r.confianza) || 0, origen: r.origen,
      }]))
    } catch { aliasDoc = new Map() /* todavía no hay alias aprendidos */ }
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
      await cargarRegistro()
      cargadoEn = t
      return filas
    },
    /**
     * Aceptaciones de esta consulta, separadas en PROPIAS y AJENAS.
     *
     * La distinción no es un adorno: que Jorge haya elegido este archivo diez veces dice
     * mucho más sobre lo que Jorge quiere que diez elecciones de otra persona.
     */
    aceptaciones(consultaNorm, usuario = '') {
      const m = new Map()
      for (const u of usos.get(consultaNorm) ?? []) {
        const a = m.get(u.id) ?? { propias: 0, ajenas: 0 }
        if (usuario && u.usuario === usuario) a.propias += u.veces
        else a.ajenas += u.veces
        m.set(u.id, a)
      }
      return m
    },
    /** El registro de fuentes del OS, ya interpretado. */
    fuentes() { return registro },
    /** Los estados declarados por la empresa, por archivo. */
    estados() { return estados },
    /** El alias aprendido para esta consulta, si lo hay. */
    alias(consultaNorm) { return aliasDoc.get(consultaNorm) ?? null },
    /** Suma una aceptación a la memoria viva, para que la MISMA sesión ya la vea. */
    anotarAceptacion(consultaNorm, driveFileId, usuario = '', delta = 1) {
      if (!usos.has(consultaNorm)) usos.set(consultaNorm, [])
      const lista = usos.get(consultaNorm)
      const previo = lista.find((u) => u.id === driveFileId && u.usuario === usuario)
      if (previo) previo.veces += delta
      else lista.push({ id: driveFileId, usuario, veces: delta })
    },
    /** Ídem, al revés: "no era ese" tiene que valer YA, no en la próxima recarga del índice. */
    anotarRechazo(consultaNorm, driveFileId, usuario = '') {
      this.anotarAceptacion(consultaNorm, driveFileId, usuario, -1)
    },
    /** Sólo para tests y para el cierre de una corrida: obliga a releer. */
    invalidar() {
      filas = null; usos = new Map(); registro = new Map(); estados = new Map()
      aliasDoc = new Map(); cargadoEn = 0; sinonimosCargados = false
    },
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
export async function registrarAceptacion(port, consultaNorm, driveFileId, usuario = '', delta = 1) {
  if (!port?.query || !consultaNorm || !driveFileId) return false
  const CON_USUARIO = `insert into public.drive_busqueda_uso (consulta_norm, drive_file_id, usuario, veces, ultima_at)
     values ($1, $2, $3, $4, now())
     on conflict (consulta_norm, drive_file_id, usuario)
     do update set veces = public.drive_busqueda_uso.veces + $4, ultima_at = now()`
  // LA FORMA ANTERIOR, PARA QUE EL CÓDIGO PUEDA SALIR ANTES QUE LA MIGRACIÓN.
  //
  // Sin esto, un deploy sin migrar apagaba el aprendizaje entero y en silencio: el insert
  // fallaba por una clave que todavía no existe y el catch se lo tragaba. El buscador seguía
  // andando y nadie se enteraba de que había dejado de aprender.
  const SIN_USUARIO = `insert into public.drive_busqueda_uso (consulta_norm, drive_file_id, veces, ultima_at)
     values ($1, $2, $3, now())
     on conflict (consulta_norm, drive_file_id)
     do update set veces = public.drive_busqueda_uso.veces + $3, ultima_at = now()`
  try {
    await port.query(CON_USUARIO, [consultaNorm, driveFileId, usuario ?? '', delta])
    return true
  } catch { /* se prueba la forma anterior */ }
  try {
    await port.query(SIN_USUARIO, [consultaNorm, driveFileId, delta])
    return true
  } catch { return false }
}

/**
 * "No era ese": resta una aceptación.
 *
 * La corrección de una persona vale lo mismo que su elección, en la dirección contraria. No
 * borra nada ni cambia una regla — mueve el mismo peso que movería un acierto, y por eso el
 * comportamiento global no se rompe: si el documento igual coincide de nombre, sigue apareciendo.
 */
export const registrarRechazo = (port, consultaNorm, driveFileId, usuario = '') =>
  registrarAceptacion(port, consultaNorm, driveFileId, usuario, -1)

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
 * EL PASE DE RESCATE — un documento operativo no queda afuera por la etapa.
 *
 * Acá estaba el problema de fondo. Las etapas paran en la primera que devuelve algo, y eso es
 * correcto para precisión… hasta que la etapa estricta la gana un archivo muerto. "flujo de
 * fondos" calzaba EXACTO con `Flujo de Fondos.xlsx` (etapa 2, carpeta AÑO 2025) y el Sheet que
 * la empresa usa todos los días ni siquiera llegaba a competir: coincidía una etapa más abajo.
 *
 * El rescate sube a la ronda a las fuentes que el OS tiene declaradas y que nombran algo de lo
 * pedido. Son 25 documentos: no pueden inundar la lista, y el ranking sigue decidiendo. Lo que
 * cambia es que ahora COMPITEN.
 */
function rescatarOperativos(filas, registro, consulta, yaEstan, alias = null) {
  if (!consulta.tokens.length) return []
  const rescatados = []
  for (const e of filas) {
    if (yaEstan.has(e.drive_file_id)) continue
    // Un alias aprendido rescata a SU documento aunque no sea una fuente registrada: es la
    // empresa diciendo, con evidencia, que cuando pide esto quiere eso.
    if (alias?.drive_file_id === e.drive_file_id) { rescatados.push({ ...e, rescatado: true }); continue }
    const fuente = registro.get(e.drive_file_id)
    if (!fuente || fuente.reemplazada) continue
    const suyos = tokenizar(`${sinExtension(e.name)} ${e.path ?? ''}`)
    const nombra = consulta.tokens.some((t) => suyos.includes(t))
    if (nombra || fuenteCoincide(fuente, consulta.tokens)) rescatados.push({ ...e, rescatado: true })
  }
  return rescatados
}

/**
 * Busca. Devuelve SIEMPRE la misma forma, gane uno o haya que preguntar.
 *
 * No recibe `port`: todo lo que necesita —el índice, los sinónimos, el registro de fuentes y
 * el aprendizaje— ya está en memoria. Una búsqueda no toca la base, y por eso tarda
 * milisegundos. Y no llama a ningún modelo: ni una vez, ni como último recurso.
 *
 * @returns {Promise<{etapa:string|null, ganador:object|null, confianza:string, alternativas:object[], opciones:object[], consulta:object, evaluados:number, ms:number}>}
 */
export async function buscar({
  indice, texto, tipo = null, ahora = Date.now(), limite = MAX_OPCIONES, usuario = '',
}) {
  const t0 = Date.now()
  const consulta = analizarConsulta(texto, { tipo })
  const filas = await indice.filasVigentes()
  const aceptacionesPor = indice.aceptaciones(consulta.norm, usuario)
  const registro = indice.fuentes?.() ?? new Map()
  const estados = indice.estados?.() ?? new Map()
  const alias = indice.alias?.(consulta.norm) ?? null
  // Con una sola palabra, no cubrirla es no encontrar nada; con varias, cubrir la mitad es
  // una sospecha. La diferencia decide si el OS afirma o propone.
  const exigeCobertura = consulta.tokens.length > 1

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
    const unicos = new Map(usar.map((e) => [e.drive_file_id, e]))
    if (!unicos.size) continue
    for (const r of rescatarOperativos(filas, registro, consulta, unicos, alias)) {
      unicos.set(r.drive_file_id, r)
    }

    const rankeados = rankear(Array.from(unicos.values()), consulta,
      { ahora, aceptacionesPor, registro, estados, alias })
    if (!rankeados.length) continue
    const { confianza, ganador, alternativas } = resolver(rankeados, { exigeCobertura })
    return {
      etapa: etapa.nombre,
      ganador,
      confianza,
      alternativas,
      opciones: rankeados.slice(0, limite),
      consulta,
      alias,
      evaluados: filas.length,
      ms: Date.now() - t0,
    }
  }

  // EL RESCATE TAMBIÉN ES UNA ETAPA, LA ÚLTIMA.
  //
  // Estaba adentro del bucle y sólo corría si alguna etapa YA había encontrado algo. Con eso,
  // las dos cosas que el rescate existe para resolver no funcionaban: pedir "padrón de flota"
  // —que no está en el nombre del archivo VEHICULOS, está en cómo el OS describe la fuente— y
  // pedir un documento por un alias aprendido que no se parece a su nombre. Las dos veces no
  // había ninguna etapa que hiciera pie, y el rescate ni se ejecutaba.
  const rescatados = rescatarOperativos(filas, registro, consulta, new Map(), alias)
  // COMPARTIR UNA PALABRA NO ES COINCIDIR.
  //
  // Como última etapa, el rescate arranca sin ningún candidato con el cual compararse, así que
  // el filtro relativo de parecido no protege de nada. Medido contra el índice real:
  // "zzz-no-existe" devolvía cinco documentos operativos, enganchados por la palabra "no" que
  // aparece en la carpeta "…SAS - NO TOCAR". Acá hace falta evidencia absoluta — al menos lo
  // que vale una palabra entera del nombre — o la respuesta honesta es "no encontré nada".
  const ultimos = rankear(rescatados, consulta, { ahora, aceptacionesPor, registro, estados, alias })
    .filter((e) => e.texto >= PISO_RESCATE)
  const cierre = resolver(ultimos, { exigeCobertura })
  return {
    etapa: ultimos.length ? 'rescate' : null,
    ganador: cierre.ganador,
    confianza: cierre.confianza,
    alternativas: cierre.alternativas,
    opciones: ultimos.slice(0, limite),
    consulta,
    alias,
    evaluados: filas.length,
    ms: Date.now() - t0,
  }
}

export { rutaLegible }
