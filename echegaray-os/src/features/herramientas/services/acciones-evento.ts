'use server'

// LIBRO DE VIDA DEL RODADO (migración 20260930T2300) — registrar y avanzar un evento.
//
// «Hay que llevarlo», «en el mecánico» y «hecho» se deciden en la base (`registrar_evento_activo`,
// `avanzar_evento_activo`): ella mueve el rodado al taller, lo devuelve a donde estaba y asienta el próximo
// service como vencimiento. Acá sólo se valida la forma con Zod. Mismos permisos para todos los niveles.

import { z } from 'zod'
import { MIGRACION_EVENTO } from '../logica/evento'
import { rpcHerramientas, type Resultado } from './rpc'

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como día/mes/año')
const numeroOpcional = (max: number, mensaje: string) =>
  z.string().optional().transform((v, ctx) => {
    const t = (v ?? '').trim().replace(',', '.')
    if (!t) return null
    const n = Number(t)
    if (!Number.isFinite(n) || n < 0 || n > max) { ctx.addIssue({ code: 'custom', message: mensaje }); return z.NEVER }
    return n
  })
const textoOpcional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null)
const fechaOpcional = z.union([z.literal(''), fechaIso]).optional().transform((v) => v || null)

const comunes = {
  km: numeroOpcional(9_999_999, 'El km es un número de 0 o más'),
  proveedor: z.union([z.literal(''), z.string().uuid()]).optional().transform((v) => v || null),
  taller: textoOpcional(160),
  costo: numeroOpcional(999_999_999, 'El costo es un número de 0 o más'),
  compraRef: textoOpcional(80),
  proximoKm: numeroOpcional(9_999_999, 'El km del próximo service es un número de 0 o más'),
  proximoFecha: fechaOpcional,
}

const nuevo = z.object({
  activo: z.string().uuid(),
  tipo: z.enum(['reparacion', 'service', 'neumaticos', 'bateria', 'chapa', 'otro'], { message: 'Elegí qué trabajo es' }),
  situacion: z.enum(['pendiente', 'en_taller', 'hecho'], { message: 'Elegí en qué está' }),
  fecha: fechaIso,
  descripcion: z.string().trim().min(3, 'Contá en una línea qué pasa (3 letras o más)').max(1000),
  ...comunes,
})
export type EntradaEvento = z.input<typeof nuevo>

function tallerFalta(situacion: string, proveedor: string | null, taller: string | null, propio = false) {
  return (situacion === 'en_taller' || situacion === 'hecho') && !proveedor && !taller && !propio
    ? 'Falta el taller: elegí un proveedor o escribí el nombre (o «propio» si lo hizo la empresa).'
    : null
}

export async function registrarEventoAction(entrada: EntradaEvento): Promise<Resultado<string>> {
  const p = nuevo.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  const falta = tallerFalta(d.situacion, d.proveedor, d.taller)
  if (falta) return { ok: false, error: falta }
  if (d.proximoFecha && d.proximoFecha < d.fecha) return { ok: false, error: 'El próximo service no puede ser anterior a la fecha del trabajo.' }
  return rpcHerramientas<string>('registrar_evento_activo', {
    p_activo: d.activo, p_tipo: d.tipo, p_situacion: d.situacion, p_fecha: d.fecha, p_descripcion: d.descripcion,
    p_km: d.km, p_proveedor: d.proveedor, p_taller: d.taller, p_costo: d.costo, p_compra_ref: d.compraRef,
    p_proximo_km: d.proximoKm, p_proximo_fecha: d.proximoFecha,
  }, MIGRACION_EVENTO)
}

const avance = z.object({
  evento: z.string().uuid(),
  situacion: z.enum(['en_taller', 'hecho'], { message: 'Elegí a dónde pasa' }),
  fecha: fechaOpcional,
  ...comunes,
})
export type EntradaAvance = z.input<typeof avance>

export async function avanzarEventoAction(entrada: EntradaAvance): Promise<Resultado<string>> {
  const p = avance.safeParse(entrada)
  if (!p.success) return { ok: false, error: p.error.issues[0].message }
  const d = p.data
  return rpcHerramientas<string>('avanzar_evento_activo', {
    p_evento: d.evento, p_situacion: d.situacion, p_fecha: d.fecha, p_km: d.km, p_proveedor: d.proveedor, p_taller: d.taller,
    p_costo: d.costo, p_compra_ref: d.compraRef, p_proximo_km: d.proximoKm, p_proximo_fecha: d.proximoFecha,
  }, MIGRACION_EVENTO)
}
