import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import {
  normalizarFormatoCelda, firmaDeFormato, evaluarFormato, formatoGuardia, sellarFormato,
  limpiarCacheFormato, TECHO_FILAS_FORMATO,
} from './firma-formato.mjs'

// Doble de la base, igual que en guarda-escritura.test.mjs: la decisión corre de verdad contra una base
// controlada. Por defecto no hay base guardada (firma_formato null = arranque en frío).
const sinBase = async () => { throw new Error('sin base') }
globalThis.__dobleDbFmt = { query: sinBase }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dobleDbFmt.query(...a)' }
  },
})

/** Base falsa con una sola fila de sheet_tab_firma por pestaña. */
function baseFalsa(inicial = {}) {
  const filas = new Map(Object.entries(inicial))
  globalThis.__dobleDbFmt = {
    query: async (sql, params = []) => {
      if (/select firma_formato/.test(sql)) {
        const v = filas.get(params[1])
        return { rows: v === undefined ? [] : [{ firma_formato: v }] }
      }
      if (/insert into public\.sheet_tab_firma/.test(sql)) { filas.set(params[1], params[2]); return { rows: [] } }
      return { rows: [] }
    },
  }
  return filas
}

const celda = (f) => ({ formato: f })
const AZUL = { red: 0.2, green: 0.4, blue: 0.9 }

test('normalizarFormatoCelda: sin formato propio da vacío', () => {
  assert.equal(normalizarFormatoCelda(null), '')
  assert.equal(normalizarFormatoCelda(undefined), '')
  assert.equal(normalizarFormatoCelda({}), '')
})

