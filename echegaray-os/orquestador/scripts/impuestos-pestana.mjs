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
import {
  anclaDeProyeccion, aNumero, formulaDebitoProyectado, formulaCreditoProyectado,
  formulaAPagarProyectado, formulaLibreDispProyectada, supuestoDelMes, RANGO_ALICUOTA_IVA,
  proyectarLibreDisponibilidad, mesEnQueSeAgota, filasReferenciadas, contratoDeFilas,
} from '../lib/iva-libre-disponibilidad.mjs'
import { publicar as publicarNombres } from '../lib/rangos-nombrados.mjs'
import { clasificar, mes as mesDe, COLUMNAS } from '../lib/retenciones-sufridas.mjs'
import { query } from '../lib/db.mjs'
import { parsearDDJJ, alicuotaDeclarada } from '../lib/iibb-ddjj.mjs'
import { parsearDJIVA } from '../lib/iva-ddjj.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { borrarNotas, vaciarColumnaDeProsa } from '../lib/nota-celda.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { seccion, sub as subItem, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
// LAS COLUMNAS DE COMPRAS, POR SU ENCABEZADO. Esta pestaña todavía las referenciaba por su LETRA
// ($AC, $O): es exactamente lo que dejó el cuadro de "pagado" de Cargas Sociales en #VALUE! durante
// semanas cuando alguien movió una columna. El nombre no se mueve; la posición sí.
import { resolverColumnas, rango } from '../lib/compras-columnas.mjs'
// LOS DOS RÓTULOS QUE EL CASH FLOW BUSCA EN ESTA PESTAÑA. No se escriben a mano acá: el consumidor los
// ubica POR TEXTO en la columna A, así que el texto es el contrato entre las dos pestañas y tiene una
// sola definición. Ver el bloque "EL CALENDARIO FISCAL" en lib/cash-flow-lineas.mjs.
import { CALENDARIO_IMPUESTOS } from '../lib/cash-flow-lineas.mjs'
import { formulaUltimaFecha, formulaUltimoPeriodo, rotuloPorFuente, DIAS_AVISO_MENSUAL } from '../lib/fecha-de-frescura.mjs'

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

/** Las otras dos réplicas que alimentan esta pestaña. Sus columnas son contrato, igual que las de IIBB. */
export const ARCA_RAW = '_ARCA_RAW'
const ARCA_FILA0 = 4
export const BANCO_RAW = '_BANCO_RAW'

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
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LAS LÍNEAS DEL CASH FLOW DE LAS QUE SALE LA PROYECCIÓN DE IVA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// SE UBICAN POR SU RÓTULO, NUNCA POR SU FILA. Escribir 'Cash Flow Mensual'!I$24 acá es fabricar un
// rango fosilizado: el cash flow se regenera entero y una fila insertada arriba convierte esa
// referencia en otra cosa, en silencio y sin error. Ya pasó con Estructura!$15 y Recurrentes!$24.
//
// EL CRÉDITO NO USA EL TOTAL DE PROVEEDORES. "Cheques sin factura cargada" y "Cuotas de tarjeta sin
// factura cargada" son plata que sale pero SIN comprobante, y sin comprobante no hay crédito fiscal
// computable. Meterlas inflaría el crédito y haría desaparecer un pago de IVA que sí va a ocurrir.
// Por eso se suman las sub-líneas con factura, una por una, y no el subtotal.
const CF = 'Cash Flow Mensual'
const LINEAS_DEBITO = [
  'Cobros por ventas y servicios (ya cobrado)',
  'Cobranzas esperadas — de este mes en adelante (proyección, suma al flujo)',
]
const LINEAS_CREDITO = [
  'Materiales e insumos de obra civil',
  'Materiales de mantenimiento',
  'Gastos de estructura y administración',
  'Servicios recurrentes',
]

/** La fila de cada rótulo en la columna A del cash flow. Rompe si falta alguno: una referencia a una
 *  fila que no existe devuelve 0 y el cuadro proyectaría $0 de IVA otra vez, que es el defecto que
 *  esto vino a arreglar. */
export function ubicarLineas(colA = [], rotulos = []) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const idx = new Map(colA.map((f, i) => [norm(f?.[0]), i + 1]))
  const filas = rotulos.map((r) => ({ rotulo: r, fila: idx.get(norm(r)) ?? null }))
  const faltan = filas.filter((f) => !f.fila).map((f) => f.rotulo)
  if (faltan.length) {
    throw new Error(`impuestos-pestana: no encuentro en "${CF}" la(s) línea(s): ${faltan.join(' · ')}. `
      + 'Sin ellas la proyección de IVA saldría $0 — no escribo una referencia muerta.')
  }
  return filas.map((f) => f.fila)
}

/**
 * NINGUNA BASE PUEDE LLEVAR UN TOTAL Y UNO DE SUS COMPONENTES A LA VEZ.
 *
 * POR QUÉ EXISTE (04/08). El cuadro está armado con totales sin sangría y componentes indentados
 * debajo: la fila 6 es "Cobros por ventas y servicios" y las 7·8·9 son su desglose; la 10 es
 * "Cobranzas esperadas" y las 11·12·13 el suyo. Sumar un total Y uno de sus hijos cuenta esa plata
 * dos veces, y el resultado NO se delata: no hay #ERROR, no hay negativo imposible, sólo un impuesto
 * más grande. Sobre agosto, la fila 10 ($151.317.518) más su componente 11 daría $302,6M de base y
 * $52,5M de débito donde corresponden $29,8M — un cuadro que le reserva a la empresa el doble de
 * plata para el fisco, con la firma de quien lo aplicó.
 *
 * Hoy la base no solapa (débito 6+10, dos totales sin parentesco; crédito 24+25+29+30, cuatro
 * componentes hermanos). Esto no arregla un defecto vivo: impide que aparezca cuando alguien agregue
 * una línea a LINEAS_DEBITO o LINEAS_CREDITO sin mirar la jerarquía.
 *
 * EL PARENTESCO SE LEE DE LA SANGRÍA, que es como el cuadro lo expresa: un rótulo indentado pertenece
 * al último rótulo sin indentar que tiene arriba.
 * @param {Array} colA la columna A del cash flow
 * @param {number[]} filas las filas elegidas (1-indexadas)
 * @returns {number[]} las mismas filas si no solapan; si solapan, rompe
 */
