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
  acuseDe, acuseDeBorrado, avisoSinAsignacion, cambiaDeObra, correccionSchema, envioSchema, motivoDe,
  personasQueEstrenanDia, personasSinAsignacionVigente, planDeBorrado, planDeGuardado,
  puertaDeObraNoActiva, traducirEscritura,
  type Correccion, type EscritoEnLaBase, type FilaExistente, type MarcaDeJornada,
  type PlanDeJornada,
} from './planDeJornada'
import {
  acuseDeAusencia, ausenciaSinObraDe, horasDeLaAusencia, sumarHoras, type FilaDelDia,
} from './ausenciaDeLaPersona'
import { jornadaDeReferencia, nombresDeObras } from './ausenciaDeLaPersonaService'

export type ResultadoJornada =
  /** `aviso` va aparte del acuse para que la grilla lo muestre SIN mostrar «1 marca nueva» en cada
   *  celda que se corrige: lo que hay que leer es la excepción, no el trámite. */
  | { ok: true; mensaje: string; aviso?: string }
  | { ok: false; error: string }

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

  // LA FALTA DE ASIGNACIÓN AVISA, NO RECHAZA (ver el bloque «LA ASIGNACIÓN NO ES LA PUERTA DE LAS
  // HORAS» en `planDeJornada.ts`). Se mide ANTES de escribir porque después de guardar la lectura
  // sigue diciendo lo mismo, pero el orden deja claro que el aviso describe lo que había.
  const sinAsignar = await personasSinAsignacion(supabase, obraId, estrenan, fecha)

  const plan = planDeGuardado(marcas, existentes)
  const r = await escribirPlan(supabase, obraId, fecha, plan)
  if (r.error || !r.escrito) return { ok: false, error: r.error ?? 'No se pudo escribir.' }

  revalidar()
  const aviso = avisoSinAsignacion(await nombresDe(supabase, sinAsignar), sinAsignar.length)
  // EL AVISO VIAJA TAMBIÉN DENTRO DEL ACUSE: `/campo/asistencia` muestra `mensaje` y nada más, y un
  // aviso que sólo lee una de las dos pantallas es un aviso que no existe en la otra.
  return { ok: true, mensaje: aviso ? `${acuseDe(r.escrito)} ${aviso}` : acuseDe(r.escrito), ...(aviso ? { aviso } : {}) }
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
 * ═══ LA ASIGNACIÓN NO FRENA LAS HORAS, Y TAMPOCO SE CREA EN SILENCIO ═══
 *
 * Las horas entran aunque la persona no esté asignada a la obra destino ese día —son un hecho con
 * fecha y obra— y el acuse lo NOMBRA. La asignación sigue sin crearse sola: se crea únicamente con
 * `asignar: true`, la casilla del panel, porque es la que después decide a qué obra se le imputa el
 * costo de esa persona de acá en adelante.
 *
 * ═══ QUIÉN CORRIGIÓ NO SE ESCRIBE ACÁ ═══
 *
 * `creado_por` tiene `default auth.uid()` y `actualizado_por` lo pone el trigger
 * `set_actualizado_en()`. Mandarlo desde el cliente sería un dato que se puede omitir o falsear;
 * así lo escribe Postgres con la identidad de la sesión, siempre.
 */
export type ResultadoCorreccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string }

