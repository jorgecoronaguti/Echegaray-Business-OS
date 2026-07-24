#!/usr/bin/env node
// Rehace el Cash Flow Semanal y el Mensual desde UNA sola lista de líneas.
//
// Antes cada pestaña tenía su propia lista escrita a mano y no coincidían: el Mensual se comía
// $9.825.332 de servicios recurrentes, los dos leían Estructura de un rango muerto ($33.223.269 en
// cero) y la nómina estaba abierta en el Semanal y junta en el Mensual. Ahora las dos salen de
// cash-flow-lineas.mjs y cada línea es un rubro de la columna "Rubro de caja" de Compras, que es
// una partición: duplicar es imposible, y lo que quedara afuera lo muestra el control del pie.
//
//   node orquestador/scripts/cash-flow-rehacer.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  bloqueControl, CUADRO, verificarCuadro, formulaLineaMes, expresionReal, formulaTotalRubro, origenLinea,
  tablasDeProyeccion, formulaChequesSinFactura,
} from '../lib/cash-flow-lineas.mjs'
import { REGLAS } from '../lib/rubro-caja.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { CAJA as N_CAJA } from '../lib/rangos-nombrados.mjs'
import { ubicarCaja } from '../lib/caja-disponibilidades.mjs'
import { formulaInteresMes } from '../lib/costo-descubierto.mjs'
import { formulaImpuesto } from '../lib/impuesto-cheque.mjs'

