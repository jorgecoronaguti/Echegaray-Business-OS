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
  // ═══ EN PRODUCCIÓN (06/09/2026) — POR QUÉ ESTAS TRES Y NO OTRAS ═══
  //
  // El criterio no es «dónde el modelo anda bien»: es DÓNDE LA SALIDA ES VERIFICABLE POR EL OS SIN
  // creerle al modelo. Las tres de abajo comparten la misma forma: el modelo elige de una LISTA
  // CERRADA o copia un valor de una frase, y el OS descarta todo lo que no esté en la lista o no
  // esté declarado en el `input_schema`. Un modelo que alucina no rompe nada: su salida se cae en
  // la validación y el caso escala. Eso es lo que hace que se pueda abrir sin bajar la calidad.
  //
  // Evidencia: benchmark del 05/09/2026 sobre el catálogo real de 93 herramientas —
  // Qwen3-4B-Instruct 90% = claude-haiku-4-5 90%, 0 herramientas prohibidas elegidas.

  // Elegir la herramienta y completar sus argumentos a partir de la pregunta. Es la tarea más
  // verificable que existe en el OS: hay una herramienta correcta y unos argumentos correctos.
  'elegir-herramienta': MODO.PRODUCCION,
  // Copiar de una frase el valor de un parámetro que la herramienta YA declaró. El modelo no elige
  // la herramienta —eso lo decidió el ruteo determinístico— y no puede agregar claves: sólo se
  // aceptan las que están en el `input_schema`. Es traducción, no decisión.
  'completar-argumentos': MODO.PRODUCCION,
  // A qué especialista va un mensaje del chat. Lista cerrada de slugs: un destino inventado se
  // descarta en `razonar-ruteo.mjs` y el Director muestra el catálogo.
  rutear: MODO.PRODUCCION,

  // ═══ EN SOMBRA — POR QUÉ ÉSTAS NO SE ABREN TODAVÍA ═══
  //
  // Qué está pidiendo la persona, en estructura. La salida NO es una lista cerrada: es un objeto
  // que después alimenta decisiones. No hay dónde validarla sin creerle al modelo, y ése es
  // exactamente el caso que no se abre.
  interpretar: MODO.SOMBRA,
  // Elegir la partida de la Base Maestra para un elemento leído de un plano. El dominio es INTERNAL
  // y la lista es cerrada —hasta ahí califica—, pero el prompt lleva el TEXTO LITERAL del plano, y
  // un rótulo puede traer el nombre del comitente. El guardián de contenido lo atrapa caso por
  // caso; hasta tener la medición de cuántos pasa y cuántos frena, se mide y no se sirve.
  'elegir-partida': MODO.SOMBRA,
})

/**
 * LA EVIDENCIA QUE RESPALDA CADA PROMOCIÓN. UNA ENTRADA POR TAREA EN PRODUCCIÓN, SIN EXCEPCIÓN.
 *
 * ═══ POR QUÉ ES UNA TABLA Y NO UN COMENTARIO ═══
 *
 * Un comentario que dice «se midió» no se puede verificar y envejece sin avisar. Esto sí: hay un
 * test que exige que TODA tarea en `MODO.PRODUCCION` tenga acá su corrida, su fecha y su número, y
 * que ninguna que no esté en producción figure. Mover una tarea a producción sin escribir la
 * evidencia pone el test en rojo — que es exactamente lo que tiene que pasar.
 *
 * `contra` es con quién se comparó. Un número sin línea de base no dice nada: 90% puede ser
 * excelente o inaceptable según contra qué.
 */
export const EVIDENCIA_DE_PRODUCCION = Object.freeze({
  'elegir-herramienta': {
    corrida: 'ecsas-llm-eval · catálogo completo de 93 herramientas',
    fecha: '2026-09-05',
    modelo: 'Qwen/Qwen3-4B-Instruct-2507',
    medido: '90% de aciertos · 0 herramientas prohibidas elegidas',
    contra: 'claude-haiku-4-5: 90% · 0 prohibidas — EMPATE, no ventaja',
  },
  'completar-argumentos': {
    corrida: 'ecsas-llm-eval · misma corrida: extraer los argumentos es el segundo tramo del caso',
    fecha: '2026-09-05',
    modelo: 'Qwen/Qwen3-4B-Instruct-2507',
    medido: '90% de aciertos con argumentos incluidos',
    contra: 'claude-haiku-4-5: 90%',
  },
  rutear: {
    corrida: 'ecsas-llm-eval · elección de un ítem de una lista cerrada',
    fecha: '2026-09-05',
    modelo: 'Qwen/Qwen3-4B-Instruct-2507',
    medido: '90% · la salida además se valida contra la lista de slugs vivos',
    contra: 'claude-haiku-4-5: 90%',
  },
})

