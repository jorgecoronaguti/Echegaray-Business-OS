// LA NOTA SE QUEDA EN EL PAGO AL QUE SE LE ESCRIBIÓ (dueño, 02/10/2026).
//
// Defectos que estas pruebas atrapan:
//
//   1. CORRERSE DE PAGO. Con «=51000+60000» y después «+51000+75000», la nota del $75.000 no puede saltar a otro
//      pago cuando se agrega un quinto, ni pegarse al primer $51.000 porque tiene el mismo importe que el tercero.
//   2. MOSTRARLA EN EL PAGO EQUIVOCADO EN SILENCIO. Si la clave señala un pago de otro importe, se dice aparte.
//   3. VACÍO NO ES UNA NOTA: borra.
//   4. SIN LA MIGRACIÓN el cuadro sigue diciendo «Sin nota» y deja intentar; si la lectura falla, no afirma «Sin nota».

import test from 'node:test'
import assert from 'node:assert/strict'
import type { CambioCrudo } from './historialDeManuales.ts'
import { detalleDePagoEnEfectivo, NOTA_ILEGIBLE, renglonesDePagoEnEfectivo } from './detalleDePagoEnEfectivo.ts'
import {
  claveDeNota, faltaLaMigracion, indiceDeNotas, notaDelRenglon, pedidoDeNota, textoDeNota, type NotaCruda,
} from './notaDeAnotacion.ts'

const fila = (o: Partial<CambioCrudo> & { id: number }): CambioCrudo => ({
  liquidacion_id: 'L1', grupo: 'obreros', persona_id: 'P1', columna: 'pagado_efectivo', tipo: 'cambio',
  antes: null, despues: null, formula_antes: null, formula_despues: null, autor: null,
  en: '2026-10-01T14:32:00-03:00', ...o,
})
const nombres = new Map([['u1', 'Ana Pérez']])
const nota = (o: Partial<NotaCruda> & { cambio_id: number; posicion: number }): NotaCruda => ({
  importe: null, texto: 'texto', escrita_por: 'u1', escrita_en: '2026-10-02T17:05:00Z', ...o,
})

/** Dos cambios: el primero anota 51000+60000, el segundo agrega 51000+75000. */
const cambios = [
  fila({ id: 10, despues: 111000, formula_despues: '=51000+60000' }),
  fila({ id: 11, antes: 111000, despues: 237000, formula_antes: '=51000+60000', formula_despues: '=51000+60000+51000+75000', en: '2026-10-01T18:00:00-03:00' }),
]

test('cada pago lleva su ancla (cambio, posición dentro de lo que ESE cambio agregó, importe)', () => {
  const r = renglonesDePagoEnEfectivo({ cambios, pagos: null, nombres, cruce: null, notas: new Map() })
  assert.deepEqual(r.renglones.map((x) => x.ancla), [
    { cambioId: 10, posicion: 0, importe: 51000 }, { cambioId: 10, posicion: 1, importe: 60000 },
    { cambioId: 11, posicion: 0, importe: 51000 }, { cambioId: 11, posicion: 1, importe: 75000 },
  ])
})

test('la nota del $75.000 queda en el $75.000, y sigue ahí cuando se agrega otro pago', () => {
  const notas = indiceDeNotas([nota({ cambio_id: 11, posicion: 1, importe: '75000', texto: 'retiró el hermano' })])
  const conCinco = [...cambios, fila({
    id: 12, antes: 237000, despues: 287000, formula_antes: '=51000+60000+51000+75000',
    formula_despues: '=51000+60000+51000+75000+50000', en: '2026-10-02T09:00:00-03:00',
  })]
  for (const lista of [cambios, conCinco]) {
    const r = renglonesDePagoEnEfectivo({ cambios: lista, pagos: null, nombres, cruce: null, notas })
    assert.deepEqual(r.renglones.map((x) => x.nota).filter((t) => t !== 'Sin nota'), ['retiró el hermano'])
    assert.equal(r.renglones[3].importe, '$75.000')
    assert.equal(r.renglones[3].nota, 'retiró el hermano')
    assert.match(r.renglones[3].notaPor ?? '', /^Ana Pérez, 02\/10\/2026, 14:05$/)
  }
})

