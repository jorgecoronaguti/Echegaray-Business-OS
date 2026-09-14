'use server'

// EL VALOR HORA (O EL NETO MENSUAL) ESCRITO EN LA CELDA DEL CUADRO DE LA QUINCENA.
//
// Dueño, 14/09/2026: *«no puedo modificar el valor hora»* → «En la celda + historial al lado».
//
// ═══ UNA FILA NUEVA, NUNCA UN UPDATE ═══
//
// Es lo que dice el comentario de la tabla desde su migración: *«Un aumento es una fila nueva, nunca
// un UPDATE»*. Sin esa regla no hay historial: el valor de marzo desaparece cuando alguien escribe el
// de septiembre, y el historial que el dueño pidió ver no se puede reconstruir de ningún lado.
//
// ═══ POR QUÉ NO ES `guardarValorHora` ═══
//
// Esa acción —la del cuadro clásico y la cadena de Pagos— hace `upsert` con `desde = hoy` y BORRA la
// fila cuando se vacía la celda. Las dos cosas rompen la regla de arriba, y además `hoy` no es la
// quincena que se está mirando: un aumento escrito el 20 sobre la quincena del 1 no la movería.
// Acá `desde` es el PRIMER DÍA DE LA QUINCENA MIRADA, que es lo que la liquidación usa para elegir
// la tarifa (`tarifaVigenteAl`). Cambiar la vieja habría cambiado a la vez dos pantallas que no se
// pidió tocar; queda declarada como pendiente.
//
// ═══ LAS CERRADURAS, EN ORDEN ═══
//
//   1. Zod                      forma, fechas, importe positivo.
//   2. `permisoDeLiquidacion`   sólo quien liquida sueldos (la acción es un endpoint).
//   3. forma del cuadro         obreros $/h, oficina neto mensual, finales ninguna.
//   4. quincena cerrada         R6: lo sellado no se reliquida.
//   5. misma fecha              ya hay una fila con ese `desde`: se rechaza, no se pisa.
//   6. el insert + relectura    lo que la base devolvió, no el 201.
//
// La escritura va con la clave de servicio porque `authenticated` no tiene GRANT de INSERT sobre
// `persona_tarifa` (migración 20260909T1200): es el mismo camino que ya usa `guardarValorHora`, y la
// puerta de esa clave es el paso 2.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { validarTarifa } from './liquidacionTarifa'
import { formaEditable, pctDeAumento } from './cuadroDeJornales'
import { tarifaVigenteAl } from './liquidacionQuincena'

const RUTA = '/administracion/personas'
const ISO = /^\d{4}-\d{2}-\d{2}$/

const entradaSchema = z.object({
  persona_id: z.string().uuid(),
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
  grupo: z.enum(['obreros', 'oficina', 'final']),
  forma: z.enum(['hora', 'mensual']),
  valor: z.coerce.number().positive('El importe tiene que ser mayor a cero.').finite(),
})

export type ResultadoTarifa = { ok: true; mensaje: string } | { ok: false; error: string }

/** `2026-09-01` → `01/09/26`. */
const corta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

export async function registrarTarifaDesdeLaQuincena(entrada: unknown): Promise<ResultadoTarifa> {
  const parsed = entradaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, desde, hasta, grupo, forma, valor } = parsed.data

  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  // LA FORMA LA IMPONE EL CUADRO. Un $/h escrito sobre Oficina le borraría el neto acordado en la
  // liquidación (CHECK «una sola forma»), y la persona cambiaría de cuadro sola.
  if (formaEditable(grupo) !== forma) {
    return { ok: false, error: 'Esa forma de tarifa no corresponde a este cuadro.' }
  }
  const valida = validarTarifa({
    valorHora: forma === 'hora' ? valor : null,
    netoMensual: forma === 'mensual' ? valor : null,
    desde, origen: 'web:cuadro de la quincena',
  })
  if (!valida.ok) return { ok: false, error: valida.error }

  const estado = await supabase.from('liquidacion_quincena')
    .select('estado').eq('desde', desde).eq('hasta', hasta).eq('grupo', grupo).maybeSingle()
  // FALLA CERRADO: sin poder leer el estado no se sabe si la quincena está sellada.
  if (estado.error) return { ok: false, error: `No pude leer el estado de la quincena: ${estado.error.message}` }
  if ((estado.data as { estado: string } | null)?.estado === 'cerrada') {
    return { ok: false, error: 'La quincena está cerrada: el valor hora no se cambia.' }
  }

  const previas = await supabase.from('persona_tarifa')
    .select('desde, valor_hora, neto_mensual, origen').eq('persona_id', personaId)
  if (previas.error) return { ok: false, error: `No pude leer las tarifas: ${previas.error.message}` }
  const filas = ((previas.data ?? []) as {
    desde: string; valor_hora: number | string | null; neto_mensual: number | string | null; origen: string | null
  }[]).map((t) => ({
    desde: t.desde, origen: t.origen ?? '',
    valorHora: t.valor_hora == null ? null : Number(t.valor_hora),
    netoMensual: t.neto_mensual == null ? null : Number(t.neto_mensual),
  }))
  const misma = filas.find((t) => t.desde === desde)
  if (misma) {
    return {
      ok: false,
      error: `Ya hay un valor desde el ${corta(desde)} (${misma.valorHora ?? misma.netoMensual}). `
        + 'Un aumento es una fila nueva: no piso la existente.',
    }
  }
  const anterior = tarifaVigenteAl(filas, desde)
  const valorAnterior = forma === 'hora' ? anterior?.valorHora ?? null : anterior?.netoMensual ?? null
  if (valorAnterior === valor) return { ok: false, error: 'Es el mismo valor que ya rige: no agrego una fila.' }

  const admin = createAdminClient()
  const { data, error } = await admin.from('persona_tarifa')
    .insert({
      persona_id: personaId, desde,
      valor_hora: valida.tarifa.valorHora, neto_mensual: valida.tarifa.netoMensual,
      origen: valida.tarifa.origen,
    })
    .select('desde, valor_hora, neto_mensual')
  if (error) return { ok: false, error: error.message }
  // UN 201 NO PRUEBA LA ESCRITURA: se acusa lo que la base devolvió.
  const fila = (data ?? [])[0] as { valor_hora: unknown; neto_mensual: unknown } | undefined
  const guardado = fila ? Number(forma === 'hora' ? fila.valor_hora : fila.neto_mensual) : null
  if (guardado !== valor) return { ok: false, error: 'La base no devolvió la tarifa que mandé: revisá el historial.' }

  revalidatePath(RUTA)
  const pct = pctDeAumento(valorAnterior, valor)
  return { ok: true, mensaje: `Rige desde el ${corta(desde)}${pct == null ? '' : ` · ${pct > 0 ? '+' : ''}${pct}%`}.` }
}
