'use server'

// EL CIERRE QUE ESCRIBE — R6, del núcleo probado a la base.
//
//   cerrarQuincenaAction      sella cada línea y recién después marca la cabecera.
//
// `sellarLineas` vive en `liquidacionCierre.ts` y se prueba sin base. Acá no hay una segunda
// definición: esto es el cableado a Supabase y el orden en que la base acepta las escrituras.
//
// REABRIR NO ESTÁ ACÁ. Vive en `reabrirQuincena` (liquidacionActions.ts) con su pantalla
// `ReabrirQuincena.tsx`: muestra la diferencia calculada ANTES de guardar y escribe la firma antes
// de abrir. Dos acciones que devuelven una quincena cerrada al estado editable serían dos verdades
// sobre plata que ya se pagó.
//
// ═══ LA LISTA QUE BLOQUEA ES LA MISMA QUE MUESTRA LA PANTALLA ═══
//
// Los pendientes salen de `estadoDeCierre` sobre las líneas que devuelve
// `getLiquidacionDeLaQuincena` — la misma lectura que dibuja la solapa. Recalcularlos acá con otra
// consulta permitiría que el botón diga «podés cerrar» y el servidor conteste «no»: dos verdades
// sobre la misma quincena.
//
// ═══ EL ORDEN LO IMPONE LA POLICY, NO LA COSTUMBRE ═══
//
// `liquidacion_linea_edita_abierta` exige `estado = 'abierta'`. Marcar la cabecera primero dejaría
// la quincena cerrada Y SIN SELLO: diría que se pagó sin decir con qué valor hora. Por eso se sella
// con la cabecera abierta y la cabecera se marca al final, leyendo el efecto de cada paso.
//
// ═══ POR QUÉ LA FOTO DE PLATA VA CON LA CLAVE DE SERVICIO ═══
//
// El GRANT de UPDATE de `authenticated` está acotado al sello: `cobra` y `total` no son
// actualizables desde una sesión, a propósito (20260909T1710). El sello —lo que R6 congela— sí
// viaja con la sesión del usuario y cruza la RLS: es la parte que tiene que poder ser rechazada
// cuando quien la pide no liquida.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { getLiquidacionDeLaQuincena } from './liquidacionQuincenaService'
import {
  estadoDeCierre, sellarLineas,
  type LegajoAlCerrar, type LineaParaCerrar, type LineaSellada,
} from './liquidacionCierre'
import type { Quincena } from './quincena'

const RUTA = '/administracion/personas'
const ISO = /^\d{4}-\d{2}-\d{2}$/

const quincenaSchema = z.object({
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
})

export type ResultadoCierre =
  | { ok: true; mensaje: string; selladas: number }
  | { ok: false; error: string }

type Cliente = SupabaseClient

/** Rol + identidad del que firma. Las dos preguntas se hacen una sola vez y antes de tocar la base. */
async function puerta(supabase: Cliente): Promise<{ perfilId: string | null } | { error: string }> {
  const { data: perfil, error } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, error)
  if (!permiso.ok) return { error: permiso.error }
  return { perfilId: perfil?.id ?? null }
}

/** La categoría y el convenio que la persona tiene HOY: es lo que la quincena copia al sellar. */
async function legajosAlCerrar(supabase: Cliente): Promise<LegajoAlCerrar[]> {
  const { data } = await supabase.from('persona_legajo').select('id, categoria, convenio_colectivo')
  return ((data ?? []) as { id: string; categoria: string | null; convenio_colectivo: string | null }[])
    .map((r) => ({ personaId: r.id, categoria: r.categoria, convenio: r.convenio_colectivo }))
}

interface CabeceraDeGrupo { id: string; grupo: string; estado: string }

