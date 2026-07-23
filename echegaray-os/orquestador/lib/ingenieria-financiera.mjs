// INGENIERÍA FINANCIERA — el motor de tesorería del Business OS.
//
// ═══ QUÉ ES, Y QUÉ NO ES (23/07) ═══
//
// NO es un reporte, un dashboard ni un módulo financiero más. Es el cerebro que piensa como el CFO y
// tesorero de una corporación: maximizar liquidez, minimizar costo financiero, optimizar el capital
// de trabajo, y transformar información en DECISIONES justificadas económicamente — nunca sólo
// informar.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO: NO DUPLICAR ═══
//
// Cada número de plata (caja, obligaciones, cheques, cobranzas, IVA, límite de descubierto, costo del
// descubierto) YA tiene una fuente única y verificada en este OS. Este motor NO recalcula ninguno: los
// ENSAMBLA en un modelo único y agrega la capa que faltaba —la de DECISIÓN—. Si un día un número de
// acá no coincide con su fuente, es un bug de arquitectura, no una discrepancia a explicar.
//
//   disponible/cobranzas/vencimientos  → cash-briefing.mjs   (dueño del saldo de caja)
//   obligaciones (saldo/vencido)        → obligaciones.mjs    (vista única compartida con la web)
//   costo del descubierto (verificado)  → costo-descubierto.mjs (TNA 55% ×1,12, cargo real reproducido)
//   límite del acuerdo / tarjeta        → banco-santander.mjs (declarado por el banco, no estimado)
//   impuesto al cheque                  → impuesto-cheque.mjs (Ley 25.413, 0,6% cada lado)
//
// ═══ EVIDENCIA CLASIFICADA ═══
//
// El motor nunca muestra más precisión que la evidencia. Un costo del descubierto es un HECHO
// (modelo verificado contra el cargo real). Una tasa de descuento de cheque que nadie cargó es un
// GAP: se declara "falta la tasa", NUNCA se inventa un número para que el cuadro cierre.

import {
  interesDelPeriodo, costoConImpuestos, tasaDiaria, TASAS,
} from './costo-descubierto.mjs'
import { ACUERDO, TARJETA } from './banco-santander.mjs'

export const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL COSTO DEL DINERO — el número con el que se piensa toda decisión
// ════════════════════════════════════════════════════════════════════════════

