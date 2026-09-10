// LAS FILAS CRUDAS DE LA BASE → LOS TIPOS DE LA PANTALLA. Puro, y por eso vive solo.
//
// ═══ POR QUÉ ESTÁ SEPARADO DE `clientesService.ts` ═══
//
// Las mismas filas llegan por DOS transportes: PostgREST (una consulta por vista) y la RPC
// `pantalla_clientes()`, que las trae todas en un viaje. Si cada transporte tuviera su propia
// conversión, un `null` tratado de dos maneras haría que la misma pantalla dijera cosas distintas
// según por dónde entró el dato. Una conversión, dos transportes.
//
// Y está en su propio archivo porque `clientesService.ts` arrastra imports que `node --test` no
// resuelve: lo que se prueba tiene que poder cargarse sin montar Next.

import type { ClientePanel, ObraDePanel } from '../types'

/** PostgREST devuelve `null` y `undefined` de formas que la pantalla no debe distinguir. */
export function normalizar(row: Record<string, unknown>): ClientePanel {
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

/** Las filas de `cliente_panel` ya leídas → la lista que dibuja la pantalla. */
export function armarClientes(filas: unknown[]): ClientePanel[] {
  return filas.map((r) => normalizar(r as Record<string, unknown>))
}

/** Las filas de `obra_panel` ya leídas → obras por cliente, para el panel lateral. */
export function armarObrasPorCliente(filas: unknown[]): Map<string, ObraDePanel[]> {
  const por = new Map<string, ObraDePanel[]>()
  for (const fila of filas) {
    const o = fila as Record<string, unknown>
    const cliente = o.cliente_id as string | null
    if (!cliente) continue
    por.set(cliente, [
      ...(por.get(cliente) ?? []),
      {
        obra_id: o.obra_id as string,
        nombre: o.nombre as string,
        estado: o.estado as string,
        // NULL NO ES 0. Una obra sin avance sincronizado no avanzó cero por ciento: no se sabe.
        avance_pct: (o.avance_pct as number | null) ?? null,
      },
    ])
  }
  return por
}