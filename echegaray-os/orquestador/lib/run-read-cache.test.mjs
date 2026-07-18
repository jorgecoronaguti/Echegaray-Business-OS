#!/usr/bin/env node
// Test del caché de lecturas por-corrida (F5). Hermético.
import { crearCacheLecturaPorCorrida } from './run-read-cache.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

const rc = crearCacheLecturaPorCorrida()

// --- detección de tools cacheables ---
check('drive_read es cacheable', rc.cacheable('drive_read'))
check('drive_find/list/tabs cacheables', rc.cacheable('drive_find') && rc.cacheable('drive_list') && rc.cacheable('drive_tabs'))
check('drive_update NO es cacheable (es escritura)', !rc.cacheable('drive_update'))
check('drive_batch_update NO es cacheable', !rc.cacheable('drive_batch_update'))
check('salud_obra NO se cachea acá (no es tool de drive)', !rc.cacheable('salud_obra'))

// --- clave estable por args ---
const kA = rc.key('drive_read', { file_id: 'X', range: 'A1:B2' })
const kA2 = rc.key('drive_read', { file_id: 'X', range: 'A1:B2' })
const kB = rc.key('drive_read', { file_id: 'X', range: 'C1:D2' })
check('misma tool + mismos args ⇒ misma clave', kA === kA2)
check('rango distinto ⇒ clave distinta', kA !== kB)
check('tool distinta ⇒ clave distinta', rc.key('drive_list', { file_id: 'X' }) !== rc.key('drive_read', { file_id: 'X' }))

// --- set/has/get ---
check('no está antes de set', !rc.has(kA))
rc.set(kA, { rows: 5 })
check('has tras set', rc.has(kA))
check('get devuelve lo guardado', rc.get(kA).rows === 5)
check('size = 1', rc.size === 1)

// --- invalidación (tras escritura) ---
rc.invalidar()
check('invalidar limpia todo', !rc.has(kA) && rc.size === 0)

// --- input vacío / undefined no rompe ---
check('key con input undefined no rompe', typeof rc.key('drive_read', undefined) === 'string')

console.log(`\nrun-read-cache.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
