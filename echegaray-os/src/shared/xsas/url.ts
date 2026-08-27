// La URL completa de la puerta de XSAS a partir de la base del túnel.
//
// Vive aparte de `puerta.ts` por una razón mecánica: `puerta.ts` importa el cliente de Supabase con
// el alias `@/…`, y el runner de tests (`node --test` sobre `.test.ts`) no resuelve ese alias. Una
// función pura en su propio archivo se prueba; metida al lado del cliente, no.

/** Pega la ruta a la base sin duplicar la barra. PURA. */
export function urlDePuerta(base: string, ruta = '/xsas'): string {
  return `${base.replace(/\/+$/, '')}${ruta}`
}
