import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// ═══ DOBLE DE LA BASE — registrado ANTES de que nadie importe db.mjs ═══
//
// La huella no acepta un `query` inyectado: importa `./db.mjs` de forma dinámica. Interceptar ese
// único módulo hace que la decisión REAL corra —`aplicarHuella`, `leerHuellas`, `guardarHuellas`—
// contra una base controlada. No se simula la decisión: se simula la base.
const estado = { huellas: [], caida: false, escrituras: [] }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbPropiedad(...a)' }
  },
})
globalThis.__dbPropiedad = async (sql) => {
  if (estado.caida) throw new Error('sin base')
  const s = String(sql)
  if (/select fila, col, forma, huella/.test(s)) return { rows: estado.huellas }
  if (/^\s*(create|alter|delete|insert)/i.test(s)) { estado.escrituras.push(s.slice(0, 40)); return { rows: [] } }
  return { rows: [] }
}

const { formaDe } = await import('./huella-forma.mjs')
const { huellaDe } = await import('./huella-celda.mjs')
const { filtrarValues, clasificarGrilla, bloquesEscribibles, ventanaDeRango, avisarRespetadas } = await import('./propiedad-celda.mjs')
const { VACIO, MIA_PROBADA } = await import('./no-borrar.mjs')

/** Registra una huella propia de `valor` en (fila, col) — la evidencia de "esta celda la escribí yo". */
function sellar(fila, col, valor) {
  estado.huellas.push({ fila, col, forma: formaDe(valor), huella: huellaDe(valor), borrada_en: null, abandonada_en: null })
}

/** Cliente de Sheets falso: devuelve `vivo` como lectura FORMULA del rango pedido. */
function clienteCon(vivo, { fallaLectura = false } = {}) {
  const leidos = []
  return {
    leidos,
    async readSheetValues(_f, range) {
      leidos.push(range)
      if (fallaLectura) throw new Error('429')
      return vivo
    },
  }
}

function reset() { estado.huellas = []; estado.caida = false; estado.escrituras = [] }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('ventanaDeRango: ancla + grilla = footprint (no el ancla sola)', () => {
  assert.deepEqual(ventanaDeRango('Proveedores!A121', [['a', 'b'], ['c', 'd']]),
    { tab: 'Proveedores', fila0: 121, col0: 0, alto: 2, ancho: 2 })
  assert.deepEqual(ventanaDeRango("'Cheques Emitidos'!C5:E7", [['x']]),
    { tab: 'Cheques Emitidos', fila0: 5, col0: 2, alto: 3, ancho: 3 })
  // Sin filas delimitadas no hay coordenada: la propiedad por celda no puede decidir.
  assert.equal(ventanaDeRango('Compras!A:P', [['x']]), null)
  assert.equal(ventanaDeRango('A1:B2', [['x']]), null)
})

test('clasificarGrilla: el payload vacío NUNCA limpia una celda con contenido', () => {
  const g = [['', 'nuevo']]
  const actual = [['lo del dueño', '']]
  const veredicto = [['', 'nuevo']]
  const c = clasificarGrilla(g, actual, veredicto)
  assert.equal(c.escribible[0][0], false, 'el "" sobre contenido no se escribe')
  assert.equal(c.escribible[0][1], true)
})

test('clasificarGrilla: el centinela VACIO limpia SÓLO si la huella probó que la celda es mía', () => {
  const c = clasificarGrilla([[VACIO, VACIO]], [['residuo mío', 'algo tuyo']], [[MIA_PROBADA, '']])
  assert.equal(c.escribible[0][0], true)
  assert.equal(c.payload[0][0], '', 'la limpieza probada se manda como vacío, no como centinela')
  assert.equal(c.escribible[0][1], false)
  assert.equal(c.respetadas.length, 1)
})

