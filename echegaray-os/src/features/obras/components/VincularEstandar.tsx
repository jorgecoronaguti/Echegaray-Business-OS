// EL ESTADO DE VINCULACIÓN DE LA ACTIVIDAD, Y CÓMO RESOLVERLO — mínimo, adentro de la solapa
// Rendimiento, que es donde el estado ya se notaba.
//
// ═══ POR QUÉ NO ES UN CARTEL DE ERROR ═══
//
// Al 22/08/2026 las 350 actividades reales de la empresa están sin vincular: pintarlas de rojo sería
// pintar la pantalla entera y el color dejaría de significar algo. Es deuda declarada, no una falla.
//
// ═══ LA SUGERENCIA VIENE CON SU EVIDENCIA Y NO SE APLICA SOLA ═══
//
// Lo que se muestra es «esta tarea tipo se llama igual», con la frase que lo dice. Aplicarla es un
// click. La barra es alta a propósito —nombre o código EXACTOS, sin empates— porque el vínculo
// decide contra qué estándar se mide el rendimiento de la obra.

import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { CTRL } from '@/shared/components/ui/estilos'
import { Ayuda } from '@/shared/components/ds'
import type { EstadoVinculacion } from '../services/vinculacionEstandar'
import type { VinculacionTarea } from '../services/vinculacionTareaService'

const TITULO: Record<EstadoVinculacion, string> = {
  no_aplica: '',
  vinculada: '',
  sin_vincular: 'Sin vincular al estándar',
  sin_analisis: 'Falta elegir con qué análisis se mide',
}

const EXPLICACION: Record<EstadoVinculacion, string> = {
  no_aplica: '',
  vinculada: '',
  sin_vincular: 'Nadie dijo qué tarea tipo es. Sin eso no hay hs/unidad contra la cual comparar, y lo que esta obra aprenda no vuelve a la Base Maestra.',
  sin_analisis: 'La tarea tipo está elegida, pero falta la variante: es la que fija el rendimiento.',
}

function etiqueta(o: VinculacionTarea['opciones'][number]): string {
  const variante = o.variante ? ` · ${o.variante}` : ''
  const unidad = o.unidad ? ` (${o.unidad})` : ''
  return `${o.codigo} — ${o.nombre}${variante}${unidad}`
}

export function VincularEstandar({ vinculacion, vincular, puedeEditar }: {
  vinculacion: VinculacionTarea
  /** Ya atada a la obra y a la actividad: ningún id viaja en un campo del navegador. */
  vincular: AccionFormulario
  puedeEditar: boolean
}) {
  const { estado, sugerencia, opciones } = vinculacion
  if (estado === 'no_aplica' || estado === 'vinculada') return null

  return (
    <section data-testid="vincular-estandar" className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="text-[12px] font-semibold text-ink">{TITULO[estado]}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{EXPLICACION[estado]}</p>

      {sugerencia && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft" data-testid="sugerencia-estandar">
          <span className="font-medium">Sugerencia:</span> {sugerencia.codigo} — {sugerencia.nombre}
          <span className="block text-[10.5px] text-faint">
            {sugerencia.evidencia}
            {sugerencia.analisisId === null && sugerencia.analisisVigentes > 1 &&
              ` · tiene ${sugerencia.analisisVigentes} análisis vigentes: elegí la variante abajo`}
          </span>
        </p>
      )}

      {!puedeEditar
        ? <p className="mt-2 text-[11px] text-faint">Vincular es de Administración o de la jefatura de obra.</p>
        : opciones.length === 0
          ? (
            <p className="mt-2 text-[11px] text-faint" data-testid="sin-catalogo-estandar">
              No pude leer el catálogo de análisis vigentes, así que no puedo ofrecer contra qué
              vincular. No es que no haya: es que esta lectura no volvió.
            </p>
          )
          : (
            <FormAccion accion={vincular} testid="form-vincular-estandar" enviar="Vincular"
              mensajeOk="Vinculada." className="mt-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-faint">Tarea tipo y variante</span>
                <select name="analisis_id" className={CTRL} data-testid="select-estandar"
                  defaultValue={sugerencia?.analisisId ?? ''} aria-label="Tarea tipo y variante">
                  <option value="">Elegí una…</option>
                  {opciones.map((o) => (
                    <option key={o.analisisId} value={o.analisisId}>{etiqueta(o)}</option>
                  ))}
                </select>
              </label>
              {/* 22/08/2026 · Qué toca vincular se pliega: la garantía de que no pisa nada se
                  consulta una vez, y el resultado de la acción la vuelve a decir después. Lo que
                  queda a la vista es el desplegable, que es lo que hay que elegir. */}
              <Ayuda titulo="Qué toca al vincular" testid="ayuda-vincular-estandar">
                Trae las hs/unidad del análisis vigente. NO pisa lo que la obra ya cargó: si esta
                actividad ya tiene hh_plan o unidad, quedan como están y el resultado lo dice.
              </Ayuda>
            </FormAccion>
          )}
    </section>
  )
}
