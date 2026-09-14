'use server'

// LA ÚNICA ESCRITURA DEL $/H (O DEL NETO MENSUAL) DE UNA QUINCENA.
//
// Había dos: la celda del cuadro nuevo insertaba una fila, y `guardarValorHora` —cuadro clásico y
// cadena de Pagos— hacía upsert con `desde = hoy` y borraba la fila al vaciar la celda. Dos formas
// de escribir el mismo dato son dos historiales, y el que se lee es el de la otra pantalla. Las dos
// acciones de este archivo pasan por `escribirTarifa` y la regla es `planDeTarifa`:
//
//   sin fila en el inicio de la quincena   → INSERTAR (un aumento; lo anterior queda en su fila)
//   con fila y quincena abierta            → CORREGIR esa fila y dejar el rastro
//   quincena cerrada                       → nada (R6)
//   mismo valor                            → nada
//
// Dueño, 14/09/2026: corregir un $/h mal tecleado es «Editar la misma quincena», y tiene que ser
// FÁCIL: clic, escribir, Enter. Sin confirmación.
//
// ═══ CORREGIR SIN RASTRO ES PEOR QUE NO PODER CORREGIR ═══
//
// La corrección escribe `persona_tarifa_correccion` (migración 20260914T2100): quién, cuándo, qué
// había y qué quedó. Si la tabla no existe todavía, la acción NO corrige y lo dice. Si el rastro
// falla después del UPDATE, se devuelve el valor anterior: no queda una corrección sin su historia.
//
// ═══ LAS CERRADURAS, EN ORDEN, ANTES DE TOMAR LA CLAVE DE SERVICIO ═══
//
//   Zod · `permisoDeLiquidacion` · la forma del cuadro · el estado releído de la quincena · el plan.
//
// Se escribe con la clave de servicio porque `authenticated` no tiene INSERT ni UPDATE sobre
// `persona_tarifa` (20260909T1200). La puerta de esa clave son las cerraduras de arriba.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { planDeTarifa, type TarifaExistente } from './liquidacionTarifa'
import { formaEditable, pctDeAumento } from './cuadroDeJornales'

const RUTA = '/administracion/personas'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const GRUPOS = ['obreros', 'oficina', 'final'] as const

const entradaSchema = z.object({
  persona_id: z.string().uuid(),
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
  grupo: z.enum(GRUPOS),
  forma: z.enum(['hora', 'mensual']),
  valor: z.coerce.number().positive('El importe tiene que ser mayor a cero.').finite(),
})

export type ResultadoTarifa = { ok: true; mensaje: string } | { ok: false; error: string }

const corta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
const numeroONulo = (v: unknown): number | null => (v == null ? null : Number(v))
const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist|could not find the table/i.test(e.message)

/** La celda del cuadro de la quincena: $/h de obreros o neto mensual de oficina. */
export async function registrarTarifaDesdeLaQuincena(entrada: unknown): Promise<ResultadoTarifa> {
  const parsed = entradaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  return escribirTarifa(parsed.data)
}

const valorHoraSchema = z.object({
  persona_id: z.string().uuid(),
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
  grupo: z.enum(GRUPOS),
  valor: z.union([z.literal(''), z.coerce.number().positive().finite()]),
})

/**
 * EL $/H DEL CUADRO CLÁSICO Y DE LA CADENA DE PAGOS. Misma regla que la celda nueva.
 *
 * VACIAR LA CELDA YA NO BORRA LA TARIFA. Borrar era la forma vieja de «corregir un tipeo»; ahora se
 * corrige escribiendo el valor bueno, y el valor que había queda en el rastro.
 */
export async function guardarValorHora(entrada: unknown): Promise<ResultadoTarifa> {
  const parsed = valorHoraSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { valor, ...v } = parsed.data
  if (valor === '') return { ok: false, error: 'Escribí el valor correcto: vaciar la celda no borra la tarifa.' }
  if (v.grupo !== 'obreros') return { ok: false, error: 'El $/hora es de los obreros: oficina cobra un neto mensual.' }
  return escribirTarifa({ ...v, forma: 'hora', valor })
}

