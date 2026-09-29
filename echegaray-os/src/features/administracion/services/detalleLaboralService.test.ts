// LA SEGUNDA FUENTE DE LA FECHA DE PAGO NO PUEDE FALLAR EN SILENCIO.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Rechazo del auditor (29/09/2026): `jornal_quincena` se leía con la sesión `authenticated`, que no
// tenía SELECT sobre la tabla. La lectura devolvía error, la quincena 01–15/09 salía con «—» y nadie
// se enteraba de por qué. El papel debe seguir diciendo «—» (no inventa fecha), pero el error tiene
// que salir en `errores` para que la solapa lo muestre. Si alguien traga ese error (`?? null` sobre
// `jornal.data` sin mirar `jornal.error`), el primer test se pone rojo.
//
// El segundo fija LAS COLUMNAS que la consulta toca: el grant de 20260929T1700 es por columna, y una
// columna nueva en el `select` o en un filtro sin grant repite el mismo «permission denied».

import test from 'node:test'
import assert from 'node:assert/strict'
import { leerDetallesLaborales } from './detalleLaboralService.ts'
import { quincenaDe } from './quincena.ts'

type Resultado = { data: unknown; error: { message: string } | null }
type Llamada = { tabla: string; select: string; filtros: string[] }

/** Base falsa: cada tabla devuelve su resultado; anota qué columnas pidió cada consulta. */
function baseFalsa(porTabla: Record<string, Resultado>) {
  const llamadas: Llamada[] = []
  const supabase = {
    from(tabla: string) {
      const llamada: Llamada = { tabla, select: '', filtros: [] }
      llamadas.push(llamada)
      const q: Record<string, unknown> = {}
      q.select = (cols: string) => { llamada.select = cols; return q }
      q.eq = (col: string) => { llamada.filtros.push(col); return q }
      q.order = () => q
      q.maybeSingle = () => Promise.resolve(porTabla[tabla] ?? { data: null, error: null })
      q.then = (ok: (r: Resultado) => unknown) => Promise.resolve(porTabla[tabla] ?? { data: [], error: null }).then(ok)
      return q
    },
  }
  return { supabase: supabase as unknown as Parameters<typeof leerDetallesLaborales>[0], llamadas }
}

const cuadroVacio = {
  datos: { porPersona: {} }, grilla: [], liquidacion: { cuadros: [] },
} as unknown as Parameters<typeof leerDetallesLaborales>[1]
const quincena = quincenaDe('2026-09-10')

test('si jornal_quincena devuelve error, se registra en errores y no se traga', async () => {
  const { supabase } = baseFalsa({
    jornal_quincena: { data: null, error: { message: 'permission denied for table jornal_quincena' } },
  })
  const r = await leerDetallesLaborales(supabase, cuadroVacio, quincena)
  const falla = r.errores.find((e) => e.que === 'la fecha de pago de la quincena')
  assert.ok(falla, 'el error de la segunda fuente tiene que llegar a `errores`')
  assert.match(falla.error, /permission denied/)
})

test('sin error de lectura, no se inventa ninguna falla', async () => {
  const { supabase } = baseFalsa({ jornal_quincena: { data: { fecha_pago: '2026-09-16' }, error: null } })
  const r = await leerDetallesLaborales(supabase, cuadroVacio, quincena)
  assert.deepEqual(r.errores.filter((e) => e.que.startsWith('la fecha de pago')), [])
})

test('la consulta a jornal_quincena sólo toca columnas con GRANT a authenticated', async () => {
  const { supabase, llamadas } = baseFalsa({})
  await leerDetallesLaborales(supabase, cuadroVacio, quincena)
  const jq = llamadas.find((l) => l.tabla === 'jornal_quincena')
  assert.ok(jq, 'debe consultar jornal_quincena')
  const permitidas = new Set(['desde', 'hasta', 'clase', 'fecha_pago'])
  const tocadas = [...jq.select.split(',').map((c) => c.trim()), ...jq.filtros]
  for (const c of tocadas) assert.ok(permitidas.has(c), `«${c}» no tiene grant de columna (20260929T1700)`)
})
