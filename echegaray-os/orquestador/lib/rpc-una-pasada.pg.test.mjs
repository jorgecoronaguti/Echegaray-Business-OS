// LA GUARDA DE LA PASADA ÚNICA — si una RPC de pantalla vuelve a recorrer dos veces su vista cara,
// este test se pone rojo (auditor de cierre, 11/09/2026: «el efecto del trabajo no tenía guarda»).
//
// ═══ POR QUÉ YA NO SE MIDEN BUFFERS (12/09/2026) ═══
//
// Medía `shared hit + read` de `EXPLAIN ANALYZE` contra un techo fijo: 13.500 para `pantalla_clientes`
// y 400 para `campanita_atencion`, «cómodos sobre lo medido tras 20260911T1030 (13.087 / 353) y muy
// por debajo de lo anterior (17.777 / 417)». El problema es el tamaño de esa distancia: entre la
// pasada única y la doble había 36%, y el RUIDO de la medición es del mismo orden. Medido hoy, tres
// corridas seguidas del mismo test sin cambiar una línea:
//
//   · `pantalla_clientes`   12.670 · 12.6xx · 17.682  → la tercera «supera el techo»
//   · `campanita_atencion`      349 ·    699          → el doble, en dos corridas consecutivas
//
// Un control que no puede distinguir su defecto del ruido de la base viva no avisa: enseña a
// re-correr la suite hasta que salga verde. Y además envejece solo: los buffers crecen con las filas,
// así que el techo se rompe por el éxito de la empresa.
//
// ═══ LO QUE SE MIDE AHORA: CUÁNTAS VECES SE RECORRE CADA TABLA ═══
//
// `pg_stat_get_xact_numscans(oid)` cuenta los recorridos de UNA tabla DENTRO de la transacción en
// curso. Es exactamente la magnitud de la que habla el nombre de este test —«una vez por viaje»— y no
// un proxy: una pasada de más sobre la vista cara duplica los recorridos de las tablas que la vista
// lee. Medido tres veces seguidas en la misma sesión, el número no se movió ni una unidad, mientras
// los buffers oscilaban 40%.
//
// ═══ QUÉ TABLAS SE FIJAN, Y POR QUÉ NO TODAS ═══
//
// Sólo las que se recorren UNA VEZ POR LUGAR DE LECTURA: ahí el número es estructural (cuántas veces
// la RPC pide el dato) y no depende de cuántas filas haya. Las que caen del lado interno de un nested
// loop —`obra_canonica` con 216 recorridos, `perfiles` con 291— se mueven con cada obra nueva y no se
// fijan: serían el mismo techo fósil con otro nombre.
//
// LÍMITE DECLARADO: si el planificador cambia de nested loop a hash join (o al revés) por el
// crecimiento de la base, el número de una tabla fijada puede moverse sin que haya una pasada de más.
// El mensaje del rojo lo dice, para que nadie «arregle» la RPC persiguiendo un cambio de plan.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPool } from './db.mjs'

const UID_DIRECCION = 'ede1fa51-517b-4f27-b6d9-09ce8a704aca'

/**
 * Por cada RPC de pantalla, cuántas veces puede recorrer cada tabla en un viaje.
 *
 * Los números son los MEDIDOS el 12/09/2026 tras 20260911T1030, y se comparan con `<=`: una pasada de
 * más los duplica —y se ve—; una mejora del plan que recorra menos no tiene por qué poner rojo un test
 * de pasada única.
 */
const TOPES = {
  pantalla_clientes: {
    // Tres lugares de lectura: la economía del cliente, la cuenta de la obra y lo cobrado por obra.
    // Con la doble pasada eran seis.
    cobranzas: 3,
    clientes: 3,
    cliente_orden: 2,
  },
  campanita_atencion: {
    comprobantes_arca: 2,
    costos_obra: 2,
    obra_alias: 2,
  },
}

async function recorridos(c, tablas) {
  const { rows } = await c.query(
    `select relname, pg_stat_get_xact_numscans(k.oid) as n
       from pg_class k join pg_namespace s on s.oid = k.relnamespace
      where s.nspname = 'public' and k.relname = any($1)`, [tablas])
  return Object.fromEntries(rows.map((r) => [r.relname, Number(r.n)]))
}

test('cada RPC de pantalla recorre su vista cara UNA vez: los recorridos no vuelven a duplicarse', async () => {
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: UID_DIRECCION, role: 'authenticated' })])
    await c.query('set local role authenticated')

    for (const [fn, topes] of Object.entries(TOPES)) {
      const tablas = Object.keys(topes)
      const antes = await recorridos(c, tablas)
      await c.query(`select public.${fn}()`)
      const despues = await recorridos(c, tablas)

      for (const [tabla, tope] of Object.entries(topes)) {
        const n = (despues[tabla] ?? 0) - (antes[tabla] ?? 0)
        // Si una tabla no se recorre NINGUNA vez, el control no midió nada: puede ser que la RPC dejó
        // de leerla (y entonces hay que sacarla de la lista) o que la medición se rompió.
        assert.ok(n > 0,
          `${fn} no recorrió «${tabla}» ni una vez: ¿dejó de leerla, o se rompió la medición?`)
        assert.ok(n <= tope,
          `${fn} recorrió «${tabla}» ${n} veces y el tope es ${tope} — ¿volvió la doble pasada? `
          + 'Si el planificador cambió de nested loop a hash join por el crecimiento de la base, '
          + 'el número puede moverse sin que haya una pasada de más: verificalo en el plan antes de tocar la RPC.')
      }
    }
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
    await getPool().end().catch(() => {})
  }
})
