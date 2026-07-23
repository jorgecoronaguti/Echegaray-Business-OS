#!/usr/bin/env node
// LA PESTAÑA "CARGAS SOCIALES" — UN SOLO DUEÑO, UNA SOLA GRILLA.
//
// POR QUÉ SE REHIZO (23/07). El dueño: "rompiste la pestaña cargas sociales" y "no respeta el
// patrón de diseño". Las dos cosas eran ciertas y tenían la MISMA causa de fondo.
//
//   LA ROTURA. El cuadro de lo PAGADO mostraba seis meses de #VALUE!. Sus fórmulas referenciaban la
//   columna de fecha de Compras por su LETRA; alguien movió una columna en Compras y la referencia
//   quedó en #REF!. Nadie se enteró porque ese bloque NO TENÍA DUEÑO: ningún script lo reescribía,
//   así que el error se congeló ahí. Ahora las columnas de Compras se resuelven por su ENCABEZADO
//   (lib/compras-columnas.mjs): el día que se mueva una columna, la fórmula la sigue.
//
//   EL DESORDEN. La pestaña la escribían TRES scripts distintos, cada uno con su propio ancho de
//   grilla —había bloques de 7, 8, 9, 10 y 14 columnas—, más dos bloques huérfanos que nadie
//   reclamaba. Eso es exactamente lo que se ve como "descuadrado": cada cuadro empieza y termina en
//   una columna distinta del de arriba. Un solo script no puede descuadrarse contra sí mismo.
//
// ═══ LA GRILLA, UNA SOLA PARA TODA LA PESTAÑA ═══
//
//   A            el concepto
//   B … M        los doce meses del año, SIEMPRE en la misma columna: enero es B en todos los cuadros
//   N            el total del año
//   O            de dónde sale el número
//
// Es el estándar de cualquier modelo financiero serio: una sola definición de columna aplicada a
// todas las hojas, para que el ojo compare hacia abajo sin volver a leer el encabezado. Acá vale
// doble, porque toda la pestaña habla de lo mismo —el costo de la nómina— visto de siete maneras:
// lo declarado, lo pagado, la diferencia, lo que viene, cuándo sale de la caja, lo que se devengó y
// todavía no se pagó, y las cuotas de lo viejo.
//
//   node orquestador/scripts/cargas-sociales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { resolverColumnas, rango } from '../lib/compras-columnas.mjs'
import { seccion, sub, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { origenANota } from '../lib/nota-celda.mjs'
import { celdaF931, celdaCabecera, PESTAÑA as RAW } from './f931-sheet.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cargas Sociales'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
/** Desde qué mes se proyecta: julio tiene jornales cargados pero todavía no F931 presentado. */
const DESDE_PROY = 7
const ANCHO = 15
const COL_ORIGEN = 'O'
const MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** La columna del mes N. Enero es B en TODOS los cuadros de la pestaña: ése es el punto. */
const cm = (m) => String.fromCharCode(65 + m)
/** El rango de los seis meses con F931 presentado — sobre el que se miden las alícuotas reales. */
const REALES = (fila) => `$B$${fila}:$G$${fila}`
const ar = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')
const HOY = new Date().toISOString().slice(0, 10)

/**
 * NÚCLEO PURO: cómo se proyecta cada concepto. Heredado de la proyección anterior, que estaba bien:
 * lo que estaba mal era dónde vivía, no la regla.
 *   'remuneracion' → % de la masa salarial declarada
 *   'dotacion'     → costo por empleado × cantidad de empleados
 */
// SE CASA POR CÓDIGO, NO POR RÓTULO.
//
// EL DEFECTO QUE ESTO CORRIGE (23/07). La primera versión buscaba la fila del concepto por su
// nombre. Los PDF de ARCA dicen "Aportes de Seguridad Social" y esta lista decía "Aportes Seguridad
// Social": no coincidía, así que CUATRO de los seis conceptos declarados quedaban fuera de la
// proyección. Y no fallaba —el cuadro se dibujaba entero— sólo proyectaba $2,8M por mes en vez de
// $6,6M. El titular de la pestaña quedaba 60% corto y nada lo avisaba. Un código de la DDJJ no lo
// reescribe nadie; un rótulo, sí.
export const CONCEPTOS_PROY = [
  { codigo: '301', rotulo: 'Aportes Seguridad Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '302', rotulo: 'Aportes Obra Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '351', rotulo: 'Contribuciones Seguridad Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '352', rotulo: 'Contribuciones Obra Social', base: 'remuneracion', de: 'declarado' },
  { codigo: '312', rotulo: 'L.R.T. — ART', base: 'remuneracion', de: 'declarado', nota: 'La alícuota de ART depende de la siniestralidad y del riesgo de la actividad: se mide, no se supone.' },
  { codigo: '028', rotulo: 'Seguro de Vida Obligatorio', base: 'dotacion', de: 'declarado', nota: 'NO escala con la masa salarial: es un costo por persona.' },
  { rotulo: 'FCL', base: 'remuneracion', de: 'pagado', nota: 'Fondo de Cese Laboral — es de la construcción y no está en el F931.' },
  { rotulo: 'UOCRA', base: 'remuneracion', de: 'pagado', nota: 'Cuota sindical y aportes de convenio.' },
  { rotulo: 'IERIC', base: 'remuneracion', de: 'pagado' },
  { rotulo: 'FODECO', base: 'remuneracion', de: 'pagado' },
]

/**
 * Los jornales netos de un mes. NO es una suma simple: la pestaña de quincenas tiene dos bloques y
 * hay que sumar los dos. La expresión se reusa tal cual de la proyección anterior — dos versiones
 * del mismo cálculo es exactamente lo que la regla de oro prohíbe.
 *
 * FRAGILIDAD DECLARADA: los rangos 3:16 y 23:33 están fijos. Si la pestaña de quincenas cambia de
 * geometría, esto deja de sumar bien SIN dar error. Deuda heredada, escrita para que se vea.
 */
export function jornalesDelMes(fecha) {
  const Q = "'Jornales por Quincena'"
  return `SUMPRODUCT((YEAR(${Q}!$A$3:$A$16)=YEAR(${fecha}))*(MONTH(${Q}!$A$3:$A$16)=MONTH(${fecha}))*(${Q}!$A$3:$A$16<${Q}!$A$23)*${Q}!$J$3:$J$16)+SUMPRODUCT((YEAR(${Q}!$A$23:$A$33)=YEAR(${fecha}))*(MONTH(${Q}!$A$23:$A$33)=MONTH(${fecha}))*${Q}!$G$23:$G$33)`
}

/** Los planes de pago de deuda previsional, agrupados desde Compras. */
async function planes() {
  // El MISMO filtro que la regla de rubro-caja: por concepto, no por cliente. Bajo la etiqueta
  // "Plan de pago" también hay Anticipo de Ganancias, que es impuesto y no tiene nada que hacer acá.
  const r = await query(`
    select concepto, total, fecha_pago
      from public.costos_obra
     where origen = 'compras_sheet'
       and concepto ~* 'deuda previcional|deuda previsional|plan f931'
     order by fecha_pago`)
  const m = new Map()
  for (const x of r.rows) {
    const c = String(x.concepto ?? '')
    const nombre = /w303094/i.test(c) ? 'Plan F931 W303094 — financiación de junio 2026'
      : /dic\s*25/i.test(c) ? 'Deuda previsional F931 — Diciembre 2025'
        : /enero\s*26/i.test(c) ? 'Deuda previsional F931 — Enero 2026'
          : `Otro — ${c.slice(0, 40)}`
    const p = m.get(nombre) ?? { nombre, cuotas: [], total: 0 }
    p.cuotas.push({ monto: Number(x.total) || 0, fecha: x.fecha_pago ? new Date(x.fecha_pago).toISOString().slice(0, 10) : null })
    p.total += Number(x.total) || 0
    m.set(nombre, p)
  }
  return [...m.values()].map((p) => {
    const pendientes = p.cuotas.filter((c) => !c.fecha || c.fecha > HOY)
    return {
      ...p,
      n: p.cuotas.length,
      pagadas: p.cuotas.length - pendientes.length,
      saldo: pendientes.reduce((s, c) => s + c.monto, 0),
      proxima: pendientes.map((c) => c.fecha).filter(Boolean).sort()[0] ?? null,
      // Cuánto cae en cada mes de ESTE año: es lo que permite ponerlas en la misma grilla mensual
      // que todo el resto de la pestaña, en vez de en una tablita aparte con sus propias columnas.
      porMes: Array.from({ length: 13 }, (_, m) => (m === 0 ? 0 : p.cuotas
        .filter((c) => c.fecha && Number(c.fecha.slice(0, 4)) === AÑO && Number(c.fecha.slice(5, 7)) === m)
        .reduce((s, c) => s + c.monto, 0))),
    }
  }).sort((a, b) => b.saldo - a.saldo)
}

/** NÚCLEO PURO: arma la grilla entera de la pestaña. Devuelve las filas y las marcas que usa el formato. */
export function grilla({ periodos, conceptos, ps, C, corte }) {
  const filas = []
  /** Empuja una fila rellenando hasta el ancho de la grilla y devuelve su número de fila real. */
  const push = (c = []) => {
    const r = [...c]
    // VACIO = "es mi celda y va vacía". Sin esto la fusión preservaría lo que había antes en esa
    // celda —incluidos los restos de la pestaña vieja— y el cuadro mostraría dos verdades.
    while (r.length < ANCHO) r.push(VACIO)
    for (let j = 0; j < ANCHO; j++) if (r[j] === '' || r[j] === undefined || r[j] === null) r[j] = VACIO
    filas.push(r)
    return filas.length
  }
  /** Una fila del cuadro mensual: rótulo, doce meses, total y origen. */
  const mensual = (rotulo, celda, origen, { meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], totaliza = true } = {}) => {
    const f = filas.length + 1
    const cols = Array.from({ length: 12 }, (_, i) => (meses.includes(i + 1) ? celda(i + 1) : VACIO))
    return push([rotulo, ...cols, totaliza ? `=SUM($B${f}:$M${f})` : VACIO, origen])
  }
  const cabecera = () => push(['Concepto', ...MES.slice(1).map((m) => `'${m}-${String(AÑO).slice(2)}`), 'Total', 'De dónde sale'])

  // ── TÍTULO Y HERO ──────────────────────────────────────────────────────────────────────────────
  push(['Cargas sociales'])
  push([`Qué genera la nómina, qué se paga y cuándo sale de la caja · DDJJ F931 del data room + Compras · al ${ar(corte)}`])
  push()

  push(['LA POSICIÓN', 'Monto', ...Array(11).fill(VACIO), VACIO, 'De dónde sale'])
  // El titular se completa al final, cuando ya se sabe en qué filas quedaron los totales.
  const hCosto = push([rotuloTotal('Costo laboral del año — devengado'), '@COSTO', ...Array(11).fill(VACIO), VACIO, 'Declarado ene–jun más lo proyectado jul–dic.'])
  const hDecl = push([sub('declarado en las DDJJ F931 (ene–jun)'), '@DECL', ...Array(11).fill(VACIO), VACIO, `Sección 1 · réplica ${RAW}, leída de los PDF.`])
  const hProy = push([sub('proyectado (jul–dic)'), '@PROY', ...Array(11).fill(VACIO), VACIO, 'Sección 4 · alícuotas medidas sobre los seis meses reales.'])
  const hDeuda = push([rotuloTotal('Deuda previsional en planes de pago'), '@DEUDA', ...Array(11).fill(VACIO), VACIO, 'Sección 7 · cuotas todavía no pagadas.'])
  push()

  // ── 1 · DECLARADO ──────────────────────────────────────────────────────────────────────────────
  push([seccion(1, 'Declarado en la DDJJ F931 — ¿cuánto generó la nómina cada mes?')])
  cabecera()
  const d0 = filas.length + 1
  const filaDecl = {}
  for (const c of conceptos) {
    const f = mensual(c.rotulo, (m) => (periodos.includes(`${AÑO}-${String(m).padStart(2, '0')}`)
      ? celdaF931(`${AÑO}-${String(m).padStart(2, '0')}`, c.codigo) : VACIO),
    `Código ${c.codigo} de la DDJJ · ${RAW}`)
    filaDecl[c.codigo] = f
  }
  const d1 = filas.length
  const fDeclTot = mensual(rotuloTotal('Total declarado'), (m) => `=SUM(${cm(m)}${d0}:${cm(m)}${d1})`, 'Suma de los conceptos de arriba.')
  const fEmp = mensual('Empleados en nómina', (m) => (periodos.includes(`${AÑO}-${String(m).padStart(2, '0')}`)
    ? celdaCabecera(`${AÑO}-${String(m).padStart(2, '0')}`, 'E') : VACIO), 'Cabecera de la DDJJ.', { totaliza: false })
  const fRem = mensual('Remuneración declarada', (m) => (periodos.includes(`${AÑO}-${String(m).padStart(2, '0')}`)
    ? celdaCabecera(`${AÑO}-${String(m).padStart(2, '0')}`, 'F') : VACIO), 'Cabecera de la DDJJ. Es la base de todas las alícuotas.')
  push()

  // ── 2 · PAGADO ─────────────────────────────────────────────────────────────────────────────────
  push([seccion(2, 'Pagado — ¿cuánto salió efectivamente de la caja?')])
  cabecera()
  // LAS COLUMNAS DE COMPRAS SE RESUELVEN POR SU ENCABEZADO. Éste es el bloque que estaba en #VALUE!
  // desde que una columna de Compras se movió y la referencia por letra quedó en #REF!.
  // PAGADO ES PAGADO: SÓLO HASTA HOY.
  //
  // EL DEFECTO QUE ESTO CORRIGE (23/07). Compras tiene cargados los pagos PREVISTOS de los meses que
  // vienen, con su fecha de caja futura. Sin el tope de hoy, la sección "¿cuánto salió efectivamente
  // de la caja?" mostraba $9.000.000 en julio, $8.000.000 en agosto y $6.500.000 de septiembre a
  // diciembre —números redondos, o sea presupuestados— y el total del año daba $103,7M contra
  // $44,8M declarados. Un cuadro de lo pagado que incluye lo que todavía no se pagó no es un error
  // de presentación: es un número que se usa para decidir y está mal. Lo previsto se contrasta en la
  // sección 5, donde corresponde, contra la proyección propia.
  const mes = (m) => `">="&DATE(${AÑO};${m};1);${rango(C.fecha)};"<="&MIN(EOMONTH(DATE(${AÑO};${m};1);0);TODAY())`
  const pagado = (param) => (m) => `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$${param};${rango(C.fecha)};${mes(m)});0)`
  const p0 = filas.length + 1
  const filaPag = {}
  filaPag.F931 = mensual('F931', pagado(35), `Compras · "${'F931'}" en Cliente/Asignación, por fecha de caja (col. ${C.fecha}).`)
  filaPag.plan = mensual('Deuda previsional en cuotas', (m) =>
    `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$41;${rango(C.detalle)};'Parámetros'!$B$41;${rango(C.fecha)};${mes(m)});0)`,
  'Compras · plan de pago, por fecha de caja.')
  ;[['FCL', 36], ['UOCRA', 37], ['IERIC', 38], ['FODECO', 39]].forEach(([r, p]) => {
    filaPag[r] = mensual(r, pagado(p), `Compras · "${r}" en Cliente/Asignación, por fecha de caja.`)
  })
  const p1 = filas.length
  const fPagTot = mensual(rotuloTotal('Total pagado'), (m) => `=SUM(${cm(m)}${p0}:${cm(m)}${p1})`, 'Suma de los conceptos de arriba.')
  push()

  // ── 3 · DECLARADO CONTRA PAGADO ────────────────────────────────────────────────────────────────
  push([seccion(3, 'Declarado contra pagado — ¿estamos al día?')])
  cabecera()
  mensual('Diferencia (pagado − declarado)', (m) => `=${cm(m)}${fPagTot}-${cm(m)}${fDeclTot}`,
    'No tiene que dar cero mes a mes: el F931 de un mes se paga al mes siguiente, así que la diferencia corre un mes. Lo que importa es que el acumulado del año cierre.')
  push()

  // ── 4 · PROYECCIÓN ─────────────────────────────────────────────────────────────────────────────
  push([seccion(4, `Proyección ${MES[DESDE_PROY]}–dic — ¿cuánto va a costar lo que viene?`)])
  cabecera()
  const proyMeses = Array.from({ length: 12 - DESDE_PROY + 1 }, (_, i) => DESDE_PROY + i)
  const fRelacion = mensual('Remuneración declarada ÷ jornales netos', (m) => (m === DESDE_PROY
    ? `=IFERROR(SUM(${REALES(fRem)})/(${[1, 2, 3, 4, 5, 6].map((x) => jornalesDelMes(`DATE(${AÑO};${x};1)`)).join('+')});"")` : VACIO),
  'Medido sobre los seis meses que tienen las dos cifras. Lo declarado en F931 no es el neto pagado en mano: esta relación traduce una en otra.', { meses: proyMeses, totaliza: false })
  const fRemProy = mensual('Remuneración proyectada', (m) => `=IFERROR((${jornalesDelMes(`DATE(${AÑO};${m};1)`)})*$${cm(DESDE_PROY)}$${fRelacion};0)`,
    'Jornales proyectados × la relación de arriba.', { meses: proyMeses })
  const fDot = mensual('Dotación proyectada', () => `=IFERROR(ROUND(AVERAGE(${REALES(fEmp)});0);"")`,
    'Se mantiene el promedio de ene–jun: no hay un plan de contratación cargado en ningún lado, y suponer que crece sería inventarlo.', { meses: proyMeses, totaliza: false })
  const y0 = filas.length + 1
  const filasProy = []
  const sinBase = []
  for (const c of CONCEPTOS_PROY) {
    const origen = c.de === 'declarado' ? filaDecl[c.codigo] : filaPag[c.rotulo]
    // UN CONCEPTO SIN BASE NO SE PROYECTA EN CERO EN SILENCIO: se anota y se denuncia abajo. Que
    // falte una fila de la proyección tiene que verse, porque el titular de la pestaña la suma.
    if (!origen) { sinBase.push(c.rotulo); continue }
    const f = filas.length + 1
    // La alícuota se MIDE sobre los seis meses reales y viaja en la columna de origen, escrita como
    // texto por fórmula: así el número que se lee en la grilla son pesos, no una mezcla de pesos con
    // porcentajes en la misma columna, y la regla sigue siendo auditable de un vistazo.
    const alicuota = c.base === 'dotacion'
      ? `IFERROR(SUM(${REALES(origen)})/SUM(${REALES(fEmp)});0)`
      : `IFERROR(SUM(${REALES(origen)})/SUM(${REALES(fRem)});0)`
    const celda = (m) => (c.base === 'dotacion'
      ? `=(${alicuota})*${cm(m)}$${fDot}`
      : `=(${alicuota})*${cm(m)}$${fRemProy}`)
    filasProy.push(mensual(c.rotulo, celda,
      `=${c.base === 'dotacion' ? `"$"&TEXT(${alicuota};"#,##0")&" por empleado por mes"` : `TEXT(${alicuota};"0,00%")&" de la remuneración declarada"`}&", medido sobre ene–jun. ${(c.nota ?? '').replace(/"/g, "'")}"`,
      { meses: proyMeses }))
    if (f !== filasProy[filasProy.length - 1]) throw new Error('desalineación al armar la proyección')
  }
  const y1 = filas.length
  const fProyTot = mensual(rotuloTotal('Total devengado en el mes'), (m) => `=SUM(${cm(m)}${y0}:${cm(m)}${y1})`,
    'Lo que la nómina de ESE mes genera de cargas. Todavía no es lo que sale de la caja: eso es la sección 5.', { meses: proyMeses })
  if (sinBase.length) {
    push([`⚠ ${sinBase.length} concepto(s) sin base para proyectar`, ...Array(13).fill(VACIO),
      `${sinBase.join(', ')} — no aparecen en las secciones 1 ni 2, así que no se proyectan. El total de arriba está incompleto en esa medida.`])
  }
  push()

  // ── 5 · CUÁNDO SALE DE LA CAJA ─────────────────────────────────────────────────────────────────
  push([seccion(5, 'Cuándo sale de la caja — el F931 vence al mes siguiente')])
  cabecera()
  mensual('Cargas que salen en el mes', (m) => (m === DESDE_PROY
    ? `=${cm(6)}${fDeclTot}` : `=${cm(m - 1)}${fProyTot}`),
  'El devengado del mes ANTERIOR. La proyección vieja ponía la carga de julio en julio: en un cuadro de caja eso corre unos $9M de mes. Ésta es la fila que tiene que mirar el cash flow.', { meses: proyMeses })
  mensual('Cuotas de planes de pago que vencen', (m) => {
    const v = ps.reduce((s, p) => s + (p.porMes[m] || 0), 0)
    return v ? v : VACIO
  }, 'Sección 7. Van aparte porque son deuda vieja financiada, no la carga del mes.', { meses: proyMeses })
  // EL CONTRASTE QUE FALTABA: qué tiene cargado Compras para esos meses. No es otra proyección —es
  // lo que una persona previó a mano— y por eso vale como control: si la proyección medida y lo
  // previsto se separan mucho, uno de los dos está mal y conviene saberlo antes y no en el mes.
  const fPrevisto = mensual('Previsto en Compras para ese mes', (m) =>
    `=IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$35;${rango(C.fecha)};">"&TODAY();${rango(C.fecha)};"<="&EOMONTH(DATE(${AÑO};${m};1);0));0)-IFERROR(SUMIFS(${rango(C.total)};${rango(C.cliente)};'Parámetros'!$A$35;${rango(C.fecha)};">"&TODAY();${rango(C.fecha)};"<"&DATE(${AÑO};${m};1));0)`,
  'Los pagos de F931 que Compras tiene cargados con fecha futura. Es lo que alguien previó, no lo que salió.', { meses: proyMeses })
  // La comparación arranca DESPUÉS del mes en curso: el mes corriente ya tiene su F931 pagado, así
  // que "previsto de acá en adelante" da cero y restarlo contra el devengado inventaría un desvío de
  // doce millones que no existe.
  mensual(sub('diferencia contra lo proyectado acá'), (m) => `=${cm(m)}${fPrevisto}-${cm(m - 1)}${fProyTot}`,
    'Si esta fila se aleja de cero, la previsión cargada a mano y la proyección medida no coinciden.',
    { meses: proyMeses.filter((m) => m > DESDE_PROY) })
  push(['⚠ Lo que esta proyección NO contempla', ...Array(13).fill(VACIO),
    'SAC y vacaciones (sección 6), y cualquier alta de personal que no esté en los jornales cargados.'])
  push()

  // ── 6 · SAC Y VACACIONES ───────────────────────────────────────────────────────────────────────
  push([seccion(6, 'SAC y vacaciones — lo devengado que todavía no se pagó')])
  cabecera()
  const fSacPag = mensual('SAC pagado (real, de Compras)', (m) =>
    `=SUMPRODUCT((LOWER(${rango(C.proveedor)})="sac")*(YEAR(${rango(C.fechaFactura)})=${AÑO})*(MONTH(${rango(C.fechaFactura)})=${m})*IF(ISNUMBER(${rango(C.total)});${rango(C.total)};0))`,
  'Compras · proveedor "SAC", por fecha de factura.')
  const fSacDev = mensual('SAC devengado (1/12 de la remuneración)', (m) => `=IFERROR(${cm(m)}$${fRem}/12;"")`,
    'Así se devenga el aguinaldo: un doceavo de la remuneración de cada mes.')
  mensual('Provisión acumulada (devengado − pagado)', (m) => `=SUM($B${fSacDev}:${cm(m)}${fSacDev})-SUM($B${fSacPag}:${cm(m)}${fSacPag})`,
    'Acumulado, no del mes: es cuánto se debe de aguinaldo a esta altura del año.', { totaliza: false })
  push(['Vacaciones', ...Array(13).fill(VACIO),
    '⚠ Falta la antigüedad por legajo: sin eso los días que le corresponden a cada uno no se pueden calcular, y no se inventan. Una provisión inventada es peor que una ausente, porque se usa.'])
  push()

  // ── 7 · PLANES DE PAGO ─────────────────────────────────────────────────────────────────────────
  push([seccion(7, 'Planes de pago de deuda previsional — las cuotas, mes por mes')])
  cabecera()
  const q0 = filas.length + 1
  for (const p of ps) {
    mensual(p.nombre, (m) => (p.porMes[m] ? p.porMes[m] : VACIO),
      `${p.n} cuota(s) cargada(s) · ${p.pagadas} pagada(s) · saldo ${Math.round(p.saldo).toLocaleString('es-AR')} · próxima ${ar(p.proxima) || '—'}`)
  }
  const q1 = filas.length
  mensual(rotuloTotal('Total de cuotas del año'), (m) => `=SUM(${cm(m)}${q0}:${cm(m)}${q1})`, 'Suma de los planes de arriba.')
  const fCtrl = push([rotuloTotal('Control contra Compras'), `=SUMIF(Compras!$${C.rubro}$4:$${C.rubro};"Deuda previsional (planes de pago)";${rango(C.total)})`,
    ...Array(11).fill(VACIO), VACIO, 'El total del rubro en Compras, calculado por otro camino.'])
  // EL CONTROL COMPARA LO MISMO CONTRA LO MISMO. La primera versión restaba "cuotas del año" MÁS
  // "saldo pendiente", y una cuota pendiente de agosto está en los dos: se contaba dos veces y la
  // diferencia daba −$473.767 sin que nada estuviera mal. La identidad correcta es simple: el total
  // del rubro en Compras tiene que ser la suma de TODAS las cuotas cargadas de todos los planes.
  push([rotuloTotal('Diferencia — tiene que ser $0'), `=$B${fCtrl}-${Math.round(ps.reduce((s, p) => s + p.total, 0))}`,
    ...Array(11).fill(VACIO), VACIO, `Contra la suma de las ${ps.reduce((s, p) => s + p.n, 0)} cuotas cargadas de los ${ps.length} planes. Si no da cero, hay cuotas del rubro que esta tabla no ve.`])
  push(['⚠ Lo que falta saber', ...Array(13).fill(VACIO),
    'De cuántas cuotas es cada plan EN TOTAL. En Compras están las cuotas cargadas, no el plan original de ARCA: el saldo pendiente es lo previsto en la planilla, no necesariamente lo que falta pagar de verdad.'])

  // ── EL HERO, RECIÉN AHORA: ya se sabe en qué fila quedó cada total ──────────────────────────────
  const saldoPlanes = Math.round(ps.reduce((s, p) => s + p.saldo, 0))
  filas[hDecl - 1][1] = `=SUM(${REALES(fDeclTot)})`
  filas[hProy - 1][1] = `=SUM($${cm(DESDE_PROY)}$${fProyTot}:$M$${fProyTot})`
  filas[hCosto - 1][1] = `=$B$${hDecl}+$B$${hProy}`
  filas[hDeuda - 1][1] = saldoPlanes
  // NO TODO LO QUE ESTÁ EN LA GRILLA ES PLATA. Una dotación de 21 personas mostrada como "$21" y
  // una relación de 0,67 mostrada como "$1" son números que el ojo lee mal y que además hacen dudar
  // del resto del cuadro. Se declaran acá para que el formato las trate por lo que son.
  // El titular de la pestaña: la cifra que contesta la pregunta de arriba de todo.
  return { filas, cantidades: [fEmp, fDot], ratios: [fRelacion], titular: hCosto }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // ── Qué períodos y qué conceptos declaró de verdad la empresa: sale de la réplica de los PDF. ──
  const raw = await google.readSheetValues(ID, `${RAW}!A4:G200`)
  const periodos = [...new Set(raw.map((f) => String(f?.[0] ?? '').trim()).filter((p) => /^\d{4}-\d{2}$/.test(p)))].sort()
  const vistos = new Map()
  for (const f of raw) {
    const cod = String(f?.[1] ?? '').trim()
    if (!cod) continue
    // El rótulo corto es el que usa la proyección para encontrar su fila: se deriva del nombre
    // completo sacándole el código entre paréntesis, no se escribe dos veces.
    const nombre = String(f?.[2] ?? '').trim()
    if (!vistos.has(cod)) vistos.set(cod, { codigo: cod, rotulo: nombre, corto: nombre.replace(/\s*\(\d+\)\s*$/, '').replace(/\s*—\s*ART$/, '') })
  }
  const conceptos = [...vistos.values()]
  if (!periodos.length) { console.error(`no hay datos en ${RAW}: corré primero f931-sheet.mjs`); process.exit(1) }

  // ── Las columnas de Compras, POR SU ENCABEZADO. Acá se arregla el #REF! de raíz. ──
  const cab = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { col: C, faltan } = resolverColumnas(cab, {
    total: 'Total', cliente: 'Cliente / Asignación', detalle: 'Detalles / Obra',
    fecha: 'Fecha de caja', rubro: 'Rubro de caja', proveedor: 'Proveedor', fechaFactura: 'Fecha factura',
  })
  if (faltan.length) { console.error(`⚠ faltan columnas en Compras: ${faltan.join(', ')} — no escribo con referencias inventadas`); process.exit(1) }
  console.log(`Compras por encabezado: Total=${C.total} · Cliente=${C.cliente} · Fecha de caja=${C.fecha} · Rubro=${C.rubro}`)

  const ps = await planes()
  console.log(`${periodos.length} período(s) F931 · ${conceptos.length} concepto(s) · ${ps.length} plan(es) de pago`)

  const { filas, cantidades, ratios, titular } = grilla({ periodos, conceptos, ps, C, corte: HOY })
  console.log(`grilla: ${filas.length} filas × ${ANCHO} columnas — un solo ancho para toda la pestaña`)
  if (DRY) return

  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}"`)

  // ═══ LA COLA DE LA PESTAÑA VIEJA ═══
  //
  // Este script reemplaza a los tres que escribían acá antes, y su grilla es más corta que la suma
  // de los bloques anteriores. Sin esto, las filas de más abajo sobrevivirían —el precio declarado
  // de no borrar nunca— y quedarían dos cuadros de planes de pago, uno arriba y otro debajo.
  //
  // Se extiende la grilla con filas marcadas VACIO hasta la última fila con contenido: VACIO
  // significa "es mi celda y va vacía", así que se limpia lo que este generador (o sus antecesores)
  // dejaron, y CUALQUIER anotación de una persona en una columna que el generador no ocupa se
  // conserva igual, porque la fusión sólo limpia donde hay centinela.
  const previo = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${COL_ORIGEN}400`)
  let ultima = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultima = i + 1 })
  if (ultima > filas.length) {
    console.log(`cola de la pestaña vieja: limpio las filas ${filas.length + 1}–${ultima} (${ultima - filas.length} filas de los generadores anteriores)`)
    for (let i = filas.length; i < ultima; i++) filas.push(Array(ANCHO).fill(VACIO))
  }

  // Las celdas combinadas de la pestaña vieja se tragan la escritura EN SILENCIO: ni error ni valor.
  await google.spreadsheetBatchUpdate(ID, [
    { unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(filas.length + 40, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: Math.max(ANCHO, hoja.cols ?? ANCHO) } } },
  ]).catch(() => {})

  // NO se borra nada de lo que escribió una persona: se fusiona. Lo que el generador deja vacío a
  // propósito viene marcado con VACIO y se limpia; lo que no es suyo, se conserva.
  // ═══ REGLA 0 — REVISAR LO QUE LA PERSONA EDITÓ, ANTES DE ESCRIBIR ═══
  // Si el dueño reescribió un rótulo, lo reencuadró o lo borró, gana lo suyo y el generador se
  // adapta. Se compara contra lo que ESTE generador escribió la última vez, que es la única forma
  // de distinguir una edición de una versión vieja de sí mismo. Ver lib/respetar-ediciones.mjs.
  const { grid: gridFinal, respetadas, ediciones } = await conEdicionesRespetadas(ID, PESTAÑA, filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  const { conservadas } = await escribirPreservando(google, ID, `'${PESTAÑA}'`, gridFinal, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  if (conservadas.length) console.log(`✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  await formatear(google, hoja.sheetId, gridFinal, { cantidades, ratios, titular })

  // ── VERIFICAR MIRANDO LA PESTAÑA, no confiando en que la escritura salió bien ──
  const v = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:${COL_ORIGEN}${filas.length}`)
  const errores = v.flat().filter((c) => /^#(REF|ERROR|N\/A|VALUE|VALOR|¿|¡|DIV|NAME|NUM|NULL)/i.test(String(c ?? '')))
  console.log(errores.length ? `⚠ ${errores.length} celda(s) en error` : '✓ ninguna celda en error')
  const defectos = auditarPatron(v)
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 46).padEnd(48)}${String(f[1] ?? '').padStart(16)}${String(f[13] ?? '').padStart(16)}`)
  // El registro de rótulos se guarda con lo que QUEDÓ escrito, no con lo que quise escribir.
  await guardarRegistro(ID, PESTAÑA, gridFinal, ediciones, v).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  if (errores.length || defectos.length) process.exitCode = 1
}

