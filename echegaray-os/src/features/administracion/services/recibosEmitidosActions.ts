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
import { motivoParaNoEmitir, type ReciboSellado } from './reciboEmitido.ts'
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
  const parsed = selladoSchema.safeParse(sellado)
  if (!parsed.success) return { ok: false, error: `El recibo no está bien formado: ${parsed.error.issues[0].message}` }
  const r = parsed.data as ReciboSellado

  // LA MISMA REGLA QUE EL PAPEL, ANTES DE ESCRIBIR. La base tiene su propio CHECK; acá se puede decir en
  // castellano cuál es la palabra que sobra, en vez de devolver un `check_violation`.
  const motivo = motivoParaNoEmitir(r)
  if (motivo) return { ok: false, error: motivo }

  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  // FALLA CERRADO: sin perfil legible no se sabe quién es, y un default permisivo dejaría a cualquiera
  // emitiendo recibos a nombre de la empresa.
  if (errPerfil) return { ok: false, error: 'No pude verificar tu permiso. No guardé nada y no imprimí.' }
  if (!liquidaSueldos(perfil?.rol)) {
    return { ok: false, error: 'Los recibos los emiten Dirección y Administración.' }
  }

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
