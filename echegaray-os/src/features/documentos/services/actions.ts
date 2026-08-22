'use server'

// DOCUMENTOS — la única escritura de esta pantalla: la fecha de vencimiento de un papel.
//
// ═══ POR QUÉ ÉSTA Y NINGUNA OTRA ═══
//
// La pantalla 27 lee un espejo de Drive. Casi todo lo que muestra —nombre, ruta, tamaño, fecha— es
// de Drive y se corrige en Drive. Hay UN dato que no existe en ningún lado y que el OS es el único
// que puede tener: cuándo vence el papel. Sin él, `estadoVigencia` devuelve `null` para las 847
// filas de `documentacion_legajo`, la columna VENCE no se dibuja y la banda de alertas cuenta 0
// vencidos para siempre. El mecanismo estaba entero y sin nadie que cargara el insumo.
//
// ═══ POR QUÉ SÓLO SOBRE `documentacion_legajo` ═══
//
// Es la única de las dos tablas de vínculo que tiene la columna. `cliente_documento` son cinco
// columnas —cliente_id, drive_file_id, rol, origen, creado_en— y ninguna es una fecha de vigencia.
// Agregarla sería inventar estructura de datos sin que nadie haya pedido que un contrato de cliente
// venza en el OS, y encima obligaría a tocar los GRANT por columna. Se declara y no se hace.
//
// ═══ EL PERMISO NO LO DECIDE ESTE ARCHIVO ═══
//
// `documentacion_legajo` tiene RLS con `es_administracion()` en SELECT y en UPDATE (qual y check), y
// el GRANT de UPDATE alcanza `fecha_vencimiento`. Si escribe alguien que no es administración, la
// base no devuelve error: devuelve CERO FILAS AFECTADAS. Por eso acá no alcanza con mirar el error.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ResultadoInline } from '@/shared/components/ds'
import { leerVencimiento, veredictoDeRelectura } from './vencimiento'

// El id lo valida Zod porque llega del navegador: sin `uuid()`, un texto cualquiera viaja a
// PostgREST y vuelve como un error de sintaxis de Postgres en la cara del usuario. La FECHA la
// valida `vencimiento.ts`, que además se puede probar sin base — ver su encabezado.
const legajoIdSchema = z.string().uuid('El documento del legajo no está identificado')

/**
 * FIJA (O BORRA) LA FECHA DE VENCIMIENTO DE UN DOCUMENTO DEL LEGAJO.
 *
 * ═══ SE LEE EL EFECTO, NO EL ACUSE ═══
 *
 * PostgREST contesta 204 tanto cuando escribió como cuando la RLS filtró la fila y no escribió
 * nada: el `error` es `null` en los dos casos. Entonces, después de escribir, se VUELVE A LEER la
 * fila y se compara contra lo que se pidió. Si no coincide, se devuelve error. Es una lectura
 * separada a propósito y no el `RETURNING` del propio `update`: un control no se valida contra la
 * misma sentencia que produce el efecto.
 */
export async function fijarVencimiento(legajoId: string, valor: string): Promise<ResultadoInline> {
  const id = legajoIdSchema.safeParse(legajoId)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  const fecha = leerVencimiento(valor)
  if (!fecha.ok) return { ok: false, error: fecha.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('documentacion_legajo')
    .update({ fecha_vencimiento: fecha.fecha })
    .eq('id', id.data)
  if (error) return { ok: false, error: error.message }

  const { data, error: errorLectura } = await supabase
    .from('documentacion_legajo')
    .select('fecha_vencimiento')
    .eq('id', id.data)
    .maybeSingle()
  if (errorLectura) return { ok: false, error: `Se escribió, pero no pude releerlo: ${errorLectura.message}` }

  const leida = data ? (data as { fecha_vencimiento: string | null }).fecha_vencimiento : undefined
  const veredicto = veredictoDeRelectura(fecha.fecha, leida)
  if (!veredicto.ok) return veredicto

  // La banda de alertas y la columna VENCE se calculan en el servidor: sin esto, la fecha se guarda
  // y la pantalla sigue diciendo que no hay ningún vencimiento cargado.
  revalidatePath('/documentos', 'layout')
  return { ok: true }
}
