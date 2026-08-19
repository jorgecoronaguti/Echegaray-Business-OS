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
import { TIPO_HORA_LABEL, type TipoHora } from '@/features/obras/services/tipoHora'
import { PERIODOS, PERIODO_LABEL, type Periodo } from '../services/periodoHH'

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

/**
 * BLOQUE D — LAS HORAS, COMO REGISTRO OPERATIVO Y NO COMO REPORTE.
 *
 * El dueño: *"En Persona → Horas priorizar una vista operativa tipo registro/timesheet limpia, no un
 * reporte financiero"*, y que la pantalla conteste sin Sheets *"¿cuántas horas trabajó esta persona?
 * ¿en qué fechas? ¿en qué obras? ¿en qué actividades? ¿de qué tipo fueron? ¿cuántas tengo que
 * considerar en la liquidación?"*.
 *
 * Por eso: el período se elige arriba (día · semana · quincena · mes), el total y las clases de hora
 * van en UNA línea de texto —no en cinco tarjetas de cifras, que es la dashboarditis que el
 * lineamiento prohíbe—, y abajo está el registro día por día, abierto, que es lo que se mira de
 * verdad. El corte por obra y por actividad quedan al costado, en dos listas compactas.
 */
export function BloqueHoras({
  periodo, horasPeriodo, porTipo, porObra, porActividad, registros, historial, periodoActivo, hrefPeriodo,
}: {
  periodo: string
  horasPeriodo: number
  porTipo: Record<TipoHora, number>
  porObra: TotalHH[]
  porActividad: TotalHH[]
  /** Lo del período elegido: es el registro que se mira. */
  registros: ImputacionHH[]
  /** TODO lo que tiene cargado, para el desplegable de abajo. */
  historial: ImputacionHH[]
  periodoActivo: Periodo
  hrefPeriodo: (p: Periodo) => string
}) {
  if (historial.length === 0) {
    return (
      <Vacio>
        Sin horas imputadas a nombre de esta persona. Se cargan desde la solapa Personal de la obra.
      </Vacio>
    )
  }
  // Las clases con cero no se escriben: un renglón que dice «Extra 100%: 0 h» en todas las
  // quincenas del año es ruido que tapa la única que sí tuvo.
  const clases = (Object.entries(porTipo) as [TipoHora, number][])
    .filter(([t, h]) => h > 0 && t !== 'normal')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-[19px] font-semibold leading-none tabular-nums text-ink" data-testid="hh-periodo">
            {hh(horasPeriodo)} <span className="text-[12px] font-normal text-faint">trabajadas</span>
          </p>
          {/* LAS CLASES DE HORA, EN UNA LÍNEA. Es exactamente lo que hay que mirar para liquidar, y
              no necesita una tarjeta cada una. */}
          <p className="mt-1.5 text-[11px] text-muted" data-testid="hh-por-tipo">
            {clases.length === 0
              ? 'Todas normales'
              : clases.map(([t, h]) => `${TIPO_HORA_LABEL[t]} ${hh(h)}`).join(' · ')}
            <span className="text-faint"> · {periodo}</span>
          </p>
        </div>
        <nav className="flex gap-1.5" data-testid="periodo-hh">
          {PERIODOS.map((p) => (
            <Link key={p} href={hrefPeriodo(p)} data-testid={`periodo-${p}`}
              aria-current={p === periodoActivo ? 'true' : undefined}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                p === periodoActivo
                  ? 'border-marca bg-marca-soft font-medium text-ink'
                  : 'border-line text-muted hover:text-ink'}`}
            >{PERIODO_LABEL[p]}</Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListaTotales titulo="Por obra" totales={porObra} testid="hh-por-obra" />
        <ListaTotales titulo="Por actividad" totales={porActividad} testid="hh-por-actividad" />
      </div>

      {/* EL REGISTRO, ABIERTO. Es lo que se viene a mirar; esconderlo detrás de un desplegable
          obliga a un toque de más todos los días. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table data-testid="hh-registro" className="w-full min-w-[520px] text-left">
          <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
            <th className="px-3.5 py-2 font-medium">Día</th>
            <th className="px-3 py-2 font-medium">Obra</th>
            <th className="px-3 py-2 font-medium">Actividad</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 text-right font-medium">HH</th>
          </tr></thead>
          <tbody>
            {registros.length === 0 && (
              <tr><td colSpan={5} className="px-3.5 py-3 text-[12px] text-faint">
                Sin horas en este período. Hay {historial.length} imputación(es) en otras fechas.
              </td></tr>
            )}
            {registros.map((r) => (
              <tr key={r.id} data-testid="fila-registro" className="border-b border-line/60 last:border-0">
                <td className="px-3.5 py-1.5 text-[12px] tabular-nums text-muted">
                  {r.fecha ?? `semana del ${r.fecha_inicio_semana}`}
                </td>
                <td className="px-3 py-1.5 text-[12px] text-muted">{r.obra_nombre ?? 'sin obra'}</td>
                <td className="px-3 py-1.5 text-[12px] text-muted">{r.actividad_nombre ?? '—'}</td>
                <td className="px-3 py-1.5 text-[12px] text-muted">
                  {r.tipo_hora !== 'normal' ? TIPO_HORA_LABEL[r.tipo_hora as TipoHora] : ''}
                </td>
                <td className="px-3 py-1.5 text-right text-[12px] tabular-nums text-ink">{hh(r.horas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historial.length > registros.length && (
        <p className="text-[11px] text-faint" data-testid="hh-fuera-del-periodo">
          {historial.length - registros.length} imputación(es) fuera del período elegido.
        </p>
      )}
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
