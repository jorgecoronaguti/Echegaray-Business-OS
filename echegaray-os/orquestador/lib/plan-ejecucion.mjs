// FINANCIAL EXECUTION ORCHESTRATOR — convierte el Plan de Tesorería en trabajo ejecutable del OS.
//
// ═══ QUÉ ES, Y QUÉ NO ES (24/07) ═══
//
// El Plan de Tesorería (finanzas.plan_tesoreria) YA decide y calcula: qué cobrar, pagar, postergar,
// negociar, con qué línea, cuándo. Este componente NO vuelve a decidir, NO recalcula, NO genera otro
// plan. Toma el plan existente y lo transforma en TAREAS coordinadas para los especialistas que ya
// existen (Comercial IA, Compras IA, Administración IA, CFO IA…), dentro del Work Fabric que ya existe.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO: REUTILIZAR, NO DUPLICAR ═══
//
//   entrada         → planTesoreria()          (plan-tesoreria.mjs — se consume, no se reconstruye)
//   creación tarea  → orq.enqueue_task(jsonb)   (idempotente por dedupe_key; ledger.enqueueTask)
//   dependencias    → orq.task_deps             (claim_task NO toma una tarea si un dep no está 'succeeded')
//   aprobación E    → orq.pending_operations    (el tool-executor gatea el paso externo; no se rehace)
//   especialistas   → orq.agents (comercial/compras/administracion/cfo/fiscal)
//   trazabilidad    → subject_type/subject_id + correlation_id + inputs.accion
//
// No hay motor paralelo, no hay orquestación nueva, no hay lógica financiera nueva. Sólo el puente
// determinista plan → trabajo. El paso externo con plata (finance.payment, Nivel E/F) NUNCA lo ejecuta
// este componente: crea la tarea de PREPARACIÓN (clr C, interna) y el paso externo queda en la cola de
// aprobación humana, exactamente como el resto del OS.

import { randomUUID } from 'node:crypto'

/** El origen de todas las tareas del plan: permite reconstruir y reconciliar (replanificación). */
export const SUBJECT_TYPE = 'finanzas.plan_tesoreria'

/**
 * A qué especialista va cada tipo de acción, con qué capacidad de PREPARACIÓN corre la tarea (clr C,
 * interna) y qué capacidad EXTERNA (Nivel E/F) queda para aprobación humana. La preparación es segura
 * y automática; la plata siempre pasa por aprobación.
 */
export const MAPEO = {
  cobrar: {
    agent: 'comercial', capability: 'advise.commercial', tipo: 'tesoreria_cobrar',
    objetivo: 'Gestionar la cobranza que el plan de tesorería marcó como ingreso del período.',
    externa: 'external.comms', evidencia: 'comprobante o registro de la cobranza / respuesta del cliente',
  },
  pagar: {
    agent: 'administracion', capability: 'advise.admin', tipo: 'tesoreria_pagar',
    objetivo: 'Preparar el pago (monto, proveedor, medio, imputación) y dejarlo listo para aprobación.',
    externa: 'finance.payment', evidencia: 'orden de pago preparada + aprobación humana antes de ejecutar',
  },
  postergar: {
    agent: 'compras', capability: 'advise.procurement', tipo: 'tesoreria_negociar',
    objetivo: 'Negociar con el proveedor el nuevo plazo que el plan definió para preservar liquidez.',
    externa: 'external.comms', evidencia: 'acuerdo de nuevo plazo por escrito',
  },
  financiar: {
    agent: 'cfo', capability: 'advise.finance', tipo: 'tesoreria_financiar',
    objetivo: 'Preparar el uso de la línea (monto, días, costo) que el plan eligió; dejarlo para aprobación.',
    externa: 'domain.write_economic', evidencia: 'autorización humana del uso de la línea',
  },
  cancelar_financiacion: {
    agent: 'cfo', capability: 'advise.finance', tipo: 'tesoreria_cancelar_linea',
    objetivo: 'Cuando entre la caja de la que depende, preparar la cancelación de la línea para aprobación.',
    externa: 'domain.write_economic', evidencia: 'autorización humana de la cancelación',
  },
}

// La prioridad de la cola (mayor = antes). Sale del tipo de acción, no se recalcula: refleja el
// orden que el plan ya decidió (financiar/pagar vencido primero, negociar al final).
const PRIORIDAD = { financiar: 90, pagar: 80, cobrar: 70, cancelar_financiacion: 60, postergar: 40 }

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

