'use server'

// GUARDAR LA PRESENCIA DEL DÍA — la única escritura de `asistencia_dia`.
//
// ═══ ESTA ACCIÓN ESCRIBE TAMBIÉN LA JORNADA POR DEFECTO ═══
//
// A la mañana del 08/09/2026 la regla era la contraria y estaba escrita acá: «no toca
// `registros_hh`, nunca». A la tarde el dueño pidió lo otro, textual: *«que por defecto cuando se
// ponga la asistencia se le cargue 9 hs los L, M, M, J y 8 hs los V, permitiendo luego edición de
// esto mismo en la planilla de asistencia»*. Se registra el cambio en vez de borrar la regla vieja
// porque la consecuencia que aquella advertía es real y ahora está aceptada a propósito: **declarar
// que Juan está le imputa costo de mano de obra a la obra donde se lo marcó**.
//
// Lo que la protege es la forma de la escritura, no un comentario: `planDeHorasPorDefecto` sólo
// llena el vacío (cualquier fila de horas de esa persona ese día, de cualquier obra, la frena) y
// sólo borra filas con su propia marca de origen. La regla y su porqué viven en `presenciaDelDia.ts`;
// acá se aplica y se acusa lo que la base devolvió.
//
// ═══ SI LAS HORAS FALLAN, LA PRESENCIA IGUAL QUEDÓ ═══
//
// Son dos escrituras y no hay transacción. La presencia va primero porque es el hecho que el jefe
// fue a declarar; si el paso de horas falla, la acción responde OK —porque la presencia SE GUARDÓ—
// y el mensaje dice, con todas las letras, que las horas hay que cargarlas en Asistencia. Devolver
// error haría que el jefe vuelva a tocar Guardar sobre algo que ya estaba bien.
//
// ═══ UN UPSERT, NO TRES VIAJES ═══
//
// La tabla tiene `unique (persona_id, fecha)`, así que insertar y corregir son la misma operación.
// A diferencia de la carga de horas —que necesita insertar, corregir y borrar por separado y sin
// transacción—, acá no hay ventana en la que el día no esté en ningún lado.
//
// ═══ LO QUE NO CAMBIÓ NO SE ESCRIBE ═══
//
// `planDePresencia` compara contra lo guardado. Sin eso, reabrir el día y tocar Guardar reescribía
// la presencia de toda la cuadrilla y `marcado_por` terminaba diciendo el nombre de quien sólo pasó
// a mirar — y esa firma es justamente lo que hace que la declaración valga.
//
// ═══ LA ACCIÓN ES LA PUERTA, NO LA PANTALLA ═══
//
// La pantalla ofrece obras activas y personas de la cuadrilla; esta llamada puede venir de
// cualquier lado. La obra se verifica acá, y quién puede escribir lo decide la RLS de
// `asistencia_dia`, que rechaza aunque alguien llame a PostgREST a mano.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { esMotivo } from './motivoDeAusencia'
import {
  acuseDeHorasPorDefecto, acusePresencia, FUENTE_HORAS_POR_DEFECTO, marcasSinObraDeLaPresencia,
  planDeHorasPorDefecto, planDePresencia, resumenPresencia,
  type HoraDelDia, type MarcaPresencia, type PresenciaGuardada,
} from './presenciaDelDia'
import { getPresenciaDelDia, quitarPresenciaDelDia } from './presenciaDelDiaService'
import { hayTardanza, rotuloTardanza, sinTardanzasNuevas } from './tardanza'
import { getPerfilActual } from '@/features/auth/services/authService'
import { puedeCambiarObraActual } from './planDeObraActual'
import { quincenaCerrada } from './quincenaCerradaService'
import { acuseDeQuita, jornadaAQuitarConElPresente, QUITAR_JORNADA_POR_DEFECTO_AL_QUITAR } from './quitaDePresente'
import { acuseDeAusenciasDelDia, planDeAusenciasSinObra } from './ausenciaDeLaPersona'
import { escribirAusenciasSinObra, filasSinObraDelDia, sacarAusenciasSinObra } from './ausenciaDeLaPersonaService'

