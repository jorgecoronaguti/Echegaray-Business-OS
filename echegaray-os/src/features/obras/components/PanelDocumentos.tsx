'use client'

// EL PANEL DERECHO DE DOCUMENTOS — «Requiere atención» y «Últimos cambios».
//
// Lo que dibuja sale de `documentosPaneles.ts`, y ahí está explicado por qué es MENOS de lo que
// dibuja el canon: no hay vencimientos ni versiones en `obra_documento`, así que no hay «ART
// vencida» que calcular. Este archivo no inventa nada que el servicio no le pase; si la lista de
// avisos viene vacía, se dice que no hay nada pendiente en vez de rellenar con avisos de ejemplo.

import { Estado, TituloPanel } from '@/shared/components/ds'
import type { AvisoDocumentos, CambioDocumento } from '../services/documentosPaneles'
import { fecha as fmtFecha } from './formato'

export function PanelDocumentos({
  avisos, cambios, irA,
}: {
  avisos: AvisoDocumentos[]
  cambios: CambioDocumento[]
  /** Llevar el filtro a una categoría. El aviso sin destino no es un botón: no lleva a ningún lado. */
  irA: (categoria: string) => void
}) {
  return (
    <aside className="flex w-full min-w-0 flex-col gap-6 lg:w-[280px] lg:shrink-0" data-testid="panel-documentos">
      <section className="flex flex-col gap-2.5">
        <TituloPanel>Requiere atención</TituloPanel>
        {avisos.length === 0 ? (
          <p className="text-[12.5px] text-muted">Nada pendiente: todos los papeles están clasificados y confirmados.</p>
        ) : avisos.map((a) => (
          <FilaAviso key={a.clave} aviso={a} irA={irA} />
        ))}
      </section>

      <section className="flex flex-col gap-2.5">
        <TituloPanel>Últimos cambios</TituloPanel>
        {cambios.length === 0 ? (
          // NO se rellena con la fecha del vínculo: es otra ventana de tiempo. Ver `ultimosCambios`.
          <p className="text-[12.5px] text-muted">
            Ningún papel tiene fecha de modificación en Drive.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5" data-testid="ultimos-cambios">
            {cambios.map((c) => (
              <li key={c.driveFileId} className="flex flex-col gap-0.5">
                <span className="truncate text-[12.5px] text-ink">{c.nombre}</span>
                <span className="text-[11.5px] text-faint">
                  {fmtFecha(c.cuando)} · {c.categoria}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

/** Un aviso. Es un botón sólo cuando lleva a algún lado: un botón que no navega enseña a no tocar. */
function FilaAviso({ aviso, irA }: { aviso: AvisoDocumentos; irA: (c: string) => void }) {
  const cuerpo = (
    <span className="flex flex-col gap-0.5 text-left">
      <Estado tono={aviso.tono} clave={aviso.clave}>{aviso.titulo}</Estado>
      <span className="text-[11.5px] text-faint">{aviso.detalle}</span>
    </span>
  )
  if (!aviso.vaA) {
    return <span data-testid={`aviso-${aviso.clave}`}>{cuerpo}</span>
  }
  return (
    <button
      type="button"
      onClick={() => irA(aviso.vaA as string)}
      data-testid={`aviso-${aviso.clave}`}
      className="rounded-control text-left hover:bg-surface-sunken"
    >
      {cuerpo}
    </button>
  )
}
