// LOS TRES PANELES DE EDICIÓN DE LA 07 — plan de la seleccionada, dependencias y conflictos.
//
// Están fuera de `page.tsx` por tamaño, no por reutilización: el archivo de la pantalla pasó de las
// 500 líneas que este repo se pone como techo. Son componentes de SERVIDOR: las escrituras salen por
// las server actions que la página les ata con `.bind`, no por estado de cliente.

import type { Cronograma } from '../services/cronogramaMotor'
import { Campo, CTRL, FormAccion } from '@/shared/components/ui'
import { editarDuracion } from '../services/actionsPlan'
import { agregarDependencia, quitarDependencia } from '../services/actions'

const fmt = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

export function textosDeConflicto(crono: Cronograma): string[] {
  const nombre = new Map(crono.actividades.map((a) => [a.actividad_id, a.nombre]))
  return crono.conflictos.map((c) => {
    const [a, b] = c.actividades
    return `${nombre.get(a) ?? a} y ${nombre.get(b) ?? b} piden la misma cuadrilla entre el ${fmt(c.desde)} y el ${fmt(c.hasta)}`
  })
}

/**
 * LA DURACIÓN DE LA SELECCIONADA, EDITABLE DESDE ACÁ.
 *
 * ═══ POR QUÉ MUESTRA DE DÓNDE SALE LA DURACIÓN ═══
 *
 * `duracionDe` usa `dias_plan` cuando está cargado y, si no, HH ÷ capacidad. Son dos orígenes y la
 * diferencia importa: escribir días de plan sobre una actividad que hoy se calcula por HH la
 * CONGELA —deja de acompañar los cambios de dotación—, y eso tiene que decirse antes, no después.
 */
export function PlanDeLaSeleccionada({ obraId, fila, puedeEditar, jornada }: {
  obraId: string
  fila: Cronograma['actividades'][number] | null
  puedeEditar: boolean
  jornada: number
}) {
  const dias = fila?.dias_plan == null || fila.dias_plan === '' ? null : Number(fila.dias_plan)
  const porHH = dias == null && fila?.duracion != null
  return (
    <section className="rounded-card border border-line bg-surface p-4" data-testid="plan-seleccionada">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">Plan de la seleccionada</h2>
      {!fila && <p className="text-[12px] text-muted">Tocá una actividad para cambiarle la duración.</p>}
      {fila && (
        <>
          <p className="mb-2 text-[12px] text-ink-soft">
            <strong className="font-semibold">{fila.nombre}</strong>{' '}
            {fila.duracion == null
              ? <span className="text-warn">no tiene plan calculable</span>
              : (<>dura <span className="tnum">{fila.duracion}</span> {fila.duracion === 1 ? 'día hábil' : 'días hábiles'}
                  <span className="text-muted">{porHH ? ` · calculados con HH ÷ capacidad (jornada de ${jornada} h)` : ' · días de plan cargados'}</span>
                </>)}
          </p>
          {puedeEditar
            ? (
              <FormAccion
                accion={editarDuracion.bind(null, obraId, fila.actividad_id)}
                testid="form-duracion" enviar="Guardar duración" mensajeOk="Duración guardada."
              >
                <div className="flex flex-wrap items-end gap-3">
                  <Campo
                    label="Días de plan" ancho="w-[140px]"
                    ayuda={porHH ? 'Cargarlos deja de calcular por HH' : 'Vacío = volver a calcular por HH'}
                  >
                    <input
                      type="number" name="dias" min={0} max={3650} step={1}
                      defaultValue={dias ?? ''} className={CTRL} placeholder="sin cargar"
                    />
                  </Campo>
                </div>
              </FormAccion>
            )
            : (
              <p className="text-[11.5px] text-faint">
                Cambiar la duración es de Administración y de la jefatura de obra.
              </p>
            )}
        </>
      )}
    </section>
  )
}

