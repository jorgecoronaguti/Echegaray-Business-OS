#!/usr/bin/env node
// Rehace "Impuestos y Financieros" con el IVA REAL de ARCA, y deja el hueco de IIBB a la vista.
//
// LO QUE APARECIÓ AL MIRARLO (20/07), y es lo importante de esta pestaña:
//   · En Compras no hay UNA SOLA fila de IVA ni de IIBB. Los $9.835.877 que figuraban como
//     "Impuestos" eran planes de pago de deuda previsional mal clasificados. El impuesto que más
//     plata mueve estaba íntegramente fuera del cash flow.
//   · ARCA tiene 459 comprobantes cargados. Con ellos, la empresa pagó $11.070.680 de IVA en marzo
//     y hoy tiene $7.467.318 de saldo técnico A FAVOR que no se ve en ningún lado.
//   · De IIBB no hay ni pagos cargados ni alícuota conocida. No se la invento: queda una celda para
//     que la complete el contador y todo el bloque se calcula solo a partir de ahí.
//
// DE DÓNDE SALE CADA NÚMERO. El IVA no puede ser una fórmula del Sheet: sale de los comprobantes de
// ARCA que viven en Supabase. Se escribe como VALOR, pero con la cantidad de comprobantes de cada
// mes al lado — un número trazable, no un número suelto. Lo demás (planes de pago, financiero) sí es
// fórmula contra Compras.
//
//   node orquestador/scripts/impuestos-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { posicionIvaCompleta } from '../lib/posicion-iva.mjs'
import { clasificar, mes as mesDe, COLUMNAS } from '../lib/retenciones-sufridas.mjs'
import { query } from '../lib/db.mjs'
import { parsearDDJJ, alicuotaDeclarada } from '../lib/iibb-ddjj.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { seccion, sub as subItem, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Impuestos y Financieros'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const ANCHO = 15
/** Los doce meses. La grilla es la misma que la de Cargas Sociales: enero es SIEMPRE la columna B. */
const M12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
/** La columna del mes N. */
const cmes = (m) => String.fromCharCode(65 + m)
// Las DDJJ de IIBB de San Juan viven en una CARPETA de Drive (la compartió el dueño). Se LISTA la
// carpeta y se leen los PDF originales: son la fuente primaria (traen N° de control y fecha de
// presentación) y, al listar en vez de hardcodear, el mes nuevo aparece solo cuando se sube.
// Carpeta: .../Impuestos y Financiero/2026/IIBB
const CARPETA_IIBB = '1R0kTgCE35Q6AlLhjr0VB2ZAtusK1eO1W'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Las ventas ya facturadas o proyectadas por mes, para proyectar el débito fiscal. */
async function ventasProyectadas(google) {
  // Sale de Cobranzas: monto NETO (columna J) por mes de emisión (columna C). Es la mejor
  // estimación de facturación futura que tiene la empresa, y ya está cargada — no hay que inventarla.
  const v = await google.readSheetValues(ID, 'Cobranzas!C5:J200')
  const out = {}
  for (const f of v) {
    const fecha = String(f?.[0] ?? '').trim()
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha)
    if (!m) continue
    const per = `${m[3]}-${String(m[2]).padStart(2, '0')}`
    const neto = parseFloat(String(f?.[7] ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
    out[per] = (out[per] ?? 0) + neto
  }
  return out
}

async function planesDePago() {
  // Los planes viven en Compras con el rubro "Deuda previsional (planes de pago)". Se agrupan por
  // plan mirando el texto: son tres ("931 Dic 25", "931 Enero 26", "Plan F931 W303094").
  const r = await query(`
    select concepto, total, fecha_pago
      from public.costos_obra
     where origen = 'compras_sheet'
       and concepto ~* 'deuda previcional|deuda previsional|plan f931'
     order by fecha_pago`)
  const planes = new Map()
  for (const x of r.rows) {
    const c = String(x.concepto ?? '')
    const nombre = /w303094/i.test(c) ? 'Plan F931 W303094 (financiación junio)'
      : /dic\s*25/i.test(c) ? 'Deuda previsional F931 Diciembre 2025'
        : /enero\s*26/i.test(c) ? 'Deuda previsional F931 Enero 2026'
          : 'Otro plan'
    const p = planes.get(nombre) ?? { nombre, cuotas: 0, total: 0, primera: null, ultima: null, monto_cuota: 0 }
    p.cuotas++
    p.total += Number(x.total) || 0
    const f = x.fecha_pago ? new Date(x.fecha_pago).toISOString().slice(0, 10) : null
    if (f && (!p.primera || f < p.primera)) p.primera = f
    if (f && (!p.ultima || f > p.ultima)) p.ultima = f
    p.monto_cuota = Math.round(p.total / p.cuotas)
    // Cuánto cae en cada mes de ESTE año: es lo que permite ponerlas en la misma grilla mensual que
    // todo el resto de la pestaña, en vez de en una tablita aparte con sus propias columnas.
    if (f && Number(f.slice(0, 4)) === AÑO) {
      const mm = Number(f.slice(5, 7))
      p.porMes = p.porMes ?? Array(13).fill(0)
      p.porMes[mm] += Number(x.total) || 0
    }
    planes.set(nombre, p)
  }
  return [...planes.values()].map((p) => ({ ...p, porMes: p.porMes ?? Array(13).fill(0) })).sort((a, b) => b.total - a.total)
}

/**
 * NÚCLEO PURO: arma la pestaña entera sobre UNA espina de doce meses.
 *
 * POR QUÉ CAMBIÓ (23/07). El dueño: "el diseño está totalmente descuadrado, no se entiende la
 * información". Y era literal: la pestaña apilaba CINCO formas de tabla distintas —el IVA con seis
 * columnas, las retenciones con dos, los planes con nueve—, así que cada cuadro empezaba y terminaba
 * en una columna distinta del de arriba y el ojo tenía que recalibrar en cada bloque.
 *
 * La grilla es ahora la misma que la de Cargas Sociales: A el concepto, B a M los doce meses, N el
 * total, O de dónde sale. Las FILAS son las medidas y las COLUMNAS el tiempo — que es como se lee
 * cualquier cuadro fiscal— y todos los bloques quedan alineados uno debajo del otro.
 */
function grilla(iva, planes, iibb) {
  const filas = []
  const push = (c = []) => {
    const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
    while (r.length < ANCHO) r.push(VACIO)
    filas.push(r); return filas.length
  }
  /** Una fila de la grilla mensual: rótulo, doce meses, total y origen. */
  const mensual = (rotulo, celda, origen, { meses = M12, totaliza = true } = {}) => {
    const f = filas.length + 1
    return push([rotulo, ...M12.map((m) => (meses.includes(m) ? celda(m) : VACIO)),
      totaliza ? `=SUM($B${f}:$M${f})` : VACIO, origen])
  }
  const cabecera = () => push(['Concepto', ...MES.map((m) => `'${m}-${String(AÑO).slice(2)}`), 'Total', 'De dónde sale'])
  const hoy = new Date().toISOString().slice(0, 10)

  push(['Impuestos y financiero'])
  push([`Qué se le debe al fisco, qué está inmovilizado y qué se debe con instrumento · IVA de ARCA · IIBB y F931 de las DDJJ de Rentas (Drive) · prendario del extracto Santander · retenciones de Cobranzas · al ${hoy}`])
  push()
  // EL HERO se RESERVA acá y se llena al final con referencias a las celdas de los bloques de abajo
  // —ni un número pegado—. Es lo primero que se ve: la posición, con su origen al lado.
  const heroBase = filas.length
  for (let k = 0; k < 10; k++) push()

  // ── 1 · IVA ────────────────────────────────────────────────────────────────────────────────────
  push([seccion(1, 'IVA — ¿cuánto se debe o se tiene a favor cada mes?')])
  cabecera()
  const R = '_ARCA_RAW'
  // El signo sale de la columna F de la réplica: una nota de crédito lleva −1 y una factura +1. Si
  // el código no se reconoce, la columna queda vacía y la fila NO se suma — asumir que sumaba fue el
  // error que costó $41,9M.
  const sumaArca = (per, libro, colImporte) =>
    `SUMPRODUCT((${R}!$A$4:$A="${per}")*(${R}!$B$4:$B="${libro}")`
    + `*IF(ISNUMBER(${R}!$F$4:$F);${R}!$F$4:$F;0)`
    + `*IF(ISNUMBER(${R}!$${colImporte}$4:$${colImporte});${R}!$${colImporte}$4:$${colImporte};0))`
  // El factor de inflación NO se pega: se busca en el bloque "ÍNDICES PARA PROYECTAR" de Parámetros,
  // que declara su fuente (REM del BCRA). Es el mismo que ya usan Estructura y Recurrentes.
  const factor = (mes) => `IFERROR(INDEX(Parámetros!$C$74:$C$79;MATCH(DATE(${AÑO};${mes};1);Parámetros!$A$74:$A$79;0));1)`
  const porMesIva = new Map(iva.map((m) => [Number(m.periodo.slice(5, 7)), m]))
  const reales = M12.filter((m) => porMesIva.get(m)?.disponible)
  const proyectados = M12.filter((m) => porMesIva.get(m)?.es_proyeccion && !porMesIva.get(m)?.disponible)
  const conDato = [...reales, ...proyectados].sort((a, b) => a - b)
  const ultReal = reales[reales.length - 1]

  const fPos = filas.length + 1
  const fRet = fPos + 1
  // (fPos + 2 es la fila "a pagar": no hace falta nombrarla, nadie la referencia)
  const fSaldo = fPos + 3
  // El saldo a favor que venía es el que quedó el mes anterior. Para el primer mes con dato, cero.
  const previo = (m) => (m === conDato[0] ? '0' : `${cmes(m - 1)}${fSaldo}`)

  mensual('Posición del mes (ventas − compras)', (m) => (porMesIva.get(m)?.disponible
    ? `=${sumaArca(porMesIva.get(m).periodo, 'Ventas', 'L')}-${sumaArca(porMesIva.get(m).periodo, 'Compras', 'L')}`
    // Proyección: el ritmo real de los meses ya cerrados, ajustado por inflación.
    : `=AVERAGE($B$${fPos}:$${cmes(ultReal)}$${fPos})*${factor(m)}`),
  'ARCA · réplica _ARCA_RAW. Débito menos crédito fiscal del mes, con el signo de cada comprobante.', { meses: conDato })
  mensual('Retención de IVA sufrida', (m) =>
    `=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q$400)=${AÑO})*(MONTH(Cobranzas!$Q$5:$Q$400)=${m})*IF(ISNUMBER(Cobranzas!$X$5:$X$400);Cobranzas!$X$5:$X$400;0))`,
  'Cobranzas · imputada al mes del COBRO, no al de la factura. Es impuesto ya pagado.', { meses: conDato })
  mensual(rotuloTotal('IVA a pagar en el mes'), (m) => `=MAX(0;${cmes(m)}${fPos}-${cmes(m)}${fRet}-${previo(m)})`,
    'Primero se descuenta lo pagado por retención y recién después el saldo a favor que venía arrastrándose.', { meses: conDato })
  mensual('Saldo a favor al cierre del mes', (m) => `=MAX(0;${previo(m)}+${cmes(m)}${fRet}-${cmes(m)}${fPos})`,
    'No se suma a lo largo del año: es un saldo, se arrastra. El total no aplica.', { meses: conDato, totaliza: false })
  mensual('Comprobantes cargados (ventas / compras)', (m) => (porMesIva.get(m)?.disponible
    ? `=COUNTIFS(${R}!$A$4:$A;"${porMesIva.get(m).periodo}";${R}!$B$4:$B;"Ventas")&" / "&COUNTIFS(${R}!$A$4:$A;"${porMesIva.get(m).periodo}";${R}!$B$4:$B;"Compras")`
    : 'proy.'), 'Cuántos comprobantes respaldan la cifra de arriba. "proy." = no hay comprobantes, es una proyección.', { meses: conDato, totaliza: false })
  push()

  // ── 2 · INGRESOS BRUTOS ────────────────────────────────────────────────────────────────────────
  push([seccion(2, 'Ingresos Brutos San Juan — ¿cuánto se debe cada mes?')])
  cabecera()
  const porMesIIBB = new Map(iibb.map((d) => [Number(String(d.periodo ?? '').slice(5, 7)), d]))
  const mesesIIBB = M12.filter((m) => porMesIIBB.has(m))
  const al = alicuotaDeclarada(iibb)
  const fBase = filas.length + 1
  const fAli = fBase + 1
  const fImp = fBase + 2
  const fRetI = fBase + 3
  // (fBase + 4 es la fila "a pagar" de IIBB: nadie la referencia)
  const fSaldoI = fBase + 5
  const prevI = (m) => (m === mesesIIBB[0]
    ? Math.round(porMesIIBB.get(m)?.saldo_favor_anterior ?? 0) : `${cmes(m - 1)}${fSaldoI}`)

  mensual('Base imponible declarada', (m) => Math.round(porMesIIBB.get(m).base_total),
    'Leída del PDF de la DDJJ de Rentas (carpeta de Drive): aparece sola cuando se sube el mes nuevo.', { meses: mesesIIBB })
  // LA ALÍCUOTA POR MES, NO UNA CONSTANTE ENTERRADA. Si Rentas cambia la alícuota de la actividad a
  // mitad de año, se corrige el mes que corresponde y todo lo de abajo se recalcula solo.
  mensual('Alícuota de la actividad', () => (al.alicuota ?? ''),
    'Declarada para construcción. Es un parámetro: se edita acá y el impuesto se recalcula.', { meses: mesesIIBB, totaliza: false })
  mensual('Impuesto determinado', (m) => `=${cmes(m)}${fBase}*${cmes(m)}${fAli}`, 'Base × alícuota.', { meses: mesesIIBB })
  mensual('Retenciones sufridas', (m) => Math.round(porMesIIBB.get(m).retenciones),
    'De la misma DDJJ. Ya vienen computadas ahí: no se vuelven a sumar en la sección 3.', { meses: mesesIIBB })
  mensual(rotuloTotal('IIBB a pagar en el mes'), (m) => `=MAX(0;${cmes(m)}${fImp}-${cmes(m)}${fRetI}-${prevI(m)})`,
    'Impuesto menos retenciones menos el saldo a favor que venía.', { meses: mesesIIBB })
  mensual('Saldo a favor al cierre del mes', (m) => `=MAX(0;${prevI(m)}+${cmes(m)}${fRetI}-${cmes(m)}${fImp})`,
    'Se arrastra al mes siguiente. El total no aplica.', { meses: mesesIIBB, totaliza: false })
  push()

  // ── 3 · RETENCIONES SUFRIDAS ───────────────────────────────────────────────────────────────────
  // No estaban en ningún lado del archivo. Una retención es impuesto YA PAGADO: sin computarla, el
  // cuadro muestra un "a pagar" inflado y el cash flow proyecta una salida que no va a ocurrir.
  push([seccion(3, 'Retenciones sufridas — ¿cuánto impuesto ya pagado está inmovilizado?')])
  cabecera()
  const retMes = (col) => (m) => `=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q$400)=${AÑO})*(MONTH(Cobranzas!$Q$5:$Q$400)=${m})*IF(ISNUMBER(Cobranzas!$${col}$5:$${col}$400);Cobranzas!$${col}$5:$${col}$400;0))`
  const r0 = filas.length + 1
  mensual('IVA', retMes('X'), 'Cobranzas · ya computada en el "a pagar" de la sección 1.')
  mensual('Ganancias', retMes('Y'), 'Cobranzas · es pago a cuenta del impuesto anual: no se recupera hasta la DDJJ.')
  mensual('Ingresos Brutos', retMes('Z'), 'Cobranzas · ya viene declarada en la DDJJ de Rentas de la sección 2.')
  const r1 = filas.length
  const fRetTotal = mensual(rotuloTotal('Total retenido'), (m) => `=SUM(${cmes(m)}${r0}:${cmes(m)}${r1})`,
    'Plata de la empresa que está en manos del fisco.')
  push()

  // ── 4 · PLANES DE PAGO F931 ────────────────────────────────────────────────────────────────────
  push([seccion(4, 'Planes de pago F931 — ¿qué cuota vence cada mes?')])
  cabecera()
  const q0 = filas.length + 1
  for (const p of planes) {
    const sinFechas = !p.porMes.some((x) => x)
    mensual(sinFechas ? `⚠ ${p.nombre}` : p.nombre, (m) => (p.porMes[m] ? p.porMes[m] : VACIO),
      `${p.cuotas} cuota(s) de ${p.monto_cuota.toLocaleString('es-AR')} · total ${Math.round(p.total).toLocaleString('es-AR')} · Compras, rubro "Deuda previsional (planes de pago)"`
      + (sinFechas ? ' · ⚠ SIN FECHAS DE VENCIMIENTO cargadas: por eso la fila está vacía y su plata no aparece en ningún mes.' : ''))
  }
  const q1 = filas.length
  const fPlanTot = mensual(rotuloTotal('Cuotas del año'), (m) => `=SUM(${cmes(m)}${q0}:${cmes(m)}${q1})`,
    'Lo que sale por planes previsionales cada mes.')
  push()

  // ── 5 · DEUDA FINANCIERA ───────────────────────────────────────────────────────────────────────
  //
  // Junta lo que se DEBE con instrumento financiero. El prendario es el punto que faltaba conectar:
  // la CUOTA sale del BANCO (el débito real del extracto, _BANCO_RAW), la DEUDA del año de lo
  // cargado en Compras (rubro Financiero). Los planes, de su detalle de arriba.
  push([seccion(5, 'Deuda financiera — ¿cuánta plata se va por mes, y cuánto falta')])
  cabecera()
  // LA CUOTA DEL PRENDARIO SE MUESTRA HACIA ADELANTE, NO HACIA ATRÁS.
  //
  // EL DEFECTO QUE ESTO CORRIGE (23/07). La fórmula suma los débitos de "Préstamo prendario" de TODO
  // el extracto, o sea una cuota. Repetida en los doce meses, el total del año daba $15.393.726 como
  // si fueran doce pagos verificados — y son uno solo, proyectado once veces. Lo que ya se pagó vive
  // en el banco y en Compras; acá va la obligación que VIENE, que es la pregunta que contesta la
  // sección: cuánta plata se va por mes.
  const mesActual = new Date().getMonth() + 1
  const fCuotaPrend = mensual('Prendario Ford XLS · Santander — cuota',
    () => `=ABS(SUMIF('_BANCO_RAW'!$F$4:$F;"Préstamo prendario";'_BANCO_RAW'!$C$4:$C))`,
    'La cuota real que debitó el banco (extracto Santander), proyectada a los meses que faltan del año. Los meses ya pagados están en el banco y en Compras, no se repiten acá.',
    { meses: M12.filter((m) => m >= mesActual) })
  mensual('Planes previsionales F931 — cuota', (m) => `=${cmes(m)}${fPlanTot}`, 'Traído de la sección 4: un solo cálculo, un solo lugar.')
  const fSalidaFin = mensual(rotuloTotal('Salida financiera del mes'), (m) => `=${cmes(m)}${fCuotaPrend}+${cmes(m)}${fPlanTot}`,
    'Todo lo que se va por deuda con instrumento. Es la fila que mira el cash flow.')
  const fDeudaPrend = push(['Deuda pendiente del prendario', `=SUMIF(Compras!$AC$4:$AC;"Financiero";Compras!$O$4:$O)`,
    ...Array(11).fill(VACIO), VACIO, 'Compras, rubro "Financiero". Es un saldo, no una serie: por eso va fuera de la grilla mensual.'])
  const fDeudaPlanes = push(['Deuda pendiente de los planes', Math.round(planes.reduce((s, p) => s + p.total, 0)),
    ...Array(11).fill(VACIO), VACIO, `Suma de los ${planes.reduce((s, p) => s + p.cuotas, 0)} cuotas cargadas de los ${planes.length} planes.`])
  push()

  // ── 6 · LO QUE FALTA ───────────────────────────────────────────────────────────────────────────
  push([seccion(6, 'Lo que falta para que esta pestaña se actualice sola')])
  push(['⚠ Pagos de IVA e IIBB', ...Array(13).fill(VACIO), 'No están cargados en Compras: hoy el cash flow no ve esas salidas.'])
  push(['⚠ Alícuota de IIBB', ...Array(13).fill(VACIO), 'Se toma la declarada en las DDJJ leídas. Conviene que la confirme el contador.'])

  // ── EL HERO, RECIÉN AHORA: ya se sabe en qué fila quedó cada total ──────────────────────────────
  const saldoIVA = ultReal ? `${cmes(ultReal)}${fSaldo}` : '0'
  const saldoIIBB = mesesIIBB.length ? `${cmes(mesesIIBB[mesesIIBB.length - 1])}${fSaldoI}` : '0'
  const hero = [
    ['LA POSICIÓN', 'Monto', ...Array(11).fill(VACIO), VACIO, 'De dónde sale'],
    [rotuloTotal('A favor del fisco — plata inmovilizada'), `=${saldoIVA}+${saldoIIBB}+$N$${fRetTotal}`, ...Array(11).fill(VACIO), VACIO, 'Impuesto ya pagado que todavía no volvió.'],
    [subItem('saldo a favor de IVA'), `=${saldoIVA}`, ...Array(11).fill(VACIO), VACIO, 'ARCA · último mes con comprobantes.'],
    [subItem('saldo a favor de IIBB'), `=${saldoIIBB}`, ...Array(11).fill(VACIO), VACIO, 'DGR San Juan · última DDJJ presentada.'],
    [subItem('retenciones sufridas en el año'), `=$N$${fRetTotal}`, ...Array(11).fill(VACIO), VACIO, 'Cobranzas.'],
    [],
    [rotuloTotal('Deuda financiera — lo que se debe'), `=$B$${fDeudaPrend}+$B$${fDeudaPlanes}`, ...Array(11).fill(VACIO), VACIO, 'Con instrumento: prendario y planes de pago.'],
    [subItem('planes de pago F931'), `=$B$${fDeudaPlanes}`, ...Array(11).fill(VACIO), VACIO, 'Compras.'],
    [subItem('prendario del rodado'), `=$B$${fDeudaPrend}`, ...Array(11).fill(VACIO), VACIO, 'Compras.'],
  ]
  hero.forEach((c, k) => {
    const row = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
    while (row.length < ANCHO) row.push(VACIO)
    filas[heroBase + k] = row
  })

  return {
    filas,
    heroTotales: [heroBase + 2, heroBase + 7],
    alicuotas: [fAli],
    textos: [fPos + 4],
    proyectados: proyectados.map((m) => m),
    saldos: [fSaldo, fSaldoI, fSalidaFin],
  }
}

/** Lee las DDJJ de IIBB desde los PDF originales de Drive. */
async function leerIIBB(google) {
  const out = []
  // Se LISTA la carpeta de Drive (no IDs hardcodeados): cuando el dueño sube el mes nuevo (MM-2026.pdf),
  // aparece solo en la pestaña. Cada archivo es la DDJJ original de Rentas; se lee y se parsea.
  const archivos = (await google.listFolder(CARPETA_IIBB).catch((e) => { console.error(`  ⚠ no pude listar la carpeta de IIBB: ${e.message}`); return [] }))
    .filter((f) => /^\d{2}-\d{4}\.pdf$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const f of archivos) {
    const periodo = `${f.name.slice(3, 7)}-${f.name.slice(0, 2)}`
    try {
      const pdf = await google.readPdfText(f.id, { maxChars: 8000 })
      const d = parsearDDJJ(pdf?.text ?? '')
      out.push({ ...d, periodo: d.periodo ?? periodo })
    } catch (e) {
      // Un PDF que no se puede leer NO se rellena con ceros: se omite y se avisa.
      console.error(`  ⚠ no pude leer la DDJJ de ${periodo}: ${e.message}`)
    }
  }
  return out
}


/** LAS RETENCIONES QUE LE HACEN A LA EMPRESA, desde Cobranzas.
 *
 *  El dueño (21/07): "hay retenciones que considerar, revisión absoluta". Cobranzas las registra en
 *  tres columnas y esta pestaña no las miraba: $7.388.784 de impuesto YA PAGADO que no figuraba en
 *  ningún lado. La alícuota de cada una se VERIFICA contra su régimen (lib/retenciones-sufridas),
 *  porque los rótulos de dos de esas columnas estaban marcados como reconstruidos y una retención
 *  imputada al impuesto equivocado es un crédito fiscal que no existe.
 *
 *  Se imputan por FECHA DE COBRO (columna Q), que es cuando se practica la retención — no por la
 *  fecha de la factura. */
async function leerRetenciones(google) {
  const v = await google.readSheetValues(ID, 'Cobranzas!A5:AJ400').catch(() => [])
  const cobros = v.map((f, i) => ({
    fila: i + 5,
    cliente: String(f?.[6] ?? '').trim(),
    mes: mesDe(f?.[16]),
    neto: parseMonto(f?.[9]),
    iva: parseMonto(f?.[10]),
    retenciones: {
      iva: parseMonto(f?.[COLUMNAS.iva]),
      ganancias: parseMonto(f?.[COLUMNAS.ganancias]),
      iibb: parseMonto(f?.[COLUMNAS.iibb]),
    },
  })).filter((c) => c.retenciones.iva || c.retenciones.ganancias || c.retenciones.iibb)
  return clasificar(cobros)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const iibb = await leerIIBB(google)
  const ventas = await ventasProyectadas(google)
  // La regla de oro: toda proyección considera inflación, y el dato lo trae el OS de la web.
  const fi = await query("select periodo, factor_acumulado from public.factor_ajuste where indice='ipc' order by periodo")
  const factor = Object.fromEntries(fi.rows.map((r) => [r.periodo, Number(r.factor_acumulado)]))
  const ret = await leerRetenciones(google)
  // Sólo IVA y Ganancias se computan como crédito. Las de Ingresos Brutos ya vienen declaradas en
  // la DDJJ de Rentas que esta misma pestaña lee: sumarlas otra vez sería contarlas dos veces.
  const retIva = Object.fromEntries(Object.entries(ret.porMes)
    .filter(([k]) => k.startsWith('iva|')).map(([k, v]) => [k.slice(4), v]))
  const iva = await posicionIvaCompleta(AÑO, ventas, factor, retIva)
  const planes = await planesDePago()
  const g = grilla(iva, planes, iibb)
  if (ret.sospechosas.length) {
    console.error(`  ⚠ ${ret.sospechosas.length} retención(es) con alícuota que no encaja con ningún régimen — NO se computaron:`)
    for (const x of ret.sospechosas) console.error(`     fila ${x.fila} ${x.cliente}: ${x.regimen} ${Math.round(x.monto).toLocaleString('es-AR')} = ${(x.alicuota * 100).toFixed(2)}%`)
  }
  console.log(`  retenciones sufridas: ${Math.round(ret.total).toLocaleString('es-AR')} · IVA ${Math.round(ret.porRegimen.iva ?? 0).toLocaleString('es-AR')} · Ganancias ${Math.round(ret.porRegimen.ganancias ?? 0).toLocaleString('es-AR')} · IIBB ${Math.round(ret.porRegimen.iibb ?? 0).toLocaleString('es-AR')}`)
  console.log(`${PESTAÑA}: ${g.filas.length} filas · ${planes.length} planes · IVA de ${iva.filter((m) => m.disponible).length} meses reales`)
  if (DRY) {
    for (const m of iva.filter((x) => x.disponible || x.es_proyeccion)) {
      console.log(`  ${m.periodo}  débito ${Math.round(m.debito_fiscal).toLocaleString('es-AR').padStart(12)}  crédito ${Math.round(m.credito_fiscal).toLocaleString('es-AR').padStart(12)}  a pagar ${Math.round(m.a_pagar_real ?? 0).toLocaleString('es-AR').padStart(12)}  saldo a favor ${Math.round(m.saldo_queda).toLocaleString('es-AR').padStart(12)}${m.es_proyeccion ? '  (proyección)' : ''}`)
    }
    for (const p of planes) console.log(`  ${p.nombre.padEnd(42)} ${p.cuotas} cuotas x ${p.monto_cuota.toLocaleString('es-AR')} = ${Math.round(p.total).toLocaleString('es-AR')}`)
    return
  }

  const hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  // Las NOTAS viejas del generador se limpian SÓLO en su propia grilla (antes barría 200x26 y se
  // llevaba puestos los comentarios de la persona).
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: g.filas.length, startColumnIndex: 0, endColumnIndex: ANCHO }, fields: 'note' } }]).catch(() => {})
  // ═══ LA COLA DE LA VERSIÓN ANTERIOR ═══
  // La grilla mensual es más compacta que los cinco cuadros que había antes. Sin esto, las filas de
  // más abajo sobrevivirían —el precio declarado de no borrar nunca— y quedarían dos cuadros de
  // planes de pago, uno arriba y otro debajo. VACIO significa "es mi celda y va vacía": limpia lo
  // que dejó el generador y conserva igual cualquier anotación de una persona.
  const previoTab = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}400`)
  let ultimaFila = 0
  previoTab.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultimaFila = i + 1 })
  if (ultimaFila > g.filas.length) {
    console.log(`  cola de la versión anterior: limpio las filas ${g.filas.length + 1}–${ultimaFila}`)
    for (let i = g.filas.length; i < ultimaFila; i++) g.filas.push(Array(ANCHO).fill(VACIO))
  }

  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, g.filas, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  await formatear(google, hoja.sheetId, g)

  // VERIFICAR MIRANDO LA PESTAÑA, no confiando en que la escritura salió bien.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|VALOR|¡|¿|DIV|NAME|NUM|NULL)/i.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '✓ ninguna celda en error')
  const defectos = auditarPatron(v)
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(16)}${String(f[13] ?? '').padStart(16)}`)
  if (err.length || defectos.length) process.exitCode = 1
}