/**
 * PRESUPUESTO DE LATENCIA DE UN PROVEEDOR QUE NO ES CLAUDE.
 *
 * ═══ POR QUÉ SÓLO HF LO TIENE, Y POR QUÉ NO ALCANZA CON «SI FALLA, ESCALA» ═══
 *
 * Un proveedor que devuelve 500 escala solo: el `catch` ya está. El que NO escala es el que no
 * contesta — el router de HF enruta a un proveedor de cómputo que puede estar frío, y una espera de
 * 40 segundos no es un error, es la operación colgada. Para el usuario eso es peor que un fallo:
 * un fallo se recupera, una espera indefinida no.
 *
 * Claude NO lleva presupuesto acá a propósito: es el último recurso, y cortarlo por tiempo dejaría
 * la operación sin nadie que la atienda. Un techo de latencia sobre el fallback es un techo sobre
 * la disponibilidad.
 *
 * El default sale de la medición: el 4B contesta en ~1,1 s desde esta VM. 8 s es siete veces eso —
 * holgado para una cola razonable, corto para una que se colgó.
 */
export function presupuestoMs(env = process.env) {
  const n = Number(env.ORQ_HF_MS_MAX)
  return Number.isFinite(n) && n > 0 ? n : 8000
}

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

/**
 * EL PLAN, DESPUÉS DE MIRAR EL CONTENIDO. Pura, y separada de `planDe` por una razón concreta.
 *
 * ═══ LA ETIQUETA Y EL CONTENIDO SON DOS CONTROLES DISTINTOS ═══
 *
 * `politica.mjs` clasifica por DOMINIO: una etiqueta que pone quien llama. `intenciones` es
 * INTERNAL y está bien que lo sea —una pregunta no es una cobranza—, pero la pregunta la escribe
 * una persona, y una persona puede escribir «pagale $1.250.000 a GONZALEZ, MARIO, CUIT
 * 20-12345678-9». La etiqueta sigue siendo correcta y el contenido ya no lo es.
 *
 * Hasta hoy este control corría SÓLO en la sombra, que es donde no importaba: lo que se descartaba
 * era una medición. Cuando HF pasa a atender de verdad, el control tiene que correr en el camino
 * que sirve — si no, abrir la puerta significa mandar afuera lo que el guardián existía para frenar.
 *
 * Un caso frenado NO se pierde: se lo queda Claude, que es quien puede verlo. Baja la autonomía y
 * está bien que la baje. La alternativa —dejarlo pasar— sube el número mintiendo.
 */
export function planSegunContenido(plan, hallazgos = []) {
  if (!hallazgos.length) return plan
  const limpia = plan.cadena.filter((p) => p.proveedor?.nombre !== 'huggingface')
  if (!limpia.length) return plan
  const porQue = `el contenido ${hallazgos.join(' y ')}: lo atiende Claude`
  // El primero de la cadena es SIEMPRE `principal`. Si se saca a HF y el que queda conserva el rol
  // `escalamiento`, la fila de costo diría que Claude escaló algo que nunca se intentó.
  const cadena = limpia.map((p, i) => (i === 0 ? { ...p, rol: 'principal' } : p))
  return { ...plan, cadena, sombra: null, porQue, frenadoPorContenido: hallazgos }
}

/**
 * UNA SEÑAL QUE SE CORTA SOLA. Combina la del caller con el presupuesto de latencia.
 *
 * `cancelar()` se llama SIEMPRE en el `finally`: un timer vivo por llamada mantiene el proceso
 * despierto y, peor, aborta una señal que ya nadie mira.
 */
function conPlazo(señal, msMax) {
  if (!msMax) return { señal, cancelar() {}, vencio: () => false }
  const ac = new AbortController()
  let vencido = false
  const t = setTimeout(() => { vencido = true; ac.abort() }, msMax)
  t.unref?.()
  const propagar = () => ac.abort()
  if (señal) {
    if (señal.aborted) ac.abort()
    else señal.addEventListener?.('abort', propagar, { once: true })
  }
  return {
    señal: ac.signal,
    cancelar() { clearTimeout(t); señal?.removeEventListener?.('abort', propagar) },
    vencio: () => vencido,
  }
}

