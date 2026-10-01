'use server'

// ACEPTAR UN RECIBO — la única escritura de `recibo_liquidacion`.
//
// Dueño, 22/09/2026: *«si se pone aceptar e imprimr, funciones q no estan ahora»*. Aceptar es esto: queda
// registrado en el legajo de la persona. La impresión la dispara la pantalla DESPUÉS, y sólo si esto salió
// bien — si el registro falla no se imprime en silencio un papel del que no queda rastro.
//
// ═══ POR QUÉ VUELVE A PREGUNTAR QUIÉN LLAMA ═══
//
// Una acción de servidor es un endpoint y se invoca sin abrir jamás la pantalla. El panel donde se arma el
// recibo es de Dirección y Administración (`liquida_sueldos()`), así que acá se pregunta lo mismo contra la
// cookie. La cerradura que vale es la tercera: `registrar_recibo_liquidacion` lo vuelve a exigir adentro de
// la base, donde también alcanza a quien llame por PostgREST sin pasar por Next.
//
// ═══ EL ACUSE NO ES EVIDENCIA: SE LEE LA FILA DE VUELTA ═══
//
// La RPC devuelve un uuid, y un uuid devuelto no prueba que la fila esté (trampa ya pagada: «PostgREST: 204
// no prueba escritura»). Se lee `recibo_liquidacion` por ese id —con el permiso del que llama, no con el de
// la función— y recién con la fila en la mano se dice «guardado». Si la lectura vuelve vacía, NO se imprime.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { liquidaSueldos } from '@/features/auth/types/areas'
import {
  mismoPapel, motivoParaNoEmitir, type PapelDelRecibo, type ReciboDelLoteGuardado, type ReciboSellado,
} from './reciboEmitido.ts'
import type { Resultado } from './personasActions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/

// El renglón tal como lo dibuja el papel. `importe` y `horas` pueden ser `null`: es «sin dato», y el papel
// lo escribe así. Nada de `any`: lo que entra se valida, aunque venga de una pantalla propia.
const renglon = z.object({
  rotulo: z.string().min(1).max(120),
  detalle: z.string().max(200).nullish(),
  importe: z.number().finite().nullable(),
  horas: z.number().finite().nullish(),
  sub: z.boolean().optional(),
})

const selladoSchema = z.object({
  personaId: z.string().regex(UUID, 'No sé de qué persona es este recibo.'),
  nombre: z.string().trim().min(1).max(160),
  categoria: z.string().trim().max(120).nullable(),
  quincenaDesde: z.string().regex(FECHA),
  quincenaHasta: z.string().regex(FECHA),
  horas: z.number().finite().nullable(),
  banco: z.number().finite().nullable(),
  efectivo: z.number().finite().nullable(),
  total: z.number().finite().nullable(),
  renglones: z.object({ horas: z.array(renglon).max(20), medios: z.array(renglon).max(40) }),
})

export async function aceptarRecibo(sellado: ReciboSellado): Promise<Resultado> {
  const leido = leerSellado(sellado)
  if (!leido.ok) return leido
  const r = leido.recibo
  const supabase = await createClient()
  const permiso = await puedeEmitir(supabase)
  if (permiso) return { ok: false, error: permiso }
  return registrar(supabase, r)
}

/** Valida la forma y la regla del papel. Lo mismo para uno que para un lote. */
function leerSellado(sellado: ReciboSellado): { ok: true; recibo: ReciboSellado } | { ok: false; error: string } {
  const parsed = selladoSchema.safeParse(sellado)
  if (!parsed.success) return { ok: false, error: `El recibo no está bien formado: ${parsed.error.issues[0].message}` }
  const r = parsed.data as ReciboSellado
  // LA MISMA REGLA QUE EL PAPEL, ANTES DE ESCRIBIR. La base tiene su propio CHECK; acá se puede decir en
  // castellano cuál es la palabra que sobra, en vez de devolver un `check_violation`.
  const motivo = motivoParaNoEmitir(r)
  if (motivo) return { ok: false, error: motivo }
  return { ok: true, recibo: r }
}

type Cliente = Awaited<ReturnType<typeof createClient>>

/** Por qué quien llama NO puede emitir, o `null` si puede. */
async function puedeEmitir(supabase: Cliente): Promise<string | null> {
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  // FALLA CERRADO: sin perfil legible no se sabe quién es, y un default permisivo dejaría a cualquiera
  // emitiendo recibos a nombre de la empresa.
  if (errPerfil) return 'No pude verificar tu permiso. No guardé nada y no imprimí.'
  if (!liquidaSueldos(perfil?.rol)) return 'Los recibos los emiten Dirección y Administración.'
  return null
}

