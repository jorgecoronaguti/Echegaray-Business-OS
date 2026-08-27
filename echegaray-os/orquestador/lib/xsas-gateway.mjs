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
  toolsDelNucleo, atajoPara, argumentosPara, puedeUsar, toolsDeSkill,
} from './xsas-resolutores.mjs'

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
async function correrTool({ clave, tool, pedido }) {
  if (!puedeUsar(pedido.actor, tool)) {
    return { ok: false, motivo: `sin permiso para ${clave} (requiere ${tool.capability})`, tipo: 'sin_permiso' }
  }
  const { args, falta } = argumentosPara(tool, pedido)
  if (falta.length) return { ok: false, motivo: `falta ${falta.join(', ')} para ${clave}`, tipo: 'falta_dato' }
  try {
    const datos = await tool.run(args)
    return { ok: true, datos, args }
  } catch (e) {
    return { ok: false, motivo: `${clave} falló: ${String(e?.message ?? e).slice(0, 200)}`, tipo: 'tool_fallo' }
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
async function resolverConTool({ pedido, clave, tool, nivel, via, skills = [], t0 }) {
  const r = await correrTool({ clave, tool, pedido })
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
    if (tool) return resolverConTool({ pedido, clave, tool, nivel: NIVEL.DETERMINISTICO, via: 'intencion_exacta', t0 })
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
  const atajo = atajoPara(texto)
  if (atajo && mapa.has(atajo)) {
    return resolverConTool({ pedido, clave: atajo, tool: mapa.get(atajo), nivel: NIVEL.DETERMINISTICO, via: 'atajo_exacto', t0 })
  }

  // ── N1 · EL RUTEO XSAS QUE YA EXISTE ──────────────────────────────────────────────────────
  const catalogo = deps.catalogo ?? await leerCatalogoDeDisco({}).catch(() => [])
  const eleccion = (deps.elegir ?? elegirCapacidad)(texto, { asesoria: pedido.tipo === TIPO.MENSAJE })
  const nivel = nivelDeRuteo(catalogo, eleccion)

  if (nivel <= NIVEL.CAPACIDAD) {
    for (const skill of eleccion.skills) {
      const ficha = catalogo.find((f) => f.clave === skill)
      for (const clave of toolsDeSkill(ficha, porArchivo)) {
        const tool = mapa.get(clave)
        if (!tool || !puedeUsar(pedido.actor, tool)) continue
        if (argumentosPara(tool, pedido).falta.length) continue
        return resolverConTool({ pedido, clave, tool, nivel: NIVEL.CAPACIDAD, via: 'skill_con_motor', skills: eleccion.skills, t0 })
      }
    }
    // La skill aplica pero no hay tool ejecutable con lo que tenemos. NO se responde «no puedo»:
    // se escala, porque la política dice que menos modelo no puede significar peor respuesta.
    return resolverConModelo({
      pedido, nivel: NIVEL.IA_LIVIANA, skills: eleccion.skills,
      motivo: `${eleccion.motivo}; sin tool ejecutable para esas skills`, ia: await puertaIa(deps), t0,
    })
  }

  // ── N2 / N3 ───────────────────────────────────────────────────────────────────────────────
  return resolverConModelo({ pedido, nivel, skills: eleccion.skills, motivo: eleccion.motivo, ia: await puertaIa(deps), t0 })
}

/** La puerta hacia el modelo. Se importa PEREZOSO: un pedido que se resuelve en N0 no carga el
 *  cliente de IA ni sus dependencias. */
async function puertaIa(deps) {
  if (deps.ia) return deps.ia
  return import('./ia/cliente.mjs')
}
