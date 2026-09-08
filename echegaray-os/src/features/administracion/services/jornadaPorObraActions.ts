'use server'

// GUARDAR EL DÍA — la única escritura de la asistencia por obra.
//
// ═══ POR QUÉ NO ES `imputarHHMasivo` ═══
//
// Esa acción inserta y SALTEA a quien ya tenía horas: sirve para cargar una cuadrilla la primera vez
// y no sirve acá, donde reabrir el día y corregir un 8,8 a 5 es el caso normal — saltearlo dejaría
// la corrección afuera y diría que salió bien. El plan de qué insertar, corregir y reemplazar lo
// decide `planDeJornada.ts`, que se prueba sin base.
//
// ═══ EL AUSENTE NO SE GUARDA COMO CERO ═══
//
// `registros_hh` exige `horas > 0`. La ausencia se guarda con las horas de la jornada y
// `tipo_hora='ausencia'`, que es lo que `tipoHora.ts` ya declara: «una ausencia tiene horas y no es
// trabajo». Nadie la suma como trabajo.
//
// ═══ NO SE TOCAN LAS HORAS DE OTRA OBRA ═══
//
// Todo `update` y todo `delete` llevan `eq('obra_canonica_id', obraId)`. Sin eso, corregir el día en
// una obra podría borrar la imputación que esa misma persona tiene ese día en otra.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { tipoDeMotivo } from './motivoDeAusencia'
import {
  acuseDe, acuseDeBorrado, cambiaDeObra, correccionSchema, envioSchema, motivoDe, personasQueEstrenanDia,
  planDeBorrado, planDeGuardado, puertaDeObraNoActiva, traducirEscritura,
  type EscritoEnLaBase, type FilaExistente, type MarcaDeJornada, type PlanDeJornada,
} from './planDeJornada'

export type ResultadoJornada = { ok: true; mensaje: string } | { ok: false; error: string }

export async function guardarJornada(entrada: unknown): Promise<ResultadoJornada> {
  const parsed = envioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { obra_id: obraId, fecha, marcas } = parsed.data

  const supabase = await createClient()

  // LA ACCIÓN ES LA PUERTA, NO LA PANTALLA. La pantalla ofrece obras activas; esta llamada puede
  // venir de cualquier lado. Sin esto se podían cargar horas contra una obra inexistente y el costo
  // se imputaba a una obra que ya nadie mira.
  const obra = await supabase.from('obra_canonica').select('nombre, estado').eq('id', obraId).maybeSingle()
  if (obra.error) return { ok: false, error: obra.error.message }
  if (!obra.data) return { ok: false, error: 'Esa obra no existe o no la ves.' }
  const { nombre, estado } = obra.data as { nombre: string; estado: string | null }

  // LO QUE YA ESTÁ GUARDADO SE LEE ANTES DE DECIDIR SI SE PUEDE ESCRIBIR. El orden importa: es lo
  // único que distingue corregir un día que existe —permitido siempre— de estrenar uno.
  //
  // `.order('id')` Y LOS CAMPOS QUE EL PLAN NECESITA PARA DECIDIR. Sin `actividad_id` e
  // `improductiva`, el plan no puede distinguir la jornada del día de una imputación al plan de
  // obra y las trata como intercambiables. Sin `.order()`, el orden lo elige PostgREST.
  const previos = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora, actividad_id, improductiva, notas')
    .eq('obra_canonica_id', obraId).eq('fecha', fecha)
    .in('persona_id', marcas.map((m) => m.persona_id))
    .order('id', { ascending: true })
  if (previos.error) return { ok: false, error: previos.error.message }
  const existentes = (previos.data ?? []) as FilaExistente[]

  // CORREGIR HISTORIA NO ES CARGAR HORAS EN UNA OBRA CERRADA (ver `puertaDeObraNoActiva`).
  const estrenan = personasQueEstrenanDia(marcas, existentes)
  const cerrada = puertaDeObraNoActiva({ nombre, estado, crea: estrenan.length > 0 })
  if (cerrada) return { ok: false, error: cerrada }

  // Y SÓLO A QUIEN ESTÁ ASIGNADO ESE DÍA. Cargarle horas a alguien que no está en la obra imputa su
  // costo a una obra en la que no trabajó. Administración puede hacerlo desde `corregirJornada`,
  // que además le pide asignarla — y ahí es una decisión, no un efecto colateral.
  //
  // SÓLO SOBRE QUIEN ESTRENA EL DÍA, por lo mismo que la puerta de arriba: si la persona ya tiene
  // horas cargadas en esta obra ese día, el costo ya está imputado ahí y corregirlo no lo mueve a
  // ningún lado. Exigir una asignación VIGENTE para arreglar un número de hace dos meses dejaría el
  // dato mal —la asignación de entonces suele estar cerrada con `hasta`—, que es exactamente el
  // caso que reportó el dueño.
  const sinAsignar = await personasSinAsignacion(supabase, obraId, estrenan, fecha)
  if (sinAsignar.length > 0) {
    return {
      ok: false,
      error: `${sinAsignar.length === 1 ? 'Una persona del envío no está asignada' : `${sinAsignar.length} personas del envío no están asignadas`}`
        + ' a esta obra ese día. Se asigna desde Personal de la obra, o desde Administración → '
        + 'Personal → Asistencia, que lo hace en el mismo gesto.',
    }
  }

  const plan = planDeGuardado(marcas, existentes)
  const r = await escribirPlan(supabase, obraId, fecha, plan)
  if (r.error || !r.escrito) return { ok: false, error: r.error ?? 'No se pudo escribir.' }

  revalidar()
  return { ok: true, mensaje: acuseDe(r.escrito) }
}

