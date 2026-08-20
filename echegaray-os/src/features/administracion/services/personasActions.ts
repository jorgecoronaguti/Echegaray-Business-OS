'use server'

// PERSONAS — las acciones que ESCRIBEN el legajo.
//
// El permiso lo decide la RLS de Postgres, no esta capa: `personas` sólo admite lectura y escritura
// de dirección y administración. Si alguien más lo intenta, la base responde y el error se muestra
// tal cual — no se simula un éxito ni se traduce a "algo salió mal".
//
// UN SOLO ESQUEMA PARA EL ALTA Y PARA LA EDICIÓN. Dos esquemas terminan aceptando cosas distintas, y
// el desvío recién se descubre cuando un dato cargado por una vía no aparece por la otra.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string }

/** Un documento es su serie de dígitos: con puntos y sin puntos es el mismo. */
const soloDigitos = z.string().trim().transform((v) => v.replace(/\D/g, ''))
const fechaISO = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional()
const opcional = z.string().trim().optional()

const personaSchema = z.object({
  nombre_completo: z.string().trim().min(3, 'El nombre completo es obligatorio'),
  dni: soloDigitos.refine((v) => v === '' || (v.length >= 7 && v.length <= 8), 'El DNI tiene 7 u 8 dígitos').optional(),
  cuil: soloDigitos.refine((v) => v === '' || v.length === 11, 'El CUIL tiene 11 dígitos').optional(),
  fecha_nacimiento: fechaISO,
  nacionalidad: opcional,
  telefono: opcional,
  email: z.union([z.string().trim().email('El email no parece válido'), z.literal('')]).optional(),
  domicilio: opcional,
  contacto_emergencia: opcional,
  contacto_emergencia_telefono: opcional,
  fecha_ingreso: fechaISO,
  fecha_egreso: fechaISO,
  // El número de la nómina. Se acepta libre —hay legajos de una y de dos cifras— y su unicidad la
  // impone la base: dos personas con el mismo número liquidarían contra la misma fila de JORNALES.
  legajo: opcional,
  convenio_colectivo: opcional,
  // La categoría se acepta libre a propósito: hay tres personas con códigos mal importados
  // ('1591', '6E60', '004212') y rechazarlos impediría abrir su ficha para corregirlos.
  categoria: opcional,
  especialidad: opcional,
  puesto: opcional,
  modalidad_liquidacion: opcional,
  notas: opcional,
})

/** Una fecha vacía es `null`, no la cadena vacía: Postgres rechaza '' como date y el error que
 *  devuelve ("invalid input syntax for type date") no le dice nada a quien está cargando.
 *  Y NULL significa SIN CARGAR: nunca se convierte en 0 ni en una fecha de hoy inventada. */
const v = (x: string | undefined) => (x && x.trim() ? x.trim() : null)

function aFila(d: Partial<z.infer<typeof personaSchema>>) {
  return {
    nombre_completo: d.nombre_completo as string,
    dni: v(d.dni), cuil: v(d.cuil), fecha_nacimiento: v(d.fecha_nacimiento),
    nacionalidad: v(d.nacionalidad), telefono: v(d.telefono), email: v(d.email),
    domicilio: v(d.domicilio), contacto_emergencia: v(d.contacto_emergencia),
    contacto_emergencia_telefono: v(d.contacto_emergencia_telefono),
    fecha_ingreso: v(d.fecha_ingreso), fecha_egreso: v(d.fecha_egreso), legajo: v(d.legajo),
    convenio_colectivo: v(d.convenio_colectivo), categoria: v(d.categoria),
    especialidad: v(d.especialidad), puesto: v(d.puesto),
    modalidad_liquidacion: v(d.modalidad_liquidacion), notas: v(d.notas),
  }
}

export async function crearPersona(form: FormData): Promise<Resultado> {
  const parsed = personaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data, error } = await supabase.from('personas').insert(aFila(parsed.data)).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  // EL ALTA PIDE LO MÍNIMO Y SIGUE EN LA FICHA. Es la segunda mitad del formulario progresivo:
  // quedarse en el listado obligaría a buscar a la persona recién creada para completarle el legajo.
  redirect(`/administracion/personas/${data.id as string}`)
}

/**
 * LOS DOS GRUPOS QUE EL PANEL LATERAL EDITA POR SEPARADO.
 *
 * Cada panel valida y escribe SÓLO sus campos. Mandar el legajo entero desde media pantalla pisaría
 * con `null` lo que el panel no mostró: editar un teléfono habría borrado la categoría. Se derivan
 * del mismo esquema con `pick` a propósito — dos esquemas escritos aparte terminan aceptando cosas
 * distintas y el desvío se descubre cuando un dato cargado por una vía no aparece por la otra.
 */