// La empresa opera EN descubierto: el peso marginal sale del acuerdo N°00007 al 62,78% CFT. Entonces
// el costo de oportunidad de un peso inmovilizado —y el costo de financiar con el descubierto— son el
// MISMO número: lo que cuesta tener (o no bajar) un peso de rojo un día. Es la vara única del motor,
// y sale del modelo ya verificado contra el cargo real del banco (costo-descubierto.mjs), no de un
// supuesto. Incluye IVA + percepción, que es lo que efectivamente sale de la cuenta.
export function costoDelDinero(monto, dias) {
  const interes = interesDelPeriodo(-Math.abs(Number(monto) || 0), dias)
  return costoConImpuestos(interes)
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · INGENIERÍA DE FINANCIAMIENTO — comparar TODAS las alternativas
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: ante una necesidad de `monto` por `dias` días, compara las alternativas de
 * financiamiento y elige la más barata FACTIBLE. Nunca responde sí/no: devuelve cada alternativa con
 * su costo económico y por qué gana la recomendada.
 *
 * Costo económico de cada opción = costo financiero directo + costo de oportunidad − ahorro capturado.
 *
 * Las tasas que el OS todavía no tiene modeladas (descuento de cheque, préstamo puntual) entran por
 * parámetro. Si no se pasan, la alternativa se devuelve con costo `null` y una nota — se EXCLUYE de la
 * recomendación en vez de inventarle un número.
 *
 * @param {object} p
 * @param {number} p.monto necesidad de fondos
 * @param {number} p.dias  por cuántos días
 * @param {number} [p.cajaLibre] caja propia disponible sin entrar al descubierto
 * @param {number} [p.limiteDescubiertoDisp] margen del acuerdo todavía sin usar
 * @param {number} [p.tasaDescuentoChequeTNA] TNA de descuento de cheque del banco (si se conoce)
 * @param {number} [p.tasaPrestamoTNA] TNA de un préstamo puntual (si se conoce)
 * @param {number} [p.descuentoProntoPago] fracción (0..1) que rebaja el proveedor si se paga ya
 * @param {number} [p.multaEspera] costo cierto de esperar (interés/multa por pagar más tarde)
 */
export function compararFinanciamiento(p = {}) {
  const monto = Math.abs(Number(p.monto) || 0)
  const dias = Math.max(0, Number(p.dias) || 0)
  const alt = []

  // Saldo propio: sin costo financiero, pero inmovilizar caja tiene costo de oportunidad (deja de
  // cubrir el rojo). Factible sólo si la caja alcanza.
  alt.push({
    via: 'saldo_propio', nombre: 'Pagar con caja propia',
    costoFinanciero: 0, costoOportunidad: costoDelDinero(monto, dias), ahorro: 0,
    factible: p.cajaLibre == null ? null : p.cajaLibre >= monto,
    nota: p.cajaLibre != null && p.cajaLibre < monto ? 'la caja no alcanza' : 'preserva la línea de crédito',
  })

  // Descubierto: costo cierto y verificado. Factible dentro del límite.
  alt.push({
    via: 'descubierto', nombre: 'Entrar al descubierto',
    costoFinanciero: costoDelDinero(monto, dias), costoOportunidad: 0, ahorro: 0,
    factible: p.limiteDescubiertoDisp == null ? null : p.limiteDescubiertoDisp >= monto,
    nota: `acuerdo N°${ACUERDO.numero}, TNA ${(ACUERDO.tna * 100).toFixed(0)}% (CFT ${(ACUERDO.cft * 100).toFixed(1)}%)`,
  })

  // Esperar hasta el vencimiento: conserva la caja; sólo cuesta si esperar genera multa/interés.
  alt.push({
    via: 'esperar', nombre: 'Esperar al vencimiento',
    costoFinanciero: Number(p.multaEspera) || 0, costoOportunidad: 0, ahorro: 0,
    factible: true, nota: 'no consume caja ni línea; sólo sirve si no hay descuento ni riesgo por esperar',
  })

  // Descuento de cheque: financia adelantando un valor en cartera. Sin la tasa del banco NO se calcula.
  if (p.tasaDescuentoChequeTNA != null) {
    const interes = monto * tasaDiaria(p.tasaDescuentoChequeTNA) * dias
    alt.push({
      via: 'descuento_cheque', nombre: 'Descontar un cheque',
      costoFinanciero: interes * (1 + TASAS.iva), costoOportunidad: 0, ahorro: 0,
      factible: null, nota: `TNA de descuento ${(p.tasaDescuentoChequeTNA * 100).toFixed(0)}% + IVA`,
    })
  } else {
    alt.push({
      via: 'descuento_cheque', nombre: 'Descontar un cheque',
      costoFinanciero: null, costoOportunidad: 0, ahorro: 0, factible: null,
      nota: 'FALTA la tasa de descuento del banco — no se inventa; cargarla para comparar',
    })
  }

  // Préstamo puntual: idem, sólo si se conoce la tasa.
  if (p.tasaPrestamoTNA != null) {
    const interes = monto * tasaDiaria(p.tasaPrestamoTNA) * dias
    alt.push({
      via: 'prestamo', nombre: 'Préstamo bancario',
      costoFinanciero: interes * (1 + TASAS.iva), costoOportunidad: 0, ahorro: 0,
      factible: null, nota: `TNA ${(p.tasaPrestamoTNA * 100).toFixed(0)}% + IVA`,
    })
  }

  // Pronto pago: no es una fuente de fondos, es el premio por usar una. Se modela como AHORRO que
  // rebaja el costo de cualquier vía que pague YA (propio o descubierto).
  const ahorroPP = p.descuentoProntoPago ? monto * Number(p.descuentoProntoPago) : 0

  for (const a of alt) {
    a.ahorroProntoPago = (a.via === 'saldo_propio' || a.via === 'descubierto') ? ahorroPP : 0
    a.costoEconomico = a.costoFinanciero == null ? null
      : a.costoFinanciero + a.costoOportunidad - a.ahorroProntoPago
  }

  const comparables = alt.filter((a) => a.costoEconomico != null && a.factible !== false)
    .sort((x, y) => x.costoEconomico - y.costoEconomico)
  const recomendada = comparables[0] || null

  return { monto, dias, alternativas: alt, recomendada, justificacion: justificar(recomendada, comparables) }
}

// Un costo económico NEGATIVO no es un costo: es una ganancia neta (el ahorro capturado supera al
// costo financiero). Se dice como lo que es —"conviene, ahorra X"— para que la recomendación no se
// lea al revés.
const comoCosto = (n) => n < 0 ? `conviene: ahorra ${fmt(-n)} neto` : `cuesta ${fmt(n)}`

function justificar(rec, comparables) {
  if (!rec) return 'no hay una alternativa factible con costo conocido; falta cargar una tasa o liberar caja/línea'
  const segunda = comparables[1]
  if (!segunda) return `${rec.nombre}: es la única alternativa factible con costo conocido (${comoCosto(rec.costoEconomico)}).`
  const dif = segunda.costoEconomico - rec.costoEconomico
  return `${rec.nombre} ${comoCosto(rec.costoEconomico)} — ${fmt(dif)} mejor que ${segunda.nombre} (${comoCosto(segunda.costoEconomico)}). ${rec.nota}.`
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · INGENIERÍA DE PAGOS — priorizar con criterio, no sólo por vencimiento
// ════════════════════════════════════════════════════════════════════════════

const PESO_CRITICIDAD = { critico: 3, obra: 2.5, comercial: 1.5, normal: 1 }

/**
 * NÚCLEO PURO: ordena obligaciones a pagar considerando a la vez vencimiento, costo de no pagar,
 * criticidad y liquidez. Reparte la caja disponible por prioridad: cuando se agota, el resto pasa a
 * "esperar" — no se paga a ciegas por fecha.
 *
 * @param {Array<object>} obligaciones {proveedor, monto, dias_a_vencer, criticidad?, interesMoraDiario?, descuentoProntoPago?, obra?}
 * @param {object} opts {cajaDisponible?}
 * @returns {Array<object>} misma lista con {orden, score, decision, motivo}
 */
export function priorizarPagos(obligaciones = [], opts = {}) {
  const items = obligaciones.map((o) => {
    const monto = Math.abs(Number(o.monto) || 0)
    const d = Number(o.dias_a_vencer)
    const vencido = Number.isFinite(d) && d < 0
    // Costo de NO pagar hoy: la mora que corre + el descuento por pronto pago que se pierde.
    const mora = (Number(o.interesMoraDiario) || 0) * monto
    const prontoPago = o.descuentoProntoPago ? monto * Number(o.descuentoProntoPago) : 0
    const crit = PESO_CRITICIDAD[o.criticidad] || (o.obra ? PESO_CRITICIDAD.obra : PESO_CRITICIDAD.normal)
    // Urgencia por fecha: vencido pesa muchísimo; después decae con los días que faltan.
    const urgencia = vencido ? 100 + Math.abs(d) : Number.isFinite(d) ? Math.max(0, 30 - d) : 5
    const score = urgencia * crit + (mora + prontoPago) / 1000
    return { ...o, monto, vencido, costoDeEsperar: Math.round(mora + prontoPago), score: Math.round(score * 100) / 100 }
  }).sort((a, b) => b.score - a.score)

  let caja = opts.cajaDisponible == null ? null : Number(opts.cajaDisponible)
  return items.map((it, i) => {
    let decision = 'pagar'; let motivo
    if (caja != null) {
      if (caja >= it.monto) { caja -= it.monto; decision = 'pagar' } else if (caja > 0) { decision = 'parcial'; motivo = `la caja alcanza para ${fmt(caja)} de ${fmt(it.monto)}`; caja = 0 } else { decision = 'esperar'; motivo = 'no queda caja para esta prioridad' }
    }
    if (decision === 'pagar') motivo = it.vencido ? 'vencido — el costo de esperar ya corre' : it.costoDeEsperar > 0 ? `esperar cuesta ${fmt(it.costoDeEsperar)}` : 'dentro de la prioridad que cubre la caja'
    return { ...it, orden: i + 1, decision, motivo }
  })
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · EL MODELO ÚNICO DE LIQUIDEZ — ensamblado, 0 recálculo
// ════════════════════════════════════════════════════════════════════════════

/**
 * Arma el modelo financiero único a partir de las fuentes ya existentes. Cada bloque degrada a
 * {estado:'sin dato'} si su fuente no está disponible — nunca estima para rellenar.
 *
 * @param {object} deps {google} el cliente de Sheets (para el briefing de caja)
 * @param {Date} [hoy]
 */
export async function modeloLiquidez(deps = {}, hoy = new Date(), opts = {}) {
  const { cashBriefing } = await import('./cash-briefing.mjs')
  const { estadoObligaciones } = await import('./obligaciones.mjs')

  const disponible = await bloqueCaja(deps.google, cashBriefing, hoy)
  const obligaciones = await bloqueObligaciones(estadoObligaciones, hoy)
  const lineas = bloqueLineas(disponible)
  // DEUDA COMERCIAL VENCIDA — la que vive en Compras. Se recibe ya calculada por quien lee Compras
  // (el calendario), para no leer la misma pestaña dos veces con dos criterios distintos.
  const comercial = bloqueComercial(opts.vencidoComercial)

  return {
    fecha: hoy.toLocaleDateString('es-AR'),
    disponible,
    comprometido: obligaciones,
    deuda_comercial: comercial,
    lineas,
    // El colchón real: lo que hay hoy + lo que puedo pedir prestado − lo que ya vencí y debo.
    colchon_total: sumaColchon(disponible, lineas, obligaciones) - (comercial.estado === 'ok' ? comercial.vencido : 0),
    fuentes: 'cash-briefing (caja/cobranzas/vencimientos) · obligacion_resumen (fiscal vencido) · Compras (comercial vencido) · banco-santander (líneas)',
  }
}

/**
 * LO VENCIDO NO ES SÓLO LO FISCAL (QA 23/07). En pantalla convivían dos cifras de "vencido": la
 * recomendación decía $4.700.000 (obligacion_resumen) y el calendario mostraba Gruas San Blas por
 * $5.351.225 (Compras). Dos verdades del mismo concepto en la misma pantalla es exactamente lo que
 * la realidad única prohíbe. El motor ahora las nombra por separado y las suma para decidir.
 */
function bloqueComercial(v) {
  if (!v || !(Number(v.monto) > 0)) return { estado: 'sin dato', motivo: 'no se recibió la deuda comercial vencida' }
  return {
    estado: 'ok',
    vencido: Math.round(Number(v.monto)),
    n: Number(v.n) || 0,
    evidencia: 'real — Compras del Cash Flow, filas "Pendiente" con vencimiento cumplido',
  }
}

async function bloqueCaja(google, cashBriefing, hoy) {
  try {
    if (!google?.readSheetValues) return { estado: 'sin dato', motivo: 'sin acceso al Sheet de caja' }
    const b = await cashBriefing(google, hoy)
    return {
      estado: 'ok',
      caja_hoy: Math.round(b.caja?.total ?? 0),
      cobranzas_por_cobrar_mes: Math.round(b.cobranzas_mes?.por_cobrar ?? 0),
      cobranzas_vencidas: Math.round(b.cobranzas_vencidas?.total ?? 0),
      vencimientos_7dias: Math.round(b.vencimientos_7dias?.total ?? 0),
      proyeccion_7dias: Math.round(b.proyeccion_7dias?.proyectado ?? 0),
      evidencia: 'real — columnas estructuradas del Flujo de Caja',
    }
  } catch (e) { return { estado: 'sin dato', motivo: String(e?.message ?? e).slice(0, 120) } }
}

async function bloqueObligaciones(estadoObligaciones, hoy) {
  try {
    const o = await estadoObligaciones(hoy)
    return {
      estado: 'ok', saldo_total: o.saldo_total, vencido: o.vencido,
      entra_30_dias: o.entra_30_dias, por_tipo: o.por_tipo,
      evidencia: 'real — vista public.obligacion_resumen (fuente única)',
    }
  } catch (e) { return { estado: 'sin dato', motivo: String(e?.message ?? e).slice(0, 120) } }
}

// El descubierto y la tarjeta: límites declarados por el banco. El USADO exacto del descubierto sale
// del saldo de la cuenta (negativo = rojo); si la caja no está, el disponible de la línea queda como
// el límite bruto y se marca que falta el saldo para netear.
function bloqueLineas(disponible) {
  const saldoCuenta = disponible.estado === 'ok' ? disponible.caja_hoy : null
  const usadoDescubierto = saldoCuenta != null && saldoCuenta < 0 ? -saldoCuenta : 0
  return {
    descubierto: {
      limite: ACUERDO.importe, vence: ACUERDO.vence, tna: ACUERDO.tna, cft: ACUERDO.cft,
      usado_aprox: saldoCuenta == null ? null : usadoDescubierto,
      disponible_aprox: saldoCuenta == null ? ACUERDO.importe : ACUERDO.importe - usadoDescubierto,
      nota: saldoCuenta == null ? 'sin el saldo de la cuenta, el disponible es el límite bruto' : 'neteado contra el saldo de caja',
    },
    tarjeta: { limite: TARJETA.limite, disponible: TARJETA.disponible, cuotas_disponible: TARJETA.cuotas?.disponible },
    costo_marginal: `descubierto: ${fmt(costoDelDinero(1000000, 30))} por millón a 30 días (TNA ${(TASAS.tna * 100).toFixed(0)}% ×1,12)`,
  }
}

function sumaColchon(disponible, lineas, obligaciones) {
  if (disponible.estado !== 'ok') return null
  const caja = disponible.caja_hoy
  const lineaDisp = lineas.descubierto.disponible_aprox ?? 0
  const vencido = obligaciones.estado === 'ok' ? obligaciones.vencido : 0
  return Math.round(caja + lineaDisp - vencido)
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · RECOMENDACIONES — el motor nunca sólo informa
// ════════════════════════════════════════════════════════════════════════════

/**
 * Deriva recomendaciones concretas del modelo. Cada una lleva el contrato pedido: prioridad, impacto,
 * ahorro, riesgo, explicación y fundamentos. Sólo emite lo que el dato sostiene.
 */
export function recomendaciones(model) {
  const r = []
  const d = model?.disponible; const o = model?.comprometido; const l = model?.lineas
  if (d?.estado !== 'ok') {
    r.push(rec('alta', 'Reconectar la fuente de caja', 0,
      'sin el saldo de caja el motor no puede optimizar nada', 'alto',
      d?.motivo || 'el briefing de caja no respondió', 'todo el modelo depende de esta fuente única'))
    return r
  }
  const fiscal = o?.estado === 'ok' ? o.vencido : 0
  const comercial = model?.deuda_comercial?.estado === 'ok' ? model.deuda_comercial.vencido : 0
  if (fiscal + comercial > 0) {
    const desglose = [fiscal > 0 ? `${fmt(fiscal)} fiscal/previsional` : null,
      comercial > 0 ? `${fmt(comercial)} a proveedores` : null].filter(Boolean).join(' + ')
    r.push(rec('alta', 'Regularizar lo vencido', fiscal + comercial,
      `hay ${fmt(fiscal + comercial)} vencido (${desglose})`, 'alto',
      'lo fiscal corre intereses y multas; lo comercial corta la ficha con el proveedor',
      'priorizar esto por sobre lo que todavía no vence'))
  }
  if (d.vencimientos_7dias > d.caja_hoy) {
    const falta = d.vencimientos_7dias - d.caja_hoy
    const costo30 = costoDelDinero(falta, 30)
    r.push(rec('alta', 'Cubrir el bache de la semana', falta,
      `los vencimientos de 7 días (${fmt(d.vencimientos_7dias)}) superan la caja (${fmt(d.caja_hoy)})`, 'medio',
      `faltan ${fmt(falta)}; con el descubierto cuesta ~${fmt(costo30)} a 30 días`,
      `acelerar ${fmt(d.cobranzas_por_cobrar_mes)} por cobrar del mes evita ese costo`))
  } else if (d.caja_hoy > 0 && l?.descubierto?.usado_aprox === 0) {
    r.push(rec('media', 'Caja holgada esta semana', 0,
      `la caja (${fmt(d.caja_hoy)}) cubre los vencimientos de 7 días`, 'bajo',
      'no hace falta financiamiento externo en el corto plazo',
      'evaluar adelantar pagos con descuento por pronto pago si el proveedor lo ofrece'))
  }
  if (d.cobranzas_vencidas > 0) {
    r.push(rec('media', 'Reclamar cobranzas vencidas', d.cobranzas_vencidas,
      `${fmt(d.cobranzas_vencidas)} de cobranzas pasaron su fecha`, 'medio',
      'plata devengada que no entró: es capital de trabajo inmovilizado',
      'cruzar con reclamo-cobranza para priorizar por cliente e impacto'))
  }
  return r
}

function rec(prioridad, titulo, impacto, explicacion, riesgo, ahorro, fundamentos) {
  return { prioridad, titulo, impacto_pesos: Math.round(Number(impacto) || 0), explicacion, riesgo, ahorro, fundamentos }
}
