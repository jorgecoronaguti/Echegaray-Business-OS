'use client'

// EL ESTADO DE VINCULACIÓN DE LA ACTIVIDAD, Y CÓMO RESOLVERLO — mínimo, adentro de la solapa
// Rendimiento, que es donde el estado ya se notaba.
//
// LENGUAJE ERP OBRAS (24/09/2026): una caja blanca con el borde de tarjeta del 04 (`bordeTarjeta`,
// radio 8), título 12,5/600, el control de 32 de C01–C10 y la ayuda plegada con chevron.
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
import type { EstadoVinculacion } from '../services/vinculacionEstandar'
import type { VinculacionTarea } from '../services/vinculacionTareaService'
import { C } from './canon/tokens'
import { estiloControl } from './items/crear/Piezas'
import { Nota, Plegado } from './panel/PanelPiezas'

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
    <section data-testid="vincular-estandar" style={{
      border: `1px solid ${C.bordeTarjeta}`, borderRadius: '8px', background: C.superficie, padding: '12px',
      display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>{TITULO[estado]}</div>
      <Nota>{EXPLICACION[estado]}</Nota>

      {sugerencia && (
        <div data-testid="sugerencia-estandar" style={{ fontSize: '12px', lineHeight: 1.5, color: C.tintaMedia }}>
          <span style={{ fontWeight: 500 }}>Sugerencia:</span> {sugerencia.codigo} — {sugerencia.nombre}
          <span style={{ display: 'block', fontSize: '11px', color: C.tenue }}>
            {sugerencia.evidencia}
            {sugerencia.analisisId === null && sugerencia.analisisVigentes > 1 &&
              ` · tiene ${sugerencia.analisisVigentes} análisis vigentes: elegí la variante abajo`}
          </span>
        </div>
      )}

      {!puedeEditar
        ? <div style={{ fontSize: '11.5px', color: C.tenue }}>Vincular es de Administración o de la jefatura de obra.</div>
        : opciones.length === 0
          ? (
            <div data-testid="sin-catalogo-estandar" style={{ fontSize: '11.5px', lineHeight: 1.5, color: C.tenue }}>
              No pude leer el catálogo de análisis vigentes, así que no puedo ofrecer contra qué vincular. No es
              que no haya: es que esta lectura no volvió.
            </div>
          )
          : (
            <FormAccion accion={vincular} testid="form-vincular-estandar" enviar="Vincular" mensajeOk="Vinculada.">
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '12px', color: C.tintaSuave }}>Tarea tipo y variante</span>
                <select name="analisis_id" data-testid="select-estandar" aria-label="Tarea tipo y variante"
                  defaultValue={sugerencia?.analisisId ?? ''} style={{ ...estiloControl(32), fontSize: '12.5px' }}>
                  <option value="">Elegí una…</option>
                  {opciones.map((o) => (
                    <option key={o.analisisId} value={o.analisisId}>{etiqueta(o)}</option>
                  ))}
                </select>
              </label>
              {/* 22/08/2026 · Qué toca vincular se pliega: la garantía de que no pisa nada se
                  consulta una vez, y el resultado de la acción la vuelve a decir después. */}
              <div style={{ marginTop: '8px' }}>
                <Plegado rotulo="Qué toca al vincular" testid="ayuda-vincular-estandar">
                  <Nota>
                    Trae las hs/unidad del análisis vigente. NO pisa lo que la obra ya cargó: si esta actividad
                    ya tiene hh_plan o unidad, quedan como están y el resultado lo dice.
                  </Nota>
                </Plegado>
              </div>
            </FormAccion>
          )}
    </section>
  )
}
