'use client'

// SOBRE UNA VERSIÓN CONGELADA SE PREGUNTA, NO SE MODIFICA.
//
// ═══ POR QUÉ EL CAMPO SIGUE ABIERTO ═══
//
// Un congelado se consulta todo el tiempo: «¿de dónde salen los 47,2 m³?», «¿qué está haciendo caro
// esto?». Explicar no modifica. Cerrar el campo entero para impedir una edición se llevaría puesta
// la mitad del uso de la pantalla, y la edición ya la impide la base: `cot_congelar_con_gate` no
// corre dos veces y las mutaciones sobre una versión congelada se rechazan por API.
//
// ═══ Y ANTE UNA INTENCIÓN MUTANTE, SE OFRECE LA REVISIÓN ═══
//
// El camino existe y es una versión nueva: la ofertada queda intacta y el diff se valoriza contra
// ella. Por eso este aviso enlaza a la acción real —la que ya vive en `AccionesPresupuesto`— en vez
// de explicar un procedimiento que después hay que buscar.

import { C } from '@/shared/components/canon'

export function AvisoCongelada({ version }: { version: number }) {
  return (
    <div
      data-testid="aviso-congelada"
      style={{
        border: `1px solid ${C.linea}`, borderRadius: 8, background: C.superficieTenue,
        padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600, color: C.pos }}>
        v{version} congelada · inmutable
      </span>
      <span style={{ fontSize: 11.5, color: C.tintaSuave, lineHeight: 1.6 }}>
        Las preguntas siguen funcionando: explicar no modifica. Un cambio de cantidad, de alcance, de
        subcontrato o de parámetro no entra en esta versión — para eso hay que abrir una revisión, con
        el botón «Nueva versión» del encabezado. La v{version} ofertada queda intacta.
      </span>
    </div>
  )
}