// EL MOTIVO SE VALIDA CONTRA EL CATÁLOGO, NO CONTRA UNA LISTA DE ESTA PANTALLA. `esMotivo` mira
// `orquestador/lib/asistencia-motivos.mjs`, que es lo que usa el bot desde julio. Y una presencia
// con motivo se rechaza acá igual que en el CHECK de la tabla: dos cerraduras, una definición.
// LA TARDANZA SÓLO SOBRE UNA PRESENCIA (dueño, 15/09/2026): quien no vino no llegó tarde. Es la misma
// afirmación que el CHECK `asistencia_dia_tardanza_solo_presente`; acá la rama ausente/licencia no la
// admite y la presente la acepta con `false` por defecto, para que los llamadores viejos sigan andando.
const marcaSchema = z.discriminatedUnion('estado', [
  z.object({
    persona_id: z.string().uuid(),
    estado: z.literal('presente'),
    motivo: z.null().default(null),
    llego_tarde: z.boolean().default(false),
    salio_antes: z.boolean().default(false),
  }),
  z.object({
    persona_id: z.string().uuid(),
    estado: z.enum(['ausente', 'licencia']),
    motivo: z.string().trim().refine(esMotivo, 'Ese motivo no está en el catálogo').nullable().default(null),
    llego_tarde: z.literal(false).default(false),
    salio_antes: z.literal(false).default(false),
  }),
])

