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
import * as E from '../lib/estilo-pestana.mjs'
import { posicionIvaCompleta } from '../lib/posicion-iva.mjs'
import { clasificar, mes as mesDe, COLUMNAS } from '../lib/retenciones-sufridas.mjs'
import { query } from '../lib/db.mjs'
import { parsearDDJJ, alicuotaDeclarada } from '../lib/iibb-ddjj.mjs'
import { parsearDJIVA } from '../lib/iva-ddjj.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { borrarNotas } from '../lib/nota-celda.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { seccion, sub as subItem, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
// LAS COLUMNAS DE COMPRAS, POR SU ENCABEZADO. Esta pestaña todavía las referenciaba por su LETRA
// ($AC, $O): es exactamente lo que dejó el cuadro de "pagado" de Cargas Sociales en #VALUE! durante
// semanas cuando alguien movió una columna. El nombre no se mueve; la posición sí.
import { resolverColumnas, rango } from '../lib/compras-columnas.mjs'

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
// Las DDJJ de IVA (F.2051) presentadas ante ARCA viven en su propia carpeta de Drive (MM-2026.pdf).
// Se listan y se leen igual que IIBB: la DDJJ oficial es la fuente primaria, no el cálculo por
// comprobantes. Carpeta: .../Impuestos y Financiero/2026/IVA
const CARPETA_IVA = '1tLLahzfaTKZPbOi8M6IJLbAunFgappXx'

// ═══ LA RÉPLICA DE LAS DDJJ DE IIBB ═══
//
// POR QUÉ EXISTE (27/07). El censo daba 34 números pegados en esta pestaña y la mitad eran los datos
// de la DDJJ de Ingresos Brutos —base imponible, alícuota, retenciones, saldo a favor— que se leen
// del PDF de Rentas y se PEGABAN como valor en el cuadro. Se veían bien y no se actualizaban solos:
// exactamente lo que ya había pasado con el IVA, y se resolvió igual (_ARCA_RAW). Si el insumo no
// está en el Sheet, se trae el INSUMO —una réplica que declara su corte y su fuente— y el cuadro de
// IIBB se escribe entero con fórmulas que la referencian.
export const IIBB_RAW = '_IIBB_RAW'
/** Las columnas de la réplica. El orden es contrato: las fórmulas de la sección 2 lo referencian. */
const IIBB_COLS = [
  ['Período', 'texto'],
  ['Base imponible', 'moneda'],
  ['Alícuota', 'porcentaje'],
  ['Impuesto determinado', 'moneda'],
  ['Retenciones y percep.', 'moneda'],
  ['Saldo a favor anterior', 'moneda'],
  ['Fecha present.', 'texto'],
  ['N° control', 'texto'],
  ['Leído de', 'texto'],
]
/** Dónde vive cada columna de _IIBB_RAW, para no buscarla por posición a ojo. */
const IIBB_COL = { periodo: 'A', base: 'B', alicuota: 'C', impuesto: 'D', retenciones: 'E', saldoAnt: 'F' }
const IIBB_FILA0 = 4  // primera fila de datos (título, nota, encabezados, datos)

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
    // nombre = cómo se muestra; patron = el fragmento que la SUMIFS de la sección 5 usa para sumar las
    // cuotas desde el Sheet (no se pega el importe, se referencia Compras); campo = EN QUÉ columna de
    // Compras vive ese fragmento — verificado leyendo las 15 filas reales: el W303094 se identifica por
    // "Concepto", y los dos planes de deuda previsional por "Detalles / Obra". Buscar en la columna
    // equivocada daría cero, o sea una cuota que se paga y el cuadro declararía inexistente.
    const [nombre, patron, campo] = /w303094/i.test(c) ? ['Plan F931 W303094 (financiación junio)', 'W303094', 'concepto']
      : /dic\s*25/i.test(c) ? ['Deuda previsional F931 Diciembre 2025', '931 Dic 25', 'detalle']
        : /enero\s*26/i.test(c) ? ['Deuda previsional F931 Enero 2026', '931 Enero 26', 'detalle']
          : ['Otro plan', null, null]
    const p = planes.get(nombre) ?? { nombre, patron, campo, cuotas: 0, total: 0, primera: null, ultima: null, monto_cuota: 0 }
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
function grilla(iva, planes, iibb, ivaOficial, C) {
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

  // ── 1 · IVA — LA DDJJ OFICIAL (F.2051) ───────────────────────────────────────────────────────────
  // Antes se CALCULABA desde _ARCA_RAW (débito − crédito con arrastre técnico). El dueño trajo a Drive
  // las F.2051 presentadas: la fuente primaria. Igual que IIBB se lee de la DDJJ de Rentas, el IVA
  // ahora se lee del F.2051. Y el dato oficial corrige dos cosas que el cálculo no mostraba:
  //   (1) la empresa NO paga IVA en efectivo — tiene ~$19,3M de crédito de LIBRE DISPONIBILIDAD que
  //       absorbe cualquier posición a favor de ARCA (marzo: $10,75M técnico, $0 en efectivo);
  //   (2) esa libre disponibilidad es la plata realmente inmovilizada en el fisco, no el saldo técnico.
  push([seccion(1, 'IVA — la DDJJ oficial (F.2051): qué se debe o se tiene a favor')])
  cabecera()
  const porMesOf = new Map((ivaOficial ?? []).filter((d) => d.periodo).map((d) => [Number(String(d.periodo).slice(5, 7)), d]))
  const mesesOf = M12.filter((m) => porMesOf.has(m))
  const ultOf = mesesOf[mesesOf.length - 1]
  // Los importes son VALORES de la DDJJ presentada, no fórmulas: el número oficial no se recalcula.
  const of = (m, campo) => (porMesOf.has(m) ? porMesOf.get(m)[campo] : VACIO)

  mensual('Débito fiscal del período', (m) => of(m, 'debito'),
    'F.2051 · IVA generado por las ventas del mes.', { meses: mesesOf })
  mensual('Crédito fiscal del período', (m) => of(m, 'credito'),
    'F.2051 · IVA de las compras computable del mes.', { meses: mesesOf })
  mensual(rotuloTotal('IVA a pagar en efectivo'), (m) => of(m, 'a_pagar_efectivo'),
    'Lo absorbe el crédito de libre disponibilidad. En 2026 no salió plata por IVA — no es un egreso del cash flow.', { meses: mesesOf })
  mensual('Posición técnica del mes (+ debe ARCA / − a favor)', (m) => of(m, 'posicion_tecnica'),
    'F.2051 · positivo = a favor de ARCA (sólo marzo); negativo = a favor del contribuyente.', { meses: mesesOf, totaliza: false })
  const fLibre = mensual('Saldo de libre disponibilidad (acumulado)', (m) => of(m, 'libre_disp'),
    'F.2051 · crédito de la empresa inmovilizado en ARCA. Se arrastra; el total no aplica.', { meses: mesesOf, totaliza: false })
  const fDDJJ = mensual('DDJJ presentada', (m) => (porMesOf.has(m) ? `${porMesOf.get(m).fecha_presentacion} · N°${porMesOf.get(m).nro_transaccion}` : VACIO),
    'F.2051 presentada ante ARCA. Fuente primaria, verificable por N° de transacción.', { meses: mesesOf, totaliza: false })
  push()

  // ── 2 · INGRESOS BRUTOS ────────────────────────────────────────────────────────────────────────
  push([seccion(2, 'Ingresos Brutos San Juan — ¿cuánto se debe cada mes?')])
  cabecera()
  const porMesIIBB = new Map(iibb.map((d) => [Number(String(d.periodo ?? '').slice(5, 7)), d]))
  const mesesIIBB = M12.filter((m) => porMesIIBB.has(m))
  const fBase = filas.length + 1
  const fAli = fBase + 1
  const fImp = fBase + 2
  const fRetI = fBase + 3
  // (fBase + 4 es la fila "a pagar" de IIBB: nadie la referencia)
  const fSaldoI = fBase + 5
  // CADA DATO DE LA DDJJ SE REFERENCIA DESDE _IIBB_RAW, NO SE PEGA. Antes base, alícuota, retenciones
  // y saldo a favor se escribían como valor —34 números pegados que el censo marcaba— y no se
  // actualizaban solos. Ahora salen del PDF de Rentas replicado en _IIBB_RAW por su período (rango
  // cerrado, INDEX+MATCH), igual que el IVA sale de _ARCA_RAW.
  const rangoIIBB = (col) => `${IIBB_RAW}!$${col}$${IIBB_FILA0}:$${col}$40`
  const refIIBB = (m, col) => `IFERROR(INDEX(${rangoIIBB(col)};MATCH("${porMesIIBB.get(m).periodo}";${rangoIIBB(IIBB_COL.periodo)};0));0)`
  const prevI = (m) => (m === mesesIIBB[0] ? refIIBB(m, IIBB_COL.saldoAnt) : `${cmes(m - 1)}${fSaldoI}`)

  mensual('Base imponible declarada', (m) => `=${refIIBB(m, IIBB_COL.base)}`,
    'DDJJ de Rentas · réplica _IIBB_RAW. Leída del PDF: aparece sola cuando se sube el mes nuevo a la carpeta de Drive.', { meses: mesesIIBB })
  // LA ALÍCUOTA POR MES, NO UNA CONSTANTE ENTERRADA. Si Rentas cambia la alícuota de la actividad a
  // mitad de año, la nueva DDJJ la trae y _IIBB_RAW la refleja: todo lo de abajo se recalcula solo.
  mensual('Alícuota de la actividad', (m) => `=${refIIBB(m, IIBB_COL.alicuota)}`,
    'DDJJ de Rentas · réplica _IIBB_RAW. Es la que la empresa declara (base ponderada), no la de la ley.', { meses: mesesIIBB, totaliza: false })
  mensual('Impuesto determinado', (m) => `=${cmes(m)}${fBase}*${cmes(m)}${fAli}`, 'Base × alícuota.', { meses: mesesIIBB })
  mensual('Retenciones sufridas', (m) => `=${refIIBB(m, IIBB_COL.retenciones)}`,
    'DDJJ de Rentas · réplica _IIBB_RAW. Ya vienen computadas ahí: no se vuelven a sumar en la sección 3.', { meses: mesesIIBB })
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


  // ── 4 · LOS OTROS IMPUESTOS ────────────────────────────────────────────────────────────────────
  //
  // POR QUÉ SE AGREGÓ (23/07). El dueño: "además de IVA e IIBB hay otros impuestos que no se
  // consideran". Tenía razón, y el más caro estaba a la vista de nadie: el IMPUESTO AL CHEQUE. El
  // banco lo debita solo, 21 veces en el mes que cubre el extracto, y la pestaña de impuestos no lo
  // miraba. En un mes son medio millón de pesos que ningún cuadro fiscal mostraba.
  //
  // LA ALÍCUOTA NO SE CITA DE MEMORIA — LA DECLARA EL BANCO. El concepto del débito dice literalmente
  // "Impuesto ley 25.413 debito 0,6%". Ese es el dato, con su fuente; la skill de impuestos prohíbe
  // afirmar una alícuota vigente sin verificarla, y acá no hace falta: viene escrita en el extracto.
  //
  // LO QUE NO ESTÁ, SE DECLARA VACÍO. Tasa municipal de seguridad e higiene y sellos: no hay una sola
  // fila en Compras ni en el banco. No se estiman — se nombran como gap, que es lo único honesto.
  push([seccion(4, 'Otros impuestos — ¿qué más se paga y no estaba a la vista?')])
  cabecera()
  const B = '_BANCO_RAW'
  const porMesBanco = (patron) => (m) =>
    `=SUMPRODUCT((YEAR(${B}!$A$4:$A)=${AÑO})*(MONTH(${B}!$A$4:$A)=${m})*ISNUMBER(SEARCH("${patron}";${B}!$F$4:$F))*ABS(IF(ISNUMBER(${B}!$C$4:$C);${B}!$C$4:$C;0)))`
  const o0 = filas.length + 1
  const fCheque = mensual('Impuesto al cheque (Ley 25.413)', porMesBanco('Impuesto al cheque'),
    'Extracto Santander · el banco lo debita solo y declara la alícuota en el concepto ("debito 0,6%"). Sólo hay dato en los meses que cubre el extracto.')
  // Y EN LA COLUMNA DONDE ESTÁ, NO EN LA QUE PARECE. El texto "Anticipo de Ganancias" no vive en
  // "Concepto" sino en "Detalles / Obra": buscarlo en la columna equivocada daba cero en los doce
  // meses, o sea un impuesto que se paga y el cuadro declaraba inexistente. Se buscó dónde está.
  //
  // POR LA FECHA PREVISTA DE PAGO, NO POR LA DE CAJA. Estas cuatro filas de Compras no tienen "Fecha
  // de caja" cargada, así que filtrando por ahí la fila daba CERO en los doce meses — un impuesto que
  // se paga y que el cuadro mostraba como inexistente. Se usa la fecha con la que fueron cargadas.
  mensual('Anticipo de Ganancias', (m) =>
    `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.detalle)};"*Anticipo de Ganancias*";${rango(C.fechaPrev)};">="&DATE(${AÑO};${m};1);${rango(C.fechaPrev)};"<="&EOMONTH(DATE(${AÑO};${m};1);0));0)`,
  'Compras · concepto "Anticipo de Ganancias", por su fecha prevista de pago. Es pago a cuenta del impuesto anual: se recupera recién en la DDJJ.')
  const o1 = filas.length
  mensual(rotuloTotal('Total otros impuestos'), (m) => `=SUM(${cmes(m)}${o0}:${cmes(m)}${o1})`,
    'Lo que se paga por fuera de IVA, IIBB y cargas sociales.')
  push([`   · costo del impuesto al cheque proyectado a los meses sin extracto`, ...M12.map((m) => (m > new Date().getMonth() + 1
    ? `=IFERROR(AVERAGEIF($B$${fCheque}:$M$${fCheque};">0");0)` : VACIO)), `=SUM($B${filas.length + 1}:$M${filas.length + 1})`,
  'Promedio de los meses con extracto. El extracto cubre un mes: la base es fina y hay que decirlo.'])
  push(['⚠ Tasa municipal de seguridad e higiene', ...Array(13).fill(VACIO),
    'NO hay una sola fila en Compras ni en el banco. Si la obra tributa tasa municipal, hoy ese costo no está en ningún cuadro. No se estima.'])
  push(['⚠ Impuesto de sellos', ...Array(13).fill(VACIO),
    'Sin dato. Aplica sobre contratos: si se firmó alguno con sellado, no está registrado.'])
  push()

  // ── 5 · PLANES DE PAGO F931 ────────────────────────────────────────────────────────────────────
  push([seccion(5, 'Planes de pago F931 — ¿qué cuota vence cada mes?')])
  cabecera()
  const q0 = filas.length + 1
  // CADA CUOTA SE SUMA DESDE COMPRAS, NO SE PEGA. Antes cada importe mensual del plan se escribía como
  // valor (catorce números pegados que el censo marcaba). Ahora se referencian las filas reales de
  // Compras por su concepto y su fecha prevista de pago — el mismo patrón que "Anticipo de Ganancias"
  // de la sección 4, y por la misma razón: estas filas no tienen "Fecha de caja" cargada.
  // EN QUÉ columna de Compras vive el identificador de cada plan lo decidió planesDePago tras leer las
  // 15 filas reales: W303094 por "Concepto", los dos de deuda previsional por "Detalles / Obra".
  const colPlan = (campo) => (campo === 'concepto' ? C.concepto : C.detalle)
  const cuotaPlan = (p) => (m) => `=IFERROR(SUMIFS(${rango(C.total)};${rango(colPlan(p.campo))};"*${p.patron}*";${rango(C.fechaPrev)};">="&DATE(${AÑO};${m};1);${rango(C.fechaPrev)};"<="&EOMONTH(DATE(${AÑO};${m};1);0));0)`
  for (const p of planes) {
    const sinFechas = !p.porMes.some((x) => x)
    const meses = M12.filter((m) => p.porMes[m])
    // Sin fechas cargadas (o sin patrón reconocido), la fila queda sin un solo importe en los doce
    // meses y se lee como un error. El rótulo dice por qué está vacía, ahí donde el ojo la busca.
    mensual(sinFechas || !p.patron ? `${p.nombre}  ⚠ sin fechas de vencimiento cargadas` : p.nombre,
      cuotaPlan(p),
      `${p.cuotas} cuota(s) de ${p.monto_cuota.toLocaleString('es-AR')} · total ${Math.round(p.total).toLocaleString('es-AR')} · Compras, concepto "${p.patron ?? p.nombre}", por su fecha prevista de pago`
      + (sinFechas ? ' · ⚠ SIN FECHAS DE VENCIMIENTO cargadas: por eso la fila está vacía y su plata no aparece en ningún mes.' : ''),
      { meses })
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
  push([seccion(6, 'Deuda financiera — ¿cuánta plata se va por mes, y cuánto falta')])
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
  const fDeudaPrend = push(['Deuda pendiente del prendario', `=SUMIF(${rango(C.rubro)};"Financiero";${rango(C.total)})`,
    ...Array(11).fill(VACIO), VACIO, 'Compras, rubro "Financiero". Es un saldo, no una serie: por eso va fuera de la grilla mensual.'])
  const fDeudaPlanes = push(['Deuda pendiente de los planes', `=$N$${fPlanTot}`,
    ...Array(11).fill(VACIO), VACIO, `Total de las ${planes.reduce((s, p) => s + p.cuotas, 0)} cuotas de los ${planes.length} planes cargadas en Compras (todas caen en ${AÑO}): es el total del año de arriba.`])
  push()

  // ── 6 · LO QUE FALTA ───────────────────────────────────────────────────────────────────────────
  // EL TEXTO DE ESTAS FILAS VA EN LA COLUMNA A, NO EN LA DE PROCEDENCIA. Cuando la procedencia pasó
  // a ser una nota, estas dos filas —cuyo contenido vivía SÓLO ahí— quedaron mudas: se veía el
  // rótulo "⚠ Alícuota de IIBB" y nada más. Una advertencia escondida detrás de un hover no advierte.
  push([seccion(7, 'Lo que falta para que esta pestaña se actualice sola')])
  push(['⚠ Los pagos de IVA e IIBB no están cargados en Compras: hoy el cash flow no ve esas salidas.'])
  push(['⚠ La alícuota de IIBB se toma de las DDJJ leídas. Conviene que la confirme el contador.'])

  // ── EL HERO, RECIÉN AHORA: ya se sabe en qué fila quedó cada total ──────────────────────────────
  // El saldo a favor de IVA es la LIBRE DISPONIBILIDAD de la última DDJJ (ya incluye técnico +
  // retenciones/percepciones de IVA). El de IIBB, el saldo a favor de su última DDJJ. Por eso las
  // retenciones NO se vuelven a sumar al total: ya están adentro de esos dos saldos (doble conteo).
  const saldoIVA = ultOf ? `${cmes(ultOf)}${fLibre}` : '0'
  const saldoIIBB = mesesIIBB.length ? `${cmes(mesesIIBB[mesesIIBB.length - 1])}${fSaldoI}` : '0'
  const hero = [
    ['LA POSICIÓN', 'Monto', ...Array(11).fill(VACIO), VACIO, 'De dónde sale'],
    [rotuloTotal('A favor del fisco — plata inmovilizada'), `=${saldoIVA}+${saldoIIBB}`, ...Array(11).fill(VACIO), VACIO, 'Crédito de la empresa en el fisco (IVA + IIBB). Ya incluye las retenciones sufridas.'],
    [subItem('saldo a favor de IVA (libre disponib.)'), `=${saldoIVA}`, ...Array(11).fill(VACIO), VACIO, 'DDJJ F.2051 · libre disponibilidad del último período presentado.'],
    [subItem('saldo a favor de IIBB'), `=${saldoIIBB}`, ...Array(11).fill(VACIO), VACIO, 'DGR San Juan · última DDJJ presentada.'],
    [subItem('retenciones sufridas en el año'), `=$N$${fRetTotal}`, ...Array(11).fill(VACIO), VACIO, 'Cobranzas · YA incluidas en los saldos de arriba; no se suman de nuevo (referencia).'],
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
    titular: heroBase + 2,
    heroTotales: [heroBase + 2, heroBase + 7],
    alicuotas: [fAli],
    textos: [fDDJJ],
    proyectados: [],
    saldos: [fLibre, fSaldoI, fSalidaFin],
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
      // La alícuota de ESTE mes, ponderada por su base — no el promedio de todo el año. Es lo que
      // deja que _IIBB_RAW guarde la alícuota mes a mes y que Rentas la cambie sin romper el cuadro.
      const alic = alicuotaDeclarada([d]).alicuota
      out.push({ ...d, periodo: d.periodo ?? periodo, alicuota: alic, fuente: f.name })
    } catch (e) {
      // Un PDF que no se puede leer NO se rellena con ceros: se omite y se avisa.
      console.error(`  ⚠ no pude leer la DDJJ de ${periodo}: ${e.message}`)
    }
  }
  return out
}

/** Lee las DDJJ de IVA (F.2051) desde los PDF originales de Drive. Mismo patrón que leerIIBB. */
async function leerIVA(google) {
  const out = []
  const archivos = (await google.listFolder(CARPETA_IVA).catch((e) => { console.error(`  ⚠ no pude listar la carpeta de IVA: ${e.message}`); return [] }))
    .filter((f) => /^\d{2}-\d{4}\.pdf$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const f of archivos) {
    const periodo = `${f.name.slice(3, 7)}-${f.name.slice(0, 2)}`
    try {
      const pdf = await google.readPdfText(f.id, { maxChars: 8000 })
      const d = parsearDJIVA(pdf?.text ?? '')
      out.push({ ...d, periodo: d.periodo ?? periodo, fuente: f.name })
    } catch (e) {
      // Un PDF que no se puede leer NO se rellena con ceros: se omite y se avisa.
      console.error(`  ⚠ no pude leer la DDJJ de IVA de ${periodo}: ${e.message}`)
    }
  }
  return out
}

/**
 * Escribe la réplica _IIBB_RAW: las DDJJ de Ingresos Brutos leídas del PDF, adentro del Sheet, con su
 * corte y su fuente declarados. Es una COPIA de lo que dice el PDF de Rentas al momento del corte —no
 * "el dato"—, por eso la fila 1 dice cuándo se sacó y de qué carpeta. Mismo patrón que _ARCA_RAW.
 */
async function escribirIIBBRaw(google, iibb) {
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const datos = [...iibb]
    .filter((d) => d.periodo)
    .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)))
    .map((d) => [
      // Apóstrofo: sin él USER_ENTERED parsea "2026-06" como fecha y los MATCH de la sección 2 fallan
      // en silencio (el mismo bug que _ARCA_RAW documenta en su columna Período).
      `'${d.periodo}`,
      Number(d.base_total) || 0,
      Number(d.alicuota) || 0,
      Number(d.impuesto_determinado) || 0,
      Number(d.retenciones) || 0,
      Number(d.saldo_favor_anterior) || 0,
      // Apóstrofo: "13/01/2026" sin él lo parsea USER_ENTERED como fecha y queda el serial 46072, no
      // la fecha que trae el PDF. Es el mismo cuidado que la columna Período.
      d.fecha_presentacion ? `'${d.fecha_presentacion}` : '',
      d.nro_control ? `'${d.nro_control}` : '',
      String(d.fuente ?? ''),
    ])

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === IIBB_RAW)
  const filasNecesarias = Math.max(datos.length + IIBB_FILA0 + 20, 40)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: IIBB_RAW, gridProperties: { rowCount: filasNecesarias, columnCount: IIBB_COLS.length + 1, frozenRowCount: 3 } } },
    }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === IIBB_RAW)
    console.log(`  pestaña ${IIBB_RAW} creada`)
  } else if ((hoja.rows ?? 0) < filasNecesarias) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filasNecesarias } }, fields: 'gridProperties.rowCount' },
    }])
  }

  const gridRaw = [
    [`${IIBB_RAW} — réplica de las DDJJ de Ingresos Brutos de la DGR San Juan · corte ${corte}`],
    [`${datos.length} DDJJ. NO se carga a mano: el agente la reescribe en cada corrida leyendo los PDF originales de Rentas (carpeta de Drive). Existe para que el cuadro de IIBB de "Impuestos y Financieros" sea una fórmula sobre datos que están en el archivo, y no un número calculado afuera y pegado. La alícuota es la que la empresa declara (base ponderada), no la de la ley.`],
    IIBB_COLS.map(([n]) => n),
    ...datos,
  ]
  // Espejo de una fuente externa (Rentas): copia byte a byte, sin candado ni Regla 0 —no hay nada del
  // dueño que proteger y "respetar" congelaría un campo si la DDJJ cambiara.
  await escribirPreservando(google, ID, IIBB_RAW, gridRaw, { respetar: false, espejo: true, anchoHoja: Math.max(IIBB_COLS.length, hoja.cols ?? IIBB_COLS.length) })

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, filasNecesarias, IIBB_COLS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, IIBB_COLS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, IIBB_COLS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, IIBB_COLS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  IIBB_COLS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(IIBB_FILA0 - 1, filasNecesarias, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    const ancho = unidad === 'moneda' ? E.ANCHO.numero : unidad === 'porcentaje' ? E.ANCHO.fecha : j === 0 ? E.ANCHO.fecha : E.ANCHO.texto
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ancho }, fields: 'pixelSize' } })
  })
  for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 300))
  console.log(`  ${IIBB_RAW}: ${datos.length} DDJJ escritas`)
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
  const ivaOficial = await leerIVA(google)
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
  const cabCompras = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { col: C, faltan } = resolverColumnas(cabCompras, {
    total: 'Total', concepto: 'Concepto', fecha: 'Fecha de caja', rubro: 'Rubro de caja', fechaPrev: 'Fecha prevista de pago (día)', detalle: 'Detalles / Obra',
  })
  if (faltan.length) { console.error(`⚠ faltan columnas en Compras: ${faltan.join(', ')} — no escribo con referencias inventadas`); process.exit(1) }
  console.log(`  Compras por encabezado: Total=${C.total} · Concepto=${C.concepto} · Fecha de caja=${C.fecha} · Rubro=${C.rubro}`)
  const g = grilla(iva, planes, iibb, ivaOficial, C)
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

  // PRIMERO la réplica _IIBB_RAW: las fórmulas de la sección 2 la referencian, así que tiene que
  // existir con sus datos ANTES de escribir el cuadro que la lee.
  await escribirIIBBRaw(google, iibb)

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

  // ═══ REGLA 0 — REVISAR LO QUE LA PERSONA EDITÓ, ANTES DE ESCRIBIR ═══
  // Si el dueño reescribió un rótulo, lo reencuadró o lo borró, gana lo suyo y el generador se
  // adapta. Se compara contra lo que ESTE generador escribió la última vez, que es la única forma
  // de distinguir una edición de una versión vieja de sí mismo. Ver lib/respetar-ediciones.mjs.
  const { grid: gridFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTAÑA, g.filas, previoTab)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  g.filas = gridFinal
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, g.filas, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  await formatear(google, hoja.sheetId, g, hoja.rows ?? 0)

  // VERIFICAR MIRANDO LA PESTAÑA, no confiando en que la escritura salió bien.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|VALOR|¡|¿|DIV|NAME|NUM|NULL)/i.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '✓ ninguna celda en error')
  const defectos = auditarPatron(v)
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(16)}${String(f[13] ?? '').padStart(16)}`)
  // El registro de rótulos se guarda con lo que QUEDÓ escrito, no con lo que quise escribir.
  await guardarRegistro(ID, PESTAÑA, g.filas, ediciones, v, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  if (err.length || defectos.length) process.exitCode = 1
}

/** El formato: la piel de statement compartida más lo propio de la grilla mensual. */
async function formatear(google, sheetId, g, filasHoja = 0) {
  // ═══ SIN NOTAS (23/07) ═══
  //
  // Primero el texto de procedencia vivía en una columna al costado de cada fila: un muro. Se pasó a
  // NOTA de celda, y el dueño: "quitá las notas de impuestos y financieros, son confusas". Tiene
  // razón — veintiocho triangulitos amarillos son veintiocho invitaciones a interrumpir la lectura,
  // y la mitad decían cosas como "Compras." que no explican nada.
  //
  // La trazabilidad NO se pierde: cada sección declara su fuente en su propio título o en su nota de
  // sección, y el subtítulo de la pestaña lista las cinco fuentes. Eso es lo que hace un tearsheet:
  // la procedencia al pie, una vez, no ochenta veces al margen.
  const { requests: notas } = borrarNotas(g.filas, ANCHO - 1, sheetId)
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })
  const AMBAR = { red: 1, green: 0.97, blue: 0.88 }

  // Los doce meses más el total: moneda, a la derecha. Es lo que permite comparar hacia abajo sin
  // volver a leer el encabezado en cada bloque.
  fmt(r(3, n, 1, 14), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  // La columna de origen: chica, apagada, y que envuelva. Es explicación, no dato.

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

  // ═══ DEVOLVER LAS FILAS A SU ALTURA ═══
  // Al sacar el muro de texto de la derecha, las filas quedaron con el alto que ese texto necesitaba
  // para envolver en cuatro líneas: la pestaña medía tres pantallas de aire. Un alto que nadie
  // resetea es la huella del layout anterior, igual que una itálica heredada.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 124 }, fields: 'pixelSize' } })
  // La columna de procedencia ya no muestra texto (vive en la nota): angosta.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } })
  req.push(...notas)
  await google.spreadsheetBatchUpdate(ID, req)
  // PIEL DE STATEMENT encima del formato de número: sin reja, secciones y encabezados por tipografía
  // + hairline (no barras rellenas), totales rulados. La misma que CAJA, Cheques y Cargas Sociales.
  await google.spreadsheetBatchUpdate(ID, skinRequests({ sheetId, filas: g.filas, cols: ANCHO, congeladas: 2, titular: g.titular, filasHoja: filasHoja }))
  // Ninguna fila queda OCULTA: un colapso de una versión anterior dejó filas con hiddenByUser=true,
  // y borrar el grupo no las vuelve a mostrar.
  await google.spreadsheetBatchUpdate(ID, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
