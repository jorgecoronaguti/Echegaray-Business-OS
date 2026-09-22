import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { advertencias, claveDestino, conCantidad, destinos, eligeCantidad, itemPorDefecto, origenes, paraLaBase } from './mover.ts'
import { activo, ubicacion } from './fixture.test-util.ts'
import type { ObraIndice } from '../types.ts'

const obras: ObraIndice[] = [
  { id: 'ob-arcor', codigo: 'OB-0012', nombre: 'PISOS ARCOR', estado: 'activa', cliente: 'ARCOR' },
  { id: 'ob-nueva', codigo: 'OB-0031', nombre: 'NAVE MESSINAS', estado: 'activa', cliente: null },
  { id: 'ob-vieja', codigo: 'OB-0003', nombre: 'MACRO', estado: 'finalizada', cliente: null },
]

function parque() {
  return armarParque({
    ubicaciones: [
      ubicacion({ id: 'u-taller', tipo: 'taller', nombre: 'Taller' }),
      ubicacion({ id: 'u-arcor', tipo: 'obra', obra_id: 'ob-arcor' }),
      ubicacion({ id: 'u-vieja', tipo: 'obra', obra_id: 'ob-vieja' }),
      ubicacion({ id: 'u-hilux', tipo: 'rodado', activo_id: 'r1' }),
      ubicacion({ id: 'u-f100', tipo: 'rodado', activo_id: 'r2' }),
      ubicacion({ id: 'u-arch', tipo: 'tercero', nombre: 'Alquiler Pérez', archivada: true }),
    ],
    obras,
    activos: [
      activo({ id: 'a1', codigo: 'HER-0001', nombre: 'Amoladora', ubicacion_id: 'u-taller' }),
      activo({ id: 'a2', codigo: 'HER-0002', nombre: 'Nivel', ubicacion_id: 'u-taller', estado: 'requiere_mantenimiento' }),
      activo({ id: 'a3', codigo: 'HER-0003', nombre: 'Balde', ubicacion_id: 'u-hilux' }),
      activo({ id: 'a4', codigo: 'HER-0004', nombre: 'Sin lugar', ubicacion_id: null }),
      activo({ id: 'a5', codigo: 'PUN-0001', nombre: 'Puntales', ubicacion_id: null, cantidad: 10 }),
      activo({ id: 'e1', codigo: 'MIN-001', clase: 'equipo', nombre: 'Minicargadora Bobcat S650', ubicacion_id: null }),
      activo({ id: 'r1', codigo: 'ROD-0001', clase: 'rodado', nombre: 'Hilux', patente: 'NMN898', ubicacion_id: 'u-taller' }),
      activo({ id: 'r2', codigo: 'ROD-0002', clase: 'rodado', nombre: 'F100', patente: 'AXH205', estado: 'baja', baja_motivo: 'vendida', baja_en: '2026-01-01T00:00:00Z' }),
    ],
    movimientos: [], incidencias: [], nombres: {},
  })
}

test('«desde» agrupa por donde está cada uno hoy, incluido «sin ubicación cargada»', () => {
  const p = parque()
  const g = origenes(p, ['a1', 'a2', 'a4'].map((id) => p.activoPorId.get(id)!))
  assert.deepEqual(g.map((x) => [x.rotulo, x.cuenta]), [['Taller', 2], ['sin ubicación cargada', 1]])
})

test('destinos: sólo obras activas del índice (con o sin ubicación creada), nada archivado, ningún rodado en baja', () => {
  const d = destinos(parque(), obras)
  assert.deepEqual(d.map(claveDestino), ['u:u-arcor', 'obra:ob-nueva', 'u:u-hilux', 'u:u-taller'])
  assert.deepEqual(d.map((x) => x.rotulo), ['OB-0012 · PISOS ARCOR', 'OB-0031 · NAVE MESSINAS', 'Hilux NMN898', 'Taller'], 'primero las obras, después los rodados')
})

test('advertencias: el problema viaja, el rodado con carga pregunta, y no se mete adentro de sí mismo', () => {
  const p = parque()
  const sel = ['a1', 'a2', 'r1'].map((id) => p.activoPorId.get(id)!)
  const w = advertencias(p, sel, 'u-hilux')
  assert.deepEqual(w.conProblema.map((a) => a.id), ['a2'])
  assert.deepEqual(w.rodadosConCarga.map((x) => [x.rodado.id, x.carga]), [['r1', 1]])
  assert.equal(w.adentroDeSiMismo?.id, 'r1')
  assert.deepEqual(advertencias(p, sel, 'u-taller').yaEstan.map((a) => a.id), ['a1', 'a2', 'r1'])
})

// 22/09/2026, dueño: «roto el movimiento de maquinarias». MIN-001 se dio de alta sin ubicación y el
// panel mandaba origen null; la base contestaba «no tiene unidades en el lugar de origen»
// (20260922T2500 la arregla). Del lado de la pantalla: lo que no está en ningún lado entra ENTERO.
test('la maquinaria recién dada de alta, sin ubicación, se manda entera y sin origen', () => {
  const p = parque()
  const it = itemPorDefecto(p, p.activoPorId.get('e1')!)
  assert.equal(it.origen, null)
  assert.deepEqual(paraLaBase([it]), [{ activo: 'e1', origen: null, cantidad: 1 }])
  assert.equal(eligeCantidad(it, 0), false, 'sin ubicación no hay lugar de salida que elegir')
})

test('un lote sin ubicación no se reparte: entran todas las unidades', () => {
  const p = parque()
  const it = itemPorDefecto(p, p.activoPorId.get('a5')!)
  assert.equal(it.disponible, 10)
  assert.equal(conCantidad(it, 4).cantidad, 10, 'lo que no está en ningún lado no se puede repartir')
  assert.equal(eligeCantidad(it, 0), false)
  assert.equal(eligeCantidad(itemPorDefecto(p, p.activoPorId.get('a1')!), 1), false, 'uno solo en un lugar tampoco pregunta')
})
