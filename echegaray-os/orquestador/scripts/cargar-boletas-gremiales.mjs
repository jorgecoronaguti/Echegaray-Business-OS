#!/usr/bin/env node
// CARGAR LAS BOLETAS GREMIALES PAGADAS (IERIC / FODECO) EN "Compras" — SOBRE LA FILA QUE YA EXISTE.
//
// ═══ POR QUÉ ESTE SCRIPT Y NO UNA FILA NUEVA (30/07) ═══
//
// Las obligaciones de la Ley 22.250 YA ESTÁN en el archivo, proyectadas: "Compras" tiene dos filas por
// mes —IERIC y FODECO— con Proveedor SINDICATOS, Unidad de Negocio Impuestos y el mes del período en
// "Detalles / Obra". La pestaña "Cargas Sociales" las lee de ahí (busca "IERIC"/"FODECO" en Cliente /
// Asignación, por fecha de caja), así que ese es el lugar y no hay otro.
//
// AGREGAR FILAS NUEVAS SERÍA CONTAR LA OBLIGACIÓN DOS VECES: la proyección del período seguiría abajo,
// y el cash flow sumaría el pago real más el proyectado del mismo mes. Lo correcto es CONFIRMAR la
// proyección con el dato real: importe, número de boleta, forma y fecha de pago, y estado Pagado.
//
// Y la proyección estaba MUY corta: $7.300 proyectados contra $15.092,62 reales, por entidad. La
// diferencia no es un error de carga, es que el proyectado quedó con un default viejo mientras la base
// imponible subía (los pagos reales fueron 8.674 en feb, 11.999 en mar, 11.378 en abr, 14.097 en may).
//
// ═══ LO QUE SE ESCRIBE Y LO QUE NO ═══
//
// Se escribe la MISMA gramática que ya usan las filas de mayo (437/438), que son el precedente más
// completo: G "Boleta", H el número de boleta, O el total, P la forma de pago, Q la fecha real de pago
// —de ella sale la fecha de caja— , T = O (monto pagado) y X "Pagado".
//
// NO SE TOCAN las columnas calculadas AC/AD/AE/AF/AJ (rubro de caja, fecha de caja, órdenes de pago):
// AD es una ARRAYFORMULA anclada en AD4 y escribir en su derrame la mata — ya rompió CAJA dos veces el
// 30/07. Ver memoria formula-por-api-va-en-locale.
//
// Los datos de las boletas entran por --json (no van hardcodeados: un array de JavaScript con datos de
// negocio adentro es exactamente lo que hoy hizo que CAJA mostrara una cartera vieja).
//
//   node orquestador/scripts/cargar-boletas-gremiales.mjs --json /tmp/boletas.json
//   node orquestador/scripts/cargar-boletas-gremiales.mjs --json /tmp/boletas.json --aplicar

import { readFileSync, writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { bloquear, desbloquear } from '../lib/pestana-bloqueada.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Compras'
const APLICAR = process.argv.includes('--aplicar')
const iJ = process.argv.indexOf('--json')
const JSON_PATH = iJ >= 0 ? process.argv[iJ + 1] : null

/** El contrato de columnas de "Compras" que este script usa. Índices 0-based. */
export const COL = {
  id: 0, categoria: 1, fechaFactura: 2, proveedor: 4, modalidad: 5, tipo: 6, comprobante: 7,
  unidad: 8, asignacion: 9, detalles: 10, concepto: 11, importe: 12, iva: 13, total: 14,
  tipoPago: 15, fechaPrevista: 16, totalOParcial: 18, montoPagado: 19, estado: 23,
}
/** Las columnas que NUNCA se escriben: las calcula el archivo. AD es una ARRAYFORMULA anclada en AD4. */
export const PROHIBIDAS = ['AC', 'AD', 'AE', 'AF', 'AJ']
/** El vocabulario real de los desplegables (contado sobre las 792 filas cargadas). */
export const VOCABULARIO = {
  tipoPago: ['Efectivo', 'Transferencia', 'Cheque', 'Débito', 'Echeq', 'Tarjeta Crédito'],
  estado: ['Pagado', 'Proyectado', 'Pendiente'],
}

const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
/** NÚCLEO PURO: un número que la API devolvió FORMATEADO en es-AR → número. "$7.300,00" → 7300. */
export const aNumeroAR = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (!s) return NaN
  return Number(s.replace(/\./g, '').replace(',', '.'))
}
/**
 * NÚCLEO PURO: ¿estas dos fechas son la misma? Compara D/M/A, no cadenas.
 *
 * Sheets devuelve la fecha SIN cero a la izquierda ("30/7/2026") y este script la escribe con cero
 * ("30/07/2026"): comparar como texto daba FALSO NEGATIVO y la verificación gritaba "revisá el
 * respaldo" con la carga perfecta. Una verificación que grita cuando todo está bien deja de servir.
 */
