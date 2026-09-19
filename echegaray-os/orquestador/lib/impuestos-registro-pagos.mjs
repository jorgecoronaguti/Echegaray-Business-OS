// LO PERCIBIDO — qué plata salió hacia el fisco y qué crédito se sufrió, con su imputación declarada.
//
// NÚCLEO PURO. Recibe filas ya leídas de `banco_movimientos`, `compra_sheet` y la pestaña Cobranzas y
// devuelve filas de `public.impuesto_pago`.
//
// ═══ LA IMPUTACIÓN SE DECLARA, NO SE ADIVINA ═══
//
// El extracto dice «Pago de servicios - Imp.afip: 3071630464311793242» para TODO VEP: el mismo texto
// para el F931, el IVA o un plan. Hay tres niveles y cada pago dice en cuál está:
//
//   documento    el papel nombra el impuesto («Iva percepcion rg 2408», «Anticipo de Ganancias E6»).
//   importe      coincide al centavo con el total de una DDJJ presentada. MEDIDO el 16/09/2026: los
//                VEP del 08/06, 11/08 y 07/09 son $8.974.571,96, $8.235.741,96 y $8.331.697,69, que
//                son EXACTAMENTE los F931 de mayo, julio y agosto de `_F931_RAW`.
//   sin_imputar  no hay cómo probarlo. Se registra igual, con impuesto null, y la pantalla lo muestra:
//                un VEP de $4.859.763 que no se ve es peor que uno que dice «no sé de qué es».
//
// ═══ LO QUE NO ENTRA, Y POR QUÉ ═══
//
//   · «Iva 21% reg de transf fisc» del banco: es el IVA de las COMISIONES bancarias, crédito fiscal de
//     una compra, no un pago ni una percepción.
//   · IERIC y la Municipalidad: no son impuestos de ARCA/DGR y el extracto no dice qué tasa es.

import { parseMonto } from './cash-briefing.mjs'
import { verificarAlicuota, COLUMNAS as COLUMNAS_RET } from './retenciones-sufridas.mjs'
import { exigirColumnas } from './cobranzas-columnas.mjs'
import { c2 } from './impuestos-registro.mjs'

/** Tolerancia de coincidencia por importe. El débito automático del plan difiere 3 centavos de Compras. */
export const TOLERANCIA_IMPORTE = 1

/**
 * 'YYYY-MM-DD' desde un Date, un ISO, 'dd/mm/yy(yy)' o un SERIAL de Sheets. null si no se puede.
 *
 * El serial existe porque Cobranzas se lee SIN FORMATO: leída con formato, «$273.112,60» llega como
 * «$273.113» si la celda muestra pesos enteros, y la suma de Ganancias salía $1 arriba de la pestaña.
 */
