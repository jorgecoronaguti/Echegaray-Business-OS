// El handler se prueba con el pipeline INYECTADO — nada de red, nada de IA, nada de Postgres real.
// Lo que se prueba: (1) el progreso se publica EN ORDEN hasta LISTO, nunca se deduce al final;
// (2) un fallo del pipeline deja la fila en ERROR con su motivo, nunca varada en LEYENDO;
// (3) un cómputo sin precios da importes null, nunca cero (regla de oro 1 de este repo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearHandler, computoPorPaso } from './cotizacion_plano.mjs'

/** Un `query` falso que entiende sólo las sentencias que este handler y sus dependencias
 *  (`bytesPorHash`, `persistir`, `cascadaDe`) de verdad emiten. Cualquier otra tira error: así un
 *  cambio que agregue una consulta nueva sin actualizar el test falla RUIDOSO, no en silencio. */
function crearQueryFalso() {
  const llamados = []
  const query = async (sql, params = []) => {
    llamados.push({ sql, params })
    if (sql.includes('from orq.xsas_adjunto')) {
      const hashes = params[1] ?? []
      return { rows: hashes.map((h) => ({ hash: h, nombre: 'B-01.pdf', contenido_b64: 'UExBTk8=' })) }
    }
    if (sql.includes('select mensaje from public.cotizacion_lectura')) return { rows: [{ mensaje: 'Quattropani' }] }
    if (sql.startsWith('update public.cotizacion_lectura')) return { rows: [] }
    if (sql.includes('insert into public.cotizaciones')) return { rows: [{ id: 'cot-123' }] }
    if (sql.includes('from public.parametro_comercial')) return { rows: [{ id: 'param-1' }] }
    if (sql.includes('from public.cotizacion_cascada')) return { rows: [{ costo_directo: null, venta_sin_iva: null }] }
    throw new Error(`query no mockeada en el test: ${sql.slice(0, 90)}`)
  }
  return { query, llamados }
}

/** Extrae {columna: valor} de un `update ... set col = $2, ... where id = $1` a partir de los
 *  parámetros posicionales — sin ejecutar SQL de verdad. */
function columnasSeteadas(sql, params) {
  const obj = {}
  for (const m of sql.matchAll(/(\w+)\s*=\s*\$(\d+)/g)) obj[m[1]] = params[Number(m[2]) - 1]
  return obj
}

const laminaFalsa = { archivo: 'B-01.pdf', lamina: { codigo: 'B-01' }, elementos: [], proyecto: { propietario: null, nombre: 'Quattropani' }, medicion: {} }

const resultadoPipelineFalso = () => ({
  documentos: { planos: { legibles: [{ name: 'B-01.pdf', porQueNoLegible: null }], noLegibles: [] } },
  laminas: [laminaFalsa],
  computo: { items: [] },
  mapeo: { mapeos: [] },
  composiciones: new Map(),
  soloAdjuntos: true,
})

const ctxFalso = { logger: { warn() {}, info() {} }, config: {} }
const tareaFalsa = (over = {}) => ({ inputs: { lectura_id: 'lec-1', actor_id: 'actor-1', hashes: ['a'.repeat(64)], ...over } })

test('el progreso se publica en orden, hasta LISTO', async () => {
  const { query, llamados } = crearQueryFalso()
  const handler = crearHandler({ query, correr: async () => resultadoPipelineFalso(), crearGoogle: async () => null })

  const { result } = await handler(tareaFalsa(), ctxFalso)
  assert.equal(result.ok, true)
  assert.equal(result.presupuesto_id, 'cot-123')

  const updates = llamados.filter((l) => l.sql.startsWith('update public.cotizacion_lectura')).map((l) => columnasSeteadas(l.sql, l.params))
  assert.ok(updates.length >= 5, `tienen que ser varias escrituras de progreso, no una sola al final (fueron ${updates.length})`)

  const estados = updates.map((u) => u.estado).filter(Boolean)
  assert.deepEqual(estados, ['LEYENDO', 'LISTO'], 'LEYENDO primero, LISTO al final — nunca al revés ni salteado')

  const etapas = updates.map((u) => u.etapa)
  assert.equal(etapas[0], 'buscando los adjuntos que se subieron', 'la primera etapa se publica ANTES de tocar el pipeline')
  // Cada etapa intermedia es un texto distinto: si dos updates seguidos publicaran la misma frase,
  // la pantalla no tendría cómo distinguir «no avanzó» de «avanzó pero repite etapa».
  const intermedias = etapas.slice(0, -1).filter(Boolean)
  assert.equal(new Set(intermedias).size, intermedias.length, 'las etapas intermedias no se repiten')

  const final = updates.at(-1)
  assert.equal(final.estado, 'LISTO')
  assert.equal(final.error, null)
  assert.equal(final.presupuesto_id, 'cot-123')
})

