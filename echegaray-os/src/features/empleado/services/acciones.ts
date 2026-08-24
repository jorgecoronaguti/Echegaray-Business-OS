'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  DOC_MAX_BYTES, DOC_TIPOS, correccionInputSchema, incidenciaInputSchema, marcaInputSchema,
  problemaInputSchema,
} from '../types'
import { tipoDeMotivo } from './problemas'
import { revisarPedido } from './correccion'

// LAS CUATRO ESCRITURAS DEL PERFIL EMPLEADO.
//
// ═══ NINGUNA DE ELLAS ES LA CERRADURA ═══
//
// Quien decide de verdad es Postgres: `asistencia_marca_insert` exige que la fila sea a nombre de
// `mi_persona_id()`, `documento_presentacion_insert` exige además que nazca `en_revision`, y
// `obra_restriccion_insert` exige `ve_obra()`. Aunque alguien llame estas acciones a mano, o pegue
// directo contra PostgREST, la base rechaza lo que no le corresponde.
//
// Lo que se hace acá es lo otro: no ofrecer un botón que va a rebotar, y traducir el `42501` de
// Postgres a una frase que le sirva a alguien parado en una obra.

export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

/** `YYYY-MM-DD` local. La fecha de una marca es un día calendario de obra, no un instante UTC:
 *  con `toISOString()` una entrada a las 21:30 de un martes se guardaría como miércoles. */
export async function hoyISO(d = new Date()): Promise<string> {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SIN_PERSONA =
  'Tu cuenta todavía no está vinculada a tu legajo. Lo hace Administración desde Usuarios; hasta '
  + 'entonces el OS no sabe a nombre de quién registrar.'

async function miPersona(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; personaId: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, personaId: null }
  const { data } = await supabase.from('perfiles').select('persona_id').eq('id', user.id).maybeSingle()
  return { supabase, personaId: ((data as { persona_id: string | null } | null)?.persona_id) ?? null }
}

/**
 * REGISTRAR ENTRADA O SALIDA.
 *
 * EL TIPO LO DECIDE EL SERVIDOR, mirando el día. Si viniera del formulario, un `salida` mandado a
 * mano cerraría un día que nunca se abrió, y el total de ese día sería un intervalo inventado. La
 * pantalla ofrece una sola acción y el servidor vuelve a comprobar cuál corresponde.
 */
export async function registrarMarca(form: FormData): Promise<Resultado> {
  const parsed = marcaInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { supabase, personaId } = await miPersona()
  if (!personaId) return { ok: false, error: SIN_PERSONA }

  const fecha = await hoyISO()
  const { data: dia, error: eLectura } = await supabase
    .from('mi_asistencia_dia').select('estado').eq('fecha', fecha).maybeSingle()
  if (eLectura) return { ok: false, error: eLectura.message }

  const estado = (dia as { estado: string } | null)?.estado ?? 'sin_registrar'
  if (estado === 'completo') {
    return { ok: false, error: 'Hoy ya registraste entrada y salida. Si hay que corregir algo, lo corrige Administración.' }
  }
  const tipo = estado === 'sin_registrar' ? 'entrada' : 'salida'

  // EL PUNTO SÓLO VIAJA CON LA ENTRADA. Es lo que se pidió —«dónde dio el inicio del día»— y es la
  // única de las dos marcas donde la ubicación decide algo. Guardar también la de la salida sería
  // duplicar un dato personal sin que nadie lo mire.
  const punto = tipo === 'entrada' ? puntoDe(parsed.data) : {}
  const { error } = await supabase.from('asistencia_marca').insert({
    persona_id: personaId, fecha, tipo, obra_id: parsed.data.obra_id, origen: 'empleado_web',
    ...punto,
  })
  if (error) return { ok: false, error: traducir(error.message) }

  revalidatePath('/hoy'); revalidatePath('/mi-informacion/asistencia')
  return { ok: true, mensaje: tipo === 'entrada' ? 'Entrada registrada.' : 'Salida registrada.' }
}

/** UNA INCIDENCIA NO CIERRA NI ABRE EL DÍA: lo anota. Llegó tarde, se fue al médico, se cortó la
 *  luz. Por eso no entra en el único de entrada/salida: puede haber varias en un día. */
export async function registrarIncidencia(form: FormData): Promise<Resultado> {
  const parsed = incidenciaInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { supabase, personaId } = await miPersona()
  if (!personaId) return { ok: false, error: SIN_PERSONA }

  const { error } = await supabase.from('asistencia_marca').insert({
    persona_id: personaId, fecha: await hoyISO(), tipo: 'incidencia',
    motivo: parsed.data.motivo, obra_id: parsed.data.obra_id, origen: 'empleado_web',
  })
  if (error) return { ok: false, error: traducir(error.message) }

  revalidatePath('/hoy'); revalidatePath('/mi-informacion/asistencia')
  return { ok: true, mensaje: 'Anotada. La ve Administración cuando arma la quincena.' }
}