export function fechaISO(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10) : null
  const s = String(v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s)
  if (!m) return null
  const a = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
  return `${a}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}

const mesDe = (iso) => iso.slice(0, 7)
const diasEntre = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000
const pago = (x) => ({ concepto: null, contraparte: null, detalle: {}, ...x, importe: c2(x.importe) })

/** El período del F931 cuyo total coincide con este importe, o null. Único: dos candidatos no imputan. */
export function periodoF931PorImporte(importe, f931 = new Map()) {
  const hits = [...f931].filter(([, total]) => Math.abs(total - importe) <= 0.05).map(([p]) => p)
  return hits.length === 1 ? hits[0] : null
}

/**
 * LOS CUIT QUE COBRAN POR DEBIN SIN SER EL ACREEDOR. Identificado el 18/09/2026: 30-70774398-7 es
 * ADMINISTRADORA SAN JUAN S.A., la sociedad detrás de PlusPagos (registro de entidades especializadas
 * en cobranza; cuitonline / sistemas360 / boletín oficial). Es una PLATAFORMA: por ella el dueño pagó
 * el IIBB de 08/2026 a DGR San Juan (DEBIN del 17/09, $432.764,90 = «a pagar» de la DDJJ al centavo) y
 * antes la boleta de UOCRA de julio (19/08, ver `cargas-pagos-banco.mjs`). El extracto sólo dice el
 * CUIT del cobrador: QUÉ se pagó lo prueba el importe contra un declarado, nunca el CUIT solo.
 */
export const COBRADORES_DEBIN = Object.freeze([
  Object.freeze({ cuit: '30707743987', nombre: 'Administradora San Juan S.A. (PlusPagos)', cobraPara: ['DGR San Juan', 'UOCRA'] }),
])

/** El período de IIBB cuyo «a pagar» declarado coincide con este importe, o null. Único, y nunca un cero. */
export function periodoIibbPorImporte(importe, iibb = new Map()) {
  const hits = [...iibb].filter(([, aPagar]) => aPagar > 0 && Math.abs(aPagar - importe) <= 0.05).map(([p]) => p)
  return hits.length === 1 ? hits[0] : null
}

const cuitDelDebin = (txt) => (/cuit\s*(\d{11})/i.exec(txt)?.[1] ?? null)

/**
 * EL EXTRACTO. `cuotasPlan` son los importes de las cuotas de planes de deuda previsional que Compras
 * declara por texto: un débito automático de ARCA que coincide con una de ellas es esa cuota.
 */
export function pagosDelBanco(movs = [], { f931 = new Map(), cuotasPlan = [], iibb = new Map() } = {}) {
  const out = []
  for (const m of movs) {
    const fecha = fechaISO(m.fecha)
    const imp = -Number(m.importe)
    const txt = String(m.concepto ?? '')
    if (!fecha || !Number.isFinite(imp) || imp === 0) continue
    const base = { fecha, fuente: 'banco', lector: 'banco', referencia: `banco:${m.id}`, descripcion: txt.slice(0, 200) }
    if (/^Pago de servicios - Imp\.?afip/i.test(txt)) {
      const per = periodoF931PorImporte(imp, f931)
      out.push(pago(per
        ? { ...base, tipo: 'vep', importe: imp, impuesto: 'cargas_sociales', periodo: per, concepto: 'ddjj', imputacion: 'importe' }
        : { ...base, tipo: 'vep', importe: imp, impuesto: null, periodo: null, imputacion: 'sin_imputar' }))
    } else if (/^Debito automatico - (Afip|Arca)/i.test(txt)) {
      // «Afip» hasta agosto de 2026; desde septiembre el banco lo rotula «Arca». Es el mismo débito.
      const esCuota = cuotasPlan.some((c) => Math.abs(c - imp) <= TOLERANCIA_IMPORTE)
      out.push(pago(esCuota
        ? { ...base, tipo: 'debito_automatico', importe: imp, impuesto: 'cargas_sociales', periodo: null, concepto: 'plan de pago', imputacion: 'importe' }
        : { ...base, tipo: 'debito_automatico', importe: imp, impuesto: null, periodo: null, imputacion: 'sin_imputar' }))
    } else if (/Iva percep(cion)? rg 2408/i.test(txt)) {
      out.push(pago({ ...base, tipo: 'percepcion', importe: imp, impuesto: 'iva', periodo: mesDe(fecha), concepto: 'ddjj', imputacion: 'documento' }))
    } else if (/Percep perc rg 5617/i.test(txt)) {
      // RG 5617: percepción sobre consumos en moneda extranjera, a cuenta de Ganancias.
      out.push(pago({ ...base, tipo: 'percepcion', importe: imp, impuesto: 'ganancias', periodo: mesDe(fecha), concepto: 'percepciones', imputacion: 'documento' }))
    } else if (/^(Anul\s+)?imp(uesto)?\.? ley 25\.?413/i.test(txt)) {
      out.push(pago({ ...base, tipo: 'debito_bancario', importe: imp, impuesto: 'impuesto_cheque', periodo: mesDe(fecha), concepto: 'debitos y creditos', imputacion: 'documento' }))
    } else if (/sellos/i.test(txt)) {
      out.push(pago({ ...base, tipo: 'debito_bancario', importe: imp, impuesto: 'sellos', periodo: mesDe(fecha), concepto: 'sellos', imputacion: 'documento' }))
    } else if (/Dgr san juan/i.test(txt)) {
      // Rentas cobra IIBB, automotor e inmobiliario por el mismo canal: el extracto no dice cuál.
      out.push(pago({ ...base, tipo: 'debito_bancario', importe: imp, impuesto: null, periodo: null, imputacion: 'sin_imputar' }))
    } else if (/^Debito debin\b/i.test(txt) && imp > 0) {
      // Un DEBIN a un COBRADOR (PlusPagos) sólo es un pago de IIBB si el importe es EXACTAMENTE el «a pagar»
      // de una DDJJ presentada. Sin esa coincidencia no se registra nada: por la misma plataforma viaja
      // la boleta de UOCRA (gremial, no impuesto), y un «sin imputar» acá la mostraría como impuesto.
      const cobrador = COBRADORES_DEBIN.find((c) => c.cuit === cuitDelDebin(txt))
      const per = cobrador ? periodoIibbPorImporte(imp, iibb) : null
      if (cobrador && per) {
        out.push(pago({ ...base, tipo: 'debin', importe: imp, impuesto: 'iibb', periodo: per, concepto: 'ddjj', imputacion: 'importe',
          contraparte: 'DGR San Juan', detalle: { cobrador: cobrador.nombre, cobrador_cuit: cobrador.cuit, por: 'importe = a pagar de la DDJJ presentada' } }))
      }
    }
  }
  return out
}

const texto = (f) => `${f.concepto ?? ''} ${f.detalle_obra ?? ''}`
export const esCuotaDePlan = (f) => /deuda previ[cs]ional|plan f931/i.test(texto(f))

/**
 * COMPRAS · las filas de ARCA que el dueño cargó como pagadas. Una fila ELIMINADO no es un pago: es su
 * marca de «esto no va» (desde junio el F931 se mudó a «Cargas Sociales» y sus filas quedaron así).
 *
 * Devuelve también las OBLIGACIONES que sólo existen acá: el anticipo de Ganancias y el de acciones y
 * participaciones no tienen DDJJ en Drive; su única evidencia es la carga en Compras, y por eso su
 * fuente es 'manual' y su estado 'pagado' (lo dice la columna de estado de pago, no el OS).
 */
export function pagosDeCompras(filas = [], { f931 = new Map() } = {}) {
  const pagos = []
  const obligaciones = []
  const deArca = filas.filter((f) => /^(arca|afip)$/i.test(String(f.proveedor ?? '').trim()))
  // LOS IMPORTES DE CUOTA SE TOMAN TAMBIÉN DE LAS FILAS ELIMINADO: la cuota 1 del plan W303094 quedó así
  // cuando el F931 se mudó de pestaña, con su importe en «monto pagado». La fila no es un pago, pero
  // sigue siendo la única que dice cuánto vale la cuota que el banco debitó el 18/08.
  const cuotasPlan = deArca.filter(esCuotaDePlan)
    .map((f) => Math.max(Number(f.total) || 0, Number(f.monto_pagado) || 0)).filter((n) => n > 0)
  for (const f of deArca) {
    if (String(f.estado ?? '').trim().toUpperCase() === 'ELIMINADO' || f.anulada) continue
    const imp = Number(f.total)
    const fecha = fechaISO(f.fecha_caja ?? f.fecha)
    if (!fecha || !(imp > 0) || !/pagado/i.test(String(f.estado_pago ?? ''))) continue
    const base = {
      fecha, importe: imp, fuente: 'compras', lector: 'compras', tipo: 'vep',
      referencia: `compras:${fecha}|${texto(f).trim().slice(0, 80)}|${imp.toFixed(2)}`,
      descripcion: texto(f).trim().slice(0, 200) || null, detalle: { fila: f.fila },
    }
    const periodo = mesDe(fecha)
    if (/anticipo de ganancias/i.test(texto(f))) {
      pagos.push(pago({ ...base, impuesto: 'ganancias', periodo, concepto: 'anticipo', imputacion: 'documento' }))
      obligaciones.push(obligacionManual('ganancias', periodo, 'anticipo', imp, texto(f)))
    } else if (/acciones y participaciones/i.test(texto(f))) {
      pagos.push(pago({ ...base, impuesto: 'bienes_personales', periodo, concepto: 'acciones y participaciones', imputacion: 'documento' }))
      obligaciones.push(obligacionManual('bienes_personales', periodo, 'acciones y participaciones', imp, texto(f)))
    } else if (esCuotaDePlan(f)) {
      pagos.push(pago({ ...base, tipo: 'debito_automatico', impuesto: 'cargas_sociales', periodo: null, concepto: 'plan de pago', imputacion: 'documento' }))
    } else {
      const per = periodoF931PorImporte(imp, f931)
      pagos.push(pago(per
        ? { ...base, impuesto: 'cargas_sociales', periodo: per, concepto: 'ddjj', imputacion: 'importe' }
        : { ...base, impuesto: null, periodo: null, imputacion: 'sin_imputar' }))
    }
  }
  return { pagos, obligaciones, cuotasPlan }
}

function obligacionManual(impuesto, periodo, concepto, importe, rotulo) {
  return {
    impuesto, periodo, concepto, fuente: 'manual', lector: 'compras', estado: 'pagado',
    vencimiento: null, vencimiento_confianza: null,
    determinado: c2(importe), base_imponible: null, creditos: null, saldo_favor_anterior: null,
    a_pagar: c2(importe), saldo_a_favor: null, presentada_el: null, comprobante: null,
    documento: `Compras: ${rotulo.trim().slice(0, 80)}`, datos_al: null, detalle: {},
  }
}

/**
 * COBRANZAS · las retenciones que los clientes le practican a la empresa, fila por fila, por la FECHA
 * DE COBRO (cuando se practican). La alícuota se verifica contra su régimen con el mismo control que
 * usa la pestaña: si no encaja, se registra SIN IMPUTAR — puede ser otro impuesto u otro error de carga,
 * y computarla inventaría un crédito fiscal.
 *
 * @param {any[][]} filas Cobranzas desde la fila 5, leídas desde la columna A
 * @param {Record<string,{indice:number}>} cols columnas resueltas por rótulo
 */
export function pagosDeCobranzas(filas = [], cols) {
  const c = exigirColumnas(cols, ['cliente', 'fechaCobro', 'neto', 'iva', ...Object.values(COLUMNAS_RET)], 'pagosDeCobranzas')
  const en = (f, k) => f?.[c[k].indice]
  const out = []
  for (const f of filas) {
    const fecha = fechaISO(en(f, 'fechaCobro'))
    if (!fecha) continue
    const cliente = String(en(f, 'cliente') ?? '').trim()
    const neto = parseMonto(en(f, 'neto'))
    const iva = parseMonto(en(f, 'iva'))
    const comp = String(f?.[cols.comprobante?.indice ?? -1] ?? '').trim()
    for (const [regimen, clave] of Object.entries(COLUMNAS_RET)) {
      const monto = parseMonto(en(f, clave))
      if (!(monto > 0)) continue
      const v = verificarAlicuota(regimen, monto, neto, iva)
      out.push(pago({
        tipo: 'retencion', fecha, importe: monto, fuente: 'cobranzas', lector: 'cobranzas',
        referencia: `cobranzas:${comp || cliente}|${fecha}|${regimen}|${monto.toFixed(2)}`,
        contraparte: cliente || null, descripcion: `Retención ${regimen} sufrida${comp ? ` · ${comp}` : ''}`,
        ...(v.ok
          ? { impuesto: regimen, periodo: mesDe(fecha), concepto: 'ddjj', imputacion: 'documento' }
          : { impuesto: null, periodo: null, imputacion: 'sin_imputar' }),
        detalle: { regimen_columna: regimen, alicuota: v.alicuota === null ? null : Math.round(v.alicuota * 10000) / 10000 },
      }))
    }
  }
  return out
}

/**
 * EL MISMO PAGO VISTO DOS VECES. Compras registra a mano lo que el banco también debita: si el banco
 * tiene un débito del mismo importe (±$1) a tres días o menos, manda el banco —es la evidencia del
 * efecto— y la fila de Compras no se registra.
 */
export function sinPagosRepetidos(pagos = []) {
  const banco = pagos.filter((p) => p.fuente === 'banco')
  return pagos.filter((p) => p.fuente !== 'compras'
    || !banco.some((b) => Math.abs(b.importe - p.importe) <= TOLERANCIA_IMPORTE && diasEntre(b.fecha, p.fecha) <= 3))
}

/**
 * LA DECLARACIÓN A MANO QUE EL BANCO YA PROBÓ. El 17/09/2026 el dueño dijo «lo pagué recién» del IIBB de
 * agosto y quedó una fila `manual` / `declarada` sin extracto; el 18/09 llegó el DEBIN. Las dos filas
 * juntas duplicarían el pago. El débito es la evidencia del efecto: le gana a la palabra, igual que el
 * documento le gana a la declaración en `imputarDeclaradas`.
 * @param {Array<{fuente:string, referencia:string, imputacion?:string, impuesto?:string, periodo?:string, importe:number|string}>} existentes filas de la base
 * @param {object[]} pagos los pagos construidos en esta corrida
 * @returns {string[]} las claves `fuente|referencia` de las declaraciones cubiertas, para borrarlas
 */
export function declaradasCubiertasPorBanco(existentes = [], pagos = []) {
  const banco = pagos.filter((p) => p.fuente === 'banco' && p.impuesto && p.periodo)
  return existentes
    .filter((e) => e.fuente === 'manual' && e.imputacion === 'declarada'
      && banco.some((b) => b.impuesto === e.impuesto && b.periodo === e.periodo && Math.abs(b.importe - Number(e.importe)) <= TOLERANCIA_IMPORTE))
    .map((e) => `${e.fuente}|${e.referencia}`)
}

/** Retenciones y percepciones imputadas a un impuesto, por período. Alimenta los créditos del cálculo. */
export function creditosPorPeriodo(pagos = [], impuesto) {
  const out = {}
  for (const p of pagos) {
    if (p.impuesto !== impuesto || !p.periodo || !['retencion', 'percepcion'].includes(p.tipo)) continue
    out[p.periodo] = c2((out[p.periodo] ?? 0) + p.importe)
  }
  return out
}

/**
 * UNA OBLIGACIÓN CON A PAGAR QUEDA 'pagado' CUANDO LO PAGADO CONTRA ELLA LA CUBRE. Sólo cuenta la plata
 * que salió (VEP y débitos): una retención ya está dentro de sus créditos.
 */
export function conEstadoDePago(obligaciones = [], pagos = []) {
  const clave = (x) => `${x.impuesto}|${x.periodo}|${x.concepto}`
  const pagado = new Map()
  for (const p of pagos) {
    if (!p.impuesto || !p.periodo || !['vep', 'debito_automatico', 'debito_bancario'].includes(p.tipo)) continue
    pagado.set(clave(p), (pagado.get(clave(p)) ?? 0) + p.importe)
  }
  return obligaciones.map((o) => (o.estado !== 'pagado' && o.a_pagar > 0 && (pagado.get(clave(o)) ?? 0) >= o.a_pagar - TOLERANCIA_IMPORTE
    ? { ...o, estado: 'pagado' }
    : o))
}

/**
 * EL IMPUESTO AL CHEQUE Y SELLOS COMO OBLIGACIÓN DEL MES. No tienen DDJJ: el banco los retiene en el
 * momento, así que lo devengado ES lo debitado. Se registran para que el cuadro por período los muestre
 * junto al resto, ya pagados, con el banco como única fuente — y sólo desde donde llega el extracto
 * importado: un mes sin extracto no aparece, no aparece en cero.
 */
export function obligacionesDeDebitosBancarios(pagos = [], { datosAl = null } = {}) {
  const acc = new Map()
  for (const p of pagos) {
    if (p.fuente !== 'banco' || p.tipo !== 'debito_bancario' || !['impuesto_cheque', 'sellos'].includes(p.impuesto)) continue
    const k = `${p.impuesto}|${p.periodo}|${p.concepto}`
    acc.set(k, { impuesto: p.impuesto, periodo: p.periodo, concepto: p.concepto, total: (acc.get(k)?.total ?? 0) + p.importe })
  }
  return [...acc.values()].map((x) => ({
    impuesto: x.impuesto, periodo: x.periodo, concepto: x.concepto, fuente: 'calculo', lector: 'banco', estado: 'pagado',
    vencimiento: null, vencimiento_confianza: null, determinado: c2(x.total), base_imponible: null, creditos: null,
    saldo_favor_anterior: null, a_pagar: c2(Math.max(0, x.total)), saldo_a_favor: null, presentada_el: null, comprobante: null,
    documento: 'banco_movimientos', datos_al: datosAl, detalle: { suma_de_debitos: true },
  }))
}