/**
 * Aplica el plan contra la base y devuelve LO QUE LA BASE HIZO, no lo que se le pidió.
 *
 * ═══ EL ORDEN: INSERTAR · CORREGIR · BORRAR ═══
 *
 * PostgREST no da transacciones y estos son tres viajes. Borrar primero —como estaba— deja una
 * ventana en la que el día no está en ningún lado: si el insert falla ahí, las horas desaparecen
 * sin que nadie vea un error. Insertando primero, el peor caso es un DUPLICADO VISIBLE (dos filas
 * del mismo día, que la grilla muestra y alguien corrige). Un duplicado visible siempre le gana a
 * una pérdida silenciosa.
 *
 * La atomicidad de verdad necesita una función `SECURITY INVOKER` en Postgres —una migración—, y
 * está declarada como pendiente. Este orden es lo que hace que la falta de transacción no pueda
 * borrar trabajo.
 *
 * ═══ CADA OPERACIÓN CUENTA LO QUE DEVOLVIÓ ═══
 *
 * `.select()` encadenado en las tres. Sin él, un `update` que afecta cero filas —porque otro la
 * borró entremedio, o porque la policy la rechazó sin error— igual acusaba «1 corregida». La
 * evidencia es del efecto, no del intento.
 */
async function escribirPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string, fecha: string, plan: PlanDeJornada,
): Promise<{ escrito: EscritoEnLaBase | null; error: string | null }> {
  const escrito: EscritoEnLaBase = {
    insertadas: 0, actualizadas: 0, borradas: 0, intactas: plan.intactas,
  }

  if (plan.insertar.length > 0) {
    const { data, error } = await supabase.from('registros_hh').insert(plan.insertar.map((m) => ({
      obra_canonica_id: obraId,
      persona_id: m.persona_id,
      // SIN ACTIVIDAD, A PROPÓSITO. El diseño lo dice: «ni foto, ni tarea, ni plata». Y es lo que
      // hace que `esDeLaJornada` pueda distinguir estas filas de una imputación al plan de obra.
      actividad_id: null,
      fecha,
      // La semana la deriva el trigger `registros_hh_normalizar`; se manda igual porque la columna
      // es `not null` y un insert sin ella fallaría si el trigger se cayera.
      fecha_inicio_semana: fecha,
      horas: m.horas,
      // EL TIPO LO DECIDE EL MOTIVO (`tipoQuePide` en `planDeJornada.ts`): vacaciones y parte
      // médico son LICENCIA, faltar sin avisar es AUSENCIA. Ninguna de las dos suma trabajo.
      tipo_hora: tipoDeLaMarca(m),
      // EL MOTIVO VA EN `notas`, que es la columna que ya existe. No se agregó ninguna: la clave
      // es estable (viene del catálogo) y por eso el ausentismo se puede agrupar por causa.
      notas: motivoDe(m),
      fuente_legacy: 'web:asistencia-obra',
    }))).select('id')
    if (error) return { escrito: null, error: traducirEscritura(error) }
    escrito.insertadas = (data ?? []).length
  }

  for (const { id, marca, tipo } of plan.actualizar) {
    // EL TIPO VIAJA EN EL UPDATE. Antes sólo iba `horas`, así que corregir una jornada a «no vino»
    // dejaba la fila en `normal` con las horas de la ausencia: el día contaba como trabajado.
    const { data, error } = await supabase.from('registros_hh')
      .update({ horas: marca.horas, tipo_hora: tipo, notas: motivoDe(marca) })
      .eq('id', id).eq('obra_canonica_id', obraId).select('id')
    if (error) return { escrito: null, error: traducirEscritura(error) }
    escrito.actualizadas += (data ?? []).length
  }

  if (plan.borrar.length > 0) {
    const { data, error } = await supabase.from('registros_hh').delete()
      .eq('obra_canonica_id', obraId).eq('fecha', fecha).in('id', plan.borrar).select('id')
    if (error) return { escrito: null, error: traducirEscritura(error) }
    escrito.borradas = (data ?? []).length
  }

  return { escrito, error: null }
}


