// El worker de notas «Qué hacer» con un Sheet y una base de mentira: aplica, rechaza por conflicto y
// NUNCA pisa lo que cambió en el Sheet después del pedido.
import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarNota, procesarColaNotas } from './cola-nota.mjs'
import { formulaNota } from '../../lib/proveedores-notas-columna.mjs'

const F = (n) => `=IF($A${n}="";"";IFERROR(VLOOKUP($A${n};'_PROVEEDORES_OS'!$A:$C;3;FALSE);""))`

/**
 * Un Flujo de Caja en memoria: la D de Proveedores muestra la auxiliar por búsqueda, como en el archivo.
 * `dAMano` pisa la fórmula de la D de un proveedor con un texto (o '' para vaciarla).
 */
function sheetFalso({ aux, proveedores = ['Hormiserv', 'Robles'], dAMano = {}, congelado = false }) {
  const escrituras = []
  const auxF = aux.map((f) => [...f])
  const celdaD = new Map(proveedores.map((p, i) => [18 + i, dAMano[p] ?? F(18 + i)]))
  for (let n = 18 + proveedores.length; n <= 22; n++) celdaD.set(n, F(n))
  const buscar = (p) => T(auxF.find((f, k) => k > 0 && T(f[0]).toLowerCase() === T(p).toLowerCase())?.[2])
  const mostrar = (n) => {
    const f = celdaD.get(n)
    return String(f ?? '').startsWith('=') ? buscar(proveedores[n - 18] ?? '') : f
  }
  const hoja = (render) => {
    const filas = Array.from({ length: 24 }, () => [])
    filas[13] = ['1 · QUÉ SE DEBE Y CUÁNDO']; filas[15] = ['⇒ Detalle − titular']
    filas[16] = ['Proveedor', 'Se le debe', 'Primer vencimiento', 'Qué hacer']
    for (const [n, f] of celdaD) filas[n - 1] = [proveedores[n - 18] ?? '', proveedores[n - 18] ? '1.000' : '', '', render === 'FORMULA' ? f : mostrar(n)]
    filas[22] = ['1.1 · CADA OPERACIÓN']; filas[23] = ['2 · QUÉ SALE CADA DÍA']
    return filas
  }
  return {
    escrituras, auxF,
    async readSheetValues(_id, rango, { render } = {}) {
      if (rango.startsWith('Proveedores!A1')) return hoja(render)
      let m = rango.match(/^Proveedores!D(\d+)$/)
      if (m) return [[mostrar(Number(m[1]))]]
      m = rango.match(/_PROVEEDORES_OS'!A(\d+):C\d+$/)
      if (m && rango.includes('A1:C600')) return auxF
      if (m) return [auxF[Number(m[1]) - 1] ?? []]
      throw new Error(`rango inesperado ${rango}`)
    },
    async batchUpdateValues(_id, data, { confirmacion }) {
      if (congelado) return { congelado: true }
      assert.ok(confirmacion?.actor, 'sin nombre no se escribe')
      for (const d of data) {
        escrituras.push([d.range, d.values[0][0]])
        const m = d.range.match(/_PROVEEDORES_OS'!([AC])(\d+)$/)
        if (m) { const f = (auxF[Number(m[2]) - 1] ??= ['', '', '']); f[m[1] === 'A' ? 0 : 2] = d.values[0][0] }
        const p = d.range.match(/^Proveedores!D(\d+)$/)
        if (p) celdaD.set(Number(p[1]), d.values[0][0])
      }
      return {}
    },
  }
}
const T = (v) => String(v ?? '').trim()

/** Una base de mentira: la nota guardada, el perfil y lo que se cierra. */
function baseFalsa({ nota }) {
  const notas = new Map(nota === undefined ? [] : [['hormiserv', nota]])
  const cierres = []
  return {
    notas, cierres,
    async query(sql, params = []) {
      if (sql.includes('from public.perfiles')) return { rows: [{ nombre: 'Jorge Corona' }] }
      if (sql.includes('select nota from public.proveedor_notas')) return { rows: notas.has(params[0]) ? [{ nota: notas.get(params[0]) }] : [] }
      if (sql.includes('insert into public.proveedor_notas')) { notas.set(params[2], params[3]); return { rows: [] } }
      if (sql.includes('delete from public.proveedor_notas')) { for (const c of params[1]) notas.delete(c); return { rows: [] } }
      if (sql.includes('update public.proveedor_nota_cambio')) { cierres.push({ estado: params[1] ?? 'pendiente', motivo: params[2] ?? params[1] }); return { rows: [] } }
      throw new Error(`sql inesperado: ${sql.slice(0, 60)}`)
    },
  }
}
const AUX = [['Proveedor', 'CUIT', 'Qué hacer'], ['Alumetal', '30-1', 'no es prioridad'], ['Hormiserv', '30-2', 'esperar al cobrador'], ['', '', '']]
const pedido = (o = {}) => ({ id: 'p1', clave: 'hormiserv', proveedor: 'Hormiserv', nota_anterior: 'esperar al cobrador', nota_nueva: 'pagar con cheque a 15', pedido_por: 'u1', intentos: 1, ...o })

test('APLICA: escribe la C de la auxiliar, la D la muestra, y recién entonces cambia la base', async () => {
  const google = sheetFalso({ aux: AUX })
  const port = baseFalsa({ nota: 'esperar al cobrador' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'aplicado')
  assert.deepEqual(google.escrituras, [["'_PROVEEDORES_OS'!C3", 'pagar con cheque a 15']])
  assert.equal(port.notas.get('hormiserv'), 'pagar con cheque a 15')
  assert.match(port.cierres.at(-1).motivo, /escritas por Jorge Corona/)
})

test('RECHAZA POR CONFLICTO: la base ya trae otra nota del Sheet — no escribe nada y no toca la base', async () => {
  const google = sheetFalso({ aux: AUX })
  const port = baseFalsa({ nota: 'no pagar hasta octubre' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'rechazado')
  assert.deepEqual(google.escrituras, [])
  assert.equal(port.notas.get('hormiserv'), 'no pagar hasta octubre')
  assert.match(port.cierres.at(-1).motivo, /conflicto: gana el Sheet: la nota ya dice «no pagar hasta octubre»/)
})

test('NO PISA: el dueño escribió en la D y la sonda todavía no lo leyó', async () => {
  const google = sheetFalso({ aux: AUX, dAMano: { Hormiserv: 'lo llamo el lunes' } })
  const port = baseFalsa({ nota: 'esperar al cobrador' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'rechazado')
  assert.deepEqual(google.escrituras, [])
  assert.match(port.cierres.at(-1).motivo, /escrito a mano/)
})

test('NO PISA: el dueño vació la D (borró la nota) y la sonda todavía no lo leyó', async () => {
  const google = sheetFalso({ aux: AUX, dAMano: { Hormiserv: '' } })
  const port = baseFalsa({ nota: 'esperar al cobrador' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'rechazado')
  assert.deepEqual(google.escrituras, [])
})

test('NO PISA: alguien tocó la auxiliar a mano', async () => {
  const aux = AUX.map((f) => [...f]); aux[2][2] = 'otra cosa'
  const google = sheetFalso({ aux })
  const port = baseFalsa({ nota: 'esperar al cobrador' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'rechazado')
  assert.deepEqual(google.escrituras, [])
})

test('texto a mano IGUAL a lo que la app vio: la auxiliar quedó vieja, se escribe y se repone la fórmula en la D', async () => {
  const aux = AUX.map((f) => [...f]); aux[2][2] = 'nota de antes del lunes'
  const google = sheetFalso({ aux, dAMano: { Hormiserv: 'esperar al cobrador' } })
  const port = baseFalsa({ nota: 'esperar al cobrador' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'aplicado')
  assert.deepEqual(google.escrituras.map(([r]) => r), ['Proveedores!D18', "'_PROVEEDORES_OS'!C3"])
  // La MISMA fórmula que escriben los generadores (lib/proveedores-notas-columna.mjs), no una copia.
  assert.equal(google.escrituras[0][1], formulaNota(18, 'A'))
})

test('proveedor sin fila en la auxiliar: se agrega en la primera vacía', async () => {
  const google = sheetFalso({ aux: AUX, proveedores: ['Robles', 'Nuevo SRL'] })
  const port = baseFalsa({ nota: undefined })
  const r = await aplicarNota({ port, google, fileId: 'x', pedido: pedido({ clave: 'nuevo srl', proveedor: 'Nuevo SRL', nota_anterior: '', nota_nueva: 'pedir CUIT' }) })
  assert.equal(r, 'aplicado')
  assert.deepEqual(google.escrituras, [["'_PROVEEDORES_OS'!A4", 'Nuevo SRL'], ["'_PROVEEDORES_OS'!C4", 'pedir CUIT']])
  assert.equal(port.notas.get('nuevo srl'), 'pedir CUIT')
})

test('freno de mano puesto: difiere y la base no cambia', async () => {
  const google = sheetFalso({ aux: AUX, congelado: true })
  const port = baseFalsa({ nota: 'esperar al cobrador' })
  assert.equal(await aplicarNota({ port, google, fileId: 'x', pedido: pedido() }), 'diferido')
  assert.equal(port.notas.get('hormiserv'), 'esperar al cobrador')
})

test('sin la migración de la cola, el worker no hace nada', async () => {
  const port = { query: async () => ({ rows: [{ hay: false }] }) }
  assert.deepEqual(await procesarColaNotas({ port, google: {}, dry: false }), { sinCola: true })
})
