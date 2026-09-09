// MIGRAR UNA PESTAÑA A UN LAYOUT NUEVO SIN QUE LAS DOS GRILLAS SE SUPERPONGAN.
//
// POR QUÉ (09/09/2026). Cuando un generador cambia de layout (bloques que se van, grilla más corta),
// `protegerBorrado` conserva toda celda con contenido que no pueda probar que escribió el OS. En el
// Sheet real eso dejó las fórmulas de Dirección debajo de los rótulos de Oficina; en una copia (sin
// huella) conserva TODO y cada corrida apila otra capa. La migración correcta es explícita:
//
//   1. respaldo: valores y fórmulas de la pestaña a un JSON (para poder volver);
//   2. celdas del DUEÑO: se leen por CLAVE (no por fila) desde una columna declarada por su rótulo;
//   3. se vacía la pestaña entera (valor y formato) con bypass explícito del guardián;
//   4. corre el generador, que escribe su grilla nueva sobre hoja limpia;
//   5. las celdas del dueño se reponen en la fila de su clave, bajo el mismo rótulo, y se verifica
//      que el conteo antes = después. Si una clave no aparece en el layout nuevo, se avisa y NO se
//      da por buena la migración.
//
// Sólo corre contra el archivo que diga ORQ_CASHFLOW_ID; sin la variable se niega (usá una copia
// primero, siempre). Con --real se permite el archivo real, y ahí la firma es del dueño.
//
//   ORQ_CASHFLOW_ID=<copia> node orquestador/scripts/pestana-migrar-layout.mjs \
//       --pestana "Jornales por Quincena" --generador orquestador/scripts/jornales-pestana.mjs \
//       --dueno "Pagado el" --clave A,B [--args "--aplicar"] [--real]
//
//   --dueno   rótulo exacto de la columna del dueño (puede aparecer en varios bloques)
//   --clave   columnas (letras) que identifican la fila: fechas → serial, texto → normalizado
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const REAL = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const PESTANA = arg('--pestana'), GEN = arg('--generador'), DUENO = arg('--dueno'), CLAVE = (arg('--clave', 'A') || 'A').split(',')
const GEN_ARGS = (arg('--args', '') || '').split(' ').filter(Boolean)
const ID = process.env.ORQ_CASHFLOW_ID
if (!ID) { console.error('✗ falta ORQ_CASHFLOW_ID (usá una copia)'); process.exit(2) }
if (ID === REAL && !process.argv.includes('--real')) { console.error('✗ es el Sheet REAL y no pasaste --real'); process.exit(2) }
if (!PESTANA || !GEN) { console.error('uso: --pestana <título> --generador <script> [--dueno <rótulo> --clave A,B]'); process.exit(2) }

const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
const meta = (await g.getSheetMeta(ID)).find((m) => m.title === PESTANA)
if (!meta) { console.error(`✗ no existe la pestaña «${PESTANA}» en ${ID}`); process.exit(1) }
const col = (letra) => letra.toUpperCase().charCodeAt(0) - 65
const norm = (v) => (typeof v === 'number' ? String(Math.round(v)) : String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' '))

async function leer() {
  const [valores, formulas] = await Promise.all([
    g.readSheetValues(ID, `'${PESTANA}'`, { render: 'UNFORMATTED_VALUE' }),
    g.readSheetValues(ID, `'${PESTANA}'`, { render: 'FORMULA' }),
  ])
  return { valores, formulas }
}
/** Las celdas del dueño: por cada rótulo DUENO en la hoja, las filas de abajo con clave no vacía. */
function celdasDelDueno(valores) {
  const out = new Map()
  if (!DUENO) return out
  valores.forEach((fila, r) => fila.forEach((v, c) => {
    if (norm(v) !== norm(DUENO)) return
    for (let rr = r + 1; rr < valores.length; rr++) {
      const f = valores[rr] || []
      const k = CLAVE.map((l) => norm(f[col(l)])).join('|')
      if (CLAVE.every((l) => norm(f[col(l)]) === '')) break
      const val = f[c]
      if (val !== '' && val != null) out.set(k, { valor: val, col: c, fila: rr + 1 })
    }
  }))
  return out
}

