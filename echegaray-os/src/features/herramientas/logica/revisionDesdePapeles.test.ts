import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { vigentesConPapeles } from './revisionDesdePapeles.ts'
import { semaforo, vigenteDe, type RevisionVigente } from './revision.ts'
import type { Papel } from './papeles.ts'

const papel = (p: Partial<Papel>): Papel => ({
  id: 'p1', activo_id: 'a1', tipo: 'rto', numero: null, emisor: 'CENT San Juan', titular: null, emitido_en: '2025-03-28',
  vence_en: '2026-03-28', dias: -187, drive_file_id: null, drive_nombre: null, observacion: null, ...p,
} as Papel)
const revision = (r: Partial<RevisionVigente>): RevisionVigente => ({
  id: 'r1', activo_id: 'a1', tipo: 'rto', fecha: '2026-04-10', vencimiento: '2027-04-10', lectura: 90000, resultado: 'apto',
  lugar: null, numero: null, costo: null, observaciones: null, adjunto_url: null, creado_en: '2026-04-10', creado_por: null, dias: 191, ...r,
})

test('sin revisión cargada, la RTO del papel es la vigente: deja de decir «sin cargar»', () => {
  const v = vigentesConPapeles([], [papel({})])
  const rto = vigenteDe(v, 'a1', 'rto')
  assert.equal(rto?.vencimiento, '2026-03-28')
  assert.equal(semaforo(rto).tono, 'neg', 'vencida hace 187 días se pinta vencida')
  assert.equal(semaforo(vigenteDe(v, 'a1', 'seguro')).texto, 'sin cargar', 'lo que no tiene papel sigue «sin cargar»')
})

test('gana el vencimiento más nuevo: una revisión posterior no la pisa un papel viejo, y al revés', () => {
  assert.equal(vigenteDe(vigentesConPapeles([revision({})], [papel({})]), 'a1', 'rto')?.id, 'r1')
  const nuevo = papel({ id: 'p2', vence_en: '2028-01-01', dias: 457 })
  assert.equal(vigenteDe(vigentesConPapeles([revision({})], [nuevo]), 'a1', 'rto')?.id, 'papel:p2')
})

test('sólo RTO y seguro; un papel sin vencimiento no inventa uno; sin migración sigue null', () => {
  const v = vigentesConPapeles([], [
    papel({ id: 'p3', tipo: 'cedula_verde' as Papel['tipo'] }), papel({ id: 'p4', tipo: 'seguro', vence_en: null, dias: null }),
  ])
  assert.deepEqual(v, [])
  assert.equal(vigentesConPapeles(null, [papel({})]), null)
  assert.deepEqual(vigentesConPapeles([], null), [])
})

test('la lectura del parque pasa por acá: una sola fuente para la ficha y para Mantenimiento', () => {
  const src = readFileSync(fileURLToPath(new URL('../services/datos.ts', import.meta.url)), 'utf8')
  assert.match(src, /revisionesVigentes: vigentesConPapeles\(/)
})
