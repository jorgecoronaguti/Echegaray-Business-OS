// LOS COMPROBANTES DE UN PROVEEDOR — la lectura, separada de la aritmética.
//
// ═══ POR QUÉ SON DOS CONSULTAS Y NO UNA ═══
//
// `proveedor_nombre_resuelto` dice qué nombres NORMALIZADOS son de este proveedor; `costos_obra`
// guarda el texto tal como lo tipeó una persona. PostgREST no puede llamar a
// `normalizar_nombre_proveedor()` dentro de un filtro, así que:
//
//   1. se traen los textos crudos (una sola columna, ~870 valores cortos),
//   2. se cruzan con la normalización que la base declara como su espejo,
//   3. se piden las filas completas con `proveedor=in.(…)`.
//
// La alternativa era bajar `costos_obra` entera y filtrar acá: son 19 columnas por 872 filas en
// cada apertura de ficha, y la RLS ya recortó lo que se puede ver, así que el segundo viaje no
// agrega riesgo y sí ahorra el 95% de los bytes. La otra alternativa —una vista nueva en Postgres—
// exige una migración, y este trabajo no abre migraciones.
//
// ═══ LO QUE ESTA LECTURA VE DEPENDE DE QUIÉN MIRA, Y ESO SE DICE EN PANTALLA ═══
//
// `costos_obra_select` filtra por `ve_obra_texto(obra_texto)`: un jefe de obra recibe SOLO los
// comprobantes de sus obras, con importe incluido (es su costo, y el dueño lo autorizó el 19/08).
// El total de la ficha, entonces, no es el mismo número para todos. La ficha lo aclara en vez de
// publicar un total recortado como si fuera el de la empresa.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NombreResuelto, ServiceResult } from '../types'
import {
  armarPaquetes, textosCrudosDe,
  type ComprobanteProveedor, type FilaSubcontrato, type PaqueteDelProveedor,
} from './fichaProveedor'

const COLUMNAS = 'id, fecha, comprobante, tipo, obra_texto, concepto, modalidad, total'

/** Tope de filas de una ficha. Si se alcanza, la pantalla lo dice: «se listan N de M». */
export const TOPE_COMPROBANTES = 500

export interface ComprobantesLeidos {
  filas: ComprobanteProveedor[]
  /** `true` cuando se llegó al tope y hay más comprobantes que los listados. */
  truncado: boolean
}

/** Los nombres del Sheet vinculados a este proveedor. Es la mitad izquierda del cruce. */
export async function getNombresDelProveedor(
  supabase: SupabaseClient,
  proveedorId: string,
): Promise<ServiceResult<NombreResuelto[]>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id')
    .eq('proveedor_id', proveedorId)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as NombreResuelto[], error: null }
}

export async function getComprobantes(
  supabase: SupabaseClient,
  nombresNorm: string[],
): Promise<ServiceResult<ComprobantesLeidos>> {
  if (nombresNorm.length === 0) return { data: { filas: [], truncado: false }, error: null }

  const crudos = await supabase.from('costos_obra').select('proveedor').limit(20000)
  if (crudos.error) return { data: null, error: crudos.error.message }
  const textos = textosCrudosDe(nombresNorm, (crudos.data ?? []).map((f) => f.proveedor as string | null))
  // NINGÚN TEXTO NO ES «TRAER TODO». Un `in.()` vacío en PostgREST no filtra: devolvería los
  // comprobantes de los 116 proveedores del Sheet dentro de la ficha de uno solo.
  if (textos.length === 0) return { data: { filas: [], truncado: false }, error: null }

  const { data, error } = await supabase
    .from('costos_obra')
    .select(COLUMNAS)
    .in('proveedor', textos)
    .order('fecha', { ascending: false, nullsFirst: false })
    .limit(TOPE_COMPROBANTES + 1)
  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as ComprobanteProveedor[]
  const truncado = filas.length > TOPE_COMPROBANTES
  return { data: { filas: truncado ? filas.slice(0, TOPE_COMPROBANTES) : filas, truncado }, error: null }
}

// ═══ LOS PAQUETES CONTRATADOS (canónico 23) ═══
//
// El canónico dibuja «Paquetes contratados» con obra, trabajo, estado y contrato. Hasta el 21/08 la
// ficha declaraba que eso «no existe como tabla»: DEJÓ DE SER CIERTO ese mismo día, cuando la
// migración `20260821T2500_el_subcontrato_es_un_paquete_no_un_empleado` creó `public.subcontrato`
// con su `proveedor_id`. Una limitación declarada que nadie vuelve a medir es una mentira con fecha
// de vencimiento: el dato estaba y la pantalla seguía diciendo que no.
//
// LO QUE SIGUE SIN PODERSE DIBUJAR ES EL AVANCE. El canónico pinta una barra de % por paquete;
// `subcontrato` guarda estado, no porcentaje. Derivarlo del estado («terminado ⇒ 100 %») sería
// inventar una medición: un paquete terminado administrativamente y uno certificado al 100 % no son
// el mismo hecho. Se muestra el estado, que es lo que la base afirma.
//
// SE VE POR OBRA. `subcontrato_por_obra` recorta por las obras de quien mira, así que un jefe ve los
// paquetes de sus obras y nadie más. Por eso la ausencia de paquetes no se escribe como «no tiene».

export async function getPaquetesDelProveedor(
  supabase: SupabaseClient,
  proveedorId: string,
): Promise<ServiceResult<PaqueteDelProveedor[]>> {
  const { data, error } = await supabase
    .from('subcontrato')
    .select('id, nombre, estado, precio_contratado, documentacion_ok, obra_id, obra_canonica(nombre)')
    .eq('proveedor_id', proveedorId)
  if (error) return { data: null, error: error.message }
  return { data: armarPaquetes((data ?? []) as unknown as FilaSubcontrato[]), error: null }
}