/**
 * CORREGIR UN DÍA — lo que sólo puede hacer Administración: cambiarle la obra, las horas, declararlo
 * ausencia o borrarlo.
 *
 * ═══ LA ASIGNACIÓN NO SE CREA EN SILENCIO ═══
 *
 * Si la persona no está asignada a la obra destino, la acción NO carga las horas: vuelve con
 * `necesitaAsignacion` y el nombre de la obra. La pantalla lo dice y ofrece asignarla; recién con
 * `asignar: true` —un acto de alguien— se crea la fila en `obra_asignacion`. Crearla sola haría que
 * un dedo mal puesto cambiara de obra a una persona sin que nadie lo decidiera, y esa asignación es
 * la que después decide a qué obra se le imputa el costo.
 *
 * ═══ QUIÉN CORRIGIÓ NO SE ESCRIBE ACÁ ═══
 *
 * `creado_por` tiene `default auth.uid()` y `actualizado_por` lo pone el trigger
 * `set_actualizado_en()`. Mandarlo desde el cliente sería un dato que se puede omitir o falsear;
 * así lo escribe Postgres con la identidad de la sesión, siempre.
 */
export type ResultadoCorreccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; necesitaAsignacion?: boolean }

export async function corregirJornada(entrada: unknown): Promise<ResultadoCorreccion> {
  const parsed = correccionSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const c = parsed.data
  const supabase = await createClient()

  // LO QUE YA ESTÁ CARGADO SE LEE PRIMERO. Es lo único que distingue corregir un día que existe
  // —permitido aunque la obra esté cerrada— de estrenar uno o moverlo, que no.
  const previos = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora, obra_canonica_id, actividad_id, improductiva, notas')
    .eq('persona_id', c.persona_id).eq('fecha', c.fecha)
    .in('obra_canonica_id', [c.obra_origen, c.obra_destino].filter((x): x is string => Boolean(x)))
    .order('id', { ascending: true })
  if (previos.error) return { ok: false, error: previos.error.message }
  const filas = (previos.data ?? []) as (FilaExistente & { obra_canonica_id: string })[]
  const enOrigen = filas.filter((f) => f.obra_canonica_id === c.obra_origen)

  if (c.estado === 'borrar') {
    if (enOrigen.length === 0) return { ok: false, error: 'Ese día no tiene nada cargado.' }
    // EL MISMO CRITERIO QUE `planDeGuardado`, no un `delete` a todo lo del día: «sacar lo cargado»
    // no puede llevarse por delante una imputación a una actividad del plan, una hora improductiva
    // con su causa ni unas extras que cargó otro. Las nombra en el acuse.
    const plan = planDeBorrado(enOrigen, { administraLicencias: true })
    if (plan.borrar.length === 0) {
      return {
        ok: false,
        error: `Ese día no tiene jornada cargada para sacar. Lo que hay es otra cosa: ${plan.intactas[0]?.motivo ?? 'horas de otro tipo'}.`,
      }
    }
    const { data, error } = await supabase.from('registros_hh').delete()
      .in('id', plan.borrar).select('id')
    if (error) return { ok: false, error: traducirEscritura(error) }
    revalidar()
    // EL ACUSE CUENTA LO QUE LA BASE DEVOLVIÓ. `plan.borrar.length` es la intención; `data` es el
    // efecto, y pueden diferir (otro la borró entremedio, la policy la rechazó sin error).
    return { ok: true, mensaje: acuseDeBorrado((data ?? []).length, plan.intactas) }
  }

  const marca: MarcaDeJornada = c.estado === 'ausente'
    ? { persona_id: c.persona_id, estado: 'ausente', horas: c.horas ?? 1, motivo: c.motivo }
    : { persona_id: c.persona_id, estado: 'presente', horas: c.horas as number }

  const enDestino = filas.filter((f) => f.obra_canonica_id === c.obra_destino)
  const destino = await supabase.from('obra_canonica')
    .select('nombre, estado').eq('id', c.obra_destino).maybeSingle()
  if (destino.error) return { ok: false, error: destino.error.message }
  if (!destino.data) return { ok: false, error: 'Esa obra no existe o no la ves.' }
  const o = destino.data as { nombre: string; estado: string | null }

  // MOVER HORAS A UNA OBRA CERRADA SIGUE PROHIBIDO, y estrenar un día en ella también: las dos le
  // imputan costo de mano de obra nuevo a algo que ya se cerró con su margen. Corregir el día que
  // YA ESTÁ ahí, no: es historia de esa obra y dejarla mal no la protege de nada.
  const mueve = cambiaDeObra(c)
  const crea = mueve
    || personasQueEstrenanDia([marca], enDestino, { administraLicencias: true }).length > 0
  const cerrada = puertaDeObraNoActiva({
    nombre: o.nombre, estado: o.estado, crea, motivo: mueve ? 'mover' : 'cargar',
  })
  if (cerrada) return { ok: false, error: cerrada }

  // LA ASIGNACIÓN SE EXIGE PARA LO NUEVO, NO PARA LA CORRECCIÓN. Si la persona ya tiene ese día
  // cargado en esta obra, el costo ya está imputado ahí: corregir el número no lo mueve. Pedirle
  // una asignación vigente —que en un día viejo casi siempre está cerrada con `hasta`— sería
  // ofrecer asignar a alguien a una obra terminada para arreglar un tipeo.
  if (crea) {
    const falta = await faltaAsignacion(supabase, c.persona_id, c.obra_destino, c.fecha)
    if (falta) {
      if (!c.asignar) {
        return {
          ok: false,
          necesitaAsignacion: true,
          error: `Esa persona no está asignada a ${falta} el ${c.fecha}. Se puede asignar acá mismo, `
            + 'pero es una decisión: la asignación es la que después decide a qué obra se le imputa el costo.',
        }
      }
      const alta = await supabase.from('obra_asignacion').insert({
        obra_id: c.obra_destino, persona_id: c.persona_id, rol: 'integrante', desde: c.fecha,
      })
      if (alta.error) return { ok: false, error: `No pude asignarla: ${alta.error.message}` }
    }
  }

  // INSERTAR PRIMERO, BORRAR DESPUÉS (ver `ORDEN_DEL_MOVIMIENTO`): un duplicado visible le gana a
  // una pérdida silenciosa, y PostgREST no ofrece la transacción que haría innecesaria la elección.
  // ADMINISTRACIÓN SÍ CORRIGE UNA LICENCIA: es quien la autorizó. Desde `/campo` no.
  const escrito = await escribirPlan(supabase, c.obra_destino, c.fecha,
    planDeGuardado([marca], enDestino, { administraLicencias: true }))
  if (escrito.error) return { ok: false, error: escrito.error }

  if (cambiaDeObra(c) && enOrigen.length > 0) {
    // SÓLO LA JORNADA SE MUEVE. Las extras, las improductivas y lo imputado a una actividad se
    // quedan en la obra vieja: son hechos de ESA obra que alguien declaró con más información.
    const aMover = planDeBorrado(enOrigen, { administraLicencias: true })
    const { data, error } = await supabase.from('registros_hh')
      .delete().in('id', aMover.borrar).select('id')
    if (!error && (data ?? []).length === 0 && aMover.borrar.length > 0) {
      return {
        ok: false,
        error: 'Las horas quedaron cargadas en la obra nueva pero el borrado de la vieja no afectó '
          + 'ninguna fila. El día está en las dos obras — miralo antes de volver a tocarlo.',
      }
    }
    if (error) {
      return {
        ok: false,
        error: `Las horas quedaron cargadas en la obra nueva pero NO pude sacarlas de la vieja: `
          + `${error.message}. El día está en las dos obras — hay que borrar el de la vieja a mano.`,
      }
    }
  }

  revalidar()
  return {
    ok: true,
    mensaje: cambiaDeObra(c)
      ? `Día movido a la obra nueva${c.estado === 'ausente' ? ' como ausencia' : ''}.`
      : `Día corregido${c.estado === 'ausente' ? ': no vino' : `: ${c.horas} hs`}.`,
  }
}

