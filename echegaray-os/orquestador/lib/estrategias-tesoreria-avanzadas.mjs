// POSTURAS AVANZADAS + SENSIBILIDAD — el CFO explora TODO el espacio de decisiones, no dos palancas.
//
// El diseñador base (estrategias-tesoreria.mjs) contrastaba tres posturas que sólo variaban financiar-o-
// postergar y el piso de liquidez. Este módulo agrega las posturas que un tesorero de verdad también
// pone sobre la mesa —cada una MODELADA con una palanca real de construirPlan, no descrita en prosa—:
//
//   • proteger_obra    — reordenar los pagos para cubrir primero la obra de mayor exposición
//   • descuento_cheque — cubrir el bache adelantando un cheque en cartera en vez de girar la línea
//   • division_pago    — pagar parte de lo no crítico y negociar el resto, en vez de postergar todo
//   • negociar_plazo   — correr un egreso a una fecha con caja, como acuerdo explícito
//
// Y la capa de SENSIBILIDAD de cobros: un what-if que NO compite en el ranking (el OS no puede forzar a un
// cliente a pagar antes), sino que informa cuánto costo/liquidez se ganaría gestionando esa cobranza.
//
// REGLA CLAVE: una postura sólo se PROPONE cuando la data la hace una opción real. Si no hay dos obras en
// disputa, ni tasa de descuento de cheque, ni un pago divisible, ni un cobro posterior al que mover un
// egreso, la postura NO se genera — no se fabrica una alternativa para llenar el menú. Todas las métricas
// salen del `resumen` de construirPlan; ni un peso se inventa acá.

import { construirPlan, esCritico } from './plan-tesoreria.mjs'
import { fmt } from './ingenieria-financiera.mjs'

const round = (n) => Math.round(Number(n) || 0)
const parseYMD = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null }
const diffDias = (a, b) => { const da = parseYMD(a), db = parseYMD(b); return da && db ? Math.round((db.getTime() - da.getTime()) / 86400000) : 0 }

// ════════════════════════════════════════════════════════════════════════════
// CATÁLOGO CONDICIONAL — sólo las posturas que la data del horizonte hace reales
// ════════════════════════════════════════════════════════════════════════════

/** Devuelve las posturas avanzadas APLICABLES a este contexto (0..4). El diseñador las suma a las base. */
export function posturasCondicionales(ctx = {}) {
  const out = []
  const base = construirPlan({ ...ctx, politica: {} })
  const usaLinea = base.resumen.linea_maxima_usada > 0

  const obra = obraDeMayorExposicion(ctx.dias)
  if (obra) out.push(posturaProtegerObra(obra))
  if (ctx.paramsFin?.tasaDescuentoChequeTNA != null && usaLinea) out.push(posturaDescuentoCheque())
  if (aplicaDivision(ctx)) out.push(posturaDividir())
  const nego = candidatoNegociacion(ctx, base)
  if (nego) out.push(posturaNegociar(nego))
  return out
}

