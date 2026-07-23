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
  expect(antes).toBeTruthy()

  // LA RESTAURACIÓN VA EN finally (23/07). Este test MUTA una tabla real de producción. La primera
  // vez que falló a mitad se quedó sin restaurar y dejó una fuente marcada como sincronizada hoy
  // cuando no lo estaba — un dato falso que después mira todo el OS. Pase lo que pase, se devuelve.
  const original = { estado: antes!.estado, sync: antes!.ultima_sincronizacion_exitosa }
  try {

    // EL TEST CREA SU PROPIA PRECONDICIÓN (23/07). Antes daba por sentado que esta fuente estaba
    // "actualizado" y hoy está genuinamente atrasada, así que fallaba por el estado REAL del negocio
    // en vez de por el mecanismo que quiere probar. Se fabrica el punto de partida, se prueban las dos
    // direcciones, y al final se restaura el dato real.
    await supabase
      .from('fuentes_datos')
      .update({ ultima_sincronizacion_exitosa: new Date().toISOString(), estado: 'atrasado' })
      .eq('id', antes!.id)
    await supabase.rpc('recalcular_frescura_fuentes')
    const { data: fresca } = await supabase.from('fuentes_datos').select('estado').eq('id', antes!.id).single()
    // La otra dirección, la que faltaba: una fuente atrasada que vuelve a sincronizar se pone al día
    // sola. Sin esto la alerta de frescura era un trinquete y quedaba encendida para siempre.
    expect(fresca?.estado).toBe('actualizado')

    // Simula que pasaron 40 días sin sincronizar (supera el umbral mensual de 35 días)
    await supabase
      .from('fuentes_datos')
      .update({ ultima_sincronizacion_exitosa: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', antes!.id)

    await supabase.rpc('recalcular_frescura_fuentes')

    const { data: despues } = await supabase.from('fuentes_datos').select('estado').eq('id', antes!.id).single()
    expect(despues?.estado).toBe('atrasado')

  } finally {
    // El dato REAL vuelve tal cual estaba: fecha Y estado. No se recalcula ni se fuerza nada.
    await supabase
      .from('fuentes_datos')
      .update({ ultima_sincronizacion_exitosa: original.sync, estado: original.estado })
      .eq('id', antes!.id)
  }

  const { data: restaurada } = await supabase.from('fuentes_datos').select('estado, ultima_sincronizacion_exitosa').eq('id', antes!.id).single()
  expect(restaurada?.estado).toBe(original.estado)
  expect(restaurada?.ultima_sincronizacion_exitosa).toBe(original.sync)

  // Fuentes que la función no debe tocar: por_evento/error ya juzgadas por una persona
  const { data: telegramas } = await supabase
    .from('fuentes_datos')
    .select('estado')
    .eq('nombre', 'TELEGRAMAS (cartas documento laborales)')
    .single()
  expect(telegramas?.estado).toBe('atrasado')
})
