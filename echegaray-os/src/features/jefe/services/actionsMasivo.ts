'use server'

// J04 · AVANCE MASIVO — «tocá las que avanzaron y poné a cuánto llegaron».
//
// ═══ MASIVO NO SIGNIFICA A CIEGAS ═══
//
// Cada fila que entra queda marcada con `masivo = true`, y eso no es decorativo: un 75 % aplicado a
// veinte tareas a la vez no tiene la misma precisión que uno medido de a uno, y dentro de seis meses
// alguien va a querer distinguirlos. La columna existe para eso y se llena siempre.
//
// ═══ LO QUE NO ENTRA, NO ENTRA — Y SE DICE CUÁL ═══
//
// Una tarea medida por cantidad o por pasos ACEPTA una fila con `avance_pct` y su porcentaje no se
// mueve: `obra_actividad_control` lo calcula de otra manera para esos dos métodos. Sería el peor
// modo de falla posible —éxito informado, dato quieto— así que se rechazan acá, nombrándolas. La
// pantalla ya las mostraba apagadas; esto es la segunda barrera, porque un `POST` no pasa por la
// pantalla.
//
// ═══ SE ESCRIBE LO QUE SE PUEDE Y SE INFORMA LO QUE NO ═══
//
// Un insert de veinte filas es UNA sentencia: si una choca, se caen las veinte. Se insertan las que
// se pueden y se DICE cuántas quedaron afuera y por qué. Saltear en silencio sería peor que fallar.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from '@/features/obras/services/actions'
import { AVISO_CRITERIO, deltaHasta, elPorcentajeMueveElAvance, VALORES_MASIVOS } from './medicion.ts'
import type { Metodo } from './medicion.ts'

const esquema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  objetivo: z.coerce.number().min(1, 'Elegí a cuánto llegaron').max(100, 'El avance va de 0 a 100'),
  tareas: z.string().min(1, 'Elegí las tareas que avanzaron'),
  criterio: z.string().trim().max(500).optional(),
})

interface FilaControl {
  actividad_id: string
  obra_id: string
  nombre: string
  tipo: string
  metodo_avance: Metodo | null
  avance_pct: number | null
}

export async function aplicarAvanceMasivo(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = esquema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (!(VALORES_MASIVOS as readonly number[]).includes(d.objetivo)) {
    return { ok: false, error: 'Ese avance no es uno de los valores de la pantalla.' }
  }
  const ids = [...new Set(d.tareas.split(',').map((s) => s.trim()).filter(Boolean))]
  if (ids.length === 0) return { ok: false, error: 'Elegí las tareas que avanzaron.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('obra_actividad_control')
    .select('actividad_id, obra_id, nombre, tipo, metodo_avance, avance_pct')
    .in('actividad_id', ids)
  if (error) return { ok: false, error: error.message }
  const filas = ((data ?? []) as unknown as FilaControl[])
    .map((f) => ({ ...f, avance_pct: f.avance_pct == null ? null : Number(f.avance_pct) }))

  const criterio = d.criterio?.trim() || null
  const hayManual = filas.some((f) => f.obra_id === obraId && f.metodo_avance === 'manual')
  if (hayManual && !criterio) return { ok: false, error: AVISO_CRITERIO }

  const entran: Record<string, unknown>[] = []
  const afuera: string[] = []
  for (const f of filas) {
    if (f.obra_id !== obraId) { afuera.push(`${f.nombre} (es de otra obra)`); continue }
    if (f.tipo === 'resumen') { afuera.push(`${f.nombre} (agrupa otras tareas)`); continue }
    if (!f.metodo_avance || !elPorcentajeMueveElAvance(f.metodo_avance)) {
      afuera.push(`${f.nombre} (no se mide por porcentaje)`)
      continue
    }
    const delta = deltaHasta(d.objetivo, f.avance_pct)
    if (delta == null) { afuera.push(`${f.nombre} (ya estaba en ${f.avance_pct ?? 0} % o más)`); continue }
    entran.push({
      obra_id: obraId, actividad_id: f.actividad_id, fecha: d.fecha,
      avance_pct: delta, metodo: f.metodo_avance,
      // El criterio SÓLO donde la base lo exige. Pegárselo a una tarea medida por partes contaría
      // una historia que no pasó: ese avance no lo declaró nadie, se sumó de los partes.
      criterio: f.metodo_avance === 'manual' ? criterio : null,
      masivo: true, fuente: 'jefe_telefono',
    })
  }
  const noEncontradas = ids.filter((id) => !filas.some((f) => f.actividad_id === id))
  if (noEncontradas.length > 0) afuera.push(`${noEncontradas.length} que no pude leer`)

  if (entran.length === 0) {
    return { ok: false, error: `No se cargó ninguna: ${afuera.join(' · ')}.` }
  }
  const { error: eIns } = await supabase.from('obra_ejecucion').insert(entran)
  if (eIns) return { ok: false, error: eIns.message }

  revalidatePath('/obra/hoy')
  revalidatePath('/obra/tareas')
  const mensaje = `${entran.length} ${entran.length === 1 ? 'tarea' : 'tareas'} al ${d.objetivo} %`
  return { ok: true, mensaje: afuera.length === 0 ? mensaje : `${mensaje}. Afuera: ${afuera.join(' · ')}.` }
}
