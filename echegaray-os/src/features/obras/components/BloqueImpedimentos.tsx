'use client'

// IMPEDIMENTOS — LO QUE FRENA LA OBRA, ENTERO Y EDITABLE.
//
// El dueño (20/08), textual: *"IMPEDIMENTOS: Este bloque sí debe ser editable. Permitir
// + Impedimento. Campos mínimos: descripción, responsable si existe, fecha, estado, notas. Permitir
// cerrar/resolver. Persistir realmente."* Y los ubicó dentro de **Operación**, junto a pedidos,
// compras, herramientas y movimientos: es lo que la obra necesita para ejecutarse cada día.
//
// ═══ POR QUÉ SE MUDÓ, Y QUÉ QUEDÓ DONDE ESTABA ═══
//
// El alta y la liberación vivían dentro de «Próximos trabajos», en Cronograma — y ahí la lista
// estaba FILTRADA a los impedimentos que tocaban la ventana de las próximas semanas. Servía para
// planificar; no servía para preguntar «¿qué tiene trabada esta obra?», porque un impedimento sobre
// una actividad de dentro de dos meses simplemente no aparecía. Acá se muestran TODOS.
//
// En Próximos trabajos quedó la lectura contextual —los que frenan lo que viene— sin formulario:
// dos altas del mismo dato en dos pantallas se contestan distinto el día que a una se le agregue un
// campo. Una sola puerta de escritura, y está acá.
//
// SIN JERGA. Adentro el concepto se llama restricción y la tabla `obra_restriccion`; en la pantalla
// se lee «impedimento». El jefe de obra no tiene por qué aprender el vocabulario de un método para
// anotar que le falta un plano.
//
// UN IMPEDIMENTO SIN RESPONSABLE Y SIN FECHA NO ES GESTIÓN, ES UNA QUEJA ANOTADA. Los dos campos son
// obligatorios en el formulario porque son obligatorios en la acción del servidor: si el formulario
// los dejara pasar, el error volvería igual y la carga se perdería.

import {
  BotonAccion, Callout, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import {
  TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL, type Actividad, type Restriccion,
} from '../types'
import { fecha } from './formato'

export function BloqueImpedimentos({
  impedimentos, actividades, crear, liberar, hoy = new Date(),
}: {
  /** TODOS los de la obra, abiertos y liberados. El filtro por ventana es de Próximos trabajos. */
  impedimentos: Restriccion[]
  /** Para poder colgar el impedimento de la actividad que frena. Opcional en el formulario. */
  actividades: Actividad[]
  crear: AccionFormulario
  liberar: (restriccionId: string) => Promise<ResultadoAccion>
  /** Entra por parámetro para que «vencido» se pueda probar en cualquier fecha. */
  hoy?: Date
}) {
  const hoyIso = hoy.toISOString().slice(0, 10)
  const abiertos = impedimentos.filter((r) => r.estado !== 'liberada')
  const nombreDe = (id: string | null) => (id ? actividades.find((a) => a.id === id)?.nombre ?? null : null)

  // LOS ABIERTOS PRIMERO, y entre ellos el compromiso más viejo arriba: lo vencido es lo que hay
  // que ir a destrabar hoy. Los liberados NO se esconden —son la historia de la obra— pero bajan.
  const orden = [...impedimentos].sort((a, b) => {
    const abiertoA = a.estado !== 'liberada' ? 0 : 1
    const abiertoB = b.estado !== 'liberada' ? 0 : 1
    if (abiertoA !== abiertoB) return abiertoA - abiertoB
    return (a.fecha_compromiso ?? '9999').localeCompare(b.fecha_compromiso ?? '9999')
  })

  return (
    <div className="space-y-3" data-testid="bloque-impedimentos">
      {impedimentos.length === 0 ? (
        <Callout tono="info">
          No hay ningún impedimento cargado. En una obra en ejecución eso rara vez significa que no
          haya: significa que nadie los anotó.
        </Callout>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table data-testid="tabla-impedimentos" className="w-full min-w-[680px] text-left">
            <thead><tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
              <th className="px-3 py-2 font-medium">Qué frena</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 text-right font-medium">Compromiso</th>
              <th className="px-3 py-2 text-right font-medium">Estado</th>
            </tr></thead>
            <tbody>
              {orden.map((r) => {
                const liberado = r.estado === 'liberada'
                const vencido = !liberado && !!r.fecha_compromiso && r.fecha_compromiso < hoyIso
                const act = nombreDe(r.actividad_id)
                return (
                  <tr key={r.id} data-testid="fila-impedimento" className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2 text-[12px] text-ink">
                      {r.descripcion}
                      <span className="block text-[11px] text-faint">
                        {act ?? 'no frena una actividad en particular'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted">{TIPO_RESTRICCION_LABEL[r.tipo] ?? r.tipo}</td>
                    <td className="px-3 py-2 text-[12px] text-muted">
                      {r.responsable ?? <span className="text-warn">sin responsable</span>}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums ${vencido ? 'font-medium text-neg' : 'text-muted'}`}>
                      {fecha(r.fecha_compromiso)}{vencido && ' · vencido'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {liberado
                        ? <span className="text-[11px] uppercase text-faint">liberado</span>
                        : <BotonAccion accion={liberar} args={[r.id]} testid="liberar-impedimento">Liberar</BotonAccion>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {abiertos.length > 0 && (
        <p className="text-[12px] text-faint">
          {abiertos.length} sin resolver de {impedimentos.length}. Liberar uno lo marca resuelto con
          la fecha de hoy; la fila queda.
        </p>
      )}

      <details className="rounded-card border border-line bg-surface" data-testid="alta-impedimento">
        <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">+ Impedimento</summary>
        <div className="border-t border-line p-4">
          <FormAccion accion={crear} testid="form-impedimento" enviar="Anotar" limpiarAlOk mensajeOk="Impedimento anotado.">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Campo label="Qué frena el trabajo" ancho="col-span-2 sm:col-span-4">
                <input name="descripcion" required minLength={3} maxLength={300} className={CTRL} placeholder="falta el plano de detalle del tanque" />
              </Campo>
              <Campo label="Tipo">
                <select name="tipo" required defaultValue="material" className={CTRL}>
                  {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
                </select>
              </Campo>
              <Campo label="Quién lo resuelve" ayuda="Con nombre: sin dueño no se resuelve solo.">
                <input name="responsable" required minLength={2} maxLength={120} className={CTRL} />
              </Campo>
              <Campo label="Para cuándo" ayuda="La fecha comprometida, no un deseo.">
                <input type="date" name="fecha_compromiso" required className={CTRL} />
              </Campo>
              <Campo label="Actividad que frena" ayuda="Opcional. Si se elige, la barra se marca en el Gantt.">
                <select name="actividad_id" defaultValue="" className={CTRL}>
                  <option value="">ninguna en particular</option>
                  {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </Campo>
            </div>
          </FormAccion>
        </div>
      </details>
    </div>
  )
}
