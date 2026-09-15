#!/usr/bin/env node
// EL RELLENO DE LA COLUMNA «Obra» (Compras L · Cobranzas H), EN SECO Y SÓLO EN SECO.
//
// Lee Postgres (`compra_sheet`, `compra_obra_asignada`, `cobranzas`, `obra_canonica`, `obra_alias`,
// `cliente_alias`, `cliente_orden`) y deja, por fila de 2026, la obra propuesta con su confianza y la
// lista de ambiguas para el dueño. NO ESCRIBE NADA: ni el Sheet ni la base. No existe un modo de
// escritura y `--escribir` aborta: llenar la columna es decisión del dueño, fila por fila o por
// nivel de confianza, y se hace desde el árbol principal con la columna ya insertada.
//
//   node orquestador/scripts/obra-relleno-dry.mjs --salida <carpeta>
//
// Salida: compras.csv · cobranzas.csv · ambiguas.csv · resumen.json (conteos y los casos del dueño).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { query, closePool } from '../lib/db.mjs'
import { catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { destinosDeObra } from '../lib/comprobantes/obra-y-destino.mjs'
import { normObra } from '../lib/obra-operacion.mjs'
import { numeroCanonico } from '../lib/ordenes-identidad.mjs'
import {
  CONFIANZA, diccionariosDeCobranzas, indiceDePalabras, paraElDueno, propuestaCobranza, propuestaCompra,
} from '../lib/obra-relleno.mjs'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null }

/** Los casos que el dueño nombró el 14/09/2026, para mirarlos primero. */
export const CASOS = Object.freeze([
  ['Gerson Castro «San Francisco»', (x) => /gerson/i.test(x.quien) && /francisco/i.test(x.j)],
  ['MESSINA · Planta de BSA', (x) => /messina/i.test(x.j) && /^planta de bsa/i.test(x.k)],
  ['MESSINA · Bases de Tanque', (x) => /messina/i.test(x.j) && /^bases de tanque/i.test(x.k)],
  ['LA ESTRELLA · Galpon 9', (x) => /estrella/i.test(x.j) && /^galpon 9/i.test(x.k)],
  ['Quattropani - Melisa García SAS · Salones Comerciales', (x) => /quattropani/i.test(x.j) && /salones comerciales/i.test(x.k)],
  ['Administracion · Refaccion Oficina', (x) => /^administracion/i.test(x.j) && /refaccion oficina/i.test(x.k)],
])

const celda = (v) => {
  const s = Array.isArray(v) ? v.join(' | ') : String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const aCsv = (filas, columnas) => [columnas.join(','), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(','))].join('\n') + '\n'

async function leer() {
  const q = async (sql) => (await query(sql)).rows
  const [catalogos, compras, guardadas, cobranzas, ordenes, alias, bolsas, fusion] = await Promise.all([
    catalogosDeAsignacion(query),
    q(`select fila, sheet_id, to_char(fecha,'YYYY-MM-DD') fecha, proveedor, unidad_negocio, obra_texto, detalle_obra, concepto, total::float8 total
         from public.compra_sheet where fecha >= '2026-01-01' order by fila`),
    q('select referencia, obra_id, via from public.compra_obra_asignada'),
    q(`select id, sheet_id, cliente_id, obra_cliente, orden_compra, concepto, total_bruto::float8 total,
              to_char(coalesce(fecha_emision, fecha_venta),'YYYY-MM-DD') fecha
         from public.cobranzas where coalesce(fecha_emision, fecha_venta) >= '2026-01-01' order by sheet_id`),
    q(`select cliente_id, numero, numero_canonico, obra_id from public.cliente_orden
        where tipo = 'orden_compra' and eliminado_en is null and obra_id is not null`),
    q(`select a.alias, a.obra_id, a.en_texto_libre, a.clasificacion, o.cliente_id
         from public.obra_alias a join public.obra_canonica o on o.id = a.obra_id`),
    q(`select alias, obra_id from public.obra_alias where obra_id is not null and clasificacion in ('obra','mantenimiento')`),
    q('select id, fusionada_en from public.obra_canonica'),
  ])
  return { catalogos, compras, guardadas, cobranzas, ordenes, alias, bolsas, fusion }
}

