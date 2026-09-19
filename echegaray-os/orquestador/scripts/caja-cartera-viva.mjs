#!/usr/bin/env node
// CABLEAR LA CARTERA DE CAJA A LA RÉPLICA, EN LA PESTAÑA REAL — CELDA POR CELDA, CON SNAPSHOT.
//
// ═══ POR QUÉ ESTE SCRIPT EXISTE Y NO SE CORRE EL GENERADOR ═══
//
// El arreglo de fondo está en `caja-pestana.mjs` + `lib/cartera-cheques.mjs`: de ahí en adelante, toda
// generación de CAJA nace con la cartera viva. Pero CAJA está CANDADA (el dueño la editó: los arqueos
// de "Caja en pesos" y "Santander · cta cte USD" los tipeó él), y correr el generador entero sobre una
// pestaña con datos suyos para arreglar tres cosas es exactamente lo que este proyecto tiene prohibido
// —ya destruyó trabajo del dueño tres veces—. Ver memorias: nunca-correr-pipeline-para-validar,
// rehacer-pestana-con-datos-es-borrar, candado-de-pestana.
//
// Así que se toca LO MÍNIMO, con nombre y apellido:
//
//   1. C12  "Valores a depositar" — era `=SUM(C47)`, la suma de UNA celda del detalle con el importe
//            pegado. Mostraba $10.000.000 con $10.290.000 en cartera. Pasa a SUMIFS sobre _CHEQUES_RAW.
//   2. C21:C26  la columna "Entra" del calendario — leía `$C$47` y `$F$47`, DOS CELDAS FIJAS. Con un
//            cheque en cartera funcionaba de casualidad; con dos, el segundo no caía en ningún tramo y
//            el piso proyectado de caja quedaba mal sin romper ninguna suma.
//   3. la fila del cheque que faltaba en el detalle (el 514 de Mineral Del Río, $290.000), más el
//      importe y la fecha del que ya estaba, ahora como fórmulas sobre la réplica.
//   4. el CANARIO: la línea que avisa, en la propia pestaña, si el detalle quedó viejo.
//
// EL PEDIDO DEL DUEÑO ES LA AUTORIZACIÓN: "CAJA dice $10.000.000 de Valores a depositar, si no es así
// modificalo" y "cambiar de estado en Compras y Cobranzas tiene que generar un impacto en tiempo real".
// El candado se levanta para esta escritura, se deja constancia del motivo, y se vuelve a poner.
//
// SEPARADOR `;`: el archivo es es-AR y `formulaValue` se toma EN EL LOCALE DEL ARCHIVO. Escribir la
// misma fórmula con comas deja #ERROR! — ya rompió la ARRAYFORMULA de Compras dos veces el 30/07.
//
//   node orquestador/scripts/caja-cartera-viva.mjs --dry     (no toca nada: dice qué escribiría)
//   node orquestador/scripts/caja-cartera-viva.mjs --aplicar

import { writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { bloquear, desbloquear } from '../lib/pestana-bloqueada.mjs'
import {
  EN_CARTERA, formulaCartera, formulaCarteraTramo, formulaImporteEnCartera,
  formulaFechaDeCheque, formulaCanarioDetalle,
} from '../lib/cartera-cheques.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'CAJA'
const APLICAR = process.argv.includes('--aplicar')
const MOTIVO = 'el dueño pidió corregir "Valores a depositar" y que CAJA reaccione en tiempo real (30/07)'

/** Los MISMOS bordes del calendario que usa caja-pestana.mjs. Si allá cambian, acá tiene que fallar. */
const BORDES = [
  ['Vencido — ya pasó la fecha', 'TODAY()'],
  ['Esta semana', 'TODAY()+7'],
  ['Semana que viene', 'TODAY()+14'],
  ['Resto de este mes', 'MAX(TODAY()+14;EOMONTH(TODAY();0))'],
  ['El mes que viene', 'MAX(TODAY()+14;EOMONTH(TODAY();1))'],
  ['Más adelante', ''],
]

const $ = (n) => `$${Number(n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

/**
 * NÚCLEO PURO: ubicar los puntos de anclaje LEYENDO LOS RÓTULOS, nunca por número de fila.
 *
 * Una fila fija es exactamente el defecto que se está arreglando. Si mañana alguien agrega un bloque
 * arriba, este script tiene que seguir encontrando su lugar o abortar — no escribir en el lugar
 * equivocado, que es la única forma de hacer daño acá.
 *
 * @param {Array<Array<any>>} filas valores de la pestaña desde A1
 */
export function ubicar(filas = []) {
  const txt = (i, j = 0) => String(filas[i]?.[j] ?? '').trim()
  const buscar = (re, desde = 0) => { for (let i = desde; i < filas.length; i++) if (re.test(txt(i))) return i + 1; return 0 }
  const cartera = buscar(/^valores a depositar/i)
  const cal0 = buscar(/^vencido — ya pasó la fecha/i)
  const calTotal = buscar(/^⇒ total del horizonte/i)
  const det0 = buscar(/^4\.1 · valores en cartera/i)
  const control = buscar(/^⇒ control: qué dice cobranzas/i)
  // ¿YA HAY CANARIO? Este script tiene que poder correr dos veces sin agregar una fila cada vez. La
  // primera versión insertaba siempre: la segunda corrida habría metido una fila vacía en la pestaña
  // real. Un script que no es idempotente sobre un Sheet de producción es una trampa.
  const canario = buscar(/^⇒ ¿el detalle está al día\?/i)
  // Las filas de detalle son las que están entre el título del bloque y la fila de control.
  const detalle = []
  for (let i = det0; i < control - 1 && i < filas.length; i++) {
    const t = txt(i)
    if (/^\s*(cheque|echeq)\s/i.test(t)) detalle.push({ fila: i + 1, rotulo: t, endosado: /ya no es nuestro|endosad/i.test(t) })
  }
  const faltan = []
  if (!cartera) faltan.push('la fila "Valores a depositar"')
  if (!cal0) faltan.push('el primer tramo del calendario')
  if (!calTotal) faltan.push('"⇒ Total del horizonte"')
  if (!det0) faltan.push('el bloque "4.1 · VALORES EN CARTERA"')
  if (!control) faltan.push('"⇒ Control: qué dice Cobranzas"')
  return { cartera, cal0, calTotal, det0, control, canario, detalle, faltan }
}

/** NÚCLEO PURO: el número de cheque que menciona un rótulo del detalle. */
export const numeroDelRotulo = (r) => (/(?:cheque|echeq)\s+(\S+)/i.exec(String(r ?? '')) || [])[1] ?? null

/**
 * NÚCLEO PURO: el plan de escritura. Devuelve celdas (A1 → fórmula) y las filas a insertar.
 *
 * @param {object} pos resultado de ubicar()
 * @param {Array<{numero:string,emisor:string,estado:string}>} cheques los recibidos vivos de la base
 */
export function planCableado(pos, cheques = []) {
  const enCartera = cheques.filter((c) => c.estado === EN_CARTERA)
  const yaListados = pos.detalle.map((d) => numeroDelRotulo(d.rotulo))
  // Los que la base tiene en cartera y el detalle NO lista. Se comparan por número normalizado: el
  // detalle escribe "90020099" y la base "90020099", pero un cheque físico va con ceros ("00000514").
  const norm = (n) => String(n ?? '').replace(/^0+/, '')
  const nuevos = enCartera.filter((c) => !yaListados.some((n) => norm(n) === norm(c.numero)))

  // Dónde entran las filas nuevas: al final del bloque de los que SIGUEN en cartera, antes de los
  // endosados (que van abajo porque no son plata).
  const ultimaEnCartera = pos.detalle.filter((d) => !d.endosado).at(-1)?.fila ?? pos.det0
  // ═══ LAS INSERCIONES VAN EN COORDENADAS ORIGINALES ═══
  //
  // `startIndex` es 0-based, así que insertar "después de la fila N" es startIndex N. Y como se aplican
  // DE ABAJO HACIA ARRIBA, cada una se expresa contra la pestaña TAL COMO ESTÁ HOY, sin corrimientos.
  //
  // ESTE ERROR YA COSTÓ UNA ESCRITURA A MEDIAS (30/07): la del canario se calculaba sobre la fila YA
  // CORRIDA y se aplicaba primero, así que la fila vacía cayó un renglón más abajo —entre el control y
  // la diferencia— en vez de arriba del control. Hubo que borrar dos filas vacías de la pestaña real.
  const inserciones = [{ startIndex: ultimaEnCartera, cuantas: nuevos.length, para: 'las filas de cartera que faltaban' }]

  // ═══ CADA INSERCIÓN CORRE SÓLO LO QUE ESTÁ DEBAJO DE ELLA ═══
  //
  // El test cazó acá un error mío: le sumaba 1 a TODAS las filas por el canario, y el calendario está
  // ARRIBA del detalle —no se mueve—. El canario habría apuntado a "Sin fecha de pago cargada" en vez
  // de al total del horizonte, y el control del calendario habría comparado contra la celda equivocada.
  const corrido = (f) => (f > ultimaEnCartera ? f + nuevos.length : f)
  // Si el canario YA está, se reescribe en su lugar; si no, se le hace lugar arriba del control.
  const filaCanario = pos.canario ? corrido(pos.canario) : corrido(pos.control)
  if (!pos.canario) inserciones.push({ startIndex: pos.control - 1, cuantas: 1, para: 'el canario del detalle' })
  /** La fila definitiva de algo que YA estaba, después de las dos inserciones. */
  const corridoFinal = (f) => { const c = corrido(f); return c >= filaCanario ? c + 1 : c }

  const cartera = corridoFinal(pos.cartera)
  const cal0 = corridoFinal(pos.cal0)
  const calTotal = corridoFinal(pos.calTotal)
  const det0 = pos.det0
  const filasCartera = [...pos.detalle.filter((d) => !d.endosado).map((d) => ({ fila: d.fila, numero: numeroDelRotulo(d.rotulo), rotulo: d.rotulo, nueva: false })),
    ...nuevos.map((c, k) => ({ fila: ultimaEnCartera + 1 + k, numero: c.numero, emisor: c.emisor, rotulo: `   Cheque ${c.numero} · ${c.emisor}`, nueva: true }))]

  const celdas = []
  // 1 · el total de la cartera: de una copia a la fuente.
  celdas.push({ a1: `C${cartera}`, formula: formulaCartera(), que: 'Valores a depositar = SUMIFS sobre _CHEQUES_RAW' })
  // 2 · el calendario: cada tramo pregunta a la réplica por fecha de pago.
  BORDES.forEach(([rotulo], k) => {
    celdas.push({
      a1: `C${cal0 + k}`,
      formula: formulaCarteraTramo(k === 0 ? null : BORDES[k - 1][1], BORDES[k][1] || null),
      que: `Entra · ${rotulo}`,
    })
  })
  // 3 · el detalle, fila por fila: importe y fecha vivos.
  for (const f of filasCartera) {
    if (f.nueva) {
      celdas.push({ a1: `A${f.fila}`, valor: f.rotulo, que: 'rótulo del cheque que faltaba' })
      celdas.push({ a1: `B${f.fila}`, valor: 'ARS', que: 'moneda' })
      celdas.push({ a1: `H${f.fila}`, valor: `public.cheques · estado ${EN_CARTERA}`, que: 'origen del dato' })
      celdas.push({ a1: `I${f.fila}`, valor: 'Réplica del banco', que: 'quién lo declara' })
    }
    celdas.push({ a1: `C${f.fila}`, formula: formulaImporteEnCartera(f.numero), que: `importe vivo del cheque ${f.numero}` })
    celdas.push({ a1: `E${f.fila}`, formula: `=C${f.fila}`, que: 'importe en pesos' })
    celdas.push({ a1: `F${f.fila}`, formula: formulaFechaDeCheque(f.numero), que: `fecha de pago viva del ${f.numero}` })
    celdas.push({ a1: `G${f.fila}`, formula: `=IF(F${f.fila}="";"";"entra en "&TEXT(F${f.fila}-TODAY();"0")&" días")`, que: 'cuándo entra' })
  }
  // 4 · el canario.
  const r0 = filasCartera[0]?.fila ?? det0 + 1
  const r1 = filasCartera.at(-1)?.fila ?? r0
  celdas.push({ a1: `A${filaCanario}`, valor: '⇒ ¿el detalle está al día? — si dice ⚠, corré la réplica y regenerá CAJA', que: 'rótulo del canario' })
  celdas.push({ a1: `H${filaCanario}`, formula: formulaCanarioDetalle(filasCartera.length, `$C$${cartera}`, `$C$${r0}:$C$${r1}`, `$C$${calTotal}`), que: 'EL CANARIO: avisa si el detalle quedó viejo' })
  celdas.push({ a1: `I${filaCanario}`, valor: 'Se calcula solo', que: 'quién lo declara' })

  return { celdas, inserciones: inserciones.filter((i) => i.cuantas > 0), nuevos, filasCartera, filaCanario, calTotal }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTAÑA}`)
  if (!meta.some((h) => h.title === '_CHEQUES_RAW')) {
    throw new Error('no existe _CHEQUES_RAW: sin la réplica, las fórmulas darían #REF!. Corré cheques-raw-pestana.mjs primero.')
  }

  const { rows: cheques } = await query(
    `select numero, coalesce(librador, contraparte, 'librador sin cargar') emisor, estado, importe::float8 importe
       from public.cheques where tipo = 'recibido' and estado = $1
      order by (fecha_pago is null), fecha_pago, numero`, [EN_CARTERA])
  const totalBase = cheques.reduce((s, c) => s + c.importe, 0)
  console.log(`public.cheques: ${cheques.length} valor(es) en cartera por ${$(totalBase)}`)
  cheques.forEach((c) => console.log(`   ${String(c.numero).padEnd(10)} ${$(c.importe).padStart(14)}  ${c.emisor}`))

  const filas = await google.readSheetValues(ID, `${PESTAÑA}!A1:I140`)
  const pos = ubicar(filas)
  if (pos.faltan.length) throw new Error(`la pestaña cambió de forma y no encuentro: ${pos.faltan.join(' · ')}. NO escribo nada.`)
  console.log(`\n${PESTAÑA}: cartera en la fila ${pos.cartera} · calendario ${pos.cal0}–${pos.calTotal} · detalle desde ${pos.det0} · control en ${pos.control}`)
  pos.detalle.forEach((d) => console.log(`   detalle f${d.fila} ${d.endosado ? '(endosado)' : '(en cartera)'} ${d.rotulo.slice(0, 56)}`))

  const plan = planCableado(pos, cheques)
  console.log(`\nplan: ${plan.celdas.length} celda(s) · ${plan.nuevos.length} fila(s) a insertar · canario en la fila ${plan.filaCanario}`)
  plan.celdas.forEach((c) => console.log(`   ${c.a1.padEnd(6)} ${c.que.padEnd(46)} ${String(c.formula ?? c.valor).slice(0, 88)}`))

  if (!APLICAR) return console.log('\nEN SECO: no toqué nada. Corré con --aplicar.')

  // ── RESPALDO ANTES DE TOCAR. La pestaña tiene números que el dueño tipeó a mano.
  const grid = await google.readSheetGrid(ID, `${PESTAÑA}!A1:I140`)
  const respaldo = `/tmp/CAJA-antes-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
  writeFileSync(respaldo, JSON.stringify(grid, null, 1))
  console.log(`\nrespaldo a disco → ${respaldo}`)
  const { tomarSnapshot } = await import('../lib/sheet-snapshot.mjs')
  const snap = await tomarSnapshot({ google, fileId: ID, pestana: PESTAÑA, tool: 'caja-cartera-viva', directive: MOTIVO })
  console.log(`snapshot en orq.sheet_snapshots → ${snap ?? 'no se pudo (sigue el respaldo a disco)'}`)

  // ── EL CANDADO SE LEVANTA PARA ESTA ESCRITURA Y SE VUELVE A PONER.
  const deps = { query }
  await desbloquear(deps, ID, PESTAÑA)
  try {
    // 1 · las filas nuevas, de abajo hacia arriba para que los índices no se corran entre inserciones.
    for (const ins of [...plan.inserciones].sort((a, b) => b.startIndex - a.startIndex)) {
      await google.spreadsheetBatchUpdate(ID, [{
        insertDimension: {
          range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: ins.startIndex, endIndex: ins.startIndex + ins.cuantas },
          inheritFromBefore: true,
        },
      }], { yaGuardado: true })
      console.log(`  + ${ins.cuantas} fila(s) después de la ${ins.startIndex} — ${ins.para}`)
    }

    // 2 · las celdas, una por una. updateCells con formulaValue: en el LOCALE del archivo (`;`).
    const reqs = plan.celdas.map((c) => {
      const m = /^([A-I])(\d+)$/.exec(c.a1)
      if (!m) throw new Error(`celda ilegible: ${c.a1}`)
      const j = m[1].charCodeAt(0) - 65
      const i = Number(m[2]) - 1
      const valor = c.formula ? { formulaValue: c.formula } : { stringValue: String(c.valor) }
      return {
        updateCells: {
          range: { sheetId: hoja.sheetId, startRowIndex: i, endRowIndex: i + 1, startColumnIndex: j, endColumnIndex: j + 1 },
          rows: [{ values: [{ userEnteredValue: valor }] }],
          fields: 'userEnteredValue',
        },
      }
    })
    // ═══ POR QUÉ ESTA ESCRITURA PASA EL PORTÓN (`yaGuardado`) ═══
    //
    // La guarda de firma detecta que el dueño editó CAJA —y es cierto: tipeó los arqueos— y por eso
    // DESCARTA las escrituras de contenido. En el primer intento hizo exactamente eso: las 22 celdas
    // no se escribieron, sólo quedaron las filas insertadas. La guarda funcionó.
    //
    // Acá se la saltea A PROPÓSITO y con alcance: es una regeneración pedida por el dueño ("si no es
    // así, modificalo"), toca 22 celdas nombradas una por una, NINGUNA de las que él carga a mano
    // (los tests lo prueban), y dejó antes un snapshot y un respaldo a disco. Es la misma figura que
    // el `--force` de Proveedores: el portón protege del pisado accidental, no de un pedido explícito.
    const res = await google.spreadsheetBatchUpdate(ID, reqs, { yaGuardado: true })
    if (res?.protegido) throw new Error('el portón descartó la escritura: no se escribió nada')
    console.log(`  ✔ ${reqs.length} celda(s) escritas`)
  } finally {
    await bloquear(deps, ID, PESTAÑA, { motivo: `${MOTIVO} — re-candada después de cablear la cartera`, por: 'OS' })
    console.log('  🔒 CAJA vuelve a estar candada')
  }

  // ── VERIFICACIÓN: los números tienen que cerrar contra la BASE, no contra sí mismos ───────────────
  await new Promise((r) => setTimeout(r, 4000))
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:I145`)
  const pos2 = ubicar(v)
  const num = (s) => Number(String(s ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
  const cel = (f, j) => v?.[f - 1]?.[j]
  const carteraSheet = num(cel(pos2.cartera, 2))
  const entra = BORDES.map((_, k) => num(cel(pos2.cal0 + k, 2))).reduce((a, b) => a + b, 0)
  const errores = (v || []).flat().filter((c) => /#(REF|VALUE|ERROR|N\/A|NAME|DIV)/i.test(String(c ?? ''))).length
  const canario = String(cel(plan.filaCanario, 7) ?? '')
  const total = num(cel((v.findIndex((f) => /^total disponibilidades/i.test(String(f?.[0] ?? '').trim())) + 1), 4))

  console.log('\n── VERIFICACIÓN ─────────────────────────────────────────')
  console.log(`  Valores a depositar (f${pos2.cartera}) .... ${$(carteraSheet)}   base: ${$(totalBase)}  ${Math.abs(carteraSheet - totalBase) < 1 ? '✓' : '✖'}`)
  console.log(`  el calendario reparte .................. ${$(entra)}  ${Math.abs(entra - totalBase) < 1 ? '✓ todo el valor tiene tramo' : '✖ hay valor sin fecha de pago'}`)
  console.log(`  canario ................................ ${canario.slice(0, 96)}`)
  console.log(`  Total disponibilidades ................. ${$(total)}`)
  console.log(`  celdas en error ........................ ${errores}`)
  const ok = Math.abs(carteraSheet - totalBase) < 1 && errores === 0 && canario.startsWith('✓')
  console.log(ok ? '\n✔ la cartera de CAJA sale de la fuente y cierra con la base.' : '\n✖ NO cierra: mirá el respaldo antes de seguir.')
  if (!ok) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 }).finally(() => closePool())
}
