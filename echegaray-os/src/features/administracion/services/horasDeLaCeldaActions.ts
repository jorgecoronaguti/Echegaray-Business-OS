'use server'

// ESCRIBIR LAS HORAS DE UN DÍA DESDE LA CELDA DEL ESPEJO — incluida la celda que todavía está vacía.
//
// ═══ POR QUÉ HACÍA FALTA OTRA PUERTA, Y POR QUÉ NO ES OTRA DEFINICIÓN ═══
//
// `corregirHorasDelDia` (liquidacionDiaActions.ts) corrige UN REGISTRO QUE EXISTE: recibe su `id`,
// escribe las horas y deja el rastro en `registro_hh_correccion`. Eso sigue siendo la única forma de
// corregir, y esta acción la LLAMA cuando el día ya tiene una fila. Lo que agrega es el caso que la
// app no tenía: el día sin cargar.
//
// En la planilla JORNALES ese es el gesto normal —se escribe el 8 en la celda del martes— y la app lo
// mandaba al panel «porque crear un registro exige decir a qué obra se imputa». La obra no se
// pregunta: se DEDUCE de lo que el OS ya sabe (`obraParaElDia`), se declara en el acuse, y cuando no
// se puede deducir se rechaza con el motivo. Adivinarla movería costo de mano de obra entre obras.
//
// ═══ LAS TRES CAPAS, Y LA ÚLTIMA NO ES ÉSTA ═══
//
// La pantalla esconde la vista (`liquidaSueldos`), esta acción vuelve a preguntar el permiso
// (`permisoDeLiquidacion`) porque el jefe de obra entra a la misma pantalla a cargar asistencia, y la
// cerradura final es la RLS de `registros_hh`. Un `insert` que la policy rechaza sin error devuelve
// 204 y cero filas, así que se lee lo que la base DEVOLVIÓ con `.select()` encadenado.
//
// ═══ LA QUINCENA CERRADA NO RECIBE NI UNA HORA NUEVA ═══
//
// Se pregunta ANTES de tocar nada y se falla cerrado: sin poder leer `liquidacion_quincena`, no se
// escribe. Es la misma regla y la misma lectura que la corrección.
//
// ═══ LA PRESENCIA SE DECLARA `origen='horas'`, Y NO PISA A NADIE ═══
//
// Cargar horas desde la app es el único camino por el que la presencia se deriva de las horas (regla
// del 08/09/2026), y `planDeDeclaracion` ya garantiza que una `'horas'` no pise una `'declarada'`: si
// el jefe marcó ausente, la presencia no cambia y las horas sí se guardan. Que la declaración falle
// NO deshace las horas — se avisa, porque un dato perdido en silencio es peor que un error.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { corregirHorasDelDia } from './liquidacionDiaActions'
import { declararPresencia } from './presenciaDelDiaService'
// LA CONSTANTE NO PUEDE VIVIR EN ESTE ARCHIVO: un `'use server'` sólo exporta funciones async, y una
// `export const` acá tumba el build con «Only async functions are allowed to be exported». El
// typecheck no lo ve; lo vio el navegador (11/09/2026).
import { FUENTE_GRILLA_QUINCENA } from './presenciaDelDia'
import { declaracionesDeJornada } from './presenciaPorHoras'
import { quincenaDe } from './quincena'
import {
  obraParaElDia, TEXTO_DE_MOTIVO, TEXTO_SIN_OBRA,
  type AsignacionDeObra, type DiaYaImputado,
} from './obraDelDia'

const RUTA = '/administracion/personas'

export type ResultadoCelda = { ok: true; aviso?: string } | { ok: false; error: string }

