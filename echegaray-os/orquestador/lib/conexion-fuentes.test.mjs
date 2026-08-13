// EL DEFECTO QUE ESTE TEST ATRAPA: contestar "no tiene fuente" sobre una pestaña que sí la tiene
// —porque la base la toca un lib importado y no el script— o al revés, declarar una fuente que el
// código no prueba. Las dos respuestas son peores que un hueco declarado.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  importsLocales, evidencias, sqlDelCodigo, tablasDeSQL, sheetsExternos,
  pestanasLeidasEnCodigo, fuentesDeTexto, fuentesDeCadena, resolverRelativo, librosComunes,
} from './conexion-fuentes.mjs'

test('los imports relativos se leen y los de paquete no', () => {
  const src = "import { query } from '../lib/db.mjs'\nimport test from 'node:test'\nimport x from './y.mjs'"
  assert.deepEqual(importsLocales(src), ['../lib/db.mjs', './y.mjs'])
})

test('resolverRelativo sube y baja sin depender del cwd', () => {
  assert.equal(resolverRelativo('/a/b/scripts/x.mjs', '../lib/db.mjs'), '/a/b/lib/db.mjs')
  assert.equal(resolverRelativo('/a/b/lib/x.mjs', './y.mjs'), '/a/b/lib/y.mjs')
})

test('la tabla de Postgres sale del SQL, no de una lista tipeada', () => {
  const sql = sqlDelCodigo('const { rows } = await query(`\n  select cuit, total\n  from comprobantes_arca\n  join public.proveedores p on p.cuit = c.cuit\n`)')
  assert.equal(sql.length, 1)
  assert.deepEqual(tablasDeSQL(sql[0]).sort(), ['comprobantes_arca', 'public.proveedores'])
})

test('un import de JS no se confunde con un FROM de SQL', () => {
  // `from '../lib/db.mjs'` es un import, no una tabla. Sin exigir SELECT en el mismo literal, cada
  // archivo del repo declaraba tablas llamadas "../lib/...".
  assert.deepEqual(sqlDelCodigo("import { query } from '../lib/db.mjs'"), [])
})

test('el subquery no inventa una tabla llamada "select"', () => {
  assert.deepEqual(tablasDeSQL('select * from (select 1) t join saldos s on 1=1'), ['saldos'])
})

test('ARCA se detecta también cuando viene como _ARCA_RAW', () => {
  const f = fuentesDeTexto("const P = '_ARCA_RAW'", 'x.mjs')
  assert.deepEqual(f.map((x) => x.tipo), ['API ARCA'])
  assert.equal(f[0].evidencia[0].linea, 1)
})

test('la palabra suelta no dispara una fuente falsa', () => {
  // "Marca" contiene "arca" y "consulta" contiene "query" sin paréntesis: ninguna prueba nada.
  assert.deepEqual(fuentesDeTexto('// La marca del proveedor y la consulta del dueño', 'x.mjs'), [])
})

test('el otro Sheet se declara con su id, y el propio archivo no cuenta', () => {
  const propio = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
  const src = `const A='${propio}'\nconst B='1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'\nconst C=process.env.ORQ_JORNALES_ID`
  const ids = sheetsExternos(src, propio)
  assert.ok(ids.includes('1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'))
  assert.ok(ids.includes('ORQ_JORNALES_ID'))
  assert.ok(!ids.includes(propio))
})

test('las pestañas que el código lee en JS se ven aunque ninguna fórmula las cite', () => {
  const src = "await g.readSheetValues(ID, 'Compras!A1:AF1000')\nconst r = `Cobranzas!A:Z`"
  assert.deepEqual(pestanasLeidasEnCodigo(src, ['Compras', 'Cobranzas', 'CAJA']), ['Compras', 'Cobranzas'])
})

test('la fuente aparece aunque esté a dos imports de distancia', () => {
  // `obras-pestana.mjs` no toca la base: quien trae los datos es un lib que él importa. Mirar un solo
  // nivel contestaba "no pude determinar la fuente" sobre una pestaña que sí la tiene.
  const archivos = {
    '/o/scripts/x.mjs': "import { datos } from '../lib/medio.mjs'",
    '/o/lib/medio.mjs': "import { query } from '../lib/db.mjs'\nawait query(`select a from public.obras`)",
  }
  const r = fuentesDeCadena((p) => archivos[p] ?? null, '/o/scripts/x.mjs', { tope: 2 })
  const pg = r.fuentes.find((f) => f.tipo === 'Postgres')
  assert.ok(pg, 'la cadena de imports tiene que llegar hasta el lib que consulta la base')
  assert.equal(pg.detalle, 'public.obras')
  assert.deepEqual(pg.archivos, ['/o/lib/medio.mjs'])
})

