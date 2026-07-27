// CFO PROACTIVO (F9) — el OS emite SOLO, cada ciclo, una lista priorizada de ACCIONES + BORRADORES.
//
// ═══ QUÉ ES, Y QUÉ NO ES ═══
//
// El motor de Ingeniería Financiera + el Plan de Tesorería YA deciden qué conviene: qué cobrar, qué
// pagar, qué postergar, qué financiar, con qué línea, cuándo. F2/F3 agregaron aprendizaje (precisión del
// forecast, fechas de cobro realistas por cliente). Lo que faltaba NO es otra decisión financiera: es un
// CFO que no espera que se lo pidan — mira la situación ya calculada y PROPONE trabajo concreto: reclamá
// esta cobranza (con el borrador escrito), priorizá este pago, capturá este descuento por pronto pago,
// alertá este vencimiento. Convierte el plan en una AGENDA priorizada para el Centro de Acción.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO: CONSUME, NO RECALCULA ═══
//
//   qué hacer / cuándo / cuánto   → planTesoreria()      (plan-tesoreria.mjs — se consume, no se recalcula)
//   a qué especialista / capacidad externa → MAPEO       (plan-ejecucion.mjs — se reusa, no se duplica)
//   la clave estable idempotente  → claveEstable()        (plan-ejecucion.mjs)
//   la precisión del forecast     → precisionForecast()   (aprendizaje-forecast.mjs — contexto, F2)
//   las fechas de cobro realistas → ya vienen EN el plan  (aprendizaje-cobranzas.mjs, F3, vía calendario)
//
// Ni un peso se recalcula acá. El monto, el costo financiero y el efecto sobre la liquidez de cada acción
// son EXACTAMENTE los que el plan ya calculó (impacto_pesos, costo_financiero, efecto_liquidez). La
// justificación económica y la prioridad son una LECTURA de esos números, no un cálculo nuevo. Si un
// número no coincide con su fuente, es un bug.
//
// ═══ GOBERNANZA — LA REGLA DURA: EL CFO PREPARA, NO EJECUTA ═══
//
// Emitir la propuesta y el borrador al Centro de Acción es Nivel D: interno, reversible, no mueve nada.
// Toda acción que MUEVE PLATA o tiene EFECTO EXTERNO (pagar, financiar, cancelar línea, reclamar/gestionar
// una cobranza, negociar un plazo) es Nivel E → aprobación humana explícita, exactamente por el mecanismo
// que ya existe (orq.pending_operations + inputs.aprobacion de la tarea de preparación). El CFO NUNCA
// paga, firma, ni manda un mensaje solo: deja la propuesta y el borrador listos, y el paso externo espera
// aprobación. Una acción puramente informativa (alertar un vencimiento) es Nivel D y no requiere aprobación.

import { fmt } from './ingenieria-financiera.mjs'
import { claveEstable, MAPEO } from './plan-ejecucion.mjs'

// ════════════════════════════════════════════════════════════════════════════
// Clasificación del trabajo que el CFO propone, derivada del tipo de acción del plan
// ════════════════════════════════════════════════════════════════════════════

// Para cada tipo de acción del plan: qué trabajo concreto propone el CFO, y qué EFECTO tiene el paso de
// EJECUCIÓN (no la propuesta). 'plata' = mueve dinero; 'comunicacion' = mensaje externo a un tercero;
// null = puramente interno/informativo. El efecto define la gobernanza: con efecto ⇒ Nivel E.
const TRABAJO = {
  cobrar: { tipo_cfo: 'reclamar_cobranza', efecto: 'comunicacion', borrador: true, verbo: 'Cobrar' },
  pagar: { tipo_cfo: 'priorizar_pago', efecto: 'plata', borrador: false, verbo: 'Pagar' },
  financiar: { tipo_cfo: 'usar_linea_credito', efecto: 'plata', borrador: false, verbo: 'Usar' },
  cancelar_financiacion: { tipo_cfo: 'cancelar_linea', efecto: 'plata', borrador: false, verbo: 'Cancelar' },
  postergar: { tipo_cfo: 'negociar_plazo', efecto: 'comunicacion', borrador: true, verbo: 'Postergar' },
  negociar_plazo: { tipo_cfo: 'negociar_plazo', efecto: 'comunicacion', borrador: true, verbo: 'Negociar' },
}