/**
 * NÚCLEO PURO: el identificador ESTABLE de una acción del plan. No usa el `id` del plan (que lleva un
 * contador por corrida y cambia entre replanificaciones): usa el CONTENIDO estable —fecha, tipo y la
 * descripción (que ya incluye proveedor/cliente y monto)—. Dos corridas del mismo plan producen la
 * misma clave → idempotencia: `enqueue_task` deduplica y no crea la tarea dos veces.
 */
export function claveEstable(accion = {}) {
  return `plan-tesoreria:${accion.fecha}:${accion.tipo}:${slug(accion.descripcion)}`
}

/**
 * NÚCLEO PURO: arma el payload de `orq.enqueue_task` para una acción del plan. No decide nada: copia
 * la decisión del plan a la forma que el Work Fabric entiende. La política de aprobación viaja en
 * inputs.aprobacion; la capacidad de la tarea es la de PREPARACIÓN (interna), no la externa.
 *
 * @param {object} accion una acción del plan (fecha, tipo, descripcion, motivo, impacto_pesos, …)
 * @param {object} ctx {planFecha, horizonte, subjectId, correlationId}
 */
export function tareaDeAccion(accion = {}, ctx = {}) {
  const m = MAPEO[accion.tipo]
  if (!m) return null // un tipo sin especialista no se inventa: se ignora y se reporta aparte
  const dedupe = claveEstable(accion)
  return {
    dedupe_key: dedupe,
    subject_type: SUBJECT_TYPE,
    subject_id: ctx.subjectId ?? null,
    type: m.tipo,
    title: accion.descripcion,
    goal: m.objetivo,
    success_criteria: criterio(accion, m),
    capability_slug: m.capability,
    agent_slug: m.agent,
    priority: PRIORIDAD[accion.tipo] ?? 0,
    deadline: accion.fecha ? `${accion.fecha}T23:59:59-03:00` : null,
    inputs: {
      origen: 'finanzas.plan_tesoreria',
      plan_fecha: ctx.planFecha ?? null,
      horizonte: ctx.horizonte ?? null,
      accion, // la acción ORIGEN completa: motivo, impacto, costo financiero, efecto liquidez, riesgos
      aprobacion: {
        // El plan marca todo con requiere_aprobacion; el paso externo con plata es Nivel E/F y su
        // capacidad se declara acá. La tarea PREPARA; ejecutar el paso externo pasa por pending_operations.
        requiere_aprobacion: accion.requiere_aprobacion !== false,
        nivel: 'E',
        capability_externa: m.externa,
        nota: 'NUNCA ejecutar el paso externo automáticamente: prepararlo y enviarlo a aprobación humana.',
      },
      evidencia_requerida: m.evidencia,
    },
    _depsPlan: accion.dependencias || [], // ids del plan; se traducen a task_deps al enqueue
    _claveEstable: dedupe,
    _idPlan: accion.id,
  }
}

function criterio(accion, m) {
  const base = {
    cobrar: 'Gestionar la cobranza y registrar el resultado. No dar por cobrado sin confirmación real.',
    pagar: 'Dejar el pago preparado y ENVIADO A APROBACIÓN (finance.payment, Nivel E). No ejecutar el pago.',
    postergar: 'Cerrar un nuevo plazo con el proveedor y registrarlo. No faltar sin avisar.',
    financiar: 'Dejar el uso de la línea preparado y ENVIADO A APROBACIÓN (Nivel E). No tomar deuda solo.',
    cancelar_financiacion: 'Con la dependencia cumplida, preparar la cancelación y enviarla a aprobación.',
  }[accion.tipo]
  return `${base} Evidencia: ${m.evidencia}.`
}

/**
 * NÚCLEO PURO: construye TODAS las tareas de un horizonte del plan, con sus dependencias ya traducidas
 * a claves estables. No escribe nada — devuelve lo que el ensamblador va a enquear.
 *
 * @param {object} plan el resultado de planTesoreria()
 * @param {object} opts {horizonte='dias_7', subjectId, correlationId}
 * @returns {{tareas:Array, ignoradas:Array, planFecha:string, horizonte:string}}
 */
export function construirTareas(plan = {}, opts = {}) {
  const horizonte = opts.horizonte || 'dias_7'
  const h = plan?.horizontes?.[horizonte]
  const acciones = h?.acciones || []
  const ctx = { planFecha: plan.fecha, horizonte, subjectId: opts.subjectId ?? null }
  // Mapa id-del-plan → clave estable, para traducir las dependencias entre acciones.
  const idAClave = new Map()
  for (const a of acciones) if (a.id) idAClave.set(a.id, claveEstable(a))
  const tareas = []
  const ignoradas = []
  for (const a of acciones) {
    const t = tareaDeAccion(a, ctx)
    if (!t) { ignoradas.push({ tipo: a.tipo, descripcion: a.descripcion }); continue }
    t._depsClaves = (t._depsPlan).map((id) => idAClave.get(id)).filter(Boolean)
    tareas.push(t)
  }
  return { tareas, ignoradas, planFecha: plan.fecha, horizonte }
}