async function registrar(supabase: Cliente, r: ReciboSellado): Promise<Resultado> {
  const { data: id, error } = await supabase.rpc('registrar_recibo_liquidacion', {
    p_persona: r.personaId,
    p_desde: r.quincenaDesde,
    p_hasta: r.quincenaHasta,
    p_nombre: r.nombre,
    p_renglones: r.renglones,
    p_categoria: r.categoria,
    p_horas: r.horas,
    p_banco: r.banco,
    p_efectivo: r.efectivo,
    p_total: r.total,
  })
  if (error) {
    // La migración todavía no está aplicada: se dice, y se dice que NO se guardó nada.
    if (error.code === 'PGRST202' || /registrar_recibo_liquidacion/.test(error.message)) {
      return { ok: false, error: 'Todavía no puedo guardar recibos en el legajo: falta aplicar la migración en la base. No imprimí.' }
    }
    return { ok: false, error: `No guardé el recibo: ${error.message}` }
  }
  if (typeof id !== 'string') return { ok: false, error: 'La base no devolvió el recibo. No lo doy por guardado.' }

  // LA FILA, LEÍDA DE VUELTA CON EL PERMISO DEL QUE LLAMA. Es la evidencia del efecto.
  const { data: fila, error: errLeer } = await supabase
    .from('recibo_liquidacion').select('id, emitido_en').eq('id', id).maybeSingle()
  if (errLeer || !fila?.id) {
    return { ok: false, error: 'Guardé el recibo pero no pude leerlo de vuelta. No lo doy por emitido: revisá el legajo antes de entregar el papel.' }
  }

  revalidatePath(`/administracion/personas/${r.personaId}`)
  return { ok: true, id: fila.id, mensaje: 'Recibo registrado en el legajo.' }
}

type UltimoGuardado = { id: string; emitido_en: string } & PapelDelRecibo

/**
 * LOS YA GUARDADOS de la quincena del lote, una lectura para todos: el último de cada persona, sin los
 * archivados. Si no se pueden leer NO se registra a ciegas: sería duplicar lo que tal vez ya está.
 */
async function ultimosGuardados(
  supabase: Cliente, validos: readonly ReciboSellado[],
): Promise<{ ok: true; ultimos: Map<string, UltimoGuardado> } | { ok: false; error: string }> {
  const ultimos = new Map<string, UltimoGuardado>()
  if (validos.length === 0) return { ok: true, ultimos }
  const { data, error } = await supabase
    .from('recibo_liquidacion')
    .select('id, persona_id, nombre, categoria, total, renglones, emitido_en')
    .eq('quincena_desde', validos[0].quincenaDesde).eq('quincena_hasta', validos[0].quincenaHasta)
    .in('persona_id', validos.map((r) => r.personaId))
    .is('archivado_en', null)
  if (error) return { ok: false, error: `No pude leer los recibos ya guardados: ${error.message}. No guardé nada.` }
  for (const f of data ?? []) {
    const ya = ultimos.get(f.persona_id)
    if (ya && f.emitido_en <= ya.emitido_en) continue
    ultimos.set(f.persona_id, {
      id: f.id, emitido_en: f.emitido_en, nombre: f.nombre ?? '', categoria: f.categoria ?? null,
      total: f.total == null ? null : Number(f.total),
      renglones: (f.renglones ?? { horas: [], medios: [] }) as PapelDelRecibo['renglones'],
    })
  }
  return { ok: true, ultimos }
}

/** Tope de un lote: el plantel entero entra varias veces; más que esto es un llamado que no salió de la pantalla. */
const MAXIMO_DEL_LOTE = 80

/**
 * GUARDAR LOS RECIBOS DE UN LOTE (rehacer del 01/10/2026) — una sola llamada para todos, y sin duplicar.
 *
 * Por cada uno: si el último recibo guardado de esa persona y quincena es EL MISMO PAPEL (`mismoPapel`), se
 * reusa y no se registra otro; si no hay o cambió, se registra por la misma puerta que el individual. Devuelve
 * qué pasó con cada uno: la pantalla imprime sólo los que quedaron con `ok`.
 */
export async function guardarRecibosDelLote(
  sellados: ReciboSellado[],
): Promise<{ ok: true; recibos: ReciboDelLoteGuardado[] } | { ok: false; error: string }> {
  if (!Array.isArray(sellados) || sellados.length === 0) return { ok: false, error: 'No hay recibos para guardar.' }
  if (sellados.length > MAXIMO_DEL_LOTE) return { ok: false, error: `Un lote lleva hasta ${MAXIMO_DEL_LOTE} recibos.` }
  const supabase = await createClient()
  const permiso = await puedeEmitir(supabase)
  if (permiso) return { ok: false, error: permiso }

  const leidos = sellados.map((s) => ({ personaId: typeof s?.personaId === 'string' ? s.personaId : '', leido: leerSellado(s) }))
  const validos = leidos.flatMap((x) => (x.leido.ok ? [x.leido.recibo] : []))
  const quincenas = new Set(validos.map((r) => `${r.quincenaDesde}|${r.quincenaHasta}`))
  if (quincenas.size > 1) return { ok: false, error: 'Un lote es de una sola quincena.' }

  const leidosDeLaBase = await ultimosGuardados(supabase, validos)
  if (!leidosDeLaBase.ok) return leidosDeLaBase
  const ultimos = leidosDeLaBase.ultimos

  const recibos: ReciboDelLoteGuardado[] = []
  for (const { personaId, leido } of leidos) {
    if (!leido.ok) { recibos.push({ personaId, ok: false, error: leido.error }); continue }
    const r = leido.recibo
    const ya = ultimos.get(r.personaId)
    if (ya && mismoPapel(ya, r)) { recibos.push({ personaId: r.personaId, ok: true, id: ya.id, yaEstaba: true }); continue }
    const x = await registrar(supabase, r)
    recibos.push(x.ok ? { personaId: r.personaId, ok: true, id: x.id, yaEstaba: false } : { personaId: r.personaId, ok: false, error: x.error })
  }
  // La marca «impreso» del cuadro sale de estos recibos: la pantalla de Liquidación se vuelve a leer.
  if (recibos.some((x) => x.ok && !x.yaEstaba)) revalidatePath('/administracion/personas')
  return { ok: true, recibos }
}