/**
 * PEDIR LA CORRECCIÓN DE UN DÍA SIN SALIDA (M05).
 *
 * ═══ ESTO NO ESCRIBE LA ASISTENCIA ═══
 *
 * Escribe un PEDIDO. La marca la escribe la aprobación de Administración, adentro de
 * `aprobar_correccion_asistencia()`, y ésa es toda la diferencia: si esta acción tocara
 * `asistencia_marca`, la hora de salida pasaría a ser lo que cada uno declara de sí mismo. La base
 * tampoco lo permitiría —`asistencia_marca_update` es de Administración sola— pero la razón por la
 * que no se intenta es la de arriba, no la policy.
 *
 * LA ENTRADA DEL DÍA SE LEE DEL SERVIDOR, no del formulario. `revisarPedido` necesita saber a qué
 * hora entró esa persona ese día para rechazar una salida anterior; si ese dato viajara por el
 * formulario, mandarlo vacío a mano desactivaría la regla.
 */
export async function pedirCorreccionAsistencia(form: FormData): Promise<Resultado> {
  const parsed = correccionInputSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { supabase, personaId } = await miPersona()
  if (!personaId) return { ok: false, error: SIN_PERSONA }

  const { data: dia, error: eLectura } = await supabase
    .from('mi_asistencia_dia').select('*').eq('fecha', parsed.data.fecha).maybeSingle()
  if (eLectura) return { ok: false, error: traducir(eLectura.message) }

  const revision = revisarPedido({
    ...parsed.data,
    hoy: await hoyISO(),
    dia: dia as Parameters<typeof revisarPedido>[0]['dia'],
  })
  if (!revision.ok) return { ok: false, error: revision.error }

  const { error } = await supabase.from('solicitud_correccion_asistencia').insert({
    persona_id: personaId,
    fecha: parsed.data.fecha,
    tipo: 'salida',
    hora_propuesta: parsed.data.hora,
    motivo: parsed.data.motivo,
    estado: 'pendiente',
  })
  if (error) return { ok: false, error: traducirCorreccion(error.message) }

  revalidatePath('/mi-informacion/asistencia'); revalidatePath('/administracion/asistencia')
  return {
    ok: true,
    mensaje: 'Pedido enviado. Lo aprueba Administración: hasta entonces el día sigue sin salida.',
  }
}

/**
 * SUBIR UN DOCUMENTO AL LEGAJO.
 *
 * LO QUE SUBE EL EMPLEADO NO ES EL DOCUMENTO: es su PRESENTACIÓN, y vale cuando Administración la
 * aprueba. Por eso la fila va a `documento_presentacion` y no pisa `documentacion_legajo` — si la
 * foto que sacó el operario escribiera directamente sobre el legajo, el legajo pasaría a contener lo
 * que alguien mandó en vez de lo que alguien validó.
 */
export async function subirDocumento(form: FormData): Promise<Resultado> {
  const archivo = form.get('archivo')
  const documentacionId = String(form.get('documentacion_id') ?? '') || null
  const tipo = String(form.get('tipo_documento') ?? '').trim()
  if (!tipo) return { ok: false, error: 'Falta saber qué documento es.' }
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: 'Adjuntá una foto o un archivo.' }
  // El `accept` del input es una comodidad del navegador, no una cerradura: se valida acá también,
  // y el bucket lo vuelve a validar, que es la capa que no se puede saltear.
  if (!(DOC_TIPOS as readonly string[]).includes(archivo.type)) {
    return { ok: false, error: 'Tiene que ser una foto (JPG, PNG) o un PDF.' }
  }
  if (archivo.size > DOC_MAX_BYTES) {
    return { ok: false, error: `El archivo no puede pesar más de ${Math.round(DOC_MAX_BYTES / 1024 / 1024)} MB.` }
  }

  const { supabase, personaId } = await miPersona()
  if (!personaId) return { ok: false, error: SIN_PERSONA }

  const ext = archivo.type === 'application/pdf' ? 'pdf'
    : archivo.type === 'image/png' ? 'png'
    : archivo.type === 'image/webp' ? 'webp'
    : archivo.type === 'image/heic' ? 'heic' : 'jpg'
  // La carpeta es la persona, y eso es lo que la policy de Storage exige. Un nombre con marca de
  // tiempo evita que dos presentaciones del mismo documento se pisen.
  const ruta = `${personaId}/${tipo}-${Date.now()}.${ext}`

  const { error: subida } = await supabase.storage
    .from('documentos-legajo').upload(ruta, archivo, { contentType: archivo.type, upsert: false })
  if (subida) return { ok: false, error: traducir(subida.message) }

  const { error } = await supabase.from('documento_presentacion').insert({
    persona_id: personaId,
    documentacion_id: documentacionId,
    tipo_documento: tipo,
    archivo_path: ruta,
    archivo_nombre: archivo.name,
    archivo_bytes: archivo.size,
    archivo_tipo: archivo.type,
    estado: 'en_revision',
  })
  // SI LA FILA NO ENTRA, EL ARCHIVO SE BORRA. Un archivo que nadie apunta es basura en el bucket y,
  // peor, la pantalla diría «enviado» sobre algo que Administración no va a ver nunca.
  if (error) {
    await supabase.storage.from('documentos-legajo').remove([ruta])
    return { ok: false, error: traducir(error.message) }
  }

  revalidatePath('/mi-informacion/documentos'); revalidatePath('/hoy')
  return { ok: true, mensaje: 'Enviado. Queda en revisión: no reemplaza al documento hasta que Administración lo apruebe.' }
}

