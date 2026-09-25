#!/usr/bin/env node
// INSERTA LA COLUMNA «OBRA» EN COMPRAS L Y COBRANZAS H — con la prueba del efecto antes y después.
//
// ═══ QUÉ Y POR QUÉ (dueño, 14/09/2026) ═══
//
// La obra codificada va AL LADO de la columna de obra que ya existe, no al final. Todo lo que está a
// la derecha se corre una letra. Google corrige las fórmulas del archivo; el OS lo tiene resuelto por
// rótulo (`columnas-por-encabezado.mjs`) y las huellas de la base se corren con
// `huellas-correr-columna.mjs`, que este script invoca.
//
// ═══ LOS PASOS, EN ESTE ORDEN, Y CADA UNO FRENA AL SIGUIENTE ═══
//
//   0. precondiciones (`lib/insercion-obra-precondiciones.mjs`): se corre desde el checkout de producción
//      y su HEAD trae este trabajo; timers y worker quietos; migración 0700 aplicada. SIN bandera para
//      saltearlas — también en el dry;
//   1. el encabezado actual es el esperado (K «Detalles / Obra», L «Concepto»; G «Obra / Cliente»,
//      H «ORDEN DE COMPRA») — si no, ABORTA: la columna ya se insertó o la pestaña cambió;
//   1b. el tipo de cambio está CLAVADO por el dueño y no colgando de GOOGLEFINANCE: si se mueve entre
//      la foto y la relectura, arrastra cien valores y la comparación acusa una rotura que no existe;
//   2. foto de fórmulas del ARCHIVO ENTERO → qué pestañas citan Compras!/Cobranzas! → foto de valores y
//      fórmulas de las insertadas y de ésas, a archivo. Cualquier lectura que falla ABORTA;
//   2b. plan del P&L (otro archivo, lo verifica su propio script por relectura): con dudas, no inserta;
//   3. insertDimension en Compras L y Cobranzas H, y el rótulo «Obra»;
//   3b. la lista `_OBRAS_OS` y el desplegable de las dos columnas (`scripts/obras-lista-sheet.mjs`).
//      Si esto falla NO frena la verificación: la columna ya está bien insertada y lo que falta se
//      arregla corriendo ese script solo. La corrida igual cierra en rojo: sin desplegable, la columna
//      se tipea a mano y eso es lo que vino a evitar;
//   4. relectura de las mismas pestañas y comparación celda por celda de VALORES (salvo volátiles) y de
//      FÓRMULAS contra la original con sus referencias corridas como lo hace Google
//      (`lib/formula-insertar-columna.mjs`): 0 diferencias;
//   5. huellas de la base corridas (--aplicar de huellas-correr-columna); 5b. P&L corrido y releído;
//   6. foto nueva, a archivo.
//
// Sin --aplicar llega hasta el 2b y dice qué haría: NO llama a ninguna API de escritura.
// Lo que NO hace: deshacer. Si el paso 4 falla, la columna YA está insertada: deja un reporte con las
// fotos y los comandos para decidir, y NO corre las huellas.
//
// ═══ `--copia <fileId>`: EL ENSAYO (15/09/2026) ═══
//
// `ajustarFormula` dice qué hace Google al insertar una columna, y eso se sabía por lectura de la
// documentación y por los tests, no por haberlo VISTO en este archivo. El ensayo corre la inserción
// entera sobre una COPIA de Drive del archivo real: mismas pestañas, mismas fórmulas, mismos gráficos.
// `modoDeCorrida` aborta si el id es el del real —ésa es toda la puerta, y no hay ninguna al revés: NO
// existe bandera para saltear precondiciones contra el archivo real—. En la copia se saltean sólo las
// precondiciones de checkout/timers (hablan del mundo de producción, no del archivo) y las escrituras
// FUERA de la copia: las huellas de Postgres y el P&L quedan en plan, porque el archivo copiado no es
// el que esas dos escrituras describen.
//
//   node orquestador/scripts/sheet-insertar-columna-obra.mjs                          # dry
//   node orquestador/scripts/sheet-insertar-columna-obra.mjs --aplicar                # desde producción, con el dueño
//   node orquestador/scripts/sheet-insertar-columna-obra.mjs --copia <fileId> --aplicar  # ensayo sobre una copia
//   node orquestador/scripts/sheet-insertar-columna-obra.mjs --reverificar <antes.json>   # relee y compara, sólo lectura

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizarRotulo } from '../lib/compras-columnas.mjs'
import { diferenciasDePestana, listarVolatiles, medirVolatiles, pestanasQueCitan } from '../lib/formula-insertar-columna.mjs'
import { DOLAR, evaluarPrecondiciones, problemaDelTipoDeCambio, sondearPrecondiciones } from '../lib/insercion-obra-precondiciones.mjs'

