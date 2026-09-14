// LA FICHA DE UN PROVEEDOR — lo que no son sus compras.
//
// ═══ LAS COMPRAS YA NO SE LEEN ACÁ (14/09/2026) ═══
//
// Hasta hoy `getComprobantes` cruzaba los textos crudos de `costos_obra` contra
// `proveedor_nombre_resuelto` y pedía las filas con `proveedor=in.(…)`. La lista de compras de la
// ficha pasó a leer `proveedor_compra` (`comprobantesProveedorService.ts`): vincula por CUIT, cae al
// nombre sólo si la compra no trae CUIT, y trae la clave con la que se cuelga el papel. Mantener la
// lectura vieja al lado sería dos respuestas a «qué le compramos a este proveedor».
//
// Queda la mitad izquierda del cruce viejo, los NOMBRES, que la cara «Nombres resueltos» sigue
// mostrando, y los paquetes de subcontrato.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NombreResuelto, ServiceResult } from '../types'
import {
  armarPaquetes,
  type FilaSubcontrato, type PaqueteDelProveedor,
} from './fichaProveedor'

/** Los nombres del Sheet vinculados a este proveedor. */
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
