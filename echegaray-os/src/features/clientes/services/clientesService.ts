// CLIENTES — el acceso a datos. Cero SQL nuevo y cero dato fabricado.
//
// Todo lo económico sale de `cliente_panel`, que suma lo que `obra_panel` ya calcula. Los documentos
// se resuelven contra `drive_index` con el mismo criterio que los de la obra: el vínculo y los
// metadatos van por separado, porque el índice de Drive se rehace entero cada 4 horas y un archivo
// puede desaparecer de él sin que el vínculo deje de valer. En ese caso se publica el vínculo con el
// nombre en null —que es la verdad— en lugar de perder la fila en un `inner join`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ObraPanel, ServiceResult } from '@/features/obras/types'
import type {
  ClientePanel, Contacto, DocumentoCliente, FuentesActividad, LineaDeTiempo, NotaCliente, Responsable,
} from '../types'
import { avisoDeNotasPendiente, faltaLaTablaDeNotas } from './notaPendiente'
import { construirLineaDeTiempo } from './timeline'

/**
 * `select *` sobre una vista que todavía no tenga los campos de la relación NO FALLA: simplemente no
 * trae la clave, y `undefined` colado en un tipo que promete `string | null` hace que la pantalla
 * decida por comparación contra null y muestre cualquier cosa. Se normaliza acá, una vez, en el
 * borde: adentro del módulo el contrato se cumple, venga la vista vieja o la nueva.
 */
function normalizar(row: Record<string, unknown>): ClientePanel {
  const t = (k: string) => (row[k] == null ? null : String(row[k]))
  return {
    ...(row as unknown as ClientePanel),
    direccion: t('direccion'),
    telefono: t('telefono'),
    email: t('email'),
    responsable_id: t('responsable_id'),
    responsable_nombre: t('responsable_nombre'),
    razon_social: t('razon_social'),
  }
}

/**
 * La cartera COMPLETA: activos y archivados, en una sola lectura.
 *
 * NO filtra acá a propósito: el filtro y el conteo de archivados son la misma decisión y salen de la
 * misma lectura. Quien pinta la lista llama a `separarArchivados` (`./cartera`), que es puro y está
 * probado en `orquestador/lib/cliente-cartera.test.mjs`.
 */
export async function getClientes(supabase: SupabaseClient): Promise<ServiceResult<ClientePanel[]>> {
  const { data, error } = await supabase
    .from('cliente_panel')
    .select('*')
    .order('n_obras_activas', { ascending: false })
    .order('nombre_comercial', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []).map((r) => normalizar(r as Record<string, unknown>)), error: null }
}

export async function getCliente(supabase: SupabaseClient, slug: string): Promise<ServiceResult<ClientePanel>> {
  const { data, error } = await supabase.from('cliente_panel').select('*').eq('slug', slug).maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: `No existe el cliente "${slug}"` }
  return { data: normalizar(data as Record<string, unknown>), error: null }
}

/** Las obras del cliente. Salen de `obra_panel`: el mismo costo y el mismo avance que /obras. */
export async function getObrasDelCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<ObraPanel[]>> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as ObraPanel[], error: null }
}

export async function getContactos(supabase: SupabaseClient, clienteId: string): Promise<ServiceResult<Contacto[]>> {
  const { data, error } = await supabase
    .from('cliente_contacto')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Contacto[], error: null }
}

/**
 * Las personas del OS que pueden quedar como responsable interno de un cliente.
 *
 * Sale de `perfiles`, que es la misma tabla que decide el rol de quien entra: un texto libre haría
 * que «Rodrigo», «R. Echegaray» y «rodri» fueran tres responsables distintos y que la pregunta
 * «¿de quién es este cliente?» dejara de tener respuesta.
 */
export async function getResponsables(supabase: SupabaseClient): Promise<ServiceResult<Responsable[]>> {
  const { data, error } = await supabase.from('perfiles').select('id, nombre, rol').order('nombre')
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Responsable[], error: null }
}

