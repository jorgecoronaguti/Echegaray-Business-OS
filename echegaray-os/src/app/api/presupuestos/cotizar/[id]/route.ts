// EL PROGRESO DE UNA LECTURA DE PLANO — lo que la pantalla consulta en vez de esperar la respuesta
// de `POST /api/presupuestos/cotizar` en la misma conexión.
//
// La fila se lee CON LA SESIÓN DEL USUARIO (createClient de @/lib/supabase/server), o sea pasando
// por la RLS de `cotizacion_lectura`: el actor ve la suya, `direccion`/`administracion` ven todas.
// Un `id` que no es visible para este usuario da 404, no 403 — no se confirma que la fila exista.
//
// CONTRATO CON LA PANTALLA: estos nombres de campo no se cambian sin avisar — otro agente está
// construyendo la pantalla que los lee en paralelo.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const CAMPOS = 'id, estado, etapa, pasos, certeza, computo, cascada, documentos, presupuesto_id, error, creado, actualizado'

const IdSchema = z.string().uuid()

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

  return NextResponse.json(data)
}
