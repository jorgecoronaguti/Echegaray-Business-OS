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

import { pathToFileURL } from 'node:url'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  bloqueControl, CUADRO, verificarCuadro, formulaLineaMes, expresionReal, formulaTotalRubro, origenLinea,
  tablasDeProyeccion, formulaChequesSinFactura, hipervinculoDetalle, detalleDeRubro, SANGRIA_DETALLE,
  formulaInteresSemana, formulaComisionesMes, formulaComisionesSemana, edicionesConContenidoReal,
  instrumentosDeLinea, formulaCalendarioImpuestosMes, formulaCalendarioImpuestosSemana,
  rotulosCalendarioImpuestos, CALENDARIO_IMPUESTOS, expresionProyeccionMes,
} from '../lib/cash-flow-lineas.mjs'
import {
  semanasDelAnio, semanasCerradas, formulaLineaSemana,
  naturalezaLinea, GLOSA_NATURALEZA,
} from '../lib/cash-flow-horizonte.mjs'
import { bloqueDecision, bloqueContraste, bloqueNaturaleza } from '../lib/cash-flow-tesoreria.mjs'
import { bloqueLiquidez, formulaColchon } from '../lib/cash-flow-liquidez.mjs'
import { requestsDeGraficos, COL_ANCLA } from '../lib/cash-flow-graficos.mjs'
import { pielCashFlow } from '../lib/cash-flow-piel.mjs'
import { conEdicionesRespetadas, guardarRegistro, respetarEdiciones } from '../lib/respetar-ediciones.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { ref as refPestana } from '../lib/partir-pestana.mjs'
import { CAJA as N_CAJA } from '../lib/rangos-nombrados.mjs'
import { expresionInicio } from '../lib/cash-flow-ancla-saldo.mjs'
import { ubicarCaja } from '../lib/caja-disponibilidades.mjs'
import { formulaInteresMes } from '../lib/costo-descubierto.mjs'
import { formulaImpuesto } from '../lib/impuesto-cheque.mjs'
import {
  normComprobante, esLlaveUtil, faltaFacturaConFecha, montoEnVentana, MARCAS,
} from '../lib/cheques-cobertura.mjs'
import { parseMonto, parseFecha } from '../lib/cash-briefing.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
// Base de la URL para hipervínculos internos: el fragmento suelto "#gid=…" da "El rango no es válido"
// en Google y no navega; la URL completa sí. El placeholder URLID{} de las etiquetas se resuelve acá.
const URL_BASE = `https://docs.google.com/spreadsheets/d/${ID}/edit`
const DRY = process.argv.includes('--dry')
// --force / ORQ_CF_FORCE: aplicar un cambio de ESTRUCTURA intencional. Saltea SÓLO el gate grueso
// (candado + auto-respeto de reescritura, que confunde un cambio estructural grande con una reescritura
// del dueño). La fusión celda a celda que preserva las ediciones reales del dueño (conEdicionesRespetadas)
// SIGUE SIEMPRE activa — ver el bloque de escritura más abajo. --force NUNCA es destructivo.
const FORCE = process.argv.includes('--force') ||
  ['1', 'true', 'yes', 'si', 'sí'].includes(String(process.env.ORQ_CF_FORCE || '').trim().toLowerCase())
const AÑO = 2026

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// ── Las 53 semanas del año, arrancando el lunes ───────────────────────────────────────────────────
//
// SE EXPORTA (30/07) porque la grilla de períodos tiene que tener UNA SOLA definición. La fila 3 de las
// dos pestañas de cash flow ES el contrato: cada columna suma [encabezado, encabezado+7) en la semanal
// y [encabezado, fin de mes] en la mensual. Si el encabezado no es el lunes / el primero del mes, la
// ventana se corre y la columna suma otra cosa — sin dar ningún error.
//
// Y eso es exactamente lo que estaba pasando: la Mensual tenía el DÍA 26 de cada mes en la fila 3, así
// que cada columna sumaba sólo del 26 a fin de mes (5 o 6 días) y la proyección de egresos perdía
// $293M del año. La Semanal tenía 29/12/2026 en su primera semana, un año adelantado. Los dos valores
// estaban en la PESTAÑA, no en el código: este generador siempre escribió bien, pero las pestañas están
// candadas y nunca los recibieron. scripts/cash-flow-encabezados.mjs las corrige contra esta función.
export function semanas() {
  const d = new Date(Date.UTC(AÑO, 0, 1))
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1) // retroceder al lunes
  const out = []
  for (let i = 0; i < 53; i++) { out.push(new Date(d)); d.setUTCDate(d.getUTCDate() + 7) }
  return out
}
/** Los 12 PRIMEROS-DE-MES del año. Es lo que la fila 3 de la Mensual tiene que decir. */
export function meses() {
  return Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(AÑO, m, 1)))
}

/** El año del cuadro, para que el corrector no lo repita por su cuenta. */
export const ANIO = AÑO

const fechaAR = (d) => `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`

/**
 * Arma la grilla de una pestaña de cash flow.
 * @param {'semanal'|'mensual'} periodo
 */