const envioSchema = z.object({
  obra_id: z.string().trim().min(1, 'Elegí la obra'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  marcas: z.array(marcaSchema).min(1, 'No marcaste a nadie todavía.'),
})

export type ResultadoPresencia =
  | { ok: true; mensaje: string; guardadas: PresenciaGuardada[] }
  | { ok: false; error: string }

export async function guardarPresencia(entrada: unknown): Promise<ResultadoPresencia> {
  const parsed = envioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { obra_id: obraId, fecha, marcas } = parsed.data

  const supabase = await createClient()

  const obra = await supabase.from('obra_canonica').select('id').eq('id', obraId).maybeSingle()
  if (obra.error) return { ok: false, error: obra.error.message }
  if (!obra.data) return { ok: false, error: 'Esa obra no existe o no la ves.' }

  // LO GUARDADO SE LEE ANTES DE DECIDIR QUÉ ESCRIBIR. Sin obra: la presencia de una persona es de
  // ese DÍA, y el único de la tabla es (persona, fecha) — si alguien la declaró en otra obra a la
  // mañana, corregirla acá es corregir la misma fila, no crear una segunda.
  const previo = await getPresenciaDelDia(supabase, fecha, null)
  if (previo.error) return { ok: false, error: previo.error }
  const guardadas = previo.data ?? []

  // EN UNA QUINCENA CERRADA LA PRESENCIA SE GUARDA Y LA TARDANZA NO: lo sellado no se toca (15/09/2026).
  // La guarda se pregunta ANTES de decidir qué escribir, porque decide qué se escribe. Las horas la
  // reusan más abajo.
  const cierre = await quincenaCerrada(supabase, fecha)
  const tardanzas = cierre === null
    ? { marcas: marcas as MarcaPresencia[], descartadas: 0 }
    : sinTardanzasNuevas(marcas as MarcaPresencia[], guardadas)
  const avisoTardanza = tardanzas.descartadas > 0
    ? `${tardanzas.descartadas} marca(s) de tardanza no se guardaron: ${cierre}`
    : null

  const plan = planDePresencia(tardanzas.marcas, guardadas)
  if (plan.cambios.length === 0) {
    // NADA QUE ESCRIBIR EN LA PRESENCIA ES NADA QUE ESCRIBIR EN LAS HORAS (dueño, 15/09/2026). Hasta
    // hoy este camino volvía a pasar las horas por defecto «por si alguien quedó presente sin horas»,
    // y así le devolvía 9 h a la celda que Administración había dejado vacía para completar después.
    // La jornada por defecto es consecuencia de DECLARAR, no de volver a guardar lo mismo.
    return {
      ok: true,
      mensaje: [`Ya estaba guardado: ${acusePresencia(resumenPresencia(tardanzas.marcas, marcas.length))}.`, avisoTardanza]
        .filter(Boolean).join(' · '),
      guardadas: mezclar(guardadas, tardanzas.marcas),
    }
  }

  // `.select()` ENCADENADO: se acusa lo que la base DEVOLVIÓ, no lo que se le pidió. Un upsert que
  // afecta cero filas —porque la policy lo rechazó sin error— no puede acusar «12 presentes».
  const { data, error } = await escribirMarcas(supabase, obraId, fecha, plan.cambios)

  if (error) {
    return {
      ok: false,
      error: /asistencia_dia.*does not exist/i.test(error.message)
        // NO SE INVENTA UN VERDE. Sin la tabla no hay dónde guardar, y decirlo con el nombre de la
        // migración es lo que hace que el mensaje sirva para algo.
        ? 'Todavía no está aplicada la migración 20260908T1900_asistencia_dia.sql: la presencia no se puede guardar.'
        : error.message,
    }
  }
  const escritas = (data ?? []) as PresenciaGuardada[]
  if (escritas.length === 0) {
    return { ok: false, error: 'La base no guardó ninguna marca. Puede ser un permiso: probá recargar.' }
  }

  // LAS HORAS DESPUÉS DE LA PRESENCIA, Y SÓLO SI ALGUNA PRESENCIA CAMBIÓ: con nada que escribir la
  // acción ya volvió arriba sin tocar horas (15/09/2026). Cuando sí corren, van sobre todas las marcas
  // del envío —no sólo sobre las que cambiaron—, así que quien ya estaba presente sin horas recibe la
  // jornada en ESE guardado; en uno que no cambia ninguna presencia, no.
  //
  // EN UNA QUINCENA CERRADA LA MARCA SE GUARDA Y LAS HORAS NO. La guarda es de `registros_hh`
  // (`quincenaCerrada.ts`); la marca ya quedó escrita, así que se dice en el acuse en vez de fallar.
  const horas = cierre === null
    ? await aplicarHorasPorDefecto(supabase, obraId, fecha, tardanzas.marcas, guardadas)
    : { mensaje: `Las horas por defecto no se cargaron. ${cierre}`, escribio: false }

  revalidatePath('/campo/asistencia')
  revalidatePath('/administracion/personas')
  revalidatePath('/administracion/personas/en-obra')
  if (horas.escribio) revalidatePath('/administracion/asistencia')

  const resumen = resumenPresencia(tardanzas.marcas, marcas.length)
  const mensaje = [acusePresencia(resumen), acuseTardanzas(tardanzas.marcas), avisoTardanza, horas.mensaje]
    .filter(Boolean).join(' · ')
  return { ok: true, mensaje, guardadas: mezclar(guardadas, tardanzas.marcas) }
}

/** «2 con tardanza». Se dice porque es plata: una marca pierde el presentismo de la quincena. */
function acuseTardanzas(marcas: readonly MarcaPresencia[]): string | null {
  const n = marcas.filter(hayTardanza).length
  return n === 0 ? null : `${n} con tardanza (pierde el presentismo de la quincena)`
}

/**
 * EL UPSERT, CON LA TARDANZA SI LA BASE LA TIENE. Mientras `20260915T2220` no esté aplicada las dos
 * columnas no existen: PostgREST contesta PGRST204 / 42703 y se reintenta sin ellas, para que la
 * presencia se siga guardando. Si alguna marca traía tardanza y no se pudo escribir, se dice con el
 * nombre de la migración: la marca NO quedó, y fingir que sí sería pagar un presentismo que se perdió.
 */
async function escribirMarcas(
  supabase: Awaited<ReturnType<typeof createClient>>, obraId: string, fecha: string, cambios: readonly MarcaPresencia[],
): Promise<{ data: PresenciaGuardada[] | null; error: { message: string } | null }> {
  const fila = (m: MarcaPresencia) => ({ persona_id: m.persona_id, fecha, obra_canonica_id: obraId, estado: m.estado, motivo: m.motivo })
  const upsert = (filas: Record<string, unknown>[], campos: string) => supabase.from('asistencia_dia')
    .upsert(filas, { onConflict: 'persona_id,fecha' }).select(campos)
  const con = await upsert(
    cambios.map((m) => ({ ...fila(m), llego_tarde: m.llego_tarde, salio_antes: m.salio_antes })),
    'persona_id, estado, motivo, llego_tarde, salio_antes',
  )
  if (!con.error) return { data: (con.data ?? []) as unknown as PresenciaGuardada[], error: null }
  if (!sinColumnaTardanza(con.error)) return { data: null, error: con.error }
  if (cambios.some(hayTardanza)) {
    return { data: null, error: { message: 'Todavía no está aplicada la migración 20260915T2220_presentismo_por_tardanzas.sql: la tardanza no se puede guardar. Guardá sin la marca o aplicala primero.' } }
  }
  const sin = await upsert(cambios.map(fila), 'persona_id, estado, motivo')
  return { data: (sin.data ?? []) as unknown as PresenciaGuardada[], error: sin.error }
}

const sinColumnaTardanza = (error: { code?: string; message: string }): boolean =>
  error.code === '42703' || error.code === 'PGRST204' || /llego_tarde|salio_antes/i.test(error.message)

/**
 * LA JORNADA POR DEFECTO CONTRA LA BASE. Devuelve qué decir, nunca un throw: la presencia ya está
 * guardada cuando esto corre.
 *
 * ═══ LA LECTURA ES POR PERSONA Y DÍA, SIN OBRA ═══
 *
 * `hh_select_por_obra` deja ver a Administración —y el jefe de obra lo es desde el 19/08— todas las
 * filas, así que la consulta ve de verdad las horas cargadas en OTRA obra. Si algún día esa policy
 * se acota por obra, este guardián se vuelve ciego y el mismo día se cargaría dos veces: el día que
 * se toque `hh_select_por_obra`, hay que volver acá.
 */
async function aplicarHorasPorDefecto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string, fecha: string, marcas: readonly MarcaPresencia[], guardadas: readonly PresenciaGuardada[],
): Promise<{ mensaje: string | null; escribio: boolean }> {
  const personaIds = marcas.map((m) => m.persona_id)
  const existentes = await supabase
    // `actualizado_por` VIAJA PORQUE DECIDE EL BORRADO: una fila por defecto que una persona
    // corrigió no es una sugerencia automática, y `esDefectoQueNadieMiro` la necesita para decir no.
    .from('registros_hh').select('id, persona_id, tipo_hora, fuente_legacy, actualizado_por')
    .eq('fecha', fecha).in('persona_id', personaIds)
  if (existentes.error) return { mensaje: noSePudo(existentes.error.message), escribio: false }

  // LA AUSENCIA DECLARADA LLEGA A LAS HORAS (19/09/2026, ver `marcasSinObraDeLaPresencia`). Primero se
  // decide sin los conflictos —dependen sólo del trabajo cargado a mano, que esto no toca— para saber
  // qué ausencia sin obra se retira: esa fila no puede frenar la jornada de quien vuelve a estar.
  const sinObra = await filasSinObraDelDia(supabase, personaIds, fecha)
  if (sinObra.error) return { mensaje: noSePudo(sinObra.error), escribio: false }
  const previo = planDeAusenciasSinObra(
    marcasSinObraDeLaPresencia({ presencias: marcas, guardadas, fecha, conflictos: [] }), sinObra.data)
  const seVan = new Set(previo.borrar)

  const plan = planDeHorasPorDefecto({
    presencias: marcas,
    guardadas,
    horasExistentes: ((existentes.data ?? []) as HoraDelDia[]).filter((h) => !seVan.has(h.id)),
    fecha,
    obra: obraId,
  })
  const fuera = planDeAusenciasSinObra(
    marcasSinObraDeLaPresencia({ presencias: marcas, guardadas, fecha, conflictos: plan.conflictos }), sinObra.data)

  // LO DE AFUERA SE ESCRIBE ANTES DE CUALQUIER BORRADO, y se saca al final: sin transacción, un
  // duplicado visible le gana a una pérdida silenciosa (misma regla que `guardarJornada`).
  const escritas = await escribirAusenciasSinObra(supabase, fecha, fuera.escribir)
  if (escritas.error) return { mensaje: noSePudo(escritas.error), escribio: false }
  const tocoAfuera = escritas.insertadas + escritas.actualizadas > 0

  let insertadas = 0
  if (plan.insertar.length > 0) {
    const { data, error } = await supabase.from('registros_hh').insert(plan.insertar.map((h) => ({
      ...h,
      // La semana la deriva el trigger `registros_hh_normalizar`; se manda igual porque la columna
      // es `not null`. Mismo motivo y misma forma que en `jornadaPorObraActions`.
      fecha_inicio_semana: fecha,
      // SIN ACTIVIDAD: esta fila no imputa al plan de obra. Es lo que deja que `esDeLaJornada` la
      // distinga de una hora cargada contra una tarea.
      actividad_id: null,
    }))).select('id')
    if (error) return { mensaje: noSePudo(error.message), escribio: tocoAfuera }
    insertadas = (data ?? []).length
  }

  let borradas = 0
  if (plan.borrar.length > 0) {
    // EL `eq('fuente_legacy', …)` ES LA SEGUNDA CERRADURA. Entre la lectura y este borrado alguien
    // pudo editar esa fila en la planilla —y editarla le cambia el origen—: sin este filtro, este
    // camino borraría una corrección hecha por una persona diez segundos antes.
    const { data, error } = await supabase.from('registros_hh').delete()
      .in('id', plan.borrar).eq('fuente_legacy', FUENTE_HORAS_POR_DEFECTO).select('id')
    if (error) return { mensaje: noSePudo(error.message), escribio: tocoAfuera || insertadas > 0 }
    borradas = (data ?? []).length
  }

  const sacadas = await sacarAusenciasSinObra(supabase, fuera.borrar)
  const afuera = acuseDeAusenciasDelDia({
    ...escritas, ...sacadas, sinCambio: fuera.sinCambio, intactas: fuera.intactas,
  })
  return {
    mensaje: [
      acuseDeHorasPorDefecto({ insertadas, borradas, conflictos: plan.conflictos.length }),
      afuera,
      sacadas.error ? noSePudo(sacadas.error) : null,
    ].filter(Boolean).join(' · ') || null,
    escribio: tocoAfuera || insertadas > 0 || borradas > 0 || sacadas.sacadas > 0,
  }
}

