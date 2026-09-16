// EL COSTO POR OBRA, PROBADO CONTRA LA BASE REAL — con la migración aplicada y deshecha.
//
// ═══ EL DEFECTO QUE ATRAPA (15/09/2026) ═══
//
// `obra_costo_real` unía `costos_obra` con la obra POR TEXTO (`norm_obra(obra_texto) = alias`). Ese
// texto es la columna J del Sheet, que dice el CLIENTE: el alias del cliente barría con las compras
// de TODAS sus obras y las apilaba en la obra madre. Medido sobre la base viva ese día: OB-0003 «LE
// - OBRA GENERAL» mostraba $156.396.267 y OB-0006/0007/0068/0071 mostraban $0 cuando por `obra_id`
// tienen $45.358.573 / $31.845.767 / $18.289.159 / $13.616.888.
//
// El fixture reproduce exactamente eso en chiquito: DOS obras del mismo cliente, cuyas filas dicen
// el MISMO texto en la columna J y tienen `obra_id` distinto. Con la unión por texto, una se lleva
// las dos y la otra queda en cero.
//
// LA MIGRACIÓN SE APLICA ADENTRO DE LA TRANSACCIÓN Y LA TRANSACCIÓN TERMINA EN ROLLBACK. No queda
// una vista, una función ni una fila en la base viva: aplicarla es decisión de quien integra, no de
// un test. Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getPool } from './db.mjs'

const MIGRACION = fileURLToPath(
  new URL('../../supabase/migrations/20260915T2300_costo_por_obra_por_obra_id.sql', import.meta.url),
)

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

// Códigos y filas que no existen en el libro real: la vista agrupa TODA la tabla, así que sin obras
// propias el test estaría midiendo las compras verdaderas de la empresa.
// El CÓDIGO NO SE ELIGE: `obra_codigo_guardia` lo asigna en el insert y pisa lo que se le mande. Se
// lee después — imponerlo era exactamente el tipo de suposición que este test existe para no hacer.
const A = { id: 'zz-costo-obra-a', codigo: null, nombre: 'ZZ - OBRA A' }
const B = { id: 'zz-costo-obra-b', codigo: null, nombre: 'ZZ - OBRA B' }
const CLIENTE = 'ZZ CLIENTE DE PRUEBA'
const F = { enA: 990001, enB: 990002, anulada: 990003, sinObra: 990004 }

