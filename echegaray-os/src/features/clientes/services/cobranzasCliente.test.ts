// LAS REGLAS DE LA SOLAPA COBRANZAS, PROBADAS SOBRE LAS FILAS REALES DEL SHEET.
//
// Lo que estos casos impiden: que un total no cuadre con las filas que tiene debajo, que una fila
// anulada se sume, que el recorte esconda plata sin decirlo, y que las filas que la imputación no
// pudo atar a una obra desaparezcan de la pantalla — que es como el dueño perdería $47,6 M de vista
// sin que nada se ponga rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparCobranzas, comprobanteDe, estadoDe, proximoCobro, recortar, totalesDeCobranzas,
  type FilaCobranza,
} from './cobranzasCliente.ts'
import { COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI } from './cobranzasReales.fixture.ts'

const OBRAS_MESSINA = [
  { obra_id: 'messina-bsa', nombre: 'ME - BSA' },
  { obra_id: 'messina-playon-azufre', nombre: 'ME - PLAYÓN DE AZUFRE' },
  { obra_id: 'messina-pisos-120-rampa', nombre: 'ME - PISOS 120 M² Y RAMPA' },
  { obra_id: 'messina-adicional-tercer-muro', nombre: 'ME - ADICIONAL TERCER MURO' },
  { obra_id: 'messina-playon-dilucion-acido', nombre: 'ME - PLAYÓN DILUCIÓN' },
]

test('el fixture es la pestaña: 24 filas de Messina y 14 de Quattropani', () => {
  // Si el archivo se regenera y cambia de tamaño, esto avisa. No es un dato clavado: es la prueba
  // de que los casos de abajo corren sobre la pestaña entera y no sobre un recorte.
  assert.equal(COBRANZAS_MESSINA.length, 24)
  assert.equal(COBRANZAS_QUATTROPANI.length, 14)
})

test('el total del cliente es la suma de los totales de sus grupos, siempre', () => {
  // ES LA REGLA QUE HACE AUDITABLE LA PANTALLA: la cabecera no puede decir un número y los grupos
  // otro. Si una fila se cae de todos los grupos, esta cuenta se rompe.
  for (const filas of [COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI]) {
    const grupos = agruparCobranzas(filas, OBRAS_MESSINA)
    const total = totalesDeCobranzas(filas)
    const sumaDeGrupos = (campo: 'facturado' | 'cobrado' | 'pendiente' | 'vencido') =>
      grupos.reduce((a, g) => a + (g.totales[campo] ?? 0), 0)
    for (const campo of ['facturado', 'cobrado', 'pendiente', 'vencido'] as const) {
      assert.equal(
        Math.round(sumaDeGrupos(campo)), Math.round(total[campo] ?? 0),
        `«${campo}» del cliente no cuadra con la suma de sus grupos`,
      )
    }
    assert.equal(grupos.reduce((a, g) => a + g.filas.length, 0), filas.length,
      'alguna fila no entró en ningún grupo: la pantalla la perdería sin decirlo')
  }
})

test('las filas que ningún papel ató a una obra van a un grupo propio, y al final', () => {
  const grupos = agruparCobranzas(COBRANZAS_MESSINA, OBRAS_MESSINA)
  const sueltas = grupos.filter((g) => g.obra_id === null)
  assert.equal(sueltas.length, 1, 'hay un solo grupo de sueltas, o ninguno')
  if (sueltas.length) {
    assert.equal(grupos[grupos.length - 1].obra_id, null, 'el grupo sin obra va último')
    assert.ok(sueltas[0].filas.length > 0)
  }
})

test('una fila anulada se ve pero no se cuenta, y se dice cuántas son', () => {
  const anulada: FilaCobranza = {
    ...COBRANZAS_MESSINA[0], cobranza_id: 'x', esta_cancelada: true, esta_cobrada: false,
    estado: 'CANCELAR', total_bruto: 999_999_999, categoria: 'B',
  }
  const conAnulada = [...COBRANZAS_MESSINA, anulada]
  const antes = totalesDeCobranzas(COBRANZAS_MESSINA)
  const despues = totalesDeCobranzas(conAnulada)
  assert.equal(despues.facturado, antes.facturado, 'la anulada engordó el facturado')
  assert.equal(despues.pendiente, antes.pendiente)
  assert.equal(despues.anuladas, 1, 'sin este número, una fila que no cuenta desaparece en silencio')
  assert.equal(despues.filas, antes.filas)
  // Y SIGUE APARECIENDO en el recorte «Todo»: esconderla es cómo un total deja de cuadrar contra el
  // Sheet sin que nadie sepa por qué.
  assert.equal(recortar(conAnulada, 'todo').length, conAnulada.length)
  assert.equal(estadoDe(anulada), 'anulado')
})

