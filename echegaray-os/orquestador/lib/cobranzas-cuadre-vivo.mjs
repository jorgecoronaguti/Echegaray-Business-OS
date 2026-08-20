// EL CUADRE COBRANZAS ↔ CASH FLOW MENSUAL, CONTRA EL ARCHIVO VIVO.
//
// POR QUÉ EXISTE (14/08/2026). El cuadre existía como auditor suelto (`auditar-cobranzas-en-cashflow`)
// y el dueño lo corría a mano. Un control que depende de que alguien se acuerde no es un control: el
// desvío de julio y agosto vivió en la planilla hasta que alguien lo corrió. Ahora la misma lectura y
// el mismo veredicto los usa TAMBIÉN la publicación (`cash-flow-vistas.mjs`), que aborta si no cierra
// — igual que el cuadre Semanal↔Mensual, que ya lo hacía.
//
// UNA SOLA LECTURA, DOS CONSUMIDORES. Los rangos, el tipo de cambio y el formato del informe se
// definen acá una vez. Dos copias de "de dónde se lee Cobranzas" se desincronizan, y la que se olvide
// de leer hasta BB deja de ver la marca de endosado sin dar un error.

import { auditar } from './cobranzas-en-cashflow.mjs'
import { LADOS, frasePorCulpable } from './cobranzas-lado.mjs'
import { PESTANA_MENSUAL } from './cash-flow-meses.mjs'
import { leerTipoCambio, RANGO_TC } from './tipo-cambio.mjs'
import { ref as refPestana } from './partir-pestana.mjs'

/** Los datos de Cobranzas arrancan en la fila 5 y hay que llegar hasta BB: ahí está "Valor banco". */
export const RANGO_COBRANZAS = 'Cobranzas!A5:BC400'
/** La réplica del extracto, ABIERTA HACIA ABAJO: el corte del cruce sale del último movimiento que
 *  haya, no de una altura tipeada que se queda corta la primera vez que el banco manda más filas. */
export const RANGO_BANCO = '_BANCO_RAW!A1:F'
/** El cuadro se lee DESDE LA FILA 1: `ubicarCuadro` busca sus anclas de texto adentro, no cuenta filas. */
export const rangoMensual = (pestana = PESTANA_MENSUAL) => `${refPestana(pestana)}!A1:N40`

/**
 * Leer las tres fuentes y auditar. No escribe nada: no pide `scopes`.
 *
 * EL TIPO DE CAMBIO SE LEE DEL MISMO RANGO CON NOMBRE QUE USA EL EXTRACTOR DEL LIBRO. Es lo que hace
 * que los dos lados hablen la misma moneda; sin él, un cobro en dólares entra al control por su valor
 * nominal y descuadra el mes por la diferencia entera (medido: $22.957.196 en julio).
 *
 * @param {object} google cliente de Google
 * @param {string} id el Sheet del Flujo de Caja
 * @param {{pestana?: string}} opciones
 */
export async function auditarCuadreCobranzas(google, id, { pestana = PESTANA_MENSUAL } = {}) {
  const [cob, cf, banco, tc] = await Promise.all([
    google.readSheetGrid(id, RANGO_COBRANZAS),
    google.readSheetGrid(id, rangoMensual(pestana)),
    // EL EXTRACTO ES LA CUARTA FUENTE, y se lee con `readSheetValues`: el cruce sólo necesita fecha e
    // importe, y una grilla de 400 filas con formato es leer diez veces más para tirarlo.
    //
    // `UNFORMATTED_VALUE` NO ES OPCIONAL. Sin él, la fecha llega como "14/08/2026" y el importe como
    // "$15.000.000": el cruce ve cero acreditaciones, declara que el extracto no llega a ninguna fecha
    // y NO emite un solo aviso. Medido contra el archivo vivo el 15/08 — 406 filas, 0 acreditaciones.
    google.readSheetValues(id, RANGO_BANCO, { render: 'UNFORMATTED_VALUE' }).catch(() => null),
    leerTipoCambio(google, id),
  ])
  return {
    ...auditar(cob.filas, cf.filas, { tipoCambio: tc.tc, filasBanco: banco }),
    tipoCambio: tc.tc,
    pestana,
    // Que el extracto no se haya podido leer NO es lo mismo que un cruce limpio: sin esto, un
    // `_BANCO_RAW` renombrado apagaría el aviso de devengado sin que nadie se entere.
    sinExtracto: !banco,
  }
}