// Un empujón de prioridad por tipo de trabajo: proteger caja que ya debería estar (cobranza) y cortar el
// interés que corre (cancelar línea / financiar) pesan más que un pago corriente. Es un desempate, no un
// recálculo de plata: sólo ordena.
const BOOST = {
  reclamar_cobranza: 5, usar_linea_credito: 4, cancelar_linea: 4,
  priorizar_pago: 3, capturar_pronto_pago: 4, negociar_plazo: 1, alertar_vencimiento: 2,
}

const abs = (n) => Math.abs(Number(n) || 0)
// Escala logarítmica del monto: ordena por magnitud sin dejar que un número domine el score. NO es plata
// nueva — es una transformación monótona del impacto_pesos que el plan ya calculó, sólo para ordenar.
const escalaMonto = (n) => Math.log10(1 + abs(n))

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — extraer la contraparte, justificar, redactar, gobernar, priorizar
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: la contraparte (cliente/proveedor) de una acción. La descripción canónica del plan es
 * "Cobrar MESSINA $4.300.876" / "Pagar Gruas San Blas $5.351.225": se saca el verbo inicial y el monto
 * final. No inventa: si no se puede identificar, devuelve null (y el borrador lo dice honestamente).
 */
export function contraparteDe(accion = {}) {
  const d = String(accion.descripcion || '').trim()
  if (!d) return null
  // Quita el primer verbo (Cobrar/Pagar/Postergar/Usar/Cancelar/Negociar) y todo lo monetario del final.
  const sinVerbo = d.replace(/^\s*\p{Lu}[\p{L}]*\s+/u, '')
  const sinMonto = sinVerbo.replace(/\s*\$[\d.,]+.*$/u, '').replace(/\s+por\s*$/i, '').trim()
  return sinMonto || null
}

/** ¿La acción está vencida / atrasada? Sale del motivo que el plan ya escribió (no se recalcula fecha). */
export function esVencida(accion = {}) {
  return /vencid|atras|ya deber/i.test(String(accion.motivo || '') + ' ' + String(accion.riesgos || ''))
}

/**
 * NÚCLEO PURO: la justificación económica EN PESOS de una acción, leída de los números que el plan ya
 * calculó. No recalcula: `monto` es impacto_pesos, `costo` es costo_financiero, `liquidez` es
 * efecto_liquidez. Devuelve un objeto estructurado + un texto listo para mostrar.
 */
export function justificacionEconomica(accion = {}) {
  const t = TRABAJO[accion.tipo]
  const monto = Math.round(Number(accion.impacto_pesos) || 0)
  const costo = Math.round(Number(accion.costo_financiero) || 0)
  const liquidez = Math.round(Number(accion.efecto_liquidez) || 0)
  const partes = []
  switch (t?.tipo_cfo) {
    case 'reclamar_cobranza':
      partes.push(`Entran ${fmt(monto)} de caja${esVencida(accion) ? ' que ya deberían estar (cobranza vencida)' : ''}.`)
      if (liquidez > 0) partes.push(`Suben la liquidez proyectada en ${fmt(liquidez)}.`)
      break
    case 'priorizar_pago':
      partes.push(`Salen ${fmt(monto)}${esVencida(accion) ? ' — ya vencido, el costo de esperar corre' : ' dentro de la caja disponible'}.`)
      break
    case 'usar_linea_credito':
      partes.push(`Cubre ${fmt(monto)} de un pago crítico con la línea; cuesta ${fmt(costo)} de financiación${accion.excede_limite ? ' y EXCEDE el límite del acuerdo' : ''}.`)
      break
    case 'cancelar_linea':
      partes.push(`Repaga ${fmt(monto)} de línea con caja fresca: corta el interés diario que corre sobre ese saldo.`)
      break
    case 'negociar_plazo':
      partes.push(`Difiere ${fmt(monto)} sin perforar la liquidez mínima; preserva caja sin costo financiero.`)
      break
    case 'capturar_pronto_pago': {
      const ahorro = Math.round(Number(accion.ahorro_pronto_pago) || 0)
      partes.push(`Pagar ya captura ${fmt(ahorro)} de descuento por pronto pago sobre ${fmt(monto)}.`)
      break
    }
    default:
      partes.push(`Impacto ${fmt(monto)}.`)
  }
  return { monto, costo_financiero: costo, efecto_liquidez: liquidez, texto: partes.join(' ') }
}