export function grilla(periodo, faltantes = [], refCaja = null, refCajaFecha = null, filasTabla = {}, filasCalendario = {}, hoy = new Date()) {
  // ═══ EL SEMANAL DEJÓ DE MIRAR EL AÑO (04/08) ═══
  // Trece semanas rodantes desde la semana en curso, no las 53 del calendario. El porqué —y la
  // identidad que garantiza que el semanal y el mensual no puedan discrepar sobre un mes completo—
  // está escrito entero en lib/cash-flow-horizonte.mjs, que es donde se puede probar.
  const cols = periodo === 'semanal' ? semanasDelAnio(hoy) : meses()
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

  // EL TÍTULO DICE QUÉ PREGUNTA CONTESTA CADA UNO, porque ahora contestan preguntas distintas: el
  // semanal, en qué semana no alcanza la plata; el mensual, cómo cierra el año.
  push([periodo === 'semanal'
    ? `Cash Flow Semanal ${new Date().getFullYear()} — semana a semana, de enero a diciembre`
    : `Cash Flow Mensual ${AÑO} — cuándo entra y sale la plata`])
  // A2 = el atajo a la semana de hoy.
  //
  // EL RANGO TIENE QUE SER UNA CELDA, NO UNA COLUMNA. La versión anterior armaba ADDRESS(1;col;4) y
  // le sacaba el "1" con SUBSTITUTE para quedarse con la letra: producía "AE", y Google contesta
  // "no se puede abrir el vínculo porque se borró el rango vinculado" — porque "AE" a secas no es un
  // rango A1 válido. Medido en el Sheet real: la fórmula vieja devolvía AE y la nueva AE3.
  // Apuntar a la fila del encabezado además deja la semana a la vista con su fecha arriba. En una grilla de 53 semanas, sin esto hay que buscar a mano
  // dónde estamos cada vez que se abre la pestaña. El dueño lo pidió de vuelta después de que se lo
  // borré al rehacer el cuadro. HYPERLINK a la celda de la columna cuya semana contiene HOY.
  // EL ÍCONO DEL ATAJO SE DIBUJA. Acá había un 📅 y el exportador a PDF no lo embebe: en el papel el
  // atajo abría con un espacio en blanco. `→` está en la lista verificada de glifos que SÍ salen
  // dibujados (ver lib/glifos.mjs) y dice lo mismo: "andá para allá".
  const irASemana = periodo === 'semanal'
    ? `=HYPERLINK("${URL_BASE}#gid=SEMGID&range="&ADDRESS(${FILA_CAB};MATCH(1;ARRAYFORMULA((${letra(1)}$${FILA_CAB}:${letra(n)}$${FILA_CAB}<=TODAY())*(${letra(1)}$${FILA_CAB}:${letra(n)}$${FILA_CAB}+7>TODAY()));0)+1;4);"→ IR A LA SEMANA DE HOY — "&TEXT(TODAY();"dd/mm/yyyy"))`
    : `=HYPERLINK("${URL_BASE}#gid=SEMGID&range="&ADDRESS(${FILA_CAB};MONTH(TODAY())+1;4);"→ IR AL MES DE HOY — "&TEXT(TODAY();"mmmm yyyy"))`
  // ═══ EL SUBTÍTULO ES UNA LÍNEA, NO UN PÁRRAFO (04/08) ═══
  //
  // Acá vivían 380 caracteres de prosa. Como la fila 2 no tiene más columnas que la A y la B, el texto
  // se derramaba por encima de las primeras DOCE columnas de período: el cuadro abría con un muro de
  // itálica tapando el primer trimestre. Lo mismo pasaba con la nota de cada actividad (ver más abajo).
  // El estándar del dueño lo prohíbe explícitamente —"prohibida la columna de prosa por fila"— y el
  // motivo es medible: él las borra a mano y volvían en cada corrida.
  //
  // Lo que se fue no se perdió: el criterio de proyección y el alcance de cada pestaña están escritos
  // donde se pueden auditar (este archivo y cash-flow-lineas.mjs), y el cuadro ahora los MUESTRA en vez
  // de explicarlos — lo proyectado va en itálica (cash-flow-piel.mjs), que es la convención.
  const nota = periodo === 'semanal'
    ? 'Método directo (RT 8/9 · NIC 7) · forecast rodante: corre una semana por semana'
    : 'Método directo (RT 8/9 · NIC 7) · las columnas en itálica todavía no pasaron: son proyección'
  push([irASemana, nota])
  // EL RÓTULO DEL TOTAL CUENTA LAS COLUMNAS QUE HAY, NO UNA CONSTANTE. Decía "Total 51 semanas"
  // sobre una suma de 53: `SEMANAS_HORIZONTE` es el largo del rodante viejo y el cuadro pasó a ser el
  // año calendario, que tiene las semanas que tenga. Un encabezado que no cuenta lo que suma es la
  // misma clase de defecto que el "26" de la fila 3: nadie lo cuestiona y esconde dos semanas.
  meta.cabFila = push(['Período', ...cols.map(fechaAR),
    // "Total 53 semanas 2026" son 21 caracteres en una columna de 96px: entran 18, y el auditor de
    // pantalla lo marcaba cortado. El año ya está en el título de la pestaña y la cantidad de semanas
    // se cuenta mirando el cuadro; lo que la columna tiene que decir es que es el total.
    `Total ${AÑO}`])

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
    // LA NOTA DE LA ACTIVIDAD NO VA EN LA GRILLA. Iba en la columna B de esta misma fila, y como la
    // fila no tiene nada más a la derecha, Sheets la derramaba sobre las primeras doce columnas de
    // período: tres párrafos atravesando el cuadro justo donde están los meses ya cerrados. La razón
    // de cada clasificación (por qué el prendario es financiación y la grúa es inversión) está escrita
    // en CUADRO, en cash-flow-lineas.mjs, que es donde se audita — no encima de los números.
    push([act.actividad])
    const filaAct = filas.length
    const subGrupos = []
    for (const g of act.grupos) {
      const filaGrupo = filas.length + 1
      // signo 0 = grupo MEMO (informativo, ej. Cobranzas esperadas): ni "+" ni "(–)", no entra al flujo.
      // El prefijo NO se agrega si el rótulo ya lo trae: los dos grupos memo de CUADRO empiezan con "ℹ",
      // así que la versión anterior escribía "ℹ ℹ La misma nómina…" — dos glifos pegados que en pantalla
      // se leen como una barra doble y no como una marca de "esto no suma".
      const marca = g.signo === 0 ? (g.nombre.startsWith('ℹ') ? '' : 'ℹ ') : g.signo > 0 ? '' : '(–) '
      push([`${marca}${g.nombre}`])
      const d0 = filas.length + 1
      for (const l of g.lineas) {
        // ═══ LA SEMANA TAMBIÉN PROYECTA (04/08) ═══
        // Antes acá iba `=${expresionReal(...)}` a secas: la semana mostraba SÓLO lo que ya tenía
        // fecha cargada en Compras. Con las cobranzas esperadas sumando desde el 04/08, el cuadro
        // proyectaba lo que entra y no lo que sale — el sesgo más caro que puede tener un forecast
        // de caja, porque el error empuja la peor semana hacia arriba justo donde hay que decidir.
        const f = periodo === 'mensual'
          ? cols.map((_, i) => formulaLineaMes(l, letra(i + 1), letra(i + 1), FILA_CAB, filasTabla, AÑO))
          : cols.map((_, i) => formulaLineaSemana(l, desde(i), hasta(i), filasTabla, AÑO))
        // La línea de cheques SUMA las marcas que el OS escribe al lado de cada cheque y de cada
        // consumo de tarjeta. Antes era el único lugar del cuadro con números pegados: el día que se
        // cargaba una factura que faltaba, la línea seguía mostrando el importe viejo.
        // Los intereses se calculan sobre el saldo con el que ARRANCA cada período (mes o semana), que
        // es la celda "Efectivo al inicio" de SU MISMA columna. No hay circularidad: ese inicio es el
        // cierre del período anterior, que ya está resuelto cuando le toca el turno a este.
        //
        // ME EQUIVOQUÉ UNA VUELTA ANTES y conviene dejarlo escrito: la primera versión referenciaba
        // el inicio de la columna ANTERIOR, o sea un período de más para atrás. Diciembre calculaba
        // sobre el saldo de noviembre al arrancar (−$56,7M) en vez del de diciembre (−$127,1M), y
        // daba $2.969.865 donde van $6,6M. El error no se ve en ningún control: la suma cierra igual.
        //
        // EL DUEÑO PIDIÓ QUE EL SEMANAL TAMBIÉN LOS CALCULE. Antes iban vacíos "porque a nivel semana
        // no hay saldo inicial calculado" — pero sí lo hay: el bloque de cierre encadena inicio→cierre
        // también en el semanal, así que "Efectivo al inicio" de cada semana existe (es el cierre de la
        // anterior). El interés semanal usa ese mismo saldo con la ventana de 7 días (formulaInteresSemana,
        // el MISMO modelo verificado que el mensual, sólo cambia la ventana). Es un PISO declarado: no
        // cobra la deuda que se toma dentro de la misma semana.
        // La de IVA/IIBB NO sale de Compras: la mensual lee la celda del mes del calendario; la semanal
        // reparte el total del mes a la semana que contiene su vencimiento (fin de mes). El monto es
        // exacto; sólo la timing intra-mes es aproximada (declarado en cash-flow-lineas.mjs).
        const celdas = l.cheques
          ? cols.map((_, i) => formulaChequesSinFactura(desde(i), hasta(i), MARCAS.falta, instrumentosDeLinea(l.inst)))
          : l.calendarioImpuestos
            // PERCIBIDO (+1): el IVA/IIBB de un período se PAGA al mes siguiente (vto AFIP ~día 20).
            // Por eso el mes del cash flow referencia la columna del mes ANTERIOR de la pestaña (abril
            // muestra el IVA del período marzo). Enero no tiene fuente en la tabla (sería el período de
            // diciembre del año anterior) → 0. El semanal corre el vencimiento adentro de su fórmula.
            ? cols.map((_, i) => (periodo === 'mensual'
              ? (i === 0 ? '0' : formulaCalendarioImpuestosMes(letra(i), filasCalendario))
              : formulaCalendarioImpuestosSemana(desde(i), hasta(i), AÑO, filasCalendario)))
          : l.descubierto
            ? cols.map((_, i) => (periodo === 'mensual'
              ? formulaInteresMes(`${letra(i + 1)}#{INICIO}`, `${letra(i + 1)}$${FILA_CAB}`)
              : formulaInteresSemana(`${letra(i + 1)}#{INICIO}`, desde(i), hasta(i))))
            // Las comisiones del banco se LEEN del extracto (no hay tasa que proyectar ni factura en
            // Compras): real de la ventana, y en los meses/semanas sin extracto el promedio de los que
            // sí lo tienen. El semanal las carga en la semana que contiene el cierre del mes, que es
            // cuando el banco las cobra (29/06, 29/07 y 30/07 en el extracto real).
            : l.comisionesBancarias
              ? cols.map((_, i) => (periodo === 'mensual'
                ? formulaComisionesMes(`${letra(i + 1)}$${FILA_CAB}`)
                : formulaComisionesSemana(desde(i), hasta(i))))
            : l.impuestoCheque
              // Se resuelve al final: necesita la lista de TODAS las demás líneas, que todavía no
              // existen. Referenciar el total de egresos sería circular — esta línea es un egreso. El
              // impuesto semanal es 0,6% de entradas + 0,6% de salidas de la semana: mismo #{IMP:col}
              // que el mensual (formulaImpuesto suma ingresos+egresos de la columna × 0,6%), resuelto
              // abajo para AMBAS pestañas cuando ya se sabe en qué fila quedó cada línea.
              ? cols.map((_, i) => `#{IMP:${letra(i + 1)}}`)
              : f
        push([`${SANGRIA_DETALLE}${l.nombre}`, ...celdas])
        meta.detalle.push({ fila: filas.length, linea: l, signo: g.signo })
      }
      const d1 = filas.length
      // El subtotal de la categoría suma su propio detalle. Con signo: los pagos se muestran en
      // positivo dentro de su categoría (es lo que se paga) y la categoría entra restando al flujo.
      filas[filaGrupo - 1] = [filas[filaGrupo - 1][0], ...sumaFilas(d0, d1)]
      // El signo y la fila del encabezado viajan con el grupo porque el bloque de decisión necesita
      // saber qué categorías son ingreso y cuáles egreso para armar la cobertura de obligaciones.
      // Deducirlo del rótulo (el prefijo "(–)") sería atarlo a un texto que se puede editar.
      meta.grupos.push({ fila0: d0, fila1: d1, signo: g.signo, filaGrupo })
      // Un grupo MEMO (signo 0) muestra su subtotal pero NO entra al flujo neto de la actividad.
      if (g.signo !== 0) subGrupos.push({ fila: filaGrupo, signo: g.signo })
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
  // EL SALDO REAL ANCLA EN EL PERÍODO QUE CONTIENE SU FECHA, NO EN ENERO Y NO EN "SU MES".
  //
  // La primera versión ponía el saldo declarado como inicio de ENERO. El saldo cargado es de JULIO,
  // así que arrastraba la plata de hoy siete meses hacia atrás y todos los meses cerrados quedaban
  // mal. Antes del período del saldo el cuadro no muestra saldo —no se puede, falta el saldo inicial
  // de enero y nadie lo cargó— y desde ahí en adelante encadena.
  //
  // LA SEGUNDA VERSIÓN ANCLABA POR MES (EOMONTH) EN LAS DOS PESTAÑAS, y eso rompió la semanal: las
  // cinco columnas de agosto caen en el mismo mes, así que las cinco daban "es el mes del saldo" y
  // las cinco arrancaban con $115.548.463 en vez de encadenar. El cierre del 31/08 mostraba
  // $147.965.511 contra los $232.113.539 de la cadena — $84.148.028 que se arrastraban a las
  // diecisiete semanas siguientes. Ahora el ancla se decide con la MISMA ventana [desde, hasta) con
  // la que la columna suma sus movimientos, así que sirve para cualquier granularidad.
  // La definición y su prueba: lib/cash-flow-ancla-saldo.mjs.
  //
  // APROXIMACIÓN DECLARADA: el saldo es de un día en el medio del período, y acá se toma como su
  // inicio. Los movimientos de ese período anteriores a la fecha del saldo quedan contados dos veces
  // (ya están en el saldo y vuelven a estar en el neto). En la semanal el error queda acotado a seis
  // días; en la mensual, a un mes. Es de orden menor frente a la alternativa, que era mentir en siete
  // meses, pero es real y por eso se dice.
  meta.inicio = push([refCaja
    ? `=IF(N(${refCaja})=0;"${rotuloInicio}  ${ALERTA} sin saldo cargado en CAJA — el cuadro no puede decir cuándo se queda sin plata";"${rotuloInicio}")`
    : `${rotuloInicio}  ${ALERTA} no encontré la pestaña CAJA`,
    ...cols.map((_, i) => {
      if (!refCaja || !refCajaFecha) return i === 0 ? '=0' : `=${letra(i)}${filas.length + 2}`
      return expresionInicio({
        desde: desde(i),
        hasta: hasta(i),
        refSaldo: refCaja,
        refFecha: refCajaFecha,
        anterior: i === 0 ? null : `${letra(i)}${filas.length + 2}`,
      })
    })])
  // Un mes anterior al saldo declarado NO tiene cierre: mostrar la variación acumulada como si fuera
  // un saldo es exactamente el error que este bloque vino a corregir.
  meta.cierre = push(['Efectivo y equivalentes al cierre del período',
    ...cols.map((_, i) => `=IF(${letra(i + 1)}${meta.inicio}="";"";${letra(i + 1)}${meta.inicio}+${letra(i + 1)}${meta.variacion})`)])
  meta.egr0 = meta.detalle[0].fila
  meta.egr1 = meta.detalle[meta.detalle.length - 1].fila

  // ── LO QUE ENTRA, LO QUE SALE Y LA LÍNEA DEL COLCHÓN ───────────────────────────────────────────
  //
  // El cuadro tenía subtotales por categoría y el neto por actividad, pero NINGUNA fila decía
  // "entró tanto" y "salió tanto" en el período. Es la primera pregunta que se le hace a un cash
  // flow y había que sumarla a mano recorriendo seis subtotales con su signo. Además son las dos
  // series del gráfico de entradas contra salidas: sin una fila que las contenga no hay nada que
  // graficar, y un gráfico que se arma su propia suma es una segunda verdad esperando su turno.
  //
  // VAN DEBAJO DEL CIERRE, no arriba. El orden de la norma —actividades, variación, inicio, cierre—
  // no se toca: esto es una LECTURA de lo de arriba y se lee después, igual que el resto de los
  // bloques de decisión. Y agregar filas acá no mueve el cuerpo, que es lo que los consumidores que
  // leen por posición (A3:N9) necesitan que no se mueva.
  const filasIngreso = meta.grupos.filter((g) => g.signo > 0).map((g) => g.filaGrupo)
  const filasEgreso = meta.grupos.filter((g) => g.signo < 0).map((g) => g.filaGrupo)
  const sumaDe = (fs, i) => fs.map((f) => `${letra(i + 1)}${f}`).join('+')
  meta.entradas = push(['(+) Total de entradas del período', ...cols.map((_, i) => `=${sumaDe(filasIngreso, i)}`)])
  meta.salidas = push(['(–) Total de salidas del período', ...cols.map((_, i) => `=${sumaDe(filasEgreso, i)}`)])
  // EL COLCHÓN SE CALCULA UNA VEZ, EN LA B, Y EL RESTO DE LA FILA LA REFERENCIA. Es una línea
  // horizontal: repetir la fórmula 53 veces sería 53 oportunidades de que una quede distinta, y la
  // fórmula es un SUMPRODUCT sobre todo el ancho — cara de recalcular por columna.
  meta.colchon = push(['Colchón mínimo de caja (referencia del gráfico)',
    formulaColchon(filasEgreso, letra(n)),
    ...cols.slice(1).map(() => `=$B$${filas.length + 1}`)])

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // LO QUE EL CUADRO DECIDE — va DEBAJO del efectivo al cierre, y es una decisión, no una omisión
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  //
  // El estándar del dueño pide el titular ARRIBA. Acá va abajo del cierre por una razón medible:
  // hay consumidores que leen estas pestañas por POSICIÓN de fila —auditar-cobranzas-en-cashflow
  // lee 'Cash Flow Mensual'!A3:N9 fijo— y correr el cuerpo diez filas los rompería en silencio,
  // devolviendo otro número en vez de un error. El cierre es de todos modos el ancla visual del
  // cuadro (única fila con doble regla): lo que sigue se lee como su explicación, que es lo que es.
  push([])
  const dec = bloqueDecision({
    periodo,
    fila0: filas.length + 1,
    colN: letra(n),
    filaCab: meta.cabFila,
    filaCierre: meta.cierre,
    filasEgreso: meta.grupos.filter((g) => g.signo < 0).map((g) => g.filaGrupo),
    filasIngreso: meta.grupos.filter((g) => g.signo > 0).map((g) => g.filaGrupo),
    refCaja,
  })
  for (const f of dec.filas) push(f)
  meta.decision = dec

  // EL PERFIL DE LIQUIDEZ: hasta dónde baja contra el colchón, hasta dónde sube, hacia dónde va y
  // en qué fecha exacta se cruza cada línea. El bloque de arriba nombra la peor columna; éste dice
  // si esa peor columna es un problema y cuándo empieza a serlo — que es lo que se acciona.
  push([])
  const liq = bloqueLiquidez({
    periodo,
    fila0: filas.length + 1,
    colN: letra(n),
    filaCab: meta.cabFila,
    filaCierre: meta.cierre,
    filaVariacion: meta.variacion,
    filaColchon: meta.colchon,
  })
  for (const f of liq.filas) push(f)
  meta.liquidez = liq

  // LA COMPOSICIÓN POR NATURALEZA, con su control de partición. Si las cuatro cajas no dan la
  // variación neta, alguna línea quedó sin clasificar — y eso se ve, no se promedia.
  const iniH = `$B$${FILA_CAB}`
  const finH = periodo === 'semanal' ? `${letra(n)}$${FILA_CAB}+7` : `EOMONTH(${letra(n)}$${FILA_CAB};0)+1`
  const proyecta = (l) => expresionProyeccionMes(l, iniH, filasTabla, AÑO) !== null
  const esModelo = (l) => naturalezaLinea(l) === 'MODELO'
  const esEsperado = (l) => naturalezaLinea(l) === 'ESPERADO'
  push([])
  const nat = bloqueNaturaleza({
    fila0: filas.length + 1,
    colTotal,
    filaVariacion: meta.variacion,
    partes: meta.detalle
      .filter((d) => d.signo !== 0 && !esModelo(d.linea) && !esEsperado(d.linea))
      .map((d) => ({ fila: d.fila, signo: d.signo, real: proyecta(d.linea) ? expresionReal(d.linea, iniH, finH) : null })),
    filasEsperado: meta.detalle.filter((d) => esEsperado(d.linea)).map((d) => d.fila),
    filasModelo: meta.detalle.filter((d) => esModelo(d.linea)).map((d) => d.fila),
  })
  for (const f of nat.filas) push(f)
  meta.naturaleza = nat

  // EL CONTRASTE, con su propio encabezado de fechas: es otra ventana de tiempo y se dice.
  push([])
  const con = bloqueContraste({
    fila0: filas.length + 1,
    periodo,
    fechaAR,
    periodos: periodo === 'semanal'
      ? semanasCerradas(hoy)
      // Los meses del año que ya cerraron. Si estamos en enero no hay ninguno y el bloque no se
      // escribe: un cuadro de contraste sin períodos que contrastar sólo confunde.
      : meses().filter((m) => m.getUTCMonth() < hoy.getUTCMonth()),
  })
  if (con.filas.length > 2) { for (const f of con.filas) push(f); meta.contraste = con }

  push([])
  const filaRef = push(['DÓNDE ESTÁ EL DETALLE DE CADA LÍNEA'])
  for (const { linea: l } of meta.detalle) {
    push([l.nombre, l.detalle
      ? `Pestaña ${l.detalle}`
      : `Compras, rubro "${l.rubro}"${l.excluirSub ? ` (sin "${l.excluirSub}", que va a inversión)` : ''} · detalle en la pestaña ${detalleDeRubro(l.rubro)}`])
  }

  push([])
  push(['CONTROL — que no falte ni sobre nada'])
  const filaCtrl = filas.length + 1
  for (const c of bloqueControl(meta.egr0, meta.egr1, 'B', filaCtrl)) push([c.etiqueta, c.formula, c.nota])
  const filaCtrlFin = filas.length // última fila del bloque de control (1-based), para formatear en moneda

  // El total del año para las filas donde tiene sentido: detalle, subtotales y el cierre.
  const conTotal = [...meta.detalle.map((d) => d.fila), ...meta.subtotales, meta.variacion,
    ...meta.grupos.map((g) => g.fila0 - 1)]
  for (const f of conTotal) filas[f - 1][n + 1] = `=SUM(${letra(1)}${f}:${letra(n)}${f})`
  // El efectivo al cierre del año NO se suma: es un saldo, y sumar doce saldos no significa nada.
  // Lo que va en la columna del total es el saldo del último período.
  filas[meta.cierre - 1][n + 1] = `=${letra(n)}${meta.cierre}`
  filas[meta.inicio - 1][n + 1] = `=${letra(1)}${meta.inicio}`

  // ═══ CADA MOVIMIENTO DECLARA SU NATURALEZA (04/08) ═══
  //
  // Regla absoluta de la skill de tesorería: todo movimiento se clasifica explícitamente como REAL ·
  // COMPROMETIDO · PROYECTADO · ESTIMADO · VENCIDO · PAGADO · COBRADO · CONCILIADO. Hasta hoy la
  // única marca era la itálica de la columna — y la itálica dice CUÁNDO, no QUÉ. Un cobro esperado
  // de un cliente y un cheque ya firmado caen los dos en una columna futura y salían los dos en
  // itálica: uno es una promesa y el otro una orden de pago. Ahora cada línea lo dice al lado.
  filas[meta.cabFila - 1][n + 2] = 'Naturaleza del dato'
  for (const { fila: f, linea: l } of meta.detalle) filas[f - 1][n + 2] = GLOSA_NATURALEZA[naturalezaLinea(l)]

  // En el mensual, el total del año mezcla real y proyección: hay que poder separarlos de un vistazo,
  // o un estimado se lee como un hecho.
  if (periodo === 'mensual') {
    filas[meta.cabFila - 1][n + 3] = 'Real (Compras)'
    filas[meta.cabFila - 1][n + 4] = 'Proyectado'
    filas[meta.cabFila - 1][n + 5] = 'De dónde sale la proyección'
    for (const { fila: f, linea: l } of meta.detalle) {
      filas[f - 1][n + 3] = l.rubro && !l.cobranzas
        ? `=${l.excluirSub
          ? `${formulaTotalRubro(l.rubro)}-SUMIF(${'Compras!$AF$4:$AF'};"${l.excluirSub}";${'Compras!$O$4:$O'})`
          : formulaTotalRubro(l.rubro)}`
        : `=${letra(n + 1)}${f}`
      filas[f - 1][n + 4] = `=${letra(n + 1)}${f}-${letra(n + 3)}${f}`
      filas[f - 1][n + 5] = origenLinea(l)
    }
  }

  // `fechas` y `periodo` viajan con la grilla porque la PIEL los necesita para decidir qué columnas
  // son proyección. Recalcularlas en el formateador sería una segunda definición de la grilla de
  // períodos, que es justo lo que ya se corrió una vez y escondió $292,8M.
  // LAS ANCLAS DE LOS GRÁFICOS SALEN DE LA MISMA GRILLA QUE LAS ESCRIBIÓ. Escribir "la curva lee la
  // fila 55" en el módulo de gráficos ataría el dibujo a una POSICIÓN, que es el defecto que este
  // cuadro ya pagó dos veces (el "26" de la fila 3 y el rango fosilizado de Estructura). Acá las
  // filas se conocen porque se acaban de crear: si el cuadro cambia de forma, los gráficos la siguen.
  // Las columnas van en base 1 e inclusivas: los períodos son B..(n+1).
  meta.graficos = {
    filaCab: meta.cabFila,
    filaCierre: meta.cierre,
    filaColchon: meta.colchon,
    filaEntradas: meta.entradas,
    filaSalidas: meta.salidas,
    colN: n + 1,
    // El contraste tiene su PROPIA ventana de tiempo (períodos ya cerrados) y por eso su propio
    // encabezado. Mezclarlo con la fila 3 sería la Regla de Oro 3 rota dentro de un gráfico.
    desvioCab: meta.contraste?.filaCab,
    desvioEsperado: meta.contraste ? meta.contraste.filaCab + 1 : undefined,
    desvioReal: meta.contraste ? meta.contraste.filaCab + 2 : undefined,
    desvioColN: meta.contraste?.ancho,
  }
  return { filas, meta, n, colTotal, filaCtrl, filaCtrlFin, filaRef, fechas: cols, periodo }
}

/**
 * NÚCLEO PURO: las filas donde el generador NO escribe nada a la derecha de la columna A.
 *
 * ═══ POR QUÉ (05/08) ═══
 *
 * Medido hoy en el Sheet vivo, en las DOS pestañas: la fila 69 —un separador en blanco— decía
 * "Planes de pago de deuda previsional | Compras, rubro …"; la 70, que es el título "COMPOSICIÓN DEL
 * FLUJO", tenía "Pestaña Compras" pegado en la B; la 77 ("LO ESPERADO CONTRA LO QUE OCURRIÓ") y la 84
 * ("DÓNDE ESTÁ EL DETALLE"), lo mismo. Restos de un layout anterior en el que esas filas pertenecían
 * al bloque de detalle, sentados justo en el medio de los bloques que se leen para decidir.
 *
 * Sobreviven por el mismo mecanismo que ya se documentó para las filas de actividad: la fusión que
 * respeta las ediciones del dueño no puede distinguir "texto que el dueño escribió" de "texto que
 * escribí yo en otra versión del cuadro y que ahora no va". Los lee como suyos y los devuelve corrida
 * tras corrida. La cura de entonces fue una lista a mano —`meta.actividades`— y por eso sólo curó las
 * tres filas de actividad.
 *
 * La regla generalizada es la que ya vale para el ancho de un bloque: EL GENERADOR ES DUEÑO DE TODO
 * EL ANCHO DE LAS FILAS QUE ESCRIBE. Si en la grilla que produjo esta corrida una fila no tiene nada
 * a la derecha de la A, ahí no va nada — ni un resto mío ni algo que se le parezca.
 *
 * SE MIRA LA GRILLA GENERADA, NO LA FUSIONADA. Después de la fusión el resto ya está adentro y la
 * fila parece tener contenido legítimo: preguntarle a la fusión es preguntarle al problema.
 *
 * LO QUE ESTO CUESTA, DECLARADO: si el dueño anota algo al lado de un título de bloque o en una fila
 * separadora, se le borra. Es el mismo precio que ya se aceptó para las filas de actividad, y a
 * cambio ningún resto de un layout viejo puede volver a sentarse en el medio del cuadro. Las filas
 * con dato —todo el cuerpo, el detalle, los controles— traen fórmula en la B y no las toca.
 *
 * @param {Array<Array<any>>} generado la grilla ANTES de fusionar
 * @returns {number[]} números de fila 1-based
 */
export function filasSoloRotulo(generado = []) {
  const out = []
  generado.forEach((fila, i) => {
    const derecha = (fila ?? []).slice(1)
    if (derecha.every((c) => c === '' || c == null)) out.push(i + 1)
  })
  return out
}

/**
 * Las directivas de formato de los bloques de tesorería, para la piel.
 *
 * Cada bloque se pinta en DOS pasadas y el orden importa: primero TODO el bloque como texto —así
 * ninguna celda hereda el formato de moneda que el cuerpo del cuadro dejó sobre esas filas— y recién
 * después la celda que sí lleva número. Al revés, una cobertura de 0,87 se dibuja "$1".
 */
export function extrasTesoreria(meta, ancho) {
  const out = []
  const pintar = (b, anchoNum) => {
    if (!b) return
    out.push({ tipo: 'titulo', f: b.titulo })
    for (let f = b.titulo; f < b.titulo + b.filas.length; f++) out.push({ tipo: 'texto', f, c0: 1, c1: ancho })
    for (const [tipo, filas] of Object.entries(b.formatos ?? {})) {
      if (tipo === 'texto') continue
      for (const f of filas) out.push({ tipo, f, c0: 1, c1: anchoNum })
    }
  }
  pintar(meta.decision, 2) // sólo la columna B es número; la C es un nombre y queda texto
  pintar(meta.liquidez, 2)
  pintar(meta.naturaleza, 2)
  pintar(meta.contraste, meta.contraste?.ancho ?? 2)
  return out
}

// clearValues borra el contenido pero NO el formato: la grilla nueva cae sobre celdas que tenían el
// formato de la grilla vieja y quedan números crudos al lado de importes. Se reformatea entero.
async function formatear(google, data) {
  const meta = await google.getSheetMeta(ID)
  const gruposPrevios = await google.getRowGroups(ID)
  const req = []
  for (const d of data) {
    const p = d.range.split('!')[0]
    const h = meta.find((s) => s.title === p)
    if (!h) continue
    const { sheetId } = h
    const g = d.g
    const filasHoja = h.rows ?? 200
    let colsHoja = h.cols ?? 60
    // ═══ EL ANCLA DE UN GRÁFICO ES UNA CELDA REAL ═══
    // Si la hoja no llega a la columna donde se anclan, `addChart` devuelve 400 y —como los requests
    // viajan en lote— se cae TODO el lote, formato incluido. La hoja se ensancha ACÁ, antes de pedir
    // nada, y los gráficos van igual en su propio lote más abajo por si algo más falla.
    const anchoNecesario = COL_ANCLA + 2
    if (colsHoja < anchoNecesario) {
      req.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: anchoNecesario - colsHoja } })
      console.log(`  ↔ ${p}: la hoja pasa de ${colsHoja} a ${anchoNecesario} columnas (el ancla de los gráficos es la ${COL_ANCLA + 1}ª)`)
      colsHoja = anchoNecesario
    }
    const filas = d.values.length
    const cols = d.values[0].length
    const rango = (r0, r1, c0 = 0, c1 = cols) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })

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

    // ═══ LA PIEL DE STATEMENT ═══
    //
    // Todo el formato del cuadro sale de UNA función pura y probada (lib/cash-flow-piel.mjs), que a su
    // vez reusa los patrones de número de formato-statement.mjs. Antes se escribía acá a mano y el
    // resultado era el que el dueño rechazó dos veces: barras azules rellenas por actividad, una barra
    // gris por categoría, un rectángulo verde bajo el efectivo al cierre, el "$" repetido en cada celda
    // del cuerpo y el negativo con guion rojo. Ninguna de esas cinco cosas existe en un estado
    // financiero publicado.
    req.push(...pielCashFlow({
      sheetId,
      meta: g.meta,
      n: g.n,
      ancho: cols,
      nFilas: filas,
      filaRef: g.filaRef,
      filaCtrl: g.filaCtrl,
      filaCtrlFin: g.filaCtrlFin,
      periodo: g.periodo,
      fechas: g.fechas,
      hoy: new Date(),
      filasHoja,
      colsHoja,
      extras: extrasTesoreria(g.meta, cols),
    }))

    // NUNCA DEJAR FILAS OCULTAS (decisión del dueño 28/07: "agrupadas pero no ocultas"). `collapsed:false`
    // en los grupos no limpia el `hiddenByUser` que dejó un colapso anterior, así que se fuerza acá:
    // todas las filas del cuadro quedan VISIBLES, y el +/- sólo sirve para plegar a mano si él quiere.
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: g.filas.length + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })

    // ── LOS +/- ────────────────────────────────────────────────────────────────────────────────
    // Primero se BORRAN los grupos que había. La API no reemplaza un grupo: lo apila. Sin esto, el
    // agente que rehace el cuadro cada 2 horas dejaría una escalera de +/- creciendo sola.
    for (const viejo of (gruposPrevios.find((x) => x.title === p)?.grupos ?? [])) {
      req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: viejo.startIndex, endIndex: viejo.endIndex } } })
    }
    for (const gr of g.meta.grupos) {
      const range = { sheetId, dimension: 'ROWS', startIndex: gr.fila0 - 1, endIndex: gr.fila1 }
      req.push({ addDimensionGroup: { range } })
      // Arranca ABIERTO (decisión del dueño 28/07: "no me ocultes filas, sólo agrupalas"). El +/-
      // queda para que él pliegue lo que quiera, pero el detalle se VE por defecto — nada oculto.
      req.push({ updateDimensionGroup: { dimensionGroup: { range, depth: 1, collapsed: false }, fields: 'collapsed' } })
    }
  }
  await google.spreadsheetBatchUpdate(ID, req)

  // ── LOS GRÁFICOS, EN SU PROPIO LOTE ────────────────────────────────────────────────────────────
  // Un gráfico resume la tabla: si no se puede dibujar, la tabla tiene que quedar igual de bien. En
  // el mismo lote que el formato, un `addChart` rechazado (un ancla fuera de grilla, un waterfall con
  // una propiedad que la API no acepta) se lleva puesto el formato de las dos pestañas.
  for (const d of data) {
    const h = meta.find((s) => s.title === d.range.split('!')[0])
    if (!h) continue
    try {
      const reqs = await requestsDeGraficos(google, ID, h.sheetId, d.g.meta.graficos, h.title)
      if (reqs.length) {
        await google.spreadsheetBatchUpdate(ID, reqs)
        console.log(`  📈 ${h.title}: ${reqs.filter((r) => r.addChart).length} gráfico(s) dibujados`)
      }
    } catch (e) {
      console.warn(`  ⚠ ${h.title}: no pude dibujar los gráficos (${e.message}). La tabla quedó bien igual.`)
    }
  }
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

