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
    for (const m of ['select', 'eq', 'in', 'lte']) q[m] = () => q
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

test('un papel sin depósito en banco (null o 0) no depende del estudio: quien cobra todo en efectivo emite', async () => {
  const sin = { nombre: 'A', estimado: false, netoDelEstudio: null, arrastre: 0 }
  assert.equal(motivoContraElEstudio({ ...sin, banco: null }), null)
  assert.equal(motivoContraElEstudio({ ...sin, banco: 0 }), null)
  assert.equal(motivoContraElEstudio({ ...sin, banco: 0, estimado: true }), null, 'con banco 0 nada se rotula estimado')
  assert.match(motivoContraElEstudio({ ...sin, banco: 100 }) ?? '', /Todavía no llegó/)
  const sb = falso({ persona_legajo: { data: { cuil: CUIL } }, liquidacion_arrastre: { data: [] }, nomina_recibo_neto: { data: [] } })
  assert.equal(await verificarContraElEstudio(sb, sellado(0)), null)
  assert.equal(await verificarContraElEstudio(sb, sellado(null)), null)
})

test('el esquema de entrada declara `estimado` y `registrar` consulta al estudio (si no, zod descarta la bandera)', () => {
  const src = readFileSync(new URL('./recibosEmitidosActions.ts', import.meta.url), 'utf8')
  assert.match(src, /estimado: z\.boolean\(\)\.optional\(\)/)
  assert.match(src, /await verificarContraElEstudio\(supabase, r\)/)
})

// ═══ EL MENSUALIZADO SE PAGA POR MES: EL CONTROL COMPARA CONTRA LOS DOS RECIBOS (dueño, 02/10/2026) ═══
// Cifras reales de septiembre (Maldonado): Q1 705.532,04 + Q2 685.914,88 = 1.391.446,92.
// MUTACIÓN: que el control vuelva a mirar sólo la 2ª quincena → «mensual con los dos recibos» rojo.
const mensual = (netos: { periodo: string; neto: number }[], arrastre: unknown[] = []) => falso({
  persona_legajo: { data: { cuil: '20-35923266-8' } },
  persona_directorio: { data: { puesto: 'Jefe de obra' } },
  persona_tarifa: { data: [{ desde: '2026-09-01', neto_mensual: 1800000 }] },
  liquidacion_arrastre: { data: arrastre },
  nomina_recibo_neto: { data: netos.map((n) => ({ cuil: '20359232668', ...n })) },
})
const Q1M = { periodo: 'Q1-09/2026', neto: 705532.04 }
const Q2M = { periodo: 'Q2-09/2026', neto: 685914.88 }

test('mensual con los dos recibos: el banco de la suma se emite; el de la 2ª sola no', async () => {
  const sb = mensual([Q1M, Q2M])
  assert.equal(await verificarContraElEstudio(sb, sellado(1391446.92)), null)
  const m = await verificarContraElEstudio(sb, sellado(685914.88))
  assert.match(m ?? '', /no coincide con los dos recibos del estudio \(\$ 1\.391\.446,92\)/)
})

test('mensual con un recibo faltante: no se emite, nombra cuál falta, aunque el papel no lleve banco', async () => {
  const m = await verificarContraElEstudio(mensual([Q1M]), sellado(705532.04))
  assert.match(m ?? '', /falta el de la 2ª quincena de septiembre/)
  const sinBanco = await verificarContraElEstudio(mensual([Q2M]), sellado(null))
  assert.match(sinBanco ?? '', /falta el de la 1ª quincena de septiembre/)
  // Ninguno cargado y sin banco: todo en efectivo, se emite como siempre.
  assert.equal(await verificarContraElEstudio(mensual([]), sellado(null)), null)
})

test('mensual con arrastre de su propio recibo Q1: no se cuenta dos veces', async () => {
  const sb = mensual([Q1M, Q2M], [{ importe: 54580.48, periodo_origen: 'Q1-09/2026' }])
  assert.equal(await verificarContraElEstudio(sb, sellado(1391446.92)), null)
})

test('quincenal sin cambios: sigue comparando contra su recibo de la quincena', async () => {
  const sb = falso({
    persona_legajo: { data: { cuil: CUIL } }, liquidacion_arrastre: { data: [] },
    nomina_recibo_neto: { data: [{ cuil: '20111111111', periodo: 'Q1-09/2026', neto: 1 }, { cuil: '20111111111', periodo: 'Q2-09/2026', neto: 234963.32 }] },
  })
  assert.equal(await verificarContraElEstudio(sb, sellado(234963.32)), null)
})
