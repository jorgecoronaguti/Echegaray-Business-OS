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

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Impuestos y Financieros'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const ANCHO = 10
// Las DDJJ de IIBB de San Juan viven en Drive, en una carpeta que el índice del OS no tenía.
// El dueño: "IIBB tenés que buscarlo en Drive, ahí puede haber datos de cuánto se ha ido pagando".
// Se leen los PDF originales: son la fuente primaria y traen número de control y fecha de
// presentación, así que el número se puede volver a verificar. Un dato tipeado no.
const DDJJ_IIBB = {
  '2026-01': '13phAslVR3kMBUlFFGISfLZggcCsxjJV_',
  '2026-02': '11xRFtU6QmZLi4ioD-03WllEBFXAGgz3w',
  '2026-03': '1sLsNGWOFzCApJQvX0EV6oWjd5XC3-Zyt',
  '2026-04': '1NnB10U91xWt797UfzJ806ntTFp0N8POp',
  '2026-05': '1IHZ4hT3AzeFi_k8qAskm5cBaKy5R0aq5',
  '2026-06': '1Ejg14GrkcmZWD9A6podaEkbzqpKChbli',
}

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
    planes.set(nombre, p)
  }
  return [...planes.values()].sort((a, b) => b.total - a.total)
}

function grilla(iva, planes, iibb, ret) {
  const filas = []
  const push = (c = []) => { const r = [...c]; while (r.length < ANCHO) r.push(''); filas.push(r); return filas.length }
  const hoy = new Date().toISOString().slice(0, 10)

  push(['ECHEGARAY CONSTRUCCIONES · IMPUESTOS Y FINANCIERO'])
  push(['Posición impositiva y financiera'])
  push([`Al ${hoy} · en pesos`])
  push(['Fuentes: IVA de ARCA · IIBB de las DDJJ de Rentas (Drive) · prendario del extracto Santander · planes F931 y compras de la pestaña Compras · retenciones de Cobranzas'])
  push()
  // HERO — DOS PANELES: a favor del fisco (inmovilizado, recuperable) vs deuda financiera (a pagar).
  // Se RESERVA acá y se llena al final con referencias a las celdas de los bloques de abajo (ni un
  // número pegado). Menos es más: lo primero que se ve es cuánto se tiene a favor y cuánto se debe.
  const heroBase = filas.length
  for (let k = 0; k < 6; k++) push()

  // ── 1. IVA ──────────────────────────────────────────────────────────────────────────────────────
  push(['1. IVA — posición mensual, con el saldo a favor arrastrado'])
  // LA COLUMNA DE RETENCIONES ES NUEVA (21/07) y va ENTRE la posición y el saldo previo, porque ése
  // es el orden en que se aplican: la posición del mes se reduce primero por lo que ya se pagó por
  // retención, y recién después se consume el saldo a favor que venía arrastrándose.
  // MENOS ES MÁS: seis columnas, no diez. Débito y crédito se funden en "Posición del mes"
  // (ventas − compras); "saldo que venía" es el "saldo a favor" del mes anterior y no se repite.
  const cab = push(['Mes', 'Posición del mes', 'Retención IVA sufrida', 'A PAGAR', 'Saldo a favor', 'Comprobantes (vta/cpa)'])
  const f0 = filas.length + 1
  // ═══ TODO EL CUADRO ES FÓRMULA — NI UN NÚMERO PEGADO (21/07) ═══
  //
  // Hasta hoy estas doce filas eran `Math.round(m.debito_fiscal)`: el OS calculaba la posición de
  // IVA en JavaScript y pegaba el resultado. El dueño lo detectó abriendo una celda: "la pestaña no
  // es un documento que se actualice de manera automática, esto me genera dudas respecto a TODO el
  // sheet". El censo le dio la razón — 21 fórmulas contra 136 números pegados en esta sola pestaña.
  //
  // La causa era estructural: los comprobantes de ARCA viven en Postgres y el Sheet no los tenía, así
  // que no había con qué escribir la fórmula. Se resolvió trayendo el INSUMO (la pestaña _ARCA_RAW,
  // 459 comprobantes con su fecha de corte) en vez de seguir pegando el RESULTADO.
  //
  // Ahora cada celda se recalcula sola: se carga un comprobante nuevo en ARCA, el agente refresca
  // _ARCA_RAW y el cuadro cambia sin que nadie toque nada.
  const R = "_ARCA_RAW"
  const nReales0 = iva.filter((m) => m.disponible).length
  const fReal1 = f0 + nReales0 - 1
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

  for (const m of iva) {
    const i = Number(m.periodo.slice(5, 7)) - 1
    const mes = i + 1
    const r = filas.length + 1
    if (!m.disponible && !m.es_proyeccion) { push([`${MES[i]}-26`, '', '', '', '', '', '', '', '', 'sin comprobantes cargados']); continue }
    // El saldo a favor que venía = el que quedó el mes anterior (columna E). Para el primer mes, 0.
    const prev = r === f0 ? '0' : `$E${r - 1}`
    push([
      `${MES[i]}-26`,
      // POSICIÓN = ventas − compras (débito − crédito, fundidos). Proyección: el ritmo real ajustado
      // por inflación (el crédito lleva la misma inflación, así que la resta ya viene ajustada).
      m.disponible
        ? `=${sumaArca(m.periodo, 'Ventas', 'L')}-${sumaArca(m.periodo, 'Compras', 'L')}`
        : `=AVERAGE($B$${f0}:$B$${fReal1})*${factor(mes)}`,
      // Retención de IVA sufrida (Cobranzas col. X), imputada al mes del COBRO, no al de la factura.
      `=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q$400)=${AÑO})*(MONTH(Cobranzas!$Q$5:$Q$400)=${mes})*IF(ISNUMBER(Cobranzas!$X$5:$X$400);Cobranzas!$X$5:$X$400;0))`,
      // Primero se descuenta lo pagado por retención, después el saldo a favor que venía.
      `=MAX(0;$B${r}-$C${r}-${prev})`,
      `=MAX(0;${prev}+$C${r}-$B${r})`,
      m.disponible
        ? `=COUNTIFS(${R}!$A$4:$A;"${m.periodo}";${R}!$B$4:$B;"Ventas")&" / "&COUNTIFS(${R}!$A$4:$A;"${m.periodo}";${R}!$B$4:$B;"Compras")`
        : '—',
    ])
  }
  const f1 = filas.length
  const tot = push(['TOTAL 2026', `=SUM(B${f0}:B${f1})`, `=SUM(C${f0}:C${f1})`, `=SUM(D${f0}:D${f1})`, '', '',
    'La suma de A PAGAR es la caja que el IVA se lleva en el año. El saldo a favor no se suma: es un saldo que corre.'])
  push()
  const ult = [...iva].reverse().find((m) => m.disponible)
  // EL SALDO A FAVOR ES LA ÚLTIMA FILA DEL CUADRO, no un número aparte: si entra una factura, se mueve.
  const filaUlt = f0 + iva.findIndex((m) => m === ult)
  const fSaldoIVA = push(['⚠ Saldo técnico a favor HOY', ult ? `=E${filaUlt}` : 0, '', '', '', '', '', '',
    'Plata de la empresa adelantada al fisco. Si crece mes a mes, hay que revisar las retenciones que sufre (Cobranzas columnas X a AA).'])
  push(['⚠ IVA pagado que figura en Compras', '=SUMIF(Compras!$AC$4:$AC;"Impuestos";Compras!$O$4:$O)', '', '', '', '', '', '', '',
    'Si esto da $0 y arriba hay meses "A PAGAR", el IVA se está pagando fuera del Sheet y el cash flow miente.'])
  push()

  // ── 1 bis. LAS RETENCIONES QUE LE HACEN A LA EMPRESA ────────────────────────────────────────────
  // No estaban en ningún lado del archivo. Una retención es impuesto YA PAGADO: sin computarla, el
  // cuadro muestra un "A PAGAR" inflado y el cash flow proyecta una salida que no va a ocurrir.
  push(['1 bis. Retenciones sufridas — impuesto ya pagado por adelantado (de Cobranzas)'])
  push(['Régimen', 'Total retenido', '', 'Alícuota medida', '¿Se computa acá?', '', '', '', '', 'Origen'])
  // LOS TRES TOTALES SON FÓRMULAS SOBRE COBRANZAS. Eran números calculados en JavaScript y pegados:
  // se cargaba un cobro con retención y el cuadro seguía mostrando el total del día que corrió el
  // script. La suma ignora el texto —hay filas con notas en esas columnas— y por eso va SUMPRODUCT
  // con ISNUMBER en vez de SUM.
  const retDe = (col) => `=SUMPRODUCT(IF(ISNUMBER(Cobranzas!$${col}$5:$${col}$400);Cobranzas!$${col}$5:$${col}$400;0))`
  const fIva = filas.length + 1
  push(['IVA', retDe('X'), '', '80% del IVA', 'SÍ — resta del "A PAGAR" de arriba, mes a mes', '', '', '', '',
    'Cobranzas col. X · imputado por fecha de cobro'])
  push(['Ganancias', retDe('Y'), '', '2,00% del neto', 'No: es pago a cuenta de Ganancias, que este cuadro todavía no lleva', '', '', '', '',
    'Cobranzas col. Y'])
  push(['Ingresos Brutos', retDe('Z'), '', '2,50% / 3,50% del neto', 'No: YA vienen en la DDJJ de Rentas del bloque 2 — computarlas acá sería contarlas dos veces', '', '', '', '',
    'Cobranzas col. Z'])
  const fRetTotal = push(['TOTAL RETENIDO', `=SUM(B${fIva}:B${fIva + 2})`, '', '', 'Plata de la empresa adelantada al fisco.', '', '', '', '', ''])
  // Los meses proyectados van SIN retención: quién retiene depende de qué cliente se facture cada
  // mes, y eso no se proyecta. El "A PAGAR" de ago–dic queda sobreestimado (error conservador). El
  // escenario what-if que estimaba la cifra se retiró: menos es más, y era análisis, no posición.
  push(['⚠ Meses proyectados sin retención — el "A PAGAR" de ago–dic queda sobreestimado'])
  if (ret?.sospechosas?.length) {
    push([`⚠ ${ret.sospechosas.length} retención(es) con alícuota que no encaja`, Math.round(ret.sospechosas.reduce((s, x) => s + x.monto, 0)), '', '', 'NO se computaron: puede ser otro régimen o un error de carga. Filas de Cobranzas: ' + ret.sospechosas.map((x) => x.fila).join(', '), '', '', '', '', ''])
  }
  push()

  // ── 2. IIBB ─────────────────────────────────────────────────────────────────────────────────────
  push(['2. INGRESOS BRUTOS (San Juan) — de las DDJJ reales de Rentas'])
  // ═══ ESTE ES EL ÚNICO BLOQUE DEL ARCHIVO QUE NO SE PUEDE ACTUALIZAR SOLO, Y HAY QUE DECIRLO ═══
  //
  // El IVA sale de _ARCA_RAW, las cargas sociales de _F931_RAW —leídas del PDF de cada DDJJ— y los
  // saldos del banco de _BANCO_RAW. Para Ingresos Brutos hice la misma búsqueda en el data room y lo
  // único que hay es "administracion/ANRs/IIBB.pdf", que es el CERTIFICADO DE INSCRIPCIÓN: no tiene
  // un solo número de una declaración mensual.
  //
  // Así que estos números son una transcripción, y como tal envejecen: cuando se presente la DDJJ de
  // julio, el cuadro va a seguir mostrando hasta junio sin que nadie se entere. No se inventan y no
  // se disfrazan de fórmula — se declara qué falta para que dejen de ser una transcripción.
  push(['⚠ Base y Retenciones son transcripción de las DDJJ de Rentas (los PDF no están en el data room); el impuesto y los saldos se calculan solos.'])
  const al = alicuotaDeclarada(iibb)
  const cab2 = push(['Período', 'Base imponible', 'Impuesto determinado', 'Retenciones y percepciones sufridas', 'Saldo a favor que venía', 'A PAGAR', 'Saldo a favor que queda', 'Presentada', 'Origen'])
  const i0 = filas.length + 1
  // La celda de la alícuota declarada va DEBAJO del bloque (fila aliRow): el impuesto determinado se
  // referencia contra ella, no contra un 2% hardcodeado. Forward-reference, válida en Sheets.
  const aliRow = i0 + iibb.length + 2
  // SÓLO Base (B) y Retenciones (D) son dato de origen de la DDJJ. El resto es aritmética que TIENE
  // que ser fórmula (regla de oro): C impuesto = Base × alícuota; E saldo que viene = G del mes
  // anterior; F a pagar = MAX(0; impuesto − retenciones − saldo); G saldo que queda = MAX(0; lo inverso).
  iibb.forEach((d, j) => {
    const i = Number((d.periodo ?? '').slice(5, 7)) - 1
    const r = i0 + j
    push([
      `${MES[i] ?? d.periodo}-26`, Math.round(d.base_total), `=B${r}*$B$${aliRow}`,
      Math.round(d.retenciones), j === 0 ? Math.round(d.saldo_favor_anterior) : `=G${r - 1}`,
      `=MAX(0;C${r}-D${r}-E${r})`, `=MAX(0;E${r}+D${r}-C${r})`,
      d.fecha_presentacion ?? '',
      `DDJJ Rentas San Juan · Base y Retenciones transcriptas`,
    ])
  })
  const i1 = filas.length
  push(['TOTAL', `=SUM(B${i0}:B${i1})`, `=SUM(C${i0}:C${i1})`, `=SUM(D${i0}:D${i1})`, '', `=SUM(F${i0}:F${i1})`, '', '',
    'Si la columna "A PAGAR" da $0 en todo el semestre, la empresa NO paga IIBB: las retenciones que sufre alcanzan y sobran.'])
  push()
  const fIIBB = push(['Alícuota que la empresa DECLARA', al.alicuota ?? '', '', '', '', '', '', '',
    `De sus propias DDJJ (cód. ${al.codigos.join(', ')}), no de la ley. El 3% es del 711001, que Echegaray no usa; estimarlo así inflaba el impuesto 50%.`])
  const ultIIBB = iibb[iibb.length - 1]
  const fSaldoIIBB = push(['⚠ Saldo a favor de IIBB HOY', `=G${i1}`, '', '', '', '', '', '',
    `Plata de la empresa inmovilizada en Rentas, igual que con el IVA. Venía de ${Math.round(iibb[0]?.saldo_favor_anterior ?? 0).toLocaleString('es-AR')} en enero: está BAJANDO, así que en algún momento la empresa va a empezar a pagar IIBB de verdad.`])
  push(['Consumo mensual del saldo (impuesto − retenciones)', `=IFERROR((C${i1}-D${i1});0)`, '', '', '', '', '', '',
    'Lo que el último mes se comió del saldo a favor. Dividí el saldo por esto para saber cuántos meses faltan para empezar a pagar.'])
  push(['IIBB pagado que figura en Compras', '=SUMPRODUCT((REGEXMATCH(LOWER(Compras!$E$4:$E&" "&Compras!$L$4:$L);"iibb|ingresos brutos|rentas|dgr"))*IF(ISNUMBER(Compras!$O$4:$O);Compras!$O$4:$O;0))', '', '', '', '', '', '',
    'Da $0, y esta vez está BIEN que dé $0: con saldo a favor no hay nada que pagar. El día que el saldo se agote, va a haber que cargarlo acá.'])
  push()

  // ── PLANES DE PAGO F931 (detalle) — de acá salen las cifras de la deuda financiera de abajo ──────
  push(['Planes de pago F931 — detalle'])
  push(['Plan', 'Cuotas', 'Monto por cuota', 'Total', 'Primera', 'Última', '', '', 'Origen'])
  const p0 = filas.length + 1
  // El total por plan es cuotas × monto de cuota: fórmula, no pegado. Cuotas y monto salen del rubro
  // "Deuda previsional" de Compras (agregación del OS por plan) y se declaran en la columna Origen.
  planes.forEach((p, k) => push([p.nombre, p.cuotas, p.monto_cuota, `=B${p0 + k}*C${p0 + k}`, p.primera ?? '', p.ultima ?? '', '', '', 'Compras, rubro "Deuda previsional (planes de pago)"']))
  const p1 = filas.length
  const fTotalPlanes = push(['TOTAL PLANES', `=SUM(B${p0}:B${p1})`, '', `=SUM(D${p0}:D${p1})`, '', '', '', '', ''])
  push()

  // ── 3. DEUDA FINANCIERA — planes previsionales + prendario del rodado ────────────────────────────
  //
  // Junta lo que se DEBE con instrumento financiero. El prendario es el punto que faltaba conectar:
  // la CUOTA sale del BANCO (el débito real del extracto, _BANCO_RAW), la DEUDA del año de lo cargado
  // en Compras (rubro Financiero). Los planes, de su detalle de arriba.
  push(['3. DEUDA FINANCIERA — lo que se debe y con qué cuota'])
  push(['Concepto', 'Cuotas', 'Cuota', 'Deuda', '', '', '', '', 'Origen'])
  const fPlanLinea = push([`Planes previsionales F931 (${planes.length})`, `=B${fTotalPlanes}`, '', `=D${fTotalPlanes}`, '', '', '', '',
    'Detalle arriba · Compras rubro "Deuda previsional"'])
  const fPrend = push(['Prendario Ford XLS · Santander',
    '=COUNTIF(Compras!$AC$4:$AC;"Financiero")',
    `=ABS(SUMIF('_BANCO_RAW'!$F$4:$F;"Préstamo prendario";'_BANCO_RAW'!$C$4:$C))`,
    '=SUMIF(Compras!$AC$4:$AC;"Financiero";Compras!$O$4:$O)', '', '', '', '',
    'Cuota: extracto Santander · Deuda del año: Compras rubro "Financiero" (cuotas 15–26/2026)'])
  const fDeudaTot = push(['TOTAL DEUDA FINANCIERA', '', '', `=D${fPlanLinea}+D${fPrend}`, '', '', '', '', ''])
  const b0 = fPrend // ancla para el formato de "cuotas" (cantidad, no plata)
  push()

  // ── 5. LO QUE FALTA ─────────────────────────────────────────────────────────────────────────────
  push(['LO QUE FALTA'])
  push(['· Cargar en Compras los pagos de IVA/IIBB que se hayan hecho — hoy el cash flow no los ve.'])
  push(['· Los PDF de las DDJJ de IIBB de Rentas en el data room (hoy están transcriptas a mano).'])

  // RELLENAR EL HERO reservado arriba, ahora que las cifras existen. Son REFERENCIAS a las celdas de
  // los bloques (saldo a favor de IVA, de IIBB, deuda de planes, retenciones adelantadas): ni un
  // número pegado, y se recalcula solo cuando cambia cualquiera de esos bloques.
  const heroRows = [
    ['A FAVOR DEL FISCO · INMOVILIZADO', '', '', '', '', 'A PAGAR · DEUDA FINANCIERA'],
    ['', `=B${fSaldoIVA}+B${fSaldoIIBB}+B${fRetTotal}`, '', '', '', '', `=D${fDeudaTot}`],
    ['plata de la empresa adelantada, recuperable', '', '', '', '', 'planes previsionales + prendario del rodado'],
    ['Saldo a favor de IVA', '', `=B${fSaldoIVA}`, '', '', 'Planes previsionales F931', '', `=D${fPlanLinea}`],
    ['Saldo a favor de IIBB', '', `=B${fSaldoIIBB}`, '', '', 'Prendario · cuota mensual', '', `=C${fPrend}`],
    ['Retenciones sufridas', '', `=B${fRetTotal}`, '', '', 'Prendario · deuda del año', '', `=D${fPrend}`],
  ]
  heroRows.forEach((c, k) => { const row = [...c]; while (row.length < ANCHO) row.push(''); filas[heroBase + k] = row })
  const fHeroCaps = heroBase + 1  // 1-indexed: fila de los títulos de panel
  const fHeroBig = heroBase + 2   // fila de las dos cifras grandes
  const fHeroBrk0 = heroBase + 4  // primera fila del desglose
  const fHeroBrk1 = heroBase + 6  // última fila del desglose

  return { filas, fHeroCaps, fHeroBig, fHeroBrk0, fHeroBrk1, fDeuda: b0, f0, f1, tot, p0, p1, b0, cab, fIIBB, i0, i1 }
}

