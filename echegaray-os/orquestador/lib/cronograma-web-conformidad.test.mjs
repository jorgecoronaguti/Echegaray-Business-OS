// LA MISMA REGLA VIVE EN TRES LUGARES. ESTE TEST LOS OBLIGA A DECIR LO MISMO.
//
// `duracionDe` y `hhRestantes` están en `orquestador/lib/cronograma-obra.mjs` (el puente del Work
// Fabric, que lee con el pool de `pg`) y PORTADAS en
// `src/features/obras/services/cronogramaMotor.ts` (el puente de la web, que lee con la sesión del
// usuario y su RLS). La duplicación es deliberada y está argumentada en el encabezado del archivo
// de TypeScript: traer `db.mjs` a un Server Component abriría la lectura de todas las obras con la
// credencial de servicio.
//
// `duracion_dias` y `dotacion_necesaria` están en Postgres —son la fuente canónica— y portadas en
// `src/features/obras/services/dotacion.ts`, porque el stepper de la 08 recalcula seis frentes con
// cada toque y seis RPC por clic convierten una simulación en una espera.
//
// Una duplicación sin guardia se desincroniza el día que alguien toca uno de los dos lados y no se
// entera. Acá se corren las implementaciones contra la MISMA tabla de casos, incluidos los que
// devuelven NULL, que son justamente los que se pierden primero. Si el motor cambia y la copia no,
// esto se pone rojo.
//
// La parte que consulta Postgres se SALTA sin base — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { duracionDe as duracionMotor, hhRestantes as hhMotor } from './cronograma-obra.mjs'
import {
  duracionDe as duracionWeb, hhRestantes as hhWeb,
} from '../../src/features/obras/services/cronogramaMotor.ts'
import { duracionDias, dotacionNecesaria } from '../../src/features/obras/services/dotacion.ts'
import { query } from './db.mjs'

const hayBase = await query('select 1').then(() => true).catch(() => false)

/** Los casos incluyen a propósito los NULL: sin HH, sin capacidad, sin avance, avance sin HH
 *  reales y avance al 100 %. Son los que separan «no sabemos» de «no falta nada». */
const CASOS_ACTIVIDAD = [
  {},
  { hh_plan: 40 },
  { hh_plan: 40, dotacion_prevista: 0 },
  { hh_plan: 40, dotacion_prevista: 4 },
  { hh_plan: 40, dotacion_prevista: 4, capacidad_ponderada: 3.2 },
  { hh_plan: 60, dotacion_prevista: 4, capacidad_ponderada: 3.2 },
  { dias_plan: 5, hh_plan: 400, dotacion_prevista: 1 },
  { dias_plan: 0, hh_plan: 80, dotacion_prevista: 2 },
  { hh_plan: 100, hh_real: 60, avance_pct: 40 },
  { hh_plan: 100, hh_real: 0, avance_pct: 40 },
  { hh_plan: 100, hh_real: 130, avance_pct: 100 },
  { hh_plan: 100, hh_real: 20, avance_pct: 0 },
  { hh_real: 20, avance_pct: 30 },
  { hh_plan: 100, hh_real: 200, avance_pct: 99 },
]

test('duracionDe: el puerto de la web dice lo mismo que el motor del Fabric', () => {
  for (const c of CASOS_ACTIVIDAD) {
    for (const jornada of [8, 9, 6]) {
      assert.equal(duracionWeb(c, jornada), duracionMotor(c, jornada),
        `difieren en ${JSON.stringify(c)} con jornada ${jornada}`)
    }
  }
})

test('hhRestantes: el puerto de la web dice lo mismo que el motor del Fabric, base incluida', () => {
  for (const c of CASOS_ACTIVIDAD) {
    const a = hhWeb(c)
    const b = hhMotor(c)
    // La web agrega una base propia, 'sin base', cuando las HH son null: el motor no la tiene
    // porque no dibuja nada. Lo que tiene que coincidir es el NÚMERO y, cuando hay número, la base.
    assert.equal(a.hh, b.hh, `HH distintas en ${JSON.stringify(c)}`)
    if (a.hh != null) assert.equal(a.base, b.base, `base distinta en ${JSON.stringify(c)}`)
  }
})

const CASOS_DURACION = [
  [null, 4, 8, 0], [80, null, 8, 0], [80, 0, 8, 0], [80, 4, 8, 0], [80, 4, 8, 7],
  [80, 20, 8, 7], [1, 4, 8, 0], [0, 4, 8, 0], [80, 3.2, 8, 0], [100, 4, 9, 2], [100, 4, 0, 0],
]
const CASOS_DOTACION = [
  [null, 5, 8, null], [100, 0, 8, null], [100, null, 8, null], [200, 2, 8, 4], [200, 2, 8, null],
  [200, 7, 8, 4], [200, 7, 8, 3], [1, 30, 8, 4], [0, 5, 8, 4], [100, 4, 0, null],
]

test('duracion_dias: el puerto de TypeScript dice lo mismo que Postgres', { skip: !hayBase && 'sin base' }, async () => {
  for (const [hh, cap, jor, tec] of CASOS_DURACION) {
    const { rows } = await query('select public.duracion_dias($1,$2,$3,$4) as v', [hh, cap, jor, tec])
    const sql = rows[0].v == null ? null : Number(rows[0].v)
    assert.equal(duracionDias(hh, cap, jor, tec), sql, `difieren en (${hh}, ${cap}, ${jor}, ${tec})`)
  }
})

test('dotacion_necesaria: NULL «no alcanza» en los dos lados, y el mismo número donde alcanza', { skip: !hayBase && 'sin base' }, async () => {
  for (const [hh, dias, jor, tope] of CASOS_DOTACION) {
    const { rows } = await query('select public.dotacion_necesaria($1,$2,$3,$4) as v', [hh, dias, jor, tope])
    const sql = rows[0].v == null ? null : Number(rows[0].v)
    assert.equal(dotacionNecesaria(hh, dias, jor, tope), sql, `difieren en (${hh}, ${dias}, ${jor}, ${tope})`)
  }
})
