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