/**
 * NÚCLEO PURO: el BORRADOR de la comunicación externa, cuando aplica. Sólo para acciones de comunicación
 * (reclamar cobranza, negociar plazo): es texto SUGERIDO para que un humano lo apruebe y envíe — el CFO
 * no manda nada. Devuelve null si el tipo de acción no comunica con un tercero.
 */
export function generarBorrador(accion = {}, ctx = {}) {
  const t = TRABAJO[accion.tipo]
  if (!t?.borrador) return null
  const quien = contraparteDe(accion) || 'la contraparte'
  const monto = fmt(Math.round(Number(accion.impacto_pesos) || 0))
  const remite = ctx.empresa || 'Echegaray Construcciones'
  if (t.tipo_cfo === 'reclamar_cobranza') {
    const vencida = esVencida(accion)
    return {
      canal_sugerido: 'email / WhatsApp',
      asunto: vencida ? `Recordatorio de pago pendiente — ${remite}` : `Gestión de cobranza — ${remite}`,
      cuerpo: [
        `Estimados ${quien}:`,
        vencida
          ? `Les escribimos para recordarles el pago pendiente por ${monto}, cuyo vencimiento ya operó. Agradecemos regularizarlo a la brevedad e informarnos la fecha prevista de pago.`
          : `Nos comunicamos para coordinar el cobro por ${monto} previsto para el período. Agradecemos confirmarnos la fecha de pago.`,
        `Quedamos a disposición por cualquier detalle.`,
        `Saludos cordiales,\n${remite}`,
      ].join('\n\n'),
      nota: 'BORRADOR — requiere revisión y aprobación humana antes de enviarse. El CFO no envía comunicaciones solo.',
    }
  }
  // negociar_plazo / postergar
  const fechaNueva = accion.nueva_fecha ? ` hasta el ${accion.nueva_fecha}` : ''
  return {
    canal_sugerido: 'email / teléfono',
    asunto: `Solicitud de nuevo plazo de pago — ${remite}`,
    cuerpo: [
      `Estimados ${quien}:`,
      `Por una cuestión de calendario financiero, solicitamos reprogramar el pago por ${monto}${fechaNueva}. Nuestra intención es cumplir en la nueva fecha acordada, no dejar de pagar.`,
      `Agradecemos su confirmación para dejarlo registrado.`,
      `Saludos cordiales,\n${remite}`,
    ].join('\n\n'),
    nota: 'BORRADOR — requiere revisión y aprobación humana antes de enviarse.',
  }
}

/**
 * NÚCLEO PURO: la gobernanza de una acción. Emitir la propuesta+borrador es SIEMPRE Nivel D (interno,
 * reversible). El paso de EJECUCIÓN con efecto externo (plata/comunicación) es Nivel E: requiere
 * aprobación humana y viaja por orq.pending_operations. Una acción sin efecto externo (alerta) es D pura.
 */
export function gobernanza(accion = {}) {
  const t = TRABAJO[accion.tipo] || (accion.tipo_cfo ? { tipo_cfo: accion.tipo_cfo, efecto: accion.efecto_externo ?? null } : null)
  const emision = { nivel: 'D', reversible: true, nota: 'emitir la propuesta y el borrador es interno y reversible; no mueve nada' }
  const efecto = t?.efecto ?? null
  if (!efecto) return { emision, efecto_externo: null, ejecucion: null }
  const capExterna = MAPEO[accion.tipo]?.externa || (efecto === 'plata' ? 'finance.payment' : 'external.comms')
  return {
    emision,
    efecto_externo: efecto,
    ejecucion: {
      nivel: 'E',
      requiere_aprobacion: true,
      capability_externa: capExterna,
      via: 'orq.pending_operations',
      nota: 'NUNCA ejecutar solo: preparar y enviar a aprobación humana antes de mover plata o comunicar.',
    },
  }
}

