#!/usr/bin/env node
// LA FILA 3 DE LOS CASH FLOW ES EL CONTRATO: SI EL ENCABEZADO SE CORRE, LA COLUMNA SUMA OTRA COSA.
//
// ═══ EL DEFECTO (30/07) ═══
//
// Cada columna de los dos cuadros suma una VENTANA que arranca en su propio encabezado:
//   · Mensual: [encabezado , fin de mes]      → el encabezado tiene que ser el PRIMERO del mes
//   · Semanal: [encabezado , encabezado + 7)  → el encabezado tiene que ser el LUNES
//
// La Mensual tenía en la fila 3 el DÍA 26 de cada mes (26/01, 26/02, …). Con la ventana
// [26 del mes , fin de mes], cada columna capturaba CINCO O SEIS DÍAS y todo lo pagado entre el 1° y
// el 25 no aparecía en ninguna parte. Se veía "ene-26" en pantalla —el formato mmm-yy tapa el día—,
// así que nada delataba el corrimiento. Medido con el control de la propia pestaña: 12 líneas de
// egresos perdían $292.815.336 del año. Los ingresos perdían lo mismo, pero su control es
// `O = N` —se compara contra sí mismo— así que no podía delatarlo.
//
// La Semanal tenía 29/12/**2026** en su primera semana: un año adelantado. Esa columna quedaba fuera
// de orden (mayor que la siguiente) y su ventana no capturaba nada de la semana que decía cubrir.
//
// LOS DOS VALORES ESTABAN EN LA PESTAÑA, NO EN EL CÓDIGO. `cash-flow-rehacer.mjs` siempre escribió el
// primero de mes y el lunes correcto; las pestañas están candadas —el dueño las reescribió— y por eso
// nunca recibieron la corrección. De ahí que este corrector exista por separado: toca 13 celdas, no
// regenera nada, y usa LA MISMA definición de períodos que el generador (meses()/semanas()).
//
//   node orquestador/scripts/cash-flow-encabezados.mjs            (audita: no toca nada)
//   node orquestador/scripts/cash-flow-encabezados.mjs --aplicar

import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { bloquear, desbloquear } from '../lib/pestana-bloqueada.mjs'
import { meses, semanas, ANIO } from './cash-flow-rehacer.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const APLICAR = process.argv.includes('--aplicar')
// --controles: reemplaza los controles TAUTOLÓGICOS por controles de verdad. Ver CONTROLES_REALES.
const CONTROLES = process.argv.includes('--controles')
export const FILA_CAB = 3

/**
 * ═══ LOS CONTROLES QUE SE COMPARABAN CONTRA SÍ MISMOS (30/07) ═══
 *
 * La columna "Real" de diez líneas era `=N7`, `=N8`… — la propia suma de las 12 columnas. Un control
 * que se compara contra sí mismo SIEMPRE da cero: no puede fallar, así que no puede avisar nada, y
 * encima se lee como "esta línea cierra". Es la misma trampa que hoy se corrigió en el puente de
 * Cheques Recibidos: peor que no tener control, porque da confianza falsa.
 *
 * De las diez, sólo CUATRO tienen un "real" que exista de verdad y se pueda calcular. Son éstas, y su
 * control es la MISMA definición de la línea con la ventana del AÑO ENTERO en vez del mes:
 */
