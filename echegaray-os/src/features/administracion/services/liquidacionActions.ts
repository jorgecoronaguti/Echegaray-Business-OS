'use server'

// LAS DOS ÚNICAS ESCRITURAS DE LA LIQUIDACIÓN.
//
//   guardarEfectivoRedondeado   la columna DEL DUEÑO: los billetes que entrega en mano.
//   cerrarQuincena              congela las cifras calculadas. NADA MÁS.
//
// ═══ CERRAR NO ES PAGAR, Y ESA DISTINCIÓN ES TODA LA SEGURIDAD DE ESTE MÓDULO ═══
//
// Cerrar una quincena escribe una foto de lo calculado en `liquidacion_linea` y marca la cabecera.
// **No escribe en el Sheet, no marca la quincena como pagada, no genera un recibo y no mueve un
// peso.** Marcar el pago sigue siendo la columna «Pagado el» de «Jornales por Quincena», que es del
// dueño; los recibos los hace el contador. Un botón que hiciera las dos cosas convertiría un Nivel D
// en un Nivel E sin que nadie lo autorice.
//
// ═══ LA PANTALLA ES LA PUERTA; LA POLICY ES LA CERRADURA ═══
//
// La solapa sólo se dibuja para quien liquida y la ruta corta con `notFound()`, pero estas acciones
// se invocan desde cualquier lado con el id que viaja en el HTML: por eso las dos vuelven a
// preguntar el rol acá (`puedeLiquidar`). La cerradura final la decide `liquida_sueldos()` en la RLS, y que una quincena CERRADA no se
// pueda editar lo decide la policy `liquidacion_linea_edita_abierta` — no un `if` de acá. Además el
// GRANT de UPDATE de `authenticated` está acotado a `efectivo_redondeado`: aunque alguien llame a
// PostgREST a mano, no puede reescribir `cobra` ni `total`.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion, type PermisoLiquidacion } from './liquidacionPermiso'
import { CAMPOS_EDITABLES, COLUMNA_DE, type CampoEditable } from './liquidacionOverrides'
import { hoyISO } from './diaDeJornada'

const RUTA = '/administracion/personas'

const GRUPOS = ['obreros', 'oficina', 'final'] as const

const ventanaSchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Quincena inválida'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Quincena inválida'),
  grupo: z.enum(GRUPOS),
})

const redondeoSchema = ventanaSchema.extend({
  persona_id: z.string().uuid(),
  // VACÍO ES BORRAR EL REDONDEO, NO ESCRIBIR CERO. Cero significaría «no le doy nada en mano», que
  // es una afirmación distinta de «todavía no lo escribí».
  importe: z.union([z.literal(''), z.coerce.number().nonnegative().finite()]),
})

export type ResultadoLiquidacion = { ok: true; mensaje: string } | { ok: false; error: string }

/**
 * LA PUERTA DEL SERVIDOR. Las dos escrituras la cruzan ANTES de tocar la base: rechazar después de
 * haber abierto la cabecera dejaría una quincena creada por alguien que no puede liquidar.
 *
 * Dueño, 09/09/2026: *«sólo con nivel de usuario administrador»*. El jefe de obra entra a esta
 * misma pantalla a cargar asistencia — `esAdministracion` lo incluye —, y por eso acá se pregunta
 * `liquidaSueldos`, no el área.
 */