export function sinSolapamiento(colA = [], filas = []) {
  const texto = (f) => String(colA[f - 1]?.[0] ?? '')
  const esComponente = (f) => /^\s{2,}/.test(texto(f))
  /** El total del que cuelga una fila: el primer rótulo sin sangría hacia arriba. */
  const padreDe = (f) => {
    if (!esComponente(f)) return null
    for (let i = f - 1; i >= 1; i--) if (texto(i).trim() && !esComponente(i)) return i
    return null
  }
  const elegidas = new Set(filas)
  const choques = []
  for (const f of filas) {
    const p = padreDe(f)
    if (p && elegidas.has(p)) {
      choques.push(`la fila ${f} ("${texto(f).trim()}") es COMPONENTE de la ${p} ("${texto(p).trim()}")`)
    }
  }
  if (choques.length) {
    throw new Error('impuestos-pestana: doble conteo en la base de la proyección de IVA — '
      + `${choques.join(' · ')}. Sumar un total y uno de sus componentes cuenta esa plata dos veces `
      + 'y el resultado sigue pareciendo un importe razonable. Elegí el total O sus componentes, nunca los dos.')
  }
  return filas
}

// "ESTA CELDA NO ES MÍA: NO LA TOQUES."
//
// POR QUÉ HACE FALTA (04/08). `fusionar()` distingue tres cosas: contenido (gana el generador),
// VACIO (es mía y va vacía → se limpia) y cadena vacía (no es mía → se preserva). Pero `push()`
// convierte la cadena vacía en VACIO, así que desde `mensual()` era IMPOSIBLE decir "preservá".
//
// Y esta pestaña lo necesita. La columna de julio del bloque de IVA la escribió una persona a mano
// —débito, crédito, libre disponibilidad y la leyenda "⚠ PROYECCIÓN — DDJJ vence 20/08"— y en Drive
// no hay F.2051 de julio. Para el generador julio "no existe", así que le escribía VACIO y se la
// borraba. `respetar-ediciones` no la salva: por diseño respeta rótulos de texto, nunca importes.
// Y julio es justo el mes que ancla toda la proyección, así que borrarlo además la falsea.
const AJENO = ' ::AJENO:: '

