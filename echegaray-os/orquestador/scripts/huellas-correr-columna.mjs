#!/usr/bin/env node
// CORRE LAS HUELLAS DE LA BASE UNA COLUMNA, JUNTO CON LA INSERCIÓN DE «OBRA» (14/09/2026).
//
// Por defecto es un ensayo: LEE la base y dice cuántas filas correría. Escribe sólo con --aplicar, y
// eso sólo tiene sentido DESPUÉS de insertar la columna: la huella nueva se calcula con la fórmula
// releída del Sheet en su posición nueva. El porqué, en `lib/huellas-corrimiento.mjs`.
//
// Con --aplicar: respaldo de las filas afectadas a archivo → una transacción (correr posiciones,
// reescribir huellas, correr rangos de formato) → relectura dentro de la transacción; si la relectura
// no coincide con el plan, ROLLBACK.
//
//   node orquestador/scripts/huellas-correr-columna.mjs              # dry (lectura)
//   node orquestador/scripts/huellas-correr-columna.mjs --aplicar    # la corre sheet-insertar-columna-obra.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DESDE_COLUMNA, planDeCeldas, planDeFormato, verificarAplicado } from '../lib/huellas-corrimiento.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANAS = Object.keys(DESDE_COLUMNA)
const TANDA = 800

const SQL_CELDAS = `select pestana, fila, col, forma, huella, valor from public.sheet_huella_celda
  where file_id = $1 and pestana = any($2)`
const SQL_FORMATO = `select pestana, rango_a1, tipo from public.sheet_huella_formato where file_id = $1 and pestana = any($2)`

/** Lo que la base tiene hoy, sin tocar nada. */
export async function leerHuellas(db) {
  const celdas = (await db.query(SQL_CELDAS, [ID, PESTANAS])).rows
  const formato = (await db.query(SQL_FORMATO, [ID, PESTANAS])).rows
  return { celdas, formato }
}

/** La relectura del Sheet ya insertado, como función (pestaña, fila, col) → fórmula o valor. */
export async function lectorDeGrilla(google) {
  const cache = new Map()
  for (const p of PESTANAS) {
    try { cache.set(p, await google.readSheetValues(ID, `'${p}'!A1:BZ`, { render: 'FORMULA' })) } catch { cache.set(p, null) }
  }
  return (pestana, fila, col) => cache.get(pestana)?.[fila - 1]?.[col] ?? null
}

/** Mueve la posición sin chocar con la clave primaria: primero a negativos, después a su lugar. */
async function correrPosiciones(client) {
  for (const [p, desde] of Object.entries(DESDE_COLUMNA)) {
    await client.query('update public.sheet_huella_celda set col = -col - 2 where file_id = $1 and pestana = $2 and col >= $3', [ID, p, desde])
    await client.query('update public.sheet_huella_celda set col = -col - 1 where file_id = $1 and pestana = $2 and col < 0', [ID, p])
  }
}

async function reescribirHuellas(client, mover) {
  for (let i = 0; i < mover.length; i += TANDA) {
    const t = mover.slice(i, i + TANDA)
    const params = [ID]
    const tuplas = t.map((m) => {
      params.push(m.pestana, m.fila, m.col, m.forma, m.huella, m.valor)
      const b = params.length - 6
      return `($${b + 1}::text,$${b + 2}::int,$${b + 3}::int,$${b + 4}::text,$${b + 5}::text,$${b + 6}::text)`
    })
    await client.query(`update public.sheet_huella_celda h set forma = v.forma, huella = v.huella, valor = v.valor
      from (values ${tuplas.join(',')}) as v(pestana, fila, col, forma, huella, valor)
      where h.file_id = $1 and h.pestana = v.pestana and h.fila = v.fila and h.col = v.col`, params)
  }
}

/**
 * El corrimiento entero. `db` necesita `query` y `withTx`; `google` sólo hace falta con `aplicar`.
 * @returns {Promise<{plan:object, formato:object[], aplicado:boolean, respaldo?:string}>}
 */
export async function correrHuellas({ db, google = null, aplicar = false, dirRespaldo, log = console.log } = {}) {
  const { celdas, formato } = await leerHuellas(db)
  const releida = aplicar ? await lectorDeGrilla(google) : null
  const plan = planDeCeldas(celdas, releida)
  const planFormato = planDeFormato(formato)
  const porPestana = {}
  for (const m of plan.mover) porPestana[m.pestana] = (porPestana[m.pestana] ?? 0) + 1
  log(`huellas por celda: ${celdas.length} leídas · ${plan.mover.length} a correr (${JSON.stringify(porPestana)}) · ${plan.quedan} quedan`)
  log(`  ${plan.citanColumnas} son fórmulas: su huella se recalcula con la fórmula releída después de insertar`)
  log(`huellas de formato: ${formato.length} leídas · ${planFormato.length} cambian de rango`
    + (planFormato.length ? ` (${planFormato.map((f) => `${f.pestana} ${f.rango_a1}→${f.rangoNuevo}`).join(' · ')})` : ''))
  if (!aplicar) { log('(dry) no escribí la base'); return { plan, formato: planFormato, aplicado: false } }

  if (!google) throw new Error('huellas: --aplicar necesita el Sheet ya insertado para releer las fórmulas')
  const dir = dirRespaldo ?? join(process.env.HOME ?? '.', '.echegaray', 'respaldos')
  mkdirSync(dir, { recursive: true })
  const respaldo = join(dir, `huellas-antes-de-obra-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(respaldo, JSON.stringify({ fileId: ID, celdas, formato }))
  log(`respaldo: ${respaldo} · sin contenido al releer: ${plan.sinContenido} (conservan la huella de antes)`)

  await db.withTx(async (client) => {
    await correrPosiciones(client)
    await reescribirHuellas(client, plan.mover)
    for (const f of planFormato) {
      await client.query('update public.sheet_huella_formato set rango_a1 = $1 where file_id = $2 and pestana = $3 and rango_a1 = $4 and tipo = $5',
        [f.rangoNuevo, ID, f.pestana, f.rango_a1, f.tipo])
    }
    const releidas = (await client.query(SQL_CELDAS, [ID, PESTANAS])).rows
    const mal = verificarAplicado(plan, releidas)
    if (mal.length || releidas.length !== celdas.length) {
      throw new Error(`huellas: la relectura no cierra (${mal.length} diferencias, ${releidas.length} vs ${celdas.length} filas): ROLLBACK. ${mal.slice(0, 5).join(' · ')}`)
    }
  })
  log(`✓ ${plan.mover.length} huellas corridas y releídas`)
  return { plan, formato: planFormato, aplicado: true, respaldo }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const db = await import('../lib/db.mjs')
  let google = null
  if (aplicar) {
    const { makeGoogleClient, READONLY_SCOPES } = await import('../lib/google.mjs')
    const { loadConfig } = await import('../lib/config.mjs')
    google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  }
  try { await correrHuellas({ db, google, aplicar }) } finally { await db.closePool() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
}
