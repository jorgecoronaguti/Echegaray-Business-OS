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
import { leerCatalogoDeDisco } from './skill-catalogo.mjs'
import { SIN_RAZONADOR } from './xsas.mjs'
import { normalizarPedido, textoDePedido, TIPO, PedidoInvalido } from './xsas-pedido.mjs'
import { respuestaOk, respuestaError } from './xsas-respuesta.mjs'
import { registrarTraza } from './xsas-traza.mjs'
import {
  toolsDelNucleo, atajoPara, ATAJOS_EN_OBRA, normalizarFrase, argumentosPara, puedeUsar, toolsDeSkill,
} from './xsas-resolutores.mjs'
import { escribeAfuera } from './xsas-permisos.mjs'
import { completarArgumentos } from './xsas-argumentos.mjs'

/** La capacidad de modelo que corresponde a cada nivel de la política. El nivel lo decide el ruteo
 *  determinístico; acá sólo se traduce. Un nivel 2 JAMÁS toma el modelo potente. */
const CAPACIDAD_POR_NIVEL = Object.freeze({
  [NIVEL.IA_LIVIANA]: CAPACIDAD.SIMPLE,
  [NIVEL.RAZONAMIENTO]: CAPACIDAD.COMPLEX,
})

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
    return { ok: true, datos, args }
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
        datos?.id ?? datos?.archivo?.id ?? null,
        datos?.link ?? datos?.drive_url ?? datos?.imagen_url ?? null,
        error ? 'error' : 'ok',
        error ?? null,
      ],
    )
  } catch (e) {
    console.warn(`[xsas] no se pudo firmar la escritura de ${clave}: ${String(e?.message ?? e).slice(0, 160)}`)
  }
}

/** El texto para una persona a partir de lo que devolvió una tool. Las tools del OS ya traen su
 *  lectura armada (`resumen_texto`, `lectura`); si no la traen, se entrega el dato y se dice que
 *  es un dato — nunca se redacta un párrafo con un modelo para adornar un número que ya está. */
function textoDeDatos(datos) {
  if (datos == null) return null
  if (typeof datos === 'string') return datos
  return datos.resumen_texto ?? datos.lectura ?? datos.texto ?? null
}

/** N0/N1: correr la tool y armar la respuesta. `via` dice cómo se llegó, y queda en la traza. */
async function resolverConTool({ pedido, clave, tool, nivel, via, skills = [], t0, query = null, argsResueltos = null }) {
  const r = await correrTool({ clave, tool, pedido, query, argsResueltos })
  const capacidades = { nivel, skills, tools: [clave], via, confianza: 'alta', motivo: via }
  if (!r.ok) {
    return respuestaError(pedido, { tipo: r.tipo, mensaje: r.motivo, ms: Date.now() - t0, capacidades })
  }
  return respuestaOk(pedido, {
    respuesta: textoDeDatos(r.datos),
    datos: r.datos,
    capacidades,
    accionesEjecutadas: [{ tool: clave, args: r.args }],
    evidencia: [{ que: 'resultado', fuente: `tool ${clave}`, cuando: new Date().toISOString() }],
    ms: Date.now() - t0,
  })
}

/** N2/N3: el modelo. `ia.pedirTexto` es la ÚNICA puerta hacia un proveedor y ya trae reintentos,
 *  clasificación de error, fallback entre proveedores, costo y aviso de degradación. */
async function resolverConModelo({ pedido, nivel, skills, motivo, ia, t0 }) {
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
      capacidades: { nivel, skills, tools: [], via: 'modelo', confianza: 'media', motivo },
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
      capacidades: { nivel, skills, tools: [], via: 'modelo', confianza: null, motivo },
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
 * @param {object} [deps.registro]  {mapa, porArchivo} inyectable (tests)
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
  const { mapa, porArchivo } = registro

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
  const eleccion = (deps.elegir ?? elegirCapacidad)(texto, { asesoria: pedido.tipo === TIPO.MENSAJE })
  const nivel = nivelDeRuteo(catalogo, eleccion)

  if (nivel <= NIVEL.CAPACIDAD) {
    const conMotor = await intentarMotor({ pedido, eleccion, catalogo, mapa, porArchivo, deps, texto, t0 })
    if (conMotor) return conMotor
    // La skill aplica pero no hay tool ejecutable con lo que tenemos. NO se responde «no puedo»:
    // se escala, porque la política dice que menos modelo no puede significar peor respuesta.
    return resolverConModelo({
      pedido, nivel: NIVEL.IA_LIVIANA, skills: eleccion.skills,
      motivo: `${eleccion.motivo}; sin tool ejecutable para esas skills`, ia: await puertaIa(deps), t0,
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
  if (eleccion.resolucion === 'determinista' && eleccion.confianza === 'alta') {
    const conMotor = await intentarMotor({ pedido, eleccion, catalogo, mapa, porArchivo, deps, texto, t0 })
    if (conMotor) return conMotor
  }

  // ── N2 / N3 ───────────────────────────────────────────────────────────────────────────────
  return resolverConModelo({ pedido, nivel, skills: eleccion.skills, motivo: eleccion.motivo, ia: await puertaIa(deps), t0 })
}

/**
 * ¿HAY UN MOTOR DEL OS QUE RESUELVA ESTO? Devuelve la respuesta, o `null` si no lo hay.
 *
 * Recorre las tools que las skills elegidas CITAN y que el actor puede correr. La primera que tiene
 * todos sus argumentos gana. Si a una le falta un argumento, se guarda: puede estar en la frase.
 */
async function intentarMotor({ pedido, eleccion, catalogo, mapa, porArchivo, deps, texto, t0 }) {
  const conArgumentoEnLaFrase = []
  for (const skill of eleccion.skills) {
    const ficha = catalogo.find((f) => f.clave === skill)
    for (const clave of toolsDeSkill(ficha, porArchivo)) {
      const tool = mapa.get(clave)
      if (!tool || !puedeUsar(pedido.actor, tool, clave)) continue
      const resuelto = argumentosPara(tool, pedido)
      if (resuelto.falta.length) { conArgumentoEnLaFrase.push({ clave, tool, resuelto }); continue }
      return resolverConTool({ pedido, clave, tool, nivel: NIVEL.CAPACIDAD, via: 'skill_con_motor', skills: eleccion.skills, t0, query: deps.query ?? null })
    }
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
  const candidata = conArgumentoEnLaFrase[0]
  if (!candidata) return null
  const ia = await puertaIa(deps)
  const completo = await completarArgumentos({
    ia, texto, tool: candidata.tool, args: candidata.resuelto.args, falta: candidata.resuelto.falta, logger: deps.logger ?? null,
  })
  if (completo.falta.length) return null
  return resolverConTool({
    pedido, clave: candidata.clave, tool: candidata.tool, nivel: NIVEL.CAPACIDAD,
    via: 'skill_con_motor_argumento_de_la_frase', skills: eleccion.skills, t0,
    query: deps.query ?? null, argsResueltos: { args: completo.args, falta: [] },
  })
}

/** La puerta hacia el modelo. Se importa PEREZOSO: un pedido que se resuelve en N0 no carga el
 *  cliente de IA ni sus dependencias. */
async function puertaIa(deps) {
  if (deps.ia) return deps.ia
  return import('./ia/cliente.mjs')
}
