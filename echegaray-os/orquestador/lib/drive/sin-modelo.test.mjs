// LA CAPACIDAD DE DRIVE NO LLAMA A NINGÚN MODELO. NUNCA. NI COMO ÚLTIMO RECURSO.
//
// Es EL criterio del trabajo —«si Claude desaparece mañana, XSAS sigue manejando Drive»— y hasta
// ahora era una afirmación en un documento. Una afirmación sin guardia ejecutable no está
// pendiente: está incumplida. Esto se pone en rojo el día que alguien enchufe una llamada,
// aunque sea "sólo para interpretar un pedido raro".
//
//   1  · ningún import, estático NI dinámico, llega a un cliente de modelo
//   1b · ni hay un fetch a la API armado a mano
//   2  · el ciclo COMPLETO —buscar, crear, renombrar, mover, copiar, archivar, exportar— corre
//        contra un Drive falso, y los únicos hosts contactados son de Google
//   3  · con la credencial del modelo NEUTRALIZADA, el ciclo entero funciona igual
//
// ── LA TRAMPA QUE HAY QUE ESQUIVAR (la descubrieron las otras lanes) ────────────────────
// `lib/config.mjs` hidrata `~/.config/echegaray-orq/anthropic.env` dentro de `process.env` al
// importarse. Borrar `ANTHROPIC_API_KEY` y después importar cualquier cosa que toque la
// configuración LA REVIVE, y el test daría verde probando nada. Por eso: se neutraliza
// `ORQ_ANTHROPIC_ENV_FILE` ANTES de importar nada (imports dinámicos, no estáticos), y lo que se
// mide es LA LLAVE VIVA AL TERMINAR, no la que se borró al empezar.
// `ORQ_ENV_FILE` NO se toca: ahí vive DATABASE_URL.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/** Lo que jamás puede aparecer en el árbol de imports de la capacidad.
 *  Los nombres no alcanzan —en este repo los módulos que de verdad llaman a Anthropic se llaman
 *  `razonar-ruteo.mjs` e `interpretar.mjs`— y por eso además está la prueba 1b. */
const PROHIBIDO = [
  /anthropic/i, /claude-cli/i, /\breasoner\b/i, /razona/i, /razonador/i, /\bllm\b/i, /openai/i,
  /interpretar\.mjs$/i, /modelo\.mjs$/i,
]

/** Sigue los imports relativos hasta el fondo. Sigue TAMBIÉN los dinámicos: `lectura.mjs` carga
 *  el buscador con `await import(...)`, y un rastreador que sólo mirara los estáticos daría
 *  verde con la llamada escondida ahí. */
function arbolDeImports(entrada, vistos = new Set()) {
  const abs = path.resolve(entrada)
  if (vistos.has(abs) || !fs.existsSync(abs)) return vistos
  vistos.add(abs)
  const src = fs.readFileSync(abs, 'utf8')
  const specs = [
    ...src.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g),
    ...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ]
  for (const m of specs) {
    if (!m[1].startsWith('.')) continue
    arbolDeImports(path.resolve(path.dirname(abs), m[1]), vistos)
  }
  return vistos
}

const ENTRADAS = [
  'index.mjs', 'lectura.mjs', 'escritura.mjs', 'referencia.mjs', 'errores.mjs', 'auditoria.mjs',
].map((f) => path.join(AQUI, f)).concat([
  path.resolve(AQUI, '../tools/drive.mjs'),
  path.resolve(AQUI, '../tools/drive-write.mjs'),
  path.resolve(AQUI, '../tools/drive-cara.mjs'),
])

function modulosAlcanzados() {
  const todos = new Set()
  for (const e of ENTRADAS) for (const m of arbolDeImports(e)) todos.add(m)
  return todos
}

test('1 · el árbol de imports de la capacidad no toca ningún modelo', () => {
  const modulos = modulosAlcanzados()
  const sospechosos = [...modulos].filter((f) => PROHIBIDO.some((re) => re.test(f)))
  assert.deepEqual(sospechosos, [], `la capacidad terminó importando:\n${sospechosos.join('\n')}`)
  assert.ok(modulos.size >= 10, `el rastreador recorrió ${modulos.size} módulos: la prueba sería vacía`)
})

/**
 * Saca los comentarios de línea SIN comerse las URL.
 *
 * La versión anterior era `replace(/\/\/.*$/gm, '')` y trataba el `//` de `https://` como el
 * arranque de un comentario: de `fetch('https://api.anthropic.com/v1/messages', {'x-api-key':k})`
 * dejaba `const r = await fetch('https:` — es decir, BORRABA EXACTAMENTE EL DOMINIO Y EL HEADER QUE
 * BUSCABA. La guardia daba verde con una llamada a Anthropic escrita en el archivo.
 *
 * Un `//` sólo abre comentario si no viene pegado a los dos puntos de un esquema.
 */