/** El formato: la piel de statement compartida más lo propio de la grilla mensual. */
async function formatear(google, sheetId, filas, { cantidades = [], ratios = [], titular = 0 } = {}) {
  // LA PROCEDENCIA SALE DEL CUERPO. La columna quedaba como un muro de párrafos grises al costado de
  // cada fila: el texto pasa a la nota del concepto y la columna deja de robar ancho.
  const { requests: notas, conNota } = origenANota(filas, ANCHO - 1, sheetId)
  if (conNota) console.log(`${conNota} procedencias pasaron a la nota del concepto: el cuadro deja de competir con su propia letra chica`)
  const rg = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const moneda = { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }
  const reqs = [
    ...notas,
    ...skinRequests({ sheetId, filas, cols: ANCHO, congeladas: 2, titular }),
    // Los doce meses más el total: moneda, a la derecha, con cifras tabulares. Es lo que permite
    // comparar hacia abajo sin leer cada número.
    { repeatCell: { range: rg(3, filas.length, 1, 14), cell: { userEnteredFormat: { numberFormat: moneda, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } },
    // La columna de origen: chica, apagada, y que envuelva. Es explicación, no dato.

    // Las filas vuelven a su altura: al sacar el muro de texto de la derecha quedaron con el alto
    // que ESE texto necesitaba, y la pestaña medía tres pantallas de aire.
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: filas.length }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 }, properties: { pixelSize: 108 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 124 }, fields: 'pixelSize' } },
    // La columna de procedencia ya no muestra texto (vive en la nota): angosta, para que no abra un
    // hueco al costado del cuadro.
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
  ]
  // Los encabezados de mes: rótulos de columna, no importes — sin formato de moneda encima.
  filas.forEach((f, i) => {
    if (String(f?.[0]) !== 'Concepto') return
    reqs.push({ repeatCell: { range: rg(i, i + 1, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })
  })
  // Las filas que no son plata, con el formato de lo que son.
  for (const f of cantidades) {
    reqs.push({ repeatCell: { range: rg(f - 1, f, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0;;"—"' } } }, fields: 'userEnteredFormat.numberFormat' } })
  }
  for (const f of ratios) {
    reqs.push({ repeatCell: { range: rg(f - 1, f, 1, 14), cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%;;"—"' } } }, fields: 'userEnteredFormat.numberFormat' } })
  }
  await google.spreadsheetBatchUpdate(ID, reqs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
