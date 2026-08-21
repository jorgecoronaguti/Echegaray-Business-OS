// 10 · OBRA SUBCONTRATISTAS — la lectura de los paquetes de una obra.
//
// ═══ NINGUNA CONSULTA ACÁ USA `select('*')`, Y NO ES ESTILO ═══
//
// La migración 3400 revocó el GRANT de columna de `subcontrato.precio_contratado` y
// `subcontrato_aporte.monto` para `authenticated`. Con la columna revocada, un `select *` no
// devuelve la columna vacía: **falla la consulta entera**, para todos los roles, Dirección incluida.
// Cada `select` de este archivo nombra sus columnas, y la plata llega por otro camino.
//
// ═══ POR DÓNDE ENTRA LA PLATA ═══
//
//   totales del paquete   `subcontrato_costo`            (ya existe; porteros ve_obra + ve_economia)
//   monto de cada aporte  `subcontrato_aporte_detalle`   (llega en 20260821T5000)
//
// Las dos son vistas con el portero adentro: quien no ve economía no recibe filas, así que no hace
// falta —ni alcanza— con esconder el número en la pantalla. Igual se pasa `economia` para no pedir
// lo que ya se sabe que va a volver vacío, y para que el panel diga «sin permiso» en vez de dibujar
// un hueco que se lee como un cero.
//
// ═══ LO QUE FALTA EN LA BASE SE DICE COMO LO QUE ES ═══
//
// Los objetos de la 5000 los aplica el coordinador. Hasta entonces PostgREST contesta «no existe» y
// esta pantalla lo traduce: un paquete cuyos papeles el sistema todavía no sabe leer NO se puede
// dibujar igual que un paquete sin ART.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'
import {
  avanceDelPaquete, estadoDelPaquete, faltaEnLaBase, mensajeDeObjetoFaltante, plazoDelPaquete,
  revisarDocumentacion,
  type Avance, type DocumentoPaquete, type EstadoLegible, type EstadoSubcontrato, type Plazo,
  type RevisionDocumental, type VinculoActividad,
} from './subcontratosReglas.ts'

const COLS_PAQUETE = 'id, obra_id, proveedor_id, proveedor_texto, nombre, alcance, cantidad, unidad,'
  + ' moneda, fecha_inicio_plan, fecha_fin_plan, fecha_inicio_real, fecha_fin_real, estado,'
  + ' documentacion_ok, notas, creado_en'
const COLS_ALCANCE = 'id, subcontrato_id, actividad_id, cantidad, unidad, ayuda_de_gremio'
const COLS_ACTIVIDAD = 'id, nombre, seccion, unidad, cantidad_objetivo, hh_plan, dias_plan, avance_pct'
const COLS_APORTE = 'id, subcontrato_id, tipo, descripcion, cantidad, unidad, fecha, registros_hh_id'
const COLS_PERSONA = 'id, subcontrato_id, nombre_completo, dni, cuil, categoria, art_vigente_hasta,'
  + ' alta_afip, activo'
const COLS_DOCUMENTO = 'id, subcontrato_id, tipo, descripcion, numero, fecha_emision, vence_el,'
  + ' archivo_url, drive_file_id'

type Fila = Record<string, unknown>
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

export interface AportePaquete {
  id: string
  tipo: string
  descripcion: string
  cantidad: number | null
  unidad: string | null
  fecha: string | null
  /** `null` sin permiso económico o sin la vista de detalle aplicada — no es «sin monto». */
  monto: number | null
  /** Si el monto NO se pudo pedir. Distinto de un aporte cargado sin monto. */
  montoOculto: boolean
}

export interface PersonaExternaFila {
  id: string
  nombre_completo: string
  dni: string | null
  categoria: string | null
  art_vigente_hasta: string | null
  alta_afip: boolean
  activo: boolean
}

