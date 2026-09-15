#!/usr/bin/env node
// EL RELLENO DE LA COLUMNA «Obra» (Compras L · Cobranzas H), APLICADO «COMO CORRESPONDE» (dueño, 15/09/2026).
//
// Entra la corrida en seco de `obra-relleno-dry.mjs` (compras.csv · cobranzas.csv); las reglas viven en
// `lib/obra-relleno-aplicar.mjs`. Nada se escribe directo: cada fila pasa por la MISMA puerta que usa
// la app —`compra_obra_asignar` / `cobranza_obra_asignar`, que validan el rótulo contra el catálogo,
// guardan en la réplica y encolan— y el worker de la cola (`comunicacion/compras/cola-obra.mjs`)
// escribe UNA celda del Sheet, con el nombre de quien pidió, y la relee. Al final se relee la base y
// una muestra de 20 celdas por pestaña: la evidencia es del efecto, no del intento.
//
//   node orquestador/scripts/obra-relleno-aplicar.mjs --entrada <carpeta del dry> [--salida <carpeta>]
//   node orquestador/scripts/obra-relleno-aplicar.mjs --entrada <carpeta> --aplicar --actor "Nombre del perfil" [--max 1000]
//
// EN SECO por defecto: imprime conteos por rótulo y por regla y la lista de lo que NO se escribe, y
// deja `relleno-plan.json` y `relleno-no-escritas.csv` en la salida. `--aplicar` se corre desde el
// árbol principal, por el dueño: un generador que escribe el Sheet real desde un worktree ya borró
// una pestaña entera. El Sheet se LEE en las dos modalidades (columna Obra viva) para no pisar nada.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig } from '../lib/config.mjs'
import { makeGoogleClient, READONLY_SCOPES, WRITE_SCOPES } from '../lib/google.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { CASHFLOW_ID } from '../lib/cash-briefing.mjs'
import { catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { catalogoDeDestinos, opcionesDeObra, rotuloDeObra } from '../lib/obra-destino.mjs'
import { PESTANAS, lectorDeEncabezados, rangoAbierto } from '../lib/columnas-por-encabezado.mjs'
import { procesarCola } from '../comunicacion/compras/cola-obra.mjs'
import { aCsv } from './obra-relleno-dry.mjs'
import {
  ACCION, claveDeCelda, muestraRepartida, parsearCsv, planDeRelleno, resumenDeRelleno, textoDelResumen,
} from '../lib/obra-relleno-aplicar.mjs'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }
const RPC = Object.freeze({ Compras: 'public.compra_obra_asignar', Cobranzas: 'public.cobranza_obra_asignar' })

/** El catálogo vivo: opciones del desplegable, obras vivas con código por cliente canónico, y el resolvedor de cliente. */
async function catalogoVivo() {
  const catalogos = await catalogosDeAsignacion(query)
  const cat = catalogoDeDestinos({ obras: catalogos.canonicas, clienteAlias: catalogos.clienteAlias })
  const obrasVivas = new Map()
  for (const [cliente, os] of cat.vivasPorCliente) {
    obrasVivas.set(cliente, os.filter((o) => /^OB-/i.test(String(o.codigo ?? ''))).map(rotuloDeObra))
  }
  return { opciones: new Set(opcionesDeObra(cat)), obrasVivas, clienteDe: cat.clienteDe }
}

/** Lo que la base ya tiene en `obra_celda`, por celda. Una persona o la app lo escribió: no se pisa. */
async function ocupadasEnLaBase() {
  const ocupada = new Map()
  const c = await query('select fila, obra_celda from public.compra_sheet where obra_celda is not null')
  for (const r of c.rows) ocupada.set(claveDeCelda('Compras', Number(r.fila)), r.obra_celda)
  const b = await query('select sheet_id, obra_celda from public.cobranzas where obra_celda is not null')
  for (const r of b.rows) ocupada.set(claveDeCelda('Cobranzas', Number(r.sheet_id) + PESTANAS.Cobranzas.primeraFila - 1), r.obra_celda)
  return ocupada
}

