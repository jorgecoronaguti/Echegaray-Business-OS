#!/usr/bin/env node
// EL CONTROL DEL GRAFO DE LA CACHÉ DE LA FICHA — sólo lectura del catálogo vivo.
//
// Recorre lo que HOY lee `pantalla_cliente_en_vivo` / `hh_de_obra_en_vivo` y sale con código 1 si
// una tabla no tiene `trg_ficha_inv` ni está declarada en 20260928T2330. La copia literal del grafo
// en el test envejece con cada migración de vistas; esto no. Existe porque el primer borrador puso
// triggers en las tablas que su autor recordaba y quedaron 16 afuera, dos con plata (28/09).
//
// Una transacción READ ONLY con lock_timeout de 1 s: el 28/09 a las 19:08 un test DDL contra la base
// viva trabó el login 25 minutos; este script no puede escribir ni hacer cola detrás de nadie.
//
// Uso: node orquestador/scripts/verificar-grafo-ficha-cache.mjs [ruta de la migración]
// Salida: 0 cubierto · 1 faltan tablas · 2 no se pudo leer.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getPool } from '../lib/db.mjs'
import { MIGRACION_REL, faltantes, recorrerGrafo, triggersDe } from '../lib/ficha-cache-grafo.mjs'

const SQL_RELACIONES = `
  select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')`
const SQL_FUNCIONES = `
  select p.proname, string_agg(p.prosrc, E'\\n') as src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' group by p.proname`
// Vistas: pg_rewrite → pg_depend es exacto (no depende de cómo esté escrito el texto). Funciones
// SQL con BEGIN ATOMIC: su prosrc viene vacío y sólo pg_depend las ve.
const SQL_DEPENDENCIAS = `
  select case when d.classid = 'pg_rewrite'::regclass then 'r:' || v.relname else 'f:' || fp.proname end as desde,
         case when d.refclassid = 'pg_class'::regclass then 'r:' || t.relname else 'f:' || rp.proname end as hacia
    from pg_depend d
    left join pg_rewrite rw on d.classid = 'pg_rewrite'::regclass and rw.oid = d.objid
    left join pg_class v on v.oid = rw.ev_class
    left join pg_proc fp on d.classid = 'pg_proc'::regclass and fp.oid = d.objid
    left join pg_class t on d.refclassid = 'pg_class'::regclass and t.oid = d.refobjid
    left join pg_proc rp on d.refclassid = 'pg_proc'::regclass and rp.oid = d.refobjid
    left join pg_namespace tn on tn.oid = coalesce(t.relnamespace, rp.pronamespace)
   where d.classid in ('pg_rewrite'::regclass, 'pg_proc'::regclass)
     and d.refclassid in ('pg_class'::regclass, 'pg_proc'::regclass)
     and tn.nspname = 'public'
     and coalesce(v.oid, 0) <> coalesce(t.oid, -1)`

async function leerCatalogo() {
  const pool = getPool()
  const c = await pool.connect()
  try {
    await c.query("begin read only; set local statement_timeout = '30s'; set local lock_timeout = '1s'")
    const relaciones = new Map((await c.query(SQL_RELACIONES)).rows.map((r) => [r.relname, r.relkind]))
    const funciones = new Map((await c.query(SQL_FUNCIONES)).rows.map((r) => [r.proname, r.src]))
    const dependencias = new Map()
    for (const { desde, hacia } of (await c.query(SQL_DEPENDENCIAS)).rows) {
      if (!desde || !hacia) continue
      if (!dependencias.has(desde)) dependencias.set(desde, new Set())
      dependencias.get(desde).add(hacia)
    }
    await c.query('rollback')
    return { relaciones, funciones, dependencias }
  } finally {
    c.release()
    await pool.end()
  }
}

async function main() {
  const ruta = process.argv[2] ?? join(import.meta.dirname, '..', '..', MIGRACION_REL)
  const texto = readFileSync(ruta, 'utf8')
  const { tablas, nodos } = recorrerGrafo(await leerCatalogo())
  const falta = faltantes(tablas, texto)
  const fueraDelGrafo = triggersDe(texto).map((t) => t.tabla).filter((t) => !tablas.has(t))
  console.log(`grafo vivo: ${nodos} vistas/funciones, ${tablas.size} tablas`)
  if (fueraDelGrafo.length) console.log(`con trigger y fuera del grafo (sobra, no rompe): ${fueraDelGrafo.join(', ')}`)
  if (falta.length) {
    console.log(`FALTAN (sin trigger ni declaración): ${falta.join(', ')}`)
    process.exitCode = 1
    return
  }
  console.log('cubierto: toda tabla del grafo tiene trigger o está declarada')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`no se pudo verificar el grafo: ${e.message}`)
    process.exitCode = 2
  })
}
