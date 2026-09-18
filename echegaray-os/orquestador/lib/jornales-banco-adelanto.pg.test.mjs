// LA CORRECCIÓN Y SU REVERSA, CONTRA LA BASE REAL — dentro de una transacción que termina en ROLLBACK.
//
// Lo que se afirma es el COMPORTAMIENTO: que `aplicarQuincena` escribe lo que dice en las columnas que dice, que
// `revertirQuincena` deja cada línea exactamente como estaba, y que una línea tocada por otro después de la
// escritura NO se pisa a ciegas. No se afirma ningún importe ni el veredicto de la evidencia: eso es el estado
// del mundo y cambia con cada carga de JORNALES.
//
// No queda una fila cambiada: todo pasa dentro de `begin … rollback`. Sin base, se salta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { closePool, getPool } from './db.mjs'
import {
  aplicarQuincena, evidenciaBancaria, leerLineas, lineaBloqueada, planDeCorreccion, revertirQuincena,
} from './jornales-banco-adelanto.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const r2 = (n) => Math.round(Number(n) * 100) / 100

test('escenario A: aplicar y revertir dejan la línea como estaba', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params)
  const tx = { query: q }
  try {
    await q('begin')
    await q('select pg_advisory_xact_lock(20260918)')

    const { plan } = await planDeCorreccion(q)
    const objetivo = plan.find((p) => p.lineas.some((l) => !lineaBloqueada(l)))
    if (!objetivo) { t.diagnostic('no hay ninguna quincena sin BANCO con líneas libres: nada que probar'); return }
    const libres = objetivo.lineas.filter((l) => !lineaBloqueada(l))
    const ids = libres.map((l) => l.linea_id)
    const antes = await leerLineas(q, ids)
    assert.equal(antes.length, libres.length)

    await t.test('el plan cruza el bloque con la quincena donde empieza, y sólo líneas con adelanto', () => {
      assert.ok(objetivo.bloque.desde >= objetivo.desde && objetivo.bloque.desde <= objetivo.hasta)
      assert.ok(libres.every((l) => l.planilla_adelanto !== 0))
    })

    await t.test('aplicar escribe el adelanto en ya_transferido_manual y un 0 en adelanto_manual, y guarda el previo', async () => {
      const { reversa, noEscritas } = await aplicarQuincena(tx, { ...objetivo, lineas: libres }, { motivo: 'prueba con rollback' })
      assert.equal(noEscritas.length, 0)
      assert.equal(reversa.lineas.length, libres.length)
      const escrito = await leerLineas(q, ids)
      for (const l of libres) {
        const e = escrito.find((x) => x.linea_id === l.linea_id)
        assert.equal(r2(e.ya_transferido_manual), r2(l.planilla_adelanto))
        assert.equal(r2(e.adelanto_manual), 0)
        const a = antes.find((x) => x.linea_id === l.linea_id)
        const rv = reversa.lineas.find((x) => x.lineaId === l.linea_id)
        assert.deepEqual(rv.previo, { ya_transferido_manual: a.ya_transferido_manual, adelanto_manual: a.adelanto_manual })
      }
      t.diagnostic(`${libres.length} línea(s) de ${objetivo.desde}..${objetivo.hasta} escritas y leídas de vuelta (se deshacen abajo)`)

      // UNA LÍNEA TOCADA DESPUÉS NO SE REVIERTE A CIEGAS.
      await q('update public.liquidacion_linea set adelanto_manual = 1 where id = $1', [ids[0]])
      const { restauradas, noRestauradas } = await revertirQuincena(tx, reversa)
      assert.equal(noRestauradas.length, 1)
      assert.equal(noRestauradas[0].lineaId, ids[0])
      assert.equal(restauradas.length, libres.length - 1)
      const despues = await leerLineas(q, ids)
      for (const a of antes) {
        if (a.linea_id === ids[0]) continue
        const d = despues.find((x) => x.linea_id === a.linea_id)
        assert.deepEqual(
          { y: d.ya_transferido_manual, a: d.adelanto_manual },
          { y: a.ya_transferido_manual, a: a.adelanto_manual },
          `${d.nombre_completo} volvió exactamente a lo previo`)
      }
    })

    await t.test('la evidencia bancaria tiene forma, sin afirmar su veredicto', async () => {
      const ev = await evidenciaBancaria(q, objetivo)
      assert.ok(['si', 'parcial', 'no', 'sin-extracto'].includes(ev.veredicto), ev.veredicto)
      assert.match(ev.ventana.desde, /^\d{4}-\d{2}-\d{2}$/)
    })
  } finally {
    await q('rollback')
    c.release()
    await closePool()
  }
})