export async function corregirJornada(entrada: unknown): Promise<ResultadoCorreccion> {
  const parsed = correccionSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const c = parsed.data
  const supabase = await createClient()

  // LO QUE YA ESTÁ CARGADO SE LEE PRIMERO. Es lo único que distingue corregir un día que existe
  // —permitido aunque la obra esté cerrada— de estrenar uno o moverlo, que no.
  // TODO EL DÍA DE ESA PERSONA, NO SÓLO LAS DOS OBRAS DEL FORMULARIO. Antes se filtraba por
  // `origen` y `destino`: con una ausencia que viene SIN obra elegida no hay destino que filtrar, y
  // sin leer el día entero el sistema no podría deducir dónde ya están esas horas. Lo que se toca
  // sigue acotado por obra —`enOrigen` y `enDestino` filtran acá abajo—, así que leer de más no
  // escribe de más.
  const previos = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora, obra_canonica_id, actividad_id, improductiva, notas')
    .eq('persona_id', c.persona_id).eq('fecha', c.fecha)
    .order('id', { ascending: true })
  if (previos.error) return { ok: false, error: previos.error.message }
  const filas = (previos.data ?? []) as (FilaExistente & { obra_canonica_id: string | null })[]
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

  // ═══ LA AUSENCIA ES DE LA PERSONA: SE ESCRIBE SIN OBRA ═══
  //
  // Antes acá se DEDUCÍA una obra (`obraDeLaAusencia.ts`, retirado). El dueño lo rechazó el 08/09:
  // *«La Estrella es cliente y no tiene obra activa; si la persona está ausente, se le suma hs pero
  // porque corresponde por ley, no necesariamente sumarle a ninguna obra»*. La obra elegida en el
  // formulario tampoco se usa para una ausencia: el día no se trabajó en ninguna parte.
  if (c.estado === 'ausente') return await corregirAusencia(supabase, c, filas)

  // TRABAJÓ: la obra es obligatoria y la exigió el schema. Acá ya no puede ser `null`.
  const obraDestino = c.obra_destino as string
  const enDestino = filas.filter((f) => f.obra_canonica_id === obraDestino)
  const destino = await supabase.from('obra_canonica')
    .select('nombre, estado').eq('id', obraDestino).maybeSingle()
  if (destino.error) return { ok: false, error: destino.error.message }
  if (!destino.data) return { ok: false, error: 'Esa obra no existe o no la ves.' }
  const o = destino.data as { nombre: string; estado: string | null }

  const marca: MarcaDeJornada = { persona_id: c.persona_id, estado: 'presente', horas: c.horas as number }

  // MOVER HORAS A UNA OBRA CERRADA SIGUE PROHIBIDO, y estrenar un día en ella también: las dos le
  // imputan costo de mano de obra nuevo a algo que ya se cerró con su margen. Corregir el día que
  // YA ESTÁ ahí, no: es historia de esa obra y dejarla mal no la protege de nada.
  const mueve = cambiaDeObra({ obra_origen: c.obra_origen, obra_destino: obraDestino })
  const crea = mueve
    || personasQueEstrenanDia([marca], enDestino, { administraLicencias: true }).length > 0
  const cerrada = puertaDeObraNoActiva({
    nombre: o.nombre, estado: o.estado, crea, motivo: mueve ? 'mover' : 'cargar',
  })
  if (cerrada) return { ok: false, error: cerrada }

  // LA ASIGNACIÓN NO ES LA PUERTA DE LAS HORAS. Falte o no, la corrección entra: lo único que
  // cambia es que el acuse lo diga. La casilla del panel —`asignar`— sigue siendo la única forma de
  // CREAR la asignación, y se respeta aunque el día ya estuviera cargado: es un acto explícito.
  const faltaEn = await faltaAsignacion(supabase, c.persona_id, obraDestino, c.fecha)
  if (faltaEn && c.asignar) {
    const alta = await supabase.from('obra_asignacion').insert({
      obra_id: obraDestino, persona_id: c.persona_id, rol: 'integrante', desde: c.fecha,
    })
    if (alta.error) return { ok: false, error: `No pude asignarla: ${alta.error.message}` }
  }

  // INSERTAR PRIMERO, BORRAR DESPUÉS (ver `ORDEN_DEL_MOVIMIENTO`): un duplicado visible le gana a
  // una pérdida silenciosa, y PostgREST no ofrece la transacción que haría innecesaria la elección.
  // ADMINISTRACIÓN SÍ CORRIGE UNA LICENCIA: es quien la autorizó. Desde `/campo` no.
  const escrito = await escribirPlan(supabase, obraDestino, c.fecha,
    planDeGuardado([marca], enDestino, { administraLicencias: true }))
  if (escrito.error) return { ok: false, error: escrito.error }

  if (mueve && enOrigen.length > 0) {
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
  const hecho = mueve ? 'Día movido a la obra nueva.' : `Día corregido: ${c.horas} hs.`
  // EL AVISO SÓLO SI NO SE ASIGNÓ EN EL MISMO GESTO: decir «no estaba asignada» después de haberla
  // asignado sería falso desde el instante en que se muestra.
  const aviso = faltaEn && !c.asignar
    ? `Esa persona no estaba asignada a ${faltaEn} el ${c.fecha}: las horas se guardaron igual. `
      + 'Para que quede asignada, marcá la casilla.'
    : null
  return { ok: true, mensaje: aviso ? `${hecho} ${aviso}` : hecho }
}

/**
 * CORREGIR UN DÍA A «NO VINO» — la ausencia se escribe SIN obra.
 *
 * Tres efectos, en este orden y por esta razón:
 *
 *   1 · se ESCRIBE la ausencia sin obra (insert o update de la que ya estaba sin obra),
 *   2 · se SACA lo que tuviera cargado ese día EN OBRAS —incluida una ausencia vieja con obra, el
 *       legado de JORNALES—, porque no trabajó,
 *   3 · el acuse dice las dos cosas.
 *
 * Escribir antes de borrar es la misma regla que `escribirPlan`: PostgREST no da transacciones, y
 * un duplicado visible le gana a una pérdida silenciosa.
 */
async function corregirAusencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  c: Correccion, filas: (FilaExistente & { obra_canonica_id: string | null })[],
): Promise<ResultadoCorreccion> {
  const conObra = filas.filter((f) => f.obra_canonica_id !== null)
  const aSacar = planDeBorrado(conObra, { administraLicencias: true })
  const horas = horasDeLaAusencia(c.horas, await jornadaDeReferencia(supabase, c, conObra))
  const yaSinObra = ausenciaSinObraDe(filas as unknown as FilaDelDia[])

  const escrita = await escribirAusenciaSinObra(supabase, c, horas, yaSinObra?.id ?? null)
  if (escrita.error) return { ok: false, error: escrita.error }

  let sacadas: string[] = []
  if (aSacar.borrar.length > 0) {
    const { data, error } = await supabase.from('registros_hh')
      .delete().in('id', aSacar.borrar).select('id')
    if (error) {
      return {
        ok: false,
        error: `La ausencia quedó registrada pero NO pude sacar las horas que tenía cargadas en `
          + `obra: ${error.message}. El día está contado dos veces — miralo antes de volver a tocarlo.`,
      }
    }
    sacadas = ((data ?? []) as { id: string }[]).map((r) => r.id)
  }

  revalidar()
  return {
    ok: true,
    mensaje: acuseDeAusencia({
      fila: escrita.fila,
      horasSacadas: sumarHoras(filas as unknown as FilaDelDia[], sacadas),
      obrasSacadas: await nombresDeObras(supabase, conObra
        .filter((f) => sacadas.includes(f.id)).map((f) => f.obra_canonica_id as string)),
      intactas: aSacar.intactas,
    }),
  }
}

