#!/usr/bin/env node
// ENSAYA 20260928T2330 CONTRA UNA RAMA DE SUPABASE CON LA MIGRACIÓN YA APLICADA.
//
//     node orquestador/scripts/ensayar-ficha-cache.mjs '<url postgres de la rama>'
//
// Corre 1a (call en autocommit), 1b (una transacción abierta sobre liquidacion_linea mientras corre
// el call: ninguna espera en pg_locks) y 1c (la lectura da null con marca y la sirve al consumirla).
// ESCRIBE en la base que recibe —marcas, filas del caché, y un cambio en liquidacion_linea que se
// deshace—, por eso se niega si la URL es la de producción o si no puede saber cuál es producción.
//
// Salida: 0 verde · 1 algún ensayo falló · 2 a la base le falta algo para ensayar · 3 se negó · 4 error.
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import '../lib/config.mjs'
import {
  motivoParaNegarse, precondiciones, ensayarCall, ensayarSinEspera, ensayarLectura, fallasDe, PreCondicion,
} from '../lib/ficha-cache-ensayo.mjs'

/** Corre los tres ensayos. `env` es de dónde sale cuál es producción (inyectable para el test). */
export async function ensayar(url, env = process.env) {
  const motivo = motivoParaNegarse(url, env)
  if (motivo) return { codigo: 3, texto: `me niego: ${motivo}` }
  const abrir = async () => {
    const k = new pg.Client({
      connectionString: url, connectionTimeoutMillis: 15_000, query_timeout: 120_000,
      application_name: 'ensayar-ficha-cache',
    })
    await k.connect()
    return k
  }
  const c = await abrir()
  try {
    const pre = await precondiciones(c)
    const call = await ensayarCall(c)
    const sinEspera = await ensayarSinEspera(abrir, pre)
    const lectura = await ensayarLectura(c, pre)
    const fallas = fallasDe({ call, sinEspera, lectura })
    return { codigo: fallas.length ? 1 : 0, texto: JSON.stringify({ call, sinEspera, lectura, fallas }, null, 1) }
  } catch (e) {
    if (e instanceof PreCondicion) return { codigo: 2, texto: `no se pudo ensayar: ${e.message}` }
    throw e
  } finally {
    await c.end().catch(() => {})
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  ensayar(process.argv[2]).then(
    ({ codigo, texto }) => { console.log(texto); process.exit(codigo) },
    (e) => { console.error(`error: ${e.message}`); process.exit(4) })
}