export async function getDocumentosCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<DocumentoCliente[]>> {
  const { data: vinculos, error } = await supabase
    .from('cliente_documento')
    .select('drive_file_id, rol, origen, creado_en')
    .eq('cliente_id', clienteId)
  if (error) return { data: null, error: error.message }
  const ids = (vinculos ?? []).map((v) => v.drive_file_id as string)
  if (!ids.length) return { data: [], error: null }

  const { data: archivos } = await supabase
    .from('drive_index')
    .select('drive_file_id, name, path, mime_type, modified_time')
    .in('drive_file_id', ids)
  const porId = new Map((archivos ?? []).map((a) => [a.drive_file_id as string, a]))

  const docs: DocumentoCliente[] = (vinculos ?? []).map((v) => {
    const a = porId.get(v.drive_file_id as string)
    return {
      drive_file_id: v.drive_file_id as string,
      rol: (v.rol as string) ?? null,
      origen: (v.origen as 'manual' | 'path_inferido') ?? 'manual',
      creado_en: (v.creado_en as string) ?? null,
      name: (a?.name as string) ?? null,
      path: (a?.path as string) ?? null,
      mime_type: (a?.mime_type as string) ?? null,
      modified_time: (a?.modified_time as string) ?? null,
    }
  })
  // Lo más reciente arriba: en una carpeta de 93 archivos, el orden alfabético no ayuda a nadie.
  docs.sort((a, b) => String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
  return { data: docs, error: null }
}

/**
 * LA ACTIVIDAD — se LEE de donde ya está, no se registra en ninguna tabla nueva.
 *
 * Las cinco lecturas van en paralelo y ninguna calcula nada: el orden, el descarte de lo que no
 * tiene fecha y el texto de cada evento los decide `construirLineaDeTiempo`, que es puro y está
 * probado en `orquestador/lib/cliente-actividad.test.mjs`.
 *
 * LAS FECHAS DEL CLIENTE SE LEEN DE `clientes`, NO DE `cliente_panel`: la vista no las publica, y
 * agregarlas ahí sería sumar una migración a una solapa que no necesita ninguna — todo lo que
 * Actividad muestra ya estaba guardado antes de este trabajo.
 *
 * LO QUE ESTA LECTURA PUEDE NO VER: `certificados` sólo es legible por administración y dirección
 * (`certificados_select` → `es_administracion()`). Un jefe de obra ve la ficha sin los eventos
 * contractuales. No es un error de esta función: es la RLS haciendo su trabajo, y la pantalla lo
 * dice en vez de presentar una historia incompleta como si fuera toda.
 */
/**
 * LAS NOTAS MANUALES. Es la única lectura de este módulo que puede fallar por una migración que
 * todavía no está aplicada, y por eso devuelve el aviso en vez de tirar la ficha entera abajo.
 *
 * `{ notas: [], aviso: '…' }` y `{ notas: [], aviso: null }` son dos estados DISTINTOS y por eso
 * viajan separados: el primero es «no las pude leer», el segundo es «no hay ninguna». Colapsarlos
 * en una lista vacía haría que una base sin la tabla se viera idéntica a un cliente sin notas.
 *
 * El nombre del autor NO está en `cliente_nota`: se resuelve contra `perfiles`, que es la misma
 * tabla que decide el rol de quien entra. Si el perfil ya no está, la nota queda sin firma —que es
 * la verdad— en lugar de perderse.
 */
export async function getNotasCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<{ notas: NotaCliente[]; aviso: string | null }> {
  const { data, error } = await supabase
    .from('cliente_nota')
    .select('id, texto, autor_id, creado_en')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
  if (error) return { notas: [], aviso: faltaLaTablaDeNotas(error) ? avisoDeNotasPendiente() : error.message }

  const autores = [...new Set((data ?? []).map((n) => n.autor_id as string).filter(Boolean))]
  const nombres = new Map<string, string>()
  if (autores.length) {
    const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', autores)
    for (const p of perfiles ?? []) nombres.set(p.id as string, p.nombre as string)
  }

  const notas: NotaCliente[] = (data ?? []).map((n) => ({
    id: n.id as string,
    texto: n.texto as string,
    autor_id: (n.autor_id as string) ?? null,
    autor_nombre: nombres.get(n.autor_id as string) ?? null,
    creado_en: (n.creado_en as string) ?? null,
  }))
  return { notas, aviso: null }
}

export async function getActividadCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<LineaDeTiempo>> {
  const [ficha, obras, contactos, documentos, notas] = await Promise.all([
    supabase.from('clientes').select('nombre_comercial, created_at, updated_at').eq('id', clienteId).maybeSingle(),
    supabase.from('obra_canonica')
      .select('id, nombre, created_at, fecha_inicio_real, fecha_fin_real')
      .eq('cliente_id', clienteId),
    supabase.from('cliente_contacto').select('id, nombre, rol, creado_en').eq('cliente_id', clienteId),
    supabase.from('cliente_documento').select('drive_file_id, rol, origen, creado_en').eq('cliente_id', clienteId),
    getNotasCliente(supabase, clienteId),
  ])
  if (ficha.error) return { data: null, error: ficha.error.message }
  if (!ficha.data) return { data: null, error: 'No pude leer la ficha del cliente' }

  const obrasDelCliente = (obras.data ?? []) as Record<string, unknown>[]
  const certificados = await certificadosDe(supabase, obrasDelCliente)

  // El nombre del archivo no vive en `cliente_documento`: se resuelve contra el índice de Drive, y
  // si el índice no lo conoce el evento muestra el id. Feo y cierto.
  const nombres = await nombresDeDrive(supabase, (documentos.data ?? []).map((d) => d.drive_file_id as string))

  const fuentes: FuentesActividad = {
    cliente: {
      nombre: ficha.data.nombre_comercial as string,
      creado_en: (ficha.data.created_at as string) ?? null,
      actualizado_en: (ficha.data.updated_at as string) ?? null,
    },
    contactos: (contactos.data ?? []).map((c) => ({
      id: c.id as string, nombre: c.nombre as string,
      rol: (c.rol as string) ?? null, creado_en: (c.creado_en as string) ?? null,
    })),
    obras: obrasDelCliente.map((o) => ({
      obra_id: o.id as string, nombre: o.nombre as string,
      creada_en: (o.created_at as string) ?? null,
      fecha_inicio_real: (o.fecha_inicio_real as string) ?? null,
      fecha_fin_real: (o.fecha_fin_real as string) ?? null,
    })),
    documentos: (documentos.data ?? []).map((d) => ({
      drive_file_id: d.drive_file_id as string,
      name: nombres.get(d.drive_file_id as string) ?? null,
      rol: (d.rol as string) ?? null,
      origen: (d.origen as 'manual' | 'path_inferido') ?? 'manual',
      creado_en: (d.creado_en as string) ?? null,
    })),
    notas: notas.notas,
    notasNoDisponibles: notas.aviso,
    certificados,
  }
  return { data: construirLineaDeTiempo(fuentes), error: null }
}

/** Los certificados de las obras del cliente. Sin obras no hay consulta que hacer. */
async function certificadosDe(
  supabase: SupabaseClient,
  obras: Record<string, unknown>[],
): Promise<FuentesActividad['certificados']> {
  if (!obras.length) return []
  const nombrePorId = new Map(obras.map((o) => [o.id as string, o.nombre as string]))
  const { data } = await supabase
    .from('certificados')
    .select('id, numero, obra_canonica_id, fecha_certificacion, monto_certificado, fecha_facturacion, monto_facturado, fecha_cobranza, monto_cobrado')
    .in('obra_canonica_id', [...nombrePorId.keys()])
  return (data ?? []).map((c) => ({
    id: c.id as string,
    numero: (c.numero as string) ?? null,
    obra_id: (c.obra_canonica_id as string) ?? null,
    obra_nombre: nombrePorId.get(c.obra_canonica_id as string) ?? 'obra sin identificar',
    fecha_certificacion: (c.fecha_certificacion as string) ?? null,
    monto_certificado: (c.monto_certificado as number) ?? null,
    fecha_facturacion: (c.fecha_facturacion as string) ?? null,
    monto_facturado: (c.monto_facturado as number) ?? null,
    fecha_cobranza: (c.fecha_cobranza as string) ?? null,
    monto_cobrado: (c.monto_cobrado as number) ?? null,
  }))
}

async function nombresDeDrive(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const { data } = await supabase.from('drive_index').select('drive_file_id, name').in('drive_file_id', ids)
  return new Map((data ?? []).map((a) => [a.drive_file_id as string, a.name as string]))
}
