// LAS COTIZACIONES DE DRIVE EN PRESUPUESTOS SON LAS QUE LA CARA DOCUMENTOS LLAMA COTIZACIÓN.
//
// MUTACIÓN QUE PONE ESTO ROJO: usar un patrón propio (una OC «ADICIONAL - OC_32_…» entraría como
// cotización), mirar la ruta ENTERA (la raíz «PRESUPUESTOS - CLIENTES» convertiría todo en cotización),
// o no excluir la papelera.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cotizacionesDeDrive } from './cotizacionesDeDrive.ts'

const RAIZ = 'administracion/PRESUPUESTOS - CLIENTES/MESSINA'
const archivo = (name: string, extra: Record<string, unknown> = {}) => ({
  drive_file_id: name, name, path: `${RAIZ}/${String(extra.subcarpeta ?? '')}${name}`, mime_type: null, size_bytes: null,
  modified_time: '2026-08-01T12:00:00Z', web_view_link: `https://drive/${name}`, trashed: false, ausente_en_drive: false,
  subcarpeta: '', ...extra,
})

test('entran cotizaciones y presupuestos; una OC, un plano y un archivo sin marca no', () => {
  const filas = cotizacionesDeDrive([
    archivo('Cotización Playón azufre.pdf', { modified_time: '2026-08-20T00:00:00Z' }),
    archivo('PRESUPUESTO BSA rev2.xlsx', { modified_time: '2026-09-01T00:00:00Z' }),
    archivo('ADICIONAL - OC_32_0000200001923.pdf'),
    archivo('Plano general.dwg'),
    archivo('foto obra.jpg'),
  ])
  assert.deepEqual(filas.map((f) => f.nombre), ['PRESUPUESTO BSA rev2.xlsx', 'Cotización Playón azufre.pdf'])
  assert.match(String(filas[0].porque), /presupuesto/i)
})

test('la raíz «PRESUPUESTOS - CLIENTES» no convierte todo en cotización', () => {
  assert.equal(cotizacionesDeDrive([archivo('Acta de inicio.pdf'), archivo('remito 123.pdf')]).length, 0)
})

test('lo que está en la papelera o ya no está en Drive no se lista', () => {
  assert.equal(cotizacionesDeDrive([
    archivo('Cotizacion vieja.pdf', { trashed: true }),
    archivo('Presupuesto borrado.pdf', { ausente_en_drive: true }),
  ]).length, 0)
})
