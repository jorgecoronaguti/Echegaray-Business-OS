// EL BUSCADOR NO LLAMA AL MODELO. NUNCA. NI COMO ÚLTIMO RECURSO.
//
// Esto no es una promesa en un comentario: son tres pruebas que se ponen en rojo el día que
// alguien enchufe una llamada, aunque sea "sólo para los casos difíciles". Un fallback al
// modelo escondido en una rama condicional es exactamente lo que no se ve venir — funciona,
// nadie lo nota, y aparece en la factura.
//
//   1. NINGÚN import, ni directo ni transitivo, llega al cliente de Anthropic.
//   2. Buscar con un `razonar` que EXPLOTA si lo llaman: si se llama, el test falla.
//   3. Ninguna variable de entorno de API se lee durante una búsqueda.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { crearIndice, buscar } from './buscar.mjs'
import { capacidad, _reiniciarIndice } from '../../comunicacion/asistente/capacidades/drive-buscar.mjs'
import { interpretarDeterministico } from '../../comunicacion/asistente/interpretar.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/** Lo que jamás puede aparecer en el árbol de imports del buscador.
 *
 *  Los nombres NO alcanzan y por eso está la prueba 1b: en este repo los dos módulos que de
 *  verdad llaman a Anthropic se llaman `razonar-ruteo.mjs` e `interpretar.mjs` — nombres
 *  perfectamente inocentes. Filtrar por nombre habría dado verde con la llamada adentro. */
const PROHIBIDO = [
  /anthropic/i, /claude-cli/i, /\breasoner\b/i, /razona/i, /razonador/i, /\bllm\b/i, /openai/i,
  /interpretar\.mjs$/i,
]

/** Sigue los `import ... from './x.mjs'` relativos hasta el fondo. */
function arbolDeImports(entrada, vistos = new Set()) {
  const abs = path.resolve(entrada)
  if (vistos.has(abs) || !fs.existsSync(abs)) return vistos
  vistos.add(abs)
  const src = fs.readFileSync(abs, 'utf8')
  for (const m of src.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)) {
    const espec = m[1]
    if (!espec.startsWith('.')) continue
    arbolDeImports(path.resolve(path.dirname(abs), espec), vistos)
  }
  return vistos
}

const ENTRADAS = [
  path.join(AQUI, 'buscar.mjs'),
  path.join(AQUI, 'ranking.mjs'),
  path.join(AQUI, 'normalizar.mjs'),
  path.resolve(AQUI, '../../comunicacion/asistente/capacidades/drive-buscar.mjs'),
]

test('1 · el árbol de imports del buscador no toca ningún modelo', () => {
  const modulos = new Set()
  for (const e of ENTRADAS) for (const m of arbolDeImports(e)) modulos.add(m)
  const sospechosos = [...modulos].filter((f) => PROHIBIDO.some((re) => re.test(f)))
  assert.deepEqual(sospechosos, [], `el buscador terminó importando:\n${sospechosos.join('\n')}`)
  assert.ok(modulos.size >= 4, 'el rastreador de imports no recorrió nada: la prueba sería vacía')
})

test('1b · y tampoco lo nombra en el código (ni un fetch a la API armado a mano)', () => {
  const modulos = new Set()
  for (const e of ENTRADAS) for (const m of arbolDeImports(e)) modulos.add(m)
  const ofensas = []
  for (const f of modulos) {
    // Sólo los archivos PROPIOS del buscador: los compartidos (contratos, tiempo) los cubre
    // la prueba de imports, y mencionar la palabra en un comentario no es llamar a nada.
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
    if (/api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key/.test(src)) ofensas.push(f)
  }
  assert.deepEqual(ofensas, [], `hay una llamada a la API armada acá:\n${ofensas.join('\n')}`)
})

// ── El doble que explota ─────────────────────────────────────────────────────

const FILAS = [
  { drive_file_id: 'f1', name: 'Vision / Tracción', path: 'administracion/Estrategia/Vision / Tracción', tipo: 'planilla', is_folder: false, modified_time: '2026-07-20T10:00:00Z', depth: 2 },
  { drive_file_id: 'f2', name: 'Flujo de Caja - Cash Flow ECSAS', path: 'administracion/Flujo de Caja - Cash Flow ECSAS', tipo: 'planilla', is_folder: false, modified_time: '2026-07-30T10:00:00Z', depth: 1 },
]

const portDe = () => ({
  query: async (sql) => (sql.includes('drive_index') ? { rows: FILAS } : { rows: [] }),
})

/** Cualquier cosa que se le pida a esto hace fallar el test. */
const MODELO_PROHIBIDO = new Proxy(() => {}, {
  get() { throw new Error('EL BUSCADOR LLAMÓ AL MODELO') },
  apply() { throw new Error('EL BUSCADOR LLAMÓ AL MODELO') },
})

test('2 · buscar con un modelo que explota al tocarlo: no lo toca', async () => {
  const port = portDe()
  const indice = crearIndice({ port })
  for (const q of ['vision', 'vision/traccion', 'cash flow', 'zzz-no-existe', '', 'áéíóú ñ']) {
    const r = await buscar({ indice, port, texto: q, razonar: MODELO_PROHIBIDO, modelo: MODELO_PROHIBIDO })
    assert.ok(r, q)
  }
})

test('2b · la capacidad entera, de punta a punta, sin rozar el modelo', async () => {
  _reiniciarIndice()
  const ctx = {
    port: portDe(),
    ahora: () => new Date('2026-07-31T13:00:00Z'),
    razonar: MODELO_PROHIBIDO,
    razonarRuteo: MODELO_PROHIBIDO,
    google: { searchFile: MODELO_PROHIBIDO },   // ni siquiera el fallback de Drive hace falta
  }
  const r = await capacidad.ejecutar({ terminos: 'vision/traccion', tipo: 'cualquiera' }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.evidencia.archivo.nombre, 'Vision / Tracción')
  _reiniciarIndice()
})

test('2c · las frases del dueño se interpretan sin modelo (si no, la búsqueda lo llamaría antes)', () => {
  const FRASES = [
    'vision', 'Vision', 'visión', 'Vision/Tracción', 'vision traccion', 'vision estrategia',
    'estrategia', 'archivo vision', 'pasame vision', 'abrime vision',
    'quiero el excel de estrategia', 'cash flow', 'control gastos', 'daily', 'avances obra',
    'buscame el flujo de caja', 'pasame el archivo vision/traccion',
  ]
  const alModelo = FRASES.filter((f) => {
    const r = interpretarDeterministico(f)
    return !r || r.intencion !== 'drive.buscar'
  })
  assert.deepEqual(alModelo, [], `estas frases caerían en el modelo:\n${alModelo.join('\n')}`)
})

test('3 · una búsqueda no lee ninguna variable de entorno de API', async () => {
  const leidas = []
  const real = process.env
  process.env = new Proxy(real, {
    get(t, k) { if (typeof k === 'string' && /ANTHROPIC|CLAUDE|OPENAI|API_KEY/i.test(k)) leidas.push(k); return t[k] },
  })
  try {
    const port = portDe()
    const indice = crearIndice({ port })
    await buscar({ indice, port, texto: 'vision' })
  } finally { process.env = real }
  assert.deepEqual(leidas, [], `la búsqueda leyó: ${leidas.join(', ')}`)
})