test('bloquesEscribibles: sin nada respetado sale UN bloque; una celda respetada parte su fila', () => {
  const todo = bloquesEscribibles([[true, true], [true, true]], [['a', 'b'], ['c', 'd']])
  assert.equal(todo.length, 1)
  assert.deepEqual(todo[0].values, [['a', 'b'], ['c', 'd']])
  const conHueco = bloquesEscribibles(
    [[true, true, true], [true, false, true], [true, true, true]],
    [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  )
  // La fila del medio se parte en dos y las de arriba y abajo quedan enteras: cuatro rectángulos,
  // no doscientas celdas sueltas. Y ninguno menciona la celda respetada (fila 1, col 1).
  assert.deepEqual(conHueco.map((b) => [b.i0, b.iFin, b.desde, b.hasta]),
    [[0, 0, 0, 2], [1, 1, 0, 0], [1, 1, 2, 2], [2, 2, 0, 2]])
  assert.equal(conHueco.flatMap((b) => b.values.flat()).includes(5), false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CICLO COMPLETO CONTRA UN SHEET Y UNA BASE FALSOS
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// Una ventana de 3×4 sobre "Proveedores!A10". Diez celdas con huella propia que hoy siguen igual
// —así el mapa ALINEA (≥8 comparables, ≥60%)— más las tres situaciones que hay que separar.
function escenario() {
  reset()
  const mias = [
    [10, 0, 'Proveedor'], [10, 1, 'Saldo'], [10, 2, 'Vence'], [10, 3, 'Qué hacer'],
    [11, 0, 'Acindar'], [11, 1, '=SUM(B1:B2)'], [11, 2, '2026-09-10'],
    [12, 0, 'Ferrum'], [12, 1, '=SUM(C1:C2)'], [12, 2, '2026-09-12'],
  ]
  for (const [f, c, v] of mias) sellar(f, c, v)
  const generado = [
    ['Proveedor', 'Saldo', 'Vence', 'Qué hacer'],
    ['Acindar', '=SUM(B1:B2)', '2026-09-10', 'pagar el viernes'],
    ['Ferrum', '=SUM(C1:C2)', '2026-09-12', 'esperar'],
  ]
  const vivo = [
    ['Proveedor', 'Saldo', 'Vence', 'Qué hacer'],
    ['Acindar', '=SUM(B1:B2)', '2026-09-10', 'LLAMAR A JUAN'], // ← D11: la escribió el dueño (sin huella)
    ['Ferrum', '=SUM(C1:C2)', '2026-09-12', ''],
  ]
  return { generado, vivo }
}

test('(e) sin huella y con contenido tuyo: la celda se RESPETA y el rango se recorta', async () => {
  const { generado, vivo } = escenario()
  const cliente = clienteCon(vivo)
  const r = await filtrarValues(cliente, 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  const respetada = r.respetadas.find((x) => x.celda === 'D11')
  assert.ok(respetada, `D11 tenía que quedar respetada; quedaron: ${r.respetadas.map((x) => x.celda).join(',')}`)
  assert.equal(respetada.valorDueno, 'LLAMAR A JUAN')
  assert.equal(respetada.valorOs, 'pagar el viernes')
  // MUTACIÓN REAL: ninguna de las entradas que salen puede mencionar D11.
  const tocaD11 = r.data.some((d) => {
    const v = ventanaDeRango(d.range, d.values)
    if (!v) return false
    for (let i = 0; i < d.values.length; i++) {
      for (let j = 0; j < (d.values[i] || []).length; j++) {
        if (v.fila0 + i === 11 && v.col0 + j === 3) return true
      }
    }
    return false
  })
  assert.equal(tocaD11, false, 'el recorte dejó D11 adentro del pedido: la escritura la pisaría')
  // Y lo que sí es mío se sigue escribiendo: la pestaña no se congela.
  assert.ok(r.data.length >= 1)
  const escritas = r.data.flatMap((d) => d.values.flat())
  assert.ok(escritas.includes('Acindar'), 'la pestaña dejó de mantenerse sola: eso es el candado que el dueño no quiere')
})

test('(a) huella propia que coincide: la celda se escribe', async () => {
  const { generado, vivo } = escenario()
  const r = await filtrarValues(clienteCon(vivo), 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  assert.equal(r.respetadas.some((x) => x.celda === 'B12'), false)
  const escritas = r.data.flatMap((d) => d.values.flat())
  assert.ok(escritas.includes('=SUM(C1:C2)'))
})

test('(g) celda con huella propia y HOY vacía: la borraste vos, no vuelve nunca', async () => {
  const { generado, vivo } = escenario()
  sellar(12, 3, 'esperar')            // la celda D12 la escribió el OS…
  vivo[2][3] = ''                     // …y hoy está vacía: el dueño la borró
  const r = await filtrarValues(clienteCon(vivo), 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  const b = r.respetadas.find((x) => x.celda === 'D12')
  assert.ok(b, 'una celda que el dueño vació y el OS quiere reponer tiene que quedar respetada')
  assert.equal(b.causa, 'borrada por el dueño')
  const escritas = r.data.flatMap((d) => d.values.flat())
  assert.equal(escritas.includes('esperar'), false, 'se repuso lo que el dueño borró')
})

test('(f) payload vacío sobre contenido: se conserva; sobre vacío, pasa', async () => {
  const { generado, vivo } = escenario()
  generado[1][3] = ''                 // el generador manda "esta columna no es mía"
  const r = await filtrarValues(clienteCon(vivo), 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  const tocaD11 = r.data.some((d) => {
    const v = ventanaDeRango(d.range, d.values)
    return v && v.fila0 <= 11 && v.fila0 + d.values.length - 1 >= 11 && v.col0 <= 3 && v.col0 + (d.values[0] || []).length - 1 >= 3
  })
  assert.equal(tocaD11, false, 'un "" del generador borró la celda que el dueño escribió')
})

test('(c) sin huella pero el contenido YA es lo que voy a escribir: se escribe y se sella', async () => {
  const { generado, vivo } = escenario()
  vivo[1][3] = 'pagar el viernes'     // coincide exactamente con lo generado, y la fila 11 está probada mía
  const r = await filtrarValues(clienteCon(vivo), 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  assert.equal(r.respetadas.some((x) => x.celda === 'D11'), false,
    'una celda que ya dice exactamente lo mío, en una fila probada mía, no es del dueño')
})

test('base caída: no se escribe sobre NINGUNA celda con contenido, sí sobre las vacías (fail-closed)', async () => {
  const { generado, vivo } = escenario()
  estado.caida = true
  const r = await filtrarValues(clienteCon(vivo), 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  const conContenido = r.respetadas.map((x) => x.celda).sort()
  assert.ok(conContenido.includes('A10') && conContenido.includes('D11'),
    `sin base tiene que respetar todo lo que tiene contenido; respetó: ${conContenido.join(',')}`)
  assert.ok(r.respetadas.every((x) => /sin base/.test(x.causa)))
  // D12 está vacía en la hoja: escribir ahí no puede destruir nada, y por eso sí pasa.
  const escritas = r.data.flatMap((d) => d.values.flat())
  assert.deepEqual(escritas, ['esperar'])
})

test('no se puede releer el destino: el rango entero se descarta (fail-closed)', async () => {
  const { generado, vivo } = escenario()
  const r = await filtrarValues(clienteCon(vivo, { fallaLectura: true }), 'FILE', [{ range: 'Proveedores!A10', values: generado }])
  assert.deepEqual(r.data, [])
  assert.equal(r.descartados.length, 1)
})

test('una pestaña espejo (_RAW) pasa intacta: no hay nada del dueño que proteger', async () => {
  const cliente = clienteCon([[]])
  const data = [{ range: '_BANCO_RAW!A1', values: [['x', 'y']] }]
  const r = await filtrarValues(cliente, 'FILE', data)
  assert.deepEqual(r.data, data)
  assert.equal(cliente.leidos.length, 0, 'un espejo no debería costar ni una lectura')
})

test('(j) mover un bloque 3×2: ni el origen se rellena ni el destino se pisa', async () => {
  reset()
  // El OS escribió un bloque de 3×2 en B20:C22 y lo selló. El dueño lo movió a B26:C28 (cortar/pegar).
  const bloque = [['Ana', 100], ['Beto', 200], ['Caro', 300]]
  const anclas = [[20, 0, 'ítem'], [21, 0, 'ítem'], [22, 0, 'ítem'], [23, 0, 'ítem'],
    [24, 0, 'ítem'], [25, 0, 'ítem'], [26, 0, 'ítem'], [27, 0, 'ítem'], [28, 0, 'ítem']]
  for (const [f, c, v] of anclas) sellar(f, c, v)
  bloque.forEach((f, i) => f.forEach((v, j) => sellar(20 + i, 1 + j, v)))
  const generado = []
  const vivo = []
  for (let i = 0; i < 9; i++) {
    const fila = 20 + i
    generado.push(['ítem', ...(fila <= 22 ? bloque[i] : ['', ''])])
    vivo.push(['ítem', ...(fila >= 26 ? bloque[fila - 26] : ['', ''])])
  }
  const r = await filtrarValues(clienteCon(vivo), 'FILE', [{ range: 'Cobranzas!A20', values: generado }])
  const escritas = new Set(r.data.flatMap((d) => d.values.flat()))
  assert.equal(escritas.has('Ana'), false, 'el origen se rellenó: el OS reescribió el bloque que el dueño movió')
  const pisadas = r.data.filter((d) => {
    const v = ventanaDeRango(d.range, d.values)
    return v && v.fila0 + d.values.length - 1 >= 26 && v.col0 <= 2 && v.col0 + (d.values[0] || []).length - 1 >= 1
  })
  for (const d of pisadas) {
    const vt = ventanaDeRango(d.range, d.values)
    d.values.forEach((f, i) => f.forEach((_, j) => {
      const fila = vt.fila0 + i; const col = vt.col0 + j
      assert.ok(!(fila >= 26 && col >= 1), `el destino B/C${fila} se iba a pisar: el bloque movido no se respetó`)
    }))
  }
})

test('avisarRespetadas: una línea por pestaña, con las celdas nombradas', () => {
  const lineas = []
  avisarRespetadas([
    { pestana: 'Proveedores', celda: 'D11' }, { pestana: 'Proveedores', celda: 'B7' },
    { pestana: 'CAJA', celda: 'A1' },
  ], (l) => lineas.push(l))
  assert.equal(lineas.length, 2)
  assert.match(lineas[0], /✋ 2 celda\(s\) tuya\(s\) respetada\(s\) en Proveedores: D11, B7/)
  assert.match(lineas[1], /CAJA: A1/)
})