/** La columna Obra VIVA de cada pestaña, por encabezado. Sin la columna, aborta: no hay dónde escribir. */
async function ocupadasEnElSheet(google, ocupada) {
  const lector = lectorDeEncabezados(google, CASHFLOW_ID)
  const columnas = {}
  for (const pestana of ['Compras', 'Cobranzas']) {
    const { obra } = await lector.columnas(pestana, { obra: { rotulo: 'Obra', opcional: true } })
    if (!obra) throw new Error(`${pestana} no tiene la columna «Obra» en la fila de rótulos: la inserción no está hecha`)
    columnas[pestana] = obra
    const valores = await google.readSheetValues(CASHFLOW_ID, rangoAbierto(pestana, obra))
    valores.forEach((v, i) => {
      const texto = String(v?.[0] ?? '').trim()
      if (texto) ocupada.set(claveDeCelda(pestana, PESTANAS[pestana].primeraFila + i), texto)
    })
  }
  return columnas
}

function leerEntrada(carpeta) {
  const filas = []
  for (const archivo of ['compras.csv', 'cobranzas.csv']) filas.push(...parsearCsv(readFileSync(join(carpeta, archivo), 'utf8')))
  return filas
}

/** El perfil de quien pide: es el `pedido_por` de la cola y el nombre con el que se levanta el freno de mano. */
async function perfilDelActor(nombre) {
  if (!nombre) throw new Error('--aplicar necesita --actor "<nombre exacto del perfil>" (dirección o administración)')
  const r = await query("select id, nombre, rol from public.perfiles where nombre = $1 and rol in ('direccion', 'administracion')", [nombre])
  if (r.rows.length !== 1) throw new Error(`--actor «${nombre}»: ${r.rows.length ? 'más de un' : 'ningún'} perfil de dirección/administración con ese nombre`)
  return r.rows[0]
}

/** UNA fila por la RPC, como la app: con los claims del actor en la transacción, así `auth.uid()` y `es_administracion()` son él. */
async function encolar(d, actor) {
  return withTx(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actor.id, role: 'authenticated' })])
    const r = await c.query(`select ${RPC[d.pestana]}($1, $2, $3) as r`, [d.fila, d.valor, null])
    return r.rows[0].r
  })
}

async function encolarTodo(escritas, actor) {
  const resultado = { ok: 0, error: 0, errores: [] }
  for (const d of escritas) {
    const r = await encolar(d, actor).catch((e) => ({ ok: false, error: `excepción: ${e.message}` }))
    if (r?.ok) resultado.ok += 1
    else { resultado.error += 1; resultado.errores.push({ pestana: d.pestana, fila: d.fila, valor: d.valor, error: r?.error ?? 'sin respuesta' }) }
  }
  return resultado
}

