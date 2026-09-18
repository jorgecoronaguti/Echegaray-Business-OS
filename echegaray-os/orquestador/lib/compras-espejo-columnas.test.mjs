// QUE EL UPSERT DEL ESPEJO NO DEJE NINGUNA COLUMNA SIN REFRESCAR.
//
// Desde el 18/09/2026 `sync-compras.mjs` escribe `compra_sheet` con `on conflict (fila) do update`
// en vez de `delete` + `insert`, para que la fila no desaparezca mientras corre. El precio es este:
// una columna viva que el sync no escriba se queda con el valor de la corrida ANTERIOR, pegado a un
// número de fila que puede haber cambiado de compra. Con `delete` + `insert` quedaba un hueco visible;
// con upsert queda el dato de otra compra, que es peor porque nadie lo nota.
//
// Dos redes, y hacen falta las dos:
//   · acá: si alguien agrega la columna por MIGRACIÓN y se olvida de `CAMPOS`, esto se pone rojo antes
//     de que el archivo llegue a la base;
//   · en la corrida: el sync le pregunta a `information_schema` y ABORTA nombrando las columnas, que es
//     lo único que atrapa una columna agregada a mano (una migración en el repo no es una aplicada).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { columnasSinRefrescar, NO_LAS_ESCRIBE_EL_ESPEJO, porQueNoEscribo } from './compras-espejo-columnas.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const SYNC = join(aqui, '../scripts/sync-compras.mjs')
const MIGRACIONES = join(aqui, '../../supabase/migrations')

/** Las listas `CAMPOS` y `CAMPOS_OBRA` tal como las declara el sync. */
function camposDelSync() {
  const src = readFileSync(SYNC, 'utf8')
  const lista = (nombre) => {
    const m = src.match(new RegExp(`const ${nombre} = \\[([\\s\\S]*?)\\]`))
    assert.ok(m, `no encontré ${nombre} en sync-compras.mjs`)
    return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
  }
  return [...lista('CAMPOS'), ...lista('CAMPOS_OBRA')]
}

/** Las columnas de `compra_sheet` que declaran las migraciones: el `create table` y cada `add column`. */
function columnasDeLasMigraciones() {
  const cols = new Set()
  for (const f of readdirSync(MIGRACIONES).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRACIONES, f), 'utf8')
    const crea = sql.match(/create table if not exists public\.compra_sheet\s*\(([\s\S]*?)\n\);/)
    if (crea) {
      for (const linea of crea[1].split('\n')) {
        const m = linea.match(/^\s{2}([a-z_0-9]+)\s+(text|numeric|date|boolean|timestamptz|integer|bigint|jsonb|uuid)\b/)
        if (m) cols.add(m[1])
      }
    }
    for (const m of sql.matchAll(/alter table public\.compra_sheet\s*([\s\S]*?);/g)) {
      for (const a of m[1].matchAll(/add column if not exists ([a-z_0-9]+)/g)) cols.add(a[1])
    }
  }
  return [...cols]
}

test('las migraciones y el sync no se pueden desincronizar: toda columna declarada la refresca el espejo', () => {
  const declaradas = columnasDeLasMigraciones()
  // Si esto baja, el extractor se rompió y el test dejaría de controlar nada.
  assert.ok(declaradas.length >= 40, `sólo encontré ${declaradas.length} columnas en las migraciones: el extractor se rompió`)
  for (const c of ['fila', 'sincronizado_en', 'obra_celda', 'tipo_costo', 'anulada']) {
    assert.ok(declaradas.includes(c), `el extractor perdió «${c}»`)
  }
  const faltan = columnasSinRefrescar(declaradas, camposDelSync())
  assert.deepEqual(faltan, [], porQueNoEscribo(faltan))
})

test('la regla: sobra lo que no está en CAMPOS, y la PK y el sello no cuentan', () => {
  assert.deepEqual(columnasSinRefrescar(['fila', 'proveedor', 'sincronizado_en'], ['proveedor']), [])
  assert.deepEqual(columnasSinRefrescar(['fila', 'proveedor', 'nueva'], ['proveedor']), ['nueva'])
  assert.deepEqual(NO_LAS_ESCRIBE_EL_ESPEJO, ['fila', 'sincronizado_en'])
  // Sin columnas vivas no se inventa un veredicto tranquilizador: no hay nada que revisar.
  assert.deepEqual(columnasSinRefrescar([], ['proveedor']), [])
})

test('el mensaje del freno nombra las columnas: sin los nombres nadie sabe qué agregar', () => {
  const m = porQueNoEscribo(['tipo_costo', 'nueva'])
  assert.match(m, /tipo_costo, nueva/)
  assert.match(m, /CAMPOS/)
  assert.match(m, /NO toco nada/)
})

test('el sync tiene el freno cableado y aborta: sin esto la regla existiría y no la miraría nadie', () => {
  const src = readFileSync(SYNC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.match(src, /columnasSinRefrescar\(\s*await columnasVivasDeCompraSheet\(query\), obraPorFila \? \[\.\.\.CAMPOS, \.\.\.CAMPOS_OBRA\] : CAMPOS\)/)
  assert.match(src, /if \(sinRefrescar\.length\) \{[\s\S]*?porQueNoEscribo\(sinRefrescar\)[\s\S]*?process\.exit\(1\)/)
  // Y el upsert que hace falta frenar: si vuelve el `delete` + `insert`, esto avisa que el freno sobra.
  assert.match(src, /on conflict \(fila\) do update set/)
})