export function mismaFecha(a, b) {
  const p = (v) => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v ?? '').trim())
    return m ? `${Number(m[1])}-${Number(m[2])}-${m[3]}` : null
  }
  const x = p(a); const y = p(b)
  return !!x && x === y
}

/** Una fecha ISO → el formato del archivo (es-AR, DD/MM/YYYY). Se escribe como texto USER_ENTERED. */
export const aFechaAR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * NÚCLEO PURO: ¿qué fila de "Compras" es la de esta boleta?
 *
 * Se busca por CONTENIDO —entidad en "Cliente / Asignación" + mes del período en "Detalles / Obra"—
 * y nunca por número de fila: el dueño agrega filas todo el tiempo y una fila fija escribiría encima
 * de otra cosa. Si hay más de una candidata, se devuelven todas y el script aborta: adivinar cuál es
 * la correcta sobre una planilla de plata no es una opción.
 *
 * @param {Array<Array<any>>} filas valores de la pestaña desde A1
 * @param {{entidad:string, mes:string}} boleta
 */
export function ubicarFila(filas = [], boleta = {}) {
  const norm = (s) => String(s ?? '').trim().toUpperCase()
  const candidatas = []
  filas.forEach((f, i) => {
    if (norm(f?.[COL.asignacion]) !== norm(boleta.entidad)) return
    if (norm(f?.[COL.detalles]) !== norm(boleta.mes)) return
    candidatas.push({
      fila: i + 1,
      estado: String(f?.[COL.estado] ?? '').trim(),
      total: f?.[COL.total],
      comprobante: String(f?.[COL.comprobante] ?? '').trim(),
    })
  })
  return candidatas
}

/**
 * NÚCLEO PURO: el plan de escritura de una boleta sobre su fila.
 *
 * IDEMPOTENTE: si la fila ya está Pagada con ESTE número de boleta, no devuelve nada. Un script que
 * escribe en la planilla real se corre más de una vez.
 *
 * @returns {{celdas:Array, avisos:string[], yaEstaba:boolean}}
 */
export function planBoleta(destino, boleta) {
  const avisos = []
  const f = destino.fila
  if (destino.estado === 'Pagado' && destino.comprobante === String(boleta.boleta)) {
    return { celdas: [], avisos: [`la boleta ${boleta.boleta} ya está cargada en la fila ${f}: no toco nada`], yaEstaba: true }
  }
  if (destino.estado === 'Pagado' && destino.comprobante && destino.comprobante !== String(boleta.boleta)) {
    avisos.push(`⚠ la fila ${f} ya está Pagada con OTRO comprobante (${destino.comprobante}): NO la sobrescribo`)
    return { celdas: [], avisos, yaEstaba: false }
  }
  if (!VOCABULARIO.tipoPago.includes(boleta.tipoPago)) {
    avisos.push(`⚠ "${boleta.tipoPago}" no está en el desplegable de Tipo pago (${VOCABULARIO.tipoPago.join(' · ')})`)
  }
  // Lo proyectado contra lo real: la diferencia es información de presupuestación, no un error.
  // OJO CON EL PARSEO: la API devuelve el total FORMATEADO en es-AR ("$7.300,00"), y Number() de eso es
  // NaN — el aviso se perdía en silencio y en el ensayo en seco no salió ninguna línea. El punto es
  // separador de miles y la coma es el decimal.
  const proyectado = aNumeroAR(destino.total)
  if (Number.isFinite(proyectado) && proyectado > 0) {
    const dif = boleta.importe - proyectado
    if (Math.abs(dif) > 1) avisos.push(`la proyección de la fila ${f} decía ${$(proyectado)} y el pago real fue ${$(boleta.importe)} (${dif > 0 ? '+' : ''}${$(dif)})`)
  }
  // El detalle del cálculo, para que el número se pueda auditar sin abrir el PDF.
  const detalle = `Boleta ${boleta.boleta} · período ${boleta.periodo} · ${boleta.trabajadores} trabajadores`
    + ` · base ${$(boleta.baseImponible)} · 1% ${$(boleta.contribucion)} + act. ${$(boleta.actualizacion)}`
    + (boleta.operacionMP ? ` · Mercado Pago op. ${boleta.operacionMP}` : '')
  return {
    yaEstaba: false,
    avisos,
    celdas: [
      { a1: `C${f}`, valor: aFechaAR(boleta.generada), que: 'fecha de la boleta' },
      { a1: `G${f}`, valor: 'Boleta', que: 'tipo de comprobante' },
      { a1: `H${f}`, valor: String(boleta.boleta), que: 'N° de boleta' },
      { a1: `L${f}`, valor: detalle, que: 'concepto — el cálculo y la trazabilidad del pago' },
      { a1: `O${f}`, valor: boleta.importe, que: 'total pagado' },
      { a1: `P${f}`, valor: boleta.tipoPago, que: 'forma de pago' },
      // LA FECHA DE PAGO REAL. De acá sale la Fecha de caja (la ARRAYFORMULA de AD la toma de Q), y de
      // la fecha de caja sale todo el cash flow. Es el dato que no se puede errar.
      { a1: `Q${f}`, valor: aFechaAR(boleta.pagada), que: 'fecha REAL de pago → de acá sale la fecha de caja' },
      { a1: `T${f}`, formula: `=O${f}`, que: 'monto pagado = el total (igual que las filas de mayo)' },
      { a1: `X${f}`, valor: 'Pagado', que: 'estado' },
    ],
  }
}

