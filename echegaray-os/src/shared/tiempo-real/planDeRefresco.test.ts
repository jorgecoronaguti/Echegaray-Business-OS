import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONFIG_DE_REFRESCO as CFG, EDICION_INACTIVA_MS, ESTADO_INICIAL, decidir, hayEdicionEnCurso, momentoDeRefresco, registrarAviso,
  tablaQueImporta, trasRefrescar,
} from './planDeRefresco.ts'
import { TABLAS_AVISADAS_POR_SINCRONIZADOR, TABLAS_CON_AVISO } from './tablas.ts'

const LIBRE = { editando: false, oculta: false }
const TABLAS = new Set(['registros_hh', 'liquidacion_linea'])

test('filtra por tabla: sólo lo declarado, y un payload sin forma se ignora sin romper', () => {
  assert.equal(tablaQueImporta({ tabla: 'registros_hh', op: 'UPDATE' }, TABLAS), 'registros_hh')
  assert.equal(tablaQueImporta({ tabla: 'clientes', op: 'INSERT' }, TABLAS), null)
  for (const basura of [null, undefined, 'registros_hh', 42, {}, { tabla: '' }, { tabla: 7 }, { table: 'registros_hh' }]) {
    assert.equal(tablaQueImporta(basura, TABLAS), null, JSON.stringify(basura))
  }
})

test('sin avisos no hay nada que hacer', () => {
  assert.deepEqual(decidir(ESTADO_INICIAL, 10_000, LIBRE), { tipo: 'nada' })
})

test('debounce: una ráfaga de avisos es UN refresco, al segundo de silencio', () => {
  let e = registrarAviso(ESTADO_INICIAL, 0, 0)
  e = registrarAviso(e, 300, 0)
  e = registrarAviso(e, 600, 0)
  assert.deepEqual(decidir(e, 900, LIBRE), { tipo: 'esperar', ms: 700 })
  assert.deepEqual(decidir(e, 1600, LIBRE), { tipo: 'refrescar' })
  e = trasRefrescar(e, 1600)
  assert.deepEqual(decidir(e, 2000, LIBRE), { tipo: 'nada' }, 'lo atendido no se vuelve a refrescar')
})

test('una ráfaga que no para no posterga el refresco más allá de la espera máxima', () => {
  let e = ESTADO_INICIAL
  for (let t = 0; t <= 8000; t += 200) e = registrarAviso(e, t, 0)
  assert.equal(momentoDeRefresco(e), CFG.esperaMaximaMs)
  assert.deepEqual(decidir(e, 8000, LIBRE), { tipo: 'refrescar' })
})

test('nunca dos refrescos de la misma pestaña a menos del intervalo mínimo', () => {
  let e = trasRefrescar(ESTADO_INICIAL, 10_000)
  e = registrarAviso(e, 10_100, 0)
  assert.equal(momentoDeRefresco(e), 10_000 + CFG.intervaloMinimoMs)
  assert.deepEqual(decidir(e, 11_200, LIBRE), { tipo: 'esperar', ms: 3800 })
})

test('el desfase se sortea con el primer aviso de la ráfaga y no se vuelve a sortear', () => {
  let e = registrarAviso(ESTADO_INICIAL, 0, 700)
  e = registrarAviso(e, 500, 1400)
  assert.equal(e.desfase, 700)
  assert.equal(momentoDeRefresco(e), 500 + CFG.silencioMs + 700)
})

test('REGLA DEL DUEÑO: con alguien editando no se refresca aunque ya sea la hora; al salir del foco, sí', () => {
  const e = registrarAviso(ESTADO_INICIAL, 0, 0)
  assert.deepEqual(decidir(e, 60_000, { editando: true, oculta: false }), { tipo: 'diferir' })
  assert.deepEqual(decidir(e, 60_000, { editando: false, oculta: true }), { tipo: 'diferir' })
  // Diferir no consume el aviso: sigue pendiente y se atiende en cuanto se puede.
  assert.deepEqual(decidir(e, 60_001, LIBRE), { tipo: 'refrescar' })
})

test('el select frena el refresco aunque el deshacer no lo trate como edición de texto (19/09/2026)', () => {
  // MUTACIÓN: si `hayEdicionEnCurso` delegara sólo en `destinoEditable`, esto daría false y la tabla se
  // movería debajo de un desplegable abierto.
  assert.equal(hayEdicionEnCurso({ activo: { tagName: 'SELECT' }, celdaMarcada: false }), true)
})

