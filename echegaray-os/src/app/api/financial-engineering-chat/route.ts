// FINANCIAL ENGINEERING MULTI-EXPERTO (FE1) — backend.
//
// Recibe la pregunta del dueño, lee el CONTEXTO financiero de las fuentes únicas del OS (SÓLO-LECTURA)
// y corre el núcleo (orquestador/lib/fe-multiexperto.mjs): tres lentes expertas grounded en sus skills
// (contador, abogado, financiero) + la comparación. RAZONA, así que consume la API de Anthropic — pero
// SÓLO cuando el dueño pregunta (nada autónomo, nada en timer).
//
// REGLAS DURAS DE ESTA RUTA:
//  - SÓLO-LECTURA: nunca escribe el Google Sheet ni la base. El núcleo no recibe tools.
//  - Nunca un peso inventado: el contexto sale de las fuentes; lo que falta se declara "No tengo ese dato".
//  - Degradación honesta: sin sesión / sin contexto / sin crédito → ok:false con motivo claro (nunca 500 opaco).
//  - AUTENTICADO DE VERDAD: usa el cliente Supabase con la cookie de sesión → las lecturas pasan por RLS.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { leerContextoFinanciero } from '@/features/financial-engineering-chat/services/contextoService'
import type { RespuestaAPI, RespuestaFEMultiexperto } from '@/features/financial-engineering-chat/types'
// El núcleo y su razonador productivo viven en el orquestador (canónico, testeado por orq:test). El
// núcleo es puro (0 API); el wiring inyecta el Context Assembler (skills) + el engine Anthropic.
import { analizarMultiexperto, construirContextoTexto } from '../../../../orquestador/lib/fe-multiexperto.mjs'
import { crearRazonadorProductivo } from '../../../../orquestador/lib/fe-multiexperto-wiring.mjs'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({ pregunta: z.string().trim().min(1).max(1000) })

function json(body: RespuestaAPI, status = 200): NextResponse {
  return NextResponse.json(body, { status })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let pregunta = ''
  try {
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return json({ ok: false, motivo: 'error', error: 'Escribí una pregunta (máx. 1000 caracteres).' }, 400)
    }
    pregunta = parsed.data.pregunta
  } catch {
    return json({ ok: false, motivo: 'error', error: 'Cuerpo inválido: se espera { pregunta: string }.' }, 400)
  }

  // 1) Contexto financiero real (sólo-lectura, pasa por RLS con la sesión).
  let contexto
  try {
    const supabase = await createClient()
    const res = await leerContextoFinanciero(supabase)
    if (!res.contexto) {
      return json({ ok: false, motivo: 'sin_contexto', error: res.error ?? 'No hay contexto financiero disponible.' })
    }
    contexto = res.contexto
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error de lectura'
    // Sin sesión, las tablas finanzas_* dan error de permisos (RLS): lo decimos honestamente.
    return json({ ok: false, motivo: 'sin_sesion', error: `No pude leer el contexto financiero (${msg}).` })
  }

  const { texto: contextoTexto } = construirContextoTexto(contexto) as { texto: string }

  // 2) Sin credencial de razonamiento no inventamos una lectura: devolvemos el contexto determinístico
  //    (transparencia) y avisamos que el razonamiento no está disponible.
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({
      ok: false,
      motivo: 'sin_credito',
      error: 'El razonamiento multi-experto no está disponible ahora (sin credencial de API). Te dejo el contexto financiero real, sin interpretar.',
      contextoTexto,
    })
  }

  // 3) Razonar: tres lentes + comparación. Modelo barato por defecto (haiku); techo de costo por lente.
  try {
    const razonar = crearRazonadorProductivo()
    const respuesta = (await analizarMultiexperto({ pregunta, contexto, razonar })) as RespuestaFEMultiexperto

    // Si TODAS las lentes cayeron por crédito/credencial, es una degradación, no un éxito vacío.
    const todasCaidas = respuesta.lecturas.every((l) => l.error)
    if (todasCaidas) {
      return json({
        ok: false,
        motivo: 'sin_credito',
        error: 'El razonamiento no pudo correr (sin crédito o credencial de API). Te dejo el contexto financiero real, sin interpretar.',
        contextoTexto,
      })
    }
    return json({ ok: true, respuesta })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error desconocido'
    return json({ ok: false, motivo: 'error', error: `No pude completar el análisis: ${msg}.`, contextoTexto })
  }
}
