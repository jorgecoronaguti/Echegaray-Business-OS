import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generar, RUTA } from './generar-migracion-flota.mjs'
import { UNIDADES, sqlUnidadesNombradas } from '../lib/flota-unidades.mjs'

test('la migración está al día con el catálogo', () => {
  // Si alguien agrega una unidad o un alias en flota-unidades.mjs y no regenera, el núcleo y la base
  // pasan a dar costos distintos para la misma unidad. Esto se pone rojo antes de llegar a la base.
  assert.equal(readFileSync(RUTA, 'utf8'), generar(), 'correr: node orquestador/scripts/generar-migracion-flota.mjs')
})

test('el borde de palabra sobrevive a la traducción a SQL', () => {
  // El defecto que este test fija: un alias de PALABRA generado como substring ('%camion%') hace que
  // en Postgres "Camioneta Ford XLS" matchee el camión Mercedes, mientras en JS no. El costo por
  // unidad diría una cosa en el script y otra en la web, y nadie sabría cuál mirar.
  const sql = sqlUnidadesNombradas('concepto')
  for (const u of UNIDADES) {
    for (const a of u.alias) assert.ok(sql.includes(`like '% ${a} %'`), `alias de palabra mal traducido: ${a}`)
    for (const i of u.ids) assert.ok(sql.includes(`like '%${i}%'`), `identificador mal traducido: ${i}`)
  }
})

test('la migración no borra los equipos que ya existen', () => {
  // public.equipos ya tenía 6 vehículos sembrados desde Drive. Un `delete from equipos` o un
  // `drop table` acá borraría el trabajo previo: se engancha por clave y hace upsert.
  const sql = generar()
  assert.ok(!/delete\s+from\s+public\.equipos/i.test(sql))
  assert.ok(!/drop\s+table\s+(if\s+exists\s+)?public\.equipos/i.test(sql))
  assert.ok(/on conflict \(clave\) do update/.test(sql), 'el sembrado tiene que ser idempotente')
})

test('la vista sólo atribuye cuando hay UNA unidad nombrada', () => {
  const sql = generar()
  assert.ok(/array_length\(u\.claves, 1\) = 1 then u\.claves\[1\]/.test(sql))
  assert.ok(/> 1 then 'compartido'/.test(sql), 'la carga compartida se declara, no se reparte')
})

test('toda tabla nueva lleva RLS', () => {
  const sql = generar()
  assert.ok(/alter table public\.equipo_alias enable row level security/.test(sql))
  assert.ok(/create policy equipo_alias_select/.test(sql))
})