/** La cabecera de esa quincena y ese grupo; se crea abierta si no existe. */
async function cabecera(
  supabase: Cliente, q: Quincena, grupo: string,
): Promise<CabeceraDeGrupo | { error: string }> {
  const ya = await supabase.from('liquidacion_quincena').select('id, grupo, estado')
    .eq('desde', q.desde).eq('hasta', q.hasta).eq('grupo', grupo).maybeSingle()
  if (ya.error) return { error: ya.error.message }
  if (ya.data) return ya.data as CabeceraDeGrupo
  const nueva = await supabase.from('liquidacion_quincena')
    .insert({ desde: q.desde, hasta: q.hasta, grupo })
    .select('id, grupo, estado').maybeSingle()
  if (nueva.error) return { error: nueva.error.message }
  if (!nueva.data) return { error: 'No pude abrir la quincena: la base no devolvió la fila.' }
  return nueva.data as CabeceraDeGrupo
}

/**
 * LA FOTO DE PLATA. Crea la fila si no existía y deja escrito lo que se pagó.
 *
 * Se escribe ANTES del sello y con la cabecera abierta: una fila sellada que no existe no se puede
 * actualizar, y `cobra`/`total` no son columnas que la sesión pueda tocar.
 */
async function escribirFoto(
  liquidacionId: string, lineas: readonly LineaParaCerrar[],
): Promise<{ error: string } | null> {
  const conPlata = lineas.filter((l) => l.cobra != null && l.enEfectivo != null && l.total != null)
  if (conPlata.length !== lineas.length) {
    return { error: 'Hay líneas sin importe calculable: no sello una foto con huecos.' }
  }
  const admin = createAdminClient()
  const { data, error } = await admin.from('liquidacion_linea').upsert(
    conPlata.map((l) => ({
      liquidacion_id: liquidacionId,
      persona_id: l.personaId,
      horas: l.horas,
      cobra: l.cobra,
      por_banco: l.porBanco,
      en_efectivo: l.enEfectivo,
      total: l.total,
      actualizado_en: new Date().toISOString(),
    })),
    { onConflict: 'liquidacion_id,persona_id' },
  ).select('persona_id')
  if (error) return { error: error.message }
  if ((data ?? []).length !== conPlata.length) {
    return { error: 'La base no guardó todas las líneas: NO cerré la quincena.' }
  }
  return null
}

/**
 * EL SELLO, CON LA SESIÓN DEL QUE CIERRA. Una fila por persona porque el valor es distinto en cada
 * una, y con `.select()` en cada una: cero filas devueltas es la policy rechazando en silencio.
 *
 * `valor_hora` viaja NULL en las líneas que no se liquidan por hora (Oficina cobra un neto mensual,
 * la liquidación final sale del recibo). No es un hueco: `liquidacion_linea` no tiene columna de
 * neto mensual y ese importe ya quedó escrito en `cobra` por `escribirFoto`. Lo que se congela de
 * esas líneas es categoría, convenio y `sellado_en`.
 */
async function escribirSello(
  supabase: Cliente, liquidacionId: string, selladas: readonly LineaSellada[],
): Promise<{ error: string } | null> {
  for (const s of selladas) {
    const { data, error } = await supabase.from('liquidacion_linea').update({
      valor_hora: s.valor_hora,
      categoria_sellada: s.categoria_sellada,
      convenio_sellado: s.convenio_sellado,
      sellado_en: s.sellado_en,
      actualizado_en: s.sellado_en,
    }).eq('liquidacion_id', liquidacionId).eq('persona_id', s.persona_id)
      .select('persona_id, valor_hora, sellado_en')
    if (error) return { error: error.message }
    const fila = (data ?? [])[0] as { valor_hora: number | string | null } | undefined
    if (!fila) return { error: `La base no selló la línea de ${s.persona_id} (permiso).` }
    // NULL SE VERIFICA CONTRA NULL, no contra `Number(null)`: `Number(null)` es 0, así que la
    // comparación numérica daría por buena una línea de Oficina que la base hubiera sellado en $ 0.
    const igual = s.valor_hora == null
      ? fila.valor_hora == null
      : Number(fila.valor_hora) === Number(s.valor_hora)
    if (!igual) {
      return { error: `La base selló ${fila.valor_hora} y yo mandé ${s.valor_hora}.` }
    }
  }
  return null
}

