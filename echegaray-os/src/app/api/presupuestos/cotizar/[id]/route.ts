// EL PROGRESO DE UNA LECTURA DE PLANO — lo que la pantalla consulta en vez de esperar la respuesta
// de `POST /api/presupuestos/cotizar` en la misma conexión.
//
// La fila se lee CON LA SESIÓN DEL USUARIO (createClient de @/lib/supabase/server), o sea pasando
// por la RLS de `cotizacion_lectura`: el actor ve la suya, `direccion`/`administracion` ven todas.
// Un `id` que no es visible para este usuario da 404, no 403 — no se confirma que la fila exista.
//
// CONTRATO CON LA PANTALLA: estos nombres de campo no se cambian sin avisar — otro agente está
// construyendo la pantalla que los lee en paralelo.
//
// ═══ EL VENCIMIENTO VIVE ACÁ, EN LA LECTURA — NO EN UN CRON ═══
//
// Si el worker muere entre LEYENDO y el LISTO final, la fila queda en LEYENDO para siempre y la
// pantalla sondea infinito; destrabarla exigía SSH y un UPDATE a mano. El momento exacto en que a
// alguien le importa que esa fila esté colgada es cuando la está mirando — y eso es este GET. Un
// cron sería infra nueva que hay que operar y monitorear para resolver el mismo caso más tarde.
// Nadie mira ⇒ nadie espera.
//
// El GET se llama cada 1,5 s, así que el RPC NO se llama en cada vuelta: sólo cuando `pareceColgada`
// (función pura, con test) dice que la fila lleva más del umbral sin latir. El veredicto final lo da
// SQL — `public.cotizacion_lectura_vencer` revalida el umbral antes de escribir.
//
// ═══ EL POST CANCELA ═══
//
// Subir el legajo equivocado costaba minutos y todas las llamadas de visión que se pagaran mientras
// tanto. El UPDATE va con la sesión del usuario y lo autoriza la policy `cotizacion_lectura_cancelar`
// (su propia fila, sólo si todavía no terminó, y sólo a 'CANCELADO' — con GRANT sobre la columna
// `estado` únicamente). Se pide `.select()` a propósito: un 204 no prueba escritura en este repo,
// la fila devuelta sí.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { pareceColgada } from '@/features/presupuestos/services/vencimientoLectura'

export const runtime = 'nodejs'

const CAMPOS = 'id, estado, etapa, pasos, certeza, computo, cascada, documentos, presupuesto_id, error, creado, actualizado'

// `medicion` NO viaja en este contrato: es un jsonb con el detalle de cada llamada al modelo y este
// endpoint se consulta cada 1,5 s. Se mira por SQL, que es donde sirve.

const IdSchema = z.string().uuid()
const AccionSchema = z.object({ accion: z.literal('cancelar') })

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const idValido = IdSchema.safeParse(id)
  if (!idValido.success) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data, error } = await supabase.from('cotizacion_lectura').select(CAMPOS).eq('id', idValido.data).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // `null` es lo que la RLS devuelve tanto si la fila no existe como si existe y no es de este
  // usuario ni ve_economia() — las dos cosas se leen igual desde afuera, y así tiene que ser.
  if (!data) return NextResponse.json({ error: 'no encontrada' }, { status: 404 })

  if (pareceColgada(data)) {
    // El RPC revalida el umbral y escribe el motivo: si mientras tanto el worker revivió y latió,
    // devuelve null y se sigue mostrando el trabajo vivo. La verdad la tiene el que trabaja.
    const { data: vencida } = await supabase.rpc('cotizacion_lectura_vencer', { p_id: idValido.data })
    // El RPC devuelve la fila ENTERA (tiene `returns public.cotizacion_lectura`): se relee con
    // CAMPOS para no filtrar por la puerta de atrás lo que el contrato no incluye —`actor_id`,
    // `task_id`, `medicion`—. Es una consulta extra que se paga UNA vez por trabajo colgado.
    if (vencida) {
      const { data: fresca } = await supabase.from('cotizacion_lectura').select(CAMPOS).eq('id', idValido.data).maybeSingle()
      if (fresca) return NextResponse.json(fresca)
    }
  }

  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const idValido = IdSchema.safeParse(id)
  if (!idValido.success) return NextResponse.json({ error: 'id inválido' }, { status: 400 })

  let crudo: unknown
  try {
    crudo = await req.json()
  } catch {
    return NextResponse.json({ error: 'json inválido' }, { status: 400 })
  }
  const accion = AccionSchema.safeParse(crudo)
  if (!accion.success) return NextResponse.json({ error: 'la única acción soportada es cancelar' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data, error } = await supabase
    .from('cotizacion_lectura')
    .update({ estado: 'CANCELADO' })
    .eq('id', idValido.data)
    .in('estado', ['ENCOLADO', 'LEYENDO'])
    .select(CAMPOS)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (data) return NextResponse.json(data)

  // No se canceló nada. Puede ser que ya haya terminado (409) o que no exista / no sea de este
  // usuario (404). Sólo en este camino se paga una segunda consulta.
  const { data: actual } = await supabase.from('cotizacion_lectura').select('id, estado').eq('id', idValido.data).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'no encontrada' }, { status: 404 })
  return NextResponse.json({ error: `el trabajo ya había terminado (${actual.estado})` }, { status: 409 })
}