/** Lee las DDJJ de IIBB desde los PDF originales de Drive. */
async function leerIIBB(google) {
  const out = []
  for (const [periodo, id] of Object.entries(DDJJ_IIBB)) {
    try {
      const pdf = await google.readPdfText(id, { maxChars: 8000 })
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
  const g = grilla(iva, planes, iibb, ret)
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
  await google.clearValues(ID, `${PESTAÑA}!A1:Z200`)
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas }])
  await formatear(google, hoja.sheetId, g)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:I${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '\n✓ sin errores')
  console.log('\nMES    DÉBITO         CRÉDITO        A PAGAR        SALDO A FAVOR')
  for (let i = g.f0; i <= g.tot; i++) {
    const f = v[i - 1] || []
    console.log(`${String(f[0] ?? '').padEnd(7)}${String(f[1] ?? '').padStart(14)}${String(f[2] ?? '').padStart(15)}${String(f[5] ?? '').padStart(15)}${String(f[6] ?? '').padStart(16)}`)
  }
}

async function formatear(google, sheetId, g) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const AMBAR = { red: 1, green: 0.97, blue: 0.88 }
  const ROJO = { red: 1, green: 0.93, blue: 0.93 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, n, 1, 8), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  // Encabezado: eyebrow (0) apagado dorado, título (1) grande. "Al…" (2) y "Fuentes:" (3), apagados.
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 8, foregroundColor: { red: 0.60, green: 0.48, blue: 0.25 } } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 18, foregroundColor: { red: 0.10, green: 0.13, blue: 0.20 } } })
  fmt(r(2, 4), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { fontSize: 9, foregroundColor: { red: 0.53, green: 0.52, blue: 0.49 } }, wrapStrategy: 'WRAP' })
  // La columna I es siempre explicación: nunca plata.
  fmt(r(0, n, 8, 9), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'CLIP' })
  fmt(r(g.cab - 1, g.cab), 'userEnteredFormat',
    { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  // Los meses proyectados, en ámbar: nunca confundir con un comprobante real.
  const primeraProy = g.f0 + 7
  fmt(r(primeraProy - 1, g.f1), 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat', { backgroundColor: AMBAR, textFormat: { italic: true } })
  fmt(r(g.tot - 1, g.tot), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
  // La celda de la alícuota que hay que completar, en rojo suave: es un pedido, no un dato.
  fmt({ ...r(g.fIIBB - 1, g.fIIBB), startColumnIndex: 1, endColumnIndex: 2 },
    'userEnteredFormat.backgroundColor,userEnteredFormat.numberFormat',
    { backgroundColor: ROJO, numberFormat: { type: 'PERCENT', pattern: '0.00%' } })
  // Los encabezados de sección.
  g.filas.forEach((f, i) => {
    if (/^\d\. |^LO QUE FALTA/.test(String(f[0] ?? ''))) fmt(r(i, i + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    if (/^(Plan|Concepto)$/.test(String(f[0] ?? ''))) fmt(r(i, i + 1), 'userEnteredFormat', { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER' })
    if (/^⚠/.test(String(f[0] ?? ''))) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, foregroundColor: { red: 0.7, green: 0.2, blue: 0.1 } } })
  })
  // Las cuotas son cantidades.
  // EL HERO: rótulos apagados arriba, las cuatro cifras de posición grandes en acento. Van en las
  // columnas A/C/E/G (la moneda de arriba sólo cubre B–H, así que acá se pone el formato de nuevo).
  // EL HERO DE DOS PANELES: A FAVOR (verde, inmovilizado) · A PAGAR (rojo, deuda). Los títulos en su
  // color, las dos cifras grandes en B (verde) y G (rojo), el desglose en moneda chica.
  if (g.fHeroBig) {
    const MONEDA = { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }
    const POS = { red: 0.11, green: 0.37, blue: 0.27 }
    const NEG = { red: 0.55, green: 0.23, blue: 0.17 }
    const MUT = { red: 0.53, green: 0.52, blue: 0.49 }
    fmt({ ...r(g.fHeroCaps - 1, g.fHeroCaps), startColumnIndex: 0, endColumnIndex: 1 }, 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 9, foregroundColor: POS } })
    fmt({ ...r(g.fHeroCaps - 1, g.fHeroCaps), startColumnIndex: 5, endColumnIndex: 6 }, 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 9, foregroundColor: NEG } })
    fmt({ ...r(g.fHeroBig - 1, g.fHeroBig), startColumnIndex: 1, endColumnIndex: 2 }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment', { numberFormat: MONEDA, textFormat: { bold: true, fontSize: 18, foregroundColor: POS }, horizontalAlignment: 'LEFT' })
    fmt({ ...r(g.fHeroBig - 1, g.fHeroBig), startColumnIndex: 6, endColumnIndex: 7 }, 'userEnteredFormat.numberFormat,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment', { numberFormat: MONEDA, textFormat: { bold: true, fontSize: 18, foregroundColor: NEG }, horizontalAlignment: 'LEFT' })
    fmt(r(g.fHeroBig, g.fHeroBig + 1), 'userEnteredFormat.textFormat', { textFormat: { italic: true, fontSize: 9, foregroundColor: MUT } })
    fmt({ ...r(g.fHeroBrk0 - 1, g.fHeroBrk1), startColumnIndex: 2, endColumnIndex: 3 }, 'userEnteredFormat.numberFormat', { numberFormat: MONEDA })
    fmt({ ...r(g.fHeroBrk0 - 1, g.fHeroBrk1), startColumnIndex: 7, endColumnIndex: 8 }, 'userEnteredFormat.numberFormat', { numberFormat: MONEDA })
  }
  fmt({ ...r(g.p0 - 1, g.p1 + 1), startColumnIndex: 1, endColumnIndex: 2 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })
  // Las "cuotas" de la deuda financiera (col B de las dos líneas) son cantidad, no plata.
  fmt({ ...r(g.fDeuda - 2, g.fDeuda), startColumnIndex: 1, endColumnIndex: 2 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })
  // LAS FECHAS NO SON PESOS. El formato de moneda de arriba barre las columnas B a H enteras, así
  // que la fecha de presentación de cada DDJJ salía "$46.072" y la primera cuota de cada plan
  // "$46.250" — el número de serie de la fecha, pintado de plata. Un cuadro donde una fecha se lee
  // como un importe no se puede revisar: el ojo suma lo que no es.
  const FECHA = { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' }
  fmt({ ...r(g.i0 - 1, g.i1), startColumnIndex: 7, endColumnIndex: 8 }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', FECHA)
  fmt({ ...r(g.p0 - 1, g.p1), startColumnIndex: 4, endColumnIndex: 6 }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', FECHA)

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 280 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 8 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 420 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)
  // PIEL DE STATEMENT encima del formato de número: sin reja, secciones y encabezados por tipografía
  // + hairline (no barras rellenas), totales rulados. Deja la pestaña como CAJA y Cheques Emitidos.
  await google.spreadsheetBatchUpdate(ID, skinRequests({ sheetId, filas: g.filas, cols: ANCHO, congeladas: 1 }))
  // DESPUÉS del skin: el skin trata la fila 0 y las mayúsculas como sección. El eyebrow, el título y
  // los dos títulos de panel del hero tienen identidad propia (dorado / tinta grande / verde·rojo) y
  // se re-aplican acá para que ganen.
  const hzt = (row, c0, c1, f) => ({ repeatCell: { range: { sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: { textFormat: f } }, fields: 'userEnteredFormat.textFormat' } })
  await google.spreadsheetBatchUpdate(ID, [
    hzt(1, 0, 1, { bold: true, fontSize: 8, foregroundColor: { red: 0.60, green: 0.48, blue: 0.25 } }),
    hzt(2, 0, 1, { bold: true, fontSize: 18, foregroundColor: { red: 0.10, green: 0.13, blue: 0.20 } }),
    hzt(g.fHeroCaps, 0, 1, { bold: true, fontSize: 9, foregroundColor: { red: 0.11, green: 0.37, blue: 0.27 } }),
    hzt(g.fHeroCaps, 5, 6, { bold: true, fontSize: 9, foregroundColor: { red: 0.55, green: 0.23, blue: 0.17 } }),
  ])
  // PLEGAR el detalle del IVA: los meses ya cerrados sin movimiento (ene–abr) y la proyección
  // (ago–dic). Quedan visibles los tres últimos reales + el total — el resto, a un clic. Menos es más.
  const previos = (await google.getRowGroups(ID).catch(() => [])).filter((x) => x.sheetId === sheetId)
  if (previos.length) await google.spreadsheetBatchUpdate(ID, previos.map((x) => ({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: x.startIndex, endIndex: x.endIndex } } }))).catch(() => {})
  const grupo = (a, b) => ({ range: { sheetId, dimension: 'ROWS', startIndex: a, endIndex: b } })
  await google.spreadsheetBatchUpdate(ID, [
    { addDimensionGroup: grupo(g.f0 - 1, g.f0 + 3) }, { addDimensionGroup: grupo(g.f0 + 6, g.f1) },
  ]).catch(() => {})
  await google.spreadsheetBatchUpdate(ID, [
    { updateDimensionGroup: { dimensionGroup: { ...grupo(g.f0 - 1, g.f0 + 3), depth: 1, collapsed: true }, fields: 'collapsed' } },
    { updateDimensionGroup: { dimensionGroup: { ...grupo(g.f0 + 6, g.f1), depth: 1, collapsed: true }, fields: 'collapsed' } },
  ]).catch(() => {})
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
