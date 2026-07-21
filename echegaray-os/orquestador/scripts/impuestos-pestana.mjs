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

  push(['IMPUESTOS Y FINANCIEROS'])
  push([`Al ${hoy}. El IVA sale de los comprobantes reales de ARCA (tabla comprobantes_arca del OS), no de una fórmula del Sheet: por eso al lado de cada mes va de cuántos comprobantes salió. Los planes de pago y el financiero son fórmulas contra Compras.`])
  push()

  // ── 1. IVA ──────────────────────────────────────────────────────────────────────────────────────
  push(['1. POSICIÓN DE IVA — con el saldo a favor arrastrado, que es lo que se paga de verdad'])
  // LA COLUMNA DE RETENCIONES ES NUEVA (21/07) y va ENTRE la posición y el saldo previo, porque ése
  // es el orden en que se aplican: la posición del mes se reduce primero por lo que ya se pagó por
  // retención, y recién después se consume el saldo a favor que venía arrastrándose.
  const cab = push(['Mes', 'Débito fiscal (ventas)', 'Crédito fiscal (compras)', 'Posición del mes',
    'Retenciones de IVA sufridas', 'Saldo a favor que venía', 'A PAGAR', 'Saldo a favor que queda',
    'Comprobantes (vta/cpa)', 'Origen'])
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
    const previo = r === f0 ? '' : `=$H${r - 1}`
    push([
      `${MES[i]}-26`,
      m.disponible
        ? `=${sumaArca(m.periodo, 'Ventas', 'L')}`
        // Sin comprobantes todavía: el ritmo real de los meses cerrados, ajustado por inflación.
        : `=AVERAGE($B$${f0}:$B$${fReal1})*${factor(mes)}`,
      m.disponible
        ? `=${sumaArca(m.periodo, 'Compras', 'L')}`
        // El crédito lleva la MISMA inflación que el débito: la posición es una resta y ajustar un
        // solo lado la hace crecer por una razón que no existe.
        : `=AVERAGE($C$${f0}:$C$${fReal1})*${factor(mes)}`,
      `=$B${r}-$C${r}`,
      // Las retenciones de IVA sufridas salen de Cobranzas columna X, imputadas al mes del COBRO
      // (que es el período de la retención), no al de la factura.
      `=SUMPRODUCT((YEAR(Cobranzas!$Q$5:$Q$400)=${AÑO})*(MONTH(Cobranzas!$Q$5:$Q$400)=${mes})*IF(ISNUMBER(Cobranzas!$X$5:$X$400);Cobranzas!$X$5:$X$400;0))`,
      previo,
      // El orden importa: primero se descuenta lo ya pagado por retención, después el saldo a favor.
      `=MAX(0;$D${r}-$E${r}-IF($F${r}="";0;$F${r}))`,
      `=MAX(0;IF($F${r}="";0;$F${r})-($D${r}-$E${r}))`,
      m.disponible
        ? `=COUNTIFS(${R}!$A$4:$A;"${m.periodo}";${R}!$B$4:$B;"Ventas")&" / "&COUNTIFS(${R}!$A$4:$A;"${m.periodo}";${R}!$B$4:$B;"Compras")`
        : '—',
      m.es_proyeccion ? `PROYECCIÓN · ritmo real de ${nReales0} meses × inflación de Parámetros` : `ARCA — fórmula sobre ${R}`,
    ])
  }
  const f1 = filas.length
  // Dónde termina lo REAL y dónde empieza la proyección. Hace falta para poder medir la tasa de
  // retención sobre los meses que de verdad ocurrieron y aplicarla al escenario de abajo.
  const nReales = nReales0
  const fProy0 = fReal1 + 1
  const tot = push(['TOTAL 2026',
    `=SUM(B${f0}:B${f1})`, `=SUM(C${f0}:C${f1})`, `=SUM(D${f0}:D${f1})`, `=SUM(E${f0}:E${f1})`, '',
    `=SUM(G${f0}:G${f1})`, '', '', 'La suma de "A PAGAR" es la caja que el IVA se lleva en el año.'])
  push()
  const ult = [...iva].reverse().find((m) => m.disponible)
  push(['⚠ Saldo técnico a favor HOY', Math.round(ult?.saldo_queda ?? 0), '', '', '', '', '', '',
    'Plata de la empresa adelantada al fisco. Si crece mes a mes, hay que revisar las retenciones que sufre (Cobranzas columnas X a AA).'])
  push(['⚠ IVA pagado que figura en Compras', '=SUMIF(Compras!$AC$4:$AC;"Impuestos";Compras!$O$4:$O)', '', '', '', '', '', '', '',
    'Si esto da $0 y arriba hay meses "A PAGAR", el IVA se está pagando fuera del Sheet y el cash flow miente.'])
  push()

  // ── 1 bis. LAS RETENCIONES QUE LE HACEN A LA EMPRESA ────────────────────────────────────────────
  // No estaban en ningún lado del archivo. Una retención es impuesto YA PAGADO: sin computarla, el
  // cuadro muestra un "A PAGAR" inflado y el cash flow proyecta una salida que no va a ocurrir.
  push(['1 bis. RETENCIONES SUFRIDAS — impuesto que la empresa YA pagó por adelantado'])
  push(['Salen de Cobranzas, columnas X, Y y Z. La alícuota de cada una se verifica contra su régimen antes de computarla: los rótulos de dos de esas columnas se habían perdido y una retención imputada al impuesto equivocado es un crédito fiscal que no existe.'])
  push(['Régimen', 'Total retenido', '', 'Alícuota medida', '¿Se computa acá?', '', '', '', '', 'Origen'])
  push(['IVA', Math.round(ret?.porRegimen?.iva ?? 0), '', '80,00% del IVA facturado', 'SÍ — resta del "A PAGAR" de arriba, mes a mes', '', '', '', '',
    'Cobranzas col. X · imputado por fecha de cobro'])
  push(['Ganancias', Math.round(ret?.porRegimen?.ganancias ?? 0), '', '2,00% del neto', 'No: es pago a cuenta de Ganancias, que este cuadro todavía no lleva', '', '', '', '',
    'Cobranzas col. Y'])
  push(['Ingresos Brutos', Math.round(ret?.porRegimen?.iibb ?? 0), '', '2,50% / 3,50% del neto', 'No: YA vienen en la DDJJ de Rentas del bloque 2 — computarlas acá sería contarlas dos veces', '', '', '', '',
    'Cobranzas col. Z'])
  push(['TOTAL RETENIDO', Math.round(ret?.total ?? 0), '', '', 'Plata de la empresa adelantada al fisco.', '', '', '', '', ''])
  // LO QUE NO SE PROYECTA, Y POR QUÉ. Los meses futuros van con retención CERO: quién retiene
  // depende de qué cliente facture cada mes, y hoy sólo ARCOR lo hace. Proyectarla supondría una
  // mezcla de clientes que no está en ningún dato. La consecuencia se declara en vez de taparse.
  push(['⚠ Los meses proyectados van SIN retención', '', '', '',
    'Quién retiene depende de qué cliente se facture, y eso no está proyectado. El "A PAGAR" de agosto a diciembre queda SOBREESTIMADO — es un error conservador, pero es un error.', '', '', '', '', ''])
  // ── EL ESCENARIO, CON NÚMERO ──────────────────────────────────────────────────────────────────
  //
  // "Está sobreestimado" sin una cifra es un aviso que nadie puede usar. Acá va la cifra, y va como
  // ESCENARIO —afuera del cuadro de arriba, en su propio bloque— porque proyectar retenciones
  // supone una mezcla de clientes que no está en ningún dato. La regla es no presentar una
  // inferencia como un hecho; mostrarla con su supuesto explícito es distinto de esconderla.
  //
  // TODO SALE DE FÓRMULAS SOBRE LAS PROPIAS FILAS DEL CUADRO: la tasa se mide sola cada vez que
  // entra un cobro con retención, y el escenario se recalcula. Un porcentaje pegado a mano acá
  // envejecería el día que cambie la cartera de clientes, que es justo lo que hay que vigilar.
  push(['ESCENARIO — ¿y si la mezcla de clientes se mantiene?', '', '', '', '', '', '', '', '',
    'No es una proyección del OS: es qué pasaría SI el mix de clientes de agosto a diciembre se pareciera al de enero a julio.'])
  const fTasaRet = filas.length + 1
  const fTasa = push(['Tasa de retención medida sobre el débito real (ene–jul)',
    `=IFERROR(SUM($E$${f0}:$E$${fReal1})/SUM($B$${f0}:$B$${fReal1});0)`, '', '', '', '', '', '', '',
    'Lo que efectivamente le retuvieron sobre lo que efectivamente facturó. Se mide, no se supone.'])
  const fRetEsc = push(['Retención que tendrían ago–dic a esa misma tasa',
    `=SUM($B$${fProy0}:$B$${f1})*$B$${fTasa}`, '', '', '', '', '', '', '',
    'ESTIMACIÓN. Depende de a quién se le facture: hoy sólo algunos clientes retienen.'])
  push(['⇒ "A PAGAR" de ago–dic si eso ocurriera',
    `=MAX(0;SUM($G$${fProy0}:$G$${f1})-$B$${fRetEsc})`, '', '', '', '', '', '', '',
    `Contra ${'$'}{SUM(G${fProy0}:G${f1})} que muestra el cuadro. La diferencia es plata que el cash flow está reservando para un impuesto que quizás no salga.`.replace('${SUM(G' + fProy0 + ':G' + f1 + ')}', 'lo que muestra el cuadro')])
  if (ret?.sospechosas?.length) {
    push([`⚠ ${ret.sospechosas.length} retención(es) con alícuota que no encaja`, Math.round(ret.sospechosas.reduce((s, x) => s + x.monto, 0)), '', '', 'NO se computaron: puede ser otro régimen o un error de carga. Filas de Cobranzas: ' + ret.sospechosas.map((x) => x.fila).join(', '), '', '', '', '', ''])
  }
  push()

  // ── 2. IIBB ─────────────────────────────────────────────────────────────────────────────────────
  push(['2. INGRESOS BRUTOS (San Juan) — de las DDJJ reales de Rentas, leídas de Drive'])
  const al = alicuotaDeclarada(iibb)
  const cab2 = push(['Período', 'Base imponible', 'Impuesto determinado', 'Retenciones y percepciones sufridas', 'Saldo a favor que venía', 'A PAGAR', 'Saldo a favor que queda', 'Presentada', 'Origen'])
  const i0 = filas.length + 1
  for (const d of iibb) {
    const i = Number((d.periodo ?? '').slice(5, 7)) - 1
    push([
      `${MES[i] ?? d.periodo}-26`, Math.round(d.base_total), Math.round(d.impuesto_determinado),
      Math.round(d.retenciones), Math.round(d.saldo_favor_anterior),
      d.a_favor ? 0 : Math.round(d.a_ingresar),
      d.a_favor ? Math.round(d.a_ingresar) : 0,
      d.fecha_presentacion ?? '',
      `DDJJ Rentas San Juan · control ${d.nro_control ?? '?'}`,
    ])
  }
  const i1 = filas.length
  push(['TOTAL', `=SUM(B${i0}:B${i1})`, `=SUM(C${i0}:C${i1})`, `=SUM(D${i0}:D${i1})`, '', `=SUM(F${i0}:F${i1})`, '', '',
    'Si la columna "A PAGAR" da $0 en todo el semestre, la empresa NO paga IIBB: las retenciones que sufre alcanzan y sobran.'])
  push()
  const fIIBB = push(['Alícuota que la empresa DECLARA', al.alicuota ?? '', '', '', '', '', '', '',
    `Sale de sus propias DDJJ (códigos ${al.codigos.join(' y ')}), no de la ley. NO es 3%: el 3% de la Ley Impositiva es para el código 711001 "Servicios relacionados con la construcción", que Echegaray no usa. Estimar al 3% inflaba el impuesto un 50%.`])
  const ultIIBB = iibb[iibb.length - 1]
  push(['⚠ Saldo a favor de IIBB HOY', Math.round(ultIIBB?.a_favor ? ultIIBB.a_ingresar : 0), '', '', '', '', '', '',
    `Plata de la empresa inmovilizada en Rentas, igual que con el IVA. Venía de ${Math.round(iibb[0]?.saldo_favor_anterior ?? 0).toLocaleString('es-AR')} en enero: está BAJANDO, así que en algún momento la empresa va a empezar a pagar IIBB de verdad.`])
  push(['Consumo mensual del saldo (impuesto − retenciones)', `=IFERROR((C${i1}-D${i1});0)`, '', '', '', '', '', '',
    'Lo que el último mes se comió del saldo a favor. Dividí el saldo por esto para saber cuántos meses faltan para empezar a pagar.'])
  push(['IIBB pagado que figura en Compras', '=SUMPRODUCT((REGEXMATCH(LOWER(Compras!$E$4:$E&" "&Compras!$L$4:$L);"iibb|ingresos brutos|rentas|dgr"))*IF(ISNUMBER(Compras!$O$4:$O);Compras!$O$4:$O;0))', '', '', '', '', '', '',
    'Da $0, y esta vez está BIEN que dé $0: con saldo a favor no hay nada que pagar. El día que el saldo se agote, va a haber que cargarlo acá.'])
  push()

  // ── 3. PLANES DE PAGO ───────────────────────────────────────────────────────────────────────────
  push(['3. PLANES DE PAGO DE DEUDA PREVISIONAL — F931 viejos financiados'])
  push(['Plan', 'Cuotas cargadas', 'Monto por cuota', 'Total cargado', 'Primera', 'Última', '', '', 'Origen'])
  const p0 = filas.length + 1
  for (const p of planes) push([p.nombre, p.cuotas, p.monto_cuota, Math.round(p.total), p.primera ?? '', p.ultima ?? '', '', '', 'Compras, rubro "Deuda previsional (planes de pago)"'])
  const p1 = filas.length
  push(['TOTAL PLANES', `=SUM(B${p0}:B${p1})`, '', `=SUM(D${p0}:D${p1})`, '', '', '', '', ''])
  const fCtrlP = filas.length + 1
  push(['⇒ Control contra Compras', '=SUMIF(Compras!$AC$4:$AC;"Deuda previsional (planes de pago)";Compras!$O$4:$O)', '', `=$B${fCtrlP}-$D${fCtrlP - 1}`, '', '', '', '',
    'La columna D tiene que dar $0: si no, hay cuotas que esta tabla no está viendo.'])
  push()

  // ── 4. FINANCIERO ───────────────────────────────────────────────────────────────────────────────
  push(['4. FINANCIERO — préstamos y créditos'])
  push(['Concepto', 'Total del año', 'Cuotas', '', '', '', '', '', 'Origen'])
  const b0 = filas.length + 1
  push(['Crédito prendario — Camioneta Ford XLS',
    '=SUMIF(Compras!$AC$4:$AC;"Financiero";Compras!$O$4:$O)',
    '=COUNTIF(Compras!$AC$4:$AC;"Financiero")', '', '', '', '', '',
    'Compras, rubro "Financiero". Cuotas 15 a 26 de 2026.'])
  push()

  // ── 5. LO QUE FALTA ─────────────────────────────────────────────────────────────────────────────
  push(['LO QUE FALTA PARA QUE ESTA PESTAÑA ESTÉ COMPLETA'])
  push(['· La alícuota de IIBB de San Juan para construcción (celda B' + fIIBB + ').'])
  push(['· Cargar en Compras los pagos de IVA y de IIBB que se hayan hecho. Hoy no hay ninguno y el cash flow no los ve.'])
  push(['· Revisar las retenciones de IVA que sufre la empresa (Cobranzas, columnas X a AA): son la causa probable del saldo a favor creciente.'])
  return { filas, fTasaRet, f0, f1, tot, p0, p1, b0, cab, fIIBB, i0, i1 }
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
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
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
  // La tasa de retención medida es un PORCENTAJE, no plata: con formato moneda se mostraba como
  // "$0" y el escenario entero parecía roto. Es el defecto que caza defectos-pantalla.mjs, cometido
  // por mí en la misma sesión en que lo construí — el formato lo pone el rectángulo de arriba y hay
  // que devolvérselo a la celda que no es un importe.
  if (g.fTasaRet) {
    fmt({ ...r(g.fTasaRet - 1, g.fTasaRet), startColumnIndex: 1, endColumnIndex: 2 },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'PERCENT', pattern: '0.0%' }, horizontalAlignment: 'RIGHT' })
  }
  fmt({ ...r(g.p0 - 1, g.p1 + 1), startColumnIndex: 1, endColumnIndex: 2 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })
  fmt({ ...r(g.b0 - 1, g.b0), startColumnIndex: 2, endColumnIndex: 3 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })
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
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
