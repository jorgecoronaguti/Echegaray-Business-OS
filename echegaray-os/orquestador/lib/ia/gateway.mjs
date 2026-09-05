// EL GATEWAY: QUIÉN RAZONA CADA COSA, Y POR QUÉ ÉSE.
//
// ═══ QUÉ AGREGA SOBRE `cliente.mjs` ═══
//
// `cliente.mjs` ya es la puerta única hacia un modelo y resuelve reintentos, fusible, costo y
// degradación. Lo que NO hace —ni debe— es elegir entre proveedores por otra cosa que no sea «el
// primero falló». Ese orden fijo alcanzaba cuando había un solo proveedor de razonamiento.
//
// Ahora hay dos y son DISTINTOS en naturaleza, no en precio:
//
//   · Claude puede ver datos CONFIDENTIAL. Es la relación que el OS ya tiene contratada.
//   · Hugging Face NO. Su techo es INTERNAL y lo pone `politica.mjs`, no una preferencia.
//
// Elegir entre ellos por «cuál está barato» sería un error de categoría: la pregunta no es cuál
// cuesta menos sino QUÉ PUEDE VER CADA UNO. Por eso el plan se arma antes de llamar a nadie, y la
// política es la primera cláusula, no un filtro posterior.
//
// ═══ LO QUE VIAJA NO ES EL DATO: ES LA PREGUNTA ═══
//
// El reparto que hace posible la autonomía sin bajar la confidencialidad:
//
//   la pregunta del usuario + el catálogo de herramientas   →  HF   (es `intenciones`, INTERNAL)
//   la ejecución de la herramienta                          →  la VM, contra Postgres, con RLS
//   el dato confidencial que vuelve                         →  no se manda a HF nunca
//
// El modelo elige `finanzas.cobranzas` y sus argumentos. Los importes los pone el OS. Un LLM que
// nunca vio un importe no puede filtrarlo ni alucinarlo.
//
// ═══ NADIE PASA DE SOMBRA A PRODUCCIÓN POR PARECER BUENO ═══
//
// Un modelo nuevo entra en SOMBRA: contesta en paralelo, su respuesta se registra y SE DESCARTA.
// Claude sigue sirviendo. Recién cuando `ecsas-llm-eval` lo mide contra los casos reales, el
// registro lo mueve. La promoción la firma un benchmark, no este archivo.

import { CAPACIDAD, modeloPara, normalizarCapacidad } from './capacidad.mjs'
import { clasificarError } from './clasificar-error.mjs'
import { registrarUso, avisarEstado } from './cliente.mjs'
import { anthropic } from './proveedores/anthropic.mjs'
import { huggingface } from './proveedores/huggingface.mjs'
import { puedeSalir } from '../ml/politica.mjs'
import { autorizado } from '../ml/autorizaciones.mjs'
import { hallazgosEnTexto } from '../ml/publicar-evaluacion.mjs'

/** Cómo participa un proveedor no-Claude en una tarea. Es una escalera y no se saltean peldaños. */
export const MODO = Object.freeze({
  /** Contesta en paralelo, se registra, se DESCARTA. Sirve para medir sin arriesgar. */
  SOMBRA: 'sombra',
  /** Contesta y su salida se muestra como propuesta a una persona, que confirma. */
  SUGERIR: 'sugerir',
  /** Contesta y el OS usa su salida. Sólo con benchmark que lo respalde. */
  PRODUCCION: 'produccion',
  /** No participa. */
  APAGADO: 'apagado',
})

/**
 * EN QUÉ MODO ESTÁ HF PARA CADA TAREA.
 *
 * Vive acá y no en una variable de entorno suelta porque es una decisión con evidencia detrás: cada
 * entrada debería poder citar su corrida de `ecsas-llm-eval`. Lo que no está listado está APAGADO —
 * el default es no participar, nunca participar.
 */
