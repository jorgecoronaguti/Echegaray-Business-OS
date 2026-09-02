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

/** El paso a paso del razonamiento, partido en bloques dibujables. El texto viene del motor
 *  («**1 · Superficies** — …») y acá SOLO se corta por paso: no se inventa ningún estado —
 *  los faltantes ya vienen nombrados adentro de cada bloque. PURA. */
export function pasosDeRespuesta(r: unknown): { titulo: string; cuerpo: string }[] {
  if (!r || typeof r !== 'object') return []
  const datos = (r as { datos?: unknown }).datos
  if (!datos || typeof datos !== 'object') return []
  const texto = (datos as { razonamiento_texto?: unknown }).razonamiento_texto
  if (typeof texto !== 'string' || !texto.trim()) return []
  const bloques = texto.split(/\n+(?=\*\*\d+ · )/)
  return bloques
    .map((b) => {
      const m = b.match(/^\*\*(\d+ · [^*]+)\*\*\s*—?\s*([\s\S]*)$/)
      return m ? { titulo: m[1].trim(), cuerpo: m[2].trim() } : null
    })
    .filter((x): x is { titulo: string; cuerpo: string } => x !== null)
}
