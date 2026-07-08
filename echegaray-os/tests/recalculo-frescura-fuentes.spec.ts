import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Continuidad operacional real (Bloque 1): recalcular_frescura_fuentes() debe correr
// sola vía pg_cron y escalar automáticamente actualizado -> atrasado cuando una fuente
// periódica supera el umbral esperado -- sin que nadie tenga que actualizar el estado
// a mano. Este test verifica el mecanismo en sí (no solo que la página cargue).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test('recalcular_frescura_fuentes escala una fuente mensual vencida y no toca las demás', async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  )
  const { error: authError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  expect(authError).toBeNull()

  const { data: antes } = await supabase
    .from('fuentes_datos')
    .select('id, estado, ultima_sincronizacion_exitosa')
    .eq('nombre', 'FONDO DE CESE (UOCRA)')
    .single()
  expect(antes?.estado).toBe('actualizado')

  // Simula que pasaron 40 días sin sincronizar (supera el umbral mensual de 35 días)
  await supabase
    .from('fuentes_datos')
    .update({ ultima_sincronizacion_exitosa: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', antes!.id)

  await supabase.rpc('recalcular_frescura_fuentes')

  const { data: despues } = await supabase.from('fuentes_datos').select('estado').eq('id', antes!.id).single()
  expect(despues?.estado).toBe('atrasado')

  // Restaura el estado real -- este test no debe dejar el dato simulado en la base
  await supabase
    .from('fuentes_datos')
    .update({ estado: 'actualizado', ultima_sincronizacion_exitosa: antes!.ultima_sincronizacion_exitosa })
    .eq('id', antes!.id)

  // Fuentes que la función no debe tocar: por_evento/error ya juzgadas por una persona
  const { data: telegramas } = await supabase
    .from('fuentes_datos')
    .select('estado')
    .eq('nombre', 'TELEGRAMAS (cartas documento laborales)')
    .single()
  expect(telegramas?.estado).toBe('atrasado')
})