/** El nombre de la obra si la persona NO tiene asignación vigente ese día; `null` si sí la tiene. */
async function faltaAsignacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personaId: string, obraId: string, fecha: string,
): Promise<string | null> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('id, desde, hasta').eq('persona_id', personaId).eq('obra_id', obraId)
  // UNA LECTURA QUE FALLA NO ES «NO ESTÁ ASIGNADA». Frenar la corrección por un error de RLS
  // pondría a Administración a pelear con un aviso falso; el `insert` de abajo tiene su propia
  // policy y es la que decide de verdad.
  if (error) return null
  const vigente = ((data ?? []) as { desde: string | null; hasta: string | null }[])
    .some((a) => (!a.desde || a.desde <= fecha) && (!a.hasta || a.hasta >= fecha))
  if (vigente) return null
  const { data: obra } = await supabase.from('obra_canonica').select('nombre').eq('id', obraId).maybeSingle()
  return (obra as { nombre: string } | null)?.nombre ?? obraId
}

function revalidar() {
  revalidatePath('/campo/asistencia')
  revalidatePath('/administracion/personas')
}

/** Quiénes del envío NO tienen asignación vigente en esa obra ese día. Vacío = todos pueden. */
async function personasSinAsignacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string, personaIds: string[], fecha: string,
): Promise<string[]> {
  if (personaIds.length === 0) return []
  const { data, error } = await supabase.from('obra_asignacion')
    .select('persona_id, desde, hasta').eq('obra_id', obraId).in('persona_id', personaIds)
  // UNA LECTURA QUE FALLA NO ES «NO ESTÁ ASIGNADO». Frenar la carga del día por un error de RLS
  // pondría al jefe a pelear con un aviso falso; la policy del insert es la que decide de verdad.
  if (error) return []
  const vigentes = new Set(((data ?? []) as { persona_id: string; desde: string | null; hasta: string | null }[])
    .filter((a) => (!a.desde || a.desde <= fecha) && (!a.hasta || a.hasta >= fecha))
    .map((a) => a.persona_id))
  return personaIds.filter((id) => !vigentes.has(id))
}

/** El `tipo_hora` que le toca a una marca. Duplicado mínimo de `tipoQuePide` porque aquélla es
 *  privada del plan; la regla —el motivo decide— vive una sola vez, en `tipoDeMotivo`. */
const tipoDeLaMarca = (m: MarcaDeJornada): string =>
  m.estado === 'ausente' ? tipoDeMotivo(m.motivo) : 'normal'
