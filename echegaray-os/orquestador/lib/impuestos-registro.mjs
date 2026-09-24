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
  // EL VENCIMIENTO IMPRESO EN LA DDJJ MANDA SOBRE LA REGLA SUPUESTA. Agosto 2026: la regla daba 16/09 y la
  // pantalla lo publicaba VENCIDO el 17/09; el formulario (y la agenda del contador) dicen 21/09/2026.
  const vencimientoDeLaDDJJ = (d) => {
    const impreso = isoDeAR(d.fecha_vencimiento)
    return impreso ? { vencimiento: impreso, vencimiento_confianza: 'verificado' } : venc(vencimientoIibb(d.periodo))
  }
  return ddjjs.filter((d) => periodoOk(d?.periodo)).map((d) => {
    const neto = (d.saldo_favor_anterior ?? 0) + (d.retenciones ?? 0) - (d.impuesto_determinado ?? 0)
    return {
      impuesto: 'iibb', periodo: d.periodo, concepto: 'ddjj', fuente: 'ddjj_contador', lector: 'ddjj_iibb_pdf',
      estado: 'presentado', ...vencimientoDeLaDDJJ(d),
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
 * GANANCIAS SOCIEDADES · la DDJJ anual (F.713), una fila por ejercicio en el MES DE CIERRE.
 *
 * `creditos` es todo lo que el formulario aplica contra el determinado: anticipos cancelados con el
 * impuesto al cheque, el cómputo del impuesto al cheque para cancelar la DDJJ, retenciones y percepciones
 * y anticipos en efectivo. El a pagar es el «Total a pagar» del formulario (R6 d) y el saldo a favor su
 * «Saldo a favor» (R5 af): se toman impresos, no recalculados — ARCA redondea $0,01 que no se paga.
 * Sin vencimiento: ya está presentada y no deja nada que pagar; los ANTICIPOS del ejercicio siguiente
 * no salen de este papel y no se inventan acá.
 */
export function obligacionesGananciasDDJJ(ddjjs = []) {
  return ddjjs.filter((d) => periodoOk(d?.periodo) && d.determinado !== null).map((d) => ({
    impuesto: 'ganancias', periodo: d.periodo, concepto: 'ddjj anual', fuente: 'ddjj_contador', lector: 'ddjj_ganancias_pdf',
    estado: 'presentado', vencimiento: null, vencimiento_confianza: null,
    determinado: c2(d.determinado), base_imponible: null,
    creditos: c2((d.anticipos_credeb ?? 0) + (d.computo_credeb ?? 0) + (d.retenciones ?? 0) + (d.anticipos_efectivo ?? 0)),
    saldo_favor_anterior: c2(d.saldo_favor_anterior), a_pagar: c2(d.total_a_pagar), saldo_a_favor: c2(d.saldo_a_favor),
    presentada_el: isoDeAR(d.fecha_presentacion), comprobante: d.transaccion ?? null,
    documento: d.fuente ?? null, datos_al: finDeMes(d.periodo),
    detalle: {
      periodo_fiscal: d.periodo_fiscal, mes_cierre: d.mes_cierre, anticipos_credeb: c2(d.anticipos_credeb),
      computo_credeb: c2(d.computo_credeb), retenciones: c2(d.retenciones), anticipos_efectivo: c2(d.anticipos_efectivo),
      drive_id: d.drive_id ?? null,
    },
  }))
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

// ═══ LA CUOTA DEL PRENDARIO — «A PAGAR EN 30 DÍAS» TIENE UNA SOLA DEFINICIÓN (dueño, 24/09/2026) ═══
//
// La pestaña «Impuestos y Financieros» suma la cuota del prendario Ford a «A pagar en 30 días» y la app
// no la tenía: el mismo titular daba dos números. No es un impuesto, pero es una salida con fecha que el
// dueño decidió ver en el mismo total. Se calcula IGUAL que el Libro (`dePrendarioFuturo`): el importe
// es el del ÚLTIMO débito real del extracto (la cuota es variable, UVA/tasa: escribir un número fijo
// sería fabricarlo) y el cronograma —día de débito y última cuota— sale de `datos/prestamo-prendario.json`.
// Se emiten sólo las cuotas FUTURAS: la pagada la prueba el extracto.
/**
 * @param {Array<{fecha:string|Date, concepto:string, importe:number|string}>} banco banco_movimientos
 * @param {{dia_de_debito:number, ultima_cuota:{periodo:string}, concepto_en_el_extracto:string}} plan
 * @param {{datosAl?:string|null}} [o]
 */
export function obligacionesPrendario(banco = [], plan = null, { datosAl = null } = {}) {
  if (!plan?.dia_de_debito || !plan?.ultima_cuota?.periodo || !plan?.concepto_en_el_extracto) return []
  const prefijo = String(plan.concepto_en_el_extracto).split(' - ')[0].trim().toLowerCase()
  const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10))
  const reales = banco
    .filter((m) => String(m.concepto ?? '').trim().toLowerCase().startsWith(prefijo) && Number(m.importe) < 0)
    .sort((a, b) => iso(a.fecha).localeCompare(iso(b.fecha)))
  const ultimo = reales.at(-1)
  if (!ultimo) return []
  const cuota = c2(Math.abs(Number(ultimo.importe)))
  const out = []
  let [anio, mes] = iso(ultimo.fecha).slice(0, 7).split('-').map(Number)
  mes += 1
  if (mes > 12) { mes = 1; anio += 1 }
  const fin = plan.ultima_cuota.periodo
  for (let p = `${anio}-${String(mes).padStart(2, '0')}`; p <= fin;) {
    out.push({
      impuesto: 'prendario', periodo: p, concepto: 'cuota', fuente: 'calculo', lector: 'banco',
      estado: 'estimado', vencimiento: `${p}-${String(plan.dia_de_debito).padStart(2, '0')}`, vencimiento_confianza: 'supuesto',
      determinado: cuota, base_imponible: null, creditos: null, saldo_favor_anterior: null,
      a_pagar: cuota, saldo_a_favor: null, presentada_el: null, comprobante: null,
      documento: 'banco_movimientos · prestamo-prendario.json', datos_al: datosAl,
      detalle: { importe_del_debito_del: iso(ultimo.fecha), dia_de_debito: plan.dia_de_debito, ultima_cuota: fin },
    })
    mes += 1
    if (mes > 12) { mes = 1; anio += 1 }
    p = `${anio}-${String(mes).padStart(2, '0')}`
  }
  return out
}

// ═══ LA PROYECCIÓN A FIN DE MES — LA COPIA DE LA PESTAÑA, APARTE DE LO REGISTRADO (24/09/2026) ═══
//
// Lo registrado lo calcula esta base (ARCA, banco, DDJJ). La PROYECCIÓN del mes entero la calcula la
// pestaña —es la que tiene el Libro y las facturas por emitir de Cobranzas— y acá se COPIA, rotulada
// `concepto = 'proyección a fin de mes'`, sin vencimiento: no es una deuda, es una estimación. Así la
// app muestra el mismo número que la hoja, y no una segunda cuenta que pueda diferir.
export const CONCEPTO_PROYECCION = 'proyección a fin de mes'

/**
 * @param {any[][]} filas la pestaña «Impuestos y Financieros» entera, UNFORMATTED_VALUE
 * @param {{iva:string, iibb:string, cheque:string}} rotulos los rótulos de las tres filas de la sección 7
 * @param {string} hoy YYYY-MM-DD — define el mes en curso (columna B = enero)
 */
export function obligacionesProyeccion(filas = [], rotulos, hoy) {
  const anio = Number(String(hoy).slice(0, 4))
  const m = Number(String(hoy).slice(5, 7))
  const titulo = String(filas?.[0]?.[0] ?? '')
  if (!/impuestos y financieros/i.test(titulo)) throw new Error('obligacionesProyeccion: la lectura no es «Impuestos y Financieros»')
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const fila = (rotulo) => {
    const i = filas.findIndex((f) => norm(f?.[0]) === norm(rotulo))
    return i < 0 ? null : i
  }
  const periodo = `${anio}-${String(m).padStart(2, '0')}`
  const out = []
  for (const [impuesto, rotulo] of [['iva', rotulos.iva], ['iibb', rotulos.iibb], ['impuesto_cheque', rotulos.cheque]]) {
    const i = fila(rotulo)
    if (i === null) throw new Error(`obligacionesProyeccion: no encontré la fila «${rotulo}» en la pestaña`)
    const v = filas[i]?.[m]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    out.push({
      impuesto, periodo, concepto: CONCEPTO_PROYECCION, fuente: 'calculo', lector: 'hoja_impuestos',
      estado: 'estimado', vencimiento: null, vencimiento_confianza: null,
      determinado: c2(Math.max(0, v)), base_imponible: null, creditos: null, saldo_favor_anterior: null,
      a_pagar: c2(Math.max(0, v)), saldo_a_favor: null, presentada_el: null, comprobante: null,
      documento: `Impuestos y Financieros!${String.fromCharCode(65 + m)}${i + 1}`, datos_al: hoy,
      detalle: { proyeccion: true, celda: `${String.fromCharCode(65 + m)}${i + 1}` },
    })
  }
  return out
}