export const MODO_POR_TAREA = Object.freeze({
  // Elegir la herramienta y completar sus argumentos a partir de la pregunta. Es la tarea más
  // verificable que existe en el OS: hay una herramienta correcta y unos argumentos correctos.
  'elegir-herramienta': MODO.SOMBRA,
  // A qué especialista va un mensaje del chat.
  rutear: MODO.SOMBRA,
  // Qué está pidiendo la persona, en estructura.
  interpretar: MODO.SOMBRA,
  // Elegir la partida de la Base Maestra que corresponde a un elemento leído de un plano. Es el
  // ÚNICO consumidor real de Claude cuyo dominio es INTERNAL de verdad: viajan códigos, unidades,
  // materiales y cantidades de un catálogo técnico — no precios, no clientes, no obras.
  'elegir-partida': MODO.SOMBRA,
})

export function modoDe(tarea) {
  return MODO_POR_TAREA[String(tarea ?? '')] ?? MODO.APAGADO
}

/**
 * EL PLAN: quién intenta, en qué orden, y por qué.
 *
 * Es una función PURA a propósito. La decisión de a quién se le manda un dato de la empresa tiene
 * que poder probarse sin red, sin token y sin base — si para saber qué habría hecho el OS hay que
 * hacer la llamada, ya es tarde.
 *
 * @returns { cadena: [{proveedor, rol}], sombra: proveedor|null, porQue }
 */
export function planDe({ tarea, dominio, permitidoExplicitamente = false, hfDisponible = true } = {}) {
  // LA AUTORIZACIÓN DEL DUEÑO, DECLARADA UNA VEZ. `permitidoExplicitamente` sigue mandando cuando
  // el caller la pasa —hay caminos que autorizan un caso puntual—, y si no, se consulta la lista
  // que el dueño escribió en su archivo de configuración. Lo que no está en ninguna de las dos,
  // no sale: sumar las dos fuentes es distinto de tener un interruptor global.
  const permitido = permitidoExplicitamente || autorizado(dominio)
  const permiso = puedeSalir(dominio, 'huggingface', { permitidoExplicitamente: permitido })
  const modo = modoDe(tarea)

  if (!hfDisponible) {
    return { cadena: [{ proveedor: anthropic, rol: 'principal' }], sombra: null,
      porQue: 'no hay token de Hugging Face en el servidor', sensibilidad: permiso.sensibilidad }
  }
  if (!permiso.permitido) {
    // Éste es el caso que más va a ocurrir, y tiene que quedar dicho con el motivo real: no es que
    // HF ande mal, es que ese dato no sale. Escrito así, el reporte de autonomía distingue
    // «el modelo no pudo» de «el dato no podía salir», que son problemas opuestos.
    return { cadena: [{ proveedor: anthropic, rol: 'principal' }], sombra: null,
      porQue: permiso.porQue, sensibilidad: permiso.sensibilidad }
  }
  if (modo === MODO.APAGADO) {
    return { cadena: [{ proveedor: anthropic, rol: 'principal' }], sombra: null,
      porQue: `«${tarea}» no está habilitada para Hugging Face`, sensibilidad: permiso.sensibilidad }
  }
  if (modo === MODO.SOMBRA) {
    return { cadena: [{ proveedor: anthropic, rol: 'principal' }], sombra: huggingface,
      porQue: `«${tarea}» está en sombra: HF mide, Claude sirve`, sensibilidad: permiso.sensibilidad }
  }
  // SUGERIR y PRODUCCIÓN: HF atiende y Claude queda como escalamiento.
  return {
    cadena: [{ proveedor: huggingface, rol: 'principal' }, { proveedor: anthropic, rol: 'escalamiento' }],
    sombra: null,
    porQue: `«${tarea}» está en ${modo}: HF atiende, Claude escala`,
    sensibilidad: permiso.sensibilidad,
  }
}

