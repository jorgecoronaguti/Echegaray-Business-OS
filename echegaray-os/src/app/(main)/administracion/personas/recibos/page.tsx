// D12 / D13 · EL RECIBO DE PAGO DE UNA PERSONA — /administracion/personas/recibos?quincena=…&persona=…
//
// Sueldos: sin `liquida_sueldos()` la ruta no existe (la misma puerta que la solapa Liquidación). La
// cerradura es la base: `recibo_pago_estado` y `liquidacion_linea` no devuelven nada a quien no liquida.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { liquidaSueldos } from '@/features/auth/types/areas'
import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { esFechaISO, quincenaDe } from '@/features/administracion/services/quincena'
import { hoyEnObra } from '@/features/jefe/services/contexto'
import { getQuincenaDeRecibos } from '@/features/recibos/quincena'
import { urlDelPapel } from '@/features/recibos/datos'
import { PaginaRecibo } from '@/features/recibos/components/PaginaRecibo'

export const dynamic = 'force-dynamic'

export default async function ReciboDePagoPage({ searchParams }: { searchParams: Promise<{ quincena?: string; persona?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  if (!liquidaSueldos((await getPerfilActual(supabase)).data?.rol)) notFound()
  const q = quincenaDe(esFechaISO(sp.quincena) ? (sp.quincena as string) : hoyEnObra())
  const { filas, historial, errores } = await getQuincenaDeRecibos(supabase, q)
  const elegida = filas.find((f) => f.personaId === sp.persona) ?? null
  const r = elegida?.recibo ?? null
  const ids = [...new Set(historial.flatMap((h) => [h.emitidoPor, h.papelSubidoPor]).filter((x): x is string => !!x))]
  const [perfiles, urlPapel] = await Promise.all([
    ids.length ? supabase.from('perfiles').select('id, nombre').in('id', ids) : Promise.resolve({ data: [] }),
    urlDelPapel(supabase, r?.papelPath ?? null),
  ])
  const nombreDe = new Map(((perfiles.data ?? []) as { id: string; nombre: string | null }[])
    .filter((p) => p.nombre).map((p) => [p.id, p.nombre as string]))

  return (
    <div style={{ minHeight: '100vh', background: V.fondo, padding: '22px 20px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {errores.map((e) => (
        <Aviso key={e.que} tono="neg" testid="recibo-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
      ))}
      <PaginaRecibo d={{
        desde: q.desde, hasta: q.hasta, filas, elegida, historial, nombreDe, urlPapel,
        volver: `/administracion/personas?vista=liquidacion&solapa=cierre&quincena=${q.desde}#recibos-pago`,
      }} />
    </div>
  )
}
