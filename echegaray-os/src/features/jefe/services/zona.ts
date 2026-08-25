// EL HUSO DE LA OBRA, en un módulo sin servidor adentro: lo lee `RelojDeObra` ('use client') y
// `contexto.ts` (que importa `@/lib/supabase/server`). Importarlo desde `contexto.ts` arrastraba
// `next/headers` al bundle del cliente y el build de producción se caía (24/08).
export const ZONA_OBRA = 'America/Argentina/Buenos_Aires'