/** En qué pestaña está el detalle de un rubro. Sale de REGLAS: una sola definición. */
const detallePorRubro = (r) => REGLAS.find((x) => x.rubro === r)?.detalle ?? 'Compras'
import {
  normComprobante, esLlaveUtil, faltaFacturaConFecha, montoEnVentana, MARCAS,
} from '../lib/cheques-cobertura.mjs'
import { parseMonto, parseFecha } from '../lib/cash-briefing.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const AÑO = 2026

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// ── Las 53 semanas del año, arrancando el lunes ───────────────────────────────────────────────────
function semanas() {
  const d = new Date(Date.UTC(AÑO, 0, 1))
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1) // retroceder al lunes
  const out = []
  for (let i = 0; i < 53; i++) { out.push(new Date(d)); d.setUTCDate(d.getUTCDate() + 7) }
  return out
}
const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`

/**
 * Arma la grilla de una pestaña de cash flow.
 * @param {'semanal'|'mensual'} periodo
 */
function grilla(periodo, faltantes = [], refCaja = null, refCajaFecha = null, filasTabla = {}) {
  const cols = periodo === 'semanal' ? semanas() : Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(AÑO, m, 1)))
  const n = cols.length
  const colTotal = letra(n + 1) // A + n períodos → la siguiente es el total
  const FILA_CAB = 3
  // Ventana de cada columna: el mes usa el primero del mes siguiente como límite excluyente, así
  // ningún día cae entre dos meses ni se cuenta dos veces (febrero no tiene 30).
  const desde = (i) => `${letra(i + 1)}$${FILA_CAB}`
  const hasta = (i) => (periodo === 'semanal' ? `${letra(i + 1)}$${FILA_CAB}+7` : `EOMONTH(${letra(i + 1)}$${FILA_CAB};0)+1`)

  const filas = []
  const meta = {} // dónde quedó cada cosa, para las fórmulas de totales
  const push = (celdas) => { filas.push(celdas); return filas.length }

  push([periodo === 'semanal' ? `Cash Flow Semanal ${AÑO} — cuándo entra y sale la plata` : `Cash Flow Mensual ${AÑO} — cuándo entra y sale la plata`])
  // A2 = el atajo a la semana de hoy.
  //
  // EL RANGO TIENE QUE SER UNA CELDA, NO UNA COLUMNA. La versión anterior armaba ADDRESS(1;col;4) y
  // le sacaba el "1" con SUBSTITUTE para quedarse con la letra: producía "AE", y Google contesta
  // "no se puede abrir el vínculo porque se borró el rango vinculado" — porque "AE" a secas no es un
  // rango A1 válido. Medido en el Sheet real: la fórmula vieja devolvía AE y la nueva AE3.
  // Apuntar a la fila del encabezado además deja la semana a la vista con su fecha arriba. En una grilla de 53 semanas, sin esto hay que buscar a mano
  // dónde estamos cada vez que se abre la pestaña. El dueño lo pidió de vuelta después de que se lo
  // borré al rehacer el cuadro. HYPERLINK a la celda de la columna cuya semana contiene HOY.
  const irASemana = periodo === 'semanal'
    ? `=HYPERLINK("#gid=SEMGID&range="&ADDRESS(${FILA_CAB};MATCH(1;ARRAYFORMULA((${letra(1)}$${FILA_CAB}:${letra(n)}$${FILA_CAB}<=TODAY())*(${letra(1)}$${FILA_CAB}:${letra(n)}$${FILA_CAB}+7>TODAY()));0)+1;4);"📅 IR A LA SEMANA DE HOY — "&TEXT(TODAY();"dd/mm/yyyy"))`
    : `=HYPERLINK("#gid=SEMGID&range="&ADDRESS(${FILA_CAB};MONTH(TODAY())+1;4);"📅 IR AL MES DE HOY — "&TEXT(TODAY();"mmmm yyyy"))`
  const nota = periodo === 'semanal'
    ? 'Estado de flujo de efectivo por método directo (RT 8/9 · NIC 7): operativas, inversión y financiación. Tocá el + del margen izquierdo para abrir el detalle de cada categoría. ESTE CUADRO MUESTRA LO COMPROMETIDO: sólo cobros y pagos con fecha ya cargada — las proyecciones están en el Mensual, porque a nivel semana una proyección de materiales es ruido, no información.'
    : 'Estado de flujo de efectivo por método directo (RT 8/9 · NIC 7): operativas, inversión y financiación. Tocá el + del margen izquierdo para abrir el detalle de cada categoría. Los meses que todavía no pasaron son PROYECCIÓN: Estructura y Recurrentes traen la suya de su propia pestaña; el resto usa el ritmo de los últimos 3 meses cerrados ajustado por inflación. Los INGRESOS no se proyectan (no hay obra facturada de octubre en adelante), así que el déficit del último trimestre es un piso, no un pronóstico.'
  push([irASemana, nota])
  meta.cabFila = push(['Período', ...cols.map(fechaAR), `Total ${AÑO}`])

  // ── EL CUERPO DEL ESTADO, POR ACTIVIDAD ────────────────────────────────────────────────────────
  // Cada categoría muestra su subtotal; el detalle va agrupado debajo y se abre con el +/- del
  // margen. El dueño lee subtotales para decidir y abre el detalle sólo cuando algo no cierra.
  const { lineas: lineasCuadro } = verificarCuadro()
  const finVentana = (i) => (periodo === 'semanal'
    ? new Date(cols[i].getTime() + 7 * 86400000)
    : new Date(Date.UTC(AÑO, cols[i].getUTCMonth() + 1, 1)))
  const sumaFilas = (f0, f1) => cols.map((_, i) => `=SUM(${letra(i + 1)}${f0}:${letra(i + 1)}${f1})`)

  meta.grupos = []      // [{fila0, fila1}] los rangos que se agrupan con +/-
  meta.actividades = [] // las filas de encabezado de cada actividad
  meta.detalle = []     // las filas de detalle, para la columna "dónde está"
  const subtotalesAct = []

  for (const act of CUADRO) {
    push([])
    push([act.actividad, act.nota])
    const filaAct = filas.length
    const subGrupos = []
    for (const g of act.grupos) {
      const filaGrupo = filas.length + 1
      push([`${g.signo > 0 ? '' : '(–) '}${g.nombre}`])
      const d0 = filas.length + 1
      for (const l of g.lineas) {
        const f = periodo === 'mensual'
          ? cols.map((_, i) => formulaLineaMes(l, letra(i + 1), letra(i + 1), FILA_CAB, filasTabla))
          : cols.map((_, i) => `=${expresionReal(l, desde(i), hasta(i))}`)
        // La línea de cheques SUMA las marcas que el OS escribe al lado de cada cheque y de cada
        // consumo de tarjeta. Antes era el único lugar del cuadro con números pegados: el día que se
        // cargaba una factura que faltaba, la línea seguía mostrando el importe viejo.
        // Los intereses se calculan sobre el saldo con el que ARRANCA cada mes, que es la celda
        // "Efectivo al inicio" de SU MISMA columna. No hay circularidad: ese inicio es el cierre del
        // mes anterior, que ya está resuelto cuando le toca el turno a este mes.
        //
        // ME EQUIVOQUÉ UNA VUELTA ANTES y conviene dejarlo escrito: la primera versión referenciaba
        // el inicio de la columna ANTERIOR, o sea un mes de más para atrás. Diciembre calculaba
        // sobre el saldo de noviembre al arrancar (−$56,7M) en vez del de diciembre (−$127,1M), y
        // daba $2.969.865 donde van $6,6M. El error no se ve en ningún control: la suma cierra igual.
        //
        // Es un PISO declarado: no cobra la deuda que se toma dentro del mismo mes. En el semanal no va: a nivel semana el saldo
        // inicial no está calculado y un interés semanal sería ruido.
        const celdas = l.cheques
          ? cols.map((_, i) => formulaChequesSinFactura(desde(i), hasta(i), MARCAS.falta))
          : l.descubierto
            // En el semanal va VACÍO, no cero: a nivel semana no hay saldo inicial calculado, así
            // que no se puede saber el interés. Un 0 escrito dice "no hay interés" y es distinto de
            // "no se puede saber" — además son 53 números pegados que el auditor marca, con razón.
            ? cols.map((_, i) => (periodo === 'mensual'
              ? formulaInteresMes(`${letra(i + 1)}#{INICIO}`, `${letra(i + 1)}$${FILA_CAB}`)
              : ''))
            : l.impuestoCheque
              // Se resuelve al final: necesita la lista de TODAS las demás líneas, que todavía no
              // existen. Referenciar el total de egresos sería circular — esta línea es un egreso.
              ? cols.map((_, i) => (periodo === 'mensual' ? `#{IMP:${letra(i + 1)}}` : ''))
              : f
        push([`    ${l.nombre}`, ...celdas])
        meta.detalle.push({ fila: filas.length, linea: l, signo: g.signo })
      }
      const d1 = filas.length
      // El subtotal de la categoría suma su propio detalle. Con signo: los pagos se muestran en
      // positivo dentro de su categoría (es lo que se paga) y la categoría entra restando al flujo.
      filas[filaGrupo - 1] = [filas[filaGrupo - 1][0], ...sumaFilas(d0, d1)]
      meta.grupos.push({ fila0: d0, fila1: d1 })
      subGrupos.push({ fila: filaGrupo, signo: g.signo })
    }
    const expr = (i) => subGrupos.map((sg) => `${sg.signo > 0 ? '+' : '-'}${letra(i + 1)}${sg.fila}`).join('')
    const filaSub = push([`FLUJO NETO DE ${act.actividad}`, ...cols.map((_, i) => `=${expr(i)}`)])
    subtotalesAct.push(filaSub)
    meta[`sub_${subtotalesAct.length}`] = filaSub
    filas[filaAct - 1][0] = act.actividad
    meta.actividades.push(filaAct)
  }
  meta.subtotales = subtotalesAct

  // ── EL CIERRE QUE PIDE LA NORMA ────────────────────────────────────────────────────────────────
  push([])
  meta.variacion = push(['AUMENTO / (DISMINUCIÓN) NETA DEL EFECTIVO',
    ...cols.map((_, i) => `=${subtotalesAct.map((f) => `${letra(i + 1)}${f}`).join('+')}`)])
  // El efectivo al inicio: el primer período lo toma del único lugar donde puede vivir un saldo
  // real, y de ahí en adelante encadena. Hoy esa celda está VACÍA y por eso el cuadro arranca en
  // cero — no es un error de fórmula, es un dato que la empresa todavía no cargó, y así se dice.
  // El saldo real sale de la pestaña CAJA, que es el único lugar del archivo donde vive un saldo.
  // Si todavía no hay ninguno cargado da $0 y el cuadro arranca de cero: no es un error de fórmula,
  // es un dato que la empresa no cargó, y el propio rótulo lo dice para que nadie lea el saldo
  // proyectado como si fuera plata que hay.
  // El aviso es una FÓRMULA y no un texto fijo: tiene que aparecer y desaparecer solo según haya o
  // no un saldo cargado, sin esperar a que el agente vuelva a correr. Un cuadro que arranca de $0
  // sin decirlo hace leer el saldo proyectado como plata que hay.
  const rotuloInicio = 'Efectivo y equivalentes al inicio del período'
  // EL SALDO REAL ANCLA EN EL MES DE SU FECHA, NO EN ENERO.
  //
  // La primera versión ponía el saldo declarado como inicio de ENERO. El saldo cargado es de JULIO,
  // así que arrastraba la plata de hoy siete meses hacia atrás y todos los meses cerrados quedaban
  // mal. Ahora: antes del mes del saldo el cuadro no muestra saldo —no se puede, falta el saldo
  // inicial de enero y nadie lo cargó— y desde ese mes en adelante encadena.
  //
  // APROXIMACIÓN DECLARADA: el saldo es de un día en el medio del mes, y acá se toma como cierre de
  // ese mes. Los movimientos de los días que faltan de ese mes quedan afuera del arrastre. Es de
  // orden menor frente a la alternativa, que era mentir en siete meses.
  const mesAncla = refCajaFecha ? `EOMONTH(${refCajaFecha};0)` : null
  meta.inicio = push([refCaja
    ? `=IF(N(${refCaja})=0;"${rotuloInicio}  ⚠ sin saldo cargado en CAJA — el cuadro no puede decir cuándo se queda sin plata";"${rotuloInicio}")`
    : `${rotuloInicio}  ⚠ no encontré la pestaña CAJA`,
    ...cols.map((_, i) => {
      if (!refCaja || !mesAncla) return i === 0 ? '=0' : `=${letra(i)}${filas.length + 2}`
      const mes = `${letra(i + 1)}$${FILA_CAB}`
      const anterior = i === 0 ? '""' : `${letra(i)}${filas.length + 2}`
      // Antes del mes del saldo: vacío. En el mes del saldo: el saldo declarado. Después: encadena.
      return `=IF(EOMONTH(${mes};0)<${mesAncla};"";IF(EOMONTH(${mes};0)=${mesAncla};N(${refCaja});IF(N(${anterior})=0;"";${anterior})))`
    })])
  // Un mes anterior al saldo declarado NO tiene cierre: mostrar la variación acumulada como si fuera
  // un saldo es exactamente el error que este bloque vino a corregir.
  meta.cierre = push(['Efectivo y equivalentes al cierre del período',
    ...cols.map((_, i) => `=IF(${letra(i + 1)}${meta.inicio}="";"";${letra(i + 1)}${meta.inicio}+${letra(i + 1)}${meta.variacion})`)])
  meta.egr0 = meta.detalle[0].fila
  meta.egr1 = meta.detalle[meta.detalle.length - 1].fila

  push([])
  const filaRef = push(['DÓNDE ESTÁ EL DETALLE DE CADA LÍNEA'])
  for (const { linea: l } of meta.detalle) {
    push([l.nombre, l.detalle
      ? `Pestaña ${l.detalle}`
      : `Compras, rubro "${l.rubro}"${l.excluirSub ? ` (sin "${l.excluirSub}", que va a inversión)` : ''} · detalle en la pestaña ${detallePorRubro(l.rubro)}`])
  }

  push([])
  push(['CONTROL — que no falte ni sobre nada'])
  const filaCtrl = filas.length + 1
  for (const c of bloqueControl(meta.egr0, meta.egr1, 'B', filaCtrl)) push([c.etiqueta, c.formula, c.nota])

  // El total del año para las filas donde tiene sentido: detalle, subtotales y el cierre.
  const conTotal = [...meta.detalle.map((d) => d.fila), ...meta.subtotales, meta.variacion,
    ...meta.grupos.map((g) => g.fila0 - 1)]
  for (const f of conTotal) filas[f - 1][n + 1] = `=SUM(${letra(1)}${f}:${letra(n)}${f})`
  // El efectivo al cierre del año NO se suma: es un saldo, y sumar doce saldos no significa nada.
  // Lo que va en la columna del total es el saldo del último período.
  filas[meta.cierre - 1][n + 1] = `=${letra(n)}${meta.cierre}`
  filas[meta.inicio - 1][n + 1] = `=${letra(1)}${meta.inicio}`

  // En el mensual, el total del año mezcla real y proyección: hay que poder separarlos de un vistazo,
  // o un estimado se lee como un hecho.
  if (periodo === 'mensual') {
    filas[meta.cabFila - 1][n + 2] = 'Real (Compras)'
    filas[meta.cabFila - 1][n + 3] = 'Proyectado'
    filas[meta.cabFila - 1][n + 4] = 'De dónde sale la proyección'
    for (const { fila: f, linea: l } of meta.detalle) {
      filas[f - 1][n + 2] = l.rubro && !l.cobranzas
        ? `=${l.excluirSub
          ? `${formulaTotalRubro(l.rubro)}-SUMIF(${'Compras!$AF$4:$AF'};"${l.excluirSub}";${'Compras!$O$4:$O'})`
          : formulaTotalRubro(l.rubro)}`
        : `=${letra(n + 1)}${f}`
      filas[f - 1][n + 3] = `=${letra(n + 1)}${f}-${letra(n + 2)}${f}`
      filas[f - 1][n + 4] = origenLinea(l)
    }
  }

  return { filas, meta, n, colTotal, filaCtrl, filaRef }
}

