// PENDIENTES DE IMPUTACIÓN — los textos de obra que nadie clasificó todavía.
//
// El dueño: *"Si la relación es confiable, canonicalizar. Si es ambigua: PENDIENTE DE ASIGNACIÓN.
// Administración debe poder resolverla desde la web. No inventar imputaciones."*
//
// Compras, herramientas y movimientos guardan la obra como TEXTO. `obra_alias` traduce ese texto al
// eje canónico, y es el MISMO diccionario que usa el costo real de la obra. Resolver un texto acá
// arregla todas las filas que dicen lo mismo, hoy y mañana.
//
// LO QUE ESTA PANTALLA NO HACE: sugerir. No hay "¿quisiste decir La Estrella?". Un emparejamiento
// por parecido de nombre imputaría "Estrella Norte" a La Estrella y le fabricaría costo a una obra
// que no lo tuvo — que es exactamente lo que el dueño prohibió.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPortafolio } from '@/features/obras/services/obrasService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { resolverImputacion } from '@/features/obras/services/actionsImputacion'
import { plata } from '@/features/obras/components/formato'
import { Callout, Campo, CTRL, FormAccion, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

interface Pendiente {
  clave: string
  texto: string
  fuentes: string
  filas: number
  monto: number | null
}

export default async function PendientesPage() {
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <PageShell title="Pendientes de imputación" maxWidth="max-w-3xl">
        <Callout tono="warn">Esta pantalla es de Administración.</Callout>
      </PageShell>
    )
  }

  const [{ data: pend }, { data: obras }] = await Promise.all([
    supabase.from('imputacion_pendiente').select('*').returns<Pendiente[]>(),
    getPortafolio(supabase),
  ])
  const lista = pend ?? []
  const activas = (obras ?? []).filter((o) => o.estado !== 'cerrada')

  return (
    <PageShell
      eyebrow={<Link href="/administracion" className="hover:underline">← Administración</Link>}
      title="Pendientes de imputación"
      subtitle="Textos que aparecen en compras, herramientas o movimientos y que todavía no se sabe a qué obra pertenecen."
      maxWidth="max-w-4xl"
    >
      {lista.length === 0 ? (
        <p className="text-[13px] text-muted">
          Nada pendiente. Todo lo que aparece en las tres fuentes está clasificado como una obra o
          como costo de estructura.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="pendientes-lista">
          {lista.map((p) => (
            <li key={p.clave} className="rounded-lg border border-line bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold text-ink">{p.texto}</span>
                <span className="text-[12px] tabular-nums text-faint">
                  {p.filas} fila(s) · {p.fuentes}
                  {p.monto ? ` · ${plata(p.monto)}` : ''}
                </span>
              </div>
              <FormAccion
                accion={resolverImputacion}
                testid={`resolver-${p.clave}`}
                enviar="Resolver"
                mensajeOk="Resuelto. El costo se reimputa solo."
              >
                <input type="hidden" name="clave" value={p.clave} />
                <input type="hidden" name="ejemplo" value={p.texto} />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Campo label="¿Qué es?">
                    <select name="clasificacion" defaultValue="obra" className={CTRL}>
                      <option value="obra">Una obra</option>
                      <option value="mantenimiento">Un mantenimiento</option>
                      <option value="indirecto">Costo de estructura, no de obra</option>
                      <option value="excluido">No corresponde contarlo</option>
                    </select>
                  </Campo>
                  <Campo label="¿Cuál?" ayuda="En blanco si no es una obra.">
                    <select name="obra_id" defaultValue="" className={CTRL}>
                      <option value="">no es una obra</option>
                      {activas.map((o) => (
                        <option key={o.obra_id} value={o.obra_id}>{o.nombre}</option>
                      ))}
                    </select>
                  </Campo>
                </div>
              </FormAccion>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
