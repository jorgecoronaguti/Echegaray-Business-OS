// LA OBRA ELEGIDA EN LA APP DICE EN QUÉ PUNTO DEL VIAJE AL SHEET ESTÁ (18/09/2026).
//
// Antes la pantalla decía «quedó en cola» y nunca más; un pedido rechazado por el worker se veía
// como una obra que desaparecía sola en el sync siguiente.

import test from 'node:test'
import assert from 'node:assert/strict'
import { obraEnCola, ultimoPorFila } from './obraDeCompraService.ts'
import { estadoEnSheet, leyendaDeSheet } from './pagoDeCompra.ts'

/** Un Supabase de mentira: registra la cadena y devuelve lo que se le diga. */
function supabaseFalso(respuesta: { data: unknown; error: unknown }) {
  const llamadas: Record<string, unknown[]> = {}
  const anotar = (k: string, ...a: unknown[]) => { (llamadas[k] ??= []).push(a) }
  type Paso = (...a: unknown[]) => Cadena
  type Cadena = { select: Paso; eq: Paso; in: Paso; order: Paso; then: (ok: (v: unknown) => unknown) => Promise<unknown> }
  const paso = (m: string): Paso => (...a) => { anotar(m, ...a); return cadena }
  const cadena: Cadena = {
    select: paso('select'), eq: paso('eq'), in: paso('in'), order: paso('order'),
    then: (ok) => Promise.resolve(respuesta).then(ok),
  }
  const from = (t: string) => { anotar('from', t); return cadena }
  return { supabase: { from } as never, llamadas }
}

test('pide a la base sólo Compras · obra de las filas dadas, de nueva a vieja, y se queda con el último por fila', async () => {
  const { supabase, llamadas } = supabaseFalso({
    data: [
      { fila: 889, estado: 'rechazado', motivo: 'celda_cambio: la celda Obra de la fila 889 dice «OB-0006 · LE» y la pantalla vio «vacía»: no la piso', creado_at: '2026-09-18T12:01:00Z' },
      { fila: 889, estado: 'aplicado', motivo: 'Compras!L889 escrita', creado_at: '2026-09-16T11:52:06Z' },
      { fila: 906, estado: 'pendiente', motivo: null, creado_at: '2026-09-18T12:00:00Z' },
    ],
    error: null,
  })
  const r = await obraEnCola(supabase, [889, 906, 3, Number.NaN])
  assert.deepEqual(llamadas.from, [['compra_obra_cambio']])
  assert.deepEqual(llamadas.eq, [['pestana', 'Compras'], ['tipo', 'obra']], 'la cola lleva Cobranzas y pagos: se filtra')
  assert.deepEqual(llamadas.in, [['fila', [889, 906]]], 'filas inválidas no viajan')
  assert.deepEqual(llamadas.order, [['creado_at', { ascending: false }]])
  assert.equal(r.get(889)?.estado, 'rechazado', 'gana el pedido más nuevo, no el aplicado viejo')
  assert.equal(r.get(906)?.estado, 'pendiente')
  // Y lo que la pantalla dibuja con eso: la MISMA leyenda que la del pago.
  assert.equal(leyendaDeSheet(estadoEnSheet(r.get(906)), r.get(906)?.motivo)?.texto, 'pendiente de Sheet')
  assert.match(leyendaDeSheet(estadoEnSheet(r.get(889)), r.get(889)?.motivo)?.texto ?? '', /no la piso/)
})

test('sin filas no consulta; con error (o sin la migración) devuelve vacío y la pantalla no rompe', async () => {
  const sin = supabaseFalso({ data: null, error: { message: 'column tipo does not exist' } })
  assert.equal((await obraEnCola(sin.supabase, [])).size, 0)
  assert.equal(sin.llamadas.from, undefined, 'sin filas no hay viaje')
  assert.equal((await obraEnCola(sin.supabase, [10])).size, 0)
  assert.equal(leyendaDeSheet(estadoEnSheet(undefined), null), null, 'una fila que nadie tocó no lleva leyenda')
})

test('ultimoPorFila es pura y respeta el orden que le dan', () => {
  const m = ultimoPorFila([
    { fila: 1, estado: 'aplicado', motivo: null },
    { fila: 1, estado: 'pendiente', motivo: null },
  ])
  assert.equal(m.get(1)?.estado, 'aplicado')
})