export interface Paquete {
  id: string
  nombre: string
  proveedor: string | null
  /** El rubro sale de la SECCIÓN de la actividad que cubre: `proveedores` no tiene rubro, y
   *  escribirlo a mano en el paquete crearía un segundo catálogo de rubros. */
  rubro: string | null
  alcance: string | null
  cantidad: number | null
  unidad: string | null
  estado: EstadoSubcontrato
  fecha_inicio_plan: string | null
  fecha_fin_plan: string | null
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  documentacion_ok: boolean
  notas: string | null
  vinculos: VinculoActividad[]
  documentos: DocumentoPaquete[]
  aportes: AportePaquete[]
  personas: PersonaExternaFila[]
  /** HH nuestras declaradas como ayuda de gremio. Ver el comentario de `hhDeApoyo`. */
  hh_apoyo: number
  personas_externas: number
  externas_sin_art: number
  precio_contratado: number | null
  aportes_total: number | null
  costo_real: number | null
  revision: RevisionDocumental
  estadoLegible: EstadoLegible
  avance: Avance
  plazo: Plazo
}

export interface ActividadElegible {
  id: string
  nombre: string
  seccion: string | null
  unidad: string | null
  cantidad_objetivo: number | null
}

export interface Subcontratos {
  paquetes: Paquete[]
  actividades: ActividadElegible[]
  economia: boolean
  /** Lo que no se pudo leer, con el motivo. Se dibuja ARRIBA: sin esto, una consulta caída se ve
   *  igual que una obra sin paquetes — el error dibujado como un vacío. */
  avisos: string[]
}

/**
 * LAS HH DE APOYO SE SUMAN DE LOS APORTES, NO DE LA VISTA.
 *
 * `subcontrato_costo.hh_propias_de_apoyo` suma sólo las que están atadas a una fila de
 * `registros_hh`, y además vive detrás del portero económico — o sea que el jefe de obra, que es
 * quien manda la ayuda de gremio, no la vería. Acá se suman las HH declaradas en el aporte, que es
 * lo que existe hoy en el 100% de los casos.
 *
 * LIMITACIÓN DECLARADA: mientras las dos definiciones convivan pueden dar distinto. Unificarlas es
 * de la base, no de esta pantalla.
 */
export const hhDeApoyo = (aportes: { tipo: string; cantidad: number | null }[]): number =>
  aportes.filter((a) => a.tipo === 'hh_propia').reduce((t, a) => t + Number(a.cantidad ?? 0), 0)

/** Lo que la pantalla entera necesita, en una tanda. Un paquete por obra son pocos: una consulta
 *  por paquete al abrir el panel haría pegajoso justo lo que más se toca. */