test('un paso que apunta a un script inexistente se declara, no se ignora', () => {
  const r = fuentesDeCadena(() => null, '/o/scripts/no-esta.mjs')
  assert.deepEqual(r.faltantes, ['/o/scripts/no-esta.mjs'])
  assert.deepEqual(r.fuentes, [])
})

test('los ciclos de import no cuelgan el recorrido', () => {
  const archivos = {
    '/o/a.mjs': "import x from './b.mjs'",
    '/o/b.mjs': "import y from './a.mjs'",
  }
  const r = fuentesDeCadena((p) => archivos[p] ?? null, '/o/a.mjs', { tope: 5 })
  assert.deepEqual(r.archivos.sort(), ['/o/a.mjs', '/o/b.mjs'])
})

test('la misma fuente vista en cuatro libs es UNA fuente', () => {
  const archivos = {
    '/o/a.mjs': "import x from './b.mjs'\nimport y from './c.mjs'",
    '/o/b.mjs': 'await query(`select 1 from t`)',
    '/o/c.mjs': 'await query(`select 1 from t`)',
  }
  const r = fuentesDeCadena((p) => archivos[p] ?? null, '/o/a.mjs')
  assert.equal(r.fuentes.filter((f) => f.tipo === 'Postgres').length, 1)
  assert.deepEqual(r.fuentes.find((f) => f.tipo === 'Postgres').archivos, ['/o/b.mjs', '/o/c.mjs'])
})

test('un nombre largo con guiones NO es un id de Google', () => {
  // Este texto tiene 44 caracteres y estaba citado en un comentario: el mapa declaraba un Sheet
  // externo inexistente para media docena de pestañas. Un id de Google trae mayúsculas y dígitos.
  assert.deepEqual(sheetsExternos('// ver anclar-en-el-ultimo-es-anclar-en-la-posicion'), [])
  assert.deepEqual(sheetsExternos("'1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'"), ['1s0KlEURR5Udi7vvy-BmeqAi83lMRyqSCSsRjpiO5aXk'])
})

test('ORQ_WORKER_ID es un proceso, no una planilla', () => {
  assert.deepEqual(sheetsExternos('process.env.ORQ_WORKER_ID'), [])
  assert.deepEqual(sheetsExternos('process.env.ORQ_JORNALES_SHEET_ID'), ['ORQ_JORNALES_SHEET_ID'])
})

test('el lib que importan muchos generadores es plomería, no la fuente de una pestaña', () => {
  // El defecto medido contra el archivo real: siguiendo los imports hasta el fondo, `google.mjs`
  // —que nombra ARCA, BCRA, Drive y el banco en sus propios comentarios— le daba las cuatro fuentes
  // a las treinta pestañas. Un mapa donde todas tienen todo no distingue nada.
  const scripts = new Map([
    ['/o/scripts/a.mjs', "import g from '../lib/google.mjs'\nimport d from '../lib/obras-datos.mjs'"],
    ['/o/scripts/b.mjs', "import g from '../lib/google.mjs'"],
    ['/o/scripts/c.mjs', "import g from '../lib/google.mjs'"],
  ])
  const comunes = librosComunes(scripts, 3)
  assert.deepEqual([...comunes], ['/o/lib/google.mjs'])
  const archivos = {
    '/o/scripts/a.mjs': "import g from '../lib/google.mjs'\nimport d from '../lib/obras-datos.mjs'",
    '/o/lib/google.mjs': 'const drive = "drive.google.com"; const bcra = 1',
    '/o/lib/obras-datos.mjs': 'await query(`select 1 from public.obras`)',
  }
  const r = fuentesDeCadena((p) => archivos[p] ?? null, '/o/scripts/a.mjs', { omitir: comunes })
  assert.deepEqual(r.fuentes.map((f) => f.tipo), ['Postgres'])
  assert.ok(!r.archivos.includes('/o/lib/google.mjs'), 'la plomería ni siquiera se abre')
})

test('las tablas de Postgres de varios libs se unen en UNA fuente', () => {
  const archivos = {
    '/o/a.mjs': "import x from './b.mjs'\nimport y from './c.mjs'",
    '/o/b.mjs': 'await query(`select 1 from uno`)',
    '/o/c.mjs': 'await query(`select 1 from dos`)',
  }
  const r = fuentesDeCadena((p) => archivos[p] ?? null, '/o/a.mjs')
  const pg = r.fuentes.filter((f) => f.tipo === 'Postgres')
  assert.equal(pg.length, 1)
  assert.equal(pg[0].detalle, 'dos, uno')
})

test('evidencias devuelve la línea literal, no un "sí"', () => {
  const ev = evidencias('uno\ndos bcra tres\ncuatro', /bcra/i)
  assert.deepEqual(ev, [{ linea: 2, texto: 'dos bcra tres' }])
})