/** LA EVIDENCIA: la base releída por celda, la cola de esta corrida, y 20 celdas por pestaña releídas del Sheet. */
async function verificar(google, escritas, columnas, desde) {
  const base = { Compras: new Map(), Cobranzas: new Map() }
  const c = await query('select fila, obra_celda from public.compra_sheet where fila = any($1::int[])', [escritas.filter((d) => d.pestana === 'Compras').map((d) => d.fila)])
  for (const r of c.rows) base.Compras.set(Number(r.fila), r.obra_celda)
  const b = await query('select sheet_id, obra_celda from public.cobranzas where sheet_id = any($1::text[])', [escritas.filter((d) => d.pestana === 'Cobranzas').map((d) => String(d.id))])
  for (const r of b.rows) base.Cobranzas.set(Number(r.sheet_id) + PESTANAS.Cobranzas.primeraFila - 1, r.obra_celda)
  const enBase = escritas.filter((d) => base[d.pestana].get(d.fila) === d.valor).length
  const cola = (await query('select pestana, estado, count(*)::int n from public.compra_obra_cambio where creado_at >= $1 group by 1, 2 order by 1, 2', [desde])).rows
  const muestra = []
  for (const pestana of ['Compras', 'Cobranzas']) {
    for (const d of muestraRepartida(escritas.filter((x) => x.pestana === pestana), 20)) {
      const celda = `${pestana}!${columnas[pestana].letra}${d.fila}`
      const leido = String((await google.readSheetValues(CASHFLOW_ID, celda))?.[0]?.[0] ?? '').trim()
      muestra.push({ celda, escrito: d.valor, leido, coincide: leido === d.valor })
    }
  }
  return { escritas: escritas.length, enBase, cola, muestra, muestraCoincide: muestra.filter((m) => m.coincide).length }
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const entrada = arg('entrada')
  if (!entrada) throw new Error('falta --entrada <carpeta con compras.csv y cobranzas.csv del dry>')
  const salida = arg('salida') ?? entrada
  mkdirSync(salida, { recursive: true })
  const google = makeGoogleClient({ config: loadConfig(), scopes: aplicar ? WRITE_SCOPES : READONLY_SCOPES })

  const ctx = { ...await catalogoVivo(), ocupada: await ocupadasEnLaBase() }
  const columnas = await ocupadasEnElSheet(google, ctx.ocupada)
  const plan = planDeRelleno(leerEntrada(entrada), ctx)
  const resumen = resumenDeRelleno(plan)
  writeFileSync(join(salida, 'relleno-plan.json'), JSON.stringify({ aplicar, resumen: { ...resumen, noEscritas: resumen.noEscritas.length }, plan }, null, 1))
  const COLS = ['pestana', 'fila', 'id', 'fecha', 'quien', 'j', 'k', 'total', 'confianza', 'via', 'propuesto', 'regla', 'detalle']
  writeFileSync(join(salida, 'relleno-no-escritas.csv'), aCsv(resumen.noEscritas, COLS))
  for (const l of textoDelResumen(resumen)) console.log(l)
  console.log(`plan: ${join(salida, 'relleno-plan.json')} · no escritas: ${join(salida, 'relleno-no-escritas.csv')}`)
  if (!aplicar) { console.log('EN SECO: no se escribió ni la base ni el Sheet. Con --aplicar (desde el árbol principal) se escribe.'); return }

  const actor = await perfilDelActor(arg('actor'))
  const desde = new Date().toISOString()
  const escritas = plan.filter((d) => d.accion === ACCION.ESCRIBIR)
  const encolado = await encolarTodo(escritas, actor)
  console.log(`encoladas por la RPC como ${actor.nombre}: ${encolado.ok} ok · ${encolado.error} con error`)
  for (const e of encolado.errores) console.log(`  ${e.pestana} fila ${e.fila} «${e.valor}»: ${e.error}`)
  const max = Number(arg('max') ?? 1000)
  const cuenta = await procesarCola({ port: { query }, google, max, dry: false })
  console.log(`worker: ${cuenta.aplicado} aplicados · ${cuenta.rechazado} rechazados · ${cuenta.diferido} diferidos · ${cuenta.error} con error`)
  const v = await verificar(google, escritas.filter((d) => !encolado.errores.some((e) => e.pestana === d.pestana && e.fila === d.fila)), columnas, desde)
  writeFileSync(join(salida, 'relleno-verificacion.json'), JSON.stringify({ actor: actor.nombre, desde, encolado, worker: cuenta, ...v }, null, 1))
  console.log(`verificación: ${v.enBase}/${v.escritas} filas releídas en la base con el valor escrito · cola ${JSON.stringify(v.cola)}`)
  console.log(`muestra del Sheet: ${v.muestraCoincide}/${v.muestra.length} celdas releídas coinciden`)
  for (const m of v.muestra.filter((x) => !x.coincide)) console.log(`  ${m.celda}: escrito «${m.escrito}», dice «${m.leido}»`)
  console.log(`evidencia: ${join(salida, 'relleno-verificacion.json')}`)
}

main().catch((e) => { console.error(e.message); process.exitCode = 1 }).finally(() => closePool())