/** El formato: la piel de statement compartida más lo propio de la grilla mensual. */
async function formatear(google, sheetId, g) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })
  const MUT = { red: 0.53, green: 0.52, blue: 0.49 }
  const AMBAR = { red: 1, green: 0.97, blue: 0.88 }

  // Los doce meses más el total: moneda, a la derecha. Es lo que permite comparar hacia abajo sin
  // volver a leer el encabezado en cada bloque.
  fmt(r(3, n, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  // La columna de origen: chica, apagada, y que envuelva. Es explicación, no dato.
  fmt(r(0, n, 14, 15), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9, foregroundColor: MUT, fontFamily: 'Arial' }, horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP', verticalAlignment: 'TOP' })
  // La columna A rebalsa sobre las celdas vacías de su derecha: así un título de sección no se parte.
  fmt(r(0, n, 0, 1), 'userEnteredFormat.wrapStrategy', { wrapStrategy: 'OVERFLOW_CELL' })

  g.filas.forEach((f, i) => {
    const a = String(f?.[0] ?? '')
    // Los encabezados de mes son rótulos, no importes: sin formato de moneda encima.
    if (a === 'Concepto') fmt(r(i, i + 1, 1, 14), 'userEnteredFormat(numberFormat,horizontalAlignment)', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
    if (/^⚠/.test(a)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } } })
  })
  // Las filas que no son plata, con el formato de lo que son.
  for (const f of g.alicuotas ?? []) fmt(r(f - 1, f, 1, 14), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.00%;;"—"' } })
  for (const f of g.textos ?? []) fmt(r(f - 1, f, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
  // LOS MESES PROYECTADOS, EN ÁMBAR: nunca confundir una proyección con un comprobante real. Van por
  // COLUMNA, no por fila: en esta grilla el tiempo son las columnas.
  for (const m of g.proyectados ?? []) fmt(r(3, n, m, m + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: AMBAR })

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 124 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 420 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)
  // PIEL DE STATEMENT encima del formato de número: sin reja, secciones y encabezados por tipografía
  // + hairline (no barras rellenas), totales rulados. La misma que CAJA, Cheques y Cargas Sociales.
  await google.spreadsheetBatchUpdate(ID, skinRequests({ sheetId, filas: g.filas, cols: ANCHO, congeladas: 2 }))
  // Ninguna fila queda OCULTA: un colapso de una versión anterior dejó filas con hiddenByUser=true,
  // y borrar el grupo no las vuelve a mostrar.
  await google.spreadsheetBatchUpdate(ID, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
