// Z01 · «EXPORTAR EL CIERRE» — `/obras/<obra>/cierre` devuelve el PDF de cierre de la obra.
//
// Se lee con la sesión de quien pide: la RLS de cada vista es la cerradura, y quien no ve la
// economía recibe esa sección como «reservado» (lo decide `veEconomia`, igual que la pantalla). Una
// obra que no existe o no se puede leer da 404, no un PDF vacío.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { getActividades, getEconomiaObra, getObra, getPlanVsReal } from '@/features/obras/services/obrasService'
import { getActividadHH } from '@/features/obras/services/personalService'
import { hhPorRubro } from '@/features/obras/services/resumenObra'
import { seccionesDeCierre } from '@/features/obras/services/cierreObra'
import { pdfDeCierre } from '@/features/obras/services/cierrePdf'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { clienteDeObra } from '@/shared/clientes/nombre'

export const dynamic = 'force-dynamic'

const noHay = () => new Response('No encontrado', { status: 404 })

export async function GET(_req: Request, { params }: { params: Promise<{ obra: string }> }) {
  const { obra: obraId } = await params
  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario?.user) return noHay()

  const [perfil, obraRes, actsRes, hhRes, planRes, codigos] = await Promise.all([
    getPerfilActual(supabase), getObra(supabase, obraId), getActividades(supabase, obraId),
    getActividadHH(supabase, obraId), getPlanVsReal(supabase, obraId), codigosDeObra(supabase, [obraId]),
  ])
  const obra = obraRes.data
  if (!obra) return noHay()
  const ve = veEconomia((perfil.data as { rol?: string | null } | null)?.rol as Parameters<typeof veEconomia>[0] ?? null)
  const economia = ve ? (await getEconomiaObra(supabase, obraId)).data ?? null : null
  const acts = actsRes.data ?? []
  const sellada = acts.map((a) => a.sellada_en).filter((s): s is string => !!s).sort().at(-1) ?? null
  const plan = planRes.data

  const secciones = seccionesDeCierre({
    obra: {
      codigo: codigos.get(obraId) ?? null, nombre: obra.nombre, cliente: clienteDeObra(obra), estado: obra.estado, etapa: obra.etapa ?? null,
      inicioPlan: obra.fecha_inicio_plan, finPlan: obra.fecha_fin_plan, inicioReal: obra.fecha_inicio_real, finReal: obra.fecha_fin_real, lineaBase: sellada,
    },
    veEconomia: ve,
    economia,
    manoObra: economia?.mano_obra_propia?.puedeVer ? economia.mano_obra_propia.importe : null,
    hh: { plan: plan?.hh_plan ?? null, real: plan?.hh_real ?? null },
    rubros: hhPorRubro(acts, hhRes.data ?? []),
    lecciones: null,
  })
  const hoy = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/San_Juan', dateStyle: 'short', timeStyle: 'short' })
  const titulo = [codigos.get(obraId), obra.nombre].filter(Boolean).join(' · ')
  const bytes = await pdfDeCierre(titulo, clienteDeObra(obra) ?? 'sin cliente', secciones, hoy)
  const archivo = `cierre-${(codigos.get(obraId) ?? obraId).replace(/[^A-Za-z0-9-]/g, '')}.pdf`
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${archivo}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