/** La obra con mayor exposición de egresos del horizonte, sólo si hay ≥2 obras en disputa por la caja. */
function obraDeMayorExposicion(dias = []) {
  const exp = new Map()
  for (const d of dias) for (const m of d.movimientos || []) {
    if (m.tipo === 'egreso' && m.obra) exp.set(m.obra, (exp.get(m.obra) || 0) + Math.abs(Number(m.monto) || 0))
  }
  if (exp.size < 2) return null
  return [...exp.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** La división aplica sólo si, activándola, aparece un pago PARCIAL que el plan base no tenía. */
function aplicaDivision(ctx = {}) {
  const split = construirPlan({ ...ctx, politica: { dividirPagos: true } })
  return split.acciones.some((a) => a.tipo === 'pagar' && /parcial/i.test(a.descripcion))
}

/** El egreso postergado más grande + el primer cobro posterior al que moverlo. null si no hay cómo. */
function candidatoNegociacion(ctx = {}, base) {
  const postergados = base.acciones.filter((a) => a.tipo === 'postergar')
  if (!postergados.length) return null
  const objetivo = postergados.reduce((mx, a) => (a.impacto_pesos > mx.impacto_pesos ? a : mx))
  const dias = ctx.dias || []
  const idx = dias.findIndex((d) => d.fecha === objetivo.fecha)
  const destino = dias.slice(idx + 1).find((d) => (d.movimientos || []).some((m) => m.tipo === 'ingreso' && Number(m.monto) > 0))
  if (idx < 0 || !destino) return null
  const diaObj = dias[idx]
  const mov = (diaObj.movimientos || []).find((m) => m.tipo === 'egreso' && round(m.monto) === objetivo.impacto_pesos && !esCritico(m))
  if (!mov) return null
  return { proveedor: mov.proveedor || mov.detalle, monto: round(mov.monto), fechaNueva: destino.fecha, dias: diffDias(objetivo.fecha, destino.fecha) }
}

// ── Las posturas avanzadas: cada una es una palanca real + su lectura de CFO ────────────────────────────

function posturaProtegerObra(obra) {
  return {
    clave: 'proteger_obra', nombre: `Proteger la obra ${obra}`,
    objetivo: `cubrir con caja los pagos de ${obra} —la de mayor exposición— antes que el resto de las obligaciones`,
    razonamiento: `reordena los pagos para que ${obra} tenga prioridad: si la caja no alcanza para todo, la obra más expuesta no es la que queda financiada o postergada. Protege la continuidad del frente que más plata mueve, a costa de empujar a la línea o al plazo lo de menor exposición.`,
    palancas: { priorizarObra: obra }, cushionModo: 'ninguno',
    beneficios: (m) => [`asegura los pagos de ${obra} con caja propia; el faltante lo carga lo de menor exposición (${fmt(m.costo_financiero)} de costo financiero total)`],
    riesgos: (m) => (m.postergados > 0 || m.financiados > 0 ? [`protege una obra a costa de otra obligación: ${m.postergados} postergado(s) y ${m.financiados} financiado(s) del resto`] : ['sin tensión: la caja alcanza para todos, proteger no cambia el resultado']),
  }
}

function posturaDescuentoCheque() {
  return {
    clave: 'descuento_cheque', nombre: 'Descontar un cheque (proteger la línea)',
    objetivo: 'cubrir el bache de caja adelantando un cheque en cartera, en vez de girar la línea',
    razonamiento: 'convierte un valor a cobrar en caja HOY a un costo de descuento ÚNICO, dejando el margen del descubierto libre para una urgencia y sin arrastrar interés que crece cada día. Cambia un costo diario creciente por uno fijo de una sola vez.',
    palancas: { viaCobertura: 'descuento_cheque' }, cushionModo: 'ninguno',
    beneficios: (m) => [`deja la línea en ${fmt(m.linea_maxima)} (libera el margen del descubierto) con un costo ÚNICO de ${fmt(m.costo_financiero)}, no diario`],
    riesgos: () => ['ASUME disponer de un cheque en cartera por el faltante — verificar la cartera de valores antes de decidir'],
  }
}

function posturaDividir() {
  return {
    clave: 'division_pago', nombre: 'Dividir el pago (parcial + resto)',
    objetivo: 'pagar parte de lo no crítico con la caja disponible y negociar el resto, en vez de postergar el pago entero',
    razonamiento: 'sostiene la relación con el proveedor —algo se paga hoy— y baja el saldo pendiente, sin usar la línea ni costo financiero. Reduce la fricción de un "no pago" total a cambio de un acuerdo por el saldo.',
    palancas: { dividirPagos: true }, cushionModo: 'ninguno',
    beneficios: (m) => [`paga parcial lo que la caja permite y sostiene la relación; ${m.postergados} saldo(s) a negociar, sin costo financiero`],
    riesgos: () => ['hay que acordar con el proveedor el plazo del saldo restante — un pago parcial sin acuerdo puede leerse como incumplimiento'],
  }
}

function posturaNegociar(nego) {
  return {
    clave: 'negociar_plazo', nombre: `Negociar plazo con ${nego.proveedor}`,
    objetivo: `correr ${nego.dias} día(s) el vencimiento de ${nego.proveedor} (${fmt(nego.monto)}) hasta ${nego.fechaNueva}, cuando entra caja`,
    razonamiento: 'mueve el egreso a una fecha cierta y acordada —después de un cobro— en lugar de postergarlo sin plazo. Preserva caja hoy y sostiene la relación con un acuerdo formal, no una demora unilateral.',
    palancas: { negociar: nego }, cushionModo: 'ninguno',
    beneficios: (m) => [`difiere ${fmt(nego.monto)} a ${nego.fechaNueva} sin costo financiero; el egreso se paga con el cobro de esa fecha, no se posterga (postergados: ${m.postergados})`],
    riesgos: () => [`requiere la conformidad de ${nego.proveedor} sobre el nuevo vencimiento`],
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SENSIBILIDAD DE COBROS — un what-if que informa, NO compite en el ranking
// ════════════════════════════════════════════════════════════════════════════

/**
 * ¿Qué pasaría si se adelanta el cobro más grande a hoy? Reporta el delta de costo financiero y de pico de
 * línea, y recomienda gestionar esa cobranza. NO es una estrategia ejecutable: el OS no puede forzar a un
 * cliente a pagar antes — por eso vive fuera del ranking, como recomendación.
 *
 * @param {object} ctx el mismo contexto de construirPlan
 * @param {object} elegidaPostura la postura elegida (para medir el what-if sobre SU plan, no otro)
 * @param {number} pisoElegida el piso de liquidez efectivo de la elegida (incluye colchón defensivo)
 */
export function sensibilidadCobros(ctx = {}, elegidaPostura = { palancas: {} }, pisoElegida = 0) {
  const dias = ctx.dias || []
  const grande = mayorCobroPosterior(dias)
  if (!grande) return { aplica: false, motivo: 'no hay un cobro futuro que adelantar en este horizonte' }

  const politica = elegidaPostura.palancas || {}
  const baseCtx = { ...ctx, liquidezMinima: pisoElegida, politica }
  const actual = construirPlan(baseCtx).resumen
  const adelantado = construirPlan({ ...baseCtx, dias: adelantarCobroAHoy(dias, grande) }).resumen

  const dCosto = actual.costo_financiero_total - adelantado.costo_financiero_total
  const dLinea = actual.linea_maxima_usada - adelantado.linea_maxima_usada
  const anticipo = diffDias(dias[0].fecha, grande.fecha)
  return {
    aplica: true,
    cobro: { cliente: grande.mov.cliente || 'cliente', monto: round(grande.mov.monto), fecha_original: grande.fecha, dias_de_anticipo: anticipo },
    ahorro_costo_financiero: round(dCosto),
    baja_pico_linea: round(dLinea),
    recomendacion: dCosto > 0 || dLinea > 0
      ? `Gestionar/adelantar la cobranza de ${grande.mov.cliente || 'cliente'} (${fmt(round(grande.mov.monto))}) ${anticipo} día(s): ahorraría ${fmt(round(dCosto))} de costo financiero y bajaría el pico de línea en ${fmt(round(dLinea))}. Vale una llamada de Comercial/Administración.`
      : `Adelantar la cobranza de ${grande.mov.cliente || 'cliente'} no cambia el costo del período (la caja ya alcanza en las fechas del plan): no es prioritario gestionarla por tesorería.`,
  }
}

/** El mayor ingreso que NO está ya en el primer día del horizonte (adelantar el de hoy no tendría sentido). */
function mayorCobroPosterior(dias = []) {
  if (dias.length < 2) return null
  let best = null
  for (const d of dias.slice(1)) for (const m of d.movimientos || []) {
    if (m.tipo === 'ingreso' && Number(m.monto) > 0 && (!best || Number(m.monto) > Number(best.mov.monto))) best = { mov: m, fecha: d.fecha }
  }
  return best
}

/** Clona `dias` moviendo ese cobro al primer día (el what-if: "si entrara hoy"). */
function adelantarCobroAHoy(dias, grande) {
  const out = dias.map((d) => ({ ...d, movimientos: [...(d.movimientos || [])] }))
  const src = out.find((d) => d.fecha === grande.fecha)
  const i = (src.movimientos || []).findIndex((m) => m.tipo === 'ingreso' && Number(m.monto) === Number(grande.mov.monto) && m.cliente === grande.mov.cliente)
  if (i >= 0) { const [mov] = src.movimientos.splice(i, 1); out[0].movimientos.push(mov) }
  return out
}