export const CONTROLES_REALES = [
  {
    fila: 7,
    rotulo: 'Cobranzas de obra civil',
    formula: '=SUMPRODUCT((LOWER(Cobranzas!$F$5:$F$400)="civil")*(LEFT(Cobranzas!$BB$5:$BB$400&"";8)<>"ENDOSADO")*(LOWER(Cobranzas!$O$5:$O$400)="cobrado")*(YEAR(IF(ISNUMBER(Cobranzas!$Q$5:$Q$400);Cobranzas!$Q$5:$Q$400;IF(ISNUMBER(Cobranzas!$P$5:$P$400);Cobranzas!$P$5:$P$400;0)))=ANIO_CF)*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))',
  },
  {
    fila: 8,
    rotulo: 'Cobranzas de mantenimiento',
    formula: '=SUMPRODUCT((LOWER(Cobranzas!$F$5:$F$400)="mantenimiento")*(LEFT(Cobranzas!$BB$5:$BB$400&"";8)<>"ENDOSADO")*(LOWER(Cobranzas!$O$5:$O$400)="cobrado")*(YEAR(IF(ISNUMBER(Cobranzas!$Q$5:$Q$400);Cobranzas!$Q$5:$Q$400;IF(ISNUMBER(Cobranzas!$P$5:$P$400);Cobranzas!$P$5:$P$400;0)))=ANIO_CF)*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))',
  },
  {
    fila: 9,
    rotulo: 'Otras cobranzas',
    formula: '=SUMPRODUCT((LOWER(Cobranzas!$F$5:$F$400)<>"civil")*(LOWER(Cobranzas!$F$5:$F$400)<>"mantenimiento")*(LEFT(Cobranzas!$BB$5:$BB$400&"";8)<>"ENDOSADO")*(LOWER(Cobranzas!$O$5:$O$400)="cobrado")*(YEAR(IF(ISNUMBER(Cobranzas!$Q$5:$Q$400);Cobranzas!$Q$5:$Q$400;IF(ISNUMBER(Cobranzas!$P$5:$P$400);Cobranzas!$P$5:$P$400;0)))=ANIO_CF)*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))',
  },
  {
    fila: 35,
    rotulo: 'Equipos, rodados y maquinaria',
    formula: '=SUMIFS(Compras!$O$4:$O;Compras!$AF$4:$AF;"Equipos y rodados (inversión)";Compras!$AD$4:$AD;">="&DATE(ANIO_CF;1;1);Compras!$AD$4:$AD;"<"&DATE(ANIO_CF+1;1;1))',
  },
]

/**
 * Las SEIS que se dejan como están, con su motivo. No se les inventa un control: son líneas
 * PROYECTADAS o CALCULADAS y no existe un "real" contra el cual compararlas. Escribir cualquier cosa
 * ahí sería peor que la tautología, porque parecería un control de verdad.
 */
export const SIN_CONTROL_POSIBLE = new Map([
  [11, 'Esperado · obra civil — es lo que TODAVÍA NO se cobró: mirar hacia adelante no tiene un real'],
  [12, 'Esperado · mantenimiento — ídem: es expectativa de cobro, no un hecho'],
  [13, 'Esperado · otras — ídem'],
  [24, 'Cheques y tarjeta sin factura cargada — es un AVISO de carga faltante, no un gasto de Compras'],
  [41, 'Intereses del acuerdo en descubierto — se proyectan sobre el saldo del propio cuadro'],
  [42, 'Impuesto al cheque — se calcula como 0,6% de las otras líneas del cuadro'],
])

