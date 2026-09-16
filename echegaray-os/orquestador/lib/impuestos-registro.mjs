// LO DEVENGADO DE CADA IMPUESTO, TRADUCIDO DE LAS FUENTES QUE YA EXISTEN A FILAS DE POSTGRES.
//
// NÚCLEO PURO. No lee Drive, ni el Sheet, ni la base: recibe lo que ya leyeron los lectores de
// siempre (`iva-ddjj.mjs`, `iibb-ddjj.mjs`, `_F931_RAW`, `comprobantes_arca`) y devuelve filas de
// `public.impuesto_obligacion`. El que escribe es `scripts/impuestos-a-postgres.mjs`.
//
// ═══ POR QUÉ NO SE REESCRIBE NINGÚN PARSER ═══
//
// La DDJJ de IVA y la de IIBB ya se leen del PDF para la pestaña «Impuestos y Financieros» desde julio,
// con tests contra los PDF reales. Un segundo parser haría dos lecturas del mismo papel que pueden
// discrepar en silencio: acá se toma su salida tal cual.
//
// ═══ NULL NO ES CERO ═══
//
// Cuando el saldo a favor del mes anterior no se conoce, el IVA a pagar NO se puede saber: vale null,
// no 0. Cero es «no hay que pagar»; null es «no sé». La pantalla dibuja los dos distinto.

import { vencimientoIva, vencimientoIibb } from './vencimientos-fiscales.mjs'
import { sinComprobantesRepetidos } from './arca-duplicados.mjs'
import { signo } from './comprobante-arca.mjs'
import { alicuotaDeclarada } from './iibb-ddjj.mjs'

/** Centavos: numeric(16,2) no guarda más, y comparar dos corridas exige el mismo redondeo. */
export const c2 = (n) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? null : Math.round(Number(n) * 100) / 100)

/** 'YYYY-MM' → último día del mes 'YYYY-MM-DD'. Sin Date local: la zona horaria ya corrió fechas. */
export function finDeMes(periodo) {
  const a = Number(periodo.slice(0, 4)); const m = Number(periodo.slice(5, 7))
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

/** 'dd/mm/yyyy' → 'yyyy-mm-dd', o null si no tiene esa forma. */
export function isoDeAR(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const venc = (v) => ({ vencimiento: v.fecha, vencimiento_confianza: v.confianza })
const periodoOk = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p ?? ''))

/**
 * IVA · la F.2051 presentada. `saldo_a_favor` es la LIBRE DISPONIBILIDAD: es lo que la empresa puede
 * usar contra otros impuestos y lo que publica el hero de la pestaña. El saldo TÉCNICO a favor (sólo
 * sirve contra IVA futuro) viaja en `detalle` para no sumar dos saldos de naturaleza distinta.
 */
export function obligacionesIvaDDJJ(ddjjs = []) {
  return ddjjs.filter((d) => periodoOk(d?.periodo)).map((d) => ({
    impuesto: 'iva', periodo: d.periodo, concepto: 'ddjj', fuente: 'ddjj_contador', lector: 'ddjj_iva_pdf',
    estado: 'presentado', ...venc(vencimientoIva(d.periodo)),
    determinado: c2(d.debito - d.credito), base_imponible: null,
    creditos: c2(d.retenciones_percep), saldo_favor_anterior: c2(d.libre_disp_anterior),
    a_pagar: c2(d.a_pagar_efectivo), saldo_a_favor: c2(d.libre_disp),
    presentada_el: isoDeAR(d.fecha_presentacion), comprobante: d.nro_transaccion ?? null,
    documento: d.fuente ?? null, datos_al: finDeMes(d.periodo),
    detalle: {
      debito: c2(d.debito), credito: c2(d.credito), saldo_tecnico_anterior: c2(d.saldo_tecnico_anterior),
      saldo_tecnico_a_favor: c2(d.saldo_contrib), saldo_tecnico_a_favor_arca: c2(d.saldo_arca),
    },
  }))
}

/**
 * IIBB San Juan · la DDJJ de Rentas.
 *
 * EL A PAGAR Y EL SALDO SE CALCULAN CON LOS CAMPOS DEL FORMULARIO, NO CON `a_ingresar` NI `a_favor`
 * del parser. Leído el PDF de agosto (presentado 15/09/2026): «Subtotal Impuesto $ 432.764,90» y
 * «Monto a Ingresar $ -», con el importe impreso más abajo; el parser devuelve `a_ingresar: 0` y
 * `a_favor: true` (el rótulo «A favor del Contribuyente» se imprime siempre). En julio devolvía como
 * «a ingresar» los $19.073,19 que eran saldo A FAVOR. La cuenta del formulario es
 * determinado − retenciones − saldo anterior = subtotal, y da 432.764,90 en agosto y −19.073,19 en
 * julio: exactamente lo impreso. No cubre «Pagos del Anticipo» ni «Otros créditos», que hoy vienen en
 * «-»; si algún mes traen importe, el a pagar sale de más y `detalle.a_pagar_calculado` lo avisa.
 */