async function main() {
  if (!JSON_PATH) throw new Error('falta --json <archivo>: los datos de las boletas no van hardcodeados')
  const boletas = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
  console.log(`${boletas.length} boleta(s) a cargar · total ${$(boletas.reduce((s, b) => s + b.importe, 0))}`)
  for (const b of boletas) {
    const suma = Math.round((b.contribucion + b.actualizacion) * 100) / 100
    const uno = Math.round(b.baseImponible * 0.01 * 100) / 100
    const ok = suma === b.importe && uno === b.contribucion
    console.log(`   ${b.entidad.padEnd(7)} boleta ${b.boleta} · ${b.periodo} · ${$(b.importe)} · ${b.tipoPago} el ${b.pagada}`
      + `  ${ok ? '✓ el cálculo cierra (1% de la base + actualización)' : '⚠ EL CÁLCULO NO CIERRA'}`)
    if (!ok) throw new Error(`la boleta ${b.boleta} no cierra: ${uno} + ${b.actualizacion} ≠ ${b.importe}. No escribo nada.`)
  }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const filas = await google.readSheetValues(ID, `${PESTAÑA}!A1:AJ1200`)

  const plan = []
  for (const b of boletas) {
    const cand = ubicarFila(filas, b)
    if (!cand.length) throw new Error(`no encontré la fila de ${b.entidad} para ${b.mes} en ${PESTAÑA} (busco "${b.entidad}" en Cliente/Asignación y "${b.mes}" en Detalles/Obra). NO agrego filas: la revisión es tuya.`)
    if (cand.length > 1) throw new Error(`hay ${cand.length} filas de ${b.entidad}/${b.mes} (${cand.map((c) => c.fila).join(', ')}): no adivino cuál. NO escribo nada.`)
    const p = planBoleta(cand[0], b)
    console.log(`\n${b.entidad} → fila ${cand[0].fila} (estado actual: ${cand[0].estado || 'sin estado'})`)
    p.avisos.forEach((a) => console.log(`   ${a}`))
    p.celdas.forEach((c) => console.log(`   ${c.a1.padEnd(6)} ${c.que.padEnd(52)} ${String(c.formula ?? c.valor).slice(0, 76)}`))
    plan.push(...p.celdas)
  }
  const prohibidas = plan.filter((c) => PROHIBIDAS.includes(/^[A-Z]+/.exec(c.a1)[0]))
  if (prohibidas.length) throw new Error(`el plan toca columnas calculadas (${prohibidas.map((c) => c.a1).join(', ')}): abortado`)
  if (!APLICAR) {
    console.log(plan.length ? `\nEN SECO: ${plan.length} celda(s). Corré con --aplicar.` : '\nno hay nada que escribir.')
    return
  }
  if (!plan.length) {
    console.log('\nno hay nada que escribir — verifico lo que ya está cargado.')
    return verificar(google, boletas)
  }

  // ── RESPALDO Y SNAPSHOT ANTES DE TOCAR LA PLANILLA DE PLATA ──────────────────────────────────────
  const respaldo = `/tmp/Compras-antes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
  writeFileSync(respaldo, JSON.stringify(filas, null, 1))
  console.log(`\nrespaldo → ${respaldo}`)
  const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
  const snap = await tomarSnapshot({ google, fileId: ID, pestana: PESTAÑA, tool: 'cargar-boletas-gremiales', directive: 'el dueño mandó los comprobantes de pago de IERIC y FODECO (30/07)' })
  console.log(`snapshot → ${snap ?? 'no se pudo (queda el respaldo a disco)'}`)

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTAÑA)
  const deps = { query }
  await desbloquear(deps, ID, PESTAÑA)
  try {
    const reqs = plan.map((c) => {
      const m = /^([A-Z]+)(\d+)$/.exec(c.a1)
      const j = m[1].split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
      const i = Number(m[2]) - 1
      // Las fechas y los textos van como USER_ENTERED para que el archivo los parsee en SU locale
      // (DD/MM/YYYY, coma decimal). Los números van como número, sin pasar por texto.
      const valor = c.formula ? { formulaValue: c.formula }
        : typeof c.valor === 'number' ? { numberValue: c.valor }
          : { stringValue: String(c.valor) }
      return {
        updateCells: {
          range: { sheetId: hoja.sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: j, endColumnIndex: j + 1 },
          rows: [{ values: [{ userEnteredValue: valor }] }],
          fields: 'userEnteredValue',
        },
      }
    })
    // Las fechas como stringValue NO las parsea Sheets (quedan texto y la fecha de caja daría 0). Van
    // por values con USER_ENTERED, que sí las interpreta en el locale del archivo.
    const fechas = plan.filter((c) => /^(C|Q)\d+$/.test(c.a1))
    const otras = reqs.filter((_, k) => !/^(C|Q)\d+$/.test(plan[k].a1))
    const res = await google.spreadsheetBatchUpdate(ID, otras, { yaGuardado: true })
    if (res?.protegido) throw new Error('el portón descartó la escritura: no se escribió nada')
    if (fechas.length) {
      await google.batchUpdateValues(ID, fechas.map((c) => ({ range: `${PESTAÑA}!${c.a1}`, values: [[c.valor]] })), { yaGuardado: true })
    }
    console.log(`  ✔ ${plan.length} celda(s) escritas (${fechas.length} fecha(s) por USER_ENTERED)`)
  } finally {
    await bloquear(deps, ID, PESTAÑA, { motivo: 'el dueño edita — re-candada tras cargar las boletas gremiales de junio', por: 'OS' })
    console.log('  🔒 Compras vuelve a estar candada')
  }

  await verificar(google, boletas)
}

/** La verificación: la fila, la fecha de caja (que es lo que mueve el cash flow) y los controles. */
async function verificar(google, boletas) {
  await new Promise((r) => setTimeout(r, 4000))
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:AJ1200`)
  console.log('\n── VERIFICACIÓN ─────────────────────────────────────────')
  let ok = true
  for (const b of boletas) {
    const c = ubicarFila(v, b)[0]
    const f = v[c.fila - 1]
    const fechaCaja = String(f?.[29] ?? '').trim()   // AD · la calcula la ARRAYFORMULA
    const total = Number(String(f?.[COL.total] ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
    const bien = c.estado === 'Pagado' && c.comprobante === String(b.boleta) && mismaFecha(fechaCaja, aFechaAR(b.pagada))
    if (!bien) ok = false
    console.log(`  ${b.entidad.padEnd(7)} f${c.fila} · ${$(total)} · boleta ${c.comprobante} · ${c.estado} · fecha de caja ${fechaCaja || '⚠ vacía'}  ${bien ? '✓' : '✖'}`)
  }
  const errores = ['Compras!A1:AJ1200', 'CAJA!A1:I145', 'Cargas Sociales!A1:R60', 'Cash Flow Mensual!A1:R60', 'Cash Flow Semanal!A1:R60']
  for (const r of errores) {
    const g = (await google.readSheetValues(ID, r)).flat().filter((c) => /#(REF|VALUE|ERROR|N\/A|NAME|DIV)/i.test(String(c ?? ''))).length
    console.log(`  ${r.split('!')[0].padEnd(20)} ${g} celda(s) en error`)
    if (g) ok = false
  }
  console.log(ok ? '\n✔ cargadas, con fecha de caja y sin romper nada.' : '\n✖ revisá el respaldo antes de seguir.')
  if (!ok) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 }).finally(() => closePool())
}
