// EL DEFECTO GRAVE: `tesoreria.recomendaciones` y `tesoreria.validaciones` estaban VACÍAS mientras el
// ciclo informaba "1 propuesta · 1 rechazada".
//
// La causa: el ledger recibía sólo `val.publicables`. Una propuesta rechazada por la revisión
// independiente no se guardaba, y su validación tampoco —el ledger descarta las validaciones sin
// recomendación persistida—. Resultado: nadie podía contestar **por qué** se rechazó una decisión de
// plata. Se computaba el motivo y se tiraba a la basura.
//
// Estos tests corren contra un doble de `query` que graba SQL y parámetros: no necesitan Postgres, así
// que corren siempre. Si alguien vuelve a persistir sólo lo publicable, se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardarRecomendaciones, ESTADOS_CORRIDA } from './ledger.mjs'
import { correrCiclo } from './ciclo.mjs'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * EL CHECK QUE RIGE DESPUÉS DE TODAS LAS MIGRACIONES, no el de la primera. Se recorren en orden y
 * gana la última que lo define: probar contra la inicial es probar contra una base que ya no existe.
 */
function estadosDelCheck() {
  const dir = join(APP, 'supabase', 'migrations')
  let ultimo = null
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8')
    // Sólo las sentencias, nunca los comentarios: un `--` que enumere estados no define nada.
    const sinComentarios = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
    for (const m of sinComentarios.matchAll(/check\s*\(estado in \(([^)]*)\)\)/gi)) {
      // A QUÉ TABLA PERTENECE: la última nombrada antes del check. Buscar la palabra "corridas" cerca
      // hacía pasar el check de `recomendaciones`, que la nombra en su foreign key — y el test se
      // ponía rojo con el mensaje equivocado, que es peor que no tenerlo.
      const tabla = [...sinComentarios.slice(0, m.index)
        .matchAll(/(?:create table(?: if not exists)?|alter table)\s+([a-z_.]+)/gi)].pop()
      if (!tabla || !/(^|\.)corridas$/i.test(tabla[1])) continue
      ultimo = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    }
  }
  return ultimo
}

/** Doble de `query`: graba todo lo que se le pidió escribir. */
function queryFake() {
  const llamadas = []
  const fn = async (sql, params = []) => { llamadas.push({ sql, params }); return { rows: [], rowCount: 0 } }
  fn.llamadas = llamadas
  fn.de = (tabla) => llamadas.filter((l) => new RegExp(`insert into tesoreria\\.${tabla}`).test(l.sql))
  return fn
}

const rec = (id, bloque = 'C') => ({
  id, bloque, instrumento_id: 'inst-1', monto_maximo: 1e6, moneda: 'ARS', horizonte_dias: 30,
  rendimiento_neto_periodo: 0.02, ganancia_neta_estimada: 20000, confianza: 'media',
  vence_en: '2026-08-04T00:00:00Z',
})

test('DEFECTO · una propuesta RECHAZADA se persiste, con estado rechazada y su motivo', async () => {
  const q = queryFake()
  const validaciones = [
    { id: 'r-ok', aprobada: true, fallas: [], chequeos: [{ regla: 'aritmetica', pasa: true }], validado_en: '2026-08-03T00:00:00Z' },
    { id: 'r-no', aprobada: false, fallas: ['supera_vara: rinde 2% y la vara es 4%'], chequeos: [], validado_en: '2026-08-03T00:00:00Z' },
  ]
  const out = await guardarRecomendaciones(q, 'run-1', [rec('r-ok'), rec('r-no', 'D')], validaciones)

  assert.equal(out.guardadas, 2, 'las dos tienen que entrar, no sólo la publicable')
  assert.equal(out.rechazadas, 1)
  assert.equal(out.validaciones, 2, 'la validación de la rechazada es la que explica POR QUÉ no se hizo')

  const filas = q.de('recomendaciones')
  const estados = filas.map((f) => f.params[10])
  assert.deepEqual(estados.sort(), ['propuesta', 'rechazada'])

  // El motivo viaja en el payload: seis meses después nadie tiene que cruzar dos tablas para saberlo.
  const rechazada = filas.find((f) => f.params[10] === 'rechazada')
  const payload = JSON.parse(rechazada.params[12])
  assert.equal(payload.validacion.aprobada, false)
  assert.match(payload.validacion.fallas[0], /supera_vara/)
})