export function obligacionesIibbDDJJ(ddjjs = []) {
  return ddjjs.filter((d) => periodoOk(d?.periodo)).map((d) => {
    const neto = (d.saldo_favor_anterior ?? 0) + (d.retenciones ?? 0) - (d.impuesto_determinado ?? 0)
    return {
      impuesto: 'iibb', periodo: d.periodo, concepto: 'ddjj', fuente: 'ddjj_contador', lector: 'ddjj_iibb_pdf',
      estado: 'presentado', ...venc(vencimientoIibb(d.periodo)),
      determinado: c2(d.impuesto_determinado), base_imponible: c2(d.base_total),
      creditos: c2(d.retenciones), saldo_favor_anterior: c2(d.saldo_favor_anterior),
      a_pagar: c2(Math.max(0, -neto)), saldo_a_favor: c2(Math.max(0, neto)),
      presentada_el: isoDeAR(d.fecha_presentacion), comprobante: d.nro_control ?? null,
      documento: d.fuente ?? null, datos_al: finDeMes(d.periodo),
      detalle: { alicuota: d.alicuota ?? null, a_pagar_calculado: true },
    }
  })
}

/**
 * F931 · desde la réplica `_F931_RAW` (período · código · concepto · monto · empleados · remuneración),
 * que lee los PDF presentados. Se suma por período: el VEP paga el total, no código por código.
 * Sin vencimiento: el OS no tiene tabla verificada del F931 y no se inventa.
 */