test('un fallo del pipeline deja la fila en ERROR con su motivo — nunca varada en LEYENDO', async () => {
  const { query, llamados } = crearQueryFalso()
  const handler = crearHandler({ query, correr: async () => { throw new Error('el modelo no devolvió JSON interpretable') }, crearGoogle: async () => null })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-2' }), ctxFalso)
  assert.equal(result.ok, false)

  const updates = llamados.filter((l) => l.sql.startsWith('update public.cotizacion_lectura')).map((l) => columnasSeteadas(l.sql, l.params))
  const final = updates.at(-1)
  assert.equal(final.estado, 'ERROR')
  assert.match(final.error, /el modelo no devolvió JSON interpretable/)
  assert.ok(!updates.some((u) => u.estado === 'LISTO'), 'un fallo nunca puede terminar en LISTO')
  assert.ok(!updates.some((u) => u.estado === 'LEYENDO' && updates.indexOf(u) === updates.length - 1), 'no puede quedar LEYENDO como estado final')
})

test('sin ningún plano legible entre los adjuntos, también es ERROR y no un cuelgue', async () => {
  const { query, llamados } = crearQueryFalso()
  const sinLegibles = async () => ({ ...resultadoPipelineFalso(), documentos: { planos: { legibles: [], noLegibles: [{ name: 'plano.dwg', porQueNoLegible: 'DWG no lo puede abrir el OS' }] } } })
  const handler = crearHandler({ query, correr: sinLegibles, crearGoogle: async () => null })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-3' }), ctxFalso)
  assert.equal(result.ok, false)
  const updates = llamados.filter((l) => l.sql.startsWith('update public.cotizacion_lectura')).map((l) => columnasSeteadas(l.sql, l.params))
  assert.equal(updates.at(-1).estado, 'ERROR')
  assert.match(updates.at(-1).error, /plano.*abrir/)
})

test('un cómputo sin precios da importes null, nunca cero', () => {
  const cot = {
    partidas: [{
      costoUnitario: null,
      subtotal: null,
      lineas: [{ elemento: 'B1', nombre: 'Base B1', cantidad: 4, unidad: 'un', criterio: 'sección citada del plano' }],
    }],
    candidatas: [{ elemento: 'X1', computo: { id: 'X1', nombre: 'Elemento sin partida', cantidad: { valor: 2 }, unidad: 'un' } }],
  }
  const { grupos } = computoPorPaso(cot)

  const bases = grupos.find((g) => g.pasoId === 'p2') // "B1" -> rol BASE -> paso 2
  assert.ok(bases, 'la línea de B1 tiene que caer en el paso de bases')
  assert.equal(bases.items[0].p, null, 'sin costoUnitario, el precio unitario es null')
  assert.equal(bases.items[0].imp, null, 'sin costoUnitario, el importe es null — NUNCA 0')
  assert.equal(bases.subtotal, null, 'un grupo sin ningún importe no puede sumar 0')

  const sinPaso = grupos.find((g) => g.pasoId === 'p7') // sin regla de rol -> el barrido
  assert.ok(sinPaso, 'una candidata sin partida también tiene que aparecer, no desaparecer del cómputo')
  assert.equal(sinPaso.items[0].p, null)
  assert.equal(sinPaso.items[0].imp, null)
  assert.match(sinPaso.items[0].nota, /sin partida/)
})

test('un cómputo CON precio suma el importe por línea, y el subtotal cierra con la partida', () => {
  const cot = {
    partidas: [{
      costoUnitario: 1000,
      lineas: [
        { elemento: 'C1', nombre: 'Columna C1', cantidad: 3, unidad: 'un', criterio: 'sección 30x30' },
        { elemento: 'C2', nombre: 'Columna C2', cantidad: 2, unidad: 'un', criterio: 'sección 30x30' },
      ],
    }],
    candidatas: [],
  }
  const { grupos } = computoPorPaso(cot)
  const columnas = grupos.find((g) => g.pasoId === 'p5') // "Columna" -> rol COLUMNA -> paso 5
  assert.ok(columnas)
  assert.equal(columnas.items[0].imp, 3000)
  assert.equal(columnas.items[1].imp, 2000)
  assert.equal(columnas.subtotal, 5000, 'el subtotal del grupo tiene que cerrar con la suma de sus importes')
})
