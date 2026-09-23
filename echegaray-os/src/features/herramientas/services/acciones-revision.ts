'use server'

// REGISTRAR UNA REVISIÓN DE UN RODADO O MÁQUINA (migración 20260923T1510) — por `registrar_revision_activo`.
//
// La base rechaza una fecha futura, un vencimiento anterior a la revisión, un apto condicional sin plazo
// y una revisión sobre una herramienta de mano o un activo en baja. Acá sólo se valida la forma con Zod.
// La foto del certificado ya subió del navegador al bucket (`services/subida-foto.ts`): acá llega la
// RUTA y se convierte en URL pública, como en `reportarProblemaAction`.

import { z } from 'zod'
import { esRutaDeFoto, urlPublicaDeFoto } from '../logica/foto'
import { MIGRACION_REVISION } from '../logica/revision'
import { rpcHerramientas, type Resultado } from './rpc'

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como día/mes/año')
/** Lo que escribe la pantalla en un campo numérico: «84320», «1240,5», vacío. Vacío = null, nunca 0. */
const numeroOpcional = (max: number, mensaje: string) =>
  z.string().optional().transform((v, ctx) => {
    const t = (v ?? '').trim().replace(',', '.')
    if (!t) return null
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0 || n > max) { ctx.addIssue({ code: 'custom', message: mensaje }); return z.NEVER }
    return n
  })

const schema = z.object({
  activo: z.string().uuid(),
  tipo: z.enum(['rto', 'service', 'seguro', 'inspeccion'], { message: 'Elegí qué revisión es' }),
  fecha: fechaIso,
  vencimiento: z.union([z.literal(''), fechaIso]).optional().transform((v) => v || null),
  lectura: numeroOpcional(9_999_999, 'La lectura es un número de 0 o más'),
  resultado: z.union([z.literal(''), z.enum(['apto', 'condicional', 'rechazado'])]).optional().transform((v) => v || null),
  lugar: z.string().trim().max(160).optional().transform((v) => v || null),
  numero: z.string().trim().max(80).optional().transform((v) => v || null),
  costo: numeroOpcional(999_999_999, 'El costo es un número de 0 o más'),
  observaciones: z.string().trim().max(1000).optional().transform((v) => v || null),
  /** La ruta en el bucket, si se subió una foto. */
  adjunto: z.string().optional().transform((v) => v || null),
})

export type EntradaRevision = z.input<typeof schema>

export async function registrarRevisionAction(entrada: EntradaRevision): Promise<Resultado<string>> {
  const p = schema.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  if (p.data.resultado === 'condicional' && !p.data.vencimiento) {
    return { ok: false, error: 'Un apto condicional lleva el plazo de la nueva verificación: cargá el vencimiento.' }
  }
  let adjunto: string | null = null
  if (p.data.adjunto) {
    if (!esRutaDeFoto(p.data.adjunto)) return { ok: false, error: 'La foto no quedó bien subida. Probá de nuevo.' }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) return { ok: false, error: 'Falta la URL de Supabase en el servidor.' }
    adjunto = urlPublicaDeFoto(base, p.data.adjunto)
  }
  return rpcHerramientas<string>('registrar_revision_activo', {
    p_activo: p.data.activo, p_tipo: p.data.tipo, p_fecha: p.data.fecha, p_vencimiento: p.data.vencimiento,
    p_lectura: p.data.lectura, p_resultado: p.data.resultado, p_lugar: p.data.lugar, p_numero: p.data.numero,
    p_costo: p.data.costo, p_observaciones: p.data.observaciones, p_adjunto_url: adjunto,
  }, MIGRACION_REVISION)
}