export function obligacionesF931(filas = [], { documento = '_F931_RAW' } = {}) {
  const porPeriodo = new Map()
  for (const f of filas) {
    const periodo = String(f?.[0] ?? '').replace(/^'/, '').trim()
    const monto = Number(f?.[3])
    if (!periodoOk(periodo) || !Number.isFinite(monto) || monto === 0) continue
    const p = porPeriodo.get(periodo) ?? { total: 0, codigos: {}, empleados: null, remuneracion: null }
    p.total += monto
    p.codigos[String(f?.[1] ?? '').trim()] = c2(monto)
    if (Number.isFinite(Number(f?.[4]))) p.empleados = Number(f[4])
    if (Number.isFinite(Number(f?.[5]))) p.remuneracion = c2(f[5])
    porPeriodo.set(periodo, p)
  }
  return [...porPeriodo].map(([periodo, p]) => ({
    impuesto: 'cargas_sociales', periodo, concepto: 'ddjj', fuente: 'ddjj_contador', lector: 'f931_raw',
    estado: 'presentado', vencimiento: null, vencimiento_confianza: null,
    determinado: c2(p.total), base_imponible: p.remuneracion, creditos: null, saldo_favor_anterior: null,
    a_pagar: c2(p.total), saldo_a_favor: null, presentada_el: null, comprobante: null,
    documento, datos_al: finDeMes(periodo),
    detalle: { codigos: p.codigos, empleados: p.empleados },
  }))
}

/**
 * EL LIBRO DE ARCA POR PERÍODO, SIN REPETIDOS Y CON SIGNO.
 *
 * Se deduplica ANTES de sumar (la réplica trae el mismo comprobante en varias descargas: junio tiene 148
 * filas de compras y 85 comprobantes distintos). Ventas con `emisorUnico`: el emisor es la empresa.
 * Un tipo de comprobante sin signo conocido se APARTA y se cuenta — no se adivina si suma o resta.
 */
export function libroPorPeriodo(filas = []) {
  const ventas = sinComprobantesRepetidos(filas.filter((f) => f.tipo_libro === 'E'), { emisorUnico: true })
  const compras = sinComprobantesRepetidos(filas.filter((f) => f.tipo_libro === 'R'))
  const out = new Map()
  const de = (p) => out.get(p) ?? { debito: 0, credito: 0, neto_ventas: 0, n_ventas: 0, n_compras: 0, apartados: 0 }
  for (const [lista, esVenta] of [[ventas, true], [compras, false]]) {
    for (const f of lista) {
      if (!periodoOk(f.periodo)) continue
      const s = signo(f.tipo_comprobante)
      const acc = de(f.periodo)
      if (s === null) { acc.apartados++; out.set(f.periodo, acc); continue }
      if (esVenta) { acc.debito += s * Number(f.total_iva ?? 0); acc.neto_ventas += s * Number(f.neto_gravado ?? 0); acc.n_ventas++ } else { acc.credito += s * Number(f.total_iva ?? 0); acc.n_compras++ }
      out.set(f.periodo, acc)
    }
  }
  return out
}

/** ¿El período todavía no terminó en la fuente? ARCA al 04/09 no tiene septiembre entero. */
const esParcial = (periodo, datosAl) => Boolean(datosAl) && datosAl < finDeMes(periodo)

/**
 * IVA · CÁLCULO sobre ARCA para los meses SIN F.2051. El saldo arranca de la última DDJJ (su libre
 * disponibilidad) y se arrastra; sin DDJJ previa el saldo no se conoce y el a pagar queda null.
 *
 * Los créditos son las retenciones de IVA sufridas (Cobranzas, por fecha de cobro) y las percepciones
 * de IVA del banco: las dos se computan en la DDJJ y las dos ya son plata que salió.
 *
 * @param {{libro: Map, ddjjs: object[], creditos: Record<string, number>, datosAl: string|null}} p
 */
export function obligacionesIvaCalculadas({ libro, ddjjs = [], creditos = {}, datosAl = null }) {
  const conDDJJ = new Map(ddjjs.filter((d) => periodoOk(d?.periodo)).map((d) => [d.periodo, d]))
  const periodos = [...new Set([...libro.keys(), ...conDDJJ.keys()])].sort()
  const out = []
  let saldo = null
  for (const periodo of periodos) {
    const dj = conDDJJ.get(periodo)
    if (dj) { saldo = Number(dj.libre_disp ?? 0); continue }
    const l = libro.get(periodo)
    if (!l) continue
    const det = l.debito - l.credito
    const cred = Number(creditos[periodo] ?? 0)
    const conocido = saldo !== null
    const neto = det - cred - (saldo ?? 0)
    out.push({
      impuesto: 'iva', periodo, concepto: 'ddjj', fuente: 'calculo', lector: 'arca_iva',
      estado: 'estimado', ...venc(vencimientoIva(periodo)),
      determinado: c2(det), base_imponible: null, creditos: c2(cred), saldo_favor_anterior: c2(saldo),
      a_pagar: conocido ? c2(Math.max(0, neto)) : null,
      saldo_a_favor: conocido ? c2(Math.max(0, -neto)) : null,
      presentada_el: null, comprobante: null, documento: 'comprobantes_arca', datos_al: datosAl,
      detalle: {
        debito: c2(l.debito), credito: c2(l.credito), n_ventas: l.n_ventas, n_compras: l.n_compras,
        tipos_apartados: l.apartados, parcial: esParcial(periodo, datosAl),
      },
    })
    saldo = conocido ? Math.max(0, -neto) : null
  }
  return out
}

/**
 * IIBB · ESTIMADO para los meses sin DDJJ de Rentas: ventas netas de ARCA × la alícuota que la empresa
 * declaró en su última DDJJ con base. Los créditos conocidos son sólo las retenciones de IIBB de
 * Cobranzas: SIRCREB y percepciones no se ven hasta la DDJJ, así que el a pagar es un TECHO, no el
 * número — y queda dicho en `detalle.creditos_parciales`.
 */
export function obligacionesIibbEstimadas({ libro, ddjjs = [], creditos = {}, datosAl = null }) {
  const ordenadas = ddjjs.filter((d) => periodoOk(d?.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo))
  const ultima = ordenadas.at(-1)
  if (!ultima) return []
  const conBase = [...ordenadas].reverse().find((d) => (d.actividades ?? []).length)
  const alic = conBase ? alicuotaDeclarada([conBase]).alicuota : null
  if (alic === null) return []
  const out = []
  let saldo = Math.max(0, (ultima.saldo_favor_anterior ?? 0) + (ultima.retenciones ?? 0) - (ultima.impuesto_determinado ?? 0))
  for (const periodo of [...libro.keys()].filter((p) => p > ultima.periodo).sort()) {
    const base = libro.get(periodo).neto_ventas
    const det = base * alic
    const cred = Number(creditos[periodo] ?? 0)
    const neto = det - cred - saldo
    out.push({
      impuesto: 'iibb', periodo, concepto: 'ddjj', fuente: 'calculo', lector: 'arca_iibb',
      estado: 'estimado', ...venc(vencimientoIibb(periodo)),
      determinado: c2(det), base_imponible: c2(base), creditos: c2(cred), saldo_favor_anterior: c2(saldo),
      a_pagar: c2(Math.max(0, neto)), saldo_a_favor: c2(Math.max(0, -neto)),
      presentada_el: null, comprobante: null, documento: 'comprobantes_arca', datos_al: datosAl,
      detalle: { alicuota: alic, alicuota_de: conBase.periodo, creditos_parciales: true, parcial: esParcial(periodo, datosAl) },
    })
    saldo = Math.max(0, -neto)
  }
  return out
}