export const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

/** Dónde va la columna y qué rótulos la rodean hoy. `indice` es 0-based: la columna nueva. */
export const INSERCIONES = Object.freeze([
  Object.freeze({ pestana: 'Compras', filaEncabezado: 3, indice: 11, izquierda: 'Detalles / Obra', derecha: 'Concepto' }),
  Object.freeze({ pestana: 'Cobranzas', filaEncabezado: 4, indice: 7, izquierda: 'Obra / Cliente', derecha: 'ORDEN DE COMPRA' }),
])
export const ROTULO = 'Obra'
export const DESDE = Object.freeze(Object.fromEntries(INSERCIONES.map((i) => [i.pestana, i.indice])))

/** Paso 1, puro: los rótulos que rodean el lugar de la inserción. Devuelve los problemas. */
export function verificarEncabezado(encabezado = [], ins) {
  const mal = []
  const [izq, der] = [encabezado[ins.indice - 1], encabezado[ins.indice]]
  if (normalizarRotulo(izq) !== normalizarRotulo(ins.izquierda)) mal.push(`${ins.pestana}: esperaba «${ins.izquierda}» y dice «${izq ?? ''}»`)
  if (normalizarRotulo(der) !== normalizarRotulo(ins.derecha)) mal.push(`${ins.pestana}: esperaba «${ins.derecha}» y dice «${der ?? ''}»`)
  return mal
}

/** Los requests del paso 3. */
export function requestsDeInsercion(ins, sheetId) {
  return [
    { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: ins.indice, endIndex: ins.indice + 1 }, inheritFromBefore: true } },
    { updateCells: {
      range: { sheetId, startRowIndex: ins.filaEncabezado - 1, endRowIndex: ins.filaEncabezado, startColumnIndex: ins.indice, endColumnIndex: ins.indice + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO } }] }], fields: 'userEnteredValue' } },
  ]
}

/**
 * ¿SOBRE QUÉ ARCHIVO CORRE ESTA LLAMADA? El real, salvo `--copia <fileId>` con un id DISTINTO.
 *
 * Falla cerrado y explota (no devuelve un default): un `--copia` mal tipeado que cayera en el real
 * sería la corrida real sin precondiciones, que es justo lo que no puede existir.
 */
export function modoDeCorrida(argv = [], { real = ID } = {}) {
  const i = argv.indexOf('--copia')
  if (i < 0) return { copia: false, id: real }
  const destino = String(argv[i + 1] ?? '').trim()
  if (!destino || destino.startsWith('--')) throw new Error('--copia necesita el id del archivo copia')
  if (destino === real) throw new Error(`--copia apunta al archivo REAL (${real}): el ensayo se corre sobre una copia`)
  return { copia: true, id: destino }
}

/** Una pestaña entera. Lo que falla SUBE: una foto con un hueco compararía contra nada y daría verde. */
async function leerPestana(google, id, titulo, render) {
  const g = await google.readSheetValues(id, `'${String(titulo).replace(/'/g, "''")}'`, { render })
  if (!Array.isArray(g)) throw new Error(`la lectura de «${titulo}» (${render}) no devolvió una grilla`)
  return g
}

/** Valores y fórmulas de estas pestañas. */
export async function fotoDe(google, pestanas, id = ID) {
  const foto = {}
  for (const t of pestanas) foto[t] = { formulas: await leerPestana(google, id, t, 'FORMULA'), valores: await leerPestana(google, id, t, 'UNFORMATTED_VALUE') }
  return foto
}

