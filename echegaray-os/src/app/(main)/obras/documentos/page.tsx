// DOCUMENTOS — el índice de papel de todas las obras.
//
// MISMA FUENTE QUE LA SOLAPA DOCUMENTOS DE LA OBRA: `getDocumentos(supabase)`, la misma función sin
// el `where`. Y sigue siendo un ÍNDICE, no un repositorio: el clic termina en Drive, que es donde el
// archivo es la verdad.
//
// ACÁ NO SE VINCULA NI SE DESVINCULA. Esas dos acciones están atadas a la obra por `bind` y el
// `obra_id` no viaja en un campo del formulario: un alta global tendría que pedir la obra en un
// desplegable, es decir, un id editable desde el navegador. Se vincula desde la obra.

import { createClient } from '@/lib/supabase/server'
import { getDocumentos } from '@/features/obras/services/obrasService'
import { getContextoGlobal, hrefObra } from '@/features/obras/services/vistaGlobal'
import { etiquetaDeTipo, urlDeDrive } from '@/features/obras/services/driveUrl'
import { FiltroObra, NavObras } from '@/features/obras/components/NavObras'
import { C, CeldaObra, Fila, Tabla, Vacio } from '@/features/obras/components/tablas'
import { Callout, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

export default async function DocumentosGlobalPage() {
  const supabase = await createClient()
  const ctx = await getContextoGlobal(supabase)
  const { data, error } = await getDocumentos(supabase)
  const filas = data ?? []

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Documentos"
      subtitle={`${filas.length} archivo${filas.length === 1 ? '' : 's'} vinculado${filas.length === 1 ? '' : 's'} a una obra. «Confirmado» lo afirmó una persona; «inferido» lo dedujo el OS por la ruta.`}
    >
      <NavObras />

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <FiltroObra obras={ctx.obras} vista="documentos" />
      </div>

      {error && <Callout tono="neg">No pude leer los documentos: {error}</Callout>}

      {!error && filas.length === 0 && (
        <Vacio>Todavía no hay ningún documento vinculado a las obras visibles.</Vacio>
      )}

      {filas.length > 0 && (
        <Tabla
          testid="tabla-documentos-global"
          min={760}
          cols={[{ k: 'Obra' }, { k: 'Nombre' }, { k: 'Tipo' }, { k: 'Relación' }]}
        >
          {filas.map((d) => (
            <Fila key={`${d.obra_id}:${d.drive_file_id}`} obra={d.obra_id}>
              <CeldaObra
                id={d.obra_id}
                nombre={ctx.nombreDeObra.get(d.obra_id)}
                href={hrefObra(d.obra_id, 'documentos')}
              />
              <C fuerte>
                <a
                  href={urlDeDrive(d.drive_file_id, d.tipo)}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="documento-enlace"
                  className="block max-w-[320px] truncate text-ink hover:underline"
                >
                  {/* Sin nombre se muestra el id: es feo y es la verdad. */}
                  {d.name ?? d.drive_file_id}
                </a>
                {d.rol && <span className="block truncate text-[11px] text-faint">{d.rol}</span>}
              </C>
              <C>{etiquetaDeTipo(d.tipo, d.mime_type, d.name)}</C>
              <C>{d.origen === 'confirmado' ? 'Confirmado' : 'Inferido'}</C>
            </Fila>
          ))}
        </Tabla>
      )}
    </PageShell>
  )
}