/** El fallo de las horas se dice entero y sin disfrazar de éxito: la presencia quedó, las horas no. */
const noSePudo = (error: string): string =>
  `La presencia quedó guardada, pero las horas por defecto no se pudieron cargar (${error}). Cargalas en Asistencia.`

/** Lo guardado después de este toque: lo que había, con lo recién escrito encima. Vuelve a la
 *  pantalla para que la carga de horas sepa a quién ofrecerle la jornada SIN otra consulta. */
function mezclar(
  antes: readonly PresenciaGuardada[], ahora: readonly MarcaPresencia[],
): PresenciaGuardada[] {
  const porPersona = new Map(antes.map((g) => [g.persona_id, g]))
  for (const m of ahora) porPersona.set(m.persona_id, { ...m })
  return [...porPersona.values()]
}

// ═══ QUITAR EL PRESENTE — 10/09/2026 ═══
//
// El dueño: *«si quiero sacarle el presente a alguien que lo tiene, no puedo actualmente; está mal,
// y así se ve en la imagen. Te dije que asistencia es distinto a horas trabajadas»*.
//
// LO QUE ESTA ACCIÓN NO HACE ES LA MITAD DE SU DEFINICIÓN: no escribe «ausente» —sin registrar no
// es ausente— y no borra horas que alguien cargó. Las horas que una persona imputó a una obra son un
// hecho aparte, y borrarlas por haber sacado una marca sería la deducción que la regla E del 08/09
// prohíbe, sólo que al revés.
//
// LA EXCEPCIÓN (17/09/2026, decisión 3 del dueño): con `quitar_jornada_por_defecto`, la jornada POR
// DEFECTO que el propio presente escribió y nadie tocó se retira con él. Ver `quitaDePresente.ts`.