const ars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
/** Un serial de Sheets, legible. Devuelve "?" cuando no hay fecha: un guión se lee como una fecha. */
const fechaISO = (s) => (Number.isFinite(Number(s)) && Number(s) > 0
  ? new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10) : '?')

/**
 * NÚCLEO PURO: el informe, como líneas de texto.
 *
 * SE DEVUELVEN LÍNEAS, NO SE IMPRIMEN. El auditor suelto las manda a stdout enteras; la publicación
 * sólo quiere las de los meses que no cierran, porque volcar doce renglones iguales al log del
 * pipeline esconde el desvío real entre el ruido (misma razón que en `cuadrarLasVistas`).
 *
 * @param {object} r lo que devolvió `auditarCuadreCobranzas`
 * @param {{soloFallas: boolean}} opciones
 */
export function informe(r, { soloFallas = false } = {}) {
  if (r.noPudoUbicar) {
    return [`✖ NO PUDE UBICAR EL CUADRO: ${r.noPudoUbicar}`,
      '  No audito contra una ventana que no encontré: un "todo fuera del cuadro" sería inventado.']
  }
  const out = []
  if (!soloFallas) {
    out.push(`${r.cobros.length} cobros cargados por ${ars(r.totalCobranzas)}`)
    out.push(`el cash flow muestra ${ars(r.totalCashFlow)} en sus ${r.meses.length} columnas`)
    out.push(`(líneas de ingreso: ${r.ingreso.map((i) => `${i.de} → fila ${i.fila + 1}`).join(' · ')}`
      + ` · ${RANGO_TC} = ${r.tipoCambio ?? '⚠ no lo pude leer'})`)
    out.push('')
  }
  // Los cuatro huecos que NO descuadran un mes porque se los sacó de la cuenta. Van siempre: son
  // justamente la plata que el cuadre no puede ver, y callarlos convertiría el ✓ en una mentira.
  for (const [titulo, filas] of [
    ['⚠ NO SE PUDIERON VALUAR — un dólar contado como peso descuadra el mes entero', r.sinValuar],
    ['⚠ NO LLEGAN AL CUADRO — fuera de la ventana de meses', r.fueraDeVentana],
    ['⚠ SIN FECHA DE COBRO — el cuadro no sabe en qué mes entran', r.sinFecha],
    ['· SIN UNIDAD DE NEGOCIO — cuentan en el mes, pero no se pueden clasificar', r.sinUnidad],
  ]) {
    if (!filas.length) continue
    out.push(`${titulo}: ${filas.length} por ${ars(filas.reduce((s, f) => s + f.monto, 0))}`)
    for (const f of filas.slice(0, 12)) out.push(`   fila ${String(f.fila).padStart(3)}  ${ars(f.monto).padStart(15)}  ${f.cliente.slice(0, 30)}  ${f.motivo ?? ''}`)
    if (filas.length > 12) out.push(`   … y ${filas.length - 12} más`)
    out.push('')
  }

  // ── EL AVISO QUE NO ES UN DESCUADRE: DEVENGADO DISFRAZADO DE PERCIBIDO ──────────────────────────
  // Va SIEMPRE, incluso en `soloFallas`, y no baja el veredicto (ver `auditar`). Es plata que el
  // cuadro declara adentro de la cuenta y el extracto no respalda: no descuadra nada porque los dos
  // lados la cuentan igual — por eso ningún cuadre la iba a encontrar nunca.
  if (r.sinExtracto) {
    out.push(`⚠ NO PUDE LEER ${RANGO_BANCO}: no hay cruce bancario en esta corrida. Los "Cobrado" van sin verificar.`, '')
  } else if (r.respaldo?.ilegible) {
    out.push(`⚠ EXTRACTO ILEGIBLE: ${r.respaldo.ilegible}`, '')
  } else if (r.cobradoSinRespaldo?.length) {
    const total = r.cobradoSinRespaldo.reduce((s, v) => s + v.cobro.monto, 0)
    out.push(`▲ COBRADO SIN RESPALDO DEL BANCO — ${r.cobradoSinRespaldo.length} por ${ars(total)}`)
    out.push('   El Cash Flow los cuenta como INGRESO REAL. El Flujo va por percibido: o falta cargar el'
      + ' movimiento del banco, o el cobro todavía no entró.')
    for (const v of r.cobradoSinRespaldo.slice(0, 12)) {
      out.push(`   fila ${String(v.cobro.fila).padStart(3)}  ${ars(v.cobro.monto).padStart(15)}  ${v.cobro.cliente.slice(0, 30)}`)
    }
    if (r.respaldo?.fueraDeCorte.length) {
      // LA VENTANA DEL EXTRACTO, AL LADO DEL NÚMERO. Sin ella, "17 cobros sin juzgar" no se puede
      // interpretar: no se sabe si falta importar enero o si el banco todavía no publicó agosto.
      out.push(`   (además ${r.respaldo.fueraDeCorte.length} por ${ars(r.respaldo.montos.fueraDeCorte)} no se pueden juzgar:`
        + ` quedan fuera de la ventana importada del banco, ${fechaISO(r.respaldo.desde)} → ${fechaISO(r.respaldo.corte)})`)
    }
    out.push('')
  }

  const filas = soloFallas ? r.porMes.filter((m) => !m.ok) : r.porMes
  if (filas.length && !soloFallas) out.push('MES A MES — Cobranzas (bruto − endosado − devoluciones) contra el cuadro, REAL y PROYECTADO por separado:')
  for (const m of filas) {
    // Los conciliadores se nombran EN LA LÍNEA DEL MES. Un "−$20.000.000" sin decir que son los dos
    // echeq endosados de ese mes obliga a ir a buscarlo, y lo que obliga a buscar no se mira.
    const resta = [m.endosado ? `endosado ${ars(m.endosado)}` : null, m.devolucion ? `devoluciones ${ars(m.devolucion)}` : null]
      .filter(Boolean).join(' · ')
    // Y el mes con dólares dice a qué cotización los valuó el cuadro. Sin esto, "julio no cierra por
    // $12.228" manda a buscar un cobro perdido cuando lo único que pasó es que el dólar se movió
    // entre que se generó el libro y ahora — y la conclusión sería subir la tolerancia.
    const dolares = m.usd
      ? `   [U$S ${m.usd.toLocaleString('es-AR')} a TC implícito ${(m.tcImplicito ?? 0).toFixed(3)}`
        + ` · archivo ${(r.tipoCambio ?? 0).toFixed(3)}`
        + ` · deriva ${r.tipoCambio ? (((m.tcImplicito - r.tipoCambio) / r.tipoCambio) * 100).toFixed(3) : '?'}%]`
      : ''
    out.push(`   ${m.mes}  Cobranzas ${ars(m.cobranzas).padStart(15)}  cuadro ${ars(m.cashflow).padStart(15)}`
      + `  ${m.ok ? '✓' : `⚠ ${ars(m.dif)}`}${resta ? `   [bruto ${ars(m.bruto)} − ${resta}]` : ''}${dolares}`)
    // EL REPARTO, DEBAJO DEL MES. Sólo cuando alguno de los dos lados falla: en un mes sano son dos
    // renglones más que repiten lo de arriba, y el ruido es lo que hace que el desvío no se vea.
    for (const lado of LADOS) {
      const l = m.lados?.[lado]
      if (!l || l.ok) continue
      out.push(`      ${lado.padEnd(11)} Cobranzas ${ars(l.cobranzas).padStart(15)}  cuadro ${ars(l.cashflow).padStart(15)}  ⚠ ${ars(l.dif)}`)
    }
    // Y QUIÉN LO EXPLICA. El diagnóstico del 14/08 tardó media hora en llegar a la fila 44; el control
    // tiene que escupirla solo o el trabajo de buscarla vuelve a ser de una persona.
    for (const c of m.culpables ?? []) out.push(frasePorCulpable(c, ars))
  }
  return out
}