async function escribirTarifa(e: z.infer<typeof entradaSchema>): Promise<ResultadoTarifa> {
  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  // LA FORMA LA IMPONE EL CUADRO: un $/h sobre Oficina le borraría el neto acordado.
  if (formaEditable(e.grupo) !== e.forma) {
    return { ok: false, error: 'Esa forma de tarifa no corresponde a este cuadro.' }
  }

  const cab = await supabase.from('liquidacion_quincena')
    .select('estado').eq('desde', e.desde).eq('hasta', e.hasta).eq('grupo', e.grupo).maybeSingle()
  // FALLA CERRADO: sin el estado no se sabe si la quincena está sellada.
  if (cab.error) return { ok: false, error: `No pude leer el estado de la quincena: ${cab.error.message}` }
  const estado = (cab.data as { estado: string } | null)?.estado === 'cerrada' ? 'cerrada' : 'abierta'

  const previas = await supabase.from('persona_tarifa')
    .select('desde, valor_hora, neto_mensual').eq('persona_id', e.persona_id)
  if (previas.error) return { ok: false, error: `No pude leer las tarifas: ${previas.error.message}` }
  const existentes: TarifaExistente[] = ((previas.data ?? []) as { desde: string; valor_hora: unknown; neto_mensual: unknown }[])
    .map((t) => ({ desde: t.desde, valorHora: numeroONulo(t.valor_hora), netoMensual: numeroONulo(t.neto_mensual) }))

  const plan = planDeTarifa({ existentes, desde: e.desde, forma: e.forma, valor: e.valor, estado })
  if (plan.accion === 'rechazar') return { ok: false, error: plan.error }
  if (plan.accion === 'nada') return { ok: true, mensaje: plan.porque }

  const nuevo = { valor_hora: e.forma === 'hora' ? e.valor : null, neto_mensual: e.forma === 'mensual' ? e.valor : null }
  const admin = createAdminClient()
  const r = plan.accion === 'insertar'
    ? await insertar(admin, e, nuevo)
    : await corregir(admin, e, nuevo, plan.antes, perfil?.id ?? null)
  if (!r.ok) return r

  revalidatePath(RUTA)
  const anterior = existentes.filter((t) => t.desde < e.desde).sort((a, b) => b.desde.localeCompare(a.desde))[0]
  const pct = pctDeAumento(anterior ? (e.forma === 'hora' ? anterior.valorHora : anterior.netoMensual) : null, e.valor)
  return { ok: true, mensaje: `${r.mensaje} desde el ${corta(e.desde)}${pct == null ? '' : ` · ${pct > 0 ? '+' : ''}${pct}%`}.` }
}

type Admin = ReturnType<typeof createAdminClient>
type Valores = { valor_hora: number | null; neto_mensual: number | null }

/** UN 201 NO PRUEBA LA ESCRITURA: se compara lo que la base devolvió. */
const guardoLoMismo = (fila: unknown, nuevo: Valores): boolean => {
  const f = fila as { valor_hora: unknown; neto_mensual: unknown } | undefined
  return f != null && numeroONulo(f.valor_hora) === nuevo.valor_hora && numeroONulo(f.neto_mensual) === nuevo.neto_mensual
}

async function insertar(admin: Admin, e: z.infer<typeof entradaSchema>, nuevo: Valores): Promise<ResultadoTarifa> {
  const { data, error } = await admin.from('persona_tarifa')
    .insert({ persona_id: e.persona_id, desde: e.desde, ...nuevo, origen: 'web:liquidación de la quincena' })
    .select('valor_hora, neto_mensual')
  if (error) return { ok: false, error: error.message }
  if (!guardoLoMismo((data ?? [])[0], nuevo)) return { ok: false, error: 'La base no guardó la tarifa que mandé.' }
  return { ok: true, mensaje: 'Nuevo valor' }
}

async function corregir(
  admin: Admin, e: z.infer<typeof entradaSchema>, nuevo: Valores,
  antes: { valorHora: number | null; netoMensual: number | null }, autor: string | null,
): Promise<ResultadoTarifa> {
  // SIN TABLA DE RASTRO NO SE CORRIGE. Se pregunta ANTES del UPDATE: después ya habría un valor pisado.
  const hayRastro = await admin.from('persona_tarifa_correccion').select('id').limit(1)
  if (hayRastro.error) {
    return {
      ok: false,
      error: sinTabla(hayRastro.error)
        ? 'Falta aplicar la migración 20260914T2100 (rastro de correcciones): no corrijo sin dejar registro.'
        : `No pude verificar el rastro de correcciones: ${hayRastro.error.message}`,
    }
  }
  const cambio = await admin.from('persona_tarifa')
    .update({ ...nuevo, origen: 'web:corrección de la quincena' })
    .eq('persona_id', e.persona_id).eq('desde', e.desde)
    .select('valor_hora, neto_mensual')
  if (cambio.error) return { ok: false, error: cambio.error.message }
  if (!guardoLoMismo((cambio.data ?? [])[0], nuevo)) return { ok: false, error: 'La base no corrigió la tarifa.' }

  const rastro = await admin.from('persona_tarifa_correccion').insert({
    persona_id: e.persona_id, desde: e.desde, autor,
    valor_hora_antes: antes.valorHora, neto_mensual_antes: antes.netoMensual,
    valor_hora_despues: nuevo.valor_hora, neto_mensual_despues: nuevo.neto_mensual,
  }).select('id')
  if (rastro.error || (rastro.data ?? []).length === 0) {
    // SIN RASTRO SE DESHACE: una corrección que nadie puede explicar después no se deja.
    const vuelta = await admin.from('persona_tarifa')
      .update({ valor_hora: antes.valorHora, neto_mensual: antes.netoMensual })
      .eq('persona_id', e.persona_id).eq('desde', e.desde).select('desde')
    const devuelto = !vuelta.error && (vuelta.data ?? []).length > 0
    return {
      ok: false,
      error: devuelto
        ? `No pude guardar el rastro (${rastro.error?.message ?? 'sin fila'}): devolví el valor anterior.`
        : 'No pude guardar el rastro NI devolver el valor anterior: revisá la tarifa de esta quincena.',
    }
  }
  return { ok: true, mensaje: 'Corregido' }
}