async function puedeLiquidar(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<PermisoLiquidacion> {
  const { data: perfil, error } = await getPerfilActual(supabase)
  return permisoDeLiquidacion(perfil?.rol, error)
}

/** La cabecera de esa quincena y ese grupo; se crea si no existe. `null` si la base la rechazó. */
async function cabecera(
  supabase: Awaited<ReturnType<typeof createClient>>,
  v: z.infer<typeof ventanaSchema>,
): Promise<{ id: string; estado: string } | { error: string }> {
  const ya = await supabase.from('liquidacion_quincena')
    .select('id, estado').eq('desde', v.desde).eq('hasta', v.hasta).eq('grupo', v.grupo).maybeSingle()
  if (ya.error) return { error: ya.error.message }
  if (ya.data) return ya.data as { id: string; estado: string }
  // `.select()` ENCADENADO: se acusa lo que la base DEVOLVIÓ. Un insert que la policy rechaza sin
  // error no puede acusar una cabecera que no existe.
  const nueva = await supabase.from('liquidacion_quincena')
    .insert({ desde: v.desde, hasta: v.hasta, grupo: v.grupo })
    .select('id, estado').maybeSingle()
  if (nueva.error) return { error: nueva.error.message }
  if (!nueva.data) return { error: 'No pude abrir la quincena: la base no devolvió la fila.' }
  return nueva.data as { id: string; estado: string }
}

/**
 * EL REDONDEO DEL DUEÑO. Se persiste tal cual lo escribe: no se calcula, no se completa y no se
 * pisa con el efectivo calculado.
 *
 * Se guarda sobre una línea que puede no existir todavía —la quincena abierta se recalcula en cada
 * lectura y no tiene por qué estar materializada—, así que es un upsert por (liquidacion, persona)
 * con las cifras calculadas en cero: lo que vale de esa fila hoy es esta única columna, y el cierre
 * la reescribe entera con la foto.
 */
export async function guardarEfectivoRedondeado(entrada: unknown): Promise<ResultadoLiquidacion> {
  const parsed = redondeoSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, importe, ...v } = parsed.data

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const cab = await cabecera(supabase, v)
  if ('error' in cab) return { ok: false, error: cab.error }
  if (cab.estado === 'cerrada') return { ok: false, error: 'La quincena está cerrada: no se edita.' }

  const valor = importe === '' ? null : importe
  const { data, error } = await supabase.from('liquidacion_linea')
    .upsert(
      { liquidacion_id: cab.id, persona_id: personaId, efectivo_redondeado: valor },
      { onConflict: 'liquidacion_id,persona_id' },
    )
    .select('persona_id, efectivo_redondeado')
  if (error) return { ok: false, error: error.message }
  // UN 204 NO PRUEBA UNA ESCRITURA. Cero filas devueltas significa que la policy rechazó en
  // silencio, y decir «guardado» ahí es exactamente el verde falso que este repo ya pagó.
  if ((data ?? []).length === 0) return { ok: false, error: 'La base no guardó la fila (permiso).' }

  revalidatePath(RUTA)
  return { ok: true, mensaje: valor == null ? 'Redondeo borrado.' : 'Redondeo guardado.' }
}

const cierreSchema = ventanaSchema.extend({
  lineas: z.array(z.object({
    persona_id: z.string().uuid(),
    horas: z.number().finite().nullable(),
    valor_hora: z.number().finite().nullable(),
    cobra: z.number().finite(),
    adelanto: z.number().finite(),
    ya_transferido: z.number().finite(),
    por_banco: z.number().finite(),
    en_efectivo: z.number().finite(),
    total: z.number().finite(),
  })).min(1, 'No hay ninguna línea que congelar.'),
})

/**
 * CERRAR = CONGELAR. Se escribe la foto de lo calculado y la cabecera pasa a `cerrada`.
 *
 * LAS LÍNEAS SIN COBRA NO ENTRAN, y por eso el que llama las filtra: congelar una línea que no se
 * pudo calcular guardaría un cero como si fuera un importe verificado. Quien quedó sin tarifa sigue
 * pendiente después del cierre, que es exactamente lo que tiene que pasar.
 */