// 1 · respaldo
const antes = await leer()
const dir = '/home/jorge/echegaray-os/respaldos'; mkdirSync(dir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const respaldo = `${dir}/${stamp}-${PESTANA.replace(/\s+/g, '_')}-${ID === REAL ? 'REAL' : 'copia'}.json`
writeFileSync(respaldo, JSON.stringify({ id: ID, pestana: PESTANA, ...antes }, null, 0))
console.log(`respaldo: ${respaldo} (${antes.valores.length} filas)`)

// 2 · celdas del dueño por clave
const dueno = celdasDelDueno(antes.valores)
console.log(`celdas del dueño bajo «${DUENO ?? '—'}»: ${dueno.size}${dueno.size ? ' · ej. ' + [...dueno.entries()].slice(0, 2).map(([k, v]) => `${k}→${v.valor}`).join(' · ') : ''}`)

// 3 · vaciar la pestaña entera (valor + formato), con bypass explícito
const vaciar = { updateCells: { range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: meta.rows, startColumnIndex: 0, endColumnIndex: meta.cols }, fields: 'userEnteredValue,userEnteredFormat' } }
const rv = await g.spreadsheetBatchUpdate(ID, [vaciar], { yaGuardado: true })
if (rv?.protegido) { console.error('✗ no pude vaciar:', JSON.stringify(rv).slice(0, 200)); process.exit(1) }
console.log(`vaciada «${PESTANA}» ${meta.rows}×${meta.cols}`)

// 4 · el generador, sobre hoja limpia
console.log(`→ ${GEN} ${GEN_ARGS.join(' ')}`)
const r = spawnSync(process.execPath, [GEN, ...GEN_ARGS], { stdio: 'inherit', env: { ...process.env, ORQ_CASHFLOW_ID: ID } })
if (r.status !== 0) { console.error(`✗ el generador salió con ${r.status}; el respaldo está en ${respaldo}`); process.exit(1) }

// 5 · reponer las celdas del dueño por clave, bajo el mismo rótulo
if (dueno.size) {
  const despues = await leer()
  const destino = celdasDelDueno(despues.valores) // lo que el generador ya dejó (p. ej. copiado)
  const rotulos = []
  despues.valores.forEach((fila, r) => fila.forEach((v, c) => { if (norm(v) === norm(DUENO)) rotulos.push({ r, c }) }))
  const filaDeClave = new Map()
  for (const { r, c } of rotulos) for (let rr = r + 1; rr < despues.valores.length; rr++) {
    const f = despues.valores[rr] || []
    if (CLAVE.every((l) => norm(f[col(l)]) === '')) break
    filaDeClave.set(CLAVE.map((l) => norm(f[col(l)])).join('|'), { r: rr, c })
  }
  const reqs = [], faltan = []
  for (const [k, { valor }] of dueno) {
    const d = filaDeClave.get(k)
    if (!d) { faltan.push(k); continue }
    const ya = destino.get(k)
    if (ya && norm(ya.valor) === norm(valor)) continue
    const uev = typeof valor === 'number' ? { numberValue: valor } : { stringValue: String(valor) }
    reqs.push({ updateCells: { range: { sheetId: meta.sheetId, startRowIndex: d.r, endRowIndex: d.r + 1, startColumnIndex: d.c, endColumnIndex: d.c + 1 }, rows: [{ values: [{ userEnteredValue: uev }] }], fields: 'userEnteredValue' } })
  }
  if (reqs.length) await g.spreadsheetBatchUpdate(ID, reqs, { yaGuardado: true })
  const final = celdasDelDueno((await leer()).valores)
  const ok = [...dueno.keys()].filter((k) => final.has(k) && norm(final.get(k).valor) === norm(dueno.get(k).valor)).length
  console.log(`celdas del dueño repuestas: ${ok}/${dueno.size} (${reqs.length} escritas, ${dueno.size - reqs.length - faltan.length} ya estaban)`)
  if (faltan.length) { console.error(`✗ ${faltan.length} clave(s) del dueño sin fila en el layout nuevo: ${faltan.slice(0, 5).join(' ; ')}`); process.exit(1) }
  if (ok !== dueno.size) { console.error('✗ el conteo no cierra'); process.exit(1) }
}
console.log(`✓ migración de «${PESTANA}» sobre ${ID === REAL ? 'el REAL' : 'la copia ' + ID}`)