test('el facturado suma las filas B y ninguna N: son dos universos', () => {
  // «Lo que se factura es Cobranzas B» (decisión del dueño). Una fila N no tiene comprobante y
  // sumarla al facturado inventaría IVA que no existe.
  const total = totalesDeCobranzas(COBRANZAS_MESSINA)
  const soloB = COBRANZAS_MESSINA
    .filter((f) => f.categoria === 'B' && !f.esta_cancelada)
    .reduce((a, f) => a + (f.total_bruto ?? 0), 0)
  assert.equal(Math.round(total.facturado ?? 0), Math.round(soloB))
  const conN = COBRANZAS_MESSINA.some((f) => f.categoria === 'N')
  assert.ok(conN, 'el fixture tiene que tener filas N, si no este caso no prueba nada')
})

test('lo cobrado es percibido y lo pendiente es lo que falta: nunca se pisan', () => {
  for (const filas of [COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI]) {
    const t = totalesDeCobranzas(filas)
    const vivas = filas.filter((f) => !f.esta_cancelada)
    const suma = vivas.reduce((a, f) => a + (f.total_bruto ?? 0), 0)
    assert.equal(
      Math.round((t.cobrado ?? 0) + (t.pendiente ?? 0)), Math.round(suma),
      'cobrado + pendiente tiene que dar el total vivo: si no, hay filas contadas dos veces o ninguna',
    )
    // Y lo vencido es un SUBCONJUNTO de lo pendiente, nunca un quinto total suelto.
    assert.ok((t.vencido ?? 0) <= (t.pendiente ?? 0))
  }
})

test('el próximo cobro suma TODAS las filas de ese día, no la primera', () => {
  // San Francisco cobra tres cuotas el 18/09: publicar una diría que ese día entra un tercio.
  const dia = '2026-09-30'
  const base = COBRANZAS_MESSINA[0]
  const dos: FilaCobranza[] = [
    { ...base, cobranza_id: 'a', esta_cobrada: false, esta_cancelada: false, fecha_cobro: dia, total_bruto: 100, forma_cobro: 'Transferencia' },
    { ...base, cobranza_id: 'b', esta_cobrada: false, esta_cancelada: false, fecha_cobro: dia, total_bruto: 50, forma_cobro: 'Transferencia' },
    { ...base, cobranza_id: 'c', esta_cobrada: false, esta_cancelada: false, fecha_cobro: '2026-12-01', total_bruto: 999, forma_cobro: 'Efectivo' },
  ]
  assert.deepEqual(proximoCobro(dos), { fecha: dia, medio: 'Transferencia', importe: 150 })
})

test('sin ninguna fila pendiente no se inventa un próximo cobro', () => {
  const cobradas = COBRANZAS_MESSINA.map((f) => ({ ...f, esta_cobrada: true }))
  assert.equal(proximoCobro(cobradas), null)
})

test('los recortes no inventan filas ni las pierden', () => {
  const filas = COBRANZAS_MESSINA
  assert.equal(recortar(filas, 'todo').length, filas.length)
  const pendiente = recortar(filas, 'pendiente')
  const cobrado = recortar(filas, 'cobrado')
  const anuladas = filas.filter((f) => f.esta_cancelada).length
  assert.equal(pendiente.length + cobrado.length + anuladas, filas.length,
    'pendiente + cobrado + anuladas tiene que ser el total: un recorte no puede duplicar una fila')
  assert.equal(recortar(filas, 'b').length + recortar(filas, 'n').length, filas.length)
})

test('el comprobante se escribe como se lee, y una fila sin comprobante no lo inventa', () => {
  assert.equal(comprobanteDe({ ...COBRANZAS_MESSINA[0], factura: 'FA', numero_comprobante: '230' }), 'FA 230')
  assert.equal(comprobanteDe({ ...COBRANZAS_MESSINA[0], factura: null, numero_comprobante: null }), null)
})

test('el estado de una fila es UNO, y el peor manda', () => {
  const base = COBRANZAS_MESSINA[0]
  assert.equal(estadoDe({ ...base, esta_cobrada: true, esta_vencida: false, esta_cancelada: false }), 'cobrado')
  assert.equal(estadoDe({ ...base, esta_cobrada: false, esta_vencida: true, esta_cancelada: false }), 'vencido')
  assert.equal(estadoDe({ ...base, esta_cobrada: false, esta_vencida: false, esta_cancelada: false }), 'pendiente')
  // Una fila anulada NO puede leerse como cobrada aunque la réplica traiga la marca puesta.
  assert.equal(estadoDe({ ...base, esta_cobrada: true, esta_cancelada: true }), 'anulado')
})