/**
 * ENSAMBLADOR: sincroniza el Plan de Tesorería con el Work Fabric. Idempotente y reconciliador —
 * puede correr cada vez que cambia el plan (cobro/pago realizado, cambio de saldo/crédito/obligaciones/
 * calendario): reconstruye SÓLO lo pendiente, no duplica lo ya creado ni lo ya ejecutado.
 *
 * Pasos: (1) consumir el plan; (2) construir tareas del horizonte; (3) en UNA transacción, enquear
 * cada tarea (dedupe), compartir un correlation_id, insertar las dependencias; (4) cancelar las tareas
 * del plan anterior que ya no están en el plan nuevo y todavía no arrancaron; (5) reportar.
 *
 * @param {object} deps {query, withTx, google, planTesoreria}
 * @param {object} opts {horizonte, dry, liquidezMinima, hoy}
 */
export async function sincronizarEjecucion(deps = {}, opts = {}) {
  const withTx = deps.withTx || (await import('./db.mjs')).withTx
  const planTes = deps.planTesoreria || (await import('./plan-tesoreria.mjs')).planTesoreria

  const plan = await planTes({ google: deps.google }, opts)
  if (plan?.estado !== 'ok') return { estado: 'sin dato', motivo: plan?.motivo || 'el plan no está disponible', creadas: 0 }

  const { tareas, ignoradas, planFecha, horizonte } = construirTareas(plan, opts)
  const clavesVivas = new Set(tareas.map((t) => t.dedupe_key))

  if (opts.dry) {
    return { estado: 'dry', planFecha, horizonte, total: tareas.length, ignoradas,
      por_especialista: contarPorAgente(tareas), tareas: tareas.map(resumenTarea) }
  }

  const correlationId = randomUUID()
  const resultado = await withTx(async (client) => {
    const claveAId = {}
    let deps2 = 0
    for (const t of tareas) {
      const payload = { ...t }; delete payload._depsPlan; delete payload._depsClaves; delete payload._claveEstable; delete payload._idPlan
      const { rows } = await client.query('select orq.enqueue_task($1::jsonb) as id', [JSON.stringify(payload)])
      claveAId[t.dedupe_key] = rows[0].id
      // Un solo correlation_id para todo el plan: reconstruir la secuencia entera es una query.
      await client.query('update orq.tasks set correlation_id=$1 where id=$2', [correlationId, rows[0].id])
    }
    for (const t of tareas) {
      for (const depClave of t._depsClaves) {
        const depId = claveAId[depClave]
        if (!depId) continue // el dep quedó fuera del horizonte: la dependencia se respeta igual porque el plan la ordenó
        await client.query('insert into orq.task_deps (task_id, depends_on_task_id) values ($1,$2) on conflict do nothing',
          [claveAId[t.dedupe_key], depId])
        deps2++
      }
    }
    // RECONCILIAR: las tareas del plan anterior que ya no están y todavía no arrancaron se cancelan.
    // No se tocan las que ya se ejecutan o terminaron (nunca duplicar/deshacer trabajo hecho).
    const { rows: canc } = await client.query(
      `update orq.tasks set state='cancelled', updated_at=now()
        where subject_type=$1 and state in ('received','ready','retrying','paused','awaiting_approval')
          and not (dedupe_key = any($2::text[]))
        returning id`,
      [SUBJECT_TYPE, [...clavesVivas]])
    return { creadas: Object.keys(claveAId).length, dependencias: deps2, canceladas: canc.length, correlationId }
  })

  return { estado: 'ok', planFecha, horizonte, ...resultado, ignoradas, por_especialista: contarPorAgente(tareas) }
}

function contarPorAgente(tareas) {
  const c = {}
  for (const t of tareas) c[t.agent_slug] = (c[t.agent_slug] || 0) + 1
  return c
}

function resumenTarea(t) {
  return { dedupe_key: t.dedupe_key, agente: t.agent_slug, capability: t.capability_slug,
    title: t.title, prioridad: t.priority, deadline: t.deadline, deps: t._depsClaves, aprobacion: t.inputs.aprobacion.nivel }
}
