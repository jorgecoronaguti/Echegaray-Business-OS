// MOTOR DE ESTRATEGIA DE TESORERÍA — el plan financiero ejecutable del Business OS.
//
// ═══ QUÉ ES, Y QUÉ NO ES (24/07) ═══
//
// El motor de Ingeniería Financiera (ingenieria-financiera.mjs) ya sabe consolidar liquidez, comparar
// financiamiento, priorizar pagos y recomendar. Lo que faltaba NO es otra recomendación aislada: es un
// PLAN. Dada la situación de hoy, este módulo construye la mejor secuencia CRONOLÓGICA de acciones —
// qué cobrar, qué pagar, qué postergar, qué negociar, con qué medio, qué línea usar, cuándo usarla y
// cuándo cancelarla— donde cada decisión DEPENDE de las anteriores. Optimiza el flujo completo, no el
// movimiento suelto.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO: NO REIMPLEMENTAR, NO DUPLICAR, NO CREAR FUENTES ═══
//
// Este módulo NO toca el motor ni el calendario: los ORQUESTA. Cada pieza ya existe y se consume:
//
//   la trayectoria día a día (saldo, movimientos)  → calendarioDiario   (calendario-financiero.mjs)
//   la posición y las líneas de hoy                → modeloLiquidez     (ingenieria-financiera.mjs)
//   el ORDEN multicriterio de los pagos            → priorizarPagos     (ingenieria-financiera.mjs)
//   la ELECCIÓN de la línea más barata             → compararFinanciamiento (idem)
//   el costo REAL del dinero (descubierto verif.)  → costoDelDinero     (idem)
//
// El núcleo `construirPlan` es PURO: recibe la trayectoria ya armada y las restricciones, y devuelve la
// secuencia. El ensamblador `planTesoreria` trae las fuentes y arma los horizontes. Ningún número de
// plata se recalcula acá; si uno no coincide con su fuente, es un bug de arquitectura.
//
// ═══ EL CONTRATO ESTRATÉGICO (24/07) — DE "LISTA DE TAREAS" A "PLAN DE COORDINACIÓN" ═══
//
// El plan no es una lista de "cobrar/pagar": es una ESTRATEGIA de coordinación financiera. Por eso cada
// decisión, además de su contrato operativo (motivo, impacto, costo, efecto en liquidez, riesgos,
// dependencias), expone una capa `estrategia` que responde POR QUÉ es la mejor jugada: qué coordina,
// qué optimiza, qué alternativas había, por qué se eligió esa, el beneficio esperado, y su impacto sobre
// la liquidez futura, el costo financiero, y las relaciones (proveedores/clientes/obras), más qué cambia
// respecto del plan anterior. Y cada horizonte lleva un `resumen_estrategico`: qué coordina el CONJUNTO,
// qué optimiza y qué cambió. TODO se DERIVA de números que los motores ya calcularon —ni un peso se
// recalcula acá—; es una capa de sentido sobre decisiones ya tomadas, no un cálculo nuevo.
//
// ═══ POLÍTICA DE RIESGO (NO NEGOCIABLE) ═══
//
// El plan DECIDE y ORDENA; ejecutar (pagar, firmar, tomar deuda) es Nivel E y requiere aprobación
// humana. Cada acción con efecto externo nace `requiere_aprobacion: true`. El motor prepara la
// decisión; nunca la ejecuta solo. Respeta automáticamente la liquidez mínima, el límite de la línea,
// los vencimientos y la criticidad — y cuando una restricción no se puede cumplir, lo DICE, no la tapa.

import { costoDelDinero, compararFinanciamiento, priorizarPagos, fmt } from './ingenieria-financiera.mjs'
import { categoriaEgreso } from './calendario-financiero.mjs'
import { ACUERDO } from './banco-santander.mjs'
// LA CAPA ESTRATÉGICA vive en su propio módulo (plan-estrategia.mjs): narra qué coordina/optimiza cada
// decisión y qué cambió vs el plan anterior. Deriva de lo que este núcleo ya decidió — no recalcula.
import {
  estrategiaCobro, estrategiaCancelar, estrategiaPagarCaja, estrategiaFinanciar,
  estrategiaPagarCritico, estrategiaPostergar, marcarCambios, cambiosVsAnterior, resumenEstrategico,
} from './plan-estrategia.mjs'
// LAS PALANCAS OPCIONALES (orden por obra, división de pago, descuento de cheque, negociación de plazo)
// viven en su propio módulo. Cada una tiene default = comportamiento actual. Import circular seguro:
// palancas usa `accion`/`medioSugerido` en runtime, no al evaluar el módulo.
import { reordenarPorObra, dividirPago, cubrirConChequeDescuento, aplicarNegociacion, emitirNegociacion } from './plan-tesoreria-palancas.mjs'