/** Una llamada a un proveedor, medida y registrada. No lanza: devuelve el resultado o el error. */
async function intentar(proveedor, opciones, meta) {
  const t0 = Date.now()
  try {
    const r = await proveedor.completar(opciones)
    const ms = Date.now() - t0
    await registrarUso({
      modelo: r.modeloUsado, usd: r.costoUsd ?? null, agente: meta.agente, funcion: meta.funcion,
      proveedor: proveedor.nombre, capacidad: meta.capacidad,
      tokensIn: r.tokens?.in ?? null, tokensOut: r.tokens?.out ?? null, ms, ok: true,
      fallbackDe: meta.fallbackDe ?? null,
    })
    return { ok: true, r, ms, proveedor: proveedor.nombre }
  } catch (err) {
    const c = clasificarError(err)
    const ms = Date.now() - t0
    await avisarEstado(c)
    await registrarUso({
      modelo: proveedor.idDeModelo(meta.alias), usd: null, agente: meta.agente, funcion: meta.funcion,
      proveedor: proveedor.nombre, capacidad: meta.capacidad,
      tokensIn: null, tokensOut: null, ms, ok: false, errorKind: c.kind,
      fallbackDe: meta.fallbackDe ?? null,
    })
    return { ok: false, err, ms, proveedor: proveedor.nombre, kind: c.kind }
  }
}

/**
 * PEDIRLE AL OS QUE RAZONE ALGO. La interfaz que usan los módulos nuevos.
 *
 * @param tarea         qué se está haciendo ('elegir-herramienta', 'rutear'…). Decide el modo.
 * @param dominio       el dominio del DATO que viaja. Decide quién puede verlo.
 * @param herramientas  las tools del OS, en su forma de siempre. Cada proveedor las traduce.
 * @returns { texto, toolCalls, proveedor, modelo, autonomo, escalado, motivo, ms, sombra }
 */
export async function llmRun({
  tarea, dominio = null, sistema = null, mensajes, herramientas = null,
  calidad = CAPACIDAD.NORMAL, maxTokens = 1024, temperatura, formato = null,
  agente = null, funcion = null, permitidoExplicitamente = false,
  señal, fetchImpl = globalThis.fetch, apiKey = process.env.ANTHROPIC_API_KEY,
} = {}) {
  const capacidad = normalizarCapacidad(calidad)
  const alias = modeloPara(capacidad)
  const plan = planDe({ tarea, dominio, permitidoExplicitamente, hfDisponible: huggingface.configurado() })
  const t0 = Date.now()

  const comunes = {
    sistema, mensajes, maxTokens, temperatura, herramientas, señal, fetchImpl,
    dominio, permitidoExplicitamente, formato,
  }

  // ── LA SOMBRA VA PRIMERO Y NO PUEDE ROMPER NADA ──
  // Se lanza sin esperarla: si HF tarda o falla, el usuario no se entera. Una medición que degrada
  // la operación que mide deja de ser una medición y pasa a ser una avería.
  //
  // ═══ DEFENSA EN PROFUNDIDAD: LA POLÍTICA DICE EL DOMINIO, ESTO MIRA EL CONTENIDO ═══
  //
  // `politica.mjs` clasifica por DOMINIO, que es una etiqueta que pone quien llama. `partidas` es
  // INTERNAL y es correcto que lo sea —códigos, unidades, materiales—, pero el prompt de
  // `elegir-partida` incluye el texto literal del plano, y un plano puede tener un nombre en el
  // rótulo. Una etiqueta correcta no garantiza un contenido limpio.
  //
  // Por eso la sombra —y SÓLO la sombra, que es lo opcional— pasa además por el mismo guardián que
  // decide qué se puede publicar: CUIT, importes en pesos y nombres de persona. Si encuentra algo,
  // no se mide y queda dicho por qué. Perder una medición es barato; exportar un nombre no.
  let sombra = null
  let sombraOmitida = null
  if (plan.sombra) {
    const hallazgos = hallazgosEnTexto(JSON.stringify({ sistema, mensajes }))
    if (hallazgos.length) {
      sombraOmitida = hallazgos
    } else {
      sombra = intentar(plan.sombra, { ...comunes, modelo: plan.sombra.idDeModelo(alias) },
        { agente, funcion: `${funcion ?? tarea}:sombra`, capacidad, alias })
        .catch(() => null)
    }
  }

  let ultimo = null
  let fallbackDe = null
  for (const { proveedor, rol } of plan.cadena) {
    if (proveedor === anthropic && !proveedor.configurado(apiKey)) {
      ultimo ??= new Error('anthropic: sin credencial')
      continue
    }
    const res = await intentar(proveedor, {
      ...comunes, modelo: proveedor.idDeModelo(alias), apiKey,
    }, { agente, funcion: funcion ?? tarea, capacidad, alias, fallbackDe })

    if (res.ok) {
      return {
        texto: res.r.texto,
        toolCalls: res.r.toolCalls ?? [],
        modelo: res.r.modeloUsado,
        proveedor: proveedor.nombre,
        // AUTÓNOMO = lo resolvió el OS sin Claude. Es el numerador del Autonomy Rate y por eso se
        // calcula acá y no en un reporte: un reporte que lo deduzca después va a deducirlo mal.
        autonomo: proveedor.nombre !== 'anthropic',
        escalado: rol === 'escalamiento',
        motivo: rol === 'escalamiento' ? (ultimo?.message ?? 'el principal no pudo') : plan.porQue,
        sensibilidad: plan.sensibilidad,
        ms: Date.now() - t0,
        sombra: sombra ? await sombra : null,
        sombraOmitida,
      }
    }
    ultimo = res.err
    fallbackDe = proveedor.nombre
  }

  const err = ultimo ?? new Error('gateway: ningún proveedor pudo atender')
  err.plan = plan.porQue
  throw err
}