/**
 * Paso 2: las fórmulas de todo el archivo dicen qué pestañas dependen de las insertadas.
 *
 * LOS VALORES SE LEEN DOS VECES, y no es desconfianza del lector: es la única forma de saber qué celdas
 * se mueven solas (el dólar de `GOOGLEFINANCE` y todo lo que cuelga de él). Entre las dos lecturas no se
 * escribe nada. Manda la SEGUNDA, que es la más cercana al momento de insertar. Ver `medirVolatiles`.
 */
async function fotoPrevia(google, meta, id) {
  const insertadas = INSERCIONES.map((i) => i.pestana)
  const formulas = {}
  // Sin grilla (hojas de gráfico) no hay celdas que citen nada.
  for (const s of meta.filter((x) => x.rows && x.cols)) formulas[s.title] = await leerPestana(google, id, s.title, 'FORMULA')
  const dependientes = pestanasQueCitan(formulas, insertadas)
  const foto = {}
  const primeras = {}
  for (const t of [...insertadas, ...dependientes]) primeras[t] = await leerPestana(google, id, t, 'UNFORMATTED_VALUE')
  const volatiles = []
  for (const t of [...insertadas, ...dependientes]) {
    const valores = await leerPestana(google, id, t, 'UNFORMATTED_VALUE')
    const marcas = medirVolatiles(primeras[t], valores)
    foto[t] = { formulas: formulas[t], valores, volatiles: marcas }
    volatiles.push(...listarVolatiles(t, marcas))
  }
  return { foto, dependientes, volatiles }
}

/** Paso 4, puro: la foto de después contra la de antes, pestaña por pestaña. Devuelve las diferencias. */
export function compararFotos(antes, despues) {
  const rotulos = INSERCIONES.filter((ins) => despues[ins.pestana]?.valores?.[ins.filaEncabezado - 1]?.[ins.indice] !== ROTULO)
    .map((ins) => `${ins.pestana}: falta el rótulo «${ROTULO}» en la columna nueva`)
  const difs = Object.keys(antes).flatMap((p) => diferenciasDePestana({
    pestana: p, antes: antes[p], despues: despues[p], desde: DESDE, insercion: INSERCIONES.find((i) => i.pestana === p) ?? null,
  }))
  return [...rotulos, ...difs]
}

// El texto del verde NO puede afirmar lo que no se preguntó: en la copia las precondiciones de
// producción ni se sondearon, y decir «producción al día» ahí es fabricar una verificación.
async function precondiciones(verificar, log, copia = false) {
  let mal
  try { mal = typeof verificar === 'function' ? await verificar() : ['no hay con qué verificar las precondiciones'] } catch (e) { mal = [`no pude verificar las precondiciones: ${e.message}`] }
  if (!mal.length) {
    log(copia
      ? '0 — (copia) las precondiciones de producción NO se verificaron: hablan del archivo real, que este ensayo no toca'
      : '0 ✓ precondiciones: producción al día, timers y worker quietos, migración 0700 aplicada')
    return null
  }
  log(`✖ precondiciones — NO sigo:\n  ${mal.join('\n  ')}`)
  return { ok: false, paso: 'precondiciones', detalle: mal }
}

