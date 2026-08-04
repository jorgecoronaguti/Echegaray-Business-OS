// RECIBIR UN ARCHIVO NO PUEDE COSTAR UN CENTAVO.
//
// Detectar un formato por sus bytes, parsear un extracto, extraer el texto de un PDF y decidir quién
// atiende son operaciones DETERMINÍSTICAS. Meter un modelo en cualquiera de ellas sería caro (cada
// archivo que alguien suelta pasaría por la API), menos confiable (un modelo puede decir que un CSV
// de materiales es un extracto bancario) e inauditable.
//
// La única capacidad de este subsistema que legítimamente necesita un modelo es MIRAR UNA FOTO, y esa
// no vive acá: vive en el camino de comprobantes, y se alcanza por IMPORT DINÁMICO adentro de
// `atender` para que el árbol estático de la recepción genérica no la toque nunca.
//
// Si este test se pone rojo, es lo más grave que se puede encontrar en este módulo: alguien metió un
// modelo en un camino que tiene que ser determinístico.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { especialista } from '../especialistas/archivos.mjs'
import { detectarFormato } from '../../lib/archivos/deteccion.mjs'
import { pareceExtractoBancario } from '../../lib/archivos/planilla.mjs'
import { puedeImportarBanco } from './guarda.mjs'
import { importarExtracto } from './importacion.mjs'
import { repoMemoria, portGuarda } from './dobles.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/** Cualquier cosa que se le pida a esto hace fallar el test. */
const MODELO_PROHIBIDO = new Proxy(() => {}, {
  get() { throw new Error('SE LLAMÓ AL MODELO DONDE NO CORRESPONDE') },
  apply() { throw new Error('SE LLAMÓ AL MODELO DONDE NO CORRESPONDE') },
})

/** Sigue los `import ... from './x.mjs'` relativos hasta el fondo. */
function arbolDeImports(entrada, vistos = new Set()) {
  const abs = path.resolve(entrada)
  if (vistos.has(abs) || !fs.existsSync(abs)) return vistos
  vistos.add(abs)
  const src = fs.readFileSync(abs, 'utf8')
  for (const m of src.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)) {
    if (!m[1].startsWith('.')) continue
    arbolDeImports(path.resolve(path.dirname(abs), m[1]), vistos)
  }
  return vistos
}

test('NINGÚN archivo del camino de recepción alcanza al cliente de Anthropic', () => {
  const entradas = [
    path.join(AQUI, 'flujo.mjs'),
    path.join(AQUI, 'guarda.mjs'),
    path.join(AQUI, 'repositorio.mjs'),
    path.join(AQUI, 'importacion.mjs'),
    path.join(AQUI, 'accion.mjs'),
    // El especialista entero: es el que el Director carga en cada mensaje del equipo.
    path.join(AQUI, '..', 'especialistas', 'archivos.mjs'),
  ]
  const modulos = new Set()
  for (const e of entradas) for (const m of arbolDeImports(e)) modulos.add(m)
  const ofensas = [...modulos].filter((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '')
    return /api\.anthropic\.com|ANTHROPIC_API_KEY|x-api-key/.test(src)
  })
  assert.deepEqual(ofensas.map((f) => path.basename(f)), [],
    `la recepción de archivos terminó alcanzando al modelo:\n${ofensas.join('\n')}`)
  assert.ok(modulos.size >= 8, 'el rastreador no recorrió nada: la prueba sería vacía')
})

test('el import de comprobantes es DINÁMICO: el lector de visión no entra en el árbol estático', () => {
  const src = fs.readFileSync(path.join(AQUI, '..', 'especialistas', 'archivos.mjs'), 'utf8')
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /^\s*import\s.*comprobantes\.mjs/m,
    'importar comprobantes arriba metería la API de Anthropic en un camino que tiene que ser 0 API')
  assert.match(src, /await import\('\.\/comprobantes\.mjs'\)/)
})

test('el RECLAMO del especialista no roza un modelo', () => {
  assert.equal(especialista.reconoce('', { fileIds: ['f1'] }).destino, 'recibir')
  assert.equal(especialista.reconoce('cualquier cosa', { fileIds: [] }), null)
})

test('detectar el formato y reconocer un extracto son bytes y aritmética', () => {
  assert.equal(detectarFormato({ bytes: Buffer.from('%PDF-1.4'), nombre: 'x' }).formato, 'pdf')
  const csv = 'Fecha;Referencia;Concepto;Importe;Saldo\n22/07/2026;1;Transferencia;1.000,00;5.000,00'
  assert.equal(pareceExtractoBancario(csv).esExtracto, true)
})

test('la puerta de permisos no consulta a ningún modelo', async () => {
  const r = await puedeImportarBanco({
    port: portGuarda(), actor: { plataforma_user_id: 'u1', channel_type: 'P' }, channelId: 'c1',
    razonar: MODELO_PROHIBIDO,
  })
  assert.equal(r.ok, true)
})

test('la importación tampoco, ni cuando algo sale mal', async () => {
  const repo = repoMemoria()
  const fila = await repo.registrar(null, {
    fileId: 'f1', propuesta: { movimientos: [{ fecha: '2026-07-22', concepto: 'A', importe: 100, saldo: null, referencia: '1' }] },
  })
  const r = await importarExtracto({
    port: null, razonar: MODELO_PROHIBIDO,
    cargados: async () => [],
    insertar: async () => ({ insertados: 1, ids: [1] }),
    releer: async () => [{ fecha: '2026-07-22', concepto: 'A', importe: 100, saldo: null }],
    estado: async () => ({ total: 1, cobertura: '2026-07-22' }),
  }, fila)
  assert.equal(r.insertados, 1)
})
