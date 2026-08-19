// LOS BLOQUES DE LECTURA DE LA FICHA — asignación, horas y documentos.
//
// Los tres LEEN de las relaciones canónicas y ninguno guarda un resumen al lado. La asignación sale
// de `obra_asignacion` —la misma fila que muestra `Obra → Personal`—, las horas de `registros_hh`, y
// los documentos son vínculos a Drive, nunca copias.
//
// UN CERO NUNCA REEMPLAZA A UN "SIN CARGAR". Donde no hay dato se escribe qué falta, con esas
// palabras: una ficha que dice «0 HH» cuando nadie imputó nada es una ficha que miente despacio.

import Link from 'next/link'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import { urlDeDrive } from '@/features/obras/services/driveUrl'
import type { TotalHH } from '../services/hhPersonaService'
import type { AsignacionDePersona, DocumentoLegajo, ImputacionHH } from '../types'

const hh = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-[13px] text-muted">{children}</p>
}

/** BLOQUE C — dónde está y dónde estuvo. Las vigentes arriba; las cerradas son el historial. */
export function BloqueAsignacion({
  asignaciones, cerrar,
}: {
  asignaciones: AsignacionDePersona[]
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  if (asignaciones.length === 0) {
    return <Vacio>Sin asignaciones a obra. Se cargan desde la solapa Personal de la obra.</Vacio>
  }
  return (
    <div className="overflow-x-auto">
      <table data-testid="ficha-asignaciones" className="w-full min-w-[560px] text-left">
        <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
          <th className="px-1 py-2 font-medium">Obra</th>
          <th className="px-3 py-2 font-medium">Actividad</th>
          <th className="px-3 py-2 font-medium">Cuadrilla</th>
          <th className="px-3 py-2 font-medium">Rol</th>
          <th className="px-3 py-2 font-medium">Desde</th>
          <th className="px-3 py-2 font-medium">Hasta</th>
          <th className="px-3 py-2" />
        </tr></thead>
        <tbody>
          {asignaciones.map((a) => (
            <tr key={a.id} data-testid="fila-asignacion" className="border-b border-line/60 last:border-0">
              <td className="px-1 py-2 text-[13px]">
                <Link href={`/obras/${a.obra_id}`} className="text-ink hover:underline">
                  {a.obra_nombre ?? a.obra_id}
                </Link>
              </td>
              <td className="px-3 py-2 text-[12px] text-muted">{a.actividad_nombre ?? 'toda la obra'}</td>
              <td className="px-3 py-2 text-[12px] text-muted">{a.cuadrilla ?? '—'}</td>
              <td className="px-3 py-2 text-[12px] text-muted">{a.rol ?? 'integrante'}</td>
              <td className="px-3 py-2 text-[12px] tabular-nums text-muted">{a.desde ?? '—'}</td>
              <td className="px-3 py-2 text-[12px] tabular-nums">
                {a.hasta
                  ? <span className="text-faint">{a.hasta}</span>
                  : <span className="text-pos">vigente</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {/* CERRAR NO BORRA: escribe `hasta`. El período queda, y con él el respaldo de las
                    horas que se imputaron mientras estuvo. */}
                {!a.hasta && (
                  <BotonAccion accion={cerrar} args={[a.id]} testid="cerrar-asignacion">Cerrar</BotonAccion>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ListaTotales({ titulo, totales, testid }: { titulo: string; totales: TotalHH[]; testid: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{titulo}</p>
      {totales.length === 0
        ? <p className="text-[12px] text-faint">sin imputaciones</p>
        : (
            <ul data-testid={testid} className="space-y-1">
              {totales.map((t) => (
                <li key={t.clave} className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="min-w-0 truncate text-muted">{t.etiqueta}</span>
                  <span className="shrink-0 tabular-nums text-ink">{hh(t.horas)} HH</span>
                </li>
              ))}
            </ul>
          )}
    </div>
  )
}

/** BLOQUE D — las horas. El período, el corte por obra, el corte por actividad y el detalle. */
export function BloqueHoras({
  periodo, horasPeriodo, porObra, porActividad, historial,
}: {
  periodo: string
  horasPeriodo: number
  porObra: TotalHH[]
  porActividad: TotalHH[]
  historial: ImputacionHH[]
}) {
  if (historial.length === 0) {
    return (
      <Vacio>
        Sin horas imputadas a nombre de esta persona. Se cargan desde la solapa Personal de la obra.
      </Vacio>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">HH del período</p>
          <p className="text-[19px] font-semibold leading-none tabular-nums text-ink" data-testid="hh-periodo">
            {hh(horasPeriodo)}
          </p>
          <p className="mt-1.5 text-[11px] text-faint">{periodo}</p>
        </div>
        <ListaTotales titulo="Por obra" totales={porObra} testid="hh-por-obra" />
        <ListaTotales titulo="Por actividad" totales={porActividad} testid="hh-por-actividad" />
      </div>

      <details className="rounded-lg border border-line bg-surface-quiet">
        <summary className="cursor-pointer px-3.5 py-2 text-[12px] text-muted">
          Historial · {historial.length} imputación(es)
        </summary>
        <div className="overflow-x-auto border-t border-line">
          <table data-testid="hh-historial" className="w-full min-w-[520px] text-left">
            <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
              <th className="px-3.5 py-2 font-medium">Día</th>
              <th className="px-3 py-2 font-medium">Obra</th>
              <th className="px-3 py-2 font-medium">Actividad</th>
              <th className="px-3 py-2 text-right font-medium">HH</th>
            </tr></thead>
            <tbody>
              {historial.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3.5 py-1.5 text-[12px] tabular-nums text-muted">
                    {r.fecha ?? `semana del ${r.fecha_inicio_semana}`}
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-muted">{r.obra_canonica_id ?? 'sin obra'}</td>
                  <td className="px-3 py-1.5 text-[12px] text-muted">{r.actividad_nombre ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right text-[12px] tabular-nums text-ink">{hh(r.horas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

/** BLOQUE E — los documentos. El archivo vive en Drive; acá está el vínculo y se abre allá. */
export function BloqueDocumentos({
  documentos, desvincular,
}: {
  documentos: DocumentoLegajo[]
  desvincular: (documentoId: string) => Promise<ResultadoAccion>
}) {
  if (documentos.length === 0) return <Vacio>Sin documentos vinculados.</Vacio>
  return (
    <div className="overflow-x-auto">
      <table data-testid="ficha-documentos" className="w-full min-w-[520px] text-left">
        <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
          <th className="px-1 py-2 font-medium">Categoría</th>
          <th className="px-3 py-2 font-medium">Documento</th>
          <th className="px-3 py-2 font-medium">Fecha</th>
          <th className="px-3 py-2" />
        </tr></thead>
        <tbody>
          {documentos.map((d) => (
            <tr key={d.id} data-testid="fila-documento" className="border-b border-line/60 last:border-0">
              <td className="px-1 py-2 text-[12px] text-muted">{d.tipo_documento?.replace(/_/g, ' ') ?? '—'}</td>
              <td className="px-3 py-2 text-[13px]">
                {d.drive_file_id
                  ? (
                      <a
                        href={urlDeDrive(d.drive_file_id, 'archivo')}
                        target="_blank" rel="noreferrer"
                        className="text-ink hover:underline" data-testid="abrir-documento"
                      >{d.nombre ?? d.tipo_documento ?? 'documento'}</a>
                    )
                  : <span className="text-warn">{d.nombre ?? 'sin vínculo a Drive'}</span>}
                {d.notas && <span className="block text-[11px] text-faint">{d.notas}</span>}
              </td>
              <td className="px-3 py-2 text-[12px] tabular-nums text-muted">{d.fecha_documento ?? '—'}</td>
              <td className="px-3 py-2 text-right">
                {/* Desvincular saca el vínculo del legajo. El archivo sigue en Drive: acá no hay
                    ninguna copia que borrar. */}
                <BotonAccion accion={desvincular} args={[d.id]} testid="desvincular-documento" tono="peligro">
                  Desvincular
                </BotonAccion>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