async function encabezados(google, log, id) {
  const meta = await google.getSheetMeta(id)
  const hojas = Object.fromEntries(INSERCIONES.map((i) => [i.pestana, meta.find((s) => s.title === i.pestana)]))
  const mal = []
  for (const ins of INSERCIONES) {
    if (!Number.isInteger(hojas[ins.pestana]?.sheetId)) { mal.push(`no existe la pestaña ${ins.pestana}`); continue }
    const enc = (await google.readSheetValues(id, `'${ins.pestana}'!A${ins.filaEncabezado}:BZ${ins.filaEncabezado}`))?.[0] ?? []
    mal.push(...verificarEncabezado(enc, ins))
  }
  if (mal.length) { log(`✖ encabezado inesperado — NO inserto:\n  ${mal.join('\n  ')}`); return { fin: { ok: false, paso: 'encabezado', detalle: mal } } }
  log('1 ✓ encabezados como se esperaba')

  // 1b. El tipo de cambio, que es la única entrada del archivo que se mueve sola. Vale también para la
  // copia: es una propiedad del archivo. El porqué, en `insercion-obra-precondiciones.mjs`.
  const bloque = {
    formulas: await google.readSheetValues(id, DOLAR.rango, { render: 'FORMULA' }),
    valores: await google.readSheetValues(id, DOLAR.rango, { render: 'UNFORMATTED_VALUE' }),
  }
  const dolar = problemaDelTipoDeCambio(bloque)
  if (dolar) { log(`✖ tipo de cambio — NO inserto:\n  ${dolar}`); return { fin: { ok: false, paso: 'tipo-de-cambio', detalle: [dolar] } } }
  log(`1b ✓ tipo de cambio quieto (${bloque.valores[DOLAR.enUso]?.[0]}): el archivo no se mueve solo`)
  return { meta, hojas }
}

/** Con la columna YA insertada y algo que no cierra: todo lo necesario para decidir, a archivo. NO corre huellas. */
function reportarFalla({ paso, detalle = [], error = null, rutaAntes, despues, guardar, log }) {
  const reporte = {
    paso, columnaYaInsertada: true, fotoAntes: rutaAntes, fotoDespues: despues ? guardar('despues-con-diferencias', despues) : null,
    error, diferencias: detalle,
    paraDecidir: [
      `mirar de nuevo, sólo lectura: node orquestador/scripts/sheet-insertar-columna-obra.mjs --reverificar ${rutaAntes}`,
      'si CADA diferencia se explica y se acepta: node orquestador/scripts/huellas-correr-columna.mjs --aplicar, después node orquestador/scripts/pyl-correr-columna-obra.mjs --aplicar',
      'si no se explica: deshacer desde Archivo → Historial de versiones del Sheet, con el dueño. Hasta decidir, timers y worker siguen detenidos.',
    ],
  }
  const ruta = guardar('reporte-falla', reporte)
  log(`✖ ${paso}: ${error ?? `${detalle.length} diferencia(s)`} — LA COLUMNA YA ESTÁ INSERTADA y NO corro las huellas`)
  for (const d of detalle.slice(0, 20)) log(`  ${d}`)
  log(`  reporte: ${ruta}`)
  for (const c of reporte.paraDecidir) log(`  → ${c}`)
  return { ok: false, paso, detalle, reporte: ruta }
}

async function verificarYCerrar({ google, id, antes, rutaAntes, correrHuellas, correrPyl, guardar, log, desplegable = null, copia = false }) {
  let despues
  try { despues = await fotoDe(google, Object.keys(antes), id) } catch (e) {
    return reportarFalla({ paso: 'relectura', error: `no pude releer: ${e.message}`, rutaAntes, despues: null, guardar, log })
  }
  const difs = compararFotos(antes, despues)
  if (difs.length) return reportarFalla({ paso: 'comparacion', detalle: difs, rutaAntes, despues, guardar, log })
  log(`4 ✓ 0 diferencias de valor y de fórmula, celda por celda, en ${Object.keys(antes).length} pestaña(s)`)

  await correrHuellas()
  // En la copia las huellas y el P&L corren en DRY: describen el archivo real, no éste. El log no puede
  // decir «corridas» de algo que sólo se planeó.
  log(copia ? '5 — (copia) huellas: sólo el plan, la base no se tocó' : '5 ✓ huellas corridas')
  if (correrPyl) {
    const p = await correrPyl({ aplicar: true }).catch((e) => ({ ok: false, paso: 'lectura', detalle: [e.message] }))
    if (!p.ok) {
      log(`✖ P&L: ${p.paso} — las columnas YA están insertadas: corregilo con pyl-correr-columna-obra.mjs antes de descongelar`)
      return { ok: false, paso: 'pyl', detalle: p.detalle }
    }
    log(copia ? '5b — (copia) P&L: sólo el plan, el otro archivo no se tocó' : '5b ✓ P&L corrido una columna y releído')
  }
  log(`6 ✓ foto nueva guardada en ${guardar('despues', await fotoDe(google, Object.keys(antes), id))}`)
  // EL DESPLEGABLE NO FRENA LA VERIFICACIÓN, PERO SÍ EL CIERRE. La columna quedó bien insertada y las
  // huellas corridas —eso es lo que no se puede deshacer—, así que la comparación tenía que correr igual.
  // Una columna «Obra» sin lista, en cambio, se tipea a mano: la corrida no cierra hasta que esté.
  if (desplegable && !desplegable.ok) return { ok: false, paso: 'desplegable', detalle: desplegable.detalle ?? [] }
  return { ok: true, paso: 'fin' }
}