const quitaSchema = z.object({
  persona_id: z.string().uuid('No sé a quién le quitás la marca'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  /** Decisión 3 (17/09/2026). `false` por defecto: Plantel y la carga vieja siguen igual en este hito. */
  quitar_jornada_por_defecto: z.boolean().default(false),
})

export type ResultadoQuita = { ok: true; mensaje: string } | { ok: false; error: string }

export async function quitarPresencia(entrada: unknown): Promise<ResultadoQuita> {
  const parsed = quitaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // LA MISMA LISTA QUE PARA MARCAR (`ROLES_QUE_MUEVEN_DE_OBRA`): quien puede afirmar que alguien
  // estuvo puede revocarlo. Esto es la puerta; la cerradura es la RLS de `asistencia_dia`, que al
  // jefe de obra lo acota como siempre.
  const { data: perfil, error: errorPerfil } = await getPerfilActual(supabase)
  if (errorPerfil) return { ok: false, error: `No pude verificar tu rol: ${errorPerfil}` }
  if (!puedeCambiarObraActual(perfil?.rol)) {
    return { ok: false, error: 'Tu usuario no puede quitar marcas de asistencia.' }
  }

  const r = await quitarPresenciaDelDia(supabase, parsed.data.persona_id, parsed.data.fecha)
  if (r.error !== null) return { ok: false, error: r.error }

  // DECISIÓN 3 (17/09/2026): la jornada que el presente escribió se va con él, si quien llama lo pide.
  // La regla, el flag para apagarla y lo que nunca se borra, en `quitaDePresente.ts`.
  const jornada = parsed.data.quitar_jornada_por_defecto
    ? await quitarJornadaPorDefecto(supabase, parsed.data.persona_id, parsed.data.fecha)
    : null

  revalidatePath('/administracion/personas')
  revalidatePath('/administracion/personas/en-obra')
  revalidatePath('/campo/asistencia')
  return {
    ok: true,
    mensaje: jornada ? acuseDeQuita(jornada) : 'Marca quitada: el día quedó sin marcar. Las horas cargadas no se tocaron.',
  }
}

/** La marca ya se quitó cuando esto corre: cualquier fallo se dice en el acuse, nunca como error. */
async function quitarJornadaPorDefecto(
  supabase: Awaited<ReturnType<typeof createClient>>, personaId: string, fecha: string,
): Promise<{ retiradas: number; noSePudo: string | null }> {
  if (!QUITAR_JORNADA_POR_DEFECTO_AL_QUITAR) return { retiradas: 0, noSePudo: null }
  const leidas = await supabase.from('registros_hh')
    .select('id, persona_id, tipo_hora, fuente_legacy, actualizado_por')
    .eq('persona_id', personaId).eq('fecha', fecha)
  if (leidas.error) return { retiradas: 0, noSePudo: leidas.error.message }
  const ids = jornadaAQuitarConElPresente((leidas.data ?? []) as HoraDelDia[], personaId)
  if (ids.length === 0) return { retiradas: 0, noSePudo: null }
  // LO SELLADO NO SE TOCA: en una quincena cerrada la marca se quita y la hora liquidada queda.
  const cierre = await quincenaCerrada(supabase, fecha)
  if (cierre !== null) return { retiradas: 0, noSePudo: cierre }
  // LAS DOS CERRADURAS DEL BORRADO VAN TAMBIÉN EN EL WHERE: si entre la lectura y este `delete` alguien
  // editó la fila, deja de ser «por defecto que nadie miró» y la base no la borra.
  const { data, error } = await supabase.from('registros_hh').delete()
    .in('id', ids).eq('fuente_legacy', FUENTE_HORAS_POR_DEFECTO).is('actualizado_por', null).select('id')
  if (error) return { retiradas: 0, noSePudo: error.message }
  return { retiradas: (data ?? []).length, noSePudo: null }
}

// ═══ MARCAR LA TARDANZA DESDE LA GRILLA (Personal → Horas) — 15/09/2026 ═══
//
// El jefe la marca el día que pasa, desde la presencia (`guardarPresencia`). Administración puede
// corregirla después desde la celda del día. Es la MISMA fila de `asistencia_dia`: se escribe sobre la
// presencia declarada, y si nadie la declaró se declara «presente» con la marca —llegar tarde es haber
// venido—. Sobre un ausente o una licencia no se marca: las dos afirmaciones no pueden ser ciertas a la
// vez (CHECK `asistencia_dia_tardanza_solo_presente`). No toca `registros_hh`.

const tardanzaSchema = z.object({
  persona_id: z.string().uuid('No sé a quién le marcás la tardanza'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  llego_tarde: z.boolean(),
  salio_antes: z.boolean(),
})

export type ResultadoTardanza = { ok: true; mensaje: string } | { ok: false; error: string }

export async function marcarTardanza(entrada: unknown): Promise<ResultadoTardanza> {
  const parsed = tardanzaSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { persona_id: personaId, fecha, llego_tarde, salio_antes } = parsed.data

  const supabase = await createClient()
  const { data: perfil, error: errorPerfil } = await getPerfilActual(supabase)
  if (errorPerfil) return { ok: false, error: `No pude verificar tu rol: ${errorPerfil}` }
  if (!puedeCambiarObraActual(perfil?.rol)) return { ok: false, error: 'Tu usuario no puede marcar tardanzas.' }

  // LO SELLADO NO SE TOCA: una marca en una quincena cerrada cambiaría el presentismo de una liquidación
  // ya pagada. Acá se rechaza entera; en `guardarPresencia` se guarda la presencia y se descarta la marca.
  const cierre = await quincenaCerrada(supabase, fecha)
  if (cierre !== null) return { ok: false, error: `La tardanza no se guardó. ${cierre}` }

  const previo = await getPresenciaDelDia(supabase, fecha, null)
  if (previo.error) return { ok: false, error: previo.error }
  const antes = (previo.data ?? []).find((g) => g.persona_id === personaId)
  if (antes && antes.estado !== 'presente') {
    return { ok: false, error: `Está declarado ${antes.estado === 'licencia' ? 'de licencia' : 'ausente'} ese día: no se le marca tardanza.` }
  }
  const { data, error } = await supabase.from('asistencia_dia')
    .upsert({ persona_id: personaId, fecha, estado: 'presente', motivo: null, llego_tarde, salio_antes }, { onConflict: 'persona_id,fecha' })
    .select('persona_id, llego_tarde, salio_antes')
  if (error) {
    return {
      ok: false,
      error: sinColumnaTardanza(error)
        ? 'Todavía no está aplicada la migración 20260915T2220_presentismo_por_tardanzas.sql: la tardanza no se puede guardar.'
        : error.message,
    }
  }
  const fila = (data ?? [])[0] as { llego_tarde: boolean; salio_antes: boolean } | undefined
  if (!fila) return { ok: false, error: 'La base no guardó la marca. Puede ser un permiso: probá recargar.' }
  if (fila.llego_tarde !== llego_tarde || fila.salio_antes !== salio_antes) {
    return { ok: false, error: 'La base guardó otra cosa que lo que mandé: revisá la celda.' }
  }

  revalidatePath('/administracion/personas')
  revalidatePath('/administracion/asistencia')
  revalidatePath('/campo/asistencia')
  const rotulo = rotuloTardanza(fila)
  return {
    ok: true,
    mensaje: rotulo
      ? `Marcado: ${rotulo}. Pierde el presentismo de la quincena.`
      : (antes ? 'Marca quitada: el día queda como presente sin tardanza.' : 'Día declarado presente, sin tardanza.'),
  }
}