/** Una llamada a un proveedor, medida y registrada. No lanza: devuelve el resultado o el error. */
async function intentar(proveedor, opciones, meta, { msMax = 0 } = {}) {
  const t0 = Date.now()
  const plazo = conPlazo(opciones.señal, msMax)
  try {
    const r = await proveedor.completar({ ...opciones, señal: plazo.señal })
    const ms = Date.now() - t0
    await registrarUso({
      modelo: r.modeloUsado, usd: r.costoUsd ?? null, agente: meta.agente, funcion: meta.funcion,
      proveedor: proveedor.nombre, capacidad: meta.capacidad,
      tokensIn: r.tokens?.in ?? null, tokensOut: r.tokens?.out ?? null, ms, ok: true,
      fallbackDe: meta.fallbackDe ?? null,
    })
    return { ok: true, r, ms, proveedor: proveedor.nombre }
  } catch (crudo) {
    // UN PRESUPUESTO AGOTADO NO ES «EL PROVEEDOR FALLÓ», y confundirlos arruina el diagnóstico: un
    // AbortError se clasifica como cancelación del usuario y el fusible lo trataría como tal.
    const err = plazo.vencio()
      ? Object.assign(new Error(`${proveedor.nombre}: no contestó en ${msMax} ms — escala`),
        { clasificacion: { kind: 'plazo_agotado', hard: false, reintentable: true } })
      : crudo
    const c = err.clasificacion ?? clasificarError(err)
    const ms = Date.now() - t0
    // ═══ QUE HF SE QUEDE SIN CUOTA NO APAGA EL RAZONADOR DEL OS ═══
    //
    // `avisarEstado` marca «sin crédito» y con eso XSAS degrada entero y deja de intentar. Ese
    // estado es sobre CLAUDE: es el proveedor sin el cual el OS no razona. Un 402 de Hugging Face
    // significa exactamente lo contrario —que HF no atiende y que Claude tiene que atender—, y
    // pasarlo por la misma función haría que el OS se declare caído justo cuando su fallback está
    // sano. El bug es de una línea y el síntoma sería «el OS dejó de contestar» sin causa visible.
    if (proveedor.nombre === 'anthropic') await avisarEstado(c)
    await registrarUso({
      modelo: proveedor.idDeModelo(meta.alias), usd: null, agente: meta.agente, funcion: meta.funcion,
      proveedor: proveedor.nombre, capacidad: meta.capacidad,
      tokensIn: null, tokensOut: null, ms, ok: false, errorKind: c.kind,
      fallbackDe: meta.fallbackDe ?? null,
    })
    return { ok: false, err, ms, proveedor: proveedor.nombre, kind: c.kind }
  } finally {
    plazo.cancelar()
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
  // EL GUARDIÁN DE CONTENIDO CORRE UNA VEZ Y GOBIERNA LAS DOS RAMAS. Antes corría sólo para la
  // sombra, que es la rama donde no importaba.
  const hallazgos = hallazgosEnTexto(JSON.stringify({ sistema, mensajes }))
  const plan = planSegunContenido(
    planDe({ tarea, dominio, permitidoExplicitamente, hfDisponible: huggingface.configurado() }),
    hallazgos,
  )
  const msMax = presupuestoMs()
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
  const sombraOmitida = hallazgos.length ? hallazgos : null
  if (plan.sombra) {
    sombra = intentar(plan.sombra, { ...comunes, modelo: plan.sombra.idDeModelo(alias) },
      { agente, funcion: `${funcion ?? tarea}:sombra`, capacidad, alias }, { msMax })
      .catch(() => null)
  }

  let ultimo = null
  let fallbackDe = null
  for (const { proveedor, rol } of plan.cadena) {
    if (proveedor === anthropic && !proveedor.configurado(apiKey)) {
      ultimo ??= new Error('anthropic: sin credencial')
      continue
    }
    // El presupuesto de latencia es del que NO es el último recurso. Ver `presupuestoMs`.
    const res = await intentar(proveedor, {
      ...comunes, modelo: proveedor.idDeModelo(alias), apiKey,
    }, { agente, funcion: funcion ?? tarea, capacidad, alias, fallbackDe },
    { msMax: proveedor === anthropic ? 0 : msMax })

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

/**
 * EL TEXTO, O NULL. La forma que necesitan los caminos que YA tenían un plan B.
 *
 * ═══ POR QUÉ NO SE PROPAGA EL ERROR ═══
 *
 * El ruteo del Director y el completado de argumentos comparten una propiedad: si el modelo no
 * contesta, el OS sigue —el Director muestra el catálogo, el gateway pide el dato que falta—. Ahí
 * una excepción no es información: es una rama que hay que escribir en los dos lados y que alguien
 * va a olvidar. Se devuelve `texto: null` y QUIÉN contestó, que es lo que el Autonomy Rate necesita
 * para distinguir «lo resolvió el OS solo» de «no lo resolvió nadie».
 */
export async function textoONull(opciones = {}) {
  try {
    const r = await llmRun(opciones)
    return {
      texto: r.texto ?? null, proveedor: r.proveedor, modelo: r.modelo,
      autonomo: Boolean(r.autonomo), escalado: Boolean(r.escalado), motivo: r.motivo, ms: r.ms,
    }
  } catch (e) {
    return {
      texto: null, proveedor: null, modelo: null, autonomo: false, escalado: false,
      motivo: String(e?.message ?? e).slice(0, 160), ms: null,
    }
  }
}
