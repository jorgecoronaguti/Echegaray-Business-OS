// El rescate de «Qué hacer» antes de que el pipeline toque la columna: guarda lo escrito a mano, frena
// cuando no puede, y deja visible lo retenido. Con dobles de Google y de la base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { antesDeEscribirLaColumna, registrarRetenidos, rescatarNotas } from './proveedores-notas-rescate.mjs'
import { getPool, closePool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const F = (n) => `=IF($A${n}="";"";IFERROR(VLOOKUP($A${n};_PROVEEDORES_OS!$A:$C;3;FALSE);""))`

/** Un Flujo de Caja en memoria que anota, en orden, cada lectura y escritura que importa. */
function google(proveedores, dDe = () => null, { aux = [['Proveedor', 'CUIT', 'Qué hacer'], ['Robles', '', 'vieja']], eventos = [], moverA = null, noAterriza = false } = {}) {
  const auxF = aux.map((f) => [...f])
  const hoja = (render) => {
    const filas = Array.from({ length: 24 }, () => [])
    filas[13] = ['1 · QUÉ SE DEBE Y CUÁNDO']; filas[15] = ['control']
    filas[16] = ['Proveedor', 'Se le debe', 'Primer vencimiento', 'Qué hacer']
    for (let n = 18; n <= 22; n++) {
      const p = proveedores[n - 18] ?? ''
      const f = dDe(p, n) ?? F(n)
      filas[n - 1] = [p, p ? '1' : '', '', render === 'FORMULA' ? f : (f.startsWith('=') ? '' : f)]
    }
    filas[22] = ['1.1 · CADA OPERACIÓN']; filas[23] = ['2 · QUÉ SALE CADA DÍA']
    return filas
  }
  return {
    eventos, auxF,
    readSheetValues: async (_id, r, { render } = {}) => {
      if (r === 'Proveedores!A1:R220') return hoja(render)
      if (r.endsWith('A1:C600')) return auxF
      let m = r.match(/!A(\d+):C\d+$/)
      if (m) { eventos.push(`releer A${m[1]}`); if (moverA) moverA(auxF); return [auxF[Number(m[1]) - 1] ?? []] }
      m = r.match(/!C(\d+)$/)
      if (m) { eventos.push(`releer C${m[1]}`); return [[auxF[Number(m[1]) - 1]?.[2] ?? '']] }
      throw new Error('rango ' + r)
    },
    getSheetMeta: async () => [{ title: '_PROVEEDORES_OS', sheetId: 9 }],
    spreadsheetBatchUpdate: async (_id, reqs, { espejo }) => {
      assert.equal(espejo, true)
      for (const q of reqs) {
        const u = q.updateCells; const fila = u.range.startRowIndex; const col = u.range.startColumnIndex
        const v = u.rows[0].values[0].userEnteredValue?.stringValue ?? ''
        eventos.push(`escribir ${col === 0 ? 'A' : 'C'}${fila + 1}=${v}`)
        if (!noAterriza) { const f = (auxF[fila] ??= ['', '', '']); f[col] = v }
      }
      return {}
    },
  }
}

function base(notas = [], { falla = false, cola = true, eventos = null } = {}) {
  const sentencias = []
  return {
    sentencias,
    query: async (sql, params) => {
      sentencias.push({ sql, params })
      if (/insert into public\.proveedor_notas/.test(sql)) eventos?.push('guardar base')
      if (falla && /insert into public\.proveedor_notas/.test(sql)) throw new Error('conexión caída')
      if (sql.includes('select proveedor, clave, nota, escrita_en')) return { rows: notas.map(([clave, nota]) => ({ proveedor: clave, clave, nota, escrita_en: null })) }
      if (sql.includes('to_regclass')) return { rows: [{ hay: cola }] }
      if (sql.includes('insert into public.proveedor_nota_cambio')) return { rows: [{ id: 'c1' }] }
      return { rows: [] }
    },
  }
}
const anteriorConFormulas = (proveedores) => new Map(proveedores.map((p, i) => [18 + i, { clave: p.toLowerCase(), tipo: 'formula', texto: '' }]))

test('el texto a mano se guarda en la base ANTES de que el pipeline escriba', async () => {
  const db = base()
  await antesDeEscribirLaColumna({ google: google(['Hormiserv', 'Robles'], (p) => (p === 'Robles' ? 'cheque a 30' : null)), fileId: 'x', query: db.query, anterior: null })
  const g = db.sentencias.find((s) => s.sql.includes('insert into public.proveedor_notas'))
  assert.deepEqual(g.params.slice(1), ['Robles', 'robles', 'cheque a 30'])
})

test('si no puede guardar, FRENA: el pipeline no llega a escribir', async () => {
  const db = base([], { falla: true })
  await assert.rejects(antesDeEscribirLaColumna({ google: google(['Robles'], (p) => (p ? 'cheque a 30' : null)), fileId: 'x', query: db.query, anterior: null }), /conexión caída/)
})

test('más de dos borrados a la vez: frena y deja constancia visible (origen sheet)', async () => {
  const provs = ['A1', 'B2', 'C3']
  const db = base([['a1', 'x'], ['b2', 'y'], ['c3', 'z']])
  await assert.rejects(
    antesDeEscribirLaColumna({ google: google(provs, (p) => (p ? '' : null)), fileId: 'x', query: db.query, anterior: anteriorConFormulas(provs) }),
    /3 notas borradas a la vez/)
  const constancias = db.sentencias.filter((s) => s.sql.includes('insert into public.proveedor_nota_cambio'))
  assert.equal(constancias.length, 3)
  assert.match(constancias[0].sql, /'rechazado', \$4, 'sheet'/)
  assert.equal(db.sentencias.some((s) => s.sql.includes('delete from public.proveedor_notas')), false, 'no borra ninguna')
})

test('bloque sin fórmulas y con textos a mano: frena (no se sabe de quién son)', async () => {
  const db = base()
  await assert.rejects(antesDeEscribirLaColumna({ google: google(['Hormiserv'], (p) => (p ? 'algo' : '')), fileId: 'x', query: db.query, anterior: null }), /no sé de quién son/)
})

test('la sonda en seco no escribe la base', async () => {
  const db = base()
  const r = await rescatarNotas({ google: google(['Robles'], (p) => (p === 'Robles' ? 'cheque' : null)), fileId: 'x', query: db.query, anterior: null, escribir: false })
  assert.equal(r.guardar.length, 1)
  assert.equal(db.sentencias.some((s) => /insert|delete/.test(s.sql)), false)
})

test('los dos escritores del pipeline rescatan ANTES de su primera escritura', () => {
  for (const script of ['proveedores-dos-cuadros.mjs', 'proveedores-notas-visibles.mjs']) {
    const fuente = readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8')
    const main = fuente.slice(fuente.indexOf('async function main('))
    const rescate = main.indexOf('await antesDeEscribirLaColumna(')
    const escritura = main.search(/\.(spreadsheetBatchUpdate|batchUpdateValues|updateValues)\(/)
    assert.ok(rescate > 0, `${script} no rescata «Qué hacer»`)
    assert.ok(escritura < 0 || rescate < escritura, `${script} escribe antes de rescatar`)
  }
})

test('R1 · EL ORDEN: guardar en la base → releer la A → escribir la C de la auxiliar → releerla, antes de volver al pipeline', async () => {
  const eventos = []
  const g = google(['Hormiserv', 'Robles'], (p) => (p === 'Robles' ? 'cheque a 30' : null), { eventos })
  await antesDeEscribirLaColumna({ google: g, fileId: 'x', query: base([], { eventos }).query, anterior: null })
  assert.deepEqual(eventos, ['guardar base', 'releer A2', 'escribir C2=cheque a 30', 'releer C2'])
  assert.equal(g.auxF[1][2], 'cheque a 30', 'la fórmula repuesta va a mostrar la nota nueva')
})

test('R1 · proveedor sin fila en la auxiliar: se agrega en la primera vacía (A y C)', async () => {
  const eventos = []
  const g = google(['Nuevo SRL'], (p) => (p === 'Nuevo SRL' ? 'pedir CUIT' : null), { eventos, aux: [['Proveedor', 'CUIT', 'Qué hacer'], ['Robles', '', 'x'], ['', '', '']] })
  await antesDeEscribirLaColumna({ google: g, fileId: 'x', query: base().query, anterior: null })
  assert.deepEqual(g.auxF[2], ['Nuevo SRL', '', 'pedir CUIT'])
})

test('R1 · la fila de la auxiliar se movió antes de escribir: FRENA y no escribe', async () => {
  const eventos = []
  const g = google(['Robles'], (p) => (p === 'Robles' ? 'cheque a 30' : null), { eventos, moverA: (a) => { a[1] = ['Otro', '', 'y'] } })
  await assert.rejects(antesDeEscribirLaColumna({ google: g, fileId: 'x', query: base().query, anterior: null }), /ahora es de «Otro»/)
  assert.equal(eventos.some((e) => e.startsWith('escribir')), false)
})

test('R1 · la escritura en la auxiliar no aterrizó: FRENA', async () => {
  const g = google(['Robles'], (p) => (p === 'Robles' ? 'cheque a 30' : null), { noAterriza: true })
  await assert.rejects(antesDeEscribirLaColumna({ google: g, fileId: 'x', query: base().query, anterior: null }), /no_aterrizo/)
})

test('la constancia de un borrado retenido es UNA por proveedor mientras la nota no cambie (Postgres real, se deshace)', { skip: !hayBase && 'sin base' }, async () => {
  // La sonda corre cada minuto: sin el `where not exists`, cada vuelta agregaría otra constancia.
  const c = await getPool().connect()
  try {
    await c.query('begin')
    await c.query("set local lock_timeout = '2s'")
    const { rows: [{ hay }] } = await c.query("select to_regclass('public.proveedor_nota_cambio') is not null as hay")
    const mig = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8')
    if (!hay) { await c.query(mig('20260917T1400_proveedor_notas_rls_y_aviso.sql')); await c.query(mig('20260917T1410_proveedor_nota_cambio.sql')) }
    await c.query("insert into public.proveedor_notas (file_id, proveedor, clave, nota) values ('ensayo', 'ZZ Retenido', 'zz retenido', 'x')")
    const q = (sql, p) => c.query(sql, p)
    const enBase = new Map([['zz retenido', { proveedor: 'ZZ Retenido', nota: 'x' }]])
    assert.equal(await registrarRetenidos({ query: q, retenidos: ['zz retenido'], enBase }), 1)
    assert.equal(await registrarRetenidos({ query: q, retenidos: ['zz retenido'], enBase }), 0, 'la segunda vuelta no duplica')
    const { rows: [{ n }] } = await c.query("select count(*)::int n from public.proveedor_nota_cambio where clave = 'zz retenido' and origen = 'sheet' and estado = 'rechazado'")
    assert.equal(n, 1)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})

test.after(async () => { await closePool().catch(() => {}) })