test('normalizarFormatoCelda: color, negrita y formato de número cambian la proyección', () => {
  const base = normalizarFormatoCelda({ textFormat: { bold: false } })
  assert.notEqual(normalizarFormatoCelda({ textFormat: { bold: true } }), base)
  assert.notEqual(normalizarFormatoCelda({ backgroundColor: AZUL }), base)
  assert.notEqual(normalizarFormatoCelda({ numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' } }), base)
})

test('normalizarFormatoCelda: el redondeo de color es estable (mismo color, misma proyección)', () => {
  const a = normalizarFormatoCelda({ backgroundColor: { red: 0.20000000298023224, green: 0.4, blue: 0.9 } })
  const b = normalizarFormatoCelda({ backgroundColor: { red: 0.2, green: 0.4, blue: 0.9 } })
  assert.equal(a, b)
})

test('firmaDeFormato: dos pestañas con el mismo formato dan la misma firma', () => {
  const fmt = { congeladas: { filas: 2, columnas: 1 }, anchos: [100, 200], filas: [[celda({ textFormat: { bold: true } }), celda(null)]] }
  assert.equal(firmaDeFormato(fmt), firmaDeFormato(JSON.parse(JSON.stringify(fmt))))
})

test('firmaDeFormato: pintar una celda cambia la firma (el caso del dueño)', () => {
  const antes = { congeladas: { filas: 1 }, anchos: [100], filas: [[celda(null)], [celda(null)]] }
  const despues = { congeladas: { filas: 1 }, anchos: [100], filas: [[celda(null)], [celda({ backgroundColor: AZUL })]] }
  assert.notEqual(firmaDeFormato(antes), firmaDeFormato(despues))
})

test('firmaDeFormato: ensanchar una columna o congelar una fila también cuenta', () => {
  const base = { congeladas: { filas: 1, columnas: 0 }, anchos: [100, 100], filas: [[celda(null)]] }
  assert.notEqual(firmaDeFormato({ ...base, anchos: [180, 100] }), firmaDeFormato(base))
  assert.notEqual(firmaDeFormato({ ...base, congeladas: { filas: 2, columnas: 0 } }), firmaDeFormato(base))
})

test('firmaDeFormato: filas sin formato al final no cambian la firma', () => {
  const corta = { congeladas: {}, anchos: [], filas: [[celda({ textFormat: { bold: true } })]] }
  const larga = { congeladas: {}, anchos: [], filas: [[celda({ textFormat: { bold: true } })], [celda(null)], [celda(null)]] }
  assert.equal(firmaDeFormato(corta), firmaDeFormato(larga))
})

test('firmaDeFormato: sin lectura, no hay firma (para que el llamador falle cerrado)', () => {
  assert.equal(firmaDeFormato(null), null)
})

test('evaluarFormato: el camino feliz no protege nada', () => {
  const r = evaluarFormato({ firmaActual: 'abc', firmaGuardada: 'abc' })
  assert.equal(r.protegido, false)
  assert.equal(r.adoptar, false)
})

test('evaluarFormato: si difiere, es del dueño y no se pisa', () => {
  const r = evaluarFormato({ firmaActual: 'abc', firmaGuardada: 'xyz' })
  assert.equal(r.protegido, true)
  assert.equal(r.adoptar, false)
  assert.match(r.motivo, /tocaste/)
})

test('evaluarFormato: sin referencia previa ADOPTA y saltea una corrida (no congela para siempre)', () => {
  const r = evaluarFormato({ firmaActual: 'abc', firmaGuardada: null })
  assert.equal(r.protegido, true)
  assert.equal(r.adoptar, true)
})

test('evaluarFormato: si no se pudo leer el formato, no se toca (fail-closed) y no se adopta nada', () => {
  const r = evaluarFormato({ firmaActual: null, firmaGuardada: 'xyz' })
  assert.equal(r.protegido, true)
  assert.equal(r.adoptar, false)
})

// ═══ EL CICLO COMPLETO, contra una base y un Sheet falsos ═══

/** Cliente de Sheets falso: devuelve el formato que se le ponga y cuenta las lecturas. */
function sheetFalso(fmt) {
  const estado = { fmt, lecturas: 0, rangos: [] }
  return {
    estado,
    async readSheetUserFormats(_fileId, range) { estado.lecturas++; estado.rangos.push(range); return estado.fmt },
  }
}

const FMT_OS = { congeladas: { filas: 1 }, anchos: [100], filas: [[celda({ textFormat: { bold: true } })]] }
const FMT_DUENO = { congeladas: { filas: 1 }, anchos: [100], filas: [[celda({ textFormat: { bold: true } })], [celda({ backgroundColor: AZUL })]] }

test('ciclo: primera vez adopta y protege; sellado el formato del OS, la corrida siguiente formatea', async () => {
  const filas = baseFalsa()
  limpiarCacheFormato()
  const g = sheetFalso(FMT_OS)

  // 1ª corrida: no hay referencia → adopta lo que hay y saltea el formateo de esta vez.
  const a = await formatoGuardia(g, 'FILE', 'CAJA')
  assert.equal(a.protegido, true)
  assert.equal(filas.get('CAJA'), firmaDeFormato(FMT_OS)) // quedó adoptado

  // El OS escribe y sella. 2ª corrida: coincide → puede formatear.
  await sellarFormato(g, 'FILE', 'CAJA')
  limpiarCacheFormato()
  const b = await formatoGuardia(g, 'FILE', 'CAJA')
  assert.equal(b.protegido, false)
})

test('ciclo: el dueño pinta una celda → el OS no le pasa el formato por encima', async () => {
  const filas = baseFalsa({ CAJA: firmaDeFormato(FMT_OS) })
  limpiarCacheFormato()
  const g = sheetFalso(FMT_DUENO) // lo que hay HOY en el Sheet tiene su celda pintada

  const r = await formatoGuardia(g, 'FILE', 'CAJA')
  assert.equal(r.protegido, true)
  assert.match(r.motivo, /tocaste/)
  // Y no se adopta: su formato NO se convierte en la referencia del OS, así que sigue protegido.
  assert.equal(filas.get('CAJA'), firmaDeFormato(FMT_OS))
})

test('ciclo: si no se puede leer el formato, no se formatea (fail-closed)', async () => {
  baseFalsa({ CAJA: firmaDeFormato(FMT_OS) })
  limpiarCacheFormato()
  const g = { async readSheetUserFormats() { throw new Error('429') } }
  const r = await formatoGuardia(g, 'FILE', 'CAJA')
  assert.equal(r.protegido, true)
})

test('el formato se lee UNA vez por pestaña y por proceso, y hasta el techo declarado', async () => {
  baseFalsa({ CAJA: firmaDeFormato(FMT_OS) })
  limpiarCacheFormato()
  const g = sheetFalso(FMT_OS)
  await formatoGuardia(g, 'FILE', 'CAJA')
  await formatoGuardia(g, 'FILE', 'CAJA')
  await formatoGuardia(g, 'FILE', 'CAJA')
  assert.equal(g.estado.lecturas, 1)
  assert.equal(g.estado.rangos[0], `CAJA!A1:BZ${TECHO_FILAS_FORMATO}`)
})

test('sellar invalida la caché: lo que se sella es el formato POSTERIOR a la escritura', async () => {
  const filas = baseFalsa({ CAJA: firmaDeFormato(FMT_OS) })
  limpiarCacheFormato()
  const g = sheetFalso(FMT_OS)
  await formatoGuardia(g, 'FILE', 'CAJA') // deja FMT_OS en caché
  g.estado.fmt = FMT_DUENO // el OS escribió y ahora la pestaña se ve distinto
  await sellarFormato(g, 'FILE', 'CAJA')
  assert.equal(filas.get('CAJA'), firmaDeFormato(FMT_DUENO))
})
