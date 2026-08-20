import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alerta, categoriaDe, estadoDe, ordenar, resumenDeAlerta, sumarDias } from './documentos.ts'

const HOY = '2026-08-20'
const doc = (p: Partial<{ presente: boolean; fecha_vencimiento: string | null }> = {}) => ({
  presente: true,
  fecha_vencimiento: null as string | null,
  ...p,
})

test('sin fecha de vencimiento el documento está VIGENTE, no vencido', () => {
  // El defecto que atrapa: tratar `null` como «vence hoy» pinta de rojo el DNI de todo el plantel, y
  // una pantalla que grita por todo deja de avisar de lo que importa.
  assert.equal(estadoDe(doc(), HOY), 'vigente')
})

test('vencido es que la fecha YA PASÓ; el día del vencimiento todavía vale', () => {
  assert.equal(estadoDe(doc({ fecha_vencimiento: '2026-08-19' }), HOY), 'vencido')
  assert.equal(estadoDe(doc({ fecha_vencimiento: HOY }), HOY), 'por_vencer', 'hoy vence: todavía sirve')
})

test('«por vencer» avisa 30 días antes, porque un apto médico se saca con turno', () => {
  assert.equal(estadoDe(doc({ fecha_vencimiento: '2026-09-19' }), HOY), 'por_vencer', 'a 30 días')
  assert.equal(estadoDe(doc({ fecha_vencimiento: '2026-09-20' }), HOY), 'vigente', 'a 31 días')
})

test('un documento declarado ausente es FALTA, aunque tenga fecha cargada', () => {
  // `presente = false` es la afirmación de Administración de que el papel no está. Manda sobre
  // cualquier fecha que haya quedado en la fila.
  assert.equal(estadoDe(doc({ presente: false }), HOY), 'falta')
  assert.equal(estadoDe(doc({ presente: false, fecha_vencimiento: '2030-01-01' }), HOY), 'falta')
})

test('el aviso cuenta cada cosa por separado y no las mezcla en un total', () => {
  const docs = [
    doc({ fecha_vencimiento: '2026-07-12' }),
    doc({ fecha_vencimiento: '2026-09-01' }),
    doc({ presente: false }),
    doc(),
  ]
  assert.deepEqual(alerta(docs as never, HOY), { vencidos: 1, porVencer: 1, faltan: 1 })
  assert.equal(resumenDeAlerta(docs as never, HOY), '1 vencido · 1 por vencer · 1 sin cargar')
})

test('sin nada que avisar el resumen es null, no «todo en orden»', () => {
  // Un cartel verde permanente entrena a la gente a no leer el renglón donde algún día va a haber
  // un vencido.
  assert.equal(resumenDeAlerta([doc(), doc({ fecha_vencimiento: '2030-01-01' })] as never, HOY), null)
  assert.equal(resumenDeAlerta([], HOY), null)
})

test('lo urgente va arriba: vencido, por vencer, falta, y al final lo que está en orden', () => {
  const enOrden = doc()
  const vence = doc({ fecha_vencimiento: '2026-09-10' })
  const venceAntes = doc({ fecha_vencimiento: '2026-09-01' })
  const vencido = doc({ fecha_vencimiento: '2026-01-01' })
  const falta = doc({ presente: false })
  const orden = ordenar([enOrden, vence, falta, vencido, venceAntes] as never, HOY)
  assert.deepEqual(
    orden.map((d) => estadoDe(d, HOY)),
    ['vencido', 'por_vencer', 'por_vencer', 'falta', 'vigente'],
  )
  assert.equal(orden[1].fecha_vencimiento, '2026-09-01', 'dentro del grupo, lo que vence antes primero')
})

test('sumar días no se corre por el huso horario', () => {
  assert.equal(sumarDias('2026-08-20', 30), '2026-09-19')
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(sumarDias('2028-02-28', 1), '2028-02-29', 'año bisiesto')
})

test('la categoría se traduce del vocabulario de la base, y lo desconocido se muestra tal cual', () => {
  assert.equal(categoriaDe('examen_medico'), 'Apto médico')
  assert.equal(categoriaDe('epp'), 'Entrega de EPP')
  // Un tipo nuevo en la base no puede desaparecer de la pantalla ni salir como «Otros»: se ve crudo
  // y así se nota que el vocabulario creció.
  assert.equal(categoriaDe('psicofisico_2027'), 'psicofisico_2027')
})
