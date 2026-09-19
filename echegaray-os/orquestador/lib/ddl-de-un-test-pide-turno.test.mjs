// TODO TEST QUE HACE DDL SOBRE LA BASE COMPARTIDA PIDE EL MISMO TURNO.
//
// ═══ QUÉ DEFECTO ATRAPA, MEDIDO EL 12/09/2026 ═══
//
// Diecisiete `*.pg.test.mjs` aplicaban migraciones dentro de su transacción tomando primero
// `pg_advisory_xact_lock(20260822)`: entre ellos se serializaban y nadie se pisaba. Otros once hacían
// exactamente lo mismo SIN tomarlo, y `node --test` corre los archivos en paralelo (uno por core). Un
// `create or replace view` toma ACCESS EXCLUSIVE sobre la vista: mientras uno de los once la tenía
// tomada, los diecisiete esperaban. En la corrida completa de ese día:
//
//   · `rls-obra-no-por-fila.pg.test.mjs`  → «canceling statement due to lock timeout»
//   · `vinculacion-estandar.pg.test.mjs`  → «canceling statement due to statement timeout» en T6100
//   · `pantalla-cliente-rpc.pg.test.mjs`  → 18 MINUTOS para un archivo que tarda 57 segundos solo
//
// Los tres pasaban corriendo solos. Un test que depende de quién más esté corriendo no prueba nada: da
// rojo cuando la máquina está ocupada y verde cuando no, y eso enseña a re-correr la suite hasta que
// salga verde — que es la peor cosa que le puede pasar a un control.
//
// ═══ POR QUÉ ES UN TEST Y NO UNA NOTA EN UN MARKDOWN ═══
//
// Porque el próximo test con DDL lo va a escribir alguien que no leyó esta historia. La regla tiene
// que poder ponerse roja sola.
//
// LO QUE ESTE TEST NO HACE, DECLARADO: no mira el ORDEN de las sentencias (que el turno se pida antes
// del primer DDL). Eso no se lee del fuente sin interpretarlo, y un regex que lo intentara daría
// falsos rojos en cuanto el DDL viva dentro de un helper — que es justo donde lo pusimos para dos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')

/** El turno: un solo número para todo el repo. Dos números serían dos colas que no se ven entre sí. */
const TURNO = 'pg_advisory_xact_lock(20260822)'

/** Los que leen un `.sql` de `supabase/migrations` y lo ejecutan ellos mismos. */
// ═══ LEER UNA MIGRACIÓN NO ES APLICARLA (19/09/2026) ═══
//
// El detector marcaba todo archivo que NOMBRARA la carpeta de migraciones, y dos tests la leen sólo
// para recortarle un fragmento de SQL y compararlo (`costo-directo-invariante`, `costo-cerradas-control`):
// nunca hacen DDL. Ese falso positivo tuvo el control en rojo, y un control que está en rojo por algo
// que no es el defecto que persigue deja de mirarse — que es exactamente lo que pasó.
//
// Ahora se exige la EJECUCIÓN: el texto de la migración pasa por `query(...)`. Un test que vuelva a
// aplicar DDL sin turno sigue cayendo, y el de abajo lo prueba con una mutación.
const DDL_PROPIO = /supabase['"\s,]+['"]migrations/
const APLICA_VAR = /query\(\s*[A-Za-z_$][\w$]*(MIG|SQL|DDL)[\w$]*/i
// El DDL escrito a mano cuenta sólo si va DENTRO de un `query(`: los dos tests que recortan el texto de
// una migración para compararlo nombran «CREATE OR REPLACE FUNCTION» en un `indexOf`, y eso no aplica nada.
const APLICA_DDL = /query\(\s*[`'\"][^`'\"]{0,80}\b(create|alter|drop)\s+(or\s+replace\s+)?(function|table|view|materialized|type|index|policy|schema)/i
const aplica = (src) => APLICA_VAR.test(src) || APLICA_DDL.test(src)

/**
 * Los que DELEGAN el DDL en un helper. El turno lo toma el helper —un solo lugar, heredado por todos
 * sus llamadores y por el que se escriba mañana—, así que es ahí donde hay que exigirlo.
 */
const DELEGAN = {
  aplicarMigracionesDelCircuito: 'lib/circuito-productivo-migraciones.mjs',
  aplicarMigracionesDeVinculacion: 'lib/vinculacion-migraciones.mjs',
}

/**
 * Los que traen SU PROPIA base (`PG_TEST_URL`, un Postgres desechable) no comparten nada con nadie y
 * por eso no necesitan turno: su DDL no puede trabar a otro test. La distinción es la que importa —
 * el problema nunca fue el DDL, fue el DDL COMPARTIDO.
 */
const BASE_PROPIA = /PG_TEST_URL/

function pgTests(dir = RAIZ, salida = []) {
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e)
    if (statSync(ruta).isDirectory()) pgTests(ruta, salida)
    else if (e.endsWith('.pg.test.mjs')) salida.push(ruta)
  }
  return salida
}

const corto = (ruta) => ruta.replace(`${RAIZ}/`, '')

/**
 * EL CÓDIGO SIN LOS COMENTARIOS, Y NO ES UN DETALLE: este mismo control se dio verde falso por su
 * propia explicación. La nota que pusimos arriba del `pg_advisory_xact_lock` en los dos helpers CITA
 * el lock, así que al sacarle la sentencia de verdad el barrido seguía encontrando el texto en la
 * prosa. La mutación lo descubrió; sin ella, este archivo habría quedado siendo una constante.
 */
const sinComentarios = (src) => String(src)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|\s)\/\/.*$/gm, '$1')

