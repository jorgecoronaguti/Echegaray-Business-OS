import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { motivoContraElEstudio, verificarContraElEstudio } from './controlContraElEstudio.ts'
import type { ReciboSellado } from './reciboEmitido.ts'

// Un supabase de mentira: devuelve lo que se le da por tabla. Lo que se prueba es la DECISIÓN del servidor, que no
// puede depender de lo que diga el cliente (`estimado` ni siquiera viaja si el esquema lo descarta).
function falso(tablas: Record<string, { data?: unknown; error?: { message: string } }>): SupabaseClient {
  const consulta = (t: string) => {
    const r = { data: tablas[t]?.data ?? null, error: tablas[t]?.error ?? null }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in']) q[m] = () => q
    q.maybeSingle = () => Promise.resolve(r)
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok)
    return q
  }
  return { from: consulta } as unknown as SupabaseClient
}

const sellado = (banco: number | null, extra: Partial<ReciboSellado> = {}): ReciboSellado => ({
  personaId: 'p1', nombre: 'Aguero C.', categoria: null, quincenaDesde: '2026-09-16', quincenaHasta: '2026-09-30',
  horas: 96, banco, efectivo: 380257.52, total: 669801.32, renglones: { horas: [], medios: [] }, ...extra,
})

const CUIL = '20-11111111-1'
const estudio = (neto: number) => ({ data: [{ cuil: '20111111111', periodo: 'Q2-09/2026', neto }] })

test('un estimado no se emite, aunque la pantalla no lo diga: sin recibo del estudio el servidor rechaza', async () => {
  const sb = falso({ persona_legajo: { data: { cuil: CUIL } }, liquidacion_arrastre: { data: [] }, nomina_recibo_neto: { data: [] } })
  // `estimado` ausente (lo que llega cuando el esquema descarta la clave): igual se rechaza.
  const m = await verificarContraElEstudio(sb, sellado(289543.8))
  assert.match(m ?? '', /Todavía no llegó el recibo del estudio/)
  // Y con la bandera, rechaza sin ni siquiera consultar.
  assert.match(await verificarContraElEstudio(falso({}), sellado(289543.8, { estimado: true })) ?? '', /no se emite/)
})

test('con el recibo del estudio y las cuentas cerradas, se emite', async () => {
  const sb = falso({ persona_legajo: { data: { cuil: CUIL } }, liquidacion_arrastre: { data: [{ importe: '54580.48' }] }, nomina_recibo_neto: estudio(234963.32) })
  assert.equal(await verificarContraElEstudio(sb, sellado(289543.8)), null)
})

test('un banco que no cierra con el estudio no se emite y dice la diferencia (caso real RP-000001: 258.066,48 vs 243.158,36 + 16.558,72)', async () => {
  const sb = falso({ persona_legajo: { data: { cuil: CUIL } }, liquidacion_arrastre: { data: [{ importe: 16558.72 }] }, nomina_recibo_neto: estudio(243158.36) })
  const m = await verificarContraElEstudio(sb, sellado(258066.48))
  assert.match(m ?? '', /diferencia \$ -1\.650,60/)
})

test('si no puede leer el estudio, no emite', async () => {
  const sb = falso({ persona_legajo: { error: { message: 'x' } } })
  assert.match(await verificarContraElEstudio(sb, sellado(1)) ?? '', /No pude verificar/)
})

test('un papel sin depósito en banco no depende del estudio', () => {
  assert.equal(motivoContraElEstudio({ nombre: 'A', estimado: false, banco: null, netoDelEstudio: null, arrastre: 0 }), null)
})

test('el esquema de entrada declara `estimado` y `registrar` consulta al estudio (si no, zod descarta la bandera)', () => {
  const src = readFileSync(new URL('./recibosEmitidosActions.ts', import.meta.url), 'utf8')
  assert.match(src, /estimado: z\.boolean\(\)\.optional\(\)/)
  assert.match(src, /await verificarContraElEstudio\(supabase, r\)/)
})
