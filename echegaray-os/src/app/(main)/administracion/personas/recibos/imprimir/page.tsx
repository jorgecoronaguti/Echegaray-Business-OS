// LOS RECIBOS EN PAPEL, DE ESCRITORIO — ?quincena=… (los emitidos sin firmar: «Imprimir los N») o
// ?recibo=… (uno, en el estado que tenga). Sólo quien liquida; la base filtra igual.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { liquidaSueldos } from '@/features/auth/types/areas'
import { esFechaISO, quincenaDe } from '@/features/administracion/services/quincena'
import { V } from '@/shared/components/v2/patron'
import { leerRecibo, leerRecibosDeLaQuincena } from '@/features/recibos/datos'
import { periodoCorto } from '@/features/recibos/logica'
import { HojaImprimible } from '@/features/recibos/components/HojaImprimible'

export const dynamic = 'force-dynamic'

export default async function ImprimirRecibosPage({ searchParams }: {
  searchParams: Promise<{ quincena?: string; recibo?: string; pdf?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  if (!liquidaSueldos((await getPerfilActual(supabase)).data?.rol)) notFound()
  const volver = (quincena: string) => (
    <Link href={`/administracion/personas/recibos?quincena=${quincena}`} style={{ fontSize: '13px', color: V.apagado }}>Volver</Link>
  )
  if (sp.recibo) {
    const r = await leerRecibo(supabase, sp.recibo)
    if (r.error) throw new Error(r.error)
    if (!r.data) notFound()
    return <HojaImprimible recibos={[r.data]} titulo={`${r.data.codigo} · ${r.data.personaNombre}`} pdf={sp.pdf === '1'} volver={volver(r.data.desde)} />
  }
  if (!esFechaISO(sp.quincena)) notFound()
  const q = quincenaDe(sp.quincena as string)
  const todos = await leerRecibosDeLaQuincena(supabase, q.desde, q.hasta)
  if (todos.error !== null) throw new Error(todos.error)
  const sinFirmar = todos.data.filter((r) => r.vigente && r.estado === 'emitido' && !r.desactualizado)
  return (
    <HojaImprimible recibos={sinFirmar} pdf={sp.pdf === '1'} volver={volver(q.desde)}
      titulo={`Recibos sin firmar · quincena ${periodoCorto(q.desde, q.hasta)} · ${sinFirmar.length}`} />
  )
}
