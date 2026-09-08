// EL DEFECTO DEL 08/09: los dos Movistar del 03/09 preguntados otra vez cinco días después.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repartirPendientes, silenciado, sinClave, avisoDeVencidos, HORAS_ESPERA } from './arrastre.mjs'
import { textoPregunta } from './mensaje.mjs'

const HORA = 3_600_000
const T0 = new Date('2026-09-03T13:00:00Z')
const movistar = (extra = {}) => ({
  comprobante: { proveedor: 'Movistar', numero: null, total: 15000, fecha: '2026-09-03' },
  ...extra,
})
const conNumero = (extra = {}) => ({
  comprobante: { proveedor: 'Dupec', numero: '0001-00000067', total: 250000, fecha: '2026-09-03' },
  ...extra,
})

test('sin número no hay clave; con número, sí', () => {
  assert.equal(sinClave(movistar()), true)
  assert.equal(sinClave(conNumero()), false)
  assert.equal(sinClave({ clave: 'x' }), false)
})

test('EL ARRASTRE: la primera vez viaja y queda sellado; la segunda viaja CALLADO', () => {
  // Primer fajo nuevo: el ítem nunca se preguntó. Viaja y arranca el reloj.
  const a = repartirPendientes([movistar()], { ahora: T0 })
  assert.equal(a.mudan.length, 1)
  assert.equal(a.vencidos.length, 0)
  assert.equal(a.mudan[0].preguntadoEn, T0.toISOString())
  assert.notEqual(a.mudan[0].silenciado, true, 'la primera pregunta SÍ se hace')

  // Segundo fajo, 18 minutos después: es el caso exacto del reclamo. Viaja, pero callado.
  const b = repartirPendientes(a.mudan, { ahora: new Date(+T0 + 18 * 60_000) })
  assert.equal(b.mudan.length, 1, 'el gasto no se tira')
  assert.equal(b.mudan[0].silenciado, true, 'no se vuelve a preguntar lo mismo')
  assert.equal(b.mudan[0].preguntadoEn, T0.toISOString(), 'el reloj no se reinicia con cada fajo')

  // Y sigue callado en el tercero, y en el cuarto.
  const c = repartirPendientes(b.mudan, { ahora: new Date(+T0 + 5 * HORA) })
  assert.equal(c.mudan[0].silenciado, true)
})

test('a las 72 h sin respuesta se descarta solo, y recién ahí se avisa UNA vez', () => {
  const sellado = { ...movistar(), preguntadoEn: T0.toISOString() }
  const antes = repartirPendientes([sellado], { ahora: new Date(+T0 + (HORAS_ESPERA - 1) * HORA) })
  assert.equal(antes.vencidos.length, 0)
  assert.equal(antes.mudan.length, 1)

  const despues = repartirPendientes([sellado], { ahora: new Date(+T0 + HORAS_ESPERA * HORA) })
  assert.equal(despues.mudan.length, 0)
  assert.equal(despues.vencidos.length, 1)
  const aviso = avisoDeVencidos(despues.vencidos)
  assert.match(aviso, /Descarté un comprobante/)
  assert.match(aviso, /72 horas/)
  assert.equal(avisoDeVencidos([]), null, 'sin vencidos no se dice nada')
})

test('lo que SÍ se puede resolver mirando se sigue preguntando siempre', () => {
  // Un comprobante con número y la obra en blanco se contesta con un desplegable: callarlo sería
  // esconder trabajo pendiente que tiene plata y número.
  const it = { ...conNumero(), preguntadoEn: T0.toISOString() }
  assert.equal(silenciado(it), false)
  const r = repartirPendientes([it], { ahora: new Date(+T0 + 200 * HORA) })
  assert.equal(r.mudan.length, 1)
  assert.equal(r.vencidos.length, 0, 'no vence: no es un ilegible, es un pendiente resoluble')
  assert.notEqual(r.mudan[0].silenciado, true)
})

test('lo ya cargado no se muda ni vence', () => {
  const r = repartirPendientes([{ ...conNumero(), yaCargado: true }], { ahora: T0 })
  assert.equal(r.mudan.length, 0)
  assert.equal(r.vencidos.length, 0)
})

test('LA REPETICIÓN: el ítem silenciado ya no entra en la pregunta del fajo', () => {
  const gritando = movistar()
  const callado = { ...movistar(), preguntadoEn: T0.toISOString(), silenciado: true }
  assert.ok(textoPregunta({ items: [gritando] })?.texto, 'la primera vez se pregunta')
  assert.equal(textoPregunta({ items: [callado] }), null, 'la segunda, no')
  // Y si en el mismo fajo hay uno callado y uno nuevo, se pregunta SÓLO por el nuevo.
  const dudoso = { ...conNumero(), posibleDuplicado: { fila: 952, numero: '0001-00000067', total: 250000 } }
  const mixto = textoPregunta({ items: [callado, dudoso] })
  assert.ok(mixto?.texto)
  assert.doesNotMatch(mixto.texto, /Movistar/)
})
