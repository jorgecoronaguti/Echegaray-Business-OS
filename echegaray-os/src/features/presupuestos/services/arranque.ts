// EL ARRANQUE CONVERSACIONAL DE UN PRESUPUESTO — de la respuesta de XSAS a la pantalla del entorno.
//
// «Presupuestos v5 · mapa y flujo»: cotizar es una conversación con xsas contra un presupuesto
// vivo. El arranque (`/presupuestos/nuevo`) no dibuja el entorno de nuevo: detecta el presupuesto
// que la conversación acaba de crear y navega a `/presupuestos/[id]`, donde el entorno completo
// —conversación por cotización, cola de atención, tabla, cascada— ya existe. PURA.

/** La respuesta de XSAS trae `datos` sin forma fija; esto mira SOLO lo que necesita. */
export function destinoDeRespuesta(r: unknown): string | null {
  if (!r || typeof r !== 'object') return null
  const datos = (r as { datos?: unknown }).datos
  if (!datos || typeof datos !== 'object') return null
  const id = (datos as { cotizacion_id?: unknown }).cotizacion_id
  if (typeof id !== 'string' || !id.trim()) return null
  return `/presupuestos/${id}`
}

/** El número que el OS le puso al presupuesto recién creado, para nombrarlo en el aviso. */
export function numeroDeRespuesta(r: unknown): string | null {
  if (!r || typeof r !== 'object') return null
  const datos = (r as { datos?: unknown }).datos
  if (!datos || typeof datos !== 'object') return null
  const numero = (datos as { numero?: unknown }).numero
  return typeof numero === 'string' && numero.trim() ? numero : null
}