function proponer(d) {
  const destinos = destinosDeObra(d.catalogos)
  const ctx = {
    destinos,
    palabras: indiceDePalabras(d.catalogos, destinos),
    guardadas: new Map(d.guardadas.map((g) => [g.referencia, g])),
    cobranzas: diccionariosDeCobranzas(
      { ordenes: d.ordenes, alias: d.alias, bolsas: d.bolsas, fusion: new Map(d.fusion.map((o) => [o.id, o.fusionada_en ?? o.id])) },
      { normObra, numeroCanonico }),
  }
  const compras = d.compras.map((f) => ({
    pestana: 'Compras', fila: f.fila, id: f.sheet_id, fecha: f.fecha, quien: f.proveedor, unidad: f.unidad_negocio,
    j: f.obra_texto, k: f.detalle_obra, total: f.total, ...propuestaCompra(f, ctx),
  }))
  const cobranzas = d.cobranzas.map((f) => ({
    pestana: 'Cobranzas', fila: null, id: f.sheet_id, fecha: f.fecha, quien: f.obra_cliente, unidad: null,
    j: f.obra_cliente, k: [f.concepto, f.orden_compra].filter(Boolean).join(' · OC '), total: f.total, ...propuestaCobranza(f, ctx),
  }))
  return { compras, cobranzas }
}

function resumir({ compras, cobranzas }) {
  const conteo = (xs) => Object.fromEntries(Object.values(CONFIANZA).map((c) => [c, xs.filter((x) => x.confianza === c).length]))
  const casos = CASOS.map(([nombre, es]) => {
    const filas = [...compras, ...cobranzas].filter((x) => es({ quien: x.quien ?? '', j: x.j ?? '', k: x.k ?? '' }))
    const porPropuesta = {}
    for (const x of filas) {
      const k = `${x.valor ?? '(sin propuesta)'} [${x.confianza}]`
      porPropuesta[k] = (porPropuesta[k] ?? 0) + 1
    }
    return { caso: nombre, filas: filas.length, porPropuesta, ejemplo: filas[0] ?? null }
  })
  return { compras: { filas: compras.length, ...conteo(compras) }, cobranzas: { filas: cobranzas.length, ...conteo(cobranzas) }, casos }
}

const COLUMNAS = ['pestana', 'fila', 'id', 'fecha', 'quien', 'unidad', 'j', 'k', 'total', 'valor', 'obra_id', 'confianza', 'via', 'porque', 'candidatos', 'guardada']

async function main() {
  if (process.argv.includes('--escribir')) {
    console.error('obra-relleno-dry no escribe. Llenar la columna Obra lo decide el dueño, desde el árbol principal.')
    process.exit(2)
  }
  const salida = arg('salida') ?? join(tmpdir(), 'obra-relleno')
  mkdirSync(salida, { recursive: true })
  const r = proponer(await leer())
  const resumen = resumir(r)
  writeFileSync(join(salida, 'compras.csv'), aCsv(r.compras, COLUMNAS))
  writeFileSync(join(salida, 'cobranzas.csv'), aCsv(r.cobranzas, COLUMNAS))
  writeFileSync(join(salida, 'ambiguas.csv'), aCsv([...r.compras, ...r.cobranzas].filter(paraElDueno), COLUMNAS))
  writeFileSync(join(salida, 'propuestas.json'), JSON.stringify(r, null, 1))
  writeFileSync(join(salida, 'resumen.json'), JSON.stringify(resumen, null, 1))
  console.log(JSON.stringify({ salida, compras: resumen.compras, cobranzas: resumen.cobranzas }))
  for (const c of resumen.casos) console.log(`${c.caso}: ${c.filas} fila(s) → ${JSON.stringify(c.porPropuesta)}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => closePool())
}
