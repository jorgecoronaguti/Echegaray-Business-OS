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

import { MENSAJE_CONFLICTO } from '@/shared/lib/pilaDeDeshacer'
import { actualizarSiSigueIgual } from '@/shared/lib/escrituraCondicional'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion, type PermisoLiquidacion } from './liquidacionPermiso'
import { CAMPOS_EDITABLES, COLUMNA_DE, rechazoDelValorDeCelda, type CampoEditable } from './liquidacionOverrides'
import { siguientesFormulas } from './liquidacionGuardadas'
import { LARGO_MAXIMO_DE_FORMULA, leerCeldaNumerica } from '@/shared/lib/formulaEsAR'
import { validarMotivoDeReapertura } from './liquidacionCierre'
import { leerCuadroDeLaQuincena } from './cuadroDeLaQuincenaService'
import { pendientesPorPersona } from './grillaHorasQuincena'
import { avisoDeAutocierre, decisionDeAutocierre, type LineaCongelada } from './autocierreDeQuincena'
import { hoyEnObra } from '@/features/jefe/services/contexto'
import { escribirRedondeo, verificarGuardadoDelRedondeo } from './efectivoRedondeado'

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
  esperado: z.union([z.literal(''), z.coerce.number().finite()]).optional(),
})

export type ResultadoLiquidacion = { ok: true; mensaje: string } | { ok: false; error: string }

// LA IGUALDAD NO SE DEFINE ACÁ (auditoría, 18/09/2026). `mismoValor` era la TERCERA versión de «¿la celda sigue
// siendo la que vi?» —una en la pila, otra en el filtro del `where`, ésta— y tres definiciones de lo mismo son
// tres oportunidades de que una se corrija y las otras no. La única vive en `pilaDeDeshacer.ts` y la aplica
// `actualizarSiSigueIgual`, dentro de la escritura.

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
  const { persona_id: personaId, importe, esperado, ...v } = parsed.data

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const cab = await cabecera(supabase, v)
  if ('error' in cab) return { ok: false, error: cab.error }
  if (cab.estado === 'cerrada') return { ok: false, error: 'La quincena está cerrada: no se edita.' }

  // CON LA CLAVE DE SERVICIO, COMO LAS `*_manual` (QA 15/09/2026). Con la sesión, el upsert es INSERT … ON
  // CONFLICT DO UPDATE SET liquidacion_id, persona_id, efectivo_redondeado, y `authenticated` sólo tiene UPDATE
  // sobre `efectivo_redondeado`: la base respondía 42501 en TODAS las filas, también las que ya existían. Abrir
  // UPDATE sobre las llaves a `authenticated` no se hace; la puerta es la de arriba —rol y quincena releída—.
  const admin = createAdminClient()
  const valor = importe === '' ? null : importe
  // DESHACER NO PISA LO QUE CAMBIÓ (Cmd+Z, 15/09/2026), Y LA COMPROBACIÓN VA DENTRO DE LA ESCRITURA
  // (auditoría, 18/09/2026): acá se leía, se comparaba y después se hacía el upsert, así que dos personas
  // deshaciendo el mismo redondeo a la vez pasaban las dos. Ésta es además la única celda de la plataforma que
  // puede volver a vacío con Cmd+Z (`vacioRestaurable`), o sea justo donde una ventana cuesta más caro.
  if (esperado !== undefined) {
    const r = await actualizarSiSigueIgual(admin, {
      tabla: 'liquidacion_linea',
      donde: { liquidacion_id: cab.id, persona_id: personaId },
      campo: 'efectivo_redondeado',
      esperado: esperado === '' ? '' : String(esperado),
      tipo: 'numero',
      cambios: { efectivo_redondeado: valor },
      crearSiFalta: { liquidacion_id: cab.id, persona_id: personaId },
      seleccionar: 'persona_id, efectivo_redondeado',
    })
    if (r.estado === 'conflicto') return { ok: false, error: MENSAJE_CONFLICTO }
    if (r.estado === 'no_existe') return { ok: false, error: 'Esa línea de liquidación ya no está.' }
    if (r.estado !== 'escrito') return { ok: false, error: r.error }
    // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO: la misma verificación de siempre, sobre lo que devolvió.
    const verificado = verificarGuardadoDelRedondeo(r.filas as never, valor)
    if (!verificado.ok) return verificado
    revalidatePath(RUTA)
    return { ok: true, mensaje: valor == null ? 'Vuelve el sugerido.' : 'Guardado.' }
  }
  // UN 204 NO PRUEBA UNA ESCRITURA: `escribirRedondeo` relee la fila devuelta, y cero filas es error.
  const escrito = await escribirRedondeo(
    (fila) => admin.from('liquidacion_linea')
      .upsert(fila, { onConflict: 'liquidacion_id,persona_id' })
      .select('persona_id, efectivo_redondeado'),
    { liquidacionId: cab.id, personaId, valor },
  )
  if (!escrito.ok) return escrito

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

  const r = await congelar(supabase, cab.id, lineas)
  if (!r.ok) return r
  revalidatePath(RUTA)
  return {
    ok: true,
    mensaje: `Quincena cerrada: ${lineas.length} línea(s) congeladas. No se marcó ningún pago.`,
  }
}

