// CHAT INTERNO 0-API (F7) — backend.
//
// Recibe la pregunta del dueño, la rutea con el ruteador DETERMINÍSTICO que el OS ya tiene
// (orquestador/lib/chat-intents.mjs · routeConsulta — RAÍCES de palabra, tolerante al voseo) y responde
// LEYENDO las tablas que el OS ya materializó (patrón la-web-lee). NO llama a ninguna API de Anthropic
// ni a Claude Code: es 100% interno y 0-API.
//
// REGLA DURA: si la pregunta no matchea ninguna capacidad, se responde honestamente ("no tengo esa
// capacidad todavía" + qué sí puede responder). Nunca un peso inventado.
//
// AUTENTICADO DE VERDAD: usa el cliente Supabase con la cookie de sesión → las lecturas pasan por RLS.
// Sin sesión, las tablas finanzas_* dan error de permisos y se devuelve una respuesta honesta, no un 500.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { responderCapacidad, CAPACIDADES_DISPONIBLES } from '@/features/chat-interno/services/chatService'
import type { Capacidad, ChatRespuesta } from '@/features/chat-interno/types'
// El ruteador determinístico vive en el orquestador (canónico, testeado por orq:test). Lo reusamos tal
// cual: el chat NO tiene un modelo propio, sólo mapea intención → capacidad ya materializada.
import { routeConsulta } from '../../../../orquestador/lib/chat-intents.mjs'

export const runtime = 'nodejs'

function noCubierta(): ChatRespuesta {
  return {
    cubierta: false,
    capacidad: null,
    titulo: 'No tengo esa capacidad todavía',
    intro: 'No fabrico un número que no tengo. Hoy puedo responder, con datos que el OS ya calcula:',
    datos: CAPACIDADES_DISPONIBLES.map((c) => ({ etiqueta: c, valor: '', fuente: '', estado: 'ok' as const })),
    nota: 'Reformulá la pregunta hacia alguno de esos temas y te doy el dato real.',
    capturadoEn: null,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let texto = ''
  try {
    const body = (await req.json()) as { texto?: unknown }
    if (typeof body?.texto === 'string') texto = body.texto
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido: se espera { texto: string }.' }, { status: 400 })
  }
  if (!texto.trim()) {
    return NextResponse.json({ error: 'Escribí una pregunta.' }, { status: 400 })
  }

  const capacidad = routeConsulta(texto) as Capacidad | null
  if (!capacidad) {
    return NextResponse.json({ respuesta: noCubierta() })
  }

  try {
    const supabase = await createClient()
    const respuesta = await responderCapacidad(supabase, capacidad, texto)
    return NextResponse.json({ respuesta })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `No pude responder: ${mensaje}` }, { status: 500 })
  }
}
