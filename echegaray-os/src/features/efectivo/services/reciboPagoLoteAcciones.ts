'use server'

// EMITIR EN LOTE LOS RECIBOS POR LA DIFERENCIA DE EFECTIVO (Liquidación de horas, dueño 02/10/2026: «no voy a ir
// haciendo 11 recibos»). Un recibo por persona, cada uno con su número RP, por la MISMA función de la base que el
// recibo de a uno (`emitir_recibo_pago_efectivo`): exige Administración, numera y no deja reescribir.
//
// ═══ LO QUE NO SE LE CREE AL NAVEGADOR ═══
// El nombre y el DNI/CUIL los lee el servidor del legajo: el formulario sólo manda a quién (persona_id), cuánto y
// el id del recibo. Los ids nacen en el navegador al abrir el lote: un doble clic, o reintentar después de un
// corte, devuelve el mismo número en vez de gastar otro.
//
// ═══ UNO QUE FALLA NO FRENA A LOS DEMÁS ═══
// Cada recibo es su propia escritura. Si el de Reta rebota, los diez emitidos quedan emitidos y se dice cuál falló
// y por qué: deshacerlos borraría números que la base ya tomó. Van en orden, uno por uno, para que la numeración
// siga el orden del cuadro.
//
// No anota el pago en la liquidación: el dueño suma cada importe al «Pagado» a mano.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { faltaMigracion, mensajeDeError } from '../logica/formularios'
import { diaAR } from '../logica/entregas'
import { validarReciboPago } from '../logica/reciboPago'
import {
  MIGRACION_RECIBO_PAGO, leerDiferenciasEmitidas, leerPersonasParaRecibo, type DiferenciaEmitida,
} from './reciboPagoDatos'

const loteSchema = z.object({
  fecha: z.string().max(10),
  concepto: z.string().max(400),
  recibos: z.array(z.object({
    id: z.string().uuid(),
    personaId: z.string().uuid(),
    importe: z.string().max(30),
  })).min(1).max(100),
})

export type ResultadoDelRecibo = { personaId: string; id: string } & ({ ok: true; codigo: string } | { ok: false; error: string })

export async function emitirRecibosPorLaDiferenciaAction(
  e: z.input<typeof loteSchema>,
): Promise<{ ok: true; resultados: ResultadoDelRecibo[] } | { ok: false; error: string }> {
  const p = loteSchema.safeParse(e)
  if (!p.success) return { ok: false, error: 'El lote llegó incompleto.' }
  try {
    const supabase = await createClient()
    const personas = await leerPersonasParaRecibo(p.data.recibos.map((r) => r.personaId))
    const hoy = diaAR(new Date().toISOString())
    const resultados: ResultadoDelRecibo[] = []
    for (const r of p.data.recibos) {
      const base = { personaId: r.personaId, id: r.id }
      const persona = personas.get(r.personaId)
      if (!persona) { resultados.push({ ...base, ok: false, error: 'No encontré a la persona en el padrón.' }); continue }
      const v = validarReciboPago({
        aNombreDe: persona.nombre, documento: persona.documento ?? '', importe: r.importe,
        fecha: p.data.fecha, concepto: p.data.concepto, obra: '',
      }, hoy)
      if (!v.ok) { resultados.push({ ...base, ok: false, error: v.error }); continue }
      const { data, error } = await supabase.rpc('emitir_recibo_pago_efectivo', {
        p_id: r.id, p_fecha: v.dato.fecha, p_a_nombre_de: v.dato.aNombreDe, p_documento: v.dato.documento,
        p_importe: v.dato.importe, p_concepto: v.dato.concepto, p_obra: null, p_obra_id: null,
        p_proveedor_id: null, p_persona_id: r.personaId, p_compra_fila: null,
      })
      // Sin la tabla no se emitió ninguno: se corta acá en vez de repetir el mismo motivo once veces.
      if (faltaMigracion(error)) return { ok: false, error: `El recibo de pago todavía no está publicado en la base (migración ${MIGRACION_RECIBO_PAGO}): no se emitió nada.` }
      if (error) resultados.push({ ...base, ok: false, error: mensajeDeError(error) })
      else if (typeof data !== 'string' || !data) resultados.push({ ...base, ok: false, error: 'La base no devolvió el número del recibo.' })
      else resultados.push({ ...base, ok: true, codigo: data })
    }
    revalidatePath('/administracion/compras')
    return { ok: true, resultados }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

const yaEmitidosSchema = z.object({ personaIds: z.array(z.string().uuid()).min(1).max(300), marca: z.string().min(10).max(80) })

/**
 * LOS QUE YA TIENEN SU RP DE LA DIFERENCIA DE ESTA QUINCENA — para no emitirles otro y para imprimirles el papel.
 * Sólo lectura. Un error se devuelve como error: el panel no deja emitir sin saber quién ya tiene recibo.
 */
export async function diferenciasYaEmitidasAction(
  e: z.input<typeof yaEmitidosSchema>,
): Promise<{ ok: true; recibos: DiferenciaEmitida[] } | { ok: false; error: string }> {
  const p = yaEmitidosSchema.safeParse(e)
  if (!p.success) return { ok: false, error: 'La consulta llegó incompleta.' }
  try {
    return { ok: true, recibos: await leerDiferenciasEmitidas(p.data.personaIds, p.data.marca) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}
