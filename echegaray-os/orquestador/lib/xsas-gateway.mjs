// LA PUERTA ÚNICA DE XSAS — app.ecsas, Mattermost, los workers y los timers entran por acá.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// No es un Core nuevo. El Core ya existe entero —estado, Plan→Real, aprendizaje, evidencia, los 23
// agentes, las tools, las 44 skills, el catálogo, el ruteo de 4 niveles y `lib/ia` como puerta hacia
// el modelo— y este archivo NO reimplementa una línea de eso: lo compone detrás de UNA entrada y UNA
// salida. Lo que faltaba no era inteligencia, era una puerta.
//
// ═══ POR QUÉ HACÍA FALTA ═══
//
// Cada cara armaba su propio pedido y su propia respuesta: Mattermost un `post` crudo, el worker un
// `task.inputs`, la web nada. Con tres formas del mismo hecho, una capacidad nueva se cablea tres
// veces y un permiso se olvida en una de las tres. Y sobre todo: no había un solo lugar donde
// pudiera medirse cuánto de lo que hace el OS necesita un modelo.
//
// ═══ EL ORDEN, Y POR QUÉ ES ÉSE ═══
//
//   N0  intención por su NOMBRE (`Map.get`) o frase EXACTA conocida  → tool. Cero tokens, cero
//       clasificación. Un botón de la app y un timer no tienen nada que interpretar.
//   N1  el ruteo XSAS ya existente (`elegir-capacidad.mjs`) elige skills; si una de esas skills
//       tiene una tool del OS detrás, la ejecuta. Sigue sin modelo.
//   N2  lenguaje natural simple, clasificación ambigua, síntesis → modelo barato.
//   N3  ambiguo, multidominio o con consecuencia → modelo potente.
//
// LA REGLA QUE MANDA SOBRE TODAS: si la ruta interna no puede DEMOSTRAR que resuelve el caso,
// escala. Ahorrar tokens adivinando es la peor forma de ahorrar.
//
// ═══ LO QUE ESTE ARCHIVO NO HACE ═══
//
// No sabe de obras, de caja ni de jornales: no hay una sola regla de negocio acá. No sabe de React,
// de Next ni de Mattermost: los adapters traducen a `normalizarPedido` y listo. Y no otorga
// permisos — los compara contra los que trajo el pedido, que los llenó quien tiene la fuente real.

import { CAPACIDAD } from './ia/capacidad.mjs'
import { elegirCapacidad, nivelDeRuteo, NIVEL } from './elegir-capacidad.mjs'
import { filtrarPorVisibilidad } from './xsas-visibilidad.mjs'
import { leerCatalogoDeDisco } from './skill-catalogo.mjs'
import { SIN_RAZONADOR } from './xsas.mjs'
import { normalizarPedido, textoDePedido, TIPO, PedidoInvalido } from './xsas-pedido.mjs'
import { ingerirAdjuntos, textoDeLectura, DESTINO } from './xsas-archivos.mjs'
import {
  cargarContexto, guardarContexto, caratulaDeLectura, acotarArchivos, referenciaContextual,
} from './xsas-contexto.mjs'
import { respuestaOk, respuestaError } from './xsas-respuesta.mjs'
import { registrarTraza, RAZON_RAZONADOR } from './xsas-traza.mjs'
import {
  toolsDelNucleo, atajoPara, ATAJOS_EN_OBRA, normalizarFrase, argumentosPara, puedeUsar, toolsDeSkill,
  ordenarPorAfinidad, pideMutacion, palabrasDe, afinidad, PESO, partirObjetivo,
} from './xsas-resolutores.mjs'
import { escribeAfuera } from './xsas-permisos.mjs'
import { completarArgumentos } from './xsas-argumentos.mjs'

/** La capacidad de modelo que corresponde a cada nivel de la política. El nivel lo decide el ruteo
 *  determinístico; acá sólo se traduce. Un nivel 2 JAMÁS toma el modelo potente. */
const CAPACIDAD_POR_NIVEL = Object.freeze({
  [NIVEL.IA_LIVIANA]: CAPACIDAD.SIMPLE,
  [NIVEL.RAZONAMIENTO]: CAPACIDAD.COMPLEX,
})

/** «¿Qué podés hacer?», escrito como lo escribe cualquiera. Normalizado por `normalizarFrase`. */
const PREGUNTAS_DE_CAPACIDADES = new Set([
  'que podes hacer', 'que sabes hacer', 'que puedo pedirte', 'en que me podes ayudar',
  'que capacidades tenes', 'ayuda', 'que podes hacer?', 'que sabes hacer?',
])

const SISTEMA = [
  'Sos XSAS, la inteligencia del Echegaray Business OS. Contestás en español rioplatense, directo y',
  'sin lenguaje corporativo. Nunca inventás un número: si no tenés el dato, decís exactamente qué',
  'falta. Distinguís HECHO, CÁLCULO, INFERENCIA y ESTIMACIÓN, y no presentás una estimación como',
  'un hecho.',
].join(' ')

/** Ejecuta una tool con los permisos y el contexto del pedido. Nunca lanza: devuelve el motivo. */
async function correrTool({ clave, tool, pedido, query = null, argsResueltos = null }) {
  if (!puedeUsar(pedido.actor, tool, clave)) {
    return { ok: false, motivo: `sin permiso para ${clave} (requiere ${tool.capability})`, tipo: 'sin_permiso' }
  }
  // `argsResueltos` llega sólo cuando el gateway ya completó desde la frase lo que el contexto no
  // traía. El permiso se verificó igual arriba: completar un argumento no saltea ninguna cerradura.
  const { args, falta } = argsResueltos ?? argumentosPara(tool, pedido)
  if (falta.length) return { ok: false, motivo: `falta ${falta.join(', ')} para ${clave}`, tipo: 'falta_dato' }
  try {
    const datos = await tool.run(args)
    // ═══ UNA TOOL QUE FALLA NO SIEMPRE LANZA ═══
    //
    // `imagen.generar` devuelve `{error: …}` y el motor devuelve `{ok:false, falta, motivo}` sin
    // lanzar nunca. La firma miraba sólo la excepción, así que diecinueve escrituras quedaron
    // registradas como «ok» y la tabla nunca pudo tomar el valor «error» que su propio CHECK
    // permite. Un control que sólo puede decir que sí no es un control.
    const falló = datos?.ok === false || Boolean(datos?.error)
    await firmarEscritura({
      query, clave, tool, pedido, datos,
      error: falló ? String(datos.error ?? datos.motivo ?? 'la tool devolvió ok:false').slice(0, 300) : null,
    })
    // Los adjuntos crudos NO viajan de vuelta: en `acciones.ejecutadas` y en la traza un plano en
    // base64 sería megabytes de ruido. Queda el nombre y el tamaño, que es lo auditable.
    const argsVisibles = Array.isArray(args?.archivos)
      ? { ...args, archivos: args.archivos.map((a) => ({ nombre: a?.nombre ?? null, bytes: a?.contenido_base64 ? Buffer.byteLength(a.contenido_base64, 'base64') : (a?.contenido?.length ?? null) })) }
      : args
    return { ok: true, datos, args: argsVisibles }
  } catch (e) {
    const motivo = `${clave} falló: ${String(e?.message ?? e).slice(0, 200)}`
    await firmarEscritura({ query, clave, tool, pedido, datos: null, error: motivo })
    return { ok: false, motivo, tipo: 'tool_fallo' }
  }
}

