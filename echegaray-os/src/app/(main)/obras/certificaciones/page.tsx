// CERTIFICACIONES — lo certificado, facturado y cobrado de todas las obras, en una tabla.
//
// MISMA FUENTE QUE LA SOLAPA ECONOMÍA DE LA OBRA: `getCertificados(supabase)` es la misma función
// que usa la ficha, sin el `where`. Acá se leen las FILAS; los TOTALES por obra los publica
// `obra_plan_vs_real` y se miran en la obra. Sumar acá sería la segunda respuesta a "cuánto se
// certificó", y el día que una fila entre por otro camino habría dos.
//
// QUÉ CERTIFICADOS SE VEN LO DECIDE POSTGRES, NO ESTA PANTALLA. Desde
// `20260819T1600_obras_opera_y_lo_comercial_no_viaja.sql` la policy es por obra
// (`ve_obra(obra_canonica_id)`): un jefe de obra ve los de SUS obras y no los de las otras siete.
// Acá no hay un solo `if` de permiso — si lo hubiera, sería una segunda definición del permiso, y
// la de TypeScript no protege la llamada directa a PostgREST, que es por donde se filtra de verdad.

import { createClient } from '@/lib/supabase/server'
import { getCertificados } from '@/features/obras/services/contratoService'
import { getContextoGlobal, hrefObra } from '@/features/obras/services/vistaGlobal'
import { FiltroObra, NavObras } from '@/features/obras/components/NavObras'
import { C, CeldaObra, Fila, Tabla, Vacio } from '@/features/obras/components/tablas'
import { fecha, plata } from '@/features/obras/components/formato'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function CertificacionesGlobalPage() {
  const supabase = await createClient()
  const ctx = await getContextoGlobal(supabase)
  const { data, error } = await getCertificados(supabase)
  const filas = data ?? []

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Certificaciones"
      subtitle="Cada certificado con sus tres etapas: certificado, facturado y cobrado. Un certificado sin facturar no es un error."
    >
      <NavObras />

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <FiltroObra obras={ctx.obras} vista="economia" />
      </div>

      {error && <Callout tono="neg">No pude leer los certificados: {error}</Callout>}

      {!error && filas.length === 0 && (
        <Vacio>Todavía no hay ningún certificado cargado en las obras visibles.</Vacio>
      )}

      {filas.length > 0 && (
        <Tabla
          testid="tabla-certificaciones-global"
          min={880}
          cols={[
            { k: 'Obra' }, { k: 'Nº' }, { k: 'Descripción' }, { k: 'Certificación' },
            { k: 'Certificado', num: true }, { k: 'Facturado', num: true }, { k: 'Cobrado', num: true },
          ]}
        >
          {filas.map((c) => (
            <Fila key={c.id} obra={c.obra_canonica_id}>
              <CeldaObra
                id={c.obra_canonica_id}
                nombre={c.obra_canonica_id ? ctx.nombreDeObra.get(c.obra_canonica_id) : undefined}
                href={c.obra_canonica_id ? hrefObra(c.obra_canonica_id, 'economia') : undefined}
              />
              <C fuerte>{c.numero ?? '—'}</C>
              <C>{c.descripcion ?? '—'}</C>
              <C num>{fecha(c.fecha_certificacion)}</C>
              <C num fuerte>{plata(c.monto_certificado)}</C>
              {/* Sin facturar y sin cobrar se muestran en '—', nunca en $0: un certificado que
                  todavía no se facturó no es una factura de cero pesos. */}
              <C num>{plata(c.monto_facturado)}</C>
              <C num>{plata(c.monto_cobrado)}</C>
            </Fila>
          ))}
        </Tabla>
      )}
    </PageShell>
  )
}