/**
 * NÚCLEO PURO: el score de PRIORIDAD (mayor = antes). Se deriva sólo de números que el plan ya calculó
 * (impacto_pesos, costo_financiero) y del motivo (vencida) — no es plata nueva, es un ORDEN. Urgencia
 * (vencida > hoy > futuro) domina; dentro de cada nivel pesan el boost del tipo, la magnitud y el costo
 * financiero que se está frenando/asumiendo.
 */
export function prioridadCfo(accion = {}, hoy = new Date()) {
  const tipoCfo = TRABAJO[accion.tipo]?.tipo_cfo || accion.tipo_cfo || 'alertar_vencimiento'
  const hoyStr = aFechaStr(hoy)
  const fecha = aFechaStr(accion.fecha)
  const urgencia = esVencida(accion) ? 3 : fecha && hoyStr && fecha <= hoyStr ? 2 : 1
  const boost = BOOST[tipoCfo] ?? 0
  const magnitud = escalaMonto(accion.impacto_pesos)
  const costo = escalaMonto(accion.costo_financiero)
  return Math.round((urgencia * 1000 + boost * 100 + magnitud * 10 + costo * 5) * 100) / 100
}

const aFechaStr = (v) => {
  if (v == null) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** La clave idempotente de una acción del CFO: se apoya en la clave estable del plan (fecha+tipo+desc). */
export function claveCfo(accion = {}) {
  return `cfo:${claveEstable(accion)}`
}

/**
 * NÚCLEO PURO: ensambla UNA acción proactiva del CFO a partir de una acción del plan. No decide plata:
 * copia el monto/costo/liquidez del plan y agrega la capa de propuesta (título, justificación, borrador,
 * gobernanza, prioridad, clave idempotente).
 */
export function accionProactiva(accion = {}, ctx = {}) {
  const t = TRABAJO[accion.tipo]
  if (!t) return null // un tipo sin trabajo mapeado no se inventa
  const just = justificacionEconomica(accion)
  const gob = gobernanza(accion)
  return {
    clave: claveCfo(accion),
    tipo_cfo: t.tipo_cfo,
    titulo: accion.descripcion,
    contraparte: contraparteDe(accion),
    fecha: accion.fecha ?? null,
    monto: just.monto,
    justificacion_economica: just.texto,
    detalle_economico: { monto: just.monto, costo_financiero: just.costo_financiero, efecto_liquidez: just.efecto_liquidez },
    borrador: generarBorrador(accion, ctx),
    prioridad: prioridadCfo(accion, ctx.hoy),
    emision: gob.emision,
    efecto_externo: gob.efecto_externo,
    ejecucion: gob.ejecucion,
    requiere_aprobacion: gob.ejecucion != null, // toda acción con efecto externo necesita aprobación humana
    origen: 'finanzas.plan_tesoreria',
    horizonte: ctx.horizonte ?? null,
    accion_plan: accion, // la acción origen completa, para trazabilidad
  }
}

/**
 * NÚCLEO PURO: una ALERTA de vencimiento/riesgo — Nivel D, informativa, sin efecto externo ni aprobación.
 * Se deriva del resumen que el plan ya calculó (excede el límite de la línea, costo financiero del período).
 * No fabrica: sólo emite si el resumen sostiene la alerta.
 */
export function alertasDeResumen(resumen = {}, ctx = {}) {
  const out = []
  if (resumen.excede_limite_linea) {
    out.push({
      clave: `cfo:alerta:excede-linea:${ctx.horizonte ?? 'h'}`,
      tipo_cfo: 'alertar_vencimiento', titulo: 'El plan del período EXCEDE el límite de la línea de crédito',
      contraparte: null, fecha: null, monto: Math.round(Number(resumen.linea_maxima_usada) || 0),
      justificacion_economica: `El plan llega a usar ${fmt(resumen.linea_maxima_usada)} de línea contra un límite de ${fmt(resumen.limite_linea)}: hace falta otra fuente de fondos o reordenar pagos.`,
      detalle_economico: { monto: Math.round(Number(resumen.linea_maxima_usada) || 0), costo_financiero: 0, efecto_liquidez: 0 },
      borrador: null, prioridad: 3000 + BOOST.alertar_vencimiento,
      emision: { nivel: 'D', reversible: true }, efecto_externo: null, ejecucion: null, requiere_aprobacion: false,
      origen: 'finanzas.plan_tesoreria', horizonte: ctx.horizonte ?? null,
    })
  }
  return out
}

/**
 * NÚCLEO PURO: dada la salida COMPLETA de planTesoreria(), produce la lista PRIORIZADA de acciones del CFO
 * a través de todos los horizontes. Los horizontes son acumulados (dias_7 ⊂ dias_30 ⊂ dias_90), así que la
 * misma obligación aparece repetida: se DEDUPLICA por clave estable (idempotencia), conservando la primera
 * aparición (el horizonte más corto = el contexto más urgente). Devuelve además el borrador donde aplica.
 *
 * @param {object} plan  el resultado de planTesoreria() (estado 'ok')
 * @param {object} [ctx] {hoy, empresa, horizontes: string[] a recorrer, precision (F2, opcional)}
 * @returns {{estado, acciones, resumen, por_tipo, con_borrador, fuentes}}
 */
export function generarAccionesProactivas(plan = {}, ctx = {}) {
  if (plan?.estado !== 'ok') {
    return { estado: plan?.estado || 'sin dato', motivo: plan?.motivo || 'el plan no está disponible', acciones: [] }
  }
  const horizontes = ctx.horizontes || Object.keys(plan.horizontes || {})
  const vistas = new Map() // clave → acción (la primera gana: horizonte más corto/urgente)
  for (const h of horizontes) {
    const bloque = plan.horizontes?.[h]
    if (!bloque) continue
    for (const a of bloque.acciones || []) {
      const pa = accionProactiva(a, { ...ctx, horizonte: h })
      if (!pa) continue
      if (!vistas.has(pa.clave)) vistas.set(pa.clave, pa)
    }
    // Alertas del resumen del horizonte (Nivel D). Se deduplican por su clave igual que el resto.
    for (const al of alertasDeResumen(bloque.resumen, { ...ctx, horizonte: h })) {
      if (!vistas.has(al.clave)) vistas.set(al.clave, al)
    }
  }
  const acciones = [...vistas.values()].sort((a, b) => b.prioridad - a.prioridad || String(a.clave).localeCompare(b.clave))
  // Contexto de aprendizaje (F2): la precisión del forecast se ANEXA como advertencia, no cambia plata.
  const notaPrecision = ctx.precision ? notaDePrecision(ctx.precision) : null
  const por_tipo = {}
  for (const a of acciones) por_tipo[a.tipo_cfo] = (por_tipo[a.tipo_cfo] || 0) + 1
  return {
    estado: 'ok',
    fecha_plan: plan.fecha ?? null,
    acciones,
    total: acciones.length,
    con_borrador: acciones.filter((a) => a.borrador).length,
    requieren_aprobacion: acciones.filter((a) => a.requiere_aprobacion).length,
    solo_informativas: acciones.filter((a) => !a.requiere_aprobacion).length,
    por_tipo,
    nota_precision_forecast: notaPrecision,
    fuentes: 'planTesoreria (montos/costos/liquidez, sin recálculo) · MAPEO plan-ejecucion (capacidad externa) · aprendizaje-forecast F2 (precisión) · aprendizaje-cobranzas F3 (fechas de cobro, ya dentro del plan)',
  }
}

// Anexa —sin tocar plata— una advertencia si el forecast de caja viene sesgado (F2). Consume el cuadro de
// precisión ya calculado por aprendizaje-forecast; no lo recalcula.
function notaDePrecision(precision) {
  const sesgada = (precision.por_metrica_horizonte || []).find((g) => g.sesgo?.sistematico)
  if (!sesgada) return null
  return `Atención: el forecast de ${sesgada.metrica}${sesgada.horizonte ? ` a ${sesgada.horizonte}` : ''} viene ${sesgada.sesgo.direccion} sistemáticamente (MAPE ${sesgada.mape ?? 's/d'} sobre ${sesgada.n_medido} mediciones). Tratar los montos proyectados con ese margen.`
}

// ════════════════════════════════════════════════════════════════════════════
// BORDE CON I/O — armar el estado, y (con autorización) delegar la creación de tareas a plan-ejecucion
// ════════════════════════════════════════════════════════════════════════════

/**
 * BORDE: el ciclo proactivo del CFO. Consume el plan de tesorería y la precisión del forecast, y devuelve
 * la lista priorizada de acciones + borradores para el Centro de Acción. Es Nivel D: por defecto NO crea
 * ninguna tarea operativa ni mueve nada — sólo PROPONE (reversible).
 *
 * Si se pasa `opts.autorizadoPor` (una autoridad válida: dueño / Director IA / CFO IA / interfaz), además
 * delega en plan-ejecucion.sincronizarEjecucion la creación de las tareas de PREPARACIÓN (Nivel D, con el
 * borrador y la justificación adjuntos en inputs), reusando enqueue_task / task_deps / pending_operations.
 * El paso externo con plata SIEMPRE queda gateado por pending_operations: este borde NUNCA lo ejecuta.
 *
 * @param {object} deps {query?, withTx?, google?, planTesoreria?, precisionForecast?, sincronizarEjecucion?}
 * @param {object} [opts] {horizonte, horizontes, hoy, empresa, autorizadoPor}
 */
export async function cicloCfoProactivo(deps = {}, opts = {}) {
  const planTes = deps.planTesoreria || (await import('./plan-tesoreria.mjs')).planTesoreria
  const plan = opts.planPreCalculado || await planTes({ google: deps.google }, opts)
  if (plan?.estado !== 'ok') {
    return { estado: 'sin dato', motivo: plan?.motivo || 'el plan no está disponible', acciones: [] }
  }

  // F2 (opcional): si hay acceso a la base/Sheet, anexar la precisión del forecast como contexto. Nunca
  // bloquea: si no está disponible, el ciclo sigue con los montos del plan tal cual.
  let precision = null
  try {
    if (deps.query || deps.google) {
      const precisionForecast = deps.precisionForecast || (await import('./aprendizaje-forecast.mjs')).precisionForecast
      precision = await precisionForecast({ query: deps.query, google: deps.google }, { hoy: opts.hoy })
    }
  } catch { /* la precisión es contexto, no requisito: sin ella el ciclo igual propone */ }

  const propuesta = generarAccionesProactivas(plan, { hoy: opts.hoy, empresa: opts.empresa, horizontes: opts.horizontes, precision })

  // Sin autorización: Nivel D puro — se devuelve la lista priorizada + borradores. Nada se crea ni se mueve.
  if (!opts.autorizadoPor) {
    return { ...propuesta, ejecucion: { creada: false, nota: 'Nivel D: propuesta y borradores emitidos. Crear tareas operativas requiere autorización (dueño / Director IA / CFO IA / interfaz).' } }
  }

  // Con autorización: se delega la creación de tareas de PREPARACIÓN a plan-ejecucion (reuso total de la
  // maquinaria: enqueue_task idempotente, task_deps, pending_operations). Se enriquece el plan con el
  // borrador/justificación/tipo_cfo para que viajen en inputs de la tarea. El paso externo sigue gateado.
  const sinc = deps.sincronizarEjecucion || (await import('./plan-ejecucion.mjs')).sincronizarEjecucion
  const planEnriquecido = enriquecerPlan(plan, propuesta)
  const ejec = await sinc(deps, { ...opts, planPreCalculado: planEnriquecido })
  return { ...propuesta, ejecucion: ejec }
}

/**
 * NÚCLEO PURO (auxiliar del borde): adjunta a cada acción del plan su borrador, justificación económica y
 * tipo_cfo, para que plan-ejecucion los lleve a inputs de la tarea. No toca ningún monto — sólo anexa la
 * capa de propuesta que el núcleo ya produjo, indexada por la clave estable del plan.
 */
export function enriquecerPlan(plan = {}, propuesta = {}) {
  const porClave = new Map((propuesta.acciones || []).map((a) => [a.clave, a]))
  const horizontes = {}
  for (const [h, bloque] of Object.entries(plan.horizontes || {})) {
    horizontes[h] = {
      ...bloque,
      acciones: (bloque.acciones || []).map((a) => {
        const pa = porClave.get(claveCfo(a))
        if (!pa) return a
        return { ...a, borrador: pa.borrador, justificacion_economica: pa.justificacion_economica, tipo_cfo: pa.tipo_cfo, prioridad_cfo: pa.prioridad }
      }),
    }
  }
  return { ...plan, horizontes }
}