/**
 * LA FOTO Y EL SELLO, con la sesión de quien cierra (la RLS manda). Lo comparten el botón «Cerrar quincena» y el
 * cierre solo de `marcarLineaPagada` (dueño, 16/09/2026: «cuando se marcan todos pagados que se cierre sola»).
 */
async function congelar(
  supabase: Awaited<ReturnType<typeof createClient>>, liquidacionId: string, lineas: readonly LineaCongelada[],
): Promise<ResultadoLiquidacion> {
  const escritas = await supabase.from('liquidacion_linea')
    .upsert(
      lineas.map((l) => ({ ...l, liquidacion_id: liquidacionId, actualizado_en: new Date().toISOString() })),
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
    .eq('id', liquidacionId).select('id, estado')
  if (cierre.error) return { ok: false, error: cierre.error.message }
  if ((cierre.data ?? []).length === 0) return { ok: false, error: 'La base no marcó el cierre (permiso).' }
  return { ok: true, mensaje: 'cerrada' }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REABRIR — R6: motivo escrito, autor y fecha
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// La diferencia contra la retribución vigente se le muestra a quien reabre ANTES de llamar acá
// (`avisoDeReapertura`, núcleo puro). Acá no se recalcula ni se pisa una sola línea: reabrir
// devuelve la quincena al estado editable y DEJA las cifras selladas como están. Recalcularlas en
// el mismo movimiento borraría la única foto de lo que se pagó, que es lo que el sello existe para
// conservar; el recálculo lo hace el siguiente cierre, con las líneas a la vista.
//
// EL RASTRO SE ESCRIBE ANTES DE ABRIR. Al revés, una falla entre las dos escrituras dejaría la
// quincena abierta y sin registro de por qué — que es exactamente el agujero que R6 cierra.

const reaperturaSchema = ventanaSchema.extend({ motivo: z.string().max(600) })

export async function reabrirQuincena(entrada: unknown): Promise<ResultadoLiquidacion> {
  const parsed = reaperturaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { motivo: crudo, ...v } = parsed.data

  const validado = validarMotivoDeReapertura(crudo)
  if (!validado.ok) return { ok: false, error: validado.error }

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const { data: cab, error: errCab } = await supabase.from('liquidacion_quincena')
    .select('id, estado').eq('desde', v.desde).eq('hasta', v.hasta).eq('grupo', v.grupo).maybeSingle()
  if (errCab) return { ok: false, error: errCab.message }
  if (!cab) return { ok: false, error: 'Esa quincena no está cerrada: no hay nada que reabrir.' }
  if ((cab as { estado: string }).estado !== 'cerrada') {
    return { ok: false, error: 'Esa quincena ya estaba abierta.' }
  }

  const { data: perfil } = await getPerfilActual(supabase)
  const admin = createAdminClient()

  const rastro = await admin.from('liquidacion_reapertura').insert({
    liquidacion_id: (cab as { id: string }).id,
    motivo: validado.motivo,
    autor: perfil?.id ?? null,
  }).select('id').maybeSingle()
  if (rastro.error || !rastro.data) {
    return { ok: false, error: `No pude registrar el motivo${rastro.error ? `: ${rastro.error.message}` : ''}. NO reabrí la quincena.` }
  }

  const abierta = await admin.from('liquidacion_quincena')
    .update({ estado: 'abierta', cerrada_en: null, cerrada_por: null })
    .eq('id', (cab as { id: string }).id).select('id, estado')
  if (abierta.error) return { ok: false, error: abierta.error.message }
  if ((abierta.data ?? []).length === 0) {
    return { ok: false, error: 'Guardé el motivo pero la base no reabrió la quincena. Avisá antes de tocar nada.' }
  }

  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Quincena reabierta. Las cifras selladas quedaron como estaban: el próximo cierre las vuelve a calcular.' }
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
  // LO TECLEADO, TAL CUAL: un número o una CUENTA que empieza con `=` (dueño, 15/09/2026: «tiene que poder
  // calcular dentro de las celdas, como hace sheet»). Lo lee `leerCeldaNumerica`, el MISMO lector que usa la
  // celda en el navegador: dos parsers darían dos resultados para el mismo texto, y el que decide es éste.
  // VACÍO BORRA EL OVERRIDE Y VUELVE EL CÁLCULO. Un 0 NO es vacío: «no le doy nada por banco» es
  // una afirmación del dueño y se guarda como 0.
  valor: z.union([z.number().finite(), z.string().max(LARGO_MAXIMO_DE_FORMULA)]),
  // DESHACER (Cmd+Z): lo que debería haber hoy. Si la celda cambió, no se pisa.
  esperado: z.union([z.literal(''), z.coerce.number().finite()]).optional(),
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
        + (campo === 'pagadoBanco' || campo === 'pagadoEfectivo'
          ? '20260915T2340_liquidacion_pagado_real.sql. No guardé nada.'
          : campo === 'horas' || campo === 'horasNegro'
          ? '20260915T0510_liquidacion_horas_manual.sql. No guardé nada.'
          : campo === 'negro'
          ? '20260915T0300_liquidacion_negro_manual.sql. No guardé nada.'
          : campo === 'horasRecibo' || campo === 'valorHoraRecibo'
          ? '20260915T0100_liquidacion_blanco_manual.sql. No guardé nada.'
          : '20260909T1740_liquidacion_celdas_manuales.sql. No guardé nada.'),
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
  const { persona_id: personaId, campo, valor: tecleado, esperado, ...v } = parsed.data
  // UNA CUENTA QUE NO SE ENTIENDE NO SE GUARDA, Y SE DICE POR QUÉ. Guardar el texto crudo dejaría una celda que
  // no es un número; guardar un 0 liquidaría a alguien en cero por un tipeo.
  const escrito = leerCeldaNumerica(typeof tecleado === 'number' ? String(tecleado) : tecleado)
  if (!escrito.ok) return { ok: false, error: escrito.error }
  const valor = escrito.valor == null ? '' as const : escrito.valor
  const rechazo = rechazoDelValorDeCelda(campo, valor)
  if (rechazo) return { ok: false, error: rechazo }

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

  // LA FILA DE HOY, UNA SOLA LECTURA, Y ES TAMBIÉN LA SONDA DE `formulas`: sirve para el deshacer
  // (`esperado`) y para no pisar las cuentas de las OTRAS celdas al escribir ésta. Si la base todavía no tiene
  // la columna (20260915T2340 sin aplicar) contesta 42703 y se relee sin ella: se le pregunta a la base, no a
  // `migrations/`. Una sonda aparte sería un viaje más por tecla.
  const pedir = (columnas: string) => admin.from('liquidacion_linea').select(columnas)
    .eq('liquidacion_id', cab.id).eq('persona_id', personaId).maybeSingle()
  let conFormulas = await pedir(`${columna}, formulas`)
  const hayFormulas = !conFormulas.error
  if (!hayFormulas) conFormulas = await pedir(columna)
  const hoy = conFormulas.data as Record<string, unknown> | null
  const nuevo = valor === '' ? null : valor
  const cambios: Record<string, unknown> = { [columna]: nuevo }
  // LA CUENTA VIAJA AL LADO DEL NÚMERO, NUNCA EN SU LUGAR: lo que se paga es el número.
  if (hayFormulas) cambios.formulas = siguientesFormulas(hoy?.formulas, campo, escrito.expresion)

  let filas: Record<string, unknown>[]
  if (esperado !== undefined) {
    // DESHACER NO PISA LO QUE CAMBIÓ (Cmd+Z, 15/09/2026), Y LA COMPROBACIÓN VA DENTRO DE LA ESCRITURA
    // (auditoría, 18/09/2026). Antes se comparaba la lectura de arriba y se hacía el upsert después: dos
    // personas deshaciendo la misma celda a la vez pasaban las dos. Ésta es de las pocas celdas que pueden
    // volver a vacío con Cmd+Z (`vacioRestaurable`: vacío = vuelve el cálculo), o sea donde la ventana costaba más.
    //
    // LO QUE QUEDA FUERA DE LA ESCRITURA ATÓMICA, dicho: `formulas` se arma con la lectura de arriba. Si en el
    // medio otra persona cambió la cuenta de OTRA celda de la misma fila, esta escritura puede reponer la vieja.
    // Protege a la celda que se deshace, no a sus vecinas.
    const r = await actualizarSiSigueIgual(admin, {
      tabla: 'liquidacion_linea',
      donde: { liquidacion_id: cab.id, persona_id: personaId },
      campo: columna,
      esperado: esperado === '' ? '' : String(esperado),
      tipo: 'numero',
      cambios,
      crearSiFalta: { liquidacion_id: cab.id, persona_id: personaId },
      seleccionar: '*',
    })
    if (r.estado === 'conflicto') return { ok: false, error: MENSAJE_CONFLICTO }
    if (r.estado === 'no_existe') return { ok: false, error: 'Esa línea de liquidación ya no está.' }
    if (r.estado !== 'escrito') return { ok: false, error: r.error }
    filas = r.filas
  } else {
    const { data, error } = await admin.from('liquidacion_linea')
      .upsert({ liquidacion_id: cab.id, persona_id: personaId, ...cambios }, { onConflict: 'liquidacion_id,persona_id' })
      // LA FILA ENTERA, no sólo la columna escrita: el nombre de la columna es dinámico y un
      // `select` armado con una plantilla deja de estar tipado.
      .select()
    if (error) return { ok: false, error: error.message }
    filas = (data ?? []) as unknown as Record<string, unknown>[]
  }
  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO. Cero filas devueltas es un rechazo en silencio, y
  // un valor distinto del escrito es un CHECK o un trigger que corrigió sin avisar.
  const fila = filas[0]
  if (!fila) return { ok: false, error: 'La base no guardó la fila.' }
  const leido = fila[columna] == null ? null : Number(fila[columna])
  if (leido !== (nuevo == null ? null : Number(nuevo))) {
    return { ok: false, error: `La base guardó ${leido ?? '—'} y yo mandé ${nuevo ?? '—'}.` }
  }

  revalidatePath(RUTA)
  // LA LIMITACIÓN SE DICE EN EL MOMENTO. Sin la columna `formulas` el número se guardó bien y la cuenta se
  // perdió: callarlo haría creer que la celda va a reabrirse con la expresión, y no va a pasar.
  if (escrito.expresion != null && !hayFormulas) {
    return { ok: true, mensaje: `Guardé ${escrito.valor}. La cuenta NO se guardó: falta aplicar la migración 20260915T2340_liquidacion_pagado_real.sql.` }
  }
  return { ok: true, mensaje: nuevo == null ? 'Vuelve el cálculo.' : 'Guardado.' }
}

// EL $/HORA SE MUDÓ A `tarifaDeLaQuincenaActions.ts` (14/09/2026). Acá hacía upsert con `desde` = hoy
// y borraba la fila al vaciar la celda, mientras la celda nueva insertaba con `desde` = inicio de la
// quincena: dos formas de escribir el mismo dato. Ahora hay una sola regla (`planDeTarifa`).

// ═══ LA MARCA «PAGADA» (dueño, 16/09/2026) ═══
//
// Textual: *«necesito marcar como "pagado" ya a la gente y que marque un poco el color distinto en liq hs»*.
//
// Marcar a alguien como pagado hace DOS cosas, y las dos por el mismo camino que un pago tecleado: completa
// `pagado_banco` y `pagado_efectivo` con lo que faltaba de cada lado —los saldos COMPENSADOS que publica
// `pagoDeLaQuincena.ts`, así se le pagó el 100 % por un lado o repartido— y sella la línea con fecha y autor. Lo
// que había antes en esas dos celdas, con sus cuentas, se guarda en `pagada_antes`: deshacer la marca lo devuelve
// tal cual, no a cero.

const pagadaSchema = ventanaSchema.extend({
  persona_id: z.string().uuid(),
  pagada: z.boolean(),
})

const MIGRACION_PAGADA = '20260916T1300_liquidacion_linea_pagada.sql'

const r2 = (n: number): number => Math.round(n * 100) / 100

type AntesDeLaMarca = {
  pagado_banco: number | null
  pagado_efectivo: number | null
  formulas: Partial<Record<'pagadoBanco' | 'pagadoEfectivo', string>>
}

/** Las cuentas de la fila sin las dos de pago. */
function sinCuentasDePago(formulas: unknown): Record<string, string> {
  const base = (formulas && typeof formulas === 'object' && !Array.isArray(formulas) ? formulas : {}) as Record<string, unknown>
  const salida: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) if (k !== 'pagadoBanco' && k !== 'pagadoEfectivo' && typeof v === 'string') salida[k] = v
  return salida
}

export async function marcarLineaPagada(entrada: unknown): Promise<ResultadoLiquidacion> {
  const parsed = pagadaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, pagada, ...v } = parsed.data

  const supabase = await createClient()
  const permiso = await puedeLiquidar(supabase)
  if (!permiso.ok) return { ok: false, error: permiso.error }
  const cab = await cabecera(supabase, v)
  if ('error' in cab) return { ok: false, error: cab.error }
  // LA QUINCENA CERRADA ES UNA FOTO: ni se marca ni se desmarca.
  if (cab.estado === 'cerrada') return { ok: false, error: 'La quincena está cerrada: no se edita.' }

  const admin = createAdminClient()
  const hoy = await admin.from('liquidacion_linea')
    .select('pagado_banco, pagado_efectivo, formulas, pagada_en, pagada_antes')
    .eq('liquidacion_id', cab.id).eq('persona_id', personaId).maybeSingle()
  if (hoy.error) {
    const falta = hoy.error.code === '42703' || /column .* does not exist/i.test(hoy.error.message)
    return { ok: false, error: falta ? `Falta aplicar la migración ${MIGRACION_PAGADA}. No guardé nada.` : hoy.error.message }
  }
  const fila = (hoy.data ?? null) as {
    pagado_banco: number | string | null; pagado_efectivo: number | string | null; formulas: unknown
    pagada_en: string | null; pagada_antes: AntesDeLaMarca | null
  } | null
  const num = (x: number | string | null | undefined): number | null => (x == null ? null : Number(x))

  let aEscribir: Record<string, unknown>
  let cuadro: Awaited<ReturnType<typeof leerCuadroDeLaQuincena>> | null = null
  let lineasDelGrupo: Awaited<ReturnType<typeof leerCuadroDeLaQuincena>>['liquidacion']['cuadros'][number]['lineas'] = []
  let hoyISO = ''
  if (!pagada) {
    if (!fila?.pagada_en) return { ok: true, mensaje: 'No estaba marcada como pagada.' }
    const antes = fila.pagada_antes
    aEscribir = {
      liquidacion_id: cab.id, persona_id: personaId,
      pagado_banco: num(antes?.pagado_banco), pagado_efectivo: num(antes?.pagado_efectivo),
      formulas: { ...sinCuentasDePago(fila.formulas), ...(antes?.formulas ?? {}) },
      pagada_en: null, pagada_por: null, pagada_antes: null,
    }
  } else {
    if (fila?.pagada_en) return { ok: true, mensaje: 'Ya estaba marcada como pagada.' }
    // LA LÍNEA COMO LA VE LA PANTALLA: el mismo cálculo (`aplicarOverrides` + `pagoDeLaLinea`), no una segunda cuenta.
    // Se lee el cuadro ENTERO (líneas y grilla) porque, si con ésta quedan todos pagados, la quincena se cierra sola
    // con la misma traba que el botón «Cerrar quincena» (`decisionDeAutocierre`).
    hoyISO = hoyEnObra()
    cuadro = await leerCuadroDeLaQuincena(supabase, { desde: v.desde, hasta: v.hasta }, hoyISO)
    lineasDelGrupo = cuadro.liquidacion.cuadros.find((c) => c.grupo === v.grupo)?.lineas ?? []
    const linea = lineasDelGrupo.find((l) => l.personaId === personaId)
    if (!linea) return { ok: false, error: 'No encuentro la línea de esta persona en la quincena.' }
    const { data: sesion } = await supabase.auth.getUser()
    if (!sesion.user) return { ok: false, error: 'Sin sesión.' }
    const p = linea.pago
    const antes: AntesDeLaMarca = {
      pagado_banco: num(fila?.pagado_banco), pagado_efectivo: num(fila?.pagado_efectivo),
      formulas: {
        ...(linea.formulas.pagadoBanco ? { pagadoBanco: linea.formulas.pagadoBanco } : {}),
        ...(linea.formulas.pagadoEfectivo ? { pagadoEfectivo: linea.formulas.pagadoEfectivo } : {}),
      },
    }
    aEscribir = {
      liquidacion_id: cab.id, persona_id: personaId,
      // LO QUE FALTABA DE CADA LADO SE DA POR PAGADO. El saldo compensado ya descontó el exceso del otro lado; un
      // saldo negativo (cobró de más) no se «paga»: queda como está y la marca sólo sella.
      pagado_banco: r2(linea.pagadoBanco + Math.max(0, p.saldoBanco ?? 0)),
      pagado_efectivo: r2(linea.pagadoEfectivo + Math.max(0, p.saldoEfectivo ?? 0)),
      formulas: sinCuentasDePago(fila?.formulas),
      pagada_en: new Date().toISOString(), pagada_por: sesion.user.id, pagada_antes: antes,
    }
  }

  const { data, error } = await admin.from('liquidacion_linea')
    .upsert(aEscribir, { onConflict: 'liquidacion_id,persona_id' })
    .select('pagada_en, pagado_banco, pagado_efectivo')
  if (error) return { ok: false, error: error.message }
  const leida = ((data ?? []) as { pagada_en: string | null; pagado_banco: unknown; pagado_efectivo: unknown }[])[0]
  if (!leida) return { ok: false, error: 'La base no guardó la fila.' }
  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO: la marca tiene que haber quedado (o haberse ido).
  if ((leida.pagada_en != null) !== pagada) return { ok: false, error: 'La base no registró la marca.' }
  if (num(leida.pagado_banco as number | string | null) !== aEscribir.pagado_banco
    || num(leida.pagado_efectivo as number | string | null) !== aEscribir.pagado_efectivo) {
    return { ok: false, error: 'La base guardó otro pagado que el que mandé.' }
  }

  if (!pagada || !cuadro) {
    revalidatePath(RUTA)
    return { ok: true, mensaje: pagada ? 'Marcada como pagada.' : 'Marca de pago deshecha.' }
  }

  // ═══ CON EL ÚLTIMO PAGADO, LA QUINCENA SE CIERRA SOLA (dueño, 16/09/2026) ═══
  //
  // Sólo el grupo de esta persona, sólo si nada traba el sello (ausencias sin motivo, sin tarifa, no cierra), y con la
  // misma foto que congela el botón. Si algo traba, la marca queda y el mensaje dice qué falta: cerrar igual
  // congelaría ceros que mañana valen una jornada.
  const decision = decisionDeAutocierre({ lineas: lineasDelGrupo, personaId, porPersona: pendientesPorPersona(cuadro.grilla, hoyISO) })
  let cerrada: { ok: true; lineas: number } | { ok: false; error: string } | null = null
  if (decision.todasPagadas && !decision.pendientes.some((p) => p.traba)) {
    const r = await congelar(supabase, cab.id, decision.foto)
    cerrada = r.ok ? { ok: true, lineas: decision.foto.length } : { ok: false, error: r.error }
  }
  revalidatePath(RUTA)
  return { ok: true, mensaje: avisoDeAutocierre(decision, cerrada) }
}