const celdaSchema = z.object({
  personaId: z.string().uuid('Persona inválida'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  // VACÍO NO ES CERO. Un día sin cargar y un día de 0 h son dos afirmaciones distintas y una de las
  // dos se liquida. Sobre una celda vacía, vacío es «no escribiste nada» y no se crea ninguna fila.
  horas: z.union([
    z.literal(''),
    z.coerce.number().nonnegative('Las horas no pueden ser negativas').max(24, 'Un día tiene 24 horas'),
  ]),
})

/** ¿Está sellada la quincena de esa fecha? Falla CERRADO: sin lectura no se escribe nada. */
async function quincenaCerrada(
  supabase: Awaited<ReturnType<typeof createClient>>, fecha: string,
): Promise<{ cerrada: boolean } | { error: string }> {
  const q = quincenaDe(fecha)
  const { data, error } = await supabase.from('liquidacion_quincena')
    .select('estado').eq('desde', q.desde).eq('hasta', q.hasta)
  if (error) return { error: `No pude verificar si la quincena está cerrada: ${error.message}` }
  return { cerrada: (data ?? []).some((f) => (f as { estado: string }).estado === 'cerrada') }
}

/**
 * LAS HORAS DE UN DÍA DE UNA PERSONA. Crea la fila si no existe, corrige si existe una sola, y se
 * niega cuando hay más de una.
 *
 * `personaId` y `fecha` llegan atados con `.bind(null, …)` desde el servidor: nunca viajan en el
 * formulario, donde cualquiera los cambiaría por los de otra persona u otro día.
 */
export async function guardarHorasDeLaCelda(
  personaId: string, fecha: string, valor: string,
): Promise<ResultadoCelda> {
  const datos = celdaSchema.safeParse({ personaId, fecha, horas: valor.trim() })
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const { data: perfil, error: errorPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errorPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const delDia = await supabase.from('registros_hh')
    .select('id').eq('persona_id', datos.data.personaId).eq('fecha', datos.data.fecha)
  if (delDia.error) return { ok: false, error: delDia.error.message }
  const filas = (delDia.data ?? []) as { id: string }[]

  if (filas.length === 1) {
    // EL DÍA QUE YA EXISTE SE CORRIGE POR LA ÚNICA PUERTA QUE DEJA RASTRO. Escribir el `update` acá
    // daría dos historiales de «quién cambió este jornal», y el que se lee es el de la otra.
    return corregirHorasDelDia(filas[0].id, valor)
  }
  if (filas.length > 1) {
    return {
      ok: false,
      error: `Ese día tiene ${filas.length} registros cargados: no elijo a cuál le imputo la `
        + 'corrección. Abrí el panel de la persona y corregí el que corresponda.',
    }
  }

  // ═══ NO HAY FILA: O NO SE ESCRIBE NADA, O SE CREA UNA ═══
  //
  // Vaciar una celda que ya estaba vacía no es una escritura: crear una fila de 0 h ahí diría «no
  // trabajó», que es una afirmación que nadie hizo.
  if (datos.data.horas === '' || datos.data.horas === 0) return { ok: true }

  const sello = await quincenaCerrada(supabase, datos.data.fecha)
  if ('error' in sello) return { ok: false, error: sello.error }
  if (sello.cerrada) {
    return { ok: false, error: 'La quincena está cerrada: las horas quedaron selladas. Reabrila para corregir.' }
  }

  return crearElDia(supabase, datos.data.personaId, datos.data.fecha, datos.data.horas)
}

/** De dónde sale la obra: la asignación de la persona y los días que ya tiene imputados. */
async function pistasDeObra(
  supabase: Awaited<ReturnType<typeof createClient>>, personaId: string,
): Promise<{ asignaciones: AsignacionDeObra[]; dias: DiaYaImputado[] } | { error: string }> {
  const [asig, hh] = await Promise.all([
    supabase.from('obra_asignacion').select('obra_id, desde, hasta').eq('persona_id', personaId),
    supabase.from('registros_hh').select('fecha, obra_canonica_id')
      .eq('persona_id', personaId).not('obra_canonica_id', 'is', null)
      .order('fecha', { ascending: false }).limit(400),
  ])
  // LAS DOS LECTURAS SON OBLIGATORIAS. Si una falla se rechaza en vez de deducir con la mitad de la
  // evidencia: «no tiene asignación» y «no pude leer la asignación» son lo mismo para el código y
  // cosas opuestas para la obra a la que termina el jornal.
  if (asig.error) return { error: `No pude leer las obras asignadas: ${asig.error.message}` }
  if (hh.error) return { error: `No pude leer las horas anteriores: ${hh.error.message}` }
  return {
    asignaciones: ((asig.data ?? []) as { obra_id: string; desde: string; hasta: string | null }[])
      .map((a) => ({ obraId: a.obra_id, desde: a.desde, hasta: a.hasta })),
    dias: ((hh.data ?? []) as { fecha: string; obra_canonica_id: string }[])
      .map((r) => ({ fecha: r.fecha, obraId: r.obra_canonica_id })),
  }
}

/** Crea el día: una fila `normal` en la obra deducida, y la presencia que esas horas implican. */
async function crearElDia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personaId: string, fecha: string, horas: number,
): Promise<ResultadoCelda> {
  const pistas = await pistasDeObra(supabase, personaId)
  if ('error' in pistas) return { ok: false, error: pistas.error }

  const obra = obraParaElDia(fecha, pistas.asignaciones, pistas.dias)
  if (!obra.ok) return { ok: false, error: TEXTO_SIN_OBRA[obra.porque] }

  const creado = await supabase.from('registros_hh').insert({
    persona_id: personaId,
    obra_canonica_id: obra.obraId,
    // SIN ACTIVIDAD, A PROPÓSITO: igual que la carga de jornada desde el celular. Una imputación al
    // plan de obra es otra cosa y la decide quien planifica, no quien teclea una celda.
    actividad_id: null,
    fecha,
    // La semana la deriva el trigger `registros_hh_normalizar`; va igual porque la columna es
    // `not null` y un insert sin ella fallaría si el trigger se cayera.
    fecha_inicio_semana: fecha,
    horas,
    tipo_hora: 'normal',
    fuente_legacy: FUENTE_GRILLA_QUINCENA,
  }).select('id, horas').maybeSingle()
  if (creado.error) return { ok: false, error: creado.error.message }
  if (!creado.data) {
    return { ok: false, error: 'No pude crear el día: la base no devolvió la fila. No guardé nada.' }
  }

  // LA PRESENCIA ES CONSECUENCIA, NO CONDICIÓN. Si falla, las horas ya están guardadas y eso no se
  // deshace: se avisa, porque el Plantel va a decir «sin marcar» de alguien con horas cargadas.
  const presencia = await declararPresencia(
    supabase,
    declaracionesDeJornada([{ persona_id: personaId, estado: 'presente', horas, motivo: null }], fecha, obra.obraId),
  )

  revalidatePath(RUTA)
  const avisoObra = `Imputado a ${TEXTO_DE_MOTIVO[obra.porque]}.`
  return {
    ok: true,
    aviso: presencia.error
      ? `${avisoObra} Guardé las horas pero NO la presencia del día: ${presencia.error}`
      : avisoObra,
  }
}