/** Las dos pestañas y su grilla de períodos. La ventana de cada columna sale de su encabezado. */
export const CUADROS = [
  { pestana: 'Cash Flow Mensual', periodo: 'mensual', esperado: meses, ventana: '[encabezado , fin de mes]' },
  { pestana: 'Cash Flow Semanal', periodo: 'semanal', esperado: semanas, ventana: '[encabezado , encabezado+7)' },
]

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
/** Un serial de Sheets (epoch 1899-12-30) → 'YYYY-MM-DD'. */
export const deSerial = (n) => new Date(Date.UTC(1899, 11, 30) + Number(n) * 86400000).toISOString().slice(0, 10)
/** Una fecha → el serial de Sheets. Es el número que se escribe: sin ambigüedad de locale. */
export const aSerial = (d) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000)
const $ = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`

/**
 * NÚCLEO PURO: comparar la fila 3 real contra la que dice el contrato.
 *
 * Devuelve una celda por cada encabezado que no coincide. NO "corrige de más": si la pestaña tiene
 * más columnas que períodos esperados, las de más se REPORTAN y no se tocan — podrían ser una columna
 * de total o algo que el dueño agregó, y adivinar sobre el cuadro principal de la empresa no es una
 * opción.
 *
 * @param {any[]} fila3 los valores de la fila 3 SIN formato (los seriales llegan como número)
 * @param {Date[]} esperados los períodos del contrato
 */
export function planEncabezados(fila3 = [], esperados = []) {
  const celdas = []
  const sobran = []
  esperados.forEach((d, i) => {
    const col = letra(i + 1)               // B, C, D… (A es el rótulo "Período")
    const actual = fila3[i + 1]
    const esperado = aSerial(d)
    if (typeof actual !== 'number') {
      celdas.push({ a1: `${col}${FILA_CAB}`, serial: esperado, actual: String(actual ?? '(vacío)'), esperado: deSerial(esperado), motivo: 'el encabezado no es una fecha' })
      return
    }
    if (actual !== esperado) {
      celdas.push({ a1: `${col}${FILA_CAB}`, serial: esperado, actual: deSerial(actual), esperado: deSerial(esperado), motivo: `estaba corrido ${actual - esperado} día(s)` })
    }
  })
  for (let i = esperados.length + 1; i < fila3.length; i++) {
    if (typeof fila3[i] === 'number') sobran.push(`${letra(i)}${FILA_CAB} = ${deSerial(fila3[i])}`)
  }
  return { celdas, sobran }
}

/**
 * NÚCLEO PURO: ¿el cuadro cierra contra la realidad?
 *
 * Para cada línea que tiene un control INDEPENDIENTE (la columna "Real (Compras)" con un SUMIF sobre
 * Compras, no un `=N`), la suma de las 12 columnas tiene que dar ese total. La columna "Proyectado"
 * del propio cuadro ya es esa resta: acá sólo se lee y se clasifica.
 *
 * @param {Array<Array<any>>} filas valores de la pestaña
 * @param {Array<Array<any>>} formulas las mismas celdas con render FORMULA (para ver si O es `=N`)
 */
export function controlesDelCuadro(filas = [], formulas = [], { colTotal = 13, colReal = 14, colDif = 15 } = {}) {
  const num = (v) => {
    if (typeof v === 'number') return v
    const s = String(v ?? '').replace(/[^\d,.-]/g, '')
    return s ? Number(s.replace(/\./g, '').replace(',', '.')) : NaN
  }
  const out = []
  filas.forEach((f, i) => {
    const rotulo = String(f?.[0] ?? '').replace(/^=HYPERLINK\([^;]+;"/, '').replace(/"\)$/, '').trim()
    const total = num(f?.[colTotal])
    const real = num(f?.[colReal])
    if (!rotulo || !Number.isFinite(total) || !Number.isFinite(real)) return
    const fReal = String(formulas?.[i]?.[colReal] ?? '')
    // Un control que se compara contra sí mismo NO es un control: se marca aparte para no contarlo
    // como "cierra". Es la misma trampa que el puente de Cheques Recibidos: si no puede fallar, no sirve.
    const tautologico = /^=\s*\$?[A-Z]+\$?\d+\s*$/.test(fReal.trim())
    // ═══ QUÉ SIGNIFICA QUE "CIERRE" (y por qué no es la igualdad) ═══
    //
    // Los meses que todavía no pasaron son PROYECCIÓN: la fórmula es IF(mes cerrado; real; MAX(real;
    // proyección)). Así que la suma de las 12 columnas TIENE que ser mayor o igual al real cargado —
    // la diferencia positiva es la proyección de los meses que faltan, y es correcta.
    //
    // LA ALARMA ES AL REVÉS: si la suma es MENOR que el real, hay plata cargada en Compras que ninguna
    // columna está capturando. Eso es imposible salvo que las ventanas estén corridas, y es exactamente
    // lo que pasaba: −$292.815.337 en 12 líneas. Un criterio de igualdad habría gritado por la
    // proyección legítima y me habría hecho "arreglar" lo que estaba bien.
    const pierde = real - total          // > 0 = hay real que ninguna columna ve
    out.push({ fila: i + 1, rotulo, total, real, pierde, dif: num(f?.[colDif]), tautologico, cierra: pierde < 1 })
  })
  return out
}

async function main() {
  if (CONTROLES) return arreglarControles()
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const plan = []
  console.log(`los períodos los define cash-flow-rehacer.mjs (año ${ANIO}) — una sola definición para el generador y para este corrector\n`)

  for (const c of CUADROS) {
    const fila3 = (await google.readSheetValues(ID, `'${c.pestana}'!A${FILA_CAB}:BZ${FILA_CAB}`, { render: 'UNFORMATTED_VALUE' }))[0] ?? []
    const esperados = c.esperado()
    const { celdas, sobran } = planEncabezados(fila3, esperados)
    console.log(`${c.pestana} · ${esperados.length} períodos · ventana ${c.ventana}`)
    if (!celdas.length) console.log('   ✓ los encabezados coinciden con el contrato')
    celdas.forEach((x) => console.log(`   ✖ ${x.a1}  ${x.actual}  →  ${x.esperado}   (${x.motivo})`))
    sobran.forEach((x) => console.log(`   · fuera de la grilla de períodos, NO la toco: ${x}`))
    plan.push(...celdas.map((x) => ({ ...x, pestana: c.pestana })))
  }

  // ── EL CONTROL DE FONDO, ANTES ───────────────────────────────────────────────────────────────────
  const antes = await medir(google)
  console.log(`\nANTES · las 12 columnas de la Mensual suman ${$(antes.suma)} y el real es ${$(antes.real)}`)
  console.log(`   ${antes.rotas.length} línea(s) pierden real · ${$(antes.falta)} que ninguna columna ve`)
  antes.rotas.slice(0, 14).forEach((l) => console.log(`   ✖ f${String(l.fila).padStart(2)} ${l.rotulo.slice(0, 44).padEnd(46)} suma ${$(l.total).padStart(15)} · real ${$(l.real).padStart(15)}`))
  if (antes.tautologicas.length) {
    console.log(`   ⚠ ${antes.tautologicas.length} línea(s) con un control que se compara CONTRA SÍ MISMO (no puede fallar, no sirve):`)
    antes.tautologicas.forEach((l) => console.log(`      f${l.fila} ${l.rotulo.slice(0, 56)}`))
  }

  if (!plan.length) return console.log('\nno hay encabezados que corregir.')
  if (!APLICAR) return console.log(`\nEN SECO: ${plan.length} celda(s). Corré con --aplicar.`)

  // ── RESPALDO Y SNAPSHOT DE LAS DOS PESTAÑAS ──────────────────────────────────────────────────────
  const deps = { query }
  const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')
  for (const c of CUADROS) {
    if (!plan.some((x) => x.pestana === c.pestana)) continue
    const grid = await google.readSheetGrid(ID, `'${c.pestana}'!A1:BZ80`)
    const dest = `/tmp/${c.pestana.replace(/\W+/g, '-')}-antes-${sello}.json`
    writeFileSync(dest, JSON.stringify(grid, null, 1))
    console.log(`\nrespaldo → ${dest}`)
    console.log(`snapshot → ${await tomarSnapshot({ google, fileId: ID, pestana: c.pestana, tool: 'cash-flow-encabezados', directive: 'los encabezados de período estaban corridos: cada columna sumaba una ventana equivocada' }) ?? 'no se pudo'}`)
  }

  const meta = await google.getSheetMeta(ID)
  for (const c of CUADROS) {
    const celdas = plan.filter((x) => x.pestana === c.pestana)
    if (!celdas.length) continue
    const hoja = meta.find((h) => h.title === c.pestana)
    await desbloquear(deps, ID, c.pestana)
    try {
      // EL SERIAL, NO EL TEXTO. Escribir "01/01/2026" depende de que el archivo lo parsee en su locale;
      // el número es la fecha, sin intermediarios. El formato de la celda (mmm-yy / dd/mm) no se toca.
      const reqs = celdas.map((x) => {
        const m = /^([A-Z]+)(\d+)$/.exec(x.a1)
        const j = m[1].split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1
        return {
          updateCells: {
            range: { sheetId: hoja.sheetId, startRowIndex: Number(m[2]) - 1, endRowIndex: Number(m[2]), startColumnIndex: j, endColumnIndex: j + 1 },
            rows: [{ values: [{ userEnteredValue: { numberValue: x.serial } }] }],
            fields: 'userEnteredValue',
          },
        }
      })
      const res = await google.spreadsheetBatchUpdate(ID, reqs, { yaGuardado: true })
      if (res?.protegido) throw new Error(`el portón descartó la escritura en ${c.pestana}`)
      console.log(`  ✔ ${c.pestana}: ${celdas.length} encabezado(s) corregidos`)
    } finally {
      await bloquear(deps, ID, c.pestana, { motivo: 'el dueño edita — re-candada tras corregir los encabezados de período', por: 'OS' })
    }
  }
  console.log('  🔒 las dos pestañas vuelven a estar candadas')

  // ── VERIFICACIÓN: EL CUADRO TIENE QUE CERRAR CONTRA LA REALIDAD ──────────────────────────────────
  await new Promise((r) => setTimeout(r, 6000))
  const despues = await medir(google)
  console.log(`\nDESPUÉS · las 12 columnas suman ${$(despues.suma)} y el real cargado es ${$(despues.real)}`)
  console.log(`   real que NINGUNA columna ve: ${$(despues.falta)} (antes ${$(antes.falta)})`)
  console.log(`   proyección de los meses que faltan, por encima del real: ${$(despues.proyectaDeMas)} — esto es correcto`)
  despues.rotas.forEach((l) => console.log(`   ✖ f${String(l.fila).padStart(2)} ${l.rotulo.slice(0, 44).padEnd(46)} pierde ${$(l.pierde).padStart(15)}`))
  if (!despues.rotas.length) console.log('   ✓ ninguna línea pierde plata cargada')

  let errores = 0
  for (const r of ['Cash Flow Mensual!A1:R60', 'Cash Flow Semanal!A1:BZ60', 'CAJA!A1:I145', 'Compras!A1:AJ1200']) {
    const e = (await google.readSheetValues(ID, r)).flat().filter((x) => /#(REF|VALUE|ERROR|N\/A|NAME|DIV)/i.test(String(x ?? ''))).length
    console.log(`   ${r.split('!')[0].padEnd(20)} ${e} celda(s) en error`)
    errores += e
  }
  const ok = despues.rotas.length === 0 && errores === 0
  console.log(ok ? '\n✔ los dos cuadros cierran contra la realidad y no hay una sola celda en error.' : '\n⚠ queda algo abierto: mirá el detalle de arriba.')
  if (!ok) process.exitCode = 1
}

/** REEMPLAZAR LOS CONTROLES TAUTOLÓGICOS POR CONTROLES DE VERDAD (las 4 que tienen un real). */
async function arreglarControles() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const formulas = await google.readSheetValues(ID, 'Cash Flow Mensual!A1:R60', { render: 'FORMULA' })
  const plan = []
  console.log('los controles que se comparaban contra sí mismos:\n')
  for (const c of CONTROLES_REALES) {
    const actual = String(formulas?.[c.fila - 1]?.[14] ?? '').trim()
    const rotulo = String(formulas?.[c.fila - 1]?.[0] ?? '').replace(/^=HYPERLINK\([^;]+;"/, '').replace(/"\)$/, '').trim()
    // ANCLA POR RÓTULO: si la fila se movió, no escribo. Un control en la fila equivocada es peor que
    // una tautología, porque compara dos cosas que no tienen nada que ver.
    if (!rotulo.toLowerCase().includes(c.rotulo.toLowerCase().slice(0, 14))) {
      throw new Error(`la fila ${c.fila} ya no es "${c.rotulo}" (dice "${rotulo}"): NO escribo nada`)
    }
    const esTautologia = /^=\s*\$?[A-Z]+\$?\d+\s*$/.test(actual)
    if (!esTautologia) { console.log(`   f${c.fila} ${c.rotulo.padEnd(30)} ya tiene un control propio: no lo toco`); continue }
    const formula = c.formula.replace(/ANIO_CF/g, String(ANIO))
    console.log(`   f${c.fila} ${c.rotulo.padEnd(30)} ${actual}  →  control real sobre la fuente (${formula.length} caracteres)`)
    plan.push({ a1: `O${c.fila}`, formula, rotulo: c.rotulo })
  }
  console.log('\nlas que se quedan como están, con su motivo:')
  for (const [fila, motivo] of SIN_CONTROL_POSIBLE) console.log(`   f${fila} ${motivo}`)

  if (!plan.length) return console.log('\nno hay controles que reemplazar.')
  if (!APLICAR) return console.log(`\nEN SECO: ${plan.length} celda(s). Corré con --controles --aplicar.`)

  const grid = await google.readSheetGrid(ID, 'Cash Flow Mensual!A1:R60')
  const dest = `/tmp/Cash-Flow-Mensual-controles-antes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
  writeFileSync(dest, JSON.stringify(grid, null, 1))
  console.log(`\nrespaldo → ${dest}`)
  const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
  console.log(`snapshot → ${await tomarSnapshot({ google, fileId: ID, pestana: 'Cash Flow Mensual', tool: 'cash-flow-controles', directive: 'los controles de 4 líneas se comparaban contra sí mismos' }) ?? 'no se pudo'}`)

  const hoja = (await google.getSheetMeta(ID)).find((h) => h.title === 'Cash Flow Mensual')
  const deps = { query }
  await desbloquear(deps, ID, 'Cash Flow Mensual')
  try {
    const res = await google.spreadsheetBatchUpdate(ID, plan.map((x) => ({
      updateCells: {
        range: { sheetId: hoja.sheetId, startRowIndex: Number(/(\d+)/.exec(x.a1)[1]) - 1, endRowIndex: Number(/(\d+)/.exec(x.a1)[1]), startColumnIndex: 14, endColumnIndex: 15 },
        rows: [{ values: [{ userEnteredValue: { formulaValue: x.formula } }] }],
        fields: 'userEnteredValue',
      },
    })), { yaGuardado: true })
    if (res?.protegido) throw new Error('el portón descartó la escritura')
    console.log(`  ✔ ${plan.length} control(es) reemplazados`)
  } finally {
    await bloquear(deps, ID, 'Cash Flow Mensual', { motivo: 'el dueño edita — re-candada tras poner controles reales en 4 líneas', por: 'OS' })
    console.log('  🔒 Cash Flow Mensual vuelve a estar candada')
  }

  await new Promise((r) => setTimeout(r, 5000))
  const m = await medir(google)
  console.log('\n── VERIFICACIÓN ─────────────────────────────────────────')
  console.log(`   controles tautológicos: ${m.tautologicas.length} (antes 10)`)
  console.log(`   líneas que pierden real: ${m.rotas.length} · ${$(m.falta)}`)
  m.rotas.forEach((l) => console.log(`   ✖ f${l.fila} ${l.rotulo.slice(0, 44)} pierde ${$(l.pierde)}`))
  for (const c of CONTROLES_REALES) {
    const l = m.lineas.find((x) => x.fila === c.fila)
    console.log(`   f${c.fila} ${c.rotulo.padEnd(30)} suma ${$(l?.total).padStart(16)} · real ${$(l?.real).padStart(16)} ${l?.cierra ? '✓' : '✖'}`)
  }
  const errores = (await google.readSheetValues(ID, 'Cash Flow Mensual!A1:R60')).flat().filter((x) => /#(REF|VALUE|ERROR|N\/A|NAME|DIV)/i.test(String(x ?? ''))).length
  console.log(`   celdas en error: ${errores}`)
  const ok = errores === 0 && m.rotas.length === 0 && m.tautologicas.length === SIN_CONTROL_POSIBLE.size
  console.log(ok ? '\n✔ cuatro controles menos que no podían fallar, y el cuadro sigue cerrando.' : '\n⚠ mirá el detalle.')
  if (!ok) process.exitCode = 1
}

