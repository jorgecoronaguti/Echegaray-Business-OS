// DESCARGA «NOVEDADES PARA EL ESTUDIO» (Excel o PDF) — Personal › Liq. de hs › «Exportar para el estudio».
//
// GET ?quincena=YYYY-MM-DD&formato=xlsx|pdf&grupo=obreros|oficina|todos. Sólo Dirección y Administración (`liquidaSueldos`): la misma puerta
// que la liquidación. Sin ese rol la ruta NO EXISTE (404, no 403): un 403 confirma que hay algo ahí. La
// cerradura de fondo es la RLS (`liquida_sueldos()`), que devuelve cero filas aunque alguien salte esta puerta.
//
// Nunca se cachea: el archivo sale de horas que cambian hasta que se cierra la quincena, y una copia vieja
// llegaría al contador como si fuera la de hoy. Y NO ESCRIBE NADA: ni Drive, ni Sheet, ni mail — descarga.

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { liquidaSueldos } from '@/shared/auth/areas'
import { hoyEnObra } from '@/features/jefe/services/contexto'
import { quincenaDe } from '@/features/administracion/services/quincena'
import { leerNovedadesParaElEstudio } from '@/features/administracion/services/novedadesService'
import { xlsxDeNovedades } from '@/features/administracion/services/novedadesXlsx'
import { pdfDeNovedades } from '@/features/administracion/services/novedadesPdf'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const Pedido = z.object({
  quincena: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  formato: z.enum(['xlsx', 'pdf']),
  // Obreros y oficina se liquidan distinto y el dueño los manda por separado; sin el parámetro van los dos bloques.
  grupo: z.enum(['obreros', 'oficina', 'todos']).default('todos'),
})

const TIPOS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
} as const

export async function GET(req: Request) {
  const supabase = await createClient()
  const rol = (await getPerfilActual(supabase)).data?.rol
  if (!liquidaSueldos(rol)) return new Response('Not found', { status: 404 })

  const p = Pedido.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!p.success) return Response.json({ error: 'quincena, formato o grupo inválidos' }, { status: 400 })

  const hoy = hoyEnObra()
  const quincena = quincenaDe(p.data.quincena)
  const reporte = await leerNovedadesParaElEstudio(supabase, quincena, hoy, p.data.grupo)
  const cuerpo = p.data.formato === 'xlsx' ? xlsxDeNovedades(reporte) : await pdfDeNovedades(reporte)
  const q = reporte.periodo.texto.startsWith('PRIMERA') ? 'Q1' : 'Q2'
  const nombre = `Novedades-estudio-${reporte.periodo.desde.slice(0, 4)}-${reporte.periodo.desde.slice(5, 7)}-${q}${p.data.grupo === 'todos' ? '' : `-${p.data.grupo}`}.${p.data.formato}`
  return new Response(cuerpo as BodyInit, {
    headers: {
      'Content-Type': TIPOS[p.data.formato],
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
      // Para la pantalla, no para el archivo: cuántos obreros van sin recibo previo (categoría y $/h del legajo).
      'X-Novedades-Sin-Recibo': String(reporte.sinRecibo),
      'X-Novedades-Personas': String(reporte.filas.length),
      'Access-Control-Expose-Headers': 'X-Novedades-Sin-Recibo, X-Novedades-Personas, Content-Disposition',
    },
  })
}
