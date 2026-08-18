import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// LO COMPARTIDO POR LOS RECORRIDOS DEL MVP ERP DE OBRAS.
//
// No es un archivo de test —no termina en `.spec.ts` y Playwright no lo recoge—: es el cableado que
// usan los dos recorridos (`obras-cliente-y-obra` y `obras-ejecucion`). Vive separado por una razón
// concreta: la LIMPIEZA tiene que ser una sola. Dos copias del borrado se desincronizan, y la que
// se queda vieja deja filas de prueba en el Gantt que mira el dueño.

export const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
export const PASSWORD = 'TestPassword123!'

/** Todo lo que crean estos recorridos lleva esta marca en el nombre: hace el borrado inequívoco. */
export const MARCA = 'ZZ-E2E'
export const OBRA = 'le-comedor'

/**
 * `single()` devuelve `data: T | null`. Si el test llegó hasta acá la fila TIENE que existir: se
 * corta con un mensaje que dice qué faltó, en vez de arrastrar un `null` que explota diez líneas
 * después y manda a buscar el problema al lugar equivocado.
 */
export function laFila<T>(data: T | null, que: string): T {
  if (!data) throw new Error(`No encontré ${que} en la base: la escritura no llegó`)
  return data
}

export async function entrar(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|flujo-caja|obras)/, { timeout: 20000 })
}

export async function conBase(): Promise<SupabaseClient> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  return sb
}

/** Limpieza por marca. Se corre ANTES y DESPUÉS: una corrida interrumpida no deja basura para la
 *  siguiente y, sobre todo, no deja una fila de prueba en el Gantt que mira el dueño. */
export async function limpiar(sb: SupabaseClient) {
  await sb.from('obra_asignacion').delete().eq('obra_id', OBRA).ilike('notas', `%${MARCA}%`)
  await sb.from('certificados').delete().eq('obra_canonica_id', OBRA).ilike('numero', `%${MARCA}%`)
  await sb.from('obra_restriccion').delete().eq('obra_id', OBRA).ilike('descripcion', `%${MARCA}%`)
  await sb.from('obra_actividad').delete().eq('obra_id', OBRA).ilike('nombre', `%${MARCA}%`)
  const { data: cli } = await sb.from('clientes').select('id').ilike('nombre', `%${MARCA}%`)
  for (const c of cli ?? []) {
    await sb.from('cliente_documento').delete().eq('cliente_id', c.id)
    await sb.from('cliente_contacto').delete().eq('cliente_id', c.id)
    await sb.from('obra_canonica').delete().eq('cliente_id', c.id)
    await sb.from('clientes').delete().eq('id', c.id)
  }
}