/**
 * REPORTAR UN PROBLEMA — entra como IMPEDIMENTO de la actividad, en la tabla real.
 *
 * No reusa `crearImpedimento` de la obra, y la razón no es la forma: ese alta exige responsable y
 * fecha comprometida, porque de escritorio *«un impedimento sin responsable no se resuelve solo»*.
 * Eso lo decide quien conduce la obra. El que está frente al muro reporta lo que ve; el jefe le pone
 * responsable y fecha. Misma tabla, mismo estado `abierta`, misma pantalla — otra puerta.
 */
export async function reportarProblema(form: FormData): Promise<Resultado> {
  const parsed = problemaInputSchema.safeParse({
    obra_id: form.get('obra_id') ?? '',
    actividad_id: form.get('actividad_id') ?? '',
    descripcion: form.get('descripcion') ?? '',
    frena: form.get('frena') ?? 'no',
    motivo: form.get('motivo') ?? undefined,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()

  let fotoPath: string | null = null
  const foto = form.get('foto')
  if (foto instanceof File && foto.size > 0) {
    if (!foto.type.startsWith('image/')) return { ok: false, error: 'La foto tiene que ser una imagen.' }
    if (foto.size > DOC_MAX_BYTES) return { ok: false, error: 'La foto no puede pesar más de 10 MB.' }
    const ext = foto.type === 'image/png' ? 'png' : foto.type === 'image/webp' ? 'webp' : 'jpg'
    const ruta = `${d.obra_id}/${Date.now()}.${ext}`
    const { error: subida } = await supabase.storage
      .from('impedimentos').upload(ruta, foto, { contentType: foto.type, upsert: false })
    // LA FOTO NO BLOQUEA EL REPORTE. Es opcional por diseño: si falla la subida, se reporta igual y
    // se dice — perder el aviso de que la obra está parada porque no se pudo subir una imagen sería
    // exactamente al revés de lo que esta pantalla existe para hacer.
    if (!subida) fotoPath = ruta
  }

  const { error } = await supabase.from('obra_restriccion').insert({
    obra_id: d.obra_id,
    actividad_id: d.actividad_id,
    // EL MOTIVO ELEGIDO EN M07, TRADUCIDO A LA CLAVE DE LA BASE. Sin motivo sigue entrando
    // `sin_clasificar` —y no `otro`, que AFIRMA que alguien miró las seis y no encajaba en
    // ninguna—. El jefe lo reclasifica al tomarlo.
    tipo: tipoDeMotivo(d.motivo),
    descripcion: d.descripcion,
    frena: d.frena === 'si',
    foto_path: fotoPath,
    estado: 'abierta',
  })
  if (error) return { ok: false, error: traducir(error.message) }

  revalidatePath('/hoy'); revalidatePath('/mi-trabajo'); revalidatePath(`/obras/${d.obra_id}`)
  return {
    ok: true,
    mensaje: fotoPath
      ? 'Reportado. Queda como impedimento de la actividad y lo ve el jefe de obra.'
      : 'Reportado. Queda como impedimento de la actividad y lo ve el jefe de obra.',
  }
}

/** El punto, sólo si está ENTERO. Media coordenada no ubica nada: la base lo rechaza y con razón. */
function puntoDe(d: { lat?: number; lon?: number; precision_m?: number }) {
  if (d.lat == null || d.lon == null) return {}
  return { lat: d.lat, lon: d.lon, precision_m: d.precision_m ?? null }
}

/** El único parcial de la solicitud (una pendiente por día) rebota con «duplicate key», y «Eso ya
 *  estaba registrado» no explica qué hacer. Acá sí: ya pediste, esperá. */
function traducirCorreccion(mensaje: string): string {
  if (/duplicate key/i.test(mensaje)) {
    return 'Ya tenés un pedido pendiente para ese día. Espera a que Administración lo resuelva.'
  }
  if (/relation .* does not exist|schema cache/i.test(mensaje)) {
    return 'Todavía no puedo recibir pedidos de corrección: falta aplicar la migración en la base. '
      + 'Avisale a Administración.'
  }
  return traducir(mensaje)
}

/** El `42501` de Postgres es «permission denied» y no le dice nada a nadie parado en una obra. */
function traducir(mensaje: string): string {
  if (/permission denied|row-level security|violates row-level/i.test(mensaje)) {
    return 'Tu usuario no tiene permiso para esto. Si creés que sí debería, avisale a Administración.'
  }
  if (/duplicate key/i.test(mensaje)) return 'Eso ya estaba registrado.'
  return mensaje
}