/** El pendiente que traba, con su texto: un «no se puede» sin cuál manda a adivinar. */
const porQueNo = (pendientes: readonly { texto: string }[]): string =>
  pendientes.map((p) => p.texto).join(' · ')

/**
 * CERRAR Y SELLAR. Sella cada línea con la cabecera ABIERTA y recién después la marca cerrada.
 *
 * No escribe en el Sheet, no marca ningún pago y no genera recibos: cerrar es congelar (Nivel D).
 */
export async function cerrarQuincenaAction(entrada: unknown): Promise<ResultadoCierre> {
  const parsed = quincenaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const q: Quincena = parsed.data

  const supabase = await createClient()
  const paso = await puerta(supabase)
  if ('error' in paso) return { ok: false, error: paso.error }

  const lectura = await getLiquidacionDeLaQuincena(supabase, q)
  // UNA FUENTE QUE NO SE PUDO LEER NO ES UNA FUENTE VACÍA. Sellar sobre una lectura incompleta
  // congela un importe corto con la misma cara con la que congela uno correcto.
  if (lectura.errores.length > 0) {
    return { ok: false, error: `No pude leer ${lectura.errores.map((e) => e.que).join(', ')}: no cerré nada.` }
  }
  const estado = estadoDeCierre(lectura.cuadros.flatMap((c) => c.lineas))
  if (!estado.puedeCerrar) {
    return {
      ok: false,
      error: estado.pendientes.length
        ? `No cerré: ${porQueNo(estado.pendientes)}`
        : 'No hay ninguna línea que cerrar.',
    }
  }
  if (Object.values(lectura.estados).some((e) => e.estado === 'cerrada')) {
    return { ok: false, error: 'Esa quincena ya estaba cerrada.' }
  }

  const legajos = await legajosAlCerrar(supabase)
  const selladoEn = new Date().toISOString()
  let selladas = 0
  for (const cuadro of lectura.cuadros) {
    if (cuadro.lineas.length === 0) continue
    const cab = await cabecera(supabase, q, cuadro.grupo)
    if ('error' in cab) return { ok: false, error: cab.error }
    const foto = await escribirFoto(cab.id, cuadro.lineas)
    if (foto) return { ok: false, error: foto.error }
    const sello = sellarLineas(cuadro.lineas, legajos, selladoEn)
    const escrito = await escribirSello(supabase, cab.id, sello.selladas)
    if (escrito) return { ok: false, error: escrito.error }
    selladas += sello.selladas.length
    const marca = await marcarCerrada(supabase, cab.id, paso.perfilId, selladoEn)
    if (marca) return { ok: false, error: marca.error }
  }

  revalidatePath(RUTA)
  return {
    ok: true,
    selladas,
    mensaje: `Quincena cerrada: ${selladas} línea(s) selladas. No se marcó ningún pago.`,
  }
}

/** La cabecera, al final y con firma. `cerrada_por` es a quién preguntarle cuando se discuta. */
async function marcarCerrada(
  supabase: Cliente, id: string, perfilId: string | null, cuando: string,
): Promise<{ error: string } | null> {
  const { data, error } = await supabase.from('liquidacion_quincena')
    .update({ estado: 'cerrada', cerrada_en: cuando, cerrada_por: perfilId })
    .eq('id', id).select('id, estado, cerrada_en, cerrada_por')
  if (error) return { error: error.message }
  const fila = (data ?? [])[0] as { estado: string } | undefined
  if (!fila) return { error: 'La base no marcó el cierre (permiso). Las líneas quedaron selladas.' }
  if (fila.estado !== 'cerrada') return { error: `La base dejó la quincena en «${fila.estado}».` }
  return null
}