export function Dependencias({ crono, insumos, seleccionada, obraId, puedeEditar }: {
  crono: Cronograma
  insumos: { dependencias: { id?: string; origen_id: string; destino_id: string; tipo: string; lag_dias: number | string | null }[] }
  seleccionada: string | null
  obraId: string
  puedeEditar: boolean
}) {
  const nombre = new Map(crono.actividades.map((a) => [a.actividad_id, a.nombre]))
  const relacion = (tipo: string, lag: number, dir: 'antes' | 'después') => {
    const base = dir === 'antes'
      ? ({ FS: 'termina antes', SS: 'empieza en paralelo', FF: 'termina junto', SF: 'empieza antes' }[tipo] ?? 'termina antes')
      : ({ FS: 'empieza después', SS: 'empieza en paralelo', FF: 'termina junto', SF: 'termina después' }[tipo] ?? 'empieza después')
    return lag ? `${base} · ${lag > 0 ? '+' : ''}${lag} d` : base
  }
  const filas = seleccionada
    ? [
        ...insumos.dependencias.filter((d) => d.destino_id === seleccionada)
          .map((d) => ({ dir: 'antes' as const, dep: d.id, id: d.origen_id, rel: relacion(d.tipo, Number(d.lag_dias ?? 0), 'antes') })),
        ...insumos.dependencias.filter((d) => d.origen_id === seleccionada)
          .map((d) => ({ dir: 'después' as const, dep: d.id, id: d.destino_id, rel: relacion(d.tipo, Number(d.lag_dias ?? 0), 'después') })),
      ]
    : []
  // Candidatas a predecesora: las ejecutables de la obra menos ella misma y menos las que ya lo son.
  // Ofrecer una que ya está cargada haría que el único resultado posible sea el error de duplicado.
  const yaSonPredecesoras = new Set(
    insumos.dependencias.filter((d) => d.destino_id === seleccionada).map((d) => d.origen_id),
  )
  const candidatas = crono.actividades.filter(
    (a) => a.actividad_id !== seleccionada && !yaSonPredecesoras.has(a.actividad_id),
  )

  return (
    <section className="rounded-card border border-line bg-surface p-4" data-testid="dependencias">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">Dependencias de la seleccionada</h2>
      {!seleccionada && <p className="text-[12px] text-muted">Tocá una actividad para ver de qué depende y qué depende de ella.</p>}
      {seleccionada && filas.length === 0 && (
        <p className="text-[12px] text-warn">
          Esta actividad no tiene ninguna dependencia cargada: no arrastra a nadie y nadie la arrastra.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {filas.map((f) => (
          <li key={`${f.dir}-${f.id}`} className="flex items-baseline gap-3">
            <span className="w-[52px] shrink-0 text-[11px] text-faint">{f.dir}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">{nombre.get(f.id) ?? f.id}</span>
            <span className="shrink-0 text-[11px] text-muted">{f.rel}</span>
            {puedeEditar && f.dep && (
              <FormAccion
                accion={quitarDependencia.bind(null, obraId, f.dep)}
                enviar="Quitar" className="shrink-0" mensajeOk="Precedencia quitada."
              >
                <span className="sr-only">Quitar la precedencia con {nombre.get(f.id) ?? f.id}</span>
              </FormAccion>
            )}
          </li>
        ))}
      </ul>

      {seleccionada && puedeEditar && (
        <div className="mt-3 border-t border-line pt-3">
          <FormAccion
            accion={agregarDependencia.bind(null, obraId, seleccionada)}
            testid="form-dependencia" enviar="Declarar" mensajeOk="Precedencia declarada." limpiarAlOk
          >
            <div className="flex flex-wrap items-end gap-2">
              <Campo label="Depende de" ancho="min-w-[180px] flex-1">
                <select name="origen_id" className={CTRL} defaultValue="">
                  <option value="" disabled>Elegí la actividad</option>
                  {candidatas.map((a) => (
                    <option key={a.actividad_id} value={a.actividad_id}>{a.nombre}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Relación" ancho="w-[92px]">
                <select name="tipo" className={CTRL} defaultValue="FS">
                  <option value="FS">FS</option>
                  <option value="SS">SS</option>
                  <option value="FF">FF</option>
                  <option value="SF">SF</option>
                </select>
              </Campo>
              <Campo label="Demora (d)" ancho="w-[92px]" ayuda="Puede ser negativa">
                <input type="number" name="lag_dias" min={-365} max={365} step={1} defaultValue={0} className={CTRL} />
              </Campo>
            </div>
          </FormAccion>
        </div>
      )}
    </section>
  )
}

export function Conflictos({ crono }: { crono: Cronograma }) {
  const textos = textosDeConflicto(crono)
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-ink">Conflictos de recurso detectados</h2>
      {crono.actividades.every((a) => !a.cuadrilla_id) && (
        <p className="text-[12px] text-warn">
          Ninguna actividad de esta obra tiene cuadrilla asignada: no se puede detectar si dos
          frentes piden la misma gente el mismo día. No es que no haya conflictos — es que no se
          pueden ver.
        </p>
      )}
      {textos.length === 0 && crono.actividades.some((a) => a.cuadrilla_id) && (
        <p className="text-[12px] text-muted">Ninguna cuadrilla queda pedida en dos frentes a la vez.</p>
      )}
      <ul className="flex flex-col gap-2">
        {textos.map((t) => (
          <li key={t} className="flex items-baseline gap-2">
            <span className="shrink-0 text-warn">△</span>
            <span className="text-[12.5px] text-ink-soft">{t}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
