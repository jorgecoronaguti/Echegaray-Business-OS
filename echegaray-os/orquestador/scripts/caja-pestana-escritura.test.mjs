// LA ESCRITURA DE CAJA: LOS RANGOS CON NOMBRE Y EL ORDEN DE LA CORRIDA.
//
// POR QUÉ VIVE APARTE DE LA GRILLA. Lo de acá no verifica QUÉ dice la pestaña sino CÓMO se escribe: a
// qué celda apunta cada nombre publicado y en qué orden ocurren las cosas contra Google. Son los dos
// invariantes que ya causaron pérdidas sin cambiar una sola celda de contenido, y se prueban leyendo
// el FUENTE del script — una secuencia de efectos no se puede probar con mocks: probaría el mock.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { grilla } from './caja-pestana.mjs'

const REFS = { bancoRaw: '_BANCO_RAW', cheques: 'Cheques Emitidos', tarjeta: 'Tarjeta de Credito', chequesRaw: '_CHEQUES_RAW', filasCal: { iva: 18, iibb: 19 } }
const construir = () => grilla(new Map(), REFS)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS RANGOS CON NOMBRE — UN NOMBRE NO SE REAPUNTA A UNA GRILLA QUE NO SE ESCRIBIÓ (03/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DAÑO, MEDIDO. Los rangos se publicaban ANTES de escribir, contra la grilla que el generador
// PENSABA escribir. El 03/08 el portón frenó la escritura —la pestaña era del dueño— y quedó con su
// layout viejo mientras los nombres se iban cuatro filas abajo: `CAJA_ARQUEO_ARS` cayó en una celda
// vacía y el total pasó de $123,79M a $80,91M. Sin un solo #REF! y con el diff de la pestaña en CERO.

const G_FALSA = { fArqArs: 15, fArqUsd: 16, fBancoPesos: 8, fCartera: 10 }

test('ANTES de escribir sólo se CREAN los que faltan: ninguno se reapunta', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const existentes = RANGOS_DE_CAJA.map((r, i) => ({ name: r.nombre, namedRangeId: `id${i}`, range: { startRowIndex: 999 } }))
  assert.equal(requestsDeRangos(7, G_FALSA, existentes, { soloFaltantes: true }).length, 0)
})

test('ANTES de escribir, el que NO existe sí se crea: si no, #NAME? en la primera corrida', async () => {
  const { requestsDeRangos, RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  const reqs = requestsDeRangos(7, G_FALSA, [], { soloFaltantes: true })
  assert.equal(reqs.length, RANGOS_DE_CAJA.length, 'arranque en frío: se crean todos')
  assert.ok(reqs.every((r) => r.addNamedRange), 'sólo se AGREGAN, nunca se reapunta')
})

test('LOS NOMBRES APUNTAN A LAS COLUMNAS DEL LAYOUT NUEVO, no a las del viejo', async () => {
  // Un nombre que se quedó apuntando a la columna vieja NO da error: devuelve otra cosa. Con el
  // rediseño el importe de cada cuenta pasó de la C a la B y la fecha de la F a la D.
  const { requestsDeRangos } = await import('./caja-pestana.mjs')
  const g = construir()
  const reqs = requestsDeRangos(7, g, [])
  const rango = (n) => reqs.find((r) => r.addNamedRange?.namedRange?.name === n)?.addNamedRange.namedRange.range
  assert.equal(rango('CAJA_ARQUEO_ARS').startColumnIndex, 1, 'el importe del arqueo vive en "Importe en origen"')
  assert.equal(rango('CAJA_ARQUEO_ARS_FECHA').startColumnIndex, 3, 'y su fecha, en la columna de fechas del panel')
  assert.equal(rango('CAJA_BANCO_SALDO').startColumnIndex, 2, 'el saldo del banco es el valuado en pesos')
  assert.equal(rango('CAJA_CARTERA').startColumnIndex, 2)
  // Y CADA UNO CAE EN LA FILA QUE DICE SU RÓTULO, no en la que quedó de la corrida anterior.
  assert.equal(rango('CAJA_ARQUEO_ARS').startRowIndex + 1, g.fArqArs)
  assert.equal(rango('CAJA_BANCO_SALDO').startRowIndex + 1, g.fBancoPesos)
})

test('TIPO_CAMBIO_USD ya NO lo publica CAJA: su bloque vive en el anexo', async () => {
  // Dos escritores sobre el mismo nombre es cómo un rango termina apuntando a una celda vacía.
  const { RANGOS_DE_CAJA } = await import('./caja-pestana.mjs')
  assert.ok(!RANGOS_DE_CAJA.some((r) => r.nombre === 'TIPO_CAMBIO_USD'))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ORDEN DE LA CORRIDA — SE VERIFICA SOBRE EL FUENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Es una secuencia de efectos sobre Google, no una función pura: un test que llamara a las mismas
// funciones mockeadas probaría el mock, no el orden.

test('EL DESASTRE DEL 31/07: si la escritura se saltea, NO se formatea ni se mueven los nombres', () => {
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const i = src.indexOf('const escritura = await escribirPreservando')
  assert.ok(i > 0, 'el resultado de la escritura se guarda en una variable, no se descarta')
  const corte = src.indexOf('await formatear(', i)
  assert.ok(corte > i, 'formatear viene después de escribir')
  const entre = src.slice(i, corte)
  assert.match(entre, /escritura\?\.bloqueada \|\| escritura\?\.editadaPorHumano \|\| escritura\?\.noVerificable/, 'se consulta el skip')
  assert.match(entre, /\n\s+return\n/, 'y se CORTA la corrida antes de formatear')
  assert.ok(src.indexOf('await publicar(', corte) > corte, 'publicar queda del lado protegido por el return')
})

test('el generador NO publica rangos en el camino de la escritura frenada', () => {
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const corte = src.indexOf('escritura?.bloqueada || escritura?.editadaPorHumano')
  const soloFaltantes = src.indexOf('soloFaltantes: true')
  const reapunta = src.indexOf('reapuntados a la grilla RECIÉN ESCRITA')
  assert.ok(corte > 0 && soloFaltantes > 0 && reapunta > 0, 'las tres marcas tienen que existir')
  assert.ok(soloFaltantes < corte, 'la creación de los que faltan va ANTES del corte')
  assert.ok(reapunta > corte, 'el reapuntado va DESPUÉS del corte: si la escritura se frena, no se llega')
})

test('CAJA no se escribe si falta la pestana del anexo: seria media pantalla en #NAME?', () => {
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const guarda = src.indexOf('falta la pestaña')
  const punto = src.indexOf('escribirPreservando(google')
  assert.ok(guarda > 0 && guarda < punto, 'la guarda tiene que estar ANTES de escribir')
  assert.match(src.slice(guarda - 600, guarda + 200), /throw new Error/, 'y romper, no seguir con las alertas en error')
})

test('EL LOG INFORMA EL EFECTO: lee la pestana escrita, no el objeto en memoria', () => {
  // Un resumen que sale de la grilla que el generador PENSABA escribir no prueba nada. El log de
  // las cinco tarjetas se arma leyendo la pestana despues de escribirla.
  const src = readFileSync(new URL('./caja-pestana.mjs', import.meta.url), 'utf8')
  const lectura = src.indexOf('const v = await google.readSheetValues')
  const log = src.indexOf('g.tarjetas.forEach')
  assert.ok(lectura > 0 && log > lectura, 'el resumen se imprime DESPUES de releer la pestana')
  assert.match(src.slice(log, log + 200), /v\[g\.fCifras - 1\]/, 'y sale de lo que quedo escrito')
})