// Horizonte estándar para ELEGIR el instrumento más barato en compararFinanciamiento. El costo real
// diario se acumula aparte (costoDelDinero sobre la línea usada cada día); estos 30 días son sólo la
// vara común para comparar descubierto vs. préstamo vs. descuento de cheque, no el plazo del episodio.
const DIAS_COMPARACION = 30

// Los horizontes que pide el spec. "hoy" es un solo día; el resto, ventanas acumuladas.
export const HORIZONTES = [
  { clave: 'hoy', dias: 1, titulo: 'Hoy' },
  { clave: 'dias_7', dias: 7, titulo: 'Próximos 7 días' },
  { clave: 'dias_30', dias: 30, titulo: 'Próximos 30 días' },
  { clave: 'dias_90', dias: 90, titulo: 'Próximos 90 días' },
]

// ════════════════════════════════════════════════════════════════════════════
// Criterios de la trayectoria — qué es crítico, qué medio conviene
// ════════════════════════════════════════════════════════════════════════════

/**
 * Un egreso es CRÍTICO (se paga aunque haya que financiarlo) si ya venció, si es de criticidad
 * declarada, o si es de una obra en marcha. Lo demás se puede postergar para respetar la liquidez
 * mínima. No inventa criticidad: usa lo que el movimiento ya trae.
 */
export function esCritico(mov = {}) {
  if (mov.vencida) return true
  if (mov.criticidad === 'critico') return true
  if (mov.obra) return true
  return false
}

/**
 * El medio de pago sugerido. Si el movimiento ya lo trae (viene de Cheques Emitidos, p.ej.), se
 * respeta. Si no, se sugiere por el tipo de egreso: lo fiscal/previsional va por transferencia (VEP),
 * un pago grande a futuro conviene con eCheq (difiere la salida sin costo), el resto por transferencia.
 */
export function medioSugerido(mov = {}) {
  if (mov.medio) return mov.medio
  const cat = mov.categoria || categoriaEgreso(mov.detalle || mov.proveedor || '')
  if (cat === 'impuesto' || cat === 'cargas_sociales') return 'Transferencia (VEP)'
  if (cat === 'cheque') return 'Cheque'
  return 'Transferencia'
}

const round = (n) => Math.round(Number(n) || 0)