export async function getSubcontratos(
  supabase: SupabaseClient,
  obraId: string,
  economia: boolean,
  hoyISO: string,
): Promise<ServiceResult<Subcontratos>> {
  const avisos: string[] = []

  const paq = await supabase.from('subcontrato').select(COLS_PAQUETE)
    .eq('obra_id', obraId).order('creado_en', { ascending: true })
  if (paq.error) return { data: null, error: paq.error.message }
  const filas = (paq.data ?? []) as unknown as Fila[]
  const ids = filas.map((f) => String(f.id))

  const acts = await supabase.from('obra_actividad_control').select(COLS_ACTIVIDAD).eq('obra_id', obraId)
  if (acts.error) avisos.push(`No pude leer las actividades de la obra: ${acts.error.message}`)
  const actividades = ((acts.data ?? []) as Fila[]).map((a): ActividadElegible & Fila => ({
    ...a,
    id: String(a.id),
    nombre: String(a.nombre),
    seccion: s(a.seccion),
    unidad: s(a.unidad),
    cantidad_objetivo: n(a.cantidad_objetivo),
  }))
  const porActividad = new Map(actividades.map((a) => [a.id, a]))

  if (ids.length === 0) {
    return {
      data: { paquetes: [], actividades: elegibles(actividades), economia, avisos },
      error: null,
    }
  }

  const [alc, apo, per, doc, cos, det, prov] = await Promise.all([
    supabase.from('subcontrato_alcance').select(COLS_ALCANCE).in('subcontrato_id', ids),
    supabase.from('subcontrato_aporte').select(COLS_APORTE).in('subcontrato_id', ids),
    supabase.from('persona_externa').select(COLS_PERSONA).in('subcontrato_id', ids),
    supabase.from('subcontrato_documento').select(COLS_DOCUMENTO).in('subcontrato_id', ids),
    // La plata: sólo se pide cuando el rol la puede ver. La vista igual filtra sola.
    economia
      ? supabase.from('subcontrato_costo')
        .select('subcontrato_id, precio_contratado, aportes, costo_real, proveedor').eq('obra_id', obraId)
      : Promise.resolve({ data: [], error: null }),
    economia
      ? supabase.from('subcontrato_aporte_detalle').select('id, monto').in('subcontrato_id', ids)
      : Promise.resolve({ data: [], error: null }),
    proveedoresDe(supabase, filas),
  ])

  if (alc.error) avisos.push(`No pude leer qué actividad cubre cada paquete: ${alc.error.message}`)
  if (apo.error) avisos.push(`No pude leer los aportes de Echegaray: ${apo.error.message}`)
  if (per.error) avisos.push(`No pude leer el personal de los subcontratistas: ${per.error.message}`)
  if (doc.error) {
    avisos.push(faltaEnLaBase(doc.error.message)
      ? mensajeDeObjetoFaltante('El registro de documentación del subcontratista', doc.error.message)
      : `No pude leer la documentación: ${doc.error.message}`)
  }
  if (cos.error) avisos.push(`No pude leer el costo de los paquetes: ${cos.error.message}`)
  if (det.error && !faltaEnLaBase(det.error.message)) {
    avisos.push(`No pude leer el monto de cada aporte: ${det.error.message}`)
  }
  // LA DOCUMENTACIÓN QUE NO SE PUDO LEER NO ES DOCUMENTACIÓN QUE FALTA. Con la tabla ausente, el
  // bloqueo de inicio se apaga a propósito: pintar «ART sin cargar» sobre una lectura fallida
  // sería una afirmación de seguridad sacada de un error de base.
  const docsLegibles = !doc.error
  const montosLegibles = economia && !det.error

  const porPaquete = agrupar((alc.data ?? []) as Fila[], 'subcontrato_id')
  const aportesPorPaquete = agrupar((apo.data ?? []) as unknown as Fila[], 'subcontrato_id')
  const personasPorPaquete = agrupar((per.data ?? []) as unknown as Fila[], 'subcontrato_id')
  const docsPorPaquete = agrupar((doc.data ?? []) as unknown as Fila[], 'subcontrato_id')
  const costoPorPaquete = new Map(((cos.data ?? []) as Fila[]).map((c) => [String(c.subcontrato_id), c]))
  const montoPorAporte = new Map(((det.data ?? []) as Fila[]).map((d) => [String(d.id), n(d.monto)]))

  const paquetes = filas.map((f): Paquete => {
    const id = String(f.id)
    const vinculos = (porPaquete.get(id) ?? []).map((v): VinculoActividad => {
      const a = porActividad.get(String(v.actividad_id))
      return {
        actividad_id: String(v.actividad_id),
        actividad: a?.nombre ?? 'actividad fuera de esta obra',
        seccion: a?.seccion ?? null,
        cantidad: n(v.cantidad),
        unidad: s(v.unidad) ?? a?.unidad ?? null,
        ayuda_de_gremio: Boolean(v.ayuda_de_gremio),
        cantidad_objetivo: a?.cantidad_objetivo ?? null,
        hh_plan: a ? n(a.hh_plan) : null,
        dias_plan: a ? n(a.dias_plan) : null,
        pct: a ? n(a.avance_pct) : null,
      }
    })
    const aportes = (aportesPorPaquete.get(id) ?? []).map((a): AportePaquete => ({
      id: String(a.id),
      tipo: String(a.tipo),
      descripcion: String(a.descripcion ?? ''),
      cantidad: n(a.cantidad),
      unidad: s(a.unidad),
      fecha: s(a.fecha),
      monto: montosLegibles ? (montoPorAporte.get(String(a.id)) ?? null) : null,
      montoOculto: !montosLegibles,
    }))
    const personas = (personasPorPaquete.get(id) ?? []).map((p): PersonaExternaFila => ({
      id: String(p.id),
      nombre_completo: String(p.nombre_completo),
      dni: s(p.dni),
      categoria: s(p.categoria),
      art_vigente_hasta: s(p.art_vigente_hasta),
      alta_afip: Boolean(p.alta_afip),
      activo: Boolean(p.activo),
    }))
    const documentos = (docsPorPaquete.get(id) ?? []).map((d): DocumentoPaquete => ({
      id: String(d.id),
      tipo: String(d.tipo) as DocumentoPaquete['tipo'],
      descripcion: s(d.descripcion),
      fecha_emision: s(d.fecha_emision),
      vence_el: s(d.vence_el),
    }))
    const estado = String(f.estado) as EstadoSubcontrato
    // Sin poder leer los papeles no se revisa nada: la revisión vacía no bloquea.
    const revision = docsLegibles
      ? revisarDocumentacion(documentos, hoyISO)
      : { filas: [], bloqueos: [], avisos: [] }
    const costo = costoPorPaquete.get(id)
    const activas = personas.filter((p) => p.activo)

    return {
      id,
      nombre: String(f.nombre),
      proveedor: prov.get(String(f.proveedor_id ?? '')) ?? s(f.proveedor_texto),
      rubro: vinculos.find((v) => v.seccion)?.seccion ?? null,
      alcance: s(f.alcance),
      cantidad: n(f.cantidad),
      unidad: s(f.unidad),
      estado,
      fecha_inicio_plan: s(f.fecha_inicio_plan),
      fecha_fin_plan: s(f.fecha_fin_plan),
      fecha_inicio_real: s(f.fecha_inicio_real),
      fecha_fin_real: s(f.fecha_fin_real),
      documentacion_ok: Boolean(f.documentacion_ok),
      notas: s(f.notas),
      vinculos,
      documentos,
      aportes,
      personas,
      hh_apoyo: hhDeApoyo(aportes),
      personas_externas: activas.length,
      externas_sin_art: activas.filter(
        (p) => !p.art_vigente_hasta || p.art_vigente_hasta < hoyISO,
      ).length,
      precio_contratado: costo ? n(costo.precio_contratado) : null,
      aportes_total: costo ? n(costo.aportes) : null,
      costo_real: costo ? n(costo.costo_real) : null,
      revision,
      estadoLegible: estadoDelPaquete(estado, revision),
      avance: avanceDelPaquete(estado, vinculos),
      plazo: plazoDelPaquete(
        {
          fecha_inicio_plan: s(f.fecha_inicio_plan),
          fecha_fin_plan: s(f.fecha_fin_plan),
          fecha_fin_real: s(f.fecha_fin_real),
        },
        hoyISO,
      ),
    }
  })

  return { data: { paquetes, actividades: elegibles(actividades), economia, avisos }, error: null }
}

const elegibles = (acts: (ActividadElegible & Fila)[]): ActividadElegible[] =>
  acts.map((a) => ({
    id: a.id, nombre: a.nombre, seccion: a.seccion, unidad: a.unidad,
    cantidad_objetivo: a.cantidad_objetivo,
  })).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'))

function agrupar(filas: Fila[], por: string): Map<string, Fila[]> {
  const m = new Map<string, Fila[]>()
  for (const f of filas) {
    const k = String(f[por])
    const previas = m.get(k) ?? []
    previas.push(f)
    m.set(k, previas)
  }
  return m
}

/** La razón social del maestro. Si no se puede leer —el jefe de obra no siempre ve proveedores—,
 *  el paquete cae en `proveedor_texto`, que es para lo que existe esa columna. */
async function proveedoresDe(supabase: SupabaseClient, filas: Fila[]): Promise<Map<string, string>> {
  const ids = [...new Set(filas.map((f) => s(f.proveedor_id)).filter((x): x is string => !!x))]
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('proveedores').select('id, nombre, razon_social').in('id', ids)
  if (error) return new Map()
  return new Map(((data ?? []) as Fila[]).map((p) => [
    String(p.id), s(p.razon_social) ?? String(p.nombre ?? ''),
  ]))
}
