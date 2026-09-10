'use client'

// «QUITAR» AL LADO DE «● presente» — 10/09/2026.
//
// El dueño, textual: *«si quiero sacarle el presente a alguien que lo tiene, no puedo actualmente;
// está mal, y así se ve en la imagen. Te dije que asistencia es distinto a horas trabajadas»*.
//
// ═══ POR QUÉ ES TEXTO APAGADO Y NO UN BOTÓN ═══
//
// «Presente» es la acción de la columna y por eso tiene caja. Deshacer no es una acción de la misma
// jerarquía: se usa una vez cada veinte marcas, y dibujarla con el mismo peso pondría dos botones
// en 150 px compitiendo por el mismo ojo. Es el patrón de «corregir» en la grilla de Asistencia —
// texto tenue, sin fondo, sin borde—, no uno nuevo.
//
// ═══ QUITAR NO ES «AUSENTE», Y NO TOCA LAS HORAS ═══
//
// El día vuelve a «sin marcar»: el silencio de que nadie dijo nada, que NO es una falta (regla E
// del 08/09/2026). Y `registros_hh` no se toca: las horas que ya se imputaron a una obra son otro
// hecho, con su propia pantalla. Las dos reglas viven en la acción, no acá; esto sólo lo dice.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { quitarPresencia } from '../services/presenciaDelDiaActions'

export function BotonQuitarPresente({ personaId, nombre, fecha }: {
  personaId: string
  /** Sólo para el rótulo accesible: en 150 px no entra repetir el nombre. */
  nombre: string
  /** El día que se está mirando. Lo manda el servidor: el reloj del navegador no decide qué día
   *  se está deshaciendo. */
  fecha: string
}) {
  const [quitado, setQuitado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancar] = useTransition()

  // LO QUE QUEDÓ SE DICE EN LA CELDA. La acción revalida `/administracion/personas`, así que el
  // servidor va a devolver «sin marcar» solo; este estado local hace que se vea EN EL ACTO.
  if (quitado) {
    return (
      <span style={{ fontSize: '12px', color: V.lupa, flexShrink: 0 }} data-testid="presente-quitado">
        sin marcar
      </span>
    )
  }

  const quitar = (e: React.MouseEvent) => {
    // LA FILA ENTERA ES UN `<Link>` AL LEGAJO. Sin esto, el clic quitaría la marca Y navegaría, y
    // quien lo tocara no vería ni el resultado ni el error. Mismo motivo que `BotonPresenteHoy`.
    e.preventDefault(); e.stopPropagation()
    setError(null)
    arrancar(async () => {
      const r = await quitarPresencia({ persona_id: personaId, fecha })
      // EL ACUSE SALE DE LO QUE LA BASE DEVOLVIÓ: la acción sólo responde `ok` cuando el delete
      // trajo filas. Un rechazo silencioso de la policy no puede pintar la celda de «sin marcar».
      if (r.ok) setQuitado(true)
      else setError(r.error)
    })
  }

  return (
    <button
      type="button"
      onClick={quitar}
      disabled={pendiente}
      data-testid="quitar-presente"
      aria-label={`Quitar la marca de presente de ${nombre}`}
      // EL FALLO ENTERO, DONDE SE TOCÓ. El mensaje de la base no entra en la celda y sin él «no se
      // pudo» no se puede arreglar — incluye el nombre de la migración cuando ése es el motivo.
      title={error ?? 'El día vuelve a «sin marcar». Las horas cargadas no se tocan.'}
      style={{
        flexShrink: 0, background: 'transparent', border: 'none', padding: '0 2px',
        fontSize: '11.5px', lineHeight: 1, cursor: pendiente ? 'wait' : 'pointer',
        color: error ? V.neg : V.apagado,
      }}
      className={error ? undefined : 'hover:!text-[#30302F] underline-offset-2 hover:underline'}
    >
      {pendiente ? '…' : error ? 'no se pudo' : 'quitar'}
    </button>
  )
}