test('dos pagos del mismo importe en cambios distintos no comparten nota', () => {
  const notas = indiceDeNotas([nota({ cambio_id: 11, posicion: 0, importe: 51000, texto: 'el del sábado' })])
  const r = renglonesDePagoEnEfectivo({ cambios, pagos: null, nombres, cruce: null, notas })
  assert.equal(r.renglones[0].nota, 'Sin nota')
  assert.equal(r.renglones[2].nota, 'el del sábado')
})

test('una nota escrita para otro importe NO se muestra en este pago: se dice aparte', () => {
  const notas = indiceDeNotas([nota({ cambio_id: 10, posicion: 1, importe: 99000, texto: 'otra cosa' })])
  const r = renglonesDePagoEnEfectivo({ cambios, pagos: null, nombres, cruce: null, notas })
  assert.equal(r.renglones[1].nota, 'Sin nota')
  assert.match(r.renglones[1].notaDescolgada ?? '', /\$99\.000.*«otra cosa»/)
  assert.equal(notaDelRenglon({ cambioId: 10, posicion: 1, importe: 60000 }, notas).estado, 'descolgada')
  assert.equal(notaDelRenglon({ cambioId: 10, posicion: 0, importe: 51000 }, notas).estado, 'ninguna')
})

test('una baja (sin importe) acepta su nota sólo si la nota tampoco tiene importe', () => {
  const baja = [fila({ id: 20, antes: 5000, despues: null })]
  const notas = indiceDeNotas([nota({ cambio_id: 20, posicion: 0, importe: null, texto: 'se cargó por error' })])
  const r = renglonesDePagoEnEfectivo({ cambios: baja, pagos: null, nombres, cruce: null, notas })
  assert.deepEqual(r.renglones[0].ancla, { cambioId: 20, posicion: 0, importe: null })
  assert.equal(r.renglones[0].nota, 'se cargó por error')
})

test('sin la tabla de notas: «Sin nota» como hoy, y se puede intentar (ancla presente)', () => {
  const r = renglonesDePagoEnEfectivo({ cambios, pagos: null, nombres, cruce: null, notas: null })
  assert.ok(r.renglones.every((x) => x.nota === 'Sin nota' && x.ancla !== null && x.notaPor === null))
})

test('lectura de notas fallida: no afirma «Sin nota» ni deja escribir encima de lo que no se vio', () => {
  const r = renglonesDePagoEnEfectivo({ cambios, pagos: null, nombres, cruce: null, notas: 'ilegible' })
  assert.ok(r.renglones.every((x) => x.nota === NOTA_ILEGIBLE && x.ancla === null))
})

test('una celda sin anotación en la base no tiene a qué colgar la nota', () => {
  const d = detalleDePagoEnEfectivo({ persona: 'X', quincena: null, valor: 100, cuentaActual: null, anotaciones: undefined })
  assert.equal(d.renglones[0].ancla, null)
})

test('texto de una línea; vacío o sólo espacios = borrar', () => {
  assert.equal(textoDeNota('   '), null)
  assert.equal(textoDeNota(''), null)
  assert.equal(textoDeNota('  pagó\n en mano  '), 'pagó en mano')
  assert.equal(claveDeNota(11, 1), '11:1')
})

test('el pedido se valida: largo máximo, posición y vacío que borra', () => {
  const base = { cambioId: 11, posicion: 1, importe: 75000 }
  assert.equal(pedidoDeNota.safeParse({ ...base, texto: 'x'.repeat(201) }).success, false)
  assert.equal(pedidoDeNota.safeParse({ ...base, texto: 'x'.repeat(200) }).success, true)
  assert.equal(pedidoDeNota.safeParse({ ...base, posicion: -1, texto: 'a' }).success, false)
  assert.equal(pedidoDeNota.safeParse({ ...base, cambioId: 0, texto: 'a' }).success, false)
  const vacio = pedidoDeNota.safeParse({ ...base, texto: '  ' })
  assert.ok(vacio.success && vacio.data.texto === null)
})

test('sin la migración la acción reconoce la falta y no la confunde con otro error', () => {
  assert.equal(faltaLaMigracion({ code: 'PGRST202', message: 'Could not find the function public.liquidacion_nota_guardar' }), true)
  assert.equal(faltaLaMigracion({ code: '42P01', message: 'relation "liquidacion_cambio_nota" does not exist' }), true)
  assert.equal(faltaLaMigracion({ code: '42501', message: 'Sólo quien liquida sueldos escribe notas de Liquidación.' }), false)
})
