// EL CLIENTE DE SUPABASE DEL NAVEGADOR.
//
// ═══ POR QUÉ NO EXISTÍA HASTA HOY ═══
//
// Todo el OS lee y escribe desde el servidor (`server.ts` + `middleware.ts`): la pantalla pide, el
// Server Component consulta, la Server Action escribe. Esa es y sigue siendo la regla — el navegador
// no consulta la base por su cuenta.
//
// La excepción es UNA y es física: un archivo de 5 MB no entra en el cuerpo de una Server Action
// (1 MB de techo en Next, 4,5 MB en Vercel). Para que un comprobante llegue al bucket tiene que ir
// del navegador a Storage sin escala. Ver `services/subidaComprobantes.ts`.
//
// ═══ NO ABRE NINGUNA PUERTA NUEVA ═══
//
// Lleva la ANON KEY, que ya viaja al navegador (`NEXT_PUBLIC_*`) y sola no autoriza nada: la sesión
// sale de la misma cookie que escribe el middleware, y quien decide sigue siendo la RLS de Postgres.
// La `SERVICE_ROLE` no entra acá jamás — ésa vive en `admin.ts`, del lado del servidor.

import { createBrowserClient } from '@supabase/ssr'

type ClienteNavegador = ReturnType<typeof createBrowserClient>

// Uno solo por pestaña. Un cliente nuevo por render vuelve a parsear la cookie y a levantar el
// refresco del token en paralelo con el anterior.
let cliente: ClienteNavegador | null = null

export function createClient(): ClienteNavegador {
  cliente ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return cliente
}
