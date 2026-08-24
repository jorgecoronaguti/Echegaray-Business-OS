// LA CARTERA: QUÉ CLIENTES SE VEN Y CUÁLES QUEDARON GUARDADOS.
//
// ═══ EL DEFECTO QUE ESTA FUNCIÓN VINO A CERRAR ═══
//
// `archivarCliente` escribía `activo = false` desde el primer día y `/clientes` NO FILTRABA: el
// cliente archivado seguía en la lista, en la misma posición, con los mismos números. El verbo
// existía y la consecuencia no — el mismo patrón que tenía «cerrar una obra» antes del 18/08.
//
// ═══ POR QUÉ EL FILTRO Y EL CONTEO SALEN DE UNA SOLA LECTURA ═══
//
// «Se ven N clientes y hay M guardados» es UNA decisión. Partirla en dos consultas —una filtrada
// para la tabla y un `count` para el pie— deja dos verdades que se desincronizan en cuanto una de
// las dos se ordena o se acota distinto, y el pie termina ofreciendo ver clientes que no aparecen.
//
// Vive suelta, sin tocar Supabase, para que se pueda probar sin base: es la pieza que hace que
// archivar tenga efecto, y una pieza así no puede depender de que alguien mire la pantalla.

export function separarArchivados<T extends { activo: boolean }>(
  clientes: T[],
): { activos: T[]; archivados: T[] } {
  return {
    activos: clientes.filter((c) => c.activo),
    archivados: clientes.filter((c) => !c.activo),
  }
}

// ═══ LOS TRES RECORTES DE LA CARTERA (canónico 25, 23/08/2026) ════════════════════════════════
//
// «Todos · Con obra activa · Datos faltantes». Los tres se calculan sobre la MISMA lista que se
// dibuja: si el contador del chip saliera de otra consulta, diría 4 y la tabla mostraría 3.

export const VISTAS_CARTERA = ['todo', 'activos', 'sin-datos'] as const
export type VistaCartera = (typeof VISTAS_CARTERA)[number]
export const esVistaCartera = (v: string | undefined): v is VistaCartera =>
  !!v && (VISTAS_CARTERA as readonly string[]).includes(v)

/** Lo que hace falta para decidir el recorte. Deliberadamente mínimo: así se prueba sin base. */
export interface FilaCartera {
  cuit: string | null
  n_obras_activas: number
  contratado: number | null
}

/**
 * QUÉ FALTA CARGAR DE ESTE CLIENTE. Devuelve el aviso, o `null` si no falta nada.
 *
 * HOY ES SÓLO EL CUIT, y es una decisión: es el único dato del maestro sin el cual no se puede
 * facturar ni cruzar contra ARCA. La razón social, el teléfono o la dirección faltantes son
 * incomodidades; el CUIT faltante frena el cobro. Medido el 24/08: 3 de los 5 clientes no lo tienen.
 */
export function avisoDeDatos(c: FilaCartera): string | null {
  return c.cuit?.trim() ? null : 'Sin CUIT: no se le puede facturar'
}

export function recortarCartera<T extends FilaCartera>(clientes: T[], vista: VistaCartera): T[] {
  if (vista === 'activos') return clientes.filter((c) => c.n_obras_activas > 0)
  if (vista === 'sin-datos') return clientes.filter((c) => avisoDeDatos(c) !== null)
  return clientes
}

/**
 * El pie de la tabla. `contratado` es `null` cuando NINGUNO tiene monto cargado —no `0`—: cero
 * contratado y «nadie cargó el contrato» son dos hechos opuestos, y el segundo se escribe con
 * palabras. Medido el 24/08: ARCOR es exactamente ese caso.
 */
export function totalesCartera(clientes: FilaCartera[]): {
  clientes: number; conObraActiva: number; contratado: number | null
} {
  const conMonto = clientes.filter((c) => c.contratado !== null)
  return {
    clientes: clientes.length,
    conObraActiva: clientes.filter((c) => c.n_obras_activas > 0).length,
    contratado: conMonto.length === 0 ? null : conMonto.reduce((s, c) => s + (c.contratado ?? 0), 0),
  }
}
