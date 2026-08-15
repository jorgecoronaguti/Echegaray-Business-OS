// EL BORDE DEL REPARADOR: que NO escriba en el Sheet, que relea antes de cada UPDATE, y que el UPDATE
// no pise una entrada que cambió entre el plan y la escritura.
//
// Sin red y sin Postgres: el cliente de Google es un doble que EXPLOTA ante cualquier método que no
// sea leer, que es la única forma de demostrar que no escribe.

import test from 'node:test'
import assert from 'node:assert/strict'
import { planear, aplicar, cuitPorProveedor, ID_CASHFLOW } from './reparar-registro-comprobantes.mjs'
import { EN, RANGO } from '../lib/comprobantes/auditoria.mjs'

/** Una fila del rango `Compras!B4:O`. */
function fila(o = {}) {
  const r = new Array(14).fill('')
  for (const [k, i] of Object.entries(EN)) if (o[k] != null) r[i] = o[k]
  return r
}

const BASE = {
  categoria: 'B', fecha: '31/07/2026', modalidad: 'Pago', tipo: 'F A',
  unidad: 'Civil', obra: 'Administracion', concepto: 'ACERO',
}

/** Compras con una sola fila útil, en el número de fila pedido (fila = índice + 4). */
function comprasCon(n, o) {
  const filas = new Array(n - 4 + 1).fill(null).map(() => fila())
  filas[n - 4] = fila({ ...BASE, ...o })
  return filas
}

function googleQueSoloLee(filas) {
  return new Proxy({}, {
    get(_t, k) {
      if (k === 'readSheetValues') {
        return async (id, rango) => {
          assert.equal(id, ID_CASHFLOW)
          // La pestaña `Proveedores` la puede pedir el armado del alias: se contesta vacía.
          return rango === RANGO ? filas : []
        }
      }
      if (typeof k === 'symbol') return undefined
      throw new Error(`el reparador intentó usar google.${String(k)} — SÓLO puede leer`)
    },
  })
}

/** Un port que sólo sabe contestar el SELECT del registro y anota todo lo que se le pide. */
function portCon(entradas, { alUpdate = () => ({ rowCount: 1 }) } = {}) {
  const queries = []
  return {
    queries,
    query: async (sql, params) => {
      queries.push({ sql, params })
      if (/^\s*select/i.test(sql)) {
        if (/comprobantes_cargados/.test(sql)) return { rows: entradas }
        return { rows: [] }
      }
      return alUpdate(sql, params)
    },
  }
}

const ENTRADA = {
  clave: 'c:30567363372|0036-00025942', cuit: '30567363372', tipo: 'A',
  proveedor: 'Alumetal', numero: '0036-00025942', total: 201494007, fila: 811, hoja: 'Compras',
}

test('el reparador NO escribe una celda: cualquier método de Google que no sea leer explota', async () => {
  const compras = comprasCon(797, { proveedor: 'Alumetal', numero: '0038-00025942', importe: '1.673.700', iva: '341.240', total: '2.014.940,07' })
  const port = portCon([ENTRADA])
  const plan = await planear({ google: googleQueSoloLee(compras), port })
  assert.equal(plan.cambios.length, 1)
  assert.equal(plan.cambios[0].filaReal, 797)
  assert.ok(port.queries.every((q) => /^\s*select/i.test(q.sql)), 'el ENSAYO escribió en Postgres')
})

test('sin --aplicar no se manda un solo UPDATE', async () => {
  const compras = comprasCon(797, { proveedor: 'Alumetal', numero: '0038-00025942', importe: '1.673.700', iva: '341.240', total: '2.014.940,07' })
  const port = portCon([ENTRADA])
  await planear({ google: googleQueSoloLee(compras), port })
  assert.equal(port.queries.filter((q) => /update/i.test(q.sql)).length, 0)
})

test('el UPDATE lleva en el WHERE los valores VIEJOS: no pisa lo que cambió entre el plan y la escritura', async () => {
  const compras = comprasCon(797, { proveedor: 'Alumetal', numero: '0038-00025942', importe: '1.673.700', iva: '341.240', total: '2.014.940,07' })
  const port = portCon([ENTRADA])
  const plan = await planear({ google: googleQueSoloLee(compras), port })
  const r = await aplicar({ port, plan, compras: plan.compras })
  assert.equal(r.aplicados.length, 1)
  const up = port.queries.find((q) => /update/i.test(q.sql))
  assert.match(up.sql, /where clave = \$1/)
  assert.match(up.sql, /fila is not distinct from/)
  assert.match(up.sql, /total is not distinct from/)
  assert.ok(up.params.includes(811), 'el valor viejo de la fila no viaja en el WHERE')
  assert.ok(up.params.includes(797), 'el valor nuevo de la fila no viaja en el SET')
  // La clave NUNCA se toca: es la barrera de deduplicación. Se mira SÓLO el SET —en el WHERE la clave
  // tiene que estar, y es justamente lo que identifica la fila a reparar.
  const set = up.sql.split(/\bset\b/i)[1].split(/\bwhere\b/i)[0]
  assert.ok(!/clave/.test(set), `el UPDATE toca la clave de idempotencia: «${set.trim()}»`)
  assert.deepEqual(set.trim().split(', ').map((s) => s.split(' ')[0]), ['fila', 'numero', 'total'])
})

