// PENDIENTES DE IMPUTACIÓN — los textos que nadie clasificó, con lo que hace falta para clasificarlos.
//
// ═══ LO QUE MIDE ESTA PANTALLA, MEDIDO EL 18/08/2026 CONTRA LA BASE ═══
//
//   Compras (costos_obra)           845 filas · 533 a una obra · 312 estructura · 0 pendientes
//   Pedidos (pedidos_materiales)     17 filas ·  17 a una obra ·   0 estructura · 0 pendientes
//   Herramientas                    149 filas · 118 a una obra ·  29 estructura · 1 pendiente + 1 sin texto
//   Movimientos                      53 filas ·  27 a una obra ·  25 estructura · 1 pendiente
//
// El encargo llegó con "Compras 533/845". Esas 312 filas de diferencia NO son trabajo pendiente:
// son filas que alguien YA declaró costo de estructura (Administración, Taller, F931, UOCRA…).
// Confundirlas con pendientes manda a resolver algo resuelto, y peor, invita a imputarle a una obra
// costo que es de la empresa. Por eso el resumen de arriba separa las cuatro columnas: sin él, la
// pantalla contestaría "faltan 312" a una pregunta cuya respuesta real es "falta 1".
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No propone obras por parecido de nombre. La columna «Sugerido» sale vacía salvo que exista
// evidencia —un juicio humano previo sobre el MISMO texto, o un proveedor que nunca compró para
// otra obra—, y cuando sale, dice por qué. Hoy, con los datos reales, no sale nunca: no hay
// evidencia para el único texto pendiente. Eso es el comportamiento correcto, no una falta.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPortafolio } from '@/features/obras/services/obrasService'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { resolverImputacion } from '@/features/obras/services/actionsImputacion'
import { Callout, PageShell } from '@/shared/components/ui'
import { TablaPendientes } from '@/features/administracion/components/TablaPendientes'
import { PanelPendiente } from '@/features/administracion/components/PanelPendiente'
import {
  ETIQUETA_TIPO, getPendientesDeImputacion, type ResumenFuente,
} from '@/features/administracion/services/imputacionService'

export const dynamic = 'force-dynamic'

function ResumenFuentes({ resumen }: { resumen: ResumenFuente[] }) {
  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-line bg-white">
      <table data-testid="resumen-fuentes" className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3 py-2 font-medium">Fuente</th>
            <th className="px-3 py-2 text-right font-medium">A una obra</th>
            <th className="px-3 py-2 text-right font-medium">Estructura</th>
            <th className="px-3 py-2 text-right font-medium">Pendientes</th>
            <th className="px-3 py-2 text-right font-medium">Sin texto</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {resumen.map((r) => (
            <tr key={r.tipo} data-testid={`resumen-${r.tipo}`} className="border-b border-line/60 last:border-0">
              <td className="px-3 py-2 text-[13px] text-ink">{ETIQUETA_TIPO[r.tipo]}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{r.obra}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-muted">{r.estructura}</td>
              <td className={`px-3 py-2 text-right text-[12px] tabular-nums ${r.pendiente > 0 ? 'text-warn' : 'text-muted'}`}>
                {r.pendiente}
              </td>
              {/* Sin texto = ningún alias puede resolverlo. Se cuenta, pero no entra a la cola:
                  ofrecer resolverlo sería ofrecer un trabajo imposible. */}
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-faint">{r.sin_texto}</td>
              <td className="px-3 py-2 text-right text-[12px] tabular-nums text-ink">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function PendientesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <PageShell title="Pendientes de imputación" maxWidth="max-w-3xl">
        <Callout tono="warn">Esta pantalla es de Administración.</Callout>
      </PageShell>
    )
  }

  const [pendientes, portafolio] = await Promise.all([
    getPendientesDeImputacion(supabase),
    getPortafolio(supabase),
  ])

  if (pendientes.error || !pendientes.data) {
    return (
      <PageShell title="Pendientes de imputación" maxWidth="max-w-3xl">
        <p data-testid="pendientes-error" className="text-[13px] text-neg">
          No pude leer las fuentes: {pendientes.error}
        </p>
      </PageShell>
    )
  }

  const obras = portafolio.data ?? []
  const nombreDeObra = (obraId: string) => obras.find((o) => o.obra_id === obraId)?.nombre ?? obraId
  const elegibles = obras.filter((o) => o.estado !== 'cerrada').map((o) => ({ obra_id: o.obra_id, nombre: o.nombre }))
  const { grupos, resumen } = pendientes.data
  const abierta = sp.c ? grupos.find((g) => g.clave === sp.c) : undefined
  const href = (clave?: string) => `/administracion/pendientes${clave ? `?c=${encodeURIComponent(clave)}` : ''}`

  return (
    <PageShell
      eyebrow={<Link href="/administracion" className="hover:underline">← Administración</Link>}
      title="Pendientes de imputación"
      subtitle="Textos de obra que aparecen en compras, pedidos, herramientas o movimientos y que todavía no se sabe a qué obra pertenecen."
      maxWidth="max-w-6xl"
    >
      <ResumenFuentes resumen={resumen} />

      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-white lg:flex-row">
        <div className="min-w-0 flex-1">
          <TablaPendientes
            grupos={grupos}
            seleccionada={abierta?.clave}
            hrefDe={href}
            nombreDeObra={nombreDeObra}
          />
        </div>
        {abierta && (
          <PanelPendiente
            grupo={abierta}
            obras={elegibles}
            resolver={resolverImputacion}
            cerrarHref={href()}
            nombreDeObra={nombreDeObra}
          />
        )}
      </div>

      <p className="mt-3 px-1 text-[11px] text-faint">
        Resolver un texto escribe una sola fila en el diccionario de obras, y esa fila vale para todas
        las filas que dicen lo mismo — las de hoy y las que entren mañana. Textos distintos se
        resuelven por separado: nunca en lote.
      </p>
    </PageShell>
  )
}