function grilla(iva, planes, iibb, ivaOficial, C, proy) {
  const filas = []
  const push = (c = []) => {
    const r = [...c].map((x) => (x === AJENO ? '' : (x === '' || x === undefined || x === null ? VACIO : x)))
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

  push(['Impuestos y financiero'])
  // EL SUBTÍTULO DECLARA LA FRESCURA DE CADA FUENTE POR SEPARADO, Y NO UNA SOLA FECHA (03/08).
  //
  // Era `al ${new Date()}` —el día de la corrida— y el arreglo obvio, un MAX sobre las cuatro
  // fuentes, es PEOR que el texto estampado: ARCA y el extracto llegan a ayer, pero las DDJJ de IIBB
  // salen de los PDF de Rentas y se quedan en el último período presentado. El MAX pondría la fecha
  // de ARCA arriba de un cuadro de IIBB que no se mueve desde junio, y el dueño leería como fresco un
  // número que tiene un mes y medio. La regla y el porqué, en lib/fecha-de-frescura.mjs.
  //
  // El texto fijo se acortó a propósito: antes enumeraba las fuentes en prosa ("IVA de ARCA · IIBB y
  // F931 de las DDJJ de Rentas (Drive) · prendario del extracto Santander …") y ahora cada una
  // aparece con SU fecha al lado. Repetir la lista dos veces en la misma línea sólo la hacía más
  // larga sin decir nada nuevo.
  push([rotuloPorFuente('Qué se le debe al fisco, qué está inmovilizado y qué se debe con instrumento', [
    // Los comprobantes de ARCA: fecha del comprobante. Diaria — se replica en cada corrida.
    { nombre: 'IVA de ARCA', expr: formulaUltimaFecha(`${ARCA_RAW}!$C$${ARCA_FILA0}:$C`) },
    // IIBB: NO la fecha en que se bajó el PDF sino el PERÍODO que la DDJJ cubre. Una DDJJ de junio
    // presentada el 16/07 habla de junio; declarar el 16/07 sería declarar frescura de la gestión
    // administrativa, no del dato. El umbral es mensual: con 7 días el ⚠ estaría prendido siempre.
    { nombre: 'IIBB', expr: formulaUltimoPeriodo(`${IIBB_RAW}!$${IIBB_COL.periodo}$${IIBB_FILA0}:$${IIBB_COL.periodo}`), avisoDias: DIAS_AVISO_MENSUAL },
    // El extracto: de acá salen el prendario y el impuesto al cheque.
    { nombre: 'banco', expr: formulaUltimaFecha(`${BANCO_RAW}!$A$4:$A`) },
    // Las retenciones sufridas se imputan al mes del COBRO: su frescura es la del último cobro.
    { nombre: 'retenciones', expr: formulaUltimaFecha('Cobranzas!$Q$5:$Q') },
  ])])
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
  // (La función que los lee es `ofOAjeno`, más abajo: distingue además el mes que no es del
  // generador. La versión anterior —`of`, que devolvía VACIO para todo lo que no fuera DDJJ— se
  // eliminó a propósito: era la que borraba la columna que había escrito una persona.)

  // ═══ LOS MESES QUE TODAVÍA NO PASARON (04/08) ═══
  //
  // Hasta hoy este bloque terminaba en el último mes con F.2051 en Drive y de ahí en adelante dejaba
  // las celdas VACÍAS. El cash flow las lee con N(), que convierte un vacío en 0 sin avisar: el
  // cuadro mostraba $0 de IVA hasta diciembre. No era un modelo faltante — `posicionIvaCompleta` ya
  // calculaba la proyección y `grilla()` la recibía como primer parámetro sin usarla nunca.
  //
  // Ahora los meses futuros se escriben como FÓRMULA. Los meses reales siguen siendo VALORES (la
  // DDJJ es fuente primaria y su número no se recalcula), pero un mes proyectado se deduce de celdas
  // que ya viven en este archivo, y pegarlo como número lo congelaría: el dueño mueve una cobranza
  // esperada y el IVA proyectado se queda con la foto vieja.
  const proyIva = proy?.meses ?? []
  const esProy = (m) => proyIva.includes(m)
  // LOS MESES QUE YA TIENEN DATO EN LA HOJA PERO NO TIENEN DDJJ SE PRESERVAN, NO SE VACÍAN. Es el
  // caso de julio: alguien lo calculó a mano. Entran a la lista de meses escribibles para que
  // `mensual` los recorra, y la función de celda les devuelve AJENO — "no la toques".
  const ancla = proy?.ultimoMesConDato ?? 0
  const conDato = M12.filter((m) => m <= ancla && !mesesOf.includes(m))
  const mesesIva = [...mesesOf, ...conDato, ...proyIva].sort((a, b) => a - b)
  /** El valor de un mes NO proyectado: el de la DDJJ si la hay, y si no se preserva lo que haya. */
  const ofOAjeno = (m, campo) => (porMesOf.has(m) ? porMesOf.get(m)[campo] : (m <= ancla ? AJENO : VACIO))
  // Las filas de este bloque son consecutivas y se conocen antes de escribirlas: el arrastre del
  // saldo necesita apuntar a la celda del mes ANTERIOR, que está en esta misma grilla.
  const fDeb = filas.length + 1
  const fCred = fDeb + 1
  const fLibreDisp = fDeb + 3
  const colAnt = (m) => `${cmes(m - 1)}${fLibreDisp}`
  const brutos = (fs, m) => fs.map((f) => `'${CF}'!${cmes(m)}$${f}`)

  mensual('Débito fiscal del período',
    (m) => (esProy(m) ? formulaDebitoProyectado(brutos(proy.filasDebito, m)) : ofOAjeno(m, 'debito')),
    'F.2051 · IVA generado por las ventas del mes. Los meses futuros son PROYECCIÓN: el IVA contenido en las cobranzas que el cash flow ya da por cobradas y esperadas.', { meses: mesesIva })
  mensual('Crédito fiscal del período',
    (m) => (esProy(m) ? formulaCreditoProyectado(brutos(proy.filasCredito, m)) : ofOAjeno(m, 'credito')),
    'F.2051 · IVA de las compras computable del mes. Los meses futuros son PROYECCIÓN: el IVA contenido en las compras CON FACTURA que el cash flow ya proyecta (los cheques y la tarjeta sin factura quedan afuera: sin comprobante no hay crédito computable).', { meses: mesesIva })
  // EL RÓTULO NO SE ESCRIBE ACÁ: sale de ROTULOS_CALENDARIO, que es lo que el cash flow BUSCA. Este
  // bloque conserva 5 filas mensuales para no correr la fila de "IIBB a pagar" (28); pero la fila que
  // el cash flow encuentra la define el TEXTO, no la posición — el 30/07 se renombró esta fila
  // razonando sobre la fila 18 y los dos cash flow quedaron sin poder regenerarse.
  // La posición técnica del mes es derivable de débito − crédito + arrastre, así que no ocupa una fila
  // propia; su único mes relevante (marzo, a favor de ARCA) se ve en la libre disponibilidad.
  mensual(CALENDARIO_IMPUESTOS.rotulos.iva,
    (m) => (esProy(m)
      ? formulaAPagarProyectado(`${cmes(m)}${fDeb}`, `${cmes(m)}${fCred}`, colAnt(m))
      : ofOAjeno(m, 'a_pagar_efectivo')),
    'Hasta julio lo absorbió el crédito de libre disponibilidad. De agosto en adelante es PROYECCIÓN: lo que el saldo a favor del mes anterior ya no alcanza a absorber. ESTA es la fila que el cash flow lee.', { meses: mesesIva })
  const fLibre = mensual('Saldo de libre disponibilidad (acumulado)',
    (m) => (esProy(m)
      ? formulaLibreDispProyectada(colAnt(m), `${cmes(m)}${fDeb}`, `${cmes(m)}${fCred}`)
      : ofOAjeno(m, 'libre_disp')),
    'F.2051 · crédito de la empresa inmovilizado en ARCA (marzo: se consumió parte para la posición a favor de ARCA). Se arrastra; el total no aplica.', { meses: mesesIva, totaliza: false })
  const fDDJJ = mensual('DDJJ presentada',
    (m) => (esProy(m) ? '⚠ PROYECCIÓN' : (porMesOf.has(m) ? `${porMesOf.get(m).fecha_presentacion} · N°${porMesOf.get(m).nro_transaccion}` : (m <= ancla ? AJENO : VACIO))),
    'F.2051 presentada ante ARCA. Fuente primaria, verificable por N° de transacción. Los meses con "⚠ PROYECCIÓN" no tienen DDJJ: son un cálculo, no un hecho.', { meses: mesesIva, totaliza: false })
  // EL SUPUESTO NO SE ESCRIBE ACÁ, AUNQUE SEA DONDE MEJOR SE LEERÍA. Una fila de más en esta sección
  // corre hacia abajo la fila "IIBB a pagar", y el cash flow la referencia por su NÚMERO
  // ('Impuestos y Financieros'!L$28) hasta que se lo regenera. Mientras tanto leería la fila de al
  // lado sin dar error. Es la trampa que el 30/07 dejó los dos cash flow sin poder regenerarse.
  // El supuesto viaja en la columna "De dónde sale" de cada fila (que se rinde como nota de celda) y
  // se repite completo en la sección 7, que está debajo de todo y no mueve nada.
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
  mensual(CALENDARIO_IMPUESTOS.rotulos.iibb, (m) => `=MAX(0;${cmes(m)}${fImp}-${cmes(m)}${fRetI}-${prevI(m)})`,
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
  const B = BANCO_RAW
  // −IMPORTE, NO ABS(IMPORTE) (31/07). El extracto trae los débitos en negativo, así que ABS y "−" dan
  // lo mismo… salvo cuando el banco DEVUELVE el impuesto. "Anul imp ley 25.413 debito 0,6%" es un
  // crédito de +$294,78: con ABS se sumaba como si fuera un impuesto MÁS, o sea el cuadro declaraba
  // $589,56 de impuesto que no se pagó (el que no se cobró, más el que se devolvió). Con "−" la reversa
  // resta y la fila muestra el impuesto NETO, que es lo que la empresa efectivamente pagó. El defecto
  // no se veía porque hasta hoy la reversa no llegaba a este bucket: caía en el cajón de sastre de
  // clasificarMovimiento. Arreglar la clasificación sin arreglar esto habría empeorado el número.
  const porMesBanco = (patron) => (m) =>
    `=SUMPRODUCT((YEAR(${B}!$A$4:$A)=${AÑO})*(MONTH(${B}!$A$4:$A)=${m})*ISNUMBER(SEARCH("${patron}";${B}!$F$4:$F))*-IF(ISNUMBER(${B}!$C$4:$C);${B}!$C$4:$C;0))`
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
  // ═══ UN HUECO SE VE COMO UN HUECO, NO COMO UN CERO (04/08) ═══
  //
  // El dueño: *"$0 y 'no lo sabemos' no son lo mismo y hoy se ven igual"*. Tenía razón: estas dos
  // filas eran el rótulo con ⚠ y doce celdas vacías, que en un cuadro de importes se leen como "no
  // hay nada que pagar". Son lo contrario: son impuestos que probablemente se pagan y que nadie
  // cuantificó nunca.
  //
  // SE ESCRIBE "s/d" EN CADA MES, Y ES TEXTO A PROPÓSITO. SUM() ignora el texto, así que el hueco
  // queda a la vista sin ensuciar un solo total — y sin que aparezca un cero que después alguien
  // sume de buena fe. La columna de total dice "sin cuantificar" en vez de $0 por la misma razón.
  // NO se estiman: estimar acá sería fabricar un dato, que es la primera regla de oro.
  const SD = 's/d'
  push(['⚠ Tasa municipal de seguridad e higiene', ...Array(12).fill(SD), 'sin cuantificar',
    'HUECO DECLARADO · no hay una sola fila en Compras ni en el banco. Si la obra tributa tasa municipal, ese costo hoy no está en ningún cuadro. "s/d" no es cero: es que no se sabe. Para cerrarlo hace falta el municipio de cada obra y su ordenanza vigente.'])
  push(['⚠ Impuesto de sellos', ...Array(12).fill(SD), 'sin cuantificar',
    'HUECO DECLARADO · sin dato. Aplica sobre contratos: si se firmó alguno con sellado, no está registrado. "s/d" no es cero. Para cerrarlo hace falta la lista de contratos firmados en el año.'])
  // EL ANTICIPO DE GANANCIAS SE CORTÓ Y NO SE SABE POR QUÉ. La fila de arriba lo lee de Compras y
  // encuentra $144.427 por mes de enero a abril; de mayo en adelante, nada. Desde el Sheet no se
  // puede distinguir "se dio de baja el anticipo" de "no se cargó el comprobante", y son cosas muy
  // distintas: una no cuesta plata y la otra son ~$144k por mes que el cash flow no está viendo.
  // No se proyecta —sería inventar— pero tampoco se deja el cero solo: se declara la pregunta.
  push(['⚠ Anticipo de Ganancias — sin registro desde mayo', ...Array(12).fill(VACIO), VACIO,
    'HUECO DECLARADO · último anticipo cargado: abril, $144.427/mes de enero a abril ($577.710 en el año). De mayo en adelante Compras no tiene ninguna fila. ¿Se dio de baja el anticipo, o no se cargó el comprobante? Si sigue vigente son ~$144.427 por mes que el cash flow no está proyectando. Lo confirma el estudio contable.'])
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
  if (proyIva.length) push([`⚠ IVA de ${MES[proyIva[0] - 1]} a diciembre: ${proy.supuesto}`])
  push()

  // ── 8 · EL PARÁMETRO ───────────────────────────────────────────────────────────────────────────
  //
  // LA ALÍCUOTA VIVE EN UNA CELDA CON NOMBRE, NO ADENTRO DE UNA FÓRMULA. El dueño lo pidió así y
  // además es lo único defendible: la skill de impuestos prohíbe afirmar una alícuota vigente sin
  // verificarla, y el OS no puede verificar una norma en cada corrida. Así que el OS no la afirma —
  // la LEE de acá, y quien la firma es quien puede hacerlo (el dueño con su contador). Cambiarla es
  // editar UNA celda; toda la proyección de IVA se recalcula sola.
  //
  // AL FINAL DE LA PESTAÑA, Y ES DELIBERADO. Una fila nueva arriba corre hacia abajo las filas "IVA
  // a pagar" e "IIBB a pagar", y los dos cash flow las referencian por su NÚMERO hasta que se los
  // regenera. Abajo de todo no se mueve nada.
  //
  // SI YA HAY UN VALOR, NO SE PISA: `alicuotaVigente` sale de la celda leída antes de escribir. El
  // valor de arranque sólo se pone la primera vez, y la celda queda declarada como editable.
  push([seccion(8, 'Parámetros de esta pestaña — los edita el dueño con su contador')])
  const fAlic = push(['Alícuota general de IVA', proy?.alicuotaVigente ?? 0.21, ...Array(11).fill(VACIO), VACIO,
    `PARÁMETRO EDITABLE · lo usa la proyección de IVA de la sección 1 por el rango con nombre ${RANGO_ALICUOTA_IVA}. `
    + 'El OS NO afirma que esta alícuota esté vigente: la lee de acá. Si cambia la norma, o si a la actividad le corresponde una alícuota distinta, se cambia esta celda y todo el cuadro se recalcula. Confirmala con el estudio contable.'])

  // ── EL HERO, RECIÉN AHORA: ya se sabe en qué fila quedó cada total ──────────────────────────────
  // El saldo a favor de IVA es la LIBRE DISPONIBILIDAD de la última DDJJ (ya incluye técnico +
  // retenciones/percepciones de IVA). El de IIBB, el saldo a favor de su última DDJJ. Por eso las
  // retenciones NO se vuelven a sumar al total: ya están adentro de esos dos saldos (doble conteo).
  // EL ANCLA ES EL ÚLTIMO MES CON DATO REAL, NO LA ÚLTIMA DDJJ PRESENTADA NI EL ÚLTIMO MES DEL
  // CUADRO (04/08). Estaba anclado en `ultOf` —la última F.2051 que hay en Drive, junio— y por eso
  // el hero declaraba $19.344.911 de saldo a favor mientras la columna de julio, dos filas más
  // abajo, ya decía $7.050.036. Sobredeclaraba $12,3M de plata inmovilizada, que es justo el número
  // con el que se decide si hay que salir a cubrir un bache de caja.
  // Y tampoco puede ser diciembre: de agosto en adelante el saldo es PROYECCIÓN, y el hero dice cuál
  // es la posición HOY. Por eso el ancla es el último mes con dato real, que ahora incluye julio.
  const mesSaldoIVA = proy?.ultimoMesConDato ?? ultOf
  const saldoIVA = mesSaldoIVA ? `${cmes(mesSaldoIVA)}${fLibre}` : '0'
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
    alicuotas: [fAli, fAlic],
    textos: [fDDJJ],
    // Los meses proyectados se marcan para que el estilo los distinga del dato real de un vistazo:
    // una proyección que se ve igual que un hecho termina leyéndose como un hecho.
    proyectados: [],
    saldos: [fLibre, fSaldoI, fSalidaFin],
    filaAlicuotaIva: fAlic,
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

/**
 * QUÉ MESES SE PROYECTAN, DESDE QUÉ SALDO, CON QUÉ ALÍCUOTA Y CONTRA QUÉ FILAS DEL CASH FLOW.
 *
 * Se lee la pestaña ANTES de escribirla, y eso no es una precaución de más: el ancla de toda la
 * proyección es la libre disponibilidad del último mes cargado, y ese mes puede haberlo escrito una
 * persona (julio lo hizo). Si se anclara en la última F.2051 de Drive, la proyección arrancaría del
 * saldo de junio ($19,3M) y el cuadro diría que el saldo a favor aguanta hasta fin de año, cuando en
 * realidad se agota el mes siguiente.
 */
async function planDeProyeccionIva(google, ivaOficial) {
  // La grilla de la sección 1 tal como está hoy. Se busca la fila por su RÓTULO, no por su número:
  // la fila 19 de hoy es otra cosa apenas alguien agregue una línea arriba.
  //
  // SIN .catch: ESTA LECTURA DECIDE QUÉ SE ESCRIBE. Si la API falla y esto se degrada a [], el ancla
  // desaparece y el generador escribe la pestaña SIN proyección — o peor, arranca de un saldo que no
  // es. Un error de red terminaría produciendo un cuadro que dice que no hay IVA que pagar. Falla
  // ruidoso: no correr es mejor que correr con un ancla inventada. (Lo fija deuda-geometria.test.)
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:N60`)
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const filaDe = (rot) => previo.findIndex((f) => norm(f?.[0]) === norm(rot))
  const iL = filaDe('Saldo de libre disponibilidad (acumulado)')
  const filaLibre = iL >= 0 ? (previo[iL] || []).slice(1, 13) : []
  const mesesConDDJJ = (ivaOficial ?? []).filter((d) => d.periodo).map((d) => Number(String(d.periodo).slice(5, 7)))
  const { ultimoMesConDato, libreDisp, mesesAProyectar } = anclaDeProyeccion(filaLibre, mesesConDDJJ)

  // LA ALÍCUOTA VIGENTE SALE DE LA CELDA, NO DE UNA CONSTANTE. Si el dueño ya la editó, manda la
  // suya: es la regla de "edición manual = verdad definitiva". Sólo la primera vez se siembra 0,21.
  const iA = filaDe('Alícuota general de IVA')
  const crudo = iA >= 0 ? previo[iA]?.[1] : null
  const alicuotaVigente = aNumero(crudo) !== null ? aNumero(crudo) / (String(crudo).includes('%') ? 100 : 1) : null

  // Tampoco lleva .catch, y por el mismo motivo: con [] las dos llamadas a ubicarLineas romperían
  // igual, pero con un mensaje que culparía al cash flow de haber perdido sus rótulos en vez de
  // decir que no se pudo leer. El error tiene que nombrar lo que pasó.
  // SE LEE LA GRILLA ENTERA, NO SÓLO LA COLUMNA A. Con los rótulos alcanzaba para ubicar las filas,
  // pero no para MOSTRAR de qué números sale el impuesto — y un importe fiscal que no se puede
  // rehacer a mano no se puede firmar. Con los valores acá, el --dry imprime la celda, su rótulo y
  // su importe al lado del resultado.
  const cf = await google.readSheetValues(ID, `'${CF}'!A1:N80`)
  const filasDebito = sinSolapamiento(cf, ubicarLineas(cf, LINEAS_DEBITO))
  const filasCredito = sinSolapamiento(cf, ubicarLineas(cf, LINEAS_CREDITO))
  // LA BASE, CELDA POR CELDA. Es el insumo del cálculo, y se guarda para poder exhibirlo.
  const base = (fs, m) => fs.map((f) => ({
    celda: `${cmes(m)}${f}`,
    fila: f,
    rotulo: String(cf[f - 1]?.[0] ?? '').trim(),
    valor: aNumero(cf[f - 1]?.[m]) ?? 0,
  }))
  const bases = Object.fromEntries(mesesAProyectar.map((m) => [m, {
    debito: base(filasDebito, m),
    credito: base(filasCredito, m),
  }]))
  return {
    meses: mesesAProyectar,
    ultimoMesConDato,
    libreDisp,
    alicuotaVigente,
    filasDebito,
    filasCredito,
    bases,
    supuesto: supuestoDelMes({ cobranzas: LINEAS_DEBITO, compras: LINEAS_CREDITO })
      + ` Arranca del saldo a favor de ${MES[(ultimoMesConDato ?? 1) - 1]} ($${Math.round(libreDisp ?? 0).toLocaleString('es-AR')}).`
      + ' Es un CÁLCULO, no un hecho: el débito fiscal de una obra se devenga con el certificado aprobado, que puede caer antes que el cobro.',
  }
}

/**
 * QUÉ VA A ESCRIBIR LA PROYECCIÓN, CON EL INSUMO AL LADO DEL RESULTADO.
 *
 * POR QUÉ ASÍ (04/08). La primera versión imprimía la definición ("débito ← filas 6+10") pero NINGÚN
 * número, y justo arriba el bloque de control de ARCA imprimía "débito … crédito … a pagar …" sin
 * decir que era otra cosa. Quien revisó leyó los números del control como si fueran los de la
 * proyección, vio $52,2M donde la definición daba $29,8M, y frenó la aplicación — con razón: un
 * importe fiscal que no reproduce su propia definición no se puede firmar.
 *
 * El defecto no era el cálculo (se verificó: 20.135.520 + 151.317.518 = 171.453.038, × 0,21/1,21 =
 * 29.756.312, exacto). El defecto era la SALIDA: publicaba una conclusión ajena y no el insumo
 * propio. Así que ahora se imprime la cuenta entera —celda, rótulo, importe, suma, factor— para que
 * cualquiera la rehaga a mano con la calculadora y el archivo abierto.
 *
 * Y SE IMPRIME EL RESULTADO CALCULADO ACÁ, no sólo las fórmulas que van a la celda. Es un control
 * cruzado real: si el núcleo puro y la fórmula del Sheet dejaran de coincidir, la diferencia se ve.
 */
function informarProyeccion(proy) {
  if (!proy?.meses?.length) {
    console.log(`  IVA: nada que proyectar (último mes con dato: ${proy?.ultimoMesConDato ?? 'ninguno'})`)
    return
  }
  const alic = proy.alicuotaVigente ?? 0.21
  const money = (n) => Math.round(n).toLocaleString('es-AR')
  console.log(`\n  ══ PROYECCIÓN DE IVA — lo que se va a escribir en "${PESTAÑA}" ══`)
  console.log(`  ancla: ${MES[proy.ultimoMesConDato - 1]} con $${money(proy.libreDisp ?? 0)} de libre disponibilidad`)
  console.log(`  alícuota: ${alic}${proy.alicuotaVigente === null ? ' (la celda todavía no existe: se siembra)' : ` (de ${PESTAÑA}, rango ${RANGO_ALICUOTA_IVA})`}`
    + ` · el IVA se extrae del bruto con a/(1+a) = ${(alic / (1 + alic)).toFixed(9)}`)

  const futuros = proy.meses.map((m) => ({
    periodo: `2026-${String(m).padStart(2, '0')}`,
    base_debito: proy.bases[m].debito.reduce((s, b) => s + b.valor, 0),
    base_credito: proy.bases[m].credito.reduce((s, b) => s + b.valor, 0),
    supuesto: proy.supuesto,
  }))
  const calc = proyectarLibreDisponibilidad(
    [{ periodo: `2026-${String(proy.ultimoMesConDato).padStart(2, '0')}`, libre_disp: proy.libreDisp ?? 0 }],
    futuros, alic)

  for (const m of proy.meses) {
    console.log(`\n  ── ${MES[m - 1]}-26 ────────────────────────────────────────────────────`)
    for (const lado of ['debito', 'credito']) {
      let suma = 0
      for (const b of proy.bases[m][lado]) {
        suma += b.valor
        console.log(`    ${lado === 'debito' ? 'DÉB' : 'CRÉ'}  '${CF}'!${b.celda.padEnd(5)} ${b.rotulo.slice(0, 46).padEnd(48)} ${money(b.valor).padStart(15)}`)
      }
      console.log(`         ${''.padEnd(6)} ${'BASE (suma de las de arriba)'.padEnd(48)} ${money(suma).padStart(15)}`)
      console.log(`         ${''.padEnd(6)} ${`× ${alic}/(1+${alic}) =`.padEnd(48)} ${money(suma * alic / (1 + alic)).padStart(15)}`)
    }
    const r = calc.find((x) => x.periodo === `2026-${String(m).padStart(2, '0')}`)
    console.log(`    ⇒ IVA A PAGAR EN EFECTIVO${''.padEnd(35)} ${money(r.a_pagar_efectivo).padStart(15)}`)
    console.log(`      libre disponibilidad que queda${''.padEnd(29)} ${money(r.libre_disp).padStart(15)}`)
  }
  const total = calc.reduce((s, x) => s + (x.a_pagar_efectivo || 0), 0)
  const agota = mesEnQueSeAgota(calc)
  console.log(`\n  TOTAL a pagar en efectivo: $${money(total)} · el saldo a favor se agota en ${agota ? MES[Number(agota.slice(5)) - 1] : 'ningún mes del horizonte'}`)
  console.log(`  supuesto: ${proy.supuesto}`)
}

/** Las dos pestañas que leen el calendario de impuestos por número de fila. */
const CASH_FLOWS = ['Cash Flow Mensual', 'Cash Flow Semanal']

/**
 * ¿La fila donde va a quedar cada rótulo es la que los dos cash flow ya referencian?
 * Devuelve {ok, motivo}. Si no se puede leer alguno de los cuadros, NO se degrada a "ok": no saber
 * si el contrato se rompe es exactamente el caso en que no hay que escribir.
 */
async function verificarFilasEstables(google, g) {
  const destino = {}
  g.filas.forEach((f, i) => {
    const r = String(f?.[0] ?? '').trim()
    if (r === CALENDARIO_IMPUESTOS.rotulos.iva) destino.iva = i + 1
    if (r === CALENDARIO_IMPUESTOS.rotulos.iibb) destino.iibb = i + 1
  })
  const formulas = []
  for (const hoja of CASH_FLOWS) {
    // Las fórmulas, no los valores: lo que importa es a qué fila apuntan.
    const grid = await google.readSheetGrid(ID, `'${hoja}'!A1:BZ60`)
    for (const fila of grid.filas || []) for (const c of fila || []) if (c?.formula) formulas.push(c.formula)
  }
  return contratoDeFilas(filasReferenciadas(formulas, PESTAÑA), destino)
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
  // LA POSICIÓN TÉCNICA DE ARCA SIGUE CALCULÁNDOSE, PERO COMO CONTROL — NO COMO INSUMO. Es una
  // segunda medición, independiente de la DDJJ: si las dos se separan mucho, alguna de las dos está
  // mal y hay que mirarlo. Un control no se valida contra la información que produce, así que NO
  // alimenta ninguna celda. Hasta el 04/08 se calculaba y se tiraba, que es otra cosa.
  const iva = await posicionIvaCompleta(AÑO, ventas, factor, retIva)
  const proy = await planDeProyeccionIva(google, ivaOficial)
  const planes = await planesDePago()
  const cabCompras = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { col: C, faltan } = resolverColumnas(cabCompras, {
    total: 'Total', concepto: 'Concepto', fecha: 'Fecha de caja', rubro: 'Rubro de caja', fechaPrev: 'Fecha prevista de pago (día)', detalle: 'Detalles / Obra',
  })
  if (faltan.length) { console.error(`⚠ faltan columnas en Compras: ${faltan.join(', ')} — no escribo con referencias inventadas`); process.exit(1) }
  console.log(`  Compras por encabezado: Total=${C.total} · Concepto=${C.concepto} · Fecha de caja=${C.fecha} · Rubro=${C.rubro}`)
  const g = grilla(iva, planes, iibb, ivaOficial, C, proy)
  if (ret.sospechosas.length) {
    console.error(`  ⚠ ${ret.sospechosas.length} retención(es) con alícuota que no encaja con ningún régimen — NO se computaron:`)
    for (const x of ret.sospechosas) console.error(`     fila ${x.fila} ${x.cliente}: ${x.regimen} ${Math.round(x.monto).toLocaleString('es-AR')} = ${(x.alicuota * 100).toFixed(2)}%`)
  }
  console.log(`  retenciones sufridas: ${Math.round(ret.total).toLocaleString('es-AR')} · IVA ${Math.round(ret.porRegimen.iva ?? 0).toLocaleString('es-AR')} · Ganancias ${Math.round(ret.porRegimen.ganancias ?? 0).toLocaleString('es-AR')} · IIBB ${Math.round(ret.porRegimen.iibb ?? 0).toLocaleString('es-AR')}`)
  console.log(`${PESTAÑA}: ${g.filas.length} filas · ${planes.length} planes · IVA de ${iva.filter((m) => m.disponible).length} meses reales`)
  if (DRY) {
    // ═══ ESTE BLOQUE NO ES LO QUE SE ESCRIBE ═══
    //
    // Es la posición TÉCNICA calculada sobre los comprobantes de ARCA (posicion-iva.mjs), que se
    // conserva como CONTROL INDEPENDIENTE de la DDJJ: si las dos mediciones se separan mucho, alguna
    // está mal. Proyecta con otro método (el ritmo de los meses reales ajustado por inflación), así
    // que sus números NO tienen por qué coincidir con los de la proyección de abajo.
    //
    // El rótulo es tan enfático porque su ausencia ya costó una revisión entera: se leyó el débito de
    // agosto de ESTE bloque ($52,2M) como si fuera el de la proyección ($29,8M), y la aplicación se
    // frenó por un doble conteo que no existía. Dos números distintos, uno al lado del otro y sin
    // decir cuál es cuál, es una salida que miente aunque cada número sea correcto.
    console.log('\n  ══ CONTROL (NO se escribe) — posición técnica sobre comprobantes de ARCA ══')
    console.log('  Otro método y otra fuente que la proyección de más abajo: sirve para contrastar la')
    console.log('  DDJJ, no para llenar el cuadro. Que no coincida con la proyección es lo esperado.')
    for (const m of iva.filter((x) => x.disponible || x.es_proyeccion)) {
      console.log(`  [control] ${m.periodo}  débito ${Math.round(m.debito_fiscal).toLocaleString('es-AR').padStart(12)}  crédito ${Math.round(m.credito_fiscal).toLocaleString('es-AR').padStart(12)}  a pagar ${Math.round(m.a_pagar_real ?? 0).toLocaleString('es-AR').padStart(12)}  saldo a favor ${Math.round(m.saldo_queda).toLocaleString('es-AR').padStart(12)}${m.es_proyeccion ? '  (proyección técnica)' : ''}`)
    }
    for (const p of planes) console.log(`  ${p.nombre.padEnd(42)} ${p.cuotas} cuotas x ${p.monto_cuota.toLocaleString('es-AR')} = ${Math.round(p.total).toLocaleString('es-AR')}`)
    informarProyeccion(proy)
    // EL CONTRATO DE FILAS TAMBIÉN SE RESPONDE EN --dry, y sin riesgo: es la pregunta de si al
    // aplicar hay que regenerar además los dos cash flow (que rehacen la pestaña entera y pueden
    // resucitar filas que el dueño borró a mano). Contestarla ANTES de escribir es justamente el
    // punto: si acá dice que sí hace falta, todavía se está a tiempo de no escribir.
    const est = await verificarFilasEstables(google, g)
    console.log(`\n  ${est.ok ? '✓' : '✖'} contrato de filas con los cash flow: ${est.motivo}`)
    if (est.ok) console.log('    ⇒ NO hace falta correr cash-flow-rehacer.mjs después de aplicar.')
    return
  }

  // ═══ ANTES DE ESCRIBIR: ¿SIGUEN LOS DOS CASH FLOW LEYENDO LA FILA QUE CREEN LEER? ═══
  //
  // Los dos cuadros referencian esta pestaña por NÚMERO de fila, y ese número se resuelve por rótulo
  // sólo cuando se los regenera. Si acá se mueve "IVA a pagar" o "IIBB a pagar", los cash flow
  // empiezan a leer la fila de al lado sin dar error.
  //
  // La salida fácil sería exigir correr cash-flow-rehacer.mjs después, pero ese script rehace las dos
  // pestañas ENTERAS y el dueño borró líneas a mano en las dos: se las resucitaría. Así que en vez de
  // rehacer, se verifica — y si no da, NO SE ESCRIBE. Escribir es justo el momento en que se rompen.
  const estable = await verificarFilasEstables(google, g)
  if (!estable.ok) {
    console.error(`✖ NO escribo ${PESTAÑA}: ${estable.motivo}`)
    console.error('  Opciones: (1) dejar los rótulos donde estaban, o (2) regenerar los dos cash flow'
      + ' a sabiendas de que rehacen la pestaña entera y pueden resucitar filas borradas a mano.')
    process.exit(1)
  }
  console.log(`  ✓ contrato de filas con los cash flow: ${estable.motivo}`)

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
  // LA COLUMNA DE PROSA SE VA CON LA GRILLA, NO DESPUÉS. `borrarNotas` (en formatear()) corre después
  // de escribir y blanquea con '', que la fusión preserva: por eso la columna nunca se iba. Ver
  // vaciarColumnaDeProsa en lib/nota-celda.mjs.
  vaciarColumnaDeProsa(g.filas, ANCHO - 1)
  const escritura = await escribirPreservando(google, ID, PESTAÑA, g.filas, { respetar: false /* la Regla 0 ya se aplicó arriba, a mano: este generador guarda el registro DESPUÉS de releer la pestaña, que es más fiel que hacerlo antes de escribir */, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07) ═══
  //
  // El defecto que arruinó CAJA, buscado en todos los generadores y encontrado en seis. La guarda hace
  // bien su trabajo —con la pestaña candada o con la firma editada, `escribirPreservando` NO escribe—
  // pero el resultado se descartaba y la corrida seguía: el formateador pintaba la geometría de la
  // grilla NUEVA sobre los valores VIEJOS, y donde había rangos con nombre los reapuntaba a filas que
  // en la pestaña no tienen ese dato. En CAJA eso dejó CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO sobre
  // dos celdas vacías: con el total y la fecha de corte en cero, todo cheque y toda quincena pasaban el
  // filtro y el calendario inflaba sus tramos. Sin un solo #ERROR y sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre. Queda exactamente como la dejaste.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  if (!salteada) await formatear(google, hoja.sheetId, g, hoja.rows ?? 0)
  // EL NOMBRE SE PUBLICA DESPUÉS DE ESCRIBIR, NUNCA ANTES. Un nombre que apunta a una fila que
  // todavía no existe se resuelve a una celda vacía, y las fórmulas de la sección 1 leerían alícuota
  // cero: todo el débito y todo el crédito proyectados darían $0 y el cuadro volvería a mentir en
  // silencio. Y si la pestaña quedó salteada (candado o edición del dueño) tampoco se toca: la fila
  // real es la de su última escritura, no la que acabo de calcular.
  if (!salteada && g.filaAlicuotaIva) {
    await publicarNombres(google, ID, hoja.sheetId, [{ name: RANGO_ALICUOTA_IVA, fila: g.filaAlicuotaIva, col: 2 }])
      .then(() => console.log(`  ${RANGO_ALICUOTA_IVA} → ${PESTAÑA}!B${g.filaAlicuotaIva}`))
      .catch((e) => console.warn(`  ⚠ no pude publicar ${RANGO_ALICUOTA_IVA}: ${e.message} — la proyección de IVA quedaría en $0`))
  }
  informarProyeccion(proy)

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

  // ═══ DOS GUARDAS ANTES DE FORMATEAR ═══
  //
  // 1. LA GRILLA TIENE QUE ENTRAR EL BLOQUE. La pestaña tenía exactamente 69 filas y el bloque
  //    creció al agregarle la proyección: el formateo pidió `A70:O69` y Google rechazó el lote
  //    ENTERO con 400. Lo grave no fue el error: fue que los VALORES ya se habían escrito en el
  //    lote anterior, así que quedaron las fórmulas nuevas sin el rango con nombre que publican
  //    las líneas de abajo —que nunca se ejecutaron— y la pestaña mostró `#NAME?` en toda la
  //    proyección. Una escritura a medias es peor que ninguna.
  // 2. UN RANGO VACÍO NO SE MANDA. Un `startRowIndex >= endRowIndex` es siempre un error de
  //    aritmética de quien lo armó, y cuesta el lote completo. Se descarta acá, una vez, en vez de
  //    esperar que cada uno de los cuarenta `fmt` de arriba se acuerde.
  if (n > (filasHoja ?? 0)) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: {
      sheetId, dimension: 'ROWS', length: n + 5 - (filasHoja ?? 0) } }])
    console.log(`  la grilla pasa de ${filasHoja} a ${n + 5} filas: el bloque no entraba`)
    filasHoja = n + 5
  }
  const vacio = (q) => {
    const g0 = q?.repeatCell?.range ?? q?.updateCells?.range ?? q?.unmergeCells?.range
    return g0 && Number(g0.startRowIndex ?? 0) >= Number(g0.endRowIndex ?? 0)
  }
  const descartados = req.filter(vacio).length
  if (descartados) console.log(`  ⚠ ${descartados} pedido(s) de formato con rango vacío, descartados`)
  await google.spreadsheetBatchUpdate(ID, req.filter((q) => !vacio(q)))
  // PIEL DE STATEMENT encima del formato de número: sin reja, secciones y encabezados por tipografía
  // + hairline (no barras rellenas), totales rulados. La misma que CAJA, Cheques y Cargas Sociales.
  await google.spreadsheetBatchUpdate(ID, skinRequests({ sheetId, filas: g.filas, cols: ANCHO, congeladas: 2, titular: g.titular, filasHoja: filasHoja }))
  // Ninguna fila queda OCULTA: un colapso de una versión anterior dejó filas con hiddenByUser=true,
  // y borrar el grupo no las vuelve a mostrar.
  await google.spreadsheetBatchUpdate(ID, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}

// SÓLO CUANDO SE LO INVOCA COMO COMANDO. Sin esta guarda —que el resto de los generadores sí tiene—
// bastaba `import` para que el archivo escribiera el Sheet real: un test que quisiera probar una
// función pura de acá corría la pestaña entera contra el archivo de producción. Pasó el 04/08 al
// escribir el primer test de este script; lo único que evitó la escritura fue el freno de mano, que
// es una red que puede no estar puesta. Un módulo se importa; un comando se ejecuta.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