/**
 * La corrida entera. Todo lo externo entra por parámetro: `google`, `verificarPrecondiciones` (→ string[]),
 * `correrHuellas`, `correrPyl`, `guardar`.
 * @returns {Promise<{ok:boolean, paso:string, detalle?:string[], reporte?:string}>}
 */
export async function insertarColumnaObra({ google, aplicar = false, id = ID, copia = false, verificarPrecondiciones, correrHuellas, correrPyl = null, ponerDesplegable = null, guardar, log = console.log }) {
  const frenado = await precondiciones(verificarPrecondiciones, log, copia)
  if (frenado) return frenado
  let hojas, antes, rutaAntes
  try {
    const e = await encabezados(google, log, id)
    if (e.fin) return e.fin
    hojas = e.hojas
    const f = await fotoPrevia(google, e.meta, id)
    antes = f.foto
    rutaAntes = guardar('antes', antes)
    log(`2 ✓ foto previa (valores y fórmulas) guardada en ${rutaAntes}`)
    log(`   pestañas que citan Compras/Cobranzas y se verifican: ${f.dependientes.join(', ') || 'ninguna'}`)
    // Se DICEN. Una celda que se deja de comparar por valor y no aparece en ningún lado es un agujero.
    log(f.volatiles.length
      ? `   ⚠ ${f.volatiles.length} celda(s) cambian solas entre dos lecturas (cuelgan de GOOGLEFINANCE/NOW):`
        + ` se comparan por FÓRMULA y no por valor — ${f.volatiles.slice(0, 12).join(' ')}${f.volatiles.length > 12 ? ' …' : ''}`
      : '   ninguna celda cambió sola entre las dos lecturas de valores')
    for (const ins of INSERCIONES) log(`   ${ins.pestana}: insertaría «${ROTULO}» en el índice ${ins.indice} (${antes[ins.pestana].valores.length} filas)`)
    // EL P&L SE PLANEA ANTES DE INSERTAR. Si su plan tiene una duda —o no se pudo leer—, insertar lo dejaría
    // sumando la columna de al lado sin un camino probado para corregirlo: mejor no insertar.
    if (correrPyl) {
      const p = await correrPyl({ aplicar: false }).catch((err) => ({ ok: false, detalle: [`el P&L no se pudo leer: ${err.message}`] }))
      if (!p.ok) { log(`✖ el P&L no tiene un plan limpio — NO inserto:\n  ${(p.detalle ?? []).join('\n  ')}`); return { ok: false, paso: 'pyl-plan', detalle: p.detalle } }
      log('2b ✓ P&L planeado sin dudas')
    }
  } catch (err) {
    log(`✖ una lectura falló antes de insertar — NO inserto: ${err.message}`)
    return { ok: false, paso: 'lectura', detalle: [err.message] }
  }
  if (!aplicar) { log('(dry) no llamé a ninguna API de escritura'); return { ok: true, paso: 'dry' } }

  const req = INSERCIONES.flatMap((ins) => requestsDeInsercion(ins, hojas[ins.pestana].sheetId))
  const res = await google.spreadsheetBatchUpdate(id, req, { yaGuardado: true })
  if (res?.protegido || res?.congelado || res?.frenados?.length) {
    log(`✖ la escritura no pasó: ${JSON.stringify(res).slice(0, 200)}`)
    return { ok: false, paso: 'insercion' }
  }
  log('3 ✓ columnas insertadas')

  let desplegable = null
  if (ponerDesplegable) {
    desplegable = await ponerDesplegable().catch((e) => ({ ok: false, paso: 'desplegable', detalle: [e.message] }))
    log(desplegable.ok
      ? '3b ✓ lista `_OBRAS_OS` y desplegable puestos en las dos columnas'
      : `✖ 3b desplegable (${desplegable.paso}): ${(desplegable.detalle ?? []).join(' · ')}`
        + '\n   → se arregla solo: node orquestador/scripts/obras-lista-sheet.mjs --aplicar')
  }
  return verificarYCerrar({ google, id, antes, rutaAntes, correrHuellas, correrPyl, guardar, log, desplegable, copia })
}