/**
 * LA FIRMA DE UNA ESCRITURA CON EFECTO AFUERA.
 *
 * Sólo las capabilities que escriben fuera del OS. Se registra el INTENTO: una escritura que falló
 * también dice que alguien la pidió, y esa es justamente la fila que se quiere tener el día que hay
 * que explicar qué pasó. Nunca lanza — perder la traza es malo, tumbar la respuesta por perderla es
 * peor, y una traza que se pierde deja el aviso en el log.
 */
async function firmarEscritura({ query, clave, tool, pedido, datos, error }) {
  if (!escribeAfuera(tool?.capability)) return
  if (!query) return
  try {
    await query(
      `insert into public.xsas_escritura
         (correlation_id, actor_id, actor_nombre, actor_rol, canal, tool, capability,
          archivo_id, archivo_link, resultado, motivo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        pedido.correlationId ?? null,
        String(pedido.actor?.id ?? 'desconocido'),
        pedido.actor?.nombre ?? null,
        pedido.actor?.rol ?? null,
        pedido.canal ?? null,
        clave,
        tool.capability,
        // CADA TOOL NOMBRA SU ARCHIVO A SU MANERA: `slides.crear` devuelve `{id, link}` y
        // `imagen.generar` devuelve `{archivo:{id}, drive_url}`. Con un solo nombre, dieciocho
        // escrituras reales quedaron firmadas con el archivo en NULL — la traza decía quién y
        // cuándo, y no decía SOBRE QUÉ, que es la mitad que sirve para auditar.
        idDeLoEscrito(datos),
        datos?.link ?? datos?.drive_url ?? datos?.imagen_url ?? null,
        error ? 'error' : 'ok',
        error ?? null,
      ],
    )
  } catch (e) {
    console.warn(`[xsas] no se pudo firmar la escritura de ${clave}: ${String(e?.message ?? e).slice(0, 160)}`)
  }
}

/**
 * EL ID DE LO QUE SE ESCRIBIÓ — sin enumerar las formas en que una tool lo puede llamar.
 *
 * Estaba escrito `datos?.id ?? datos?.archivo?.id`, que son dos formas conocidas. `plano.cotizar`
 * devuelve una tercera (`cotizacion_id`) y la firma habría nacido con el id en NULL: quién y cuándo,
 * sin sobre qué. Es el mismo defecto que ya se había arreglado una vez enumerando dos formas, y que
 * volvió porque llegó la tercera.
 *
 * La regla: el primer valor escalar bajo una clave que TERMINA en `id`, buscando primero en la raíz
 * y después un nivel adentro. No enumera nombres, enumera una forma. PURA.
 */
export function idDeLoEscrito(datos) {
  if (!datos || typeof datos !== 'object') return null
  const escalar = (v) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v) : null
  const esId = (k) => /(^|_)id$/i.test(k)
  for (const [k, v] of Object.entries(datos)) if (esId(k) && escalar(v)) return escalar(v)
  for (const v of Object.values(datos)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) if (esId(k2) && escalar(v2)) return escalar(v2)
    }
  }
  return null
}

/** El texto para una persona a partir de lo que devolvió una tool. Las tools del OS ya traen su
 *  lectura armada (`resumen_texto`, `lectura`); si no la traen, se entrega el dato y se dice que
 *  es un dato — nunca se redacta un párrafo con un modelo para adornar un número que ya está. */
function textoDeDatos(datos) {
  if (datos == null) return null
  if (typeof datos === 'string') return datos
  // `caja.vencido` publica su lectura como `resumen` (array de líneas) — medido el 02/09: por no
  // leerlo, «qué vence esta semana» salía sin texto teniendo la lectura armada adentro del dato.
  if (Array.isArray(datos.resumen) && datos.resumen.every((x) => typeof x === 'string')) {
    return datos.resumen.join('\n') || null
  }
  return datos.resumen_texto ?? datos.lectura ?? datos.texto ?? null
}

/** N0/N1: correr la tool y armar la respuesta. `via` dice cómo se llegó, y queda en la traza. */
async function resolverConTool({ pedido, clave, tool, nivel, via, skills = [], t0, query = null, argsResueltos = null }) {
  const r = await correrTool({ clave, tool, pedido, query, argsResueltos })
  const capacidades = { nivel, skills, tools: [clave], via, confianza: 'alta', motivo: via }
  if (!r.ok) {
    return respuestaError(pedido, { tipo: r.tipo, mensaje: r.motivo, ms: Date.now() - t0, capacidades })
  }

  // ═══ UNA TOOL QUE DEVUELVE `error` NO ES UNA RESPUESTA OK (27/08/2026) ═══
  //
  // Las tools del OS no lanzan: devuelven `{error: '...'}` para que quien pregunta se entere de qué
  // pasó en vez de recibir un 500. Pero acá eso llegaba como `ok:true` con `respuesta: null` —
  // `textoDeDatos` no encuentra `resumen_texto` y devuelve nada—, y la traza quedaba diciendo que
  // todo salió bien. Un briefing de caja que no pudo leer el Cash Flow no puede parecerse a un
  // briefing de caja vacío. Se declara la fuente que falló, con nombre.
  const falloInterno = r.datos && typeof r.datos === 'object' && !Array.isArray(r.datos) && r.datos.error
  const degradacionFuente = falloInterno
    ? `la capacidad «${clave}» no pudo obtener su dato: ${String(r.datos.error).slice(0, 200)}`
    : null

  // ═══ PUEDE CALCULAR NO ES PUEDE VER ═══
  // El tachado es del BACKEND y por eso vale para las tres caras. Ver `xsas-visibilidad.mjs`.
  const visible = filtrarPorVisibilidad({
    actor: pedido.actor,
    datos: r.datos,
    // `args` también: hay tools que declaran parámetros de plata (`monto_venta`, `costo_estimado`,
    // `margen_pct`, `importe`) y `acciones.ejecutadas` los devuelve tal cual.
    args: r.args,
    respuesta: falloInterno ? `No pude obtener el dato: ${String(r.datos.error).slice(0, 200)}` : textoDeDatos(r.datos),
  })

  return respuestaOk(pedido, {
    respuesta: visible.respuesta,
    datos: visible.datos,
    capacidades,
    accionesEjecutadas: [{ tool: clave, args: visible.args }],
    evidencia: [{ que: 'resultado', fuente: `tool ${clave}`, cuando: new Date().toISOString() }],
    degradacion: [degradacionFuente, visible.degradacion].filter(Boolean).join(' · ') || null,
    ms: Date.now() - t0,
  })
}

/** N2/N3: el modelo. `ia.pedirTexto` es la ÚNICA puerta hacia un proveedor y ya trae reintentos,
 *  clasificación de error, fallback entre proveedores, costo y aviso de degradación. */
// `razon` es el REASONER REQUIRED REASON del pedido: por qué esto no lo pudo resolver una tool.
// Va en `capacidades` para que la traza lo persista sin que el gateway tenga que conocer la tabla.
async function resolverConModelo({ pedido, nivel, skills, motivo, ia, t0, degradacion = null, razon = null }) {
  const capacidad = CAPACIDAD_POR_NIVEL[nivel] ?? CAPACIDAD.SIMPLE
  const contexto = []
  if (Object.keys(pedido.entidad).length) contexto.push(`Contexto verificado: ${JSON.stringify(pedido.entidad)}.`)
  if (skills.length) contexto.push(`Criterio de dominio que aplica: ${skills.join(', ')}.`)
  try {
    const r = await ia.pedirTexto({
      capacidad,
      sistema: contexto.length ? `${SISTEMA}\n${contexto.join(' ')}` : SISTEMA,
      mensajes: [{ role: 'user', content: textoDePedido(pedido) }],
      agente: 'xsas-gateway',
      funcion: `nivel-${nivel}`,
      maxTokens: 1024,
    })
    return respuestaOk(pedido, {
      respuesta: r.texto,
      capacidades: { nivel, skills, tools: [], via: 'modelo', confianza: 'media', motivo, razon },
      degradacion,
      llm: {
        proveedor: r.proveedor, modelo: r.modelo, tokens: r.tokens, usd: r.usd,
        intentos: r.intentos, fallbackDe: r.fallbackDe ?? null, ms: r.ms,
      },
      ms: Date.now() - t0,
    })
  } catch (e) {
    // ═══ SIN MODELO NO SE MIENTE NI SE ROMPE: SE DICE QUÉ SÍ SE PUEDE ═══
    // Un 500 acá dejaría al dueño sin saber que el resto del OS sigue entero. La respuesta es una
    // respuesta DEGRADADA con la lista real de lo que no depende del proveedor.
    const kind = e?.clasificacion?.kind ?? 'desconocido'
    return respuestaOk(pedido, {
      respuesta: [
        'No tengo razonador disponible ahora mismo, así que esto no lo puedo contestar en palabras.',
        `Motivo técnico: ${kind}.`,
        'Sigue funcionando sin modelo:',
        ...SIN_RAZONADOR.map((x) => `· ${x}`),
      ].join('\n'),
      capacidades: { nivel, skills, tools: [], via: 'modelo', confianza: null, motivo, razon },
      degradacion: `sin razonador (${kind})`,
      ms: Date.now() - t0,
    })
  }
}

/**
 * ATENDER UN PEDIDO. La única entrada de XSAS.
 *
 * @param {object} bruto  el pedido sin normalizar (lo arma el adapter de cada cara)
 * @param {object} [deps]
 * @param {object} [deps.ia]        la puerta hacia el modelo (default `lib/ia/cliente.mjs`)
 * @param {Function} [deps.query]   para la traza. Sin él no hay traza y el gateway funciona igual.
 * @param {object} [deps.google]    cliente de Workspace; suma las tools que lo necesitan
 * @param {object} [deps.registro]  {mapa, porArchivo, porLib} inyectable (tests)
 * @param {Array}  [deps.catalogo]  fichas de skills inyectables (tests)
 * @returns {Promise<object>} la respuesta estructurada común. NUNCA lanza.
 */
export async function atender(bruto, deps = {}) {
  const t0 = Date.now()
  let pedido
  try {
    pedido = normalizarPedido(bruto)
  } catch (e) {
    const tipo = e instanceof PedidoInvalido ? 'pedido_invalido' : 'error'
    return respuestaError(null, { tipo, mensaje: e?.message ?? 'pedido inválido', ms: Date.now() - t0 })
  }

  let r
  try {
    r = await despachar(pedido, deps, t0)
  } catch (e) {
    r = respuestaError(pedido, { tipo: 'gateway', mensaje: String(e?.message ?? e), ms: Date.now() - t0 })
  }

  // El contexto que llegó sin firma se descartó en la normalización; se declara en la respuesta.
  // Una pantalla que manda `obra_id` y no ve efecto tiene que poder enterarse de por qué.
  if (pedido.entidadDescartada.length && !r.degradacion) {
    r.degradacion = `contexto no verificado, ignorado: ${pedido.entidadDescartada.join(', ')}`
    if (r.ok) r.estado = 'degradado'
  }

  await registrarTraza(pedido, r, { query: deps.query ?? null, agente: deps.agente ?? null })
  return r
}

/** El ruteo, separado de `atender` para que el manejo de error y la traza sean uno solo. */
async function despachar(pedido, deps, t0) {
  const registro = deps.registro ?? await toolsDelNucleo({ google: deps.google ?? null })
  const { mapa, porArchivo, porLib = null, sinFirma = [] } = registro

  // ── N0 · LA INTENCIÓN PEDIDA POR SU NOMBRE ────────────────────────────────────────────────
  if (pedido.tipo === TIPO.INTENCION || pedido.tipo === TIPO.EVENTO) {
    const clave = pedido.tipo === TIPO.INTENCION ? pedido.intencion : pedido.evento?.nombre
    const tool = mapa.get(clave)
    if (tool) return resolverConTool({ pedido, clave, tool, nivel: NIVEL.DETERMINISTICO, via: 'intencion_exacta', t0, query: deps.query ?? null })
    if (pedido.tipo === TIPO.INTENCION) {
      return respuestaError(pedido, {
        tipo: 'capacidad_desconocida',
        mensaje: `no existe la capacidad "${clave}"`,
        ms: Date.now() - t0,
        capacidades: { nivel: NIVEL.DETERMINISTICO, via: 'intencion_exacta' },
      })
    }
  }

  const texto = textoDePedido(pedido)

  // ── N0 · UN ARCHIVO ADJUNTO VA A SU MOTOR, NO A UN MODELO ─────────────────────────────────
  //
  // Un archivo NO es un prompt. La ingesta (`xsas-archivos.mjs`) reutiliza el motor que ya entiende
  // archivos —formato por los bytes, planillas, PDF local, extracto bancario— y deja cada lectura
  // PERSISTIDA por hash, así un follow-up la reutiliza sin volver a subir nada. Un extracto sigue
  // yendo al importador del banco, que es la capacidad real que lo consume; el resto se lee, se
  // describe con honestidad y queda activo en el contexto de la conversación.
  const conContenido = pedido.adjuntos.filter((a) => typeof a === 'object' && (a?.contenido || a?.contenido_base64))
  if (conContenido.length) {
    return atenderAdjuntos({ pedido, conContenido, mapa, deps, t0 })
  }

  // ── N0 · LA FRASE QUE SE REFIERE AL TRABAJO ANTERIOR ──────────────────────────────────────
  //
  // «ahora mostrame lo que quedó pendiente» sin adjuntar nada de nuevo: la referencia se resuelve
  // contra el CONTEXTO ESTRUCTURADO de la conversación (Postgres), no reenviándole un transcript a
  // un modelo. Si no hay contexto que la resuelva, la frase sigue su camino de siempre.
  if (pedido.tipo === TIPO.MENSAJE && deps.query && pedido.correlationId) {
    const ref = referenciaContextual(texto)
    if (ref.es) {
      const desdeContexto = await atenderDesdeContexto({ pedido, ref, deps, t0 })
      if (desdeContexto) return desdeContexto
    }
  }

  // ── N0 · «¿QUÉ PODÉS HACER?» SE CONTESTA DEL REGISTRO, NO PREGUNTÁNDOLE A UN MODELO ───────
  //
  // Un modelo contestando esto describe lo que CREE que el OS sabe hacer, que es exactamente la
  // respuesta que no sirve: dice de más y no filtra por permisos. Sale del registro real, filtrado
  // por lo que ESTE actor puede correr, y no cuesta un token.
  if (PREGUNTAS_DE_CAPACIDADES.has(normalizarFrase(texto))) {
    const puede = [...mapa.entries()].filter(([clave, tool]) => puedeUsar(pedido.actor, tool, clave))
    const porArea = new Map()
    for (const [clave] of puede) {
      const area = clave.includes('.') ? clave.split('.')[0] : 'otras'
      porArea.set(area, [...(porArea.get(area) ?? []), clave])
    }
    const areas = [...porArea.entries()].sort((a, b) => b[1].length - a[1].length)
    return respuestaOk(pedido, {
      respuesta: [
        `Tengo ${puede.length} capacidades disponibles para tu rol, de ${mapa.size} registradas:`,
        ...areas.map(([area, claves]) => `· ${area} (${claves.length}): ${claves.sort().join(', ')}`),
        'Escribime lo que necesitás en lenguaje normal — yo elijo cuál usar.',
      ].join('\n'),
      datos: { disponibles: puede.length, registradas: mapa.size, por_area: Object.fromEntries(areas) },
      capacidades: { nivel: NIVEL.DETERMINISTICO, skills: [], tools: [], via: 'capacidades', confianza: 'alta', motivo: 'capacidades' },
      ms: Date.now() - t0,
    })
  }

  // ── N0 · LA FRASE EXACTA QUE YA SABEMOS QUÉ SIGNIFICA ─────────────────────────────────────
  //
  // Parado en una obra, la misma frase significa otra cosa. Se prueba PRIMERO la lectura por obra y
  // sólo se usa si esa tool existe, el actor puede correrla y el contexto alcanza para sus
  // argumentos: si algo de eso falla, la pregunta cae en la lectura de empresa, que es la respuesta
  // de siempre. Un contexto que no se puede honrar no puede convertir una respuesta buena en un error.
  //
  // Se exigen LAS DOS cosas: el `obra_id` verificado (que es lo que prueba que la obra es suya) y el
  // NOMBRE en el contexto (que es lo que las tools del OS reciben — leen el Sheet, no la base). Con
  // el id solo, `argumentosPara` llenaría `obra` con un UUID y la lectura por obra devolvería «no
  // encontré esa obra»: una respuesta peor que la de empresa.
  let obraNoResuelta = null
  if (pedido.entidad?.obra_id && pedido.contexto?.obra) {
    const enObra = ATAJOS_EN_OBRA[normalizarFrase(texto)]
    const tool = enObra ? mapa.get(enObra) : null
    if (tool && puedeUsar(pedido.actor, tool, enObra) && !argumentosPara(tool, pedido).falta.length) {
      const r = await correrTool({ clave: enObra, tool, pedido, query: deps.query ?? null })
      // ═══ LA OBRA DE LA PANTALLA PUEDE NO EXISTIR PARA LA LECTURA POR OBRA ═══
      //
      // Hay DOS registros de obra sin mapeo entre sí: `public.obras` (las pantallas, con uuid) y las
      // del Sheet (las que leen las tools económicas). Una obra de la pantalla puede no estar en el
      // Sheet — probado el 27/08 con «PLAYÓN DE AZUFRE». Si eso pasa NO se devuelve el error: se
      // contesta la lectura de empresa y se DICE por qué, porque el contexto es una mejora y una
      // mejora que rompe la respuesta de siempre es una regresión.
      if (r.ok && !r.datos?.error) {
        return respuestaOk(pedido, {
          respuesta: textoDeDatos(r.datos),
          datos: r.datos,
          capacidades: { nivel: NIVEL.DETERMINISTICO, skills: [], tools: [enObra], via: 'atajo_en_obra', confianza: 'alta', motivo: 'atajo_en_obra' },
          accionesEjecutadas: [{ tool: enObra, args: r.args }],
          evidencia: [{ que: 'resultado', fuente: `tool ${enObra}`, cuando: new Date().toISOString() }],
          ms: Date.now() - t0,
        })
      }
      obraNoResuelta = `la obra "${pedido.contexto.obra}" no está en la lectura por obra; se responde el estado de la empresa`
    }
  }

  const atajo = atajoPara(texto)
  if (atajo && mapa.has(atajo)) {
    const r = await resolverConTool({ pedido, clave: atajo, tool: mapa.get(atajo), nivel: NIVEL.DETERMINISTICO, via: 'atajo_exacto', t0, query: deps.query ?? null })
    if (obraNoResuelta && r.ok && !r.degradacion) { r.degradacion = obraNoResuelta; r.estado = 'degradado' }
    return r
  }

  // ── N1 · EL RUTEO XSAS QUE YA EXISTE ──────────────────────────────────────────────────────
  const catalogo = deps.catalogo ?? await leerCatalogoDeDisco({}).catch(() => [])

  // ── N1 · UN OBJETIVO CON VARIOS PEDIDOS ADENTRO SE RESUELVE POR PARTES, SIN MODELO ────────
  //
  // «cómo estamos de caja y qué vence esta semana» hoy caía en «multidominio → razonamiento»: un
  // párrafo pago para dos capacidades que existen al lado. Cada parte se rutea con el MISMO camino
  // determinístico de siempre; lo que ninguna capacidad resuelve queda como RESIDUO declarado —
  // resolver todo lo posible, aislar el residuo, escalar sólo el residuo. Si las partes no llegan a
  // DOS capacidades distintas, no era un objetivo compuesto: sigue el flujo normal.
  if (pedido.tipo === TIPO.MENSAJE) {
    const compuesto = await atenderCompuesto({ pedido, texto, mapa, catalogo, porArchivo, porLib, deps, t0 })
    if (compuesto) return compuesto
  }

  const eleccion = (deps.elegir ?? elegirCapacidad)(texto, { asesoria: pedido.tipo === TIPO.MENSAJE })
  const nivel = nivelDeRuteo(catalogo, eleccion)

  if (nivel <= NIVEL.CAPACIDAD) {
    const conMotor = await intentarMotor({ pedido, eleccion, catalogo, mapa, porArchivo, porLib, sinFirma, deps, texto, t0 })
    if (conMotor) return conMotor
    // La skill aplica pero no hay tool ejecutable con lo que tenemos. NO se responde «no puedo»:
    // se escala, porque la política dice que menos modelo no puede significar peor respuesta.
    return resolverConModelo({
      pedido, nivel: NIVEL.IA_LIVIANA, skills: eleccion.skills,
      motivo: `${eleccion.motivo}; sin tool ejecutable para esas skills`, ia: await puertaIa(deps), t0,
      degradacion: sinMotorEsDegradacion(eleccion), razon: RAZON_RAZONADOR.MISSING_RULE,
    })
  }

  // ═══ UN MOTOR QUE PRODUCE EL DATO GANA A UN PÁRRAFO QUE LO DESCRIBE (27/08/2026) ═══
  //
  // `nivelDeRuteo` manda a RAZONAMIENTO todo lo multidominio, y eso está bien para una pregunta que
  // hay que pensar. Pero «analizá los planos de Quattropani» cae en cuatro skills a la vez —costos,
  // ingeniería, planificación, compras— y la primera tiene un motor que abre los planos y devuelve
  // el cómputo con sus números. Contestarla con un párrafo sobre cómo se cotiza una obra, teniendo
  // el motor al lado, es exactamente la regla de este archivo al revés.
  //
  // Sólo cuando el ruteo fue DETERMINISTA y con confianza ALTA: si dudó, la duda manda y se razona.
  //
  // ═══ Y SIEMPRE QUE LA FRASE PIDA ESCRIBIR (01/09/2026) ═══
  //
  // Un pedido de mutación con dominio reconocido no puede terminar en un párrafo del modelo: el
  // modelo no ejecuta escrituras. `intentarMotor` lo resuelve determinístico — corre la tool de
  // escritura autorizada si la hay, o dice exactamente qué firma falta.
  if ((eleccion.resolucion === 'determinista' && eleccion.confianza === 'alta')
    || (pideMutacion(texto) && eleccion.skills.length)) {
    const conMotor = await intentarMotor({ pedido, eleccion, catalogo, mapa, porArchivo, porLib, sinFirma, deps, texto, t0 })
    if (conMotor) return conMotor
  }

  // ── N2 / N3 ───────────────────────────────────────────────────────────────────────────────
  return resolverConModelo({
    pedido, nivel, skills: eleccion.skills, motivo: eleccion.motivo, ia: await puertaIa(deps), t0,
    degradacion: sinMotorEsDegradacion(eleccion),
    // Sin skills el ruteo no supo QUÉ se pidió; con skills sabe el dominio y lo que falta es
    // el razonamiento en palabras. Son dos problemas distintos y se arreglan distinto.
    razon: eleccion.skills.length ? RAZON_RAZONADOR.UNSTRUCTURED_REASONING : RAZON_RAZONADOR.AMBIGUOUS_INTENT,
  })
}

/**
 * ═══ CAER AL MODELO SABIENDO EL DOMINIO ES UNA DEGRADACIÓN (27/08/2026) ═══
 *
 * «¿cuánta plata hay en caja hoy?» ruteaba a finanzas con resolución DETERMINISTA y confianza ALTA,
 * no encontraba motor, terminaba en el modelo y volvía «no tengo ese dato cargado» pidiéndole al
 * dueño los saldos por cuenta — con `degradacion: null` y estado `ok`. Un «no tengo el dato» que no
 * se declara degradado es peor que un error: parece una respuesta.
 *
 * Cuando el ruteo NO reconoció el dominio, que conteste el modelo es el camino normal y no hay nada
 * que declarar. Cuando SÍ lo reconoció con confianza alta, que ninguna capacidad haya podido correr
 * es información que el que preguntó necesita: le está contestando el razonador, no el OS. PURA.
 */
export function sinMotorEsDegradacion(eleccion) {
  if (eleccion?.resolucion !== 'determinista' || eleccion?.confianza !== 'alta') return null
  const dominios = (eleccion.skills ?? []).join(', ')
  return `sin dato del OS: el ruteo reconoció ${dominios || 'el dominio'} con confianza alta y ninguna capacidad determinística pudo correr; contesta el razonador`
}

/**
 * ¿HAY UN MOTOR DEL OS QUE RESUELVA ESTO? Devuelve la respuesta, o `null` si no lo hay.
 *
 * Recorre las tools que las skills elegidas CITAN y que el actor puede correr. La primera que tiene
 * todos sus argumentos gana. Si a una le falta un argumento, se guarda: puede estar en la frase.
 */
async function intentarMotor({ pedido, eleccion, catalogo, mapa, porArchivo, porLib = null, sinFirma = [], deps, texto, t0 }) {
  // ═══ UN PEDIDO DE ESCRITURA NO SE CONTESTA CON UNA LECTURA (01/09/2026) ═══
  //
  // «necesito q edites el sheet flujo de fondos» corría `os.iva_anual`: la primera tool de LECTURA
  // sin argumentos requeridos que las skills citaran, con afinidad de ruido. Para una mutación sólo
  // son candidatas las tools que ESCRIBEN; si ninguna puede correr, la respuesta es determinística
  // y dice qué falta — nunca una lectura que no honra el pedido ni un párrafo del modelo.
  const mutacion = pideMutacion(texto)
  const conArgumentoEnLaFrase = []
  // ═══ CUÁL DE LAS CAPACIDADES DE LA SKILL, Y POR QUÉ NO LA PRIMERA (27/08/2026) ═══
  //
  // Una skill de finanzas resuelve a tres motores —el briefing de caja, los vencimientos sin
  // conciliar y el estado de la empresa— y los tres contestan preguntas distintas. Tomar la primera
  // que la ficha nombra hacía que la respuesta dependiera del orden en que alguien escribió una
  // lista en un markdown. `ordenarPorAfinidad` puntúa contra la `description` de cada tool, que es
  // donde ya está escrito para qué sirve: determinístico, sin modelo y estable entre corridas.
  const candidatas = eleccion.skills.flatMap((skill) =>
    toolsDeSkill(catalogo.find((f) => f.clave === skill), porArchivo, porLib))
  const sinPermiso = []
  for (const clave of ordenarPorAfinidad(texto, [...new Set(candidatas)], (c) => mapa.get(c))) {
    const tool = mapa.get(clave)
    if (!tool) continue
    if (mutacion && !escribeAfuera(tool.capability)) continue
    if (!puedeUsar(pedido.actor, tool, clave)) { sinPermiso.push(clave); continue }
    const resuelto = argumentosPara(tool, pedido)
    if (resuelto.falta.length) { conArgumentoEnLaFrase.push({ clave, tool, resuelto }); continue }
    return resolverConTool({ pedido, clave, tool, nivel: NIVEL.CAPACIDAD, via: 'skill_con_motor', skills: eleccion.skills, t0, query: deps.query ?? null })
  }

  // ═══ EL ARGUMENTO ESTABA EN LA FRASE, NO EN EL CONTEXTO (27/08/2026) ═══
  //
  // «Analizá los planos de Quattropani» rutea perfecto a la capacidad correcta y hasta acá se
  // descartaba por «falta proyecto»: el dato estaba dicho y no estaba en ningún `contexto`. El
  // resultado era el peor de los dos mundos —el ruteo acertaba y la capacidad no corría—, y hacía
  // que TODA tool con parámetros fuera inalcanzable desde el chat.
  //
  // Se intenta sólo con la PRIMERA candidata: si el ruteo eligió mal, completar argumentos de cinco
  // tools distintas sería pagar cinco veces por adivinar. Si el argumento sigue sin aparecer, esto
  // no cambia nada — devuelve `null` y el gateway sigue su camino de siempre.
  // ═══ UN «NO PODÉS» NO SE CONTESTA CON UN PÁRRAFO DEL MODELO (27/08/2026) ═══
  //
  // Medido en producción: un `jefe_obra` pidió analizar planos, la cerradura lo frenó bien —la tool
  // ni se tocó— y el gateway le pasó la frase al modelo, que contestó «no tengo acceso a ningún
  // archivo». Falso y confuso: el OS SÍ tiene la capacidad y los archivos, y lo que pasó es que ese
  // rol no puede usarla. La respuesta escondía la decisión de autorización detrás de una excusa
  // técnica inventada. Se dice lo que pasó, con el nombre de la capacidad y del rol.
  if (!conArgumentoEnLaFrase.length && sinPermiso.length) {
    return respuestaOk(pedido, {
      respuesta: `No puedo hacerlo con tu rol («${pedido.actor?.rol ?? 'desconocido'}»). `
        + `La capacidad existe —${sinPermiso.join(', ')}— y para usarla hace falta un permiso que hoy no tenés. `
        + 'Pedíselo a Dirección.',
      capacidades: { nivel: NIVEL.DETERMINISTICO, skills: eleccion.skills, tools: [], via: 'sin_permiso', confianza: 'alta', motivo: 'sin_permiso' },
      degradacion: `sin permiso para ${sinPermiso.join(', ')} con el rol «${pedido.actor?.rol ?? 'desconocido'}»`,
      ms: Date.now() - t0,
    })
  }

  const candidata = conArgumentoEnLaFrase[0]
  if (!candidata) return mutacion ? escrituraNoDisponible({ pedido, eleccion, sinFirma, texto, t0 }) : null
  const ia = await puertaIa(deps)
  const completo = await completarArgumentos({
    ia, texto, tool: candidata.tool, args: candidata.resuelto.args, falta: candidata.resuelto.falta, logger: deps.logger ?? null,
  })
  // ═══ MUTACIÓN CON TOOL ALCANZABLE PERO SIN DATO: SE PIDE EL DATO, NO SE INVENTA NADA ═══
  // La capacidad de escritura existe y puede correr; lo que falta es un argumento que ni el
  // contexto ni la frase trajeron. Eso es NECESITA_DATO — distinto de «falta la firma».
  if (completo.falta.length) {
    if (!mutacion) return null
    return respuestaError(pedido, {
      tipo: 'falta_dato',
      mensaje: `Para hacerlo me falta un dato: ${completo.falta.join(', ')} (capacidad ${candidata.clave}). Decímelo y lo ejecuto.`,
      ms: Date.now() - t0,
      capacidades: { nivel: NIVEL.DETERMINISTICO, skills: eleccion.skills ?? [], tools: [candidata.clave], via: 'mutacion_falta_dato', confianza: 'alta', motivo: 'mutacion_falta_dato' },
    })
  }
  return resolverConTool({
    pedido, clave: candidata.clave, tool: candidata.tool, nivel: NIVEL.CAPACIDAD,
    via: 'skill_con_motor_argumento_de_la_frase', skills: eleccion.skills, t0,
    query: deps.query ?? null, argsResueltos: { args: completo.args, falta: [] },
  })
}

/**
 * UNA CLÁUSULA DE UN OBJETIVO COMPUESTO → SU CAPACIDAD, POR EL CAMINO DE SIEMPRE Y SIN MODELO.
 * Devuelve la tool ejecutable, o el motivo por el que la cláusula queda como residuo.
 */
function resolverClausula({ clausula, pedido, mapa, catalogo, porArchivo, porLib, deps }) {
  const atajo = atajoPara(clausula)
  let candidatas
  if (atajo && mapa.has(atajo)) {
    candidatas = [atajo]
  } else {
    const eleccion = (deps.elegir ?? elegirCapacidad)(clausula, { asesoria: true })
    if (!eleccion.skills?.length) return { clausula, residuo: 'ninguna skill reconoce este pedido' }
    candidatas = [...new Set(eleccion.skills.flatMap((s) => toolsDeSkill(catalogo.find((f) => f.clave === s), porArchivo, porLib)))]
  }
  const mutacion = pideMutacion(clausula)
  let sinPermiso = null
  for (const clave of ordenarPorAfinidad(clausula, candidatas, (c) => mapa.get(c))) {
    const tool = mapa.get(clave)
    if (!tool) continue
    if (mutacion && !escribeAfuera(tool.capability)) continue
    // Sin atajo exacto se exige una señal real de afinidad: adivinar una capacidad para una
    // cláusula es peor que declararla residuo.
    if (!atajo && afinidad(clausula, tool) <= 0) continue
    if (!puedeUsar(pedido.actor, tool, clave)) { sinPermiso = clave; continue }
    const resuelto = argumentosPara(tool, pedido)
    if (resuelto.falta.length) return { clausula, clave, residuo: `falta ${resuelto.falta.join(', ')}` }
    return { clausula, clave, tool, args: resuelto.args }
  }
  if (sinPermiso) return { clausula, clave: sinPermiso, residuo: `sin permiso para ${sinPermiso} con tu rol` }
  return { clausula, residuo: 'ninguna capacidad determinística la resuelve' }
}

/**
 * EL OBJETIVO COMPUESTO: partes → capacidades → ejecución secuencial → residuo declarado.
 *
 * Los resultados viajan como DATOS (datos.partes[] con el resultado estructurado de cada tool),
 * no como párrafos reinterpretados. El residuo no rompe lo resuelto: queda nombrado, con motivo,
 * para el razonador o para el usuario — nunca «todo error» porque una parte no salió.
 */
async function atenderCompuesto({ pedido, texto, mapa, catalogo, porArchivo, porLib, deps, t0 }) {
  const partes = partirObjetivo(texto)
  if (!partes.length) return null
  const resueltas = partes.map((clausula) => resolverClausula({ clausula, pedido, mapa, catalogo, porArchivo, porLib, deps }))
  const ejecutables = resueltas.filter((r) => r.tool)
  const clavesDistintas = new Set(ejecutables.map((r) => r.clave))
  // El guardián anti-falso-compuesto: si no hay al menos DOS capacidades distintas, el objetivo
  // se atiende entero por el flujo normal (que puede razonar mejor la frase completa).
  if (clavesDistintas.size < 2) return null

  const bloques = []
  const acciones = []
  const evidencia = []
  const partesDatos = []
  const toolsUsadas = []
  for (const r of resueltas) {
    if (!r.tool) {
      partesDatos.push({ pedido: r.clausula, estado: 'PENDIENTE_RAZONAMIENTO', motivo: r.residuo, tool: r.clave ?? null })
      continue
    }
    const corrida = await correrTool({ clave: r.clave, tool: r.tool, pedido, query: deps.query ?? null, argsResueltos: { args: r.args, falta: [] } })
    if (!corrida.ok) {
      partesDatos.push({ pedido: r.clausula, estado: 'ERROR', motivo: corrida.motivo, tool: r.clave })
      bloques.push(`**${r.clausula}** — no salió: ${corrida.motivo}`)
      continue
    }
    toolsUsadas.push(r.clave)
    acciones.push({ tool: r.clave, args: corrida.args })
    evidencia.push({ que: `resultado de «${r.clausula}»`, fuente: `tool ${r.clave}`, cuando: new Date().toISOString() })
    partesDatos.push({ pedido: r.clausula, estado: 'RESUELTA', tool: r.clave, datos: corrida.datos })
    bloques.push(`**${r.clausula}**\n${textoDeDatos(corrida.datos) ?? '(sin texto: el dato está en datos.partes)'}`)
  }
  const pendientes = partesDatos.filter((p) => p.estado !== 'RESUELTA')
  if (pendientes.length) {
    bloques.push(`⚠️ Quedan sin resolver por esta vía: ${pendientes.map((p) => `«${p.pedido}» (${p.motivo})`).join(' · ')}`)
  }
  const visible = filtrarPorVisibilidad({
    actor: pedido.actor,
    datos: { partes: partesDatos },
    args: null,
    respuesta: bloques.join('\n\n'),
  })
  return respuestaOk(pedido, {
    respuesta: visible.respuesta,
    datos: visible.datos,
    capacidades: { nivel: NIVEL.CAPACIDAD, skills: [], tools: toolsUsadas, via: 'objetivo_compuesto', confianza: 'alta', motivo: 'objetivo_compuesto' },
    accionesEjecutadas: acciones,
    evidencia,
    degradacion: pendientes.length ? `${pendientes.length} parte(s) del objetivo quedaron pendientes: ${pendientes.map((p) => p.pedido).join(' · ')}` : null,
    ms: Date.now() - t0,
  })
}

/**
 * ADJUNTOS + UNA FRASE QUE PIDE TRABAJO → LA TOOL QUE DECLARA CONSUMIRLOS.
 *
 * «cotizame esta obra» con dos planos adjuntos no es «leeme estos archivos»: es un pedido a una
 * capacidad concreta, con los archivos como insumo. El mecanismo es GENERAL: una tool que puede
 * recibir adjuntos lo declara con `adjuntos: true` en su registro, y acá se elige por la MISMA
 * afinidad del ruteo normal — nada de frases hardcodeadas. La frase decide (dato ≠ instrucción:
 * lo que diga el archivo adentro no rutea); los adjuntos viajan como `args.archivos`.
 *
 * Devuelve null cuando ninguna tool con adjuntos matchea la frase: el llamador sigue con la
 * ingesta-y-descripción de siempre.
 */
async function intentarConAdjuntos({ pedido, texto, lecturas, mapa, deps, t0 }) {
  const utiles = lecturas.filter((l) => l.destino !== DESTINO.BANCO)
  if (!utiles.length) return null
  // El umbral pide DOS señales (cabeza + disparador): una palabra suelta que la cabeza de la tool
  // menciona de paso («obra», «planos») no alcanza para mandarle los adjuntos — eso sería adivinar.
  // «mirá esta obra» (3) sigue siendo ingesta; «cotizame esta obra» (5) y «cotizá esto» (6) matchean.
  const UMBRAL = PESO.CABEZA + PESO.DISPARADOR
  let mejor = null
  for (const [clave, tool] of mapa.entries()) {
    if (tool?.adjuntos !== true) continue
    const a = afinidad(texto, tool)
    if (a >= UMBRAL && (!mejor || a > mejor.a)) mejor = { clave, tool, a }
  }
  if (!mejor) return null
  const { clave, tool } = mejor
  if (!puedeUsar(pedido.actor, tool, clave)) {
    return respuestaError(pedido, {
      tipo: 'sin_permiso',
      mensaje: `los adjuntos van a la capacidad ${clave}, pero tu rol («${pedido.actor?.rol ?? 'desconocido'}») no puede usarla. Pedíselo a Dirección.`,
      ms: Date.now() - t0,
      capacidades: { nivel: NIVEL.DETERMINISTICO, via: 'adjunto_con_motor' },
    })
  }
  let { args, falta } = argumentosPara(tool, pedido)
  if (falta.length) {
    const ia = await puertaIa(deps)
    const completo = await completarArgumentos({ ia, texto, tool, args, falta, logger: deps.logger ?? null })
    args = completo.args
    falta = completo.falta
  }
  if (falta.length) {
    // La lectura persistida guarda el TEXTO extraído, no los bytes: un follow-up con el dato que
    // falta no puede volver a subir el archivo. Se dice, en vez de fallar raro después.
    return respuestaError(pedido, {
      tipo: 'falta_dato',
      mensaje: `Para hacerlo con estos adjuntos me falta: ${falta.join(', ')} (capacidad ${clave}). `
        + 'Mandámelos de nuevo con ese dato en el mensaje y lo ejecuto.',
      ms: Date.now() - t0,
      capacidades: { nivel: NIVEL.DETERMINISTICO, tools: [clave], via: 'adjunto_falta_dato', confianza: 'alta', motivo: 'adjunto_falta_dato' },
    })
  }
  const archivos = utiles.map((l) => ({
    nombre: l.nombre,
    contenido: typeof l.adjunto?.contenido === 'string' ? l.adjunto.contenido : undefined,
    contenido_base64: l.adjunto?.contenido_base64 ?? undefined,
  }))
  return resolverConTool({
    pedido, clave, tool, nivel: NIVEL.CAPACIDAD, via: 'adjunto_con_motor', skills: [], t0,
    query: deps.query ?? null, argsResueltos: { args: { ...args, archivos }, falta: [] },
  })
}

/**
 * LOS ADJUNTOS DEL PEDIDO: ingesta → contexto → capacidad.
 *
 * Cada archivo se lee con el motor existente y queda persistido por hash (`xsas-archivos.mjs`).
 * Un extracto bancario corre el importador real — la MISMA conducta de siempre, permiso incluido.
 * El resto se describe con lo que SE LEYÓ y queda activo en el contexto para los follow-ups.
 * El contenido de un archivo es DATO: nada de lo que diga adentro rutea, autoriza ni ejecuta.
 */
async function atenderAdjuntos({ pedido, conContenido, mapa, deps, t0 }) {
  const query = deps.query ?? null
  const { lecturas, sinMemoria } = await ingerirAdjuntos({
    adjuntos: conContenido, actorId: pedido.actor?.id, correlacionId: pedido.correlationId,
    query, leerPdf: deps.leerPdf,
  })
  if (!lecturas.length) {
    return respuestaError(pedido, {
      tipo: 'error_archivo', mensaje: 'recibí adjuntos pero ninguno traía contenido legible',
      ms: Date.now() - t0, capacidades: { nivel: NIVEL.DETERMINISTICO, via: 'archivo_ingesta' },
    })
  }

  // Los archivos quedan ACTIVOS en el contexto de la conversación — es lo que hace que «ahora
  // mostrame eso de nuevo» funcione sin volver a subirlos.
  const previo = await cargarContexto(query, { actorId: pedido.actor?.id, correlacionId: pedido.correlationId })
  const guardado = await guardarContexto(query, {
    actorId: pedido.actor?.id, correlacionId: pedido.correlationId,
    parche: { archivos: acotarArchivos(previo?.archivos, lecturas.map(caratulaDeLectura)) },
  })

  // La frase que acompaña a los adjuntos puede pedir una capacidad que los CONSUME (cotizar unos
  // planos). Si matchea, esa capacidad corre con los archivos; si no, la ingesta de siempre.
  const textoDelPedido = textoDePedido(pedido)
  if (textoDelPedido && textoDelPedido.trim()) {
    const conMotor = await intentarConAdjuntos({ pedido, texto: textoDelPedido, lecturas, mapa, deps, t0 })
    if (conMotor) return conMotor
  }

  const bloques = []
  const toolsUsadas = []
  const acciones = []
  const degradaciones = []
  let datosExtracto = null
  for (const l of lecturas) {
    if (l.destino === DESTINO.BANCO) {
      const clave = 'banco.importar_extracto'
      const tool = mapa.get(clave)
      if (!tool) {
        bloques.push(`${textoDeLectura(l)}\nEl importador del banco no está disponible por esta vía ahora mismo: leí el extracto pero NO lo cargué.`)
        continue
      }
      if (!puedeUsar(pedido.actor, tool, clave)) {
        return respuestaError(pedido, {
          tipo: 'sin_permiso', mensaje: `el adjunto "${l.nombre}" es un extracto bancario, pero tu rol no puede importarlo`,
          ms: Date.now() - t0, capacidades: { nivel: NIVEL.DETERMINISTICO, via: 'adjunto_extracto' },
        })
      }
      const contenidoTexto = typeof l.adjunto?.contenido === 'string' && l.adjunto.contenido
        ? l.adjunto.contenido
        : Buffer.from(l.adjunto?.contenido_base64 ?? '', 'base64').toString('utf8')
      const r = await correrTool({
        clave, tool, pedido, query,
        argsResueltos: { args: { contenido: contenidoTexto, nombre: l.nombre }, falta: [] },
      })
      if (!r.ok) {
        return respuestaError(pedido, { tipo: r.tipo, mensaje: r.motivo, ms: Date.now() - t0, capacidades: { nivel: NIVEL.DETERMINISTICO, via: 'adjunto_extracto' } })
      }
      toolsUsadas.push(clave)
      acciones.push({ tool: clave, args: { nombre: l.nombre } })
      datosExtracto = r.datos
      if (r.datos?.ok === false) degradaciones.push(String(r.datos.error ?? '').slice(0, 200))
      bloques.push(textoDeDatos(r.datos) ?? textoDeLectura(l))
      continue
    }
    bloques.push(textoDeLectura(l))
  }
  if (sinMemoria || !guardado) {
    degradaciones.push('sin memoria de archivos: esta lectura no queda disponible para follow-ups')
  }
  return respuestaOk(pedido, {
    respuesta: bloques.join('\n\n'),
    datos: datosExtracto ?? { archivos: lecturas.map((l) => caratulaDeLectura(l)) },
    capacidades: {
      nivel: NIVEL.DETERMINISTICO, skills: [], tools: toolsUsadas,
      via: toolsUsadas.length ? 'adjunto_extracto' : 'archivo_ingesta', confianza: 'alta',
      motivo: toolsUsadas.length ? 'adjunto_extracto' : 'archivo_ingesta',
    },
    accionesEjecutadas: acciones,
    evidencia: lecturas.map((l) => ({ que: `lectura de ${l.nombre}`, fuente: `hash ${String(l.hash).slice(0, 12)}`, cuando: new Date().toISOString() })),
    degradacion: degradaciones.join(' · ') || null,
    ms: Date.now() - t0,
  })
}

/**
 * EL FOLLOW-UP RESUELTO DESDE EL ESTADO, NO DESDE UN TRANSCRIPT.
 *
 * Lee el contexto de la conversación (actor + correlación, SIEMPRE filtrado por el actor que puso
 * el servidor) y la lectura persistida de sus archivos activos. `null` cuando el contexto no
 * alcanza: la frase sigue el ruteo de siempre — un detector que secuestra preguntas nuevas es peor
 * que uno corto.
 */
async function atenderDesdeContexto({ pedido, ref, deps, t0 }) {
  const ctx = await cargarContexto(deps.query, { actorId: pedido.actor?.id, correlacionId: pedido.correlationId })
  const archivos = Array.isArray(ctx?.archivos) ? ctx.archivos : []
  if (!archivos.length) return null
  let filas = []
  try {
    const { rows } = await deps.query(
      `select hash, nombre, tamano, familia, formato, destino, resumen
         from orq.xsas_adjunto where actor_id = $1 and hash = any($2::text[])`,
      [String(pedido.actor?.id ?? ''), archivos.map((a) => a.hash)],
    )
    filas = rows ?? []
  } catch { return null }
  if (!filas.length) return null
  const orden = new Map(archivos.map((a, i) => [a.hash, i]))
  filas.sort((a, b) => (orden.get(a.hash) ?? 99) - (orden.get(b.hash) ?? 99))

  const bloques = []
  if (ref.aspecto === 'pendiente') {
    for (const f of filas) {
      const r = f.resumen ?? {}
      if (f.destino === DESTINO.BANCO) {
        const rech = Array.isArray(r.rechazos) ? r.rechazos : []
        bloques.push(rech.length
          ? `**${f.nombre}** — ${rech.length} fila(s) que NO pude tomar:\n${rech.slice(0, 20).map((x) => `· ${typeof x === 'string' ? x : JSON.stringify(x).slice(0, 160)}`).join('\n')}`
          : `**${f.nombre}** — no quedó nada sin tomar: los ${r.movimientos?.length ?? 0} movimiento(s) se leyeron enteros.`)
      } else {
        bloques.push(`**${f.nombre}** — no tengo pendientes registrados de este archivo (${f.destino}): lo leído está completo.`)
      }
    }
  } else {
    for (const f of filas) bloques.push(textoDeLectura({ ...f, reutilizado: true }))
  }
  return respuestaOk(pedido, {
    respuesta: bloques.join('\n\n'),
    datos: { archivos: filas.map((f) => ({ hash: f.hash, nombre: f.nombre, destino: f.destino })) },
    capacidades: { nivel: NIVEL.DETERMINISTICO, skills: [], tools: [], via: 'contexto_archivos', confianza: 'alta', motivo: `referencia contextual (${ref.aspecto})` },
    evidencia: filas.map((f) => ({ que: `lectura persistida de ${f.nombre}`, fuente: `orq.xsas_adjunto ${String(f.hash).slice(0, 12)}`, cuando: new Date().toISOString() })),
    ms: Date.now() - t0,
  })
}

/**
 * LA MUTACIÓN QUE HOY NO SE PUEDE EJECUTAR, DICHA CON NOMBRE Y APELLIDO.
 *
 * Un pedido de escritura sin tool de escritura ejecutable termina acá, nunca en una lectura ni en
 * un modelo. Se distingue el motivo real: la capacidad existe y ESPERA LA FIRMA del dueño
 * (`sinFirma`, la cola exacta de `TOOLS_AUTORIZADAS_A_ESCRIBIR`), o directamente no hay capacidad
 * de escritura para ese dominio. `necesita_autorizacion` no es un fallo del sistema: es el sistema
 * diciendo la verdad sobre sus cerraduras. PURA salvo el reloj.
 */
function escrituraNoDisponible({ pedido, eleccion, sinFirma, texto, t0 }) {
  const palabras = palabrasDe(texto)
  const esperanFirma = sinFirma.filter((clave) => palabras.some((w) => clave.toLowerCase().includes(w)))
  const dominio = (eleccion.skills ?? []).join(', ') || 'ese dominio'
  const mensaje = esperanFirma.length
    ? `Entendí que querés modificar algo (${dominio}). No lo ejecuté: la(s) capacidad(es) de escritura que podrían hacerlo `
      + `—${esperanFirma.join(', ')}— existen pero todavía no están autorizadas a escribir. Necesitan la firma del dueño en la lista de tools autorizadas.`
    : `Entendí que querés modificar algo (${dominio}), pero hoy no tengo una capacidad de escritura autorizada que pueda hacerlo. No ejecuté nada.`
  return respuestaError(pedido, {
    tipo: 'necesita_autorizacion',
    mensaje,
    ms: Date.now() - t0,
    capacidades: { nivel: NIVEL.DETERMINISTICO, skills: eleccion.skills ?? [], tools: [], via: 'mutacion_sin_escritura', confianza: 'alta', motivo: 'mutacion_sin_escritura' },
  })
}

/** La puerta hacia el modelo. Se importa PEREZOSO: un pedido que se resuelve en N0 no carga el
 *  cliente de IA ni sus dependencias. */
async function puertaIa(deps) {
  if (deps.ia) return deps.ia
  return import('./ia/cliente.mjs')
}
