// EL PRECIO ESCRITO EN TEXTO TAMBIÉN ES PRECIO: el jefe de obra no lo lee por ninguna columna.
//
// `20260918T0910` enmascaró los montos de venta de `obra_economia_cartera` para quien no pasa
// `ve_economia()`, pero `contrato_cita` y `contrato_nota` —texto copiado del contrato, con el precio
// adentro («U$S 63.000 + IVA», «SUB TOTAL 47.590.271,50»)— siguieron saliendo. La auditoría del
// 18/09 las leyó con la sesión real de un jefe en 8 obras. `20260918T1100` las enmascara.
//
// El test no mira columnas sueltas: serializa LA FILA ENTERA que recibe el jefe (de la vista y de
// `obra_economia_rubros`, que la lee) y exige que el precio no aparezca en ningún lado. Una columna
// nueva que vuelva a copiar el texto del contrato lo pone en rojo sin que nadie tenga que acordarse
// de agregarla acá. Corre en una transacción con rollback: la base queda como estaba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const PRECIO = '987.654.321'

test('obra_economia: el jefe de obra no lee el precio escrito en la cita ni en la nota del contrato; dirección sí', { skip: !hayBase }, async () => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params).then((r) => r.rows)
  try {
    await c.query('begin')
    await c.query('select pg_advisory_xact_lock(20260822)')
    const OBRA = 'zz-eco-cita-test'
    await q(`insert into obra_canonica (id, nombre) values ($1, 'ZZ Cita') on conflict (id) do nothing`, [OBRA])
    await q(`insert into obra_economia_sheet (obra_canonica_id, obra_clave, contratado, costo_mo, costo_materiales, margen, origen, origen_fuente, leido_en)
             values ($1, 'zzc', 100, 60, 10, 30, 'oc-pesos', 'test', now())
             on conflict (obra_canonica_id) do update set costo_mo = 60, costo_materiales = 10`, [OBRA])
    await q(`insert into obra_contrato (obra_id, mano_obra, fuente_tipo, fuente_nombre, cita, nota)
             values ($1, 100, 'contrato', 'contrato-zz.pdf', $2, $3)
             on conflict (obra_id) do update set cita = excluded.cita, nota = excluded.nota`,
      [OBRA, `Precio de mano de obra: $ ${PRECIO} + IVA`, `Precio pactado $ ${PRECIO}`])

    const como = async (rol) => {
      const p = (await q(`select id from perfiles where rol = $1 limit 1`, [rol]))[0]
      assert.ok(p, `no hay un perfil con rol ${rol} para probar`)
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: p.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
    }
    const salir = () => c.query('reset role')
    const fila = async (rel) => (await q(`select to_jsonb(e) j from public.${rel} e where obra_canonica_id = $1`, [OBRA]))[0]?.j

    await como('jefe_obra')
    const jefe = await fila('obra_economia_cartera')
    assert.ok(jefe, 'el jefe recibe la fila de la obra (sus costos son su herramienta)')
    assert.equal(jefe.costo_mo, 60, 'el jefe sí ve el costo')
    assert.equal(jefe.contrato_cita, null, 'la cita del contrato trae el precio: el jefe no la lee')
    assert.equal(jefe.contrato_nota, null, 'la nota del contrato trae el precio: el jefe no la lee')
    assert.ok(!JSON.stringify(jefe).includes(PRECIO), `ninguna columna de obra_economia_cartera le dice el precio al jefe: ${JSON.stringify(jefe)}`)
    const rubrosJefe = await fila('obra_economia_rubros')
    assert.ok(!JSON.stringify(rubrosJefe ?? {}).includes(PRECIO), `ninguna columna de obra_economia_rubros le dice el precio al jefe: ${JSON.stringify(rubrosJefe)}`)
    await salir()

    await como('direccion')
    const dir = await fila('obra_economia_cartera')
    assert.equal(dir.contrato_cita, `Precio de mano de obra: $ ${PRECIO} + IVA`, 'dirección lee la cita entera')
    assert.equal(dir.contrato_nota, `Precio pactado $ ${PRECIO}`, 'dirección lee la nota entera')
    assert.equal((await fila('obra_economia_rubros'))?.contrato_cita, `Precio de mano de obra: $ ${PRECIO} + IVA`, 'y la ve también por obra_economia_rubros')
    await salir()
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