/**
 * Escribe la ausencia SIN obra. Devuelve lo que la base hizo, no lo que se le pidió: `fila` es
 * `null` cuando el `update` no afectó ninguna —la policy la rechazó sin error, otro la borró—.
 */
async function escribirAusenciaSinObra(
  supabase: Awaited<ReturnType<typeof createClient>>,
  c: Correccion, horas: number, idExistente: string | null,
): Promise<{ fila: 'insertada' | 'actualizada' | null; error: string | null }> {
  const tipo = tipoDeMotivo(c.motivo)
  if (idExistente) {
    const { data, error } = await supabase.from('registros_hh')
      .update({ horas, tipo_hora: tipo, notas: c.motivo })
      .eq('id', idExistente).is('obra_canonica_id', null).select('id')
    if (error) return { fila: null, error: traducirEscritura(error) }
    return { fila: (data ?? []).length > 0 ? 'actualizada' : null, error: null }
  }
  const { data, error } = await supabase.from('registros_hh').insert({
    // LA COLUMNA VA EXPLÍCITA EN `null`. Omitirla daría el mismo resultado hoy, pero lo que este
    // insert AFIRMA es que la ausencia no es de ninguna obra — no que se olvidó de decirlo.
    obra_canonica_id: null,
    persona_id: c.persona_id,
    actividad_id: null,
    fecha: c.fecha,
    fecha_inicio_semana: c.fecha,
    horas,
    tipo_hora: tipo,
    notas: c.motivo,
    fuente_legacy: 'web:correccion-ausencia',
  }).select('id')
  if (error) return { fila: null, error: traducirEscritura(error) }
  return { fila: (data ?? []).length > 0 ? 'insertada' : null, error: null }
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

/** Quiénes del envío NO tienen asignación vigente en esa obra ese día. Sólo alimenta el AVISO del
 *  acuse: ya no decide si se escribe. La regla de vigencia vive en `personasSinAsignacionVigente`. */
async function personasSinAsignacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string, personaIds: string[], fecha: string,
): Promise<string[]> {
  if (personaIds.length === 0) return []
  const { data, error } = await supabase.from('obra_asignacion')
    .select('persona_id, desde, hasta').eq('obra_id', obraId).in('persona_id', personaIds)
  // UNA LECTURA QUE FALLA NO ES «NO ESTÁ ASIGNADO». Avisar por un error de RLS pondría al jefe a
  // pelear con un aviso falso sobre una escritura que salió bien.
  if (error) return []
  return personasSinAsignacionVigente(
    (data ?? []) as { persona_id: string; desde: string | null; hasta: string | null }[],
    personaIds, fecha,
  )
}

/** Los nombres, para que el aviso diga QUIÉN. Devuelve `[]` si no se pueden leer: el aviso sabe
 *  contar sin nombres, y no poder nombrarlos no puede convertirse en no avisar. */
async function nombresDe(
  supabase: Awaited<ReturnType<typeof createClient>>, personaIds: string[],
): Promise<string[]> {
  if (personaIds.length === 0) return []
  const { data, error } = await supabase.from('persona_directorio')
    .select('nombre_completo').in('id', personaIds)
  if (error) return []
  return ((data ?? []) as { nombre_completo: string | null }[])
    .map((p) => p.nombre_completo).filter((n): n is string => Boolean(n))
}

/** El `tipo_hora` que le toca a una marca. Duplicado mínimo de `tipoQuePide` porque aquélla es
 *  privada del plan; la regla —el motivo decide— vive una sola vez, en `tipoDeMotivo`. */
const tipoDeLaMarca = (m: MarcaDeJornada): string =>
  m.estado === 'ausente' ? tipoDeMotivo(m.motivo) : 'normal'
