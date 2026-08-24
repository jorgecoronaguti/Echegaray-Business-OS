'use server'

// LA LUPA DEL HEADER — la puerta que le faltaba a `buscarGlobal`.
//
// ═══ POR QUÉ APARECE AHORA Y NO ANTES ═══
//
// El mockup 00 (`00 · Home Navegación.dc.html`) dibuja una lupa de 28×28 a la izquierda de la
// campanita. `AppHeader` la había dejado sin dibujar con un motivo explícito: *"no existe búsqueda
// global en este repositorio"*. Era cierto a medias — `entradaService.buscarGlobal` existe, tiene
// prueba y busca cliente + persona + proveedor en una sola tanda; lo que faltaba era exactamente
// esto: un borde por el que el navegador pueda llamarla. La lupa dibujada sin esto habría sido la
// promesa vacía que el comentario denunciaba. Con esto, busca.
//
// ═══ NO ES UNA API PÚBLICA ═══
//
// Va como server action y no como route handler por una razón de superficie: una ruta `/api/buscar`
// queda accesible para cualquiera con sesión y con cualquier parámetro. La acción sólo se invoca
// desde el árbol de React y corre con el cliente de Supabase del usuario, así que la RLS decide qué
// filas vuelven — un jefe de obra no encuentra lo que su rol no puede leer, sin que este archivo
// tenga que saber quién es.
//
// EL TÉRMINO SE VALIDA CON ZOD porque viene del teclado de alguien: el tope de largo evita que un
// pegado de 10 kB se convierta en tres `ilike` sobre un patrón absurdo, y `terminoSeguro` (probado
// en `entradaService.test.ts`) neutraliza las comas y paréntesis que partirían el `or` de PostgREST.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { buscarGlobal, type Hallazgo } from './entradaService'

/** Lo que devuelve la lupa. `error` no se pinta como «no hay nada»: son cosas opuestas. */
export type ResultadoBusqueda =
  | { ok: true; hallazgos: Hallazgo[] }
  | { ok: false; error: string }

const consulta = z.object({
  // 2 es el mínimo que `buscarGlobal` ya exige; 80 es techo de teclado humano, no de dato.
  q: z.string().trim().min(1).max(80),
})

export async function buscarEnTodo(q: string): Promise<ResultadoBusqueda> {
  const parsed = consulta.safeParse({ q })
  if (!parsed.success) return { ok: true, hallazgos: [] }

  try {
    const supabase = await createClient()
    return { ok: true, hallazgos: await buscarGlobal(supabase, parsed.data.q) }
  } catch (e) {
    // SE DICE QUE NO SE PUDO BUSCAR. Devolver la lista vacía acá haría que una caída de la base se
    // vea igual que «ese proveedor no está cargado», y alguien lo daría de alta dos veces.
    return { ok: false, error: e instanceof Error ? e.message : 'No pude buscar.' }
  }
}