/** Lee la Mensual y devuelve cuánto cierra y cuánto no. Es el control de fondo, no de forma. */
async function medir(google) {
  // SIN FORMATO, A PROPÓSITO. Con el formato puesto, una línea cuyas 12 columnas suman cero se lee
  // "—" y mi propio parseo la descartaba como "no es un número": justo el PEOR caso —la línea que no
  // captura nada— quedaba fuera del control. Sin formato, el cero llega como 0 y se mide.
  const filas = await google.readSheetValues(ID, 'Cash Flow Mensual!A1:R60', { render: 'UNFORMATTED_VALUE' })
  const formulas = await google.readSheetValues(ID, 'Cash Flow Mensual!A1:R60', { render: 'FORMULA' })
  const ctrl = controlesDelCuadro(filas, formulas)
  const reales = ctrl.filter((l) => !l.tautologico)
  return {
    lineas: ctrl,
    tautologicas: ctrl.filter((l) => l.tautologico),
    rotas: reales.filter((l) => !l.cierra),
    suma: reales.reduce((s, l) => s + l.total, 0),
    real: reales.reduce((s, l) => s + l.real, 0),
    // Sólo lo que se PIERDE (real que ninguna columna ve). La proyección de más no se resta acá: son
    // dos cosas distintas y sumarlas juntas las tapa.
    falta: reales.reduce((s, l) => s + Math.max(0, l.pierde), 0),
    proyectaDeMas: reales.reduce((s, l) => s + Math.max(0, -l.pierde), 0),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 }).finally(() => closePool())
}
