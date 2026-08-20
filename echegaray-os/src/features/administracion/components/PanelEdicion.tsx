// EL PANEL LATERAL DE EDICIÓN — el cambio chico no abre una página.
//
// El dueño: *"priorizar click sobre entidad/campo → panel lateral. Nada de páginas de formulario
// gigantes para cambios simples."* El panel conserva el contexto —la lista sigue al lado—, agrupa
// campos relacionados y tiene Guardar y Cancelar a la vista.
//
// ═══ POR QUÉ NO ES EL `PanelDetalle` DEL DESIGN SYSTEM ═══
//
// `PanelDetalle` cierra con `onCerrar`, o sea una función: es de cliente. Estas pantallas son server
// components enteros y su selección vive en la URL (`?nueva=1`, `?editar=identidad`), que es lo que
// permite compartirlas, recargarlas y cerrarlas con el botón de atrás. Se cierra con un `Link`, no
// con estado. La ANATOMÍA es la misma que describe `COMPONENTS.md` §Drawer —cabecera con título
// 16/600 y ✕, contenido, panel permanente a la derecha en escritorio y hoja en el teléfono— para
// que las dos se lean como el mismo objeto.
//
// ═══ CIERRA CUANDO GUARDÓ, NO CUANDO SE MANDÓ ═══
//
// La acción hace `redirect()` a la pantalla sin el parámetro DESPUÉS de escribir. Por eso el panel
// se cierra mostrando el dato ya persistido y no una copia optimista: si la base rechaza, no hay
// redirect y el error se ve acá, con lo tipeado intacto.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { PRIMARIA_FORM } from './Controles'

export function PanelEdicion({
  titulo, subtitulo, accion, cerrarHref, enviar = 'Guardar', ayuda, children, testid,
}: {
  titulo: string
  subtitulo?: string
  accion: AccionFormulario
  cerrarHref: string
  enviar?: string
  /** La línea que explica qué NO se carga acá. Va al pie, en `faint`. */
  ayuda?: ReactNode
  children: ReactNode
  testid: string
}) {
  return (
    <>
      {/* El fondo sólo existe bajo `lg`, donde la hoja tapa la lista: es la manera de salir sin
          buscar la cruz. En escritorio no hay nada que tapar — y un fondo invisible que intercepta
          el primer clic es un defecto que sólo aparece en el teléfono. */}
      <Link href={cerrarHref} aria-label="Cerrar el panel" className="fixed inset-0 z-30 bg-ink/20 lg:hidden" />
      <aside
        data-testid={testid}
        className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-card border-t border-line bg-surface p-4 lg:static lg:z-auto lg:max-h-none lg:w-[328px] lg:shrink-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pl-2"
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong lg:hidden" />
        <div className="flex items-baseline gap-2.5">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{titulo}</h2>
          <Link
            href={cerrarHref}
            data-testid={`${testid}-cancelar`}
            aria-label="Cerrar el panel"
            className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
          >✕</Link>
        </div>
        {subtitulo && <p className="mt-1 truncate text-[12.5px] text-muted">{subtitulo}</p>}
        <div className="mt-4">
          <FormAccion accion={accion} testid={`${testid}-form`} enviar={enviar} className={PRIMARIA_FORM}>
            {children}
          </FormAccion>
        </div>
        {ayuda && <p className="mt-4 text-[11px] leading-relaxed text-faint">{ayuda}</p>}
      </aside>
    </>
  )
}