test('edición en curso: campo con foco o celda marcada; un botón o el body no cuentan', () => {
  for (const tagName of ['INPUT', 'textarea', 'SELECT']) {
    assert.equal(hayEdicionEnCurso({ activo: { tagName }, celdaMarcada: false }), true, tagName)
  }
  assert.equal(hayEdicionEnCurso({ activo: { tagName: 'DIV', isContentEditable: true }, celdaMarcada: false }), true)
  assert.equal(hayEdicionEnCurso({ activo: { tagName: 'BUTTON' }, celdaMarcada: false }), false)
  assert.equal(hayEdicionEnCurso({ activo: { tagName: 'BODY' }, celdaMarcada: false }), false)
  assert.equal(hayEdicionEnCurso({ activo: null, celdaMarcada: false }), false)
  assert.equal(hayEdicionEnCurso({ activo: { tagName: 'BODY' }, celdaMarcada: true }), true)
})

test('la lista del navegador es EXACTAMENTE la de las migraciones: ninguna pantalla espera un aviso que no existe', () => {
  // TODAS las migraciones con las marcas, no sólo la primera: la pantalla de impuestos (20260916T2010)
  // agregó sus tablas en un archivo propio. Leyendo sólo 20260915T2100, declarar una tabla en `tablas.ts`
  // sin su trigger volvería a compilar y el «en vivo» mentiría.
  const dir = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))
  const todas = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
  const marcadas = todas.filter((sql) => sql.includes('-- TABLAS-CON-AVISO:inicio'))
  // UNA TABLA RETIRADA (22/09/2026, recibo_pago): la migración que la borra lo dice con
  // `-- TABLAS-CON-AVISO:retirada '<tabla>'`, y sale de la lista sin reescribir la migración ya aplicada.
  const retiradas = new Set(todas.flatMap((sql) => [...sql.matchAll(/-- TABLAS-CON-AVISO:retirada '([a-z_0-9]+)'/g)].map((m) => m[1])))
  assert.ok(marcadas.length >= 2, 'se perdieron las marcas de la lista en las migraciones')
  const delSql = marcadas.flatMap((sql) => {
    const tramo = sql.split('-- TABLAS-CON-AVISO:inicio')[1]?.split('-- TABLAS-CON-AVISO:fin')[0] ?? ''
    return [...tramo.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1])
  }).filter((t) => !retiradas.has(t)).sort()
  assert.deepEqual([...TABLAS_CON_AVISO].sort(), delSql)
  assert.equal(new Set(delSql).size, delSql.length, 'tabla repetida en las migraciones')
})

test('una tabla avisada por su sincronizador: el script la avisa de verdad y NO tiene trigger', () => {
  const raiz = fileURLToPath(new URL('../../../', import.meta.url))
  const conTrigger = new Set<string>(TABLAS_CON_AVISO)
  for (const [tabla, script] of Object.entries(TABLAS_AVISADAS_POR_SINCRONIZADOR)) {
    assert.equal(conTrigger.has(tabla), false, `${tabla} con trigger avisaría en cada corrida del sync`)
    const fuente = readFileSync(join(raiz, script), 'utf8')
    // Que el script importe el aviso no alcanza: tiene que llamarlo sobre ESA tabla.
    assert.match(fuente, new RegExp(`avisarSiCambio\\(db, \\{ tabla: 'public\\.${tabla}'`), `${script} no avisa ${tabla}`)
  }
})

test('un foco OLVIDADO en un campo deja de frenar el refresco; quien está tecleando sigue protegido (16/09/2026)', () => {
  const input = { tagName: 'INPUT' }
  // Medido en producción: con el cursor quieto en un buscador la pantalla no se refrescaba nunca.
  assert.equal(hayEdicionEnCurso({ activo: input, celdaMarcada: false, msDesdeUltimaTecla: EDICION_INACTIVA_MS }), false)
  assert.equal(hayEdicionEnCurso({ activo: input, celdaMarcada: false, msDesdeUltimaTecla: EDICION_INACTIVA_MS - 1 }), true)
  // La celda declarada en edición (un menú abierto) frena siempre, haya tecla o no.
  assert.equal(hayEdicionEnCurso({ activo: { tagName: 'BODY' }, celdaMarcada: true, msDesdeUltimaTecla: 10 * EDICION_INACTIVA_MS }), true)
})
