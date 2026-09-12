// LA RUTA MÁS BARATA QUE PRUEBA QUE LA CADENA ESTÁ VIVA — y la que la mantiene caliente.
//
// ═══ QUÉ PROBLEMA RESUELVE ═══
//
// Medido el 11/09/2026 contra producción: `pantalla_cliente` con el backend FRÍO planifica 1,7 s y
// lee 0,8 s; con el backend CALIENTE, 60 ms. Abrir una conexión nueva al pooler de Supabase cuesta
// ~800 ms por sí sola. Esos números no son de una consulta lenta: son de una cadena que estuvo
// quieta. El primero que entra a la mañana paga el arranque completo, y es siempre el dueño.
//
// Un timer del sistema golpea esta ruta cada 4 minutos y ninguna de las dos puntas se enfría: ni la
// instancia de Next en Vercel, ni el pool de PostgREST, ni los planes de Postgres.
//
// ═══ POR QUÉ NO LLEVA AUTENTICACIÓN ═══
//
// Porque no devuelve ni un dato de la empresa: `select 1` contra una tabla que no existe, con la
// clave anónima, y lo único que publica es si contestó y en cuántos milisegundos. Pedirle sesión la
// volvería inútil para lo que existe (un `curl` desde un timer) y además la obligaría a leer la
// cookie, que es justamente el trabajo que no queremos medir acá.
//
// ═══ LO QUE ESTA RUTA NO ES ═══
//
// No es un monitor de salud del negocio. `ok: true` significa «Postgres contestó», no «los datos
// están bien» ni «el Sheet está sincronizado». Un verde acá NUNCA es evidencia de que una capacidad
// funciona — eso lo prueban los tests y las sondas de cada dominio.
import { createClient } from '@supabase/supabase-js'

/** No se cachea NADA: una respuesta guardada mediría el caché, no la base, y el timer dejaría de
 *  calentar lo que vino a calentar. */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const arranque = Date.now()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return Response.json({ ok: false, error: 'sin configuración de Supabase' }, { status: 503 })
  }
  try {
    const sb = createClient(url, anon, { auth: { persistSession: false } })
    // LA CONSULTA MÁS BARATA QUE ATRAVIESA TODA LA CADENA: Next → PostgREST → pooler → Postgres.
    // `perfiles` con `head` y un techo de una fila no trae filas (RLS se las niega al anónimo) pero
    // SÍ obliga a abrir la conexión y planificar, que es lo que hay que mantener caliente. Un 401 o
    // un conjunto vacío son respuestas legítimas: lo que se mide es que la cadena CONTESTÓ.
    const { error } = await sb.from('perfiles').select('id', { head: true, count: undefined }).limit(1)
    const ms = Date.now() - arranque
    // El error de permiso es esperable y no es una falla de salud; uno de red o de pooler sí.
    const caida = error && /fetch|network|timeout|ECONN|socket/i.test(error.message)
    return Response.json(
      { ok: !caida, ms, ...(error ? { nota: error.message } : {}) },
      { status: caida ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return Response.json(
      { ok: false, ms: Date.now() - arranque, error: e instanceof Error ? e.message : 'desconocido' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