export function sinComentarios(src) {
  return String(src).replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const HUELLA_DE_MODELO = /api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key|api\.openai\.com/

test('1b · y tampoco hay un fetch a la API armado a mano', () => {
  // LA GUARDIA DE LA GUARDIA, primero: si el limpiador se come la URL, el resto del test es
  // decorativo y nadie se entera. Se prueba con la línea exacta que tiene que poder ver.
  const espia = `  const r = await fetch('https://api.anthropic.com/v1/messages', { headers: { 'x-api-key': k } })`
  assert.match(sinComentarios(espia), /api\.anthropic\.com/,
    'el limpiador de comentarios se está comiendo la URL que este test existe para encontrar')
  assert.ok(HUELLA_DE_MODELO.test(sinComentarios(espia)), 'el patrón no reconoce una llamada armada a mano')
  assert.equal(sinComentarios('const a = 1 // api.anthropic.com'), 'const a = 1 ',
    'un comentario de verdad sí se saca: si no, cualquier nota al margen daría falso positivo')

  const ofensas = []
  for (const f of modulosAlcanzados()) {
    if (!f.includes(`${path.sep}drive${path.sep}`) && !f.includes(`${path.sep}tools${path.sep}drive`)) continue
    if (f.endsWith('sin-modelo.test.mjs')) continue   // este archivo NOMBRA el patrón a propósito
    if (HUELLA_DE_MODELO.test(sinComentarios(fs.readFileSync(f, 'utf8')))) ofensas.push(f)
  }
  assert.deepEqual(ofensas, [], `hay una llamada a la API armada acá:\n${ofensas.join('\n')}`)
})

// ── El ciclo completo, en ejecución, sin credencial de modelo ─────────────────

/** Drive de mentira servido por `fetchImpl`: pasa por `google.mjs` entero, con su URL, su
 *  paginado y su manejo de errores. Registra cada host contactado. */
function drivePorFetch(hosts) {
  const archivos = new Map()
  let n = 0
  const meta = (a) => ({ ...a })
  return async (url, opts = {}) => {
    hosts.push(new URL(url).host)
    const u = new URL(url)
    const metodo = (opts.method || 'GET').toUpperCase()
    const cuerpo = opts.body && typeof opts.body === 'string' && opts.body.startsWith('{') ? JSON.parse(opts.body) : {}
    const ok = (j) => ({ ok: true, status: 200, async json() { return j }, async text() { return JSON.stringify(j) }, async arrayBuffer() { return Buffer.from('%PDF-1.4 falso') } })
    const id = /\/files\/([^/?]+)/.exec(u.pathname)?.[1]

    if (u.pathname.endsWith('/copy')) {
      const nid = `c${++n}`; const src = archivos.get(id)
      archivos.set(nid, { ...src, id: nid, name: cuerpo.name ?? src.name, parents: cuerpo.parents ?? src.parents })
      return ok(meta(archivos.get(nid)))
    }
    if (u.pathname.includes('/export')) return ok({})
    if (u.pathname === '/upload/drive/v3/files') {
      const nid = `u${++n}`; archivos.set(nid, { id: nid, name: 'subido.txt', mimeType: 'text/plain', parents: [], trashed: false })
      return ok({ id: nid, webViewLink: 'x' })
    }
    if (metodo === 'POST' && u.pathname === '/drive/v3/files') {
      const nid = `f${++n}`
      archivos.set(nid, { id: nid, name: cuerpo.name, mimeType: cuerpo.mimeType, parents: cuerpo.parents ?? [], trashed: false, properties: cuerpo.properties ?? {} })
      return ok(meta(archivos.get(nid)))
    }
    if (metodo === 'PATCH' && id) {
      const a = archivos.get(id) ?? { id, parents: [] }
      if (cuerpo.name) a.name = cuerpo.name
      if (cuerpo.trashed != null) a.trashed = cuerpo.trashed
      const add = u.searchParams.get('addParents')
      if (add) a.parents = [add]
      archivos.set(id, a)
      return ok(meta(a))
    }
    if (u.pathname === '/drive/v3/files') return ok({ files: [...archivos.values()].filter((a) => !a.trashed) })
    if (id) { const a = archivos.get(id); return a ? ok(meta(a)) : { ok: false, status: 404, async text() { return 'File not found' } } }
    return ok({})
  }
}

test('2 y 3 · el ciclo COMPLETO corre sin credencial de modelo, y sólo habla con Google', async () => {
  // ANTES de importar nada: neutralizar la hidratación de anthropic.env y borrar la llave.
  const previoArchivo = process.env.ORQ_ANTHROPIC_ENV_FILE
  const previaLlave = process.env.ANTHROPIC_API_KEY
  process.env.ORQ_ANTHROPIC_ENV_FILE = '/dev/null'
  delete process.env.ANTHROPIC_API_KEY

  // QUÉ SE VIGILA Y QUÉ NO, medido.
  //
  // El ciclo SÍ lee `ANTHROPIC_MODEL_SONNET`, `ANTHROPIC_TIMEOUT_MS` y siete parientes. No es la
  // capacidad: es la cadena `google.mjs → no-reponer.mjs → db.mjs → config.mjs`, y `config.mjs`
  // valida UN esquema para todo el OS, que incluye los nombres de modelo. Leer el NOMBRE de un
  // modelo desde un esquema de configuración no es llamar a un modelo, y poner eso en rojo haría
  // que el test se apague solo el día que alguien agregue un campo. Lo que sí es una ofensa —y lo
  // único que se vigila acá— es que se lea una CREDENCIAL: con eso se llama, sin eso no.
  // La prueba de que la capacidad no arrastra la configuración está aparte, abajo.
  const leidas = []
  const realEnv = process.env
  process.env = new Proxy(realEnv, {
    get(t, k) { if (typeof k === 'string' && /(ANTHROPIC|CLAUDE|OPENAI).*(API_KEY|AUTH_TOKEN)|^X_API_KEY$/i.test(k)) leidas.push(k); return t[k] },
  })

  const hosts = []
  let pasos = 0
  try {
    const { makeGoogleClient } = await import('../google.mjs')
    const { crearCapacidadDrive, crearAuditorEnMemoria } = await import('./index.mjs')
    const google = makeGoogleClient({ getToken: async () => 'tok', fetchImpl: drivePorFetch(hosts) })
    const auditor = crearAuditorEnMemoria()
    const drive = crearCapacidadDrive({ google, auditor, actor: 'test' })

    const raiz = await drive.crearCarpeta({ nombre: 'RAIZ' }); pasos++
    const sub = await drive.crearCarpeta({ nombre: 'SUB', padre: raiz.referencia.file_id }); pasos++
    const doc = await drive.crearNativo({ nombre: 'informe', tipo: 'doc', padre: raiz.referencia.file_id }); pasos++
    await drive.referencia(doc.referencia.file_id); pasos++
    await drive.listarCarpeta(raiz.referencia.file_id); pasos++
    await drive.buscarPorNombre('informe'); pasos++
    await drive.buscarPorMetadata({ enCarpeta: raiz.referencia.file_id }); pasos++
    await drive.porClaveDeIdempotencia('k-inexistente'); pasos++
    await drive.renombrar({ file_id: doc.referencia.file_id, nombre: 'informe v2' }); pasos++
    await drive.mover({ file_id: doc.referencia.file_id, destino: sub.referencia.file_id }); pasos++
    await drive.copiar({ file_id: doc.referencia.file_id, nombre: 'informe v2 (copia)', destino: sub.referencia.file_id }); pasos++
    await drive.subir({ nombre: 'subido.txt', contenido_base64: 'AA==', mime_type: 'text/plain' }); pasos++
    await drive.exportar(doc.referencia.file_id, 'pdf'); pasos++
    await drive.archivar({ file_id: doc.referencia.file_id }); pasos++
    await drive.revisiones(sub.referencia.file_id); pasos++
    await assert.rejects(() => drive.borrarDefinitivo({ file_id: 'x' })); pasos++

    assert.ok(auditor.filas.length >= 7, `la auditoría registró ${auditor.filas.length} filas`)
  } finally {
    process.env = realEnv
    // LA MEDICIÓN QUE VALE: la llave VIVA al terminar, no la que se borró al empezar.
    const llaveViva = process.env.ANTHROPIC_API_KEY
    if (previoArchivo === undefined) delete process.env.ORQ_ANTHROPIC_ENV_FILE
    else process.env.ORQ_ANTHROPIC_ENV_FILE = previoArchivo
    if (previaLlave !== undefined) process.env.ANTHROPIC_API_KEY = previaLlave
    assert.equal(llaveViva, undefined,
      'al terminar el ciclo había una credencial de modelo viva: algo la revivió (config.mjs hidrata anthropic.env)')
  }

  assert.equal(pasos, 16, 'el ciclo no corrió entero: la prueba sería vacía')
  const ajenos = [...new Set(hosts)].filter((h) => !/\.googleapis\.com$/.test(h))
  assert.deepEqual(ajenos, [], `la capacidad contactó hosts que no son de Google: ${ajenos.join(', ')}`)
  assert.ok(hosts.length >= 20, `sólo ${hosts.length} llamadas: el ciclo no ejerció nada`)
  assert.deepEqual(leidas, [], `la capacidad leyó una CREDENCIAL de modelo: ${[...new Set(leidas)].join(', ')}`)
})

test('4 · la capacidad ni siquiera arrastra la configuración del OS a su árbol', () => {
  // El corolario de la prueba 3: los nombres de modelo que se leen en ejecución entran por el
  // CLIENTE de Google, no por acá. `lib/drive/` se puede levantar sin `config.mjs`, que es lo que
  // hace que sea una capacidad y no una pieza del worker.
  const modulos = [...arbolDeImports(path.join(AQUI, 'index.mjs'))]
  const config = modulos.filter((f) => /config\.mjs$|db\.mjs$/.test(f))
  assert.deepEqual(config, [], `lib/drive/ arrastra:\n${config.join('\n')}`)
  assert.ok(modulos.length >= 8, `sólo ${modulos.length} módulos: la prueba sería vacía`)
})