test('si el UPDATE no afecta ninguna fila, se informa y no se declara aplicado', async () => {
  const compras = comprasCon(797, { proveedor: 'Alumetal', numero: '0038-00025942', importe: '1.673.700', iva: '341.240', total: '2.014.940,07' })
  const port = portCon([ENTRADA], { alUpdate: () => ({ rowCount: 0 }) })
  const plan = await planear({ google: googleQueSoloLee(compras), port })
  const r = await aplicar({ port, plan, compras: plan.compras })
  assert.equal(r.aplicados.length, 0)
  assert.match(r.rechazados[0].motivo, /cambió entre el plan y la escritura/)
})

test('la relectura frena la escritura cuando la celda ya no confirma el comprobante', async () => {
  const compras = comprasCon(797, { proveedor: 'Alumetal', numero: '0038-00025942', importe: '1.673.700', iva: '341.240', total: '2.014.940,07' })
  const port = portCon([ENTRADA])
  const plan = await planear({ google: googleQueSoloLee(compras), port })
  // Entre el plan y la escritura, esa fila pasó a tener otro comprobante.
  const otra = plan.compras.map((c) => (c.fila === 797 ? { ...c, proveedor: 'RSV', numero: '0011-00087469', numeroCrudo: '0011-00087469', total: 67797.51 } : c))
  const portQueExplota = { query: async (sql) => { throw new Error(`intentó escribir: ${sql.slice(0, 40)}`) } }
  const r = await aplicar({ port: portQueExplota, plan, compras: otra })
  assert.equal(r.aplicados.length, 0)
  assert.match(r.rechazados[0].motivo, /la relectura no confirmó/)
})

test('sin registro no se repara a ciegas: se lanza en vez de dar por bueno un registro vacío', async () => {
  const compras = comprasCon(797, { proveedor: 'Alumetal', numero: '0038-00025942', total: '2.014.940,07' })
  await assert.rejects(
    () => planear({ google: googleQueSoloLee(compras), port: null }),
    /no se pudo leer/,
  )
})

test('un nombre con dos CUIT distintos no produce alias: inventar una identidad es peor que no tenerla', async () => {
  // «VILLA DEL PINO» aparece en las fuentes con dos CUIT. Emparejar por el primero que llegue sería
  // afirmar una identidad que nadie afirmó.
  const google = {
    readSheetValues: async () => [
      ['Proveedor', 'CUIT'],
      ['VILLA DEL PINO', '30716304677'],
      ['VILLA DEL PINO', '30714340677'],
      ['Alumetal', '30567363372'],
    ],
  }
  const m = await cuitPorProveedor({ google, port: null })
  assert.equal(m.get('villa del pino'), undefined, 'eligió uno de los dos CUIT')
  assert.equal(m.get('alumetal'), '30567363372')
})

// ── CERO MODELO, TAMBIÉN POR LOS IMPORTS DINÁMICOS ──────────────────────────
//
// `cero-modelo.test.mjs` recorre el árbol de imports ESTÁTICOS, y este camino entra al auditor por
// un `await import(...)` que ese rastreador no sigue. El auditor lo dispara el cierre de cada carga
// de comprobantes, así que un modelo colgado de acá costaría plata en un camino que tiene que ser
// determinístico. Se recorre a mano, dinámicos incluidos.

test('el reparador y todo lo que importa —incluso lo dinámico— no alcanzan a ningún modelo', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const AQUI = path.dirname(fileURLToPath(import.meta.url))

  const vistos = new Set()
  const recorrer = (entrada) => {
    const abs = path.resolve(entrada)
    if (vistos.has(abs) || !fs.existsSync(abs)) return
    vistos.add(abs)
    const src = fs.readFileSync(abs, 'utf8')
    // ESTÁTICOS **Y** DINÁMICOS: es la diferencia con el rastreador de `cero-modelo.test.mjs`.
    for (const re of [/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g, /await import\(\s*['"]([^'"]+)['"]/g]) {
      for (const m of src.matchAll(re)) {
        if (!m[1].startsWith('.')) continue
        recorrer(path.resolve(path.dirname(abs), m[1]))
      }
    }
  }
  recorrer(path.join(AQUI, 'reparar-registro-comprobantes.mjs'))
  recorrer(path.join(AQUI, 'auditar-comprobantes-cargados.mjs'))

  const ofensas = [...vistos].filter((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
    return /api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key/.test(src)
  })
  assert.deepEqual(ofensas.map((f) => path.basename(f)), [],
    `el reparador o el auditor terminaron alcanzando al modelo:\n${ofensas.join('\n')}`)
  assert.ok(vistos.size >= 10, `el rastreador recorrió ${vistos.size} archivos: la prueba sería vacía`)
})