/** Da forma de obligación a un movimiento de egreso del calendario, para priorizarPagos. */
function comoObligacion(mov, fecha, hoy) {
  const diasAVencer = Math.round((fecha.getTime() - hoy.getTime()) / 86400000)
  return {
    proveedor: mov.proveedor || mov.detalle || 'sin identificar',
    monto: Math.abs(Number(mov.monto) || 0),
    dias_a_vencer: mov.vencida ? -1 : diasAVencer,
    obra: mov.obra || null,
    criticidad: mov.criticidad || null,
    vencida: !!mov.vencida,
    categoria: mov.categoria || categoriaEgreso(mov.detalle || mov.proveedor || ''),
    medio: mov.medio || null,
    detalle: mov.detalle || null,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — construir la secuencia cronológica de decisiones
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: dada la trayectoria día a día (del calendario) y las restricciones, arma la secuencia
 * ordenada de acciones con dependencias. Un solo paso hacia adelante que mantiene el saldo PLANEADO
 * (que refleja las decisiones de postergar/financiar), la línea usada y el costo financiero acumulado.
 *
 * @param {object} p
 * @param {Array<object>} p.dias días del calendario {fecha, saldo_inicial, movimientos[...]}
 * @param {number} p.cajaInicial saldo de arranque
 * @param {number} [p.liquidezMinima] piso de caja que el plan nunca perfora voluntariamente
 * @param {number} [p.limiteDescubierto] techo de la línea (restricción bancaria)
 * @param {Date} p.hoy
 * @param {object} [p.paramsFin] tasas para compararFinanciamiento (préstamo, descuento de cheque)
 * @param {Array<object>} [p.accionesAnteriores] acciones del mismo horizonte del plan anterior — para
 *   decir, por acción y por horizonte, qué cambió. Sin ellas, el plan lo declara honestamente.
 * @param {object} [p.politica] palancas de la ESTRATEGIA que gobierna este plan (las fija el diseñador de
 *   estrategias). Todas con default = comportamiento actual (retrocompat total):
 *   • `financiarNoCriticos` (bool): financia con la línea un NO crítico que la caja no cubre —si hay margen
 *     real, nunca excede el límite— en lugar de postergarlo. Cumplimiento vs. costo financiero mínimo.
 *   • `priorizarObra` (string): pone primero los pagos de esa obra (sin romper el orden multicriterio dentro
 *     de cada grupo) — proteger la obra de mayor exposición antes de agotar la caja.
 *   • `dividirPagos` (bool): un NO crítico que la caja cubre en parte se paga PARCIAL (lo disponible) y se
 *     posterga el resto, en vez de postergar el pago entero.
 *   • `viaCobertura` ('descubierto'|'descuento_cheque'): con qué se cubre el faltante de un crítico. Con
 *     'descuento_cheque' se adelanta un cheque en cartera (costo único, no toca la línea) si es factible.
 *   • `negociar` ({proveedor, monto, dias, fechaNueva}): mueve ese egreso a una fecha cierta acordada dentro
 *     del horizonte y emite una acción explícita `negociar_plazo` (no es un "postergar" a ciegas).
 * @returns {{acciones:Array, resumen:object, resumen_estrategico:object}}
 */
export function construirPlan({ dias = [], cajaInicial = 0, liquidezMinima = 0, limiteDescubierto = ACUERDO.importe, hoy = new Date(), paramsFin = {}, accionesAnteriores = null, politica = {} } = {}) {
  const acciones = []
  const est = {
    saldo: Number(cajaInicial) || 0,
    lineaUsada: 0,
    costoFinanciero: 0,
    peorLinea: 0,
    excedeLinea: false,
    financiarNoCriticos: !!politica.financiarNoCriticos,
    priorizarObra: politica.priorizarObra || null,
    dividirPagos: !!politica.dividirPagos,
    viaCobertura: politica.viaCobertura || 'descubierto',
    liquidezMinima, limiteDescubierto, hoy, paramsFin,
  }
  let seq = 0
  const nid = (fecha, tipo) => `${fecha}-${tipo}-${++seq}`

  // PALANCA 4: si la estrategia negoció un plazo, se reubica ese egreso ANTES de recorrer los días y se
  // prepara la acción explícita para emitirla en su fecha original. Sin `negociar`, `dias` queda intacto.
  const { dias: diasPlan, negociaciones } = aplicarNegociacion(dias, politica.negociar)
  const negPorFecha = new Map()
  for (const n of negociaciones) negPorFecha.set(n.fechaOrig, n)

  for (const dia of diasPlan) {
    const fecha = dia.fecha
    const movs = dia.movimientos || []
    // 1 · COBROS del día — entran primero: pueden habilitar pagos y cancelar línea.
    const idsCobros = []
    for (const m of movs.filter((x) => x.tipo === 'ingreso')) {
      const monto = round(m.monto)
      if (monto <= 0) continue
      est.saldo += monto
      const id = nid(fecha, 'cobrar')
      idsCobros.push(id)
      acciones.push(accion(id, fecha, 'cobrar', `Cobrar ${m.cliente || 'cliente'} ${fmt(monto)}`, {
        motivo: m.vencida ? 'cobranza con fecha cumplida — es capital de trabajo que ya debería estar' : 'ingreso previsto que habilita los pagos del período',
        impacto_pesos: monto, costo_financiero: 0, efecto_liquidez: +monto,
        riesgos: 'depende de que el cliente pague en fecha; si no entra, el resto del plan se recalcula',
        dependencias: [], requiere_aprobacion: false,
        estrategia: estrategiaCobro(m, monto, est),
      }))
    }
    // 2 · CANCELAR/REDUCIR LÍNEA con la caja fresca por encima del piso.
    cancelarLinea(est, fecha, idsCobros, acciones, nid)
    // 2b · NEGOCIACIÓN DE PLAZO (palanca 4): la decisión explícita se registra en su fecha original; el
    //      egreso ya fue reubicado a su fecha nueva por aplicarNegociacion.
    if (negPorFecha.has(fecha)) emitirNegociacion(negPorFecha.get(fecha), acciones, nid)
    // 3 · PAGOS del día — orden multicriterio de priorizarPagos, asignación con conciencia de la línea.
    procesarPagos(est, dia, movs, acciones, nid)
    // 4 · COSTO del día: lo que cuesta tener la línea usada un día más.
    if (est.lineaUsada > 0) est.costoFinanciero += costoDelDinero(est.lineaUsada, 1)
    est.peorLinea = Math.max(est.peorLinea, est.lineaUsada)
    if (est.lineaUsada > est.limiteDescubierto + 1) est.excedeLinea = true
  }

  // Capa estratégica FINAL: qué cambió por acción y por horizonte respecto del plan anterior. Se calcula
  // una vez, al cierre, comparando contra las acciones previas (si se pasaron) — no recalcula plata.
  marcarCambios(acciones, accionesAnteriores)
  const resumen = resumenPlan(est, acciones, cajaInicial)
  const cambios = cambiosVsAnterior(acciones, accionesAnteriores)
  return { acciones, resumen, resumen_estrategico: resumenEstrategico(resumen, cambios) }
}

/** Repaga la línea con la caja que quedó por encima del piso. Emite "cancelar" dependiendo del cobro. */
function cancelarLinea(est, fecha, idsCobros, acciones, nid) {
  if (est.lineaUsada <= 0) return
  const excedente = est.saldo - est.liquidezMinima
  if (excedente <= 0) return
  const repago = Math.min(est.lineaUsada, excedente)
  est.saldo -= repago
  est.lineaUsada -= repago
  acciones.push(accion(nid(fecha, 'cancelar_financiacion'), fecha, 'cancelar_financiacion',
    `Cancelar ${fmt(repago)} de la línea`, {
      motivo: 'entró caja: se repaga la línea para dejar de pagar interés — cada día de rojo cuesta',
      impacto_pesos: repago, costo_financiero: 0, efecto_liquidez: -repago,
      riesgos: est.lineaUsada > 0 ? `quedan ${fmt(est.lineaUsada)} de línea sin cancelar` : 'ninguno: la línea queda en cero',
      dependencias: idsCobros, requiere_aprobacion: true,
      estrategia: estrategiaCancelar(repago, est),
    }))
}

/** Procesa los egresos de un día: los ordena con priorizarPagos y decide pagar/postergar/financiar. */
function procesarPagos(est, dia, movs, acciones, nid) {
  const fecha = dia.fecha
  const egresos = movs.filter((x) => x.tipo === 'egreso' && Math.abs(Number(x.monto) || 0) > 0)
  if (!egresos.length) return
  // priorizarPagos SIN cajaDisponible: se usa por su ORDEN multicriterio (urgencia × criticidad), no
  // por su asignación de caja — la asignación con conciencia de la línea la hace este módulo.
  const obligs = egresos.map((m) => comoObligacion(m, parseFechaClave(fecha, est.hoy), est.hoy))
  // PALANCA 1: si la estrategia protege una obra, sus pagos van primero (dentro de cada grupo se respeta
  // el orden multicriterio de priorizarPagos). Sin `priorizarObra`, el orden queda intacto.
  const ordenados = reordenarPorObra(priorizarPagos(obligs, {}), est.priorizarObra)
  for (const it of ordenados) {
    const monto = round(it.monto)
    const disponible = Math.max(0, est.saldo - est.liquidezMinima)
    if (monto <= disponible) { pagarConCaja(est, fecha, it, monto, acciones, nid); continue }
    if (esCritico(it) || financiaNoCritico(est, monto, disponible)) financiarYpagar(est, fecha, it, monto, disponible, acciones, nid)
    // PALANCA 2: dividir el pago no crítico — pagar lo que la caja cubre y negociar el resto.
    else if (est.dividirPagos && disponible > 0) dividirPago(est, fecha, it, monto, disponible, acciones, nid)
    else postergar(est, fecha, it, monto, acciones, nid)
  }
}

/**
 * ¿La estrategia elige financiar un NO crítico en vez de postergarlo? Sólo si su palanca lo pide Y hay
 * margen REAL de línea para el faltante: honrar al proveedor nunca justifica exceder el límite del acuerdo.
 */
function financiaNoCritico(est, monto, disponible) {
  if (!est.financiarNoCriticos) return false
  const faltante = monto - disponible
  return (est.limiteDescubierto - est.lineaUsada) >= faltante
}

/** Paga con caja propia: no consume línea, preserva la relación y no cuesta financieramente. */
function pagarConCaja(est, fecha, it, monto, acciones, nid) {
  est.saldo -= monto
  acciones.push(accion(nid(fecha, 'pagar'), fecha, 'pagar', `Pagar ${it.proveedor} ${fmt(monto)}`, {
    motivo: it.vencida ? 'vencido — el costo de esperar ya corre' : 'entra en la caja disponible por encima del piso de liquidez',
    impacto_pesos: monto, costo_financiero: 0, efecto_liquidez: -monto,
    medio: medioSugerido(it), riesgos: 'ninguno relevante: sale de caja propia',
    dependencias: [], requiere_aprobacion: true,
    estrategia: estrategiaPagarCaja(it, monto),
  }))
}

/** Un crítico que la caja no cubre: se paga financiando el faltante con la línea más barata. */
function financiarYpagar(est, fecha, it, monto, disponible, acciones, nid) {
  const faltante = round(monto - disponible)
  const { via, cmp } = elegirLinea(est, faltante)
  // PALANCA 3: si la estrategia elige cubrir con descuento de cheque y es factible, se adelanta el cheque
  // (costo único, sin tocar la línea) y no se sigue con el descubierto. Si no es factible, cae acá abajo.
  if (est.viaCobertura === 'descuento_cheque' && cubrirConChequeDescuento(est, fecha, it, monto, disponible, faltante, cmp, acciones, nid)) return
  const costoFin = round(costoDelDinero(faltante, DIAS_COMPARACION))
  // Se GIRA la línea al saldo (entra la plata prestada) y luego se paga: el neto sobre la caja propia
  // es −disponible, y queda `faltante` de deuda de línea que se cancelará cuando entre caja.
  est.saldo += faltante
  est.lineaUsada += faltante
  est.saldo -= monto
  const idFin = nid(fecha, 'financiar')
  const excede = est.lineaUsada > est.limiteDescubierto + 1
  acciones.push(accion(idFin, fecha, 'financiar', `Usar ${via.nombre.toLowerCase()} por ${fmt(faltante)}`, {
    motivo: `${it.proveedor} es ${it.vencida ? 'deuda vencida' : it.obra ? 'de una obra en marcha' : 'crítico'}: se paga aunque la caja no alcance`,
    impacto_pesos: faltante, costo_financiero: costoFin,
    efecto_liquidez: +faltante, linea: via.via,
    riesgos: excede ? `EXCEDE el límite de la línea (${fmt(est.limiteDescubierto)}): requiere aprobación y otra fuente de fondos` : `suma ${fmt(faltante)} de deuda de línea al ${(ACUERDO.cft * 100).toFixed(1)}% CFT — cancelar apenas entre caja`,
    dependencias: [], requiere_aprobacion: true, excede_limite: excede,
    estrategia: estrategiaFinanciar(it, faltante, via, cmp, costoFin, excede),
  }))
  acciones.push(accion(nid(fecha, 'pagar'), fecha, 'pagar', `Pagar ${it.proveedor} ${fmt(monto)}`, {
    motivo: `crítico: ${fmt(disponible)} de caja + ${fmt(faltante)} financiado`,
    impacto_pesos: monto, costo_financiero: 0, efecto_liquidez: -monto,
    medio: medioSugerido(it), riesgos: 'usa la línea de crédito: encarece el período hasta que se cancele',
    dependencias: [idFin], requiere_aprobacion: true,
    estrategia: estrategiaPagarCritico(it, monto, disponible, faltante),
  }))
}

/** Un egreso no crítico que perforaría el piso: se posterga. No cambia el saldo. */
function postergar(est, fecha, it, monto, acciones, nid) {
  acciones.push(accion(nid(fecha, 'postergar'), fecha, 'postergar', `Postergar ${it.proveedor} ${fmt(monto)}`, {
    motivo: `no es crítico y pagarlo hoy perforaría la liquidez mínima (${fmt(est.liquidezMinima)}); conviene negociar plazo`,
    impacto_pesos: monto, costo_financiero: 0, efecto_liquidez: 0, sugerir_negociar: true,
    riesgos: 'postergar puede afectar la relación con el proveedor: negociar el nuevo plazo, no faltar sin avisar',
    dependencias: [], requiere_aprobacion: true,
    estrategia: estrategiaPostergar(it, monto, est),
  }))
}

/**
 * Elige la línea para financiar un faltante: delega en compararFinanciamiento (no reimplementa la
 * comparación). Le pasa el margen de descubierto que queda y las tasas conocidas; toma la recomendada.
 * Si no hay recomendada factible (p.ej. el descubierto ya está al tope), cae al descubierto nombrándolo.
 * Devuelve la comparación COMPLETA (`cmp`) además de la vía elegida, para que la capa estratégica pueda
 * mostrar QUÉ alternativas se evaluaron y por qué ganó esta — sin volver a comparar.
 */
function elegirLinea(est, faltante) {
  const cmp = compararFinanciamiento({
    monto: faltante, dias: DIAS_COMPARACION,
    cajaLibre: 0,
    limiteDescubiertoDisp: Math.max(0, est.limiteDescubierto - est.lineaUsada),
    tasaPrestamoTNA: est.paramsFin.tasaPrestamoTNA,
    tasaDescuentoChequeTNA: est.paramsFin.tasaDescuentoChequeTNA,
  })
  return { via: cmp.recomendada || { via: 'descubierto', nombre: 'Entrar al descubierto' }, cmp }
}

function resumenPlan(est, acciones, cajaInicial) {
  const cuenta = (t) => acciones.filter((a) => a.tipo === t).length
  return {
    caja_inicial: round(cajaInicial),
    saldo_proyectado_final: round(est.saldo),
    liquidez_minima: round(est.liquidezMinima),
    linea_maxima_usada: round(est.peorLinea),
    limite_linea: round(est.limiteDescubierto),
    excede_limite_linea: est.excedeLinea,
    costo_financiero_total: round(est.costoFinanciero),
    liquidez_minima_respetada: !est.excedeLinea,
    acciones_total: acciones.length,
    por_tipo: {
      cobrar: cuenta('cobrar'), pagar: cuenta('pagar'), postergar: cuenta('postergar'),
      financiar: cuenta('financiar'), cancelar_financiacion: cuenta('cancelar_financiacion'),
      negociar_plazo: cuenta('negociar_plazo'),
    },
  }
}

/** Una acción del plan, con el contrato completo que pide el spec. Exportada para las palancas. */
export function accion(id, fecha, tipo, descripcion, campos) {
  return {
    id, fecha, tipo, descripcion,
    motivo: campos.motivo,
    impacto_pesos: round(campos.impacto_pesos),
    costo_financiero: round(campos.costo_financiero),
    efecto_liquidez: round(campos.efecto_liquidez),
    riesgos: campos.riesgos,
    dependencias: campos.dependencias || [],
    medio: campos.medio || null,
    linea: campos.linea || null,
    nueva_fecha: campos.nueva_fecha || null,
    sugerir_negociar: campos.sugerir_negociar || false,
    excede_limite: campos.excede_limite || false,
    requiere_aprobacion: campos.requiere_aprobacion !== false,
    // La capa estratégica: los 9 puntos que convierten la acción en una decisión de coordinación, no una
    // tarea suelta. `cambio_vs_plan_anterior` lo completa marcarCambios al cierre del plan.
    estrategia: campos.estrategia || null,
  }
}

/** Reconstruye un Date a partir de la clave YYYY-MM-DD del calendario (para dias_a_vencer). */
function parseFechaClave(clave, fallback) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(clave))
  if (!m) return fallback instanceof Date ? fallback : new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

// ════════════════════════════════════════════════════════════════════════════
// ENSAMBLADOR — vive en plan-tesoreria-ensamblador.mjs (I/O + armado de horizontes)
// ════════════════════════════════════════════════════════════════════════════
// Se re-exporta desde acá para no romper a quien importaba `planTesoreria` de este módulo.
export { planTesoreria } from './plan-tesoreria-ensamblador.mjs'

// ════════════════════════════════════════════════════════════════════════════
// APRENDIZAJE DEL FORECAST (F2) — la precisión del plan se mide, no se supone
// ════════════════════════════════════════════════════════════════════════════
// El plan de tesorería predice el saldo proyectado por horizonte (dias_7 / dias_30 …). Su PRECISIÓN se
// contrasta después contra la caja real vía la caja negra. Se expone acá para que quien consume el plan
// tenga a mano la medición de su propio acierto — sin recalcular plata (todo vive en aprendizaje-forecast).
export { precisionForecast, evaluarAjuste } from './aprendizaje-forecast.mjs'
