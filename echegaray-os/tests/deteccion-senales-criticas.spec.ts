import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Línea B (rutinas críticas de negocio, 2026-07-08): primera rutina que llega hasta
// OBSERVACIÓN -> BACKLOG real sin depender de que alguien abra una página. Valida las
// dos ramas (acciones vencidas, fuentes críticas atrasadas) y la idempotencia (correr
// dos veces no duplica el mismo hallazgo).

const EMAIL = 'jorge.o.corona+direccion-test-1783513222134@gmail.com'
const PASSWORD = 'TestPassword123!'

test.describe('detectar_senales_criticas_transversales', () => {
  test('detecta una acción vencida real y no la duplica en una segunda corrida', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )
    await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })

    // Auto-sanación: si una corrida anterior fue interrumpida (proceso matado a mitad
    // de test, timeout global de Playwright), el finally de abajo nunca llegó a
    // ejecutar y dejó un fixture real en acciones/backlog_autonomo -- hallazgo real de
    // esta ola (6 filas encontradas, ver memoria). Se limpia cualquier residuo previo
    // antes de crear el fixture nuevo, en vez de depender solo del finally.
    const { data: huerfanas } = await supabase.from('acciones').select('id').ilike('titulo', 'Prueba E2E acción vencida%')
    for (const h of huerfanas ?? []) {
      await supabase.from('backlog_autonomo').delete().eq('origen_tabla', 'acciones').eq('origen_id', h.id)
      await supabase.from('acciones').delete().eq('id', h.id)
    }

    const titulo = `Prueba E2E acción vencida ${Date.now()}`
    const { data: accion, error } = await supabase
      .from('acciones')
      .insert({
        origen: 'manual',
        titulo,
        area: 'gestion_general',
        estado: 'pendiente',
        fecha_limite: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        responsable: 'Test E2E',
        severidad: 'alta',
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    try {
      await supabase.rpc('detectar_senales_criticas_transversales')

      const { data: backlog } = await supabase
        .from('backlog_autonomo')
        .select('id')
        .eq('origen_tabla', 'acciones')
        .eq('origen_id', accion!.id)
      expect(backlog?.length).toBe(1)

      // Segunda corrida: no debe crear un segundo ítem para el mismo origen.
      await supabase.rpc('detectar_senales_criticas_transversales')
      const { data: backlogDespues } = await supabase
        .from('backlog_autonomo')
        .select('id')
        .eq('origen_tabla', 'acciones')
        .eq('origen_id', accion!.id)
      expect(backlogDespues?.length).toBe(1)
    } finally {
      await supabase.from('backlog_autonomo').delete().eq('origen_tabla', 'acciones').eq('origen_id', accion!.id)
      await supabase.from('acciones').delete().eq('id', accion!.id)
    }
  })

  test('fuentes críticas ya atrasadas (IVA 2026, TELEGRAMAS) generan backlog real', async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    )
    await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
    await supabase.rpc('detectar_senales_criticas_transversales')

    const { data } = await supabase
      .from('backlog_autonomo')
      .select('titulo')
      .eq('origen_tabla', 'fuentes_datos')
      .eq('estado', 'abierto')

    const titulos = (data ?? []).map((d) => d.titulo)
    expect(titulos.some((t) => t.includes('IVA 2026'))).toBe(true)
    expect(titulos.some((t) => t.includes('TELEGRAMAS'))).toBe(true)
  })
})
