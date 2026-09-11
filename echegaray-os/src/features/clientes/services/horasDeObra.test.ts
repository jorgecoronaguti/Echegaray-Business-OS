import test from 'node:test'
import assert from 'node:assert/strict'
import { armarHorasPorObra, inicioDeObra, textoHH, tituloHH } from './horasDeObra.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA AUSENCIA SE DIBUJE COMO UN CERO. Es la regla de oro que este módulo puede violar de
//      tres formas distintas, porque tiene TRES ausencias: la obra sin horas («—»), el rol que no
//      las puede ver (vacío) y la obra que todavía no arrancó (su fecha PREVISTA, apagada). Si las
//      dos primeras se confunden, la ficha dice «este trabajo no tiene horas» sobre una obra con
//      12.525 h cargadas.
//  2 · QUE EL `null` DE LA RPC SE VUELVA UN MAP VACÍO. `armarHorasPorObra(null)` tiene que devolver
//      `null`: es la única forma que tiene la pantalla de callarse en vez de mentir.
//  3 · QUE LA FECHA SE CORRA UN DÍA. `new Date('2026-01-05')` es medianoche UTC y en Buenos Aires
//      (−3) se lee 04/01. El inicio de San Francisco es el 05/01 y tiene que decir 05/01.
//  4 · QUE EL NÚMERO LLEGUE COMO TEXTO Y LA CELDA QUEDE VACÍA TENIENDO EL DATO: un `numeric` de
//      Postgres puede viajar como cadena.

/** La fila real de Quattropani, medida en la base el 11/09/2026. */
const QUATTROPANI = {
  obra_id: 'quattropani', hh_real: 551, hh_plan: null,
  registros: 59, personas: 8, inicio_real: '2026-08-17', ultima_fecha: '2026-09-11',
}

test('las filas de hh_obra se indexan por obra y conservan lo medido', () => {
  const m = armarHorasPorObra([QUATTROPANI])
  assert.ok(m)
  const q = m.get('quattropani')
  assert.equal(q?.hhReal, 551)
  assert.equal(q?.registros, 59)
  assert.equal(q?.personas, 8)
  assert.equal(q?.inicioReal, '2026-08-17')
  assert.equal(q?.ultimaFecha, '2026-09-11')
})

test('un numeric que llega como texto sigue siendo el número', () => {
  // Es el caso real de PostgREST/`pg` con `numeric`: la celda no puede quedar vacía teniendo el dato.
  const m = armarHorasPorObra([{ ...QUATTROPANI, hh_real: '12525.50', registros: '1468' }])
  assert.equal(m?.get('quattropani')?.hhReal, 12525.5)
  assert.equal(m?.get('quattropani')?.registros, 1468)
  assert.equal(textoHH(m?.get('quattropani')), '12.526')
})

test('«no puedo leerlas» NO se convierte en «no tiene ninguna»', () => {
  assert.equal(armarHorasPorObra(null), null, 'null tiene que seguir siendo null')
  assert.equal(armarHorasPorObra(undefined), null)
  const vacio = armarHorasPorObra([])
  assert.ok(vacio instanceof Map, '[] es «ninguna obra tiene horas», que no es lo mismo que null')
  assert.equal(vacio.size, 0)
})

test('una fila sin obra_id se descarta en vez de crear una clave basura', () => {
  const m = armarHorasPorObra([{ hh_real: 100 }, QUATTROPANI])
  assert.equal(m?.size, 1)
})

test('las HH se escriben en es-AR y sin decimales; sin registros es «—», nunca 0', () => {
  assert.equal(textoHH({
    obraId: 'x', hhReal: 3993.5, hhPlan: null, registros: 1, personas: 1,
    inicioReal: null, ultimaFecha: null,
  }), '3.994')
  assert.equal(textoHH(null), '—')
  assert.equal(textoHH(undefined), '—')
  assert.equal(textoHH({
    obraId: 'x', hhReal: null, hhPlan: null, registros: 0, personas: 0,
    inicioReal: null, ultimaFecha: null,
  }), '—', 'una obra sin horas cargadas dice «—» y nunca «0»')
})

test('con plan cargado se escribe real / plan, y sin real el hueco queda del lado del real', () => {
  const base = { obraId: 'x', registros: 3, personas: 2, inicioReal: null, ultimaFecha: null }
  assert.equal(textoHH({ ...base, hhReal: 551, hhPlan: 600 }), '551 / 600')
  assert.equal(textoHH({ ...base, hhReal: null, hhPlan: 600 }), '— / 600')
})

test('el title respalda la cifra: desde cuándo, cuántos registros, cuánta gente y la última carga', () => {
  assert.equal(
    tituloHH(armarHorasPorObra([QUATTROPANI])?.get('quattropani')),
    'desde 17/08 · 59 registros · 8 personas · última carga 11/09',
  )
  // Singular de verdad, no «1 registros».
  assert.equal(
    tituloHH({
      obraId: 'x', hhReal: 9, hhPlan: null, registros: 1, personas: 1,
      inicioReal: '2026-09-01', ultimaFecha: '2026-09-01',
    }),
    'desde 01/09 · 1 registro · 1 persona · última carga 01/09',
  )
  assert.equal(tituloHH(null), null, 'sin horas no hay nada que respaldar')
})

test('el INICIO es la primera fecha con horas, y no se corre un día por el huso', () => {
  const i = inicioDeObra({
    obraId: 'san-francisco', hhReal: 12525.5, hhPlan: null, registros: 1468, personas: 26,
    inicioReal: '2026-01-05', ultimaFecha: '2026-08-15',
  }, '2026-06-22')
  assert.equal(i.texto, '05/01/26', 'la medianoche UTC leída en Buenos Aires daría 04/01')
  assert.equal(i.planeado, false)
  assert.equal(i.titulo, 'inicio real 05/01/2026 · plan 22/06/2026')
})

test('sin plan cargado el title lo dice, y no se calla el hueco', () => {
  const i = inicioDeObra(armarHorasPorObra([QUATTROPANI])?.get('quattropani'), null)
  assert.equal(i.texto, '17/08/26')
  assert.equal(i.titulo, 'inicio real 17/08/2026 · sin fecha de plan cargada')
})

test('una obra que no arrancó muestra su fecha PREVISTA, marcada como prevista', () => {
  // Es el caso de «ME - PLAYÓN DE AZUFRE» el 11/09/2026: tiene inicio declarado 07/09 y cero horas.
  const i = inicioDeObra(null, '2026-09-07')
  assert.equal(i.texto, '07/09/26')
  assert.equal(i.planeado, true, 'sin esta marca, una previsión se lee como un hecho')
  assert.equal(i.titulo, 'sin horas cargadas · plan 07/09/2026')
})

test('sin horas y sin plan NO se inventa una fecha', () => {
  const i = inicioDeObra(null, null)
  assert.equal(i.texto, '—')
  assert.equal(i.planeado, false)
  assert.equal(i.titulo, null)
})
