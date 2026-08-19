// EL PANEL LATERAL DE EDICIÓN — el cambio chico no abre una página.
//
// El dueño: *"priorizar click sobre entidad/campo → panel lateral. Nada de páginas de formulario
// gigantes para cambios simples."* El panel conserva el contexto —la ficha sigue detrás—, agrupa
// campos relacionados y tiene Guardar y Cancelar a la vista.
//
// ═══ CIERRA CUANDO GUARDÓ, NO CUANDO SE MANDÓ ═══
//
// La acción hace `redirect()` a la ficha sin `?editar` DESPUÉS de escribir. Por eso el panel se
// cierra mostrando el dato ya persistido y no una copia optimista: si la base rechaza, no hay
// redirect y el error se ve acá, con lo tipeado intacto.
//
// En el teléfono es una hoja de abajo a pantalla casi completa, no un panel de 380px encogido: es
// el mismo criterio que ya usa `PanelActividad` en el cronograma.

import Link from 'next/link'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import type { ReactNode } from 'react'

export function PanelEdicion({
  titulo, subtitulo, accion, cerrarHref, enviar = 'Guardar', children, testid,
}: {
  titulo: string
  subtitulo?: string
  accion: AccionFormulario
  cerrarHref: string
  enviar?: string
  children: ReactNode
  testid: string
}) {
  return (
    <>
      {/* El fondo sólo existe en el teléfono, donde la hoja tapa la ficha: es la manera de salir sin
          buscar la cruz. En escritorio no hay nada que tapar. */}
      <Link
        href={cerrarHref}
        aria-label="Cerrar el panel"
        className="fixed inset-0 z-30 bg-ink/20 lg:hidden"
      />
      <aside
        data-testid={testid}
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-line bg-surface-quiet p-4 lg:static lg:z-auto lg:max-h-none lg:w-[380px] lg:shrink-0 lg:overflow-visible lg:rounded-none lg:border-l lg:border-t-0"
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-faint">{titulo}</p>
            {subtitulo && <p className="mt-0.5 truncate text-[13px] text-ink">{subtitulo}</p>}
          </div>
          <Link href={cerrarHref} data-testid={`${testid}-cancelar`} className="shrink-0 text-[12px] text-muted hover:text-ink">
            Cancelar
          </Link>
        </div>
        <div className="mt-4">
          <FormAccion accion={accion} testid={`${testid}-form`} enviar={enviar}>
            {children}
          </FormAccion>
        </div>
      </aside>
    </>
  )
}