const GRUPOS = {
  identidad: personaSchema.pick({
    nombre_completo: true, dni: true, cuil: true, fecha_nacimiento: true, nacionalidad: true,
    telefono: true, email: true, domicilio: true,
    contacto_emergencia: true, contacto_emergencia_telefono: true,
  }),
  laboral: personaSchema.pick({
    fecha_ingreso: true, fecha_egreso: true, legajo: true, convenio_colectivo: true, categoria: true,
    especialidad: true, puesto: true, modalidad_liquidacion: true, notas: true,
  }),
} as const

export type GrupoEdicion = keyof typeof GRUPOS

/**
 * Editar el legajo desde el panel lateral.
 *
 * ═══ POR QUÉ TERMINA EN `redirect` Y NO EN `{ ok: true }` ═══
 *
 * El panel tiene que *"cerrar reflejando inmediatamente el cambio ya persistido"*. Un `{ ok: true }`
 * dejaría el panel abierto con un cartel verde y la ficha de atrás sin refrescar; cerrarlo desde el
 * cliente mostraría el valor viejo hasta la próxima navegación. `revalidatePath` + `redirect` a la
 * ficha SIN `?editar` hace las dos cosas en el orden correcto: primero el dato, después la pantalla.
 *
 * Y si la base rechaza NO hay redirect: el panel queda abierto, con lo tipeado intacto y el error a
 * la vista. Es la diferencia entre cerrar porque guardó y cerrar porque se mandó.
 */
export async function editarPersona(
  personaId: string, grupo: GrupoEdicion, form: FormData,
): Promise<Resultado> {
  const parsed = GRUPOS[grupo].safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const fila = aFila(parsed.data as z.infer<typeof personaSchema>)
  const soloDelGrupo: Record<string, unknown> = Object.fromEntries(
    Object.entries(fila).filter(([clave]) => clave in parsed.data),
  )
  // CARGAR UNA FECHA DE EGRESO ES DAR DE BAJA. El CHECK de la base no admite una fecha de egreso en
  // alguien que figura en la empresa, y sin esto el formulario devolvía el texto crudo de Postgres.
  // Borrarla NO reincorpora: para eso está el botón, que es una decisión, no un campo que se vacía.
  if (soloDelGrupo.fecha_egreso) soloDelGrupo.en_la_empresa = false

  const supabase = await createClient()
  const { error } = await supabase.from('personas').update(soloDelGrupo).eq('id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  revalidatePath(`/administracion/personas/${personaId}`)
  redirect(`/administracion/personas/${personaId}`)
}

/**
 * Dar de baja del plantel.
 *
 * SON DOS COSAS Y SE ESCRIBEN LAS DOS: `en_la_empresa` dice que ya no está —y es lo que la saca del
 * selector de asignación de las ocho obras— y `fecha_egreso` dice desde cuándo. Sin fecha se da de
 * baja igual: 15 de los legajos del data room se fueron sin baja documentada, y el día que se pulsa
 * el botón sin saber la fecha, poner la de hoy inventaría el dato en lugar de dejarlo faltando.
 *
 * NO CIERRA LAS ASIGNACIONES NI BORRA LAS HORAS. Las horas que trabajó son un costo de obra real y
 * su asignación es historia: lo que cambia es que deja de ofrecerse para asignar.
 */
export async function darDeBaja(personaId: string, fechaEgreso?: string | null): Promise<Resultado> {
  const supabase = await createClient()
  const valor = fechaEgreso?.trim() ? fechaEgreso.trim() : null
  const { error } = await supabase
    .from('personas').update({ en_la_empresa: false, fecha_egreso: valor }).eq('id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  revalidatePath(`/administracion/personas/${personaId}`)
  return { ok: true }
}

/** Reincorporar: vuelve al plantel y se borra la fecha de egreso. Las dos juntas, porque el CHECK
 *  de la base no admite una fecha de egreso en alguien que está en la empresa —que es justamente lo
 *  que impide que las dos columnas se contradigan—. La historia de asignaciones queda intacta. */
export async function reincorporar(personaId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('personas').update({ en_la_empresa: true, fecha_egreso: null }).eq('id', personaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/administracion/personas')
  revalidatePath(`/administracion/personas/${personaId}`)
  return { ok: true }
}