// clearValues borra el contenido pero NO el formato: la grilla nueva cae sobre celdas que tenían el
// formato de la grilla vieja y quedan números crudos al lado de importes. Se reformatea entero.
async function formatear(google, data) {
  const meta = await google.getSheetMeta(ID)
  const gruposPrevios = await google.getRowGroups(ID)
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.93, green: 0.94, blue: 0.95 }
  const req = []
  for (const d of data) {
    const p = d.range.split('!')[0]
    const h = meta.find((s) => s.title === p)
    if (!h) continue
    const { sheetId } = h
    const g = d.g
    const filasHoja = h.rows ?? 200
    const colsHoja = h.cols ?? 60
    const filas = d.values.length
    const cols = d.values[0].length
    const rango = (r0, r1, c0 = 0, c1 = cols) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
    const fmt = (r, fields, format) => req.push({ repeatCell: { range: r, cell: { userEnteredFormat: format }, fields } })

    // El layout viejo tenía celdas combinadas. Congelar una columna que parte una combinación es un
    // error duro de la API, y una combinación suelta descoloca toda la fila que se escriba encima.
    req.push({ unmergeCells: { range: rango(0, filas) } })

    // BORRAR EL FORMATO VIEJO DE LA PESTAÑA ENTERA, ANTES DE PINTAR EL NUEVO.
    //
    // clearValues() borra los VALORES pero no los FORMATOS. Cada vez que el cuadro cambia de forma
    // —y hoy cambió entero, de 13 renglones planos a 3 actividades con 66 filas— los fondos, los
    // negritas y los formatos de moneda del layout anterior se quedan pegados a su número de fila y
    // caen sobre contenido que ahora es otro. El dueño lo vio antes que yo: "quedan descuadradas y
    // con datos viejos". No eran datos viejos: era pintura vieja sobre datos nuevos.
    //
    // Se limpia la grilla COMPLETA (no sólo lo que se escribe) porque el layout anterior era más
    // ancho —tenía columnas auxiliares BE/BF— y esas columnas también quedaron pintadas.
    req.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: Math.min(filasHoja, 220), startColumnIndex: 0, endColumnIndex: colsHoja },
        cell: {},
        fields: 'userEnteredFormat',
      },
    })

    // Base: todo el cuadro en pesos, sin decimales, con el guion para el cero (así el ojo va a lo que sí pasó).
    fmt(rango(3, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
    // Título y subtítulo.
    fmt(rango(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
    fmt(rango(1, 2), 'userEnteredFormat.textFormat', { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
    // Fila de períodos: fecha corta y fondo oscuro.
    fmt(rango(2, 3), 'userEnteredFormat', {
      backgroundColor: AZUL,
      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 },
      numberFormat: { type: 'DATE', pattern: 'dd/mm' },
      horizontalAlignment: 'CENTER',
    })
    fmt({ ...rango(2, 3), startColumnIndex: cols - 1, endColumnIndex: cols }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    // LA COLUMNA "DE DÓNDE SALE" ES UNA EXPLICACIÓN, NO UN IMPORTE. Tenía el formato moneda de todo
    // el cuadro: diecinueve frases dibujadas como si fueran plata, en la columna que existe
    // justamente para que el número de al lado se entienda.
    fmt({ ...rango(3, filas), startColumnIndex: cols - 1, endColumnIndex: cols }, 'userEnteredFormat',
      { numberFormat: { type: 'TEXT' }, textFormat: { fontFamily: 'Arial', fontSize: 9, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL' })
    // La jerarquía visual tiene que coincidir con la jerarquía contable, o el +/- no se entiende:
    // ACTIVIDAD en oscuro, categoría en gris y negrita, detalle liviano y sangrado.
    for (const r of g.meta.actividades) {
      fmt(rango(r - 1, r), 'userEnteredFormat',
        { backgroundColor: AZUL, textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } } })
    }
    for (const gr of g.meta.grupos) {
      fmt(rango(gr.fila0 - 2, gr.fila0 - 1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
        { textFormat: { bold: true, fontSize: 9 }, backgroundColor: GRIS })
      fmt(rango(gr.fila0 - 1, gr.fila1), 'userEnteredFormat.textFormat',
        { textFormat: { bold: false, fontSize: 9, foregroundColor: { red: 0.3, green: 0.32, blue: 0.36 } } })
    }
    for (const r of [...g.meta.subtotales, g.meta.variacion]) {
      fmt(rango(r - 1, r), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
        { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
    }
    // El efectivo al cierre es LA línea del cuadro: la que contesta qué día te quedás sin plata.
    fmt(rango(g.meta.cierre - 1, g.meta.cierre), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, fontSize: 10 }, backgroundColor: { red: 0.85, green: 0.92, blue: 0.85 } })
    // El bloque de referencias y el de control son texto, no plata.
    fmt(rango(g.filaRef - 1, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
    fmt({ ...rango(g.filaCtrl - 1, g.filaCtrl + 4), startColumnIndex: 1, endColumnIndex: 2 },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0' }, horizontalAlignment: 'RIGHT' })
    fmt(rango(g.filaCtrl - 2, g.filaCtrl - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
    // Columna A ancha (los rubros tienen nombre largo), períodos angostos.
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } })
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: cols }, properties: { pixelSize: 96 }, fields: 'pixelSize' } })
    // Congelar el encabezado y la columna de rubros: sin esto, en la semana 40 no se sabe qué se está mirando.
    req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 3, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })

    // ── LOS +/- ────────────────────────────────────────────────────────────────────────────────
    // Primero se BORRAN los grupos que había. La API no reemplaza un grupo: lo apila. Sin esto, el
    // agente que rehace el cuadro cada 2 horas dejaría una escalera de +/- creciendo sola.
    for (const viejo of (gruposPrevios.find((x) => x.title === p)?.grupos ?? [])) {
      req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: viejo.startIndex, endIndex: viejo.endIndex } } })
    }
    for (const gr of g.meta.grupos) {
      const range = { sheetId, dimension: 'ROWS', startIndex: gr.fila0 - 1, endIndex: gr.fila1 }
      req.push({ addDimensionGroup: { range } })
      // Arranca CERRADO. El cuadro se abre para decidir con los subtotales; el detalle se despliega
      // sólo cuando algo no cierra. Un estado de flujo con 17 renglones abiertos no se lee.
      req.push({ updateDimensionGroup: { dimensionGroup: { range, depth: 1, collapsed: true }, fields: 'collapsed' } })
    }
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

