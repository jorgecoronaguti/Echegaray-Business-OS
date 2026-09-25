import test from 'node:test'
import assert from 'node:assert/strict'
import type { Entrega } from '../types.ts'
import {
  borradorDe, efectosDeGuardar, estadoDelAviso, fraseDelCambio, loQueArrastraBorrar, validarEdicion, type Nombres,
} from './edicion.ts'

const entrega = (x: Partial<Entrega> = {}): Entrega => ({
  id: 'e1', codigo: 'ER-0020', persona_id: 'p1', persona: 'Emiliano Maldonado', obra_id: null, obra: null,
  estructura: true, fecha: '2026-09-24', entregado: 20_000, rendido: 0, filas_rendidas: 0, devuelto: 0,
  en_su_poder: 20_000, conformidad: true, estado: 'abierta', para_que: null, conformidad_en: '2026-09-24T19:23:26Z',
  cerrada_en: null, anulada_en: null, anulada_motivo: null, es_prueba: false, ...x,
})

const nombres: Nombres = {
  persona: (id) => ({ p1: 'Emiliano Maldonado', p2: 'Juan Pablo Nievas' } as Record<string, string>)[id] ?? null,
  obra: (id) => (id === 'pisos-industriales' ? 'OB-0011 · SF - Pisos industriales' : null),
  entrega: (id) => (id === 'e2' ? 'ER-0023' : null),
}

test('el borrador de una entrega vuelve a validar igual: editar sin tocar nada no rebota', () => {
  const v = validarEdicion(borradorDe(entrega()))
  assert.ok(v.ok)
  assert.deepEqual(v.ok && v.dato, { persona: 'p1', obra: null, estructura: true, monto: 20_000, fecha: '2026-09-24', paraQue: null })
})

test('el importe se escribe a la argentina y la obra es obligatoria si el destino es obra', () => {
  const b = { ...borradorDe(entrega()), monto: '1.380.000,50' }
  const v = validarEdicion(b)
  assert.equal(v.ok && v.dato.monto, 1_380_000.5)
  const sinObra = validarEdicion({ ...b, destino: 'obra', obra: '' })
  assert.equal(sinObra.ok, false)
  assert.equal(!sinObra.ok && sinObra.campo, 'obra')
  assert.equal(validarEdicion({ ...b, fecha: '' }).ok, false)
  assert.equal(validarEdicion({ ...b, monto: '0' }).ok, false)
})

test('antes de guardar se dice lo que no es obvio: CAJA, saldo negativo, firma de otra persona', () => {
  const e = entrega({ rendido: 15_000 })
  assert.deepEqual(efectosDeGuardar(e, borradorDe(e)), [])
  const menos = efectosDeGuardar(e, { ...borradorDe(e), monto: '10000' })
  assert.match(menos[0], /CAJA pasa a restar \$ 10\.000 en vez de \$ 20\.000/)
  assert.match(menos[1], /−\$ 5\.000 en su poder/)
  const otra = efectosDeGuardar(e, { ...borradorDe(e), persona: 'p2' })
  assert.match(otra[0], /se borra y se le pide a la nueva/)
})

test('borrar dice lo que arrastra, siempre que sale de CAJA, y que no se deshace', () => {
  assert.equal(loQueArrastraBorrar({ filas: 0, tickets: 0, devoluciones: 0 }), 'sale de CAJA y de los saldos. No se deshace.')
  assert.equal(
    loQueArrastraBorrar({ filas: 1, tickets: 2, devoluciones: 1 }),
    '1 fila de Compras pasa a Cancelado · se borran 2 tickets · se borra 1 devolución · sale de CAJA y de los saldos. No se deshace.',
  )
})

test('la bitácora en castellano: importes, personas, estados, borrados', () => {
  assert.equal(fraseDelCambio({ campo: 'entrega.monto', antes: '20000.00', despues: '25000.00' }, nombres), 'cambió el importe de $ 20.000 a $ 25.000')
  assert.equal(fraseDelCambio({ campo: 'entrega.persona_id', antes: 'p1', despues: 'p2' }, nombres), 'cambió la persona de Emiliano Maldonado a Juan Pablo Nievas')
  assert.equal(fraseDelCambio({ campo: 'entrega.fecha', antes: '2026-09-24', despues: '2026-09-23' }, nombres), 'cambió la fecha de 24/09 a 23/09')
  assert.equal(fraseDelCambio({ campo: 'entrega.anulada_en', antes: null, despues: '2026-09-25T10:00:00Z' }, nombres), 'anuló la entrega')
  assert.equal(fraseDelCambio({ campo: 'entrega.cerrada_en', antes: '2026-09-25T10:00:00Z', despues: null }, nombres), 'reabrió la entrega')
  assert.equal(fraseDelCambio({ campo: 'entrega.conformidad_en', antes: '2026-09-24T19:23:26Z', despues: null }, nombres), 'borró la firma de conformidad')
  assert.equal(fraseDelCambio({ campo: 'entrega.conformidad_trazo', antes: '[firma]', despues: null }, nombres), null)
  assert.equal(fraseDelCambio({ campo: 'rendicion.entrega_id', antes: 'e1', despues: 'e2' }, nombres), 'cambió la entrega de una rendición de otra entrega a ER-0023')
  assert.equal(
    fraseDelCambio({ campo: 'entrega.borrada', antes: JSON.stringify({ codigo: 'ER-0021', monto: '100000.00' }), despues: null }, nombres),
    'borró la entrega (ER-0021 · $ 100.000)',
  )
  assert.equal(fraseDelCambio({ campo: 'devolucion.borrada', antes: 'no es json', despues: null }, nombres), 'borró una devolución')
})

test('el aviso dice lo que su evidencia dice: salió sólo con el post releído', () => {
  assert.equal(estadoDelAviso({ enviado_en: '2026-09-25T10:00:00Z', intentos: 1, ultimo_error: null }).texto, 'salió')
  assert.equal(estadoDelAviso({ enviado_en: null, intentos: 0, ultimo_error: null }).texto, 'en cola')
  assert.equal(estadoDelAviso({ enviado_en: null, intentos: 5, ultimo_error: 'x' }).tono, 'neg')
})
