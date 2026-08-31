// LA DoD LE PREGUNTA A LA BASE POR COLUMNAS QUE TIENEN QUE EXISTIR.
//
// ═══ EL CASO ═══
//
// El criterio #9 filtraba por `s.vigencia_hasta is not null`. Esa columna nunca estuvo en
// `public.subcontrato`. Contra el esquema vivo la consulta devuelve:
//
//     column s.vigencia_hasta does not exist
//
// Y no lo detectó nadie por dos razones que se suman:
//
//   1. La consulta estaba DETRÁS de un `if (total === 0) return`. Con la tabla vacía —que es como
//      está hoy— la función volvía antes de tocarla. El defecto sólo se habría cobrado el día que
//      alguien cargara el primer subcontrato, o sea el día que el criterio importara.
//   2. El `catch` del recolector guardaba `null`, y el dictaminador lee `null` como NO_HUBO_CORRIDA.
//      El cuadro habría dicho «ninguna corrida dejó evidencia» sobre una consulta rota.
//
// Un test contra un `query` de mentira no habría encontrado nada de esto: la mentira no tiene
// esquema. Por eso este test va contra la base — es lo único que puede decir que una columna no
// existe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { medirSubcontratos } from '../../scripts/xsas-dod.mjs'
import { CRITERIOS, evaluar, VEREDICTO, MOTIVO } from './dod.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('la medición de subcontratos de la DoD no nombra ninguna columna que el esquema no tenga', { skip: !hayBase }, async (t) => {
  const query = (sql, params) => getPool().query(sql, params)

  // Corre de verdad contra el esquema vivo. Si alguien reintroduce una columna inventada, esto tira
  // acá y no dentro de un `catch` que lo convierte en «sin ejercitar».
  const evidencia = await medirSubcontratos(query)

  const criterio = CRITERIOS.find((c) => c.mide === 'subcontratos')
  const fila = evaluar(criterio, { subcontratos: evidencia })

  assert.equal(fila.veredicto, VEREDICTO.NO_EJERCITADA,
    'la base no puede contestar la vigencia de un subcontrato: el criterio no puede quedar demostrado')
  assert.equal(fila.motivo, MOTIVO.TERMINO_NO_MEDIBLE,
    'es un límite del instrumento, no una consulta rota ni una corrida que faltó')
  assert.notEqual(fila.motivo, MOTIVO.MEDICION_ROTA, 'la medición reventó contra el esquema')

  t.diagnostic(`#9 subcontratos · ${fila.motivo} · ${fila.porque}`)
})

// ═══ EL NEGATIVO DEL NEGATIVO ═══
//
// El test de arriba pasa si la medición no revienta. Pero «no revienta» también lo cumpliría una
// medición que no consulta nada. Este test prueba que la base SÍ rechaza la columna fantasma — o
// sea, que el control de arriba tiene con qué ponerse rojo.
test('la columna que la DoD nombraba de más NO existe, y la base lo dice', { skip: !hayBase }, async () => {
  await assert.rejects(
    () => getPool().query('select count(*) n from public.subcontrato s where s.vigencia_hasta is not null'),
    /vigencia_hasta/,
    'la columna existe: si alguien la agregó, el criterio #9 ya se puede MEDIR y hay que ir a medirlo',
  )

  // Y la contracara: la columna con la que sí se mide el alcance existe de verdad. Sin este término,
  // el test de arriba lo pasaría una base sin ninguna tabla de subcontratos.
  const { rows } = await getPool().query(`select count(*) n from public.subcontrato s
    where exists (select 1 from public.subcontrato_alcance a where a.subcontrato_id = s.id)`)
  assert.ok(Number.isFinite(Number(rows[0].n)), 'el alcance del subcontrato sí se puede contar')
})