/**
 * Los cheques y la tarjeta cuya factura NO está en Compras, con su fecha real de pago.
 * Se leen acá y no en el otro script porque la línea tiene que estar DENTRO del bloque de egresos
 * para entrar al total, y ese bloque lo arma esta grilla.
 */
async function faltantesDeCompras(google) {
  const hojas = await google.getSheetMeta(ID)
  const chequesTab = hallarPestana(hojas, 'Cheques Emitidos').title
  const compras = await google.readSheetValues(ID, 'Compras!A4:O')
  const enCompras = new Set(
    compras.filter((f) => parseMonto(f?.[14]) > 0).map((f) => normComprobante(f?.[7])).filter(esLlaveUtil),
  )
  // Columna I de Cheques y I de Tarjeta = la fecha de pago real (dd/mm/yyyy), no la de emisión: lo
  // que importa para la caja es cuándo se debita, no cuándo se firmó el cheque.
  const cheques = (await google.readSheetValues(ID, `${chequesTab}!A2:L400`))
    .filter((f) => parseMonto(f?.[5]) > 0)
    .map((f) => ({ proveedor: f[4], monto: parseMonto(f[5]), comprobante: f[7], fecha: parseFecha(f[8]) }))
  const tarjeta = (await google.readSheetValues(ID, 'Tarjeta de Credito!A3:K400'))
    .filter((f) => parseMonto(f?.[4]) > 0)
    .map((f) => ({ proveedor: f[2], monto: parseMonto(f[4]), comprobante: f[6], fecha: parseFecha(f[7]) }))
  const out = [...faltaFacturaConFecha(cheques, enCompras), ...faltaFacturaConFecha(tarjeta, enCompras)]
  const total = out.reduce((s, i) => s + i.monto, 0)
  console.log(`Cheques y tarjeta SIN factura en Compras: ${out.length} pagos · $${Math.round(total).toLocaleString('es-AR')}`)
  return out
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // Ya no alimenta el cuadro (esa línea es una fórmula), pero se sigue midiendo acá: es el número
  // que tiene que dar igual que la fórmula, y si no da, algo se desalineó entre el código y el Sheet.
  const faltantes = await faltantesDeCompras(google)
  // Dónde está el total de disponibilidades, buscado POR RÓTULO. Si la pestaña todavía no se armó,
  // refCaja queda en null y el cuadro lo dice en vez de referenciar una celda inventada.
  let refCaja = null
  let refCajaFecha = null
  try {
    const tab = hallarPestana(await google.getSheetMeta(ID), 'Caja').title
    // POR RÓTULO, no por letra de columna: la pestaña CAJA lleva dos monedas y el total se movió de
    // la B a la E. Una referencia fija se rompe en silencio (ver ubicarCaja).
    const u = ubicarCaja(await google.readSheetValues(ID, `${tab}!A1:I80`))
    if (u) {
      refCaja = `'${tab}'!$${u.colPesos}$${u.filaTotal}`
      // La fecha del saldo más reciente: es la que decide en qué mes ancla el cuadro.
      refCajaFecha = `MAX('${tab}'!$${u.colFecha}$${u.filaCab + 1}:$${u.colFecha}$${u.filaUltimaCuenta})`
    }
    // ═══ SI HAY RANGO CON NOMBRE, MANDA EL NOMBRE ═══
    //
    // La referencia por celda de arriba se recalcula leyendo CAJA, pero este paso corre ANTES que
    // caja-pestana en el agente: siempre va una corrida atrasado. El día que se insertó un bloque
    // arriba en CAJA, "Efectivo al inicio" y "al cierre" —las dos filas más importantes del cuadro—
    // quedaron VACÍAS hasta la corrida siguiente, sin error y sin aviso.
    //
    // Un nombre sigue a la celda aunque se mueva, así que con él el orden de los pasos deja de
    // importar. La referencia por rótulo se conserva como respaldo para la primera corrida, cuando
    // el nombre todavía no existe.
    const nombres = await google.getNamedRanges(ID).catch(() => [])
    const tieneNombre = (n) => nombres.some((x) => x.name === n)
    if (tieneNombre(N_CAJA.total)) refCaja = N_CAJA.total
    if (tieneNombre(N_CAJA.fecha)) refCajaFecha = N_CAJA.fecha
  } catch { /* la pestaña puede no existir todavía */ }
  console.log(`Efectivo al inicio: ${refCaja ?? '⚠ sin pestaña de saldos'} · ancla en ${refCajaFecha ?? '(sin fecha)'}`)

  // Dónde está la fila de total de cada pestaña de detalle, buscada POR RÓTULO. Si no aparece, el
  // script rompe: una referencia a una fila muerta devuelve $0 y nadie se entera.
  const filasTabla = {}
  for (const { pestaña, rotulo } of tablasDeProyeccion()) {
    const colA = await google.readSheetValues(ID, `${pestaña}!A1:A80`)
    const i = colA.findIndex((f) => String(f?.[0] ?? '').trim() === rotulo)
    if (i < 0) throw new Error(`no encontré la fila "${rotulo}" en la pestaña ${pestaña} — la proyección quedaría apuntando a la nada`)
    filasTabla[pestaña] = i + 1
    console.log(`  proyección de ${pestaña}: fila ${i + 1}`)
  }
  const data = []
  for (const [pestaña, periodo] of [['Cash Flow Semanal', 'semanal'], ['Cash Flow Mensual', 'mensual']]) {
    const g = grilla(periodo, faltantes, refCaja, refCajaFecha, filasTabla)
    // Los marcadores se resuelven acá, cuando el cuadro ya está armado y se sabe en qué fila quedó
    // cada línea. Escribir los números a mano rompería el día que el cuadro crezca una línea.
    const ingreso = g.meta.detalle.filter((d) => d.signo > 0).map((d) => d.fila)
    const egreso = g.meta.detalle.filter((d) => d.signo < 0 && !d.linea.impuestoCheque).map((d) => d.fila)
    g.filas = g.filas.map((f) => f.map((c) => {
      if (typeof c !== 'string') return c
      return c
        .replace(/#\{INICIO\}/g, String(g.meta.inicio))
        // La celda ES el marcador, así que la fórmula entra entera CON su '=': sacárselo la dejaba
        // como texto y el cuadro mostraba la fórmula escrita en vez de su resultado.
        .replace(/^#\{IMP:([A-Z]+)\}$/, (_, col) => formulaImpuesto(col, ingreso, egreso))
    }))
    const ancho = Math.max(...g.filas.map((f) => f.length))
    // Normalizar el rectángulo: si una fila es más corta, la API deja lo viejo debajo.
    const cuadro = g.filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r })
    console.log(`${pestaña}: ${cuadro.length} filas x ${ancho} columnas · egresos ${g.meta.egr0}-${g.meta.egr1} · control fila ${g.filaCtrl}`)
    data.push({ range: `${pestaña}!A1:${letra(ancho - 1)}${cuadro.length}`, values: cuadro, g, pestaña })
  }
  if (DRY) {
    console.log('\n--dry. Muestra de las primeras líneas del semanal:')
    for (const f of data[0].values.slice(0, 12)) console.log('  ', f.slice(0, 3).map((x) => String(x).slice(0, 60)).join(' | '))
    return
  }

  // ── EL CANDADO DEL DUEÑO, POR PESTAÑA (24/07) ──
  // Este generador escribe DOS pestañas y no pasa por el portón `escribirPreservando`, así que el
  // candado se aplica acá: si el dueño tomó 'Cash Flow Semanal' o 'Cash Flow Mensual', esa pestaña se
  // saca de `data` y no se toca ni una celda. La otra, si está libre, se rehace normal.
  try {
    const { pestanasBloqueadas, filtrarBloqueadas } = await import('../lib/pestana-bloqueada.mjs')
    const set = await pestanasBloqueadas({}, ID)
    const { bloqueadas } = filtrarBloqueadas(data.map((d) => d.pestaña), set)
    for (const p of bloqueadas) console.log(`  🔒 "${p}" está bajo tu control (candado): no la toco.`)
    for (let i = data.length - 1; i >= 0; i--) if (set.has(data[i].pestaña)) data.splice(i, 1)
    if (!data.length) { console.log('Ambas pestañas están bajo tu control: no hay nada que rehacer.'); return }
  } catch { /* sin base: se sigue, la Regla 0 celda a celda sigue activa abajo */ }

  // Limpiar primero lo viejo: la grilla nueva es más corta que la que había y quedarían restos
  // (incluidas las columnas auxiliares BE/BF, que ahora viven en Compras).
  // El HYPERLINK necesita el gid REAL de la pestaña: se resuelve acá, no se adivina.
  const metaGid = await google.getSheetMeta(ID)
  for (const d of data) {
    const gid = metaGid.find((s) => s.title === d.pestaña)?.sheetId
    d.values = d.values.map((f) => f.map((c) => (typeof c === 'string' ? c.replace('SEMGID', String(gid)) : c)))
  }
  // NO se limpia: se escribe sólo sobre los rangos propios. Borrar A1:BZ200 se llevaba puesto todo lo
  // que el dueño hubiera anotado en esas pestañas (regla de oro: nunca borrar lo que escribe una persona).
  //
  // ═══ REGLA 0 — Y ADEMÁS, SI REESCRIBIÓ UN TEXTO MÍO, GANA EL SUYO (23/07) ═══
  //
  // El dueño: "no estás respetando q yo hago ediciones en las pestañas y me las ignoras". No alcanza
  // con no borrar: si él rebautiza un rótulo que este generador SÍ escribe, la corrida siguiente se
  // lo pisa y su cambio dura menos de dos horas, que es cada cuánto corre el worker.
  //
  // Se aplica rango por rango porque este generador NO escribe una grilla única —escribe una lista de
  // {range, values} sueltos—. Cada bloque se compara contra lo que hay hoy EN SU PROPIO RANGO; el
  // registro se lleva por pestaña, y como la Regla 0 ancla al TEXTO y no a la posición, un bloque que
  // se mueve de fila no rompe nada.
  // LA REGLA 0 MIRA LA PESTAÑA ENTERA, NO EL BLOQUE QUE SE ESCRIBE (23/07). Este generador escribe
  // por rangos sueltos; comparar contra `d.range` dejaba fuera todo el resto de la pestaña, así que
  // cada rótulo de OTRO bloque se leía como borrado. De ahí salieron 35 borrados falsos en "Cash
  // Flow Semanal" — y un falso borrado se confirma solo, porque el generador deja de escribirlo.
  const vistas = new Map()
  const verPestana = async (p) => {
    if (!vistas.has(p)) vistas.set(p, await google.readSheetValues(ID, `${p}!A1:BZ`).catch(() => []))
    return vistas.get(p)
  }

  // ── AUTO-RESPETO: ¿reescribiste una de estas pestañas ENTERA? (24/07) ──
  // Este generador escribe por rangos sueltos y no pasa por escribirPreservando, así que la detección
  // va acá también: junto todos los rótulos que quiero escribir en cada pestaña y, si la gran mayoría
  // ya no está en la pestaña (la reescribiste con otra estructura), la tomo como tuya: la auto-cando y
  // saco sus rangos de `data` para no tocar ni una celda. Mismo criterio conservador que el portón.
  try {
    const { duenoReescribioLaPestana } = await import('../lib/respetar-ediciones.mjs')
    const porPestana = new Map()
    for (const d of data) { if (!porPestana.has(d.pestaña)) porPestana.set(d.pestaña, []); porPestana.get(d.pestaña).push(...d.values) }
    for (const [pest, generado] of porPestana) {
      const rew = duenoReescribioLaPestana(generado, await verPestana(pest))
      if (rew.reescrita) {
        const { bloquear } = await import('../lib/pestana-bloqueada.mjs')
        await bloquear({}, ID, pest, { motivo: `auto: detecté que la reescribiste (${rew.motivo})`, por: 'auto' })
        console.log(`  🔒 detecté que reescribiste "${pest}" (${rew.motivo}): la tomo como tuya, no la toco.`)
        for (let i = data.length - 1; i >= 0; i--) if (data[i].pestaña === pest) data.splice(i, 1)
      }
    }
    if (!data.length) { console.log('Reescribiste ambas pestañas: no hay nada que rehacer.'); return }
  } catch { /* sin base no se puede consultar; sigue la Regla 0 celda a celda */ }

  for (const d of data) {
    // El TEXTO QUE SE VE, no la fórmula: ver lib/preservar-anotaciones.mjs.
    const actual = await verPestana(d.pestaña)
    const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, d.pestaña, d.values, actual)
    for (const r of respetadas) console.log(`  ✋ ${d.pestaña}: respeto tu texto ("${String(r.suyo).slice(0, 40)}") en vez de "${String(r.mio).slice(0, 40)}"`)
    d.values = grid
    d._ediciones = ediciones
    d._candidatos = candidatos
    d._actual = actual
  }
  await google.batchUpdateValues(ID, data.map(({ range, values }) => ({ range, values })))
  for (const d of data) {
    await guardarRegistro(ID, d.pestaña, d.values, d._ediciones ?? new Map(), d._actual, d._candidatos ?? new Set())
      .catch((e) => console.warn(`  ⚠ ${d.pestaña}: no pude guardar el registro de rótulos: ${e.message}`))
  }
  await formatear(google, data)
  console.log('\nEscrito. Verificando contra el Sheet…')

  for (const p of ['Cash Flow Semanal', 'Cash Flow Mensual']) {
    const v = await google.readSheetValues(ID, `${p}!A1:BZ120`)
    const err = []
    v.forEach((f, i) => (f || []).forEach((c, j) => {
      if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`)
    }))
    const ctrl = v.findIndex((f) => String(f?.[0] ?? '').startsWith('⇒ Diferencia'))
    console.log(`\n${p}: ${err.length ? '⚠ ' + err.length + ' celdas en error: ' + err.slice(0, 6).join(' ') : '✓ sin errores'}`)
    if (ctrl >= 0) {
      console.log(`  Compras total:        ${v[ctrl - 2]?.[1]}`)
      console.log(`  Suma de las líneas:   ${v[ctrl - 1]?.[1]}`)
      console.log(`  ⇒ Diferencia:         ${v[ctrl]?.[1]}`)
      console.log(`  Sin fecha de pago:    ${v[ctrl + 1]?.[1]}`)
    }
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