/**
 * MEDIR UN MODELO CONTRA EL TRÁFICO REAL, SIN TOCAR EL CAMINO QUE SIRVE.
 *
 * ═══ POR QUÉ ES UNA FUNCIÓN APARTE Y NO UNA OPCIÓN DE `llmRun` ═══
 *
 * `llmRun` es un reemplazo: quien lo adopta cambia por dónde pasa su llamada. Eso es correcto para
 * código nuevo y es un riesgo innecesario para un camino que YA FUNCIONA en producción — el elector
 * de partidas del pipeline de planos lleva meses andando.
 *
 * Esta función no reemplaza nada. Se la llama AL LADO de la llamada de siempre, no devuelve nada
 * que nadie use y no puede lanzar. Si HF tarda, falla o el token no está, el pipeline ni se entera.
 * Es la única forma honesta de tener «sombra»: si la medición puede degradar lo que mide, no es una
 * medición, es una avería con nombre elegante.
 *
 * Lo que sí deja: una fila en `orq.chat_cost` con proveedor `huggingface` y la función marcada
 * `:sombra`, que es exactamente lo que el Autonomy Rate necesita para decir «esto lo habría podido
 * resolver el OS solo» sin habérselo jugado.
 */
export function medirEnSombra({
  tarea, dominio = null, sistema = null, mensajes, herramientas = null,
  calidad = CAPACIDAD.NORMAL, maxTokens = 1024, temperatura, agente = null, funcion = null,
  permitidoExplicitamente = false, logger = null,
} = {}) {
  try {
    const plan = planDe({ tarea, dominio, permitidoExplicitamente, hfDisponible: huggingface.configurado() })
    if (!plan.sombra) return { medido: false, porQue: plan.porQue }

    const hallazgos = hallazgosEnTexto(JSON.stringify({ sistema, mensajes }))
    if (hallazgos.length) return { medido: false, porQue: `el contenido ${hallazgos.join(' y ')}` }

    const capacidad = normalizarCapacidad(calidad)
    const alias = modeloPara(capacidad)
    // Sin `await` y con el error tragado: esta promesa no puede llegar a nadie.
    intentar(plan.sombra, {
      modelo: plan.sombra.idDeModelo(alias), sistema, mensajes, maxTokens, temperatura,
      herramientas, dominio, permitidoExplicitamente,
    }, { agente, funcion: `${funcion ?? tarea}:sombra`, capacidad, alias })
      .then((r) => logger?.info?.('sombra medida', { tarea, ok: r.ok, ms: r.ms }))
      .catch(() => {})
    return { medido: true, modelo: plan.sombra.idDeModelo(alias) }
  } catch {
    // Ni siquiera un error de programación acá puede tocar la operación que se está midiendo.
    return { medido: false, porQue: 'la sombra falló al armarse' }
  }
}