/**
 * ═══ ESTE GENERADOR YA NO ESCRIBE (05/08/2026) ═══
 *
 * Las dos pestañas se rehicieron como bloques —una agenda diaria y doce bloques mensuales— y las
 * escribe `cash-flow-vistas.mjs`. Este archivo sigue existiendo porque `grilla()` y `meses()` son puras
 * y las importan varios tests y auditores; lo que se retira es su capacidad de ESCRIBIR.
 *
 * NO ALCANZABA CON SACARLO DE `PASOS`. Cualquiera puede correrlo a mano —el pipeline no es el único
 * camino— y dos escritores sobre la misma pestaña es un defecto ya pagado: el que escribe último sella
 * la firma y el otro se auto-canda en la corrida siguiente, así que la pestaña queda congelada sin que
 * nadie entienda por qué. Se aborta acá, con el motivo escrito, y `--legacy` existe sólo para poder
 * volver atrás a mano si el diseño nuevo hubiera que revertirlo.
 */
const LEGACY = process.argv.includes('--legacy')

async function main() {
  if (!LEGACY) {
    console.error('Este generador quedó RETIRADO: las dos vistas las escribe ahora orquestador/scripts/cash-flow-vistas.mjs')
    console.error('(bloques diarios y mensuales sobre el libro _MOVIMIENTOS). Si de verdad querés la matriz vieja: --legacy.')
    process.exit(2)
  }
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

  // Las filas "⇒ IVA a pagar" / "⇒ IIBB a pagar" del calendario fiscal, ubicadas POR RÓTULO (no
  // hardcodeadas: la pestaña se arma con filas dinámicas). Si un rótulo no aparece, se rompe en vez de
  // escribir una referencia muerta que devolvería $0 en silencio.
  const filasCalendario = {}
  {
    const colA = await google.readSheetValues(ID, `${CALENDARIO_IMPUESTOS.pestaña}!A1:A120`)
    for (const { clave, rotulo } of rotulosCalendarioImpuestos()) {
      const i = colA.findIndex((f) => String(f?.[0] ?? '').trim() === rotulo)
      if (i < 0) throw new Error(`no encontré la fila "${rotulo}" en "${CALENDARIO_IMPUESTOS.pestaña}" — la línea de IVA/IIBB apuntaría a la nada`)
      filasCalendario[clave] = i + 1
      console.log(`  calendario fiscal ${clave.toUpperCase()}: fila ${i + 1}`)
    }
  }

  const data = []
  for (const [pestaña, periodo] of [['Cash Flow Semanal', 'semanal'], ['Cash Flow Mensual', 'mensual']]) {
    const g = grilla(periodo, faltantes, refCaja, refCajaFecha, filasTabla, filasCalendario)
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
  //
  // --force SALTEA ESTE GATE GRUESO (candado), no la fusión. Un cambio de ESTRUCTURA intencional
  // necesita reescribir la pestaña aunque esté candada; lo que NO se saltea nunca es la fusión celda a
  // celda de más abajo, que preserva las ediciones reales del dueño. Ver el bloque de escritura.
  if (FORCE) {
    console.log('  ⚙ --force: salteo el candado y el auto-respeto de reescritura (cambio de estructura intencional). La fusión que preserva tus ediciones SIGUE activa.')
  } else {
    try {
      const { pestanasBloqueadas, filtrarBloqueadas } = await import('../lib/pestana-bloqueada.mjs')
      const set = await pestanasBloqueadas({}, ID)
      const { bloqueadas } = filtrarBloqueadas(data.map((d) => d.pestaña), set)
      for (const p of bloqueadas) console.log(`  🔒 "${p}" está bajo tu control (candado): no la toco.`)
      for (let i = data.length - 1; i >= 0; i--) if (set.has(data[i].pestaña)) data.splice(i, 1)
      if (!data.length) { console.log('Ambas pestañas están bajo tu control: no hay nada que rehacer.'); return }
    } catch { /* sin base: se sigue, la Regla 0 celda a celda sigue activa abajo */ }
  }

  // Limpiar primero lo viejo: la grilla nueva es más corta que la que había y quedarían restos
  // (incluidas las columnas auxiliares BE/BF, que ahora viven en Compras).
  // El HYPERLINK necesita el gid REAL de la pestaña: se resuelve acá, no se adivina.
  const metaGid = await google.getSheetMeta(ID)
  const gidPorPestana = new Map(metaGid.map((s) => [s.title, s.sheetId]))
  // TRAZABILIDAD: la etiqueta de cada subconcepto → hyperlink a la pestaña!rango de su origen. El gid
  // de la pestaña DESTINO se resuelve acá contra getSheetMeta (misma mecánica que SEMGID, extendida a
  // otras pestañas). Si la pestaña no existe, la línea queda etiqueta simple y se reporta — nunca un gid
  // inventado. El VALOR de la línea (columnas B..N) no se toca: el vínculo va sólo en la columna A.
  const sinDestino = []
  for (const d of data) {
    const gid = gidPorPestana.get(d.pestaña)
    // El atajo "IR A LA SEMANA / MES DE HOY" apunta a la propia pestaña (placeholder SEMGID) y usa la URL completa (URLID{}).
    d.values = d.values.map((f) => f.map((c) => (typeof c === 'string' ? c.replace('URLID{}', URL_BASE).replace('SEMGID', String(gid)) : c)))
    for (const det of d.g.meta.detalle) {
      const h = hipervinculoDetalle(det.linea, filasTabla, filasCalendario)
      if (!h) continue
      const gidDestino = gidPorPestana.get(h.destino)
      if (gidDestino == null) { sinDestino.push(`${d.pestaña}: "${det.linea.nombre}" → no encontré la pestaña "${h.destino}"`); continue }
      let formulaH = h.formula.replace('URLID{}', URL_BASE).replace(`GID{${h.destino}}`, String(gidDestino))
      // Topar la fila final del rango al tamaño REAL de la pestaña destino: Google da "El rango no es
      // válido" si el rango excede la grilla (Cobranzas: 358 filas, un M5:M400 se pasaba) y un rango
      // abierto (O4:O) tampoco navega. O4:O → O4:O<rows>; M5:M400 → M5:M358 si la pestaña tiene 358.
      const filasDest = metaGid.find((s) => s.title === h.destino)?.rows
      if (filasDest) formulaH = formulaH.replace(/(&range=[A-Z]+\d+:[A-Z]+)(\d*)/, (m, pre, r2) => `${pre}${r2 ? Math.min(Number(r2), filasDest) : filasDest}`)
      d.values[det.fila - 1][0] = formulaH
    }
  }
  if (sinDestino.length) {
    console.log('Subconceptos sin hyperlink (quedan etiqueta simple):')
    for (const s of sinDestino) console.log(`  ⚠ ${s}`)
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
  //
  // --force SALTEA ESTA DETECCIÓN. Es justamente la que confunde un cambio de estructura grande del
  // GENERADOR (muchos rótulos nuevos, pocos viejos) con una reescritura del dueño. Cuando el cambio de
  // estructura lo hago yo a propósito (--force), no quiero que el generador se auto-cande y no escriba.
  // La preservación de lo que el dueño realmente editó sigue garantizada por la fusión de más abajo.
  if (!FORCE) try {
    const { duenoReescribioLaPestana } = await import('../lib/respetar-ediciones.mjs')
    const { firmaGuardia } = await import('../lib/firma-tab.mjs')
    const porPestana = new Map()
    for (const d of data) { if (!porPestana.has(d.pestaña)) porPestana.set(d.pestaña, []); porPestana.get(d.pestaña).push(...d.values) }
    for (const [pest, generado] of porPestana) {
      // LA FIRMA primero (respeto más fuerte: cualquier edición tuya desde mi última escritura). Si no,
      // la detección de reescritura total (cubre la primera corrida, cuando todavía no hay firma).
      let saltar = (await firmaGuardia(google, ID, pest, refPestana(pest))).editada
      if (!saltar) {
        const rew = duenoReescribioLaPestana(generado, await verPestana(pest))
        if (rew.reescrita) {
          const { bloquear } = await import('../lib/pestana-bloqueada.mjs')
          await bloquear({}, ID, pest, { motivo: `auto: detecté que la reescribiste (${rew.motivo})`, por: 'auto' })
          console.log(`  🔒 detecté que reescribiste "${pest}" (${rew.motivo}): la tomo como tuya, no la toco.`)
          saltar = true
        }
      }
      if (saltar) for (let i = data.length - 1; i >= 0; i--) if (data[i].pestaña === pest) data.splice(i, 1)
    }
    if (!data.length) { console.log('Reescribiste/editaste ambas pestañas: no hay nada que rehacer.'); return }
  } catch { /* sin base no se puede consultar; sigue la Regla 0 celda a celda */ }

  // ── LA FUSIÓN QUE PRESERVA LO DEL DUEÑO — SIEMPRE ACTIVA, TAMBIÉN BAJO --force ──
  // Ni --force la apaga. Lo único que cambia bajo --force: se aplican SÓLO las ediciones del dueño con
  // CONTENIDO REAL (renombres), no los borrados (reemplazo vacío). Así un cambio de TAMAÑO de la grilla
  // no puede perder un header del generador vía un borrado —posiblemente falso o viejo— que apuntaría a
  // texto vacío. El registro completo (incluidos los borrados) se persiste igual, así que un borrado real
  // del dueño no se olvida: se re-aplica en la próxima corrida NORMAL. Ver edicionesConContenidoReal.
  for (const d of data) {
    // COPIA DE LA GRILLA GENERADA, ANTES DE FUSIONAR. `filasSoloRotulo` tiene que preguntarle a lo
    // que produjo ESTA corrida: después de la fusión el resto viejo ya está adentro y la fila parece
    // legítima. Se copia fila por fila porque la fusión trabaja sobre los mismos arrays.
    d._generado = d.values.map((f) => [...f])
    // El TEXTO QUE SE VE, no la fórmula: ver lib/preservar-anotaciones.mjs.
    const actual = await verPestana(d.pestaña)
    const res = await conEdicionesRespetadas(ID, d.pestaña, d.values, actual)
    const { ediciones, candidatos } = res
    let { grid, respetadas } = res
    if (FORCE) {
      // La fusión SIGUE, pero sin borrados: sólo renombres reales. respetarEdiciones ancla al TEXTO del
      // rótulo (no a la posición), así que un cambio de estructura no descoloca nada.
      const r = respetarEdiciones(d.values, actual, edicionesConContenidoReal(ediciones))
      grid = r.grid
      respetadas = r.respetadas
    }
    for (const r of respetadas) console.log(`  ✋ ${d.pestaña}: respeto tu texto ("${String(r.suyo).slice(0, 40)}") en vez de "${String(r.mio).slice(0, 40)}"`)
    d.values = grid
    // ═══ LA FILA DE UNA ACTIVIDAD NO TIENE NADA A LA DERECHA, Y ES DEFINITIVO (04/08) ═══
    //
    // El generador dejó de escribir la nota de cada actividad hace dos versiones —eran 200 caracteres
    // de prosa derramados sobre las primeras doce columnas de período— y el dueño las borró a mano.
    // Seguían ahí igual: medido hoy en el Sheet vivo, B36 dice "Compra y venta de bienes de uso…" y
    // B41 "Deuda financiera tomada y devuelta…", y el auditor de pantalla las cuenta como los dos
    // texto_en_numero de la pestaña (texto dentro de una celda con formato de moneda).
    //
    // Sobrevivían porque la fusión que respeta las ediciones las lee como texto del dueño: él nunca
    // las escribió, las escribí yo y él las borró. La fila de encabezado de una actividad es de este
    // generador de punta a punta y su contenido a la derecha de la A es, por diseño, nada. Se fuerza
    // acá y no antes de la fusión, porque es justamente la fusión la que las resucitaba.
    for (const f of filasSoloRotulo(d._generado)) {
      const fila = d.values[f - 1]
      if (fila) for (let c = 1; c < fila.length; c++) fila[c] = ''
    }
    d._ediciones = ediciones // se persiste el set COMPLETO: un borrado real del dueño no se olvida.
    d._candidatos = candidatos
    d._actual = actual
  }
  // --force es el override INTENCIONAL de estructura: acá la fusión celda-a-celda (respetarEdiciones
  // con edicionesConContenidoReal) YA corrió y preservó tus ediciones reales, así que el portón
  // (candado/firma) es una segunda capa redundante que hay que saltear para poder aplicar el cambio.
  // Sin --force NUNCA se saltea. Después se re-sella la firma (abajo), así el freeze sigue vigente.
  await google.batchUpdateValues(ID, data.map(({ range, values }) => ({ range, values })), { yaGuardado: FORCE })
  // Sellar la firma de lo que dejé (re-lectura), así la próxima corrida detecta cualquier edición tuya.
  const { sellarFirma } = await import('../lib/firma-tab.mjs')
  for (const pest of new Set(data.map((d) => d.pestaña))) await sellarFirma(google, ID, pest, refPestana(pest))
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

// Sólo se ejecuta cuando se corre directo (node cash-flow-rehacer.mjs). Importarlo —para testear
// grilla(), que es pura y no toca Google— NO dispara main(): así el test no intenta escribir el Sheet.
const ejecutadoDirecto = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (ejecutadoDirecto) main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
