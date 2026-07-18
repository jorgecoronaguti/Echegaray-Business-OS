#!/usr/bin/env node
// Test de la espera resiliente de DB al arranque. Hermético: ping y sleep inyectados, 0 DB, 0 tiempo real.
import { esErrorConexionTransitorio, esperarDb } from './db-espera.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }
const noSleep = async () => {}

// --- clasificación de errores ---
check('econnrefused por code', esErrorConexionTransitorio({ code: 'ECONNREFUSED' }))
check('econnrefused por mensaje (Supabase pooler)', esErrorConexionTransitorio(new Error('Failed to connect to database: {:error, :econnrefused}')))
check('etimedout transitorio', esErrorConexionTransitorio({ code: 'ETIMEDOUT' }))
check('connection terminated transitorio', esErrorConexionTransitorio(new Error('Connection terminated unexpectedly')))
check('error de negocio NO es transitorio', !esErrorConexionTransitorio(new Error('column "foo" does not exist')))
check('null NO es transitorio', !esErrorConexionTransitorio(null))

// --- reintento hasta éxito ---
let llamadas = 0
const pingFallaLuegoOk = async () => { llamadas++; if (llamadas < 3) throw new Error('econnrefused'); return { db: 'ok' } }
const r = await esperarDb({ ping: pingFallaLuegoOk, esperasMs: [1, 1, 1, 1], sleep: noSleep })
check('reintenta y termina OK', r.db === 'ok' && llamadas === 3)

// --- error NO transitorio: aborta al toque, sin reintentar ---
let llamadas2 = 0
const pingBug = async () => { llamadas2++; throw new Error('relation "x" does not exist') }
let abortoRapido = false
try { await esperarDb({ ping: pingBug, esperasMs: [1, 1, 1], sleep: noSleep }) } catch { abortoRapido = true }
check('bug real aborta sin reintentar', abortoRapido && llamadas2 === 1)

// --- caída prolongada: agota intentos y lanza ---
let llamadas3 = 0
const pingSiempreCae = async () => { llamadas3++; throw new Error('econnrefused') }
let agoto = false
try { await esperarDb({ ping: pingSiempreCae, esperasMs: [1, 1], sleep: noSleep }) } catch { agoto = true }
check('caída real agota intentos y lanza', agoto && llamadas3 === 3) // 1 inicial + 2 reintentos

// --- onRetry avisa cada reintento ---
let avisos = 0
const pingDosFallos = async () => { if (avisos < 2) return Promise.reject(new Error('econnrefused')); return { db: 'ok' } }
// contamos por onRetry, no por avisos; rehacemos con contador propio
let cae = 0
const ping2 = async () => { cae++; if (cae < 3) throw new Error('econnrefused'); return { db: 'ok' } }
let onRetryCount = 0
await esperarDb({ ping: ping2, esperasMs: [1, 1, 1], sleep: noSleep, onRetry: () => onRetryCount++ })
check('onRetry se llama una vez por reintento', onRetryCount === 2)

console.log(`\ndb-espera.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