test('el costo por obra sale del obra_id de la fila — contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    // El MISMO advisory lock que el resto de los pg-tests que escriben las tablas calientes: sin él,
    // dos tests en paralelo sobre `obra_canonica` se traban entre sí (deadlock del 22/08).
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query(await readFile(MIGRACION, 'utf8'))

    for (const o of [A, B]) {
      await c.query(
        `insert into public.obra_canonica (id, nombre, estado, tipo, cliente_texto)
         values ($1, $2, 'activa', 'obra', $3)`,
        [o.id, o.nombre, CLIENTE],
      )
      o.codigo = (await uno('select codigo from public.obra_canonica where id = $1', [o.id])).codigo
      assert.match(o.codigo, /^OB-\d{4,}$/, 'la obra sembrada no recibió código: el desplegable no la podría nombrar')
    }
    /** Una fila de Compras y su proyección a costos: las dos dicen el mismo texto de cliente.
     *  `area` NO se escribe: la calcula `costos_obra_set_area` desde proveedor/concepto, así que el
     *  concepto es lo que decide si la fila es mano de obra («Sueldos quincena») o no. */
    const sembrar = async ({ fila, obra, total, anulada = false, concepto = 'Cemento' }) => {
      await c.query(
        `insert into public.compra_sheet (fila, sheet_id, clave, proveedor, concepto, obra_texto, total, anulada, destino, obra_id, obra_celda)
         values ($1, null, $2, 'ZZ PROVEEDOR', $3, $4, $5, $6, $7, $8, $9)`,
        [fila, `zz:${fila}`, concepto, CLIENTE, total, anulada, obra ? 'obra' : null, obra?.id ?? null,
          obra ? `${obra.codigo} · ${obra.nombre}` : null],
      )
      await c.query(
        `insert into public.costos_obra (obra_texto, proveedor, concepto, total, origen, referencia_externa, destino, obra_id)
         values ($1, 'ZZ PROVEEDOR', $2, $3, 'compras_sheet', $4, $5, $6)`,
        [CLIENTE, concepto, total, String(fila), obra ? 'obra' : null, obra?.id ?? null],
      )
      await c.query(
        `insert into public.compra_obra_asignada (referencia, fila, sheet_id, cliente, obra_id, via, porque)
         values ($1, $2, null, $3, $4, $5, 'sembrado por el test')`,
        [String(fila), fila, CLIENTE, obra?.id ?? null, obra ? 'obra_de_la_fila' : 'sin_obra'],
      )
    }
    await sembrar({ fila: F.enA, obra: A, total: 100, concepto: 'Sueldos quincena' })
    await sembrar({ fila: F.enB, obra: B, total: 250 })
    await sembrar({ fila: F.anulada, obra: A, total: 9999, anulada: true })
    await sembrar({ fila: F.sinObra, obra: null, total: 777 })

    const costo = async (id) =>
      uno('select n_comprobantes, costo_real::float8 costo, costo_mano_de_obra::float8 mo from public.obra_costo_real where obra_id = $1', [id])

    await t.test('1 · dos obras del mismo cliente, cada una con lo suyo', async () => {
      // Con la unión por texto, las dos filas dicen «ZZ CLIENTE DE PRUEBA» y una obra se llevaría
      // las dos (o las dos quedarían en cero, según qué alias exista). Es el defecto medido.
      assert.equal((await costo(A.id)).costo, 100, 'la obra A dejó de tener sólo lo suyo')
      assert.equal((await costo(B.id)).costo, 250, 'la obra B quedó sin su costo: la imputación volvió al texto del cliente')
      assert.equal((await costo(A.id)).n_comprobantes, 1)
    })

    await t.test('2 · una compra ANULADA no le pesa a la obra', async () => {
      // La fila anulada tiene obra_id y $9.999. Si la vista dejara de mirar `compra_sheet.anulada`,
      // la obra A saltaría a 10.099.
      assert.equal((await costo(A.id)).costo, 100)
    })

    await t.test('3 · lo que no tiene obra elegida no se le cuelga a ninguna', async () => {
      const { rows } = await c.query(
        `select coalesce(sum(costo_real), 0)::float8 t from public.obra_costo_real where obra_id in ($1, $2)`, [A.id, B.id])
      assert.equal(rows[0].t, 350, 'los $777 sin obra terminaron atribuidos a una obra del cliente')
    })

    await t.test('4 · la mano de obra sigue siendo la porción de area=personas', async () => {
      assert.equal(
        (await uno('select area from public.costos_obra where referencia_externa = $1', [String(F.enA)])).area,
        'personas', 'el fixture dejó de tener una fila de mano de obra y el test mediría otra cosa',
      )
      assert.equal((await costo(A.id)).mo, 100)
      assert.equal((await costo(B.id)).mo, 0, 'una obra sin horas dejó de declarar 0 de mano de obra')
    })

    // ═══ LA RPC ESCRIBE LAS TRES CARAS O NINGUNA ═══
    //
    // Hasta el 15/09 sólo escribía `compra_sheet`: el costo por obra y la asignación esperaban al
    // worker y al sync, y mientras tanto Compras y la ficha de la obra decían cosas distintas.
    const admin = await uno("select id from public.perfiles where rol in ('direccion','administracion') limit 1")
    await t.test('5 · elegir la obra desde la app mueve el costo en la misma transacción', { skip: !admin }, async () => {
      // `es_administracion()` mira el perfil de `auth.uid()`, que sale del claim. Se setea LOCAL:
      // muere con la transacción y no toca a nadie más.
      await c.query('set local request.jwt.claims = ' + `'{"sub":"${admin.id}"}'`)
      const r = await uno('select public.compra_obra_asignar($1, $2, $3) r', [F.enB, `${A.codigo} · ${A.nombre}`, `${B.codigo} · ${B.nombre}`])
      assert.equal(r.r.ok, true, `la RPC rechazó el cambio: ${r.r.error}`)
      assert.equal((await costo(A.id)).costo, 350, 'el costo no se movió de obra: `costos_obra` quedó esperando al sync')
      assert.equal((await costo(B.id)).costo, 0)
      const asignada = await uno('select obra_id, via, porque, cliente from public.compra_obra_asignada where referencia = $1', [String(F.enB)])
      assert.equal(asignada.obra_id, A.id, 'la asignación quedó apuntando a la obra vieja')
      assert.equal(asignada.via, 'obra_de_la_fila', 'una obra ELEGIDA quedó marcada como inferida')
      assert.match(asignada.porque, /columna Obra/)
      assert.equal(asignada.cliente, CLIENTE, 'el cliente de la asignación se perdió en el camino')
    })

    await t.test('6 · mandar a estructura deja el cliente en null, como exige el CHECK', { skip: !admin }, async () => {
      // `compra_obra_asignada_cliente_coherente` ata `cliente` a `via`. Si la RPC no tocara el
      // cliente, esta llamada abortaría la transacción entera con un error de constraint.
      const r = await uno('select public.compra_obra_asignar($1, $2, $3) r', [F.enB, 'ES-ADM · Estructura – Administración', `${A.codigo} · ${A.nombre}`])
      assert.equal(r.r.ok, true, `la RPC rechazó la estructura: ${r.r.error}`)
      const a = await uno('select obra_id, via, cliente from public.compra_obra_asignada where referencia = $1', [String(F.enB)])
      assert.deepEqual([a.obra_id, a.via, a.cliente], [null, 'estructura_de_la_fila', null])
      assert.equal((await costo(A.id)).costo, 100, 'lo que se fue a estructura le sigue pesando a la obra')
    })

    await t.test('7 · el control optimista sigue vivo: un `esperado` viejo no pisa nada', { skip: !admin }, async () => {
      const r = await uno('select public.compra_obra_asignar($1, $2, $3) r', [F.enB, `${B.codigo} · ${B.nombre}`, `${A.codigo} · ${A.nombre}`])
      assert.equal(r.r.ok, false)
      assert.match(r.r.error, /cambió mientras la mirabas/)
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