test('DEFECTO · la validación de una rechazada ya no se descarta en silencio', async () => {
  const q = queryFake()
  const validaciones = [{ id: 'r-no', aprobada: false, fallas: ['x'], chequeos: [], validado_en: '2026-08-03T00:00:00Z' }]
  // La llamada VIEJA: sólo las publicables (ninguna). Así quedaban las dos tablas en cero.
  const viejo = await guardarRecomendaciones(q, 'run-1', [], validaciones)
  assert.equal(viejo.validaciones, 0)
  assert.equal(viejo.sin_recomendacion, 1, 'el ledger tiene que DECIR cuántas validaciones se quedaron afuera')

  // La llamada NUEVA: todo lo generado.
  const q2 = queryFake()
  const nuevo = await guardarRecomendaciones(q2, 'run-1', [rec('r-no')], validaciones)
  assert.equal(nuevo.validaciones, 1)
  assert.equal(nuevo.sin_recomendacion, 0)
  assert.equal(q2.de('validaciones')[0].params[2], false)
})

test('una corrida posterior NO puede bajar a "propuesta" algo que un humano ya resolvió', async () => {
  const q = queryFake()
  await guardarRecomendaciones(q, 'run-2', [rec('r-ok')], [{ id: 'r-ok', aprobada: true, fallas: [], chequeos: [] }])
  const sql = q.de('recomendaciones')[0].sql
  assert.match(sql, /estado = case when tesoreria\.recomendaciones\.estado in \('aprobada','rechazada'\)/)
})

test('DEFECTO · el ciclo devuelve TODO lo generado, no sólo lo publicable', async () => {
  // Sin esto, el script no tiene de dónde sacar las rechazadas para persistirlas.
  const google = {
    readSheetValues: async (_id, rango) => ({
      'Caja!A1:H200': [['Fecha del saldo', 'Cuenta', 'Saldo en pesos'], ['01/08/2026', 'Santander', '50000000']],
      'Cheques Emitidos!A1:L997': [],
      'Cobranzas!A5:R2000': [],
      'Compras!A3:BZ3': [[]],
      'Compras!A4:AK': [],
    })[rango] ?? [],
  }
  const r = await correrCiclo({
    google,
    relevar: async () => ({ estado: 'ok', paginas: [], bloqueos: [], observado_en: '2026-08-01T10:00:00Z' }),
    publicar: async () => {}, ahora: new Date('2026-08-01T10:00:00Z'),
  }, {
    filaReserva: { valor: { monto: 1000000, metodo: 'piso_mas_egresos', version: 1 }, aprobada_por: 'jorge', vigente_desde: '2026-08-01T00:00:00Z', aprobada_en: '2026-08-01T00:00:00Z' },
    filaRestringida: { monto: 0, fuente: 'declaración del dueño', declarada_en: '2026-08-01T00:00:00Z' },
    dias: 60, publicarSiempre: true, extractorValidado: true,
    instrumentos: [{
      nombre: 'Lecap S31O5', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
      tasa: { tipo: 'tea', valor: 1.3, naturaleza: 'contractual' },
      costos: { comision: 0.001 }, emisor: 'Tesoro Nacional', evidencia: 'dato',
    }],
  })
  assert.equal(r.estado, 'ok')
  assert.ok(Array.isArray(r.generadas), 'el ciclo tiene que devolver `generadas`')
  assert.ok(r.generadas.length >= r.recomendaciones.length)
  // Y toda propuesta generada tiene su validación: no se pierde ninguna por el camino.
  for (const g of r.generadas) assert.ok(r.validaciones.some((v) => v.id === g.id), `la propuesta ${g.id} no tiene validación`)
})

// ════════════════════════════════════════════════════════════════════════════
// EL LEDGER TIENE QUE PODER REGISTRAR SU PROPIO FRACASO
// ════════════════════════════════════════════════════════════════════════════

test('DEFECTO · el check de estados rechazaba `browser_error` y la corrida no se podía cerrar', () => {
  // Con Chrome caído, `ciclo.mjs` devuelve 'browser_error' y `ciclo-tesorero.mjs` cierra la corrida
  // con ese estado. El check no lo admitía: el update explotaba, el cierre nunca corría y la fila
  // quedaba `en_curso` para siempre. Del rastro del navegador roto no quedaba nada.
  const admitidos = estadosDelCheck()
  assert.ok(admitidos, 'no se encontró el check de tesoreria.corridas en ninguna migración')
  assert.ok(admitidos.includes('browser_error'),
    `el check admite [${admitidos.join(', ')}] y el ciclo produce browser_error`)
})

test('la lista de estados del código y la de la base son la MISMA', () => {
  // Dos listas que dicen lo mismo son una sola definición sólo mientras un test las compare.
  assert.deepEqual([...estadosDelCheck()].sort(), [...ESTADOS_CORRIDA].sort())
  // Y lo que no puede volver nunca: este agente no opera, así que ninguna corrida se ejecuta.
  assert.equal(ESTADOS_CORRIDA.includes('ejecutada'), false)
  assert.equal(estadosDelCheck().includes('ejecutada'), false)
})