/** `--reverificar <antes.json>`: la comparación del paso 4 otra vez, sin escribir nada. */
export async function reverificarColumnaObra({ google, antes, id = ID, copia = false, verificarPrecondiciones, log = console.log }) {
  const frenado = await precondiciones(verificarPrecondiciones, log, copia)
  if (frenado) return frenado
  const difs = compararFotos(antes, await fotoDe(google, Object.keys(antes), id))
  log(difs.length ? `✖ ${difs.length} diferencia(s):\n  ${difs.slice(0, 50).join('\n  ')}` : '✓ 0 diferencias de valor y de fórmula')
  return { ok: !difs.length, paso: 'reverificacion', detalle: difs }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const iRev = process.argv.indexOf('--reverificar')
  const modo = modoDeCorrida(process.argv)
  const { makeGoogleClient, WRITE_SCOPES, READONLY_SCOPES } = await import('../lib/google.mjs')
  const { loadConfig } = await import('../lib/config.mjs')
  const { guardarEnRespaldos } = await import('./pyl-correr-columna-obra.mjs')
  const db = await import('../lib/db.mjs')
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar && iRev < 0 ? WRITE_SCOPES : READONLY_SCOPES })
  // En la copia las precondiciones de checkout/timers no aplican: hablan del mundo que escribe el
  // archivo REAL, y ningún timer escribe una copia recién sacada de Drive. Contra el real no hay
  // manera de llegar acá: `modoDeCorrida` aborta si el id coincide.
  const verificarPrecondiciones = modo.copia
    ? async () => []
    : async () => evaluarPrecondiciones(await sondearPrecondiciones({ script: fileURLToPath(import.meta.url), query: db.query }))
  try {
    if (modo.copia) console.log(`ENSAYO sobre la copia ${modo.id} — el archivo real no se toca`)
    if (iRev >= 0) {
      const antes = JSON.parse(readFileSync(process.argv[iRev + 1], 'utf8'))
      const r = await reverificarColumnaObra({ google, antes, id: modo.id, copia: modo.copia, verificarPrecondiciones })
      if (!r.ok) process.exitCode = 1
      return
    }
    const guardar = guardarEnRespaldos(modo.copia ? 'obra-copia' : 'obra')
    // Postgres y el P&L describen el archivo REAL: corridos desde el ensayo escribirían la verdad de
    // otro archivo. En la copia quedan en plan (sólo lectura) y su resultado se lee, no se aplica.
    const correrHuellas = async () => (await import('./huellas-correr-columna.mjs')).correrHuellas({ db, google, aplicar: !modo.copia })
    const correrPyl = process.argv.includes('--sin-pyl')
      ? null
      : async (o) => (await import('./pyl-correr-columna-obra.mjs')).correrPyl({ google, guardar, ...o, aplicar: modo.copia ? false : o.aplicar })
    const lista = await import('./obras-lista-sheet.mjs')
    const opciones = await lista.opcionesDesdeLaBase(db.query)
    const ponerDesplegable = async () => lista.refrescarTodo({ google, id: modo.id, opciones, aplicar: true })
    const r = await insertarColumnaObra({ google, aplicar, id: modo.id, copia: modo.copia, verificarPrecondiciones, correrHuellas, correrPyl, ponerDesplegable, guardar })
    if (!r.ok) process.exitCode = 1
  } finally {
    await db.closePool().catch(() => {})
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