test('todo test que aplica migraciones sobre la base compartida pide el turno', () => {
  const archivos = pgTests()
  assert.ok(archivos.length > 40, `sólo ${archivos.length} archivos .pg.test.mjs: el barrido se rompió`)

  const sinTurno = []
  let conDdl = 0
  for (const ruta of archivos) {
    const src = sinComentarios(readFileSync(ruta, 'utf8'))
    if (BASE_PROPIA.test(src)) continue
    const delegados = Object.keys(DELEGAN).filter((fn) => src.includes(fn))
    if ((!DDL_PROPIO.test(src) || !aplica(src)) && !delegados.length) continue
    conDdl += 1
    // El turno puede estar acá o en el helper que aplica por él. Lo que no puede es no estar.
    const donde = [src, ...delegados.map((fn) => sinComentarios(readFileSync(join(RAIZ, DELEGAN[fn]), 'utf8')))]
    if (!donde.some((t) => t.includes(TURNO))) sinTurno.push(corto(ruta))
  }
  // Si esto queda en cero, el barrido dejó de encontrar los tests que hacen DDL y el control se
  // volvió una constante que no puede decir que no.
  // MEDIDO el 19/09/2026 con el detector preciso: 7 tests aplican DDL compartido (antes contaba 15
  // porque sumaba a los que sólo LEEN el archivo de la migración). Por debajo de 5 el barrido se rompió.
  assert.ok(conDdl >= 5, `sólo ${conDdl} tests con DDL compartido: el detector dejó de reconocerlos`)
  assert.deepEqual(sinTurno, [],
    'estos tests aplican migraciones sobre la base compartida sin tomar el turno, así que pueden '
    + `trabar a los demás y ponerse rojos por la carga de la máquina:\n${sinTurno.join('\n')}\n`
    + `Agregá \`await c.query('select ${TURNO}')\` inmediatamente después del \`begin\`.`)
})

test('el turno es UN número en todo el repo: dos colas no se ven entre sí', () => {
  const otros = new Set()
  for (const ruta of pgTests()) {
    for (const m of sinComentarios(readFileSync(ruta, 'utf8')).matchAll(/pg_advisory_xact_lock\((\d+)\)/g)) {
      if (`pg_advisory_xact_lock(${m[1]})` !== TURNO) otros.add(`${corto(ruta)} → ${m[1]}`)
    }
  }
  assert.deepEqual([...otros], [],
    'hay otro número de advisory lock: dos tests con números distintos creen estar serializados y no lo están')
})