export async function cerrarQuincena(entrada: unknown): Promise<ResultadoLiquidacion> {
  const parsed = cierreSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { lineas, ...v } = parsed.data

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const cab = await cabecera(supabase, v)
  if ('error' in cab) return { ok: false, error: cab.error }
  if (cab.estado === 'cerrada') return { ok: false, error: 'Esa quincena ya estaba cerrada.' }

  const escritas = await supabase.from('liquidacion_linea')
    .upsert(
      lineas.map((l) => ({ ...l, liquidacion_id: cab.id, actualizado_en: new Date().toISOString() })),
      { onConflict: 'liquidacion_id,persona_id' },
    )
    .select('persona_id')
  if (escritas.error) return { ok: false, error: escritas.error.message }
  if ((escritas.data ?? []).length !== lineas.length) {
    return { ok: false, error: 'La base no guardó todas las líneas: NO cerré la quincena.' }
  }

  // LA CABECERA SE MARCA AL FINAL. Si se marcara primero, la policy `liquidacion_linea_edita_abierta`
  // rechazaría las propias líneas del cierre y la quincena quedaría cerrada y vacía.
  const cierre = await supabase.from('liquidacion_quincena')
    .update({ estado: 'cerrada', cerrada_en: new Date().toISOString() })
    .eq('id', cab.id).select('id, estado')
  if (cierre.error) return { ok: false, error: cierre.error.message }
  if ((cierre.data ?? []).length === 0) return { ok: false, error: 'La base no marcó el cierre (permiso).' }

  revalidatePath(RUTA)
  return {
    ok: true,
    mensaje: `Quincena cerrada: ${lineas.length} línea(s) congeladas. No se marcó ningún pago.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS CELDAS QUE EL DUEÑO PISA A MANO (09/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// *«quiero más editables todas esas filas y columnas, no los nombres pero lo demás sí»*. Todo lo que
// se escribe acá GANA sobre el cálculo, se marca en la pantalla y se puede vaciar para que la cuenta
// vuelva. Las tres cerraduras siguen siendo las mismas y en el mismo orden: el rol
// (`liquidaSueldos`), la quincena abierta (releída de la base, no confiada al HTML) y la escritura
// que se acusa LEYENDO LO GUARDADO.
//
// ═══ POR QUÉ ESCRIBE CON LA CLAVE DE SERVICIO Y NO CON LA SESIÓN ═══
//
// El GRANT de UPDATE de `authenticated` está acotado a `efectivo_redondeado` a propósito: es lo que
// impide que alguien con una sesión válida reescriba `cobra` y `total` llamando a PostgREST a mano,
// sin pasar por ninguna pantalla. Ampliarlo para que esta acción funcione abriría exactamente ese
// agujero. Así que la puerta se cruza acá —rol + estado releído— y la escritura va por el servidor.

const celdaSchema = ventanaSchema.extend({
  persona_id: z.string().uuid(),
  campo: z.enum(CAMPOS_EDITABLES),
  // VACÍO BORRA EL OVERRIDE Y VUELVE EL CÁLCULO. Un 0 NO es vacío: «no le doy nada por banco» es
  // una afirmación del dueño y se guarda como 0.
  valor: z.union([z.literal(''), z.coerce.number().finite()]),
})

/** Qué celdas puede guardar HOY esta base. Se pregunta a la base, no a `migrations/`. */
async function columnaGuardable(
  supabase: ReturnType<typeof createAdminClient>, campo: CampoEditable,
): Promise<{ columna: string } | { error: string }> {
  const columna = COLUMNA_DE[campo]
  const sonda = await supabase.from('liquidacion_linea').select(columna).limit(1)
  if (sonda.error) {
    return {
      error: `La columna «${columna}» no existe todavía: falta aplicar la migración `
        + '20260909T1740_liquidacion_celdas_manuales.sql. No guardé nada.',
    }
  }
  return { columna }
}

/**
 * UNA CELDA DE LA LÍNEA. Se guarda el número escrito, no el recalculado: la cadena se rehace al
 * leer (`aplicarOverrides`), y guardar los derivados congelaría hoy una cuenta que mañana cambia
 * porque se cargó una hora que faltaba.
 */
export async function guardarCeldaLiquidacion(entrada: unknown): Promise<ResultadoLiquidacion> {
  const parsed = celdaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, campo, valor, ...v } = parsed.data

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const cab = await cabecera(supabase, v)
  if ('error' in cab) return { ok: false, error: cab.error }
  // LA QUINCENA CERRADA NO SE EDITA (R6), Y EL ESTADO SE RELEE. Con la clave de servicio la policy
  // `liquidacion_linea_edita_abierta` ya no protege: si este `if` no estuviera, una celda escrita
  // después del cierre cambiaría el registro de lo que se pagó.
  if (cab.estado === 'cerrada') return { ok: false, error: 'La quincena está cerrada: no se edita.' }

  const admin = createAdminClient()
  const guardable = await columnaGuardable(admin, campo)
  if ('error' in guardable) return { ok: false, error: guardable.error }
  const { columna } = guardable

  const nuevo = valor === '' ? null : valor
  const { data, error } = await admin.from('liquidacion_linea')
    .upsert(
      { liquidacion_id: cab.id, persona_id: personaId, [columna]: nuevo },
      { onConflict: 'liquidacion_id,persona_id' },
    )
    // LA FILA ENTERA, no sólo la columna escrita: el nombre de la columna es dinámico y un
    // `select` armado con una plantilla deja de estar tipado.
    .select()
  if (error) return { ok: false, error: error.message }
  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO. Cero filas devueltas es un rechazo en silencio, y
  // un valor distinto del escrito es un CHECK o un trigger que corrigió sin avisar.
  const fila = ((data ?? []) as unknown as Record<string, unknown>[])[0]
  if (!fila) return { ok: false, error: 'La base no guardó la fila.' }
  const leido = fila[columna] == null ? null : Number(fila[columna])
  if (leido !== (nuevo == null ? null : Number(nuevo))) {
    return { ok: false, error: `La base guardó ${leido ?? '—'} y yo mandé ${nuevo ?? '—'}.` }
  }

  revalidatePath(RUTA)
  return { ok: true, mensaje: nuevo == null ? 'Vuelve el cálculo.' : 'Guardado.' }
}

const tarifaSchema = z.object({
  persona_id: z.string().uuid(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Quincena inválida'),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Quincena inválida'),
  grupo: z.enum(GRUPOS),
  valor: z.union([z.literal(''), z.coerce.number().positive().finite()]),
})

/**
 * EL $/HORA DE UNA PERSONA — vive en `persona_tarifa`, no en la línea.
 *
 * SIN HISTORIAL NUEVO POR CADA CORRECCIÓN: el handoff dice que la retribución no lo tiene, y lo que
 * conserva el pasado es el SELLADO al cerrar la quincena, no una fila por tecleo. Así que se escribe
 * UNA fila con `desde` = hoy y se pisa esa misma si ya existe (la única por día que permite el
 * CHECK). Vaciar la celda borra la fila de hoy y vuelve a mandar la tarifa anterior — que es lo que
 * hace que un error de tipeo no quede como un aumento.
 */
export async function guardarValorHora(entrada: unknown): Promise<ResultadoLiquidacion> {
  const parsed = tarifaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, valor, ...v } = parsed.data

  // SÓLO LOS OBREROS COBRAN POR HORA. `persona_tarifa` acepta `valor_hora` O `neto_mensual`, nunca
  // los dos (CHECK «una sola forma»): escribir un $/h para alguien de Oficina le borraría el neto
  // mensual acordado. La pantalla no dibuja esa celda; esto es la cerradura.
  if (v.grupo !== 'obreros') {
    return { ok: false, error: 'El $/hora es de los obreros: oficina cobra un neto mensual.' }
  }

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const cab = await cabecera(supabase, v)
  if ('error' in cab) return { ok: false, error: cab.error }
  if (cab.estado === 'cerrada') return { ok: false, error: 'La quincena está cerrada: no se edita.' }

  const admin = createAdminClient()
  const desde = hoyISO()

  if (valor === '') {
    const { data, error } = await admin.from('persona_tarifa')
      .delete().eq('persona_id', personaId).eq('desde', desde).select('id')
    if (error) return { ok: false, error: error.message }
    revalidatePath(RUTA)
    return {
      ok: true,
      mensaje: (data ?? []).length === 0
        ? 'No había tarifa cargada hoy: sigue la anterior.'
        : 'Tarifa de hoy borrada: vuelve la anterior.',
    }
  }

  const { data, error } = await admin.from('persona_tarifa')
    .upsert(
      { persona_id: personaId, desde, valor_hora: valor, neto_mensual: null, origen: 'web:liquidación' },
      { onConflict: 'persona_id,desde' },
    )
    .select('persona_id, valor_hora')
  if (error) return { ok: false, error: error.message }
  const fila = (data ?? [])[0] as { valor_hora: number | string | null } | undefined
  if (!fila) return { ok: false, error: 'La base no guardó la tarifa.' }
  if (Number(fila.valor_hora) !== Number(valor)) {
    return { ok: false, error: `La base guardó ${fila.valor_hora} y yo mandé ${valor}.` }
  }

  revalidatePath(RUTA)
  return { ok: true, mensaje: `$/h guardado desde ${desde}.` }
}
