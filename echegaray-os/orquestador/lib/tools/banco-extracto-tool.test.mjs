// EL EXTRACTO POR XSAS. Cada test prueba una de las tres reglas del módulo: revertirla pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { importarExtracto } from './banco-extracto-tool.mjs'

const CSV = [
  'Fecha;Suc. Origen;Desc. Sucursal;Cod. Operativo;Referencia;Concepto;Importe;Saldo',
  '02/09/2026;0179;San Juan;3043;000000400;Echeq clearing recibido 48hs;(100.000,00);5.607.239,01',
  '01/09/2026;0179;San Juan;4633;000000999;Impuesto ley 25.413 debito 0,6%;(7.239,01);5.707.239,01',
].join('\n')

const dobles = () => {
  const inserts = []
  const scripts = []
  return {
    inserts, scripts,
    query: async (sql, params) => {
      if (/insert/i.test(sql)) { inserts.push(params); return { rows: [{ id: inserts.length }] } }
      if (/max|count/i.test(sql)) return { rows: [{ total: 2, hasta: '2026-09-02', mx: '2026-09-02' }] }
      return { rows: [] }
    },
    ejecutar: async (script, argv, motivo) => { scripts.push({ script, motivo }); return { stdout: 'ok: escrito' } },
  }
}

test('REGLA 1: si la cadena de saldos no cierra, NO se escribe NADA — ni base, ni Sheet', async () => {
  const d = dobles()
  const roto = CSV.replace('5.607.239,01', '9.999.999,99')
  const r = await importarExtracto({ contenido: roto, nombre: 'roto.csv' }, d)
  assert.equal(r.ok, false)
  assert.match(r.error, /cadena de saldos NO cierra/)
  assert.ok(r.cortes.length, 'el corte exacto se informa, no se esconde')
  assert.equal(d.inserts.length, 0, 'escribió la base con la cadena rota')
  assert.equal(d.scripts.length, 0, 'tocó el Sheet con la cadena rota')
})

test('REGLA 2: el Sheet se toca con MOTIVO — el freno se levanta por operación, nunca borrando la marca', async () => {
  const d = dobles()
  const r = await importarExtracto({ contenido: CSV, nombre: 'extracto.csv' }, d)
  assert.equal(r.ok, true)
  assert.equal(r.nuevos, 2)
  assert.deepEqual(d.scripts.map((s) => s.script), ['banco-raw-pestana.mjs', 'cheques-emitidos-sync-banco.mjs'])
  for (const s of d.scripts) {
    assert.match(s.motivo, /extracto "extracto\.csv" verificado/, 'el motivo tiene que nombrar la operación')
  }
})

test('si la réplica del Sheet FALLA, la base queda cargada y el pendiente se DECLARA — no se miente el paso', async () => {
  const d = dobles()
  d.ejecutar = async () => { throw new Error('el freno está puesto y el motivo no alcanzó') }
  const r = await importarExtracto({ contenido: CSV, nombre: 'e.csv' }, d)
  assert.equal(r.ok, true, 'la carga a la base es válida aunque el Sheet no se haya podido tocar')
  assert.ok(d.inserts.length > 0)
  assert.equal(r.sheet.replicado, false)
  assert.match(r.sheet.pendiente, /_BANCO_RAW no corrió/)
  assert.match(r.resumen_texto, /PENDIENTE/)
})

test('el ensayo informa y NO escribe — es el --dry de la tool', async () => {
  const d = dobles()
  const r = await importarExtracto({ contenido: CSV, ensayo: true }, d)
  assert.equal(r.ok, true)
  assert.equal(r.ensayo, true)
  assert.equal(d.inserts.length, 0)
  assert.equal(d.scripts.length, 0)
})

test('REGLA 3: este módulo no llega a ningún cliente de IA — cero modelo por construcción', async () => {
  const { readFile } = await import('node:fs/promises')
  const fuente = await readFile(new URL('./banco-extracto-tool.mjs', import.meta.url), 'utf8')
  assert.ok(!/ia\/cliente|anthropic|pedirTexto/i.test(fuente), 'el importador de extractos importó un cliente de IA')
})
