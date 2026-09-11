'use client'

// LAS CELDAS QUE SE ESCRIBEN EN LIQUIDACIÓN — una sola definición para las dos pantallas que las
// usan: el cuadro clásico (`CuadroLiquidacion`) y la solapa Pagos del handoff v2.
//
// ═══ POR QUÉ SE MUDARON ACÁ (dueño, 11/09/2026) ═══
//
// Textual: *«el módulo de liquidación de hs está mal hecho, no tengo celdas editables»*. La solapa
// Pagos —la que él abre— dibujaba las cuatro columnas escribibles como un `<span>` con marco de
// control y un comentario que prometía que «el `<input>` real lo monta la grilla editable». No lo
// montaba nadie: la pantalla enseñaba cuáles celdas se escriben y no dejaba escribir ninguna.
//
// La tentación era copiar el `Editable` del otro archivo. Copiarlo habría dado dos definiciones de
// «qué pasa cuando alguien corrige un adelanto»: dos formas de marcar lo manual, dos maneras de
// acusar el error del servidor y, el día que cambie la regla, una de las dos sin cambiar. Por eso se
// mudan enteras y los dos llamadores importan de acá.
//
// ═══ LAS REGLAS QUE ESTAS CELDAS NO PUEDEN ROMPER ═══
//
//  R1  NULL no es cero. Vaciar la celda manda `''` y la acción lo guarda como NULL: deja de haber
//      override y vuelve la cuenta. Un 0 tecleado SÍ se guarda —«no le doy nada por banco» es una
//      afirmación del dueño— y por eso el vacío no se puede traducir a 0 en ningún punto del camino.
//  R6  La quincena cerrada es una foto: `soloLectura` y, además, el servidor relee el estado. La
//      pantalla es la puerta, no la cerradura.
//  R8  Lo escrito a mano se ve que está escrito a mano: `Manual` pone un punto y la palabra, sin
//      fondo de color. Un importe manual disfrazado de calculado es el que nadie puede explicar
//      después frente al recibo.

import { useState, useTransition } from 'react'
import { InlineEdit } from '@/shared/components/ds/InlineEdit'
import { V } from '@/shared/components/v2/patron'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import {
  guardarCeldaLiquidacion, guardarEfectivoRedondeado, guardarValorHora,
} from '../../services/liquidacionActions'
import { pesos } from './formato'

/** La ventana de la quincena que viaja con cada escritura. */
export interface VentanaDeQuincena {
  desde: string
  hasta: string
}

/** LA MARCA DE LO ESCRITO A MANO. Un punto y una palabra: ni fondo de color ni negrita. */
export function Manual() {
  return (
    <span data-testid="marca-manual" title="Escrito a mano: manda sobre el cálculo"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
      <span aria-hidden style={{
        width: 6, height: 6, borderRadius: '50%', background: V.marca, display: 'inline-block',
      }} />
      <span style={{
        fontSize: '9.5px', letterSpacing: '.08em', textTransform: 'uppercase', color: V.tenue,
      }}>manual</span>
    </span>
  )
}

/**
 * UNA CELDA DE LA LÍNEA. Guarda al salir del campo y acusa el error del servidor sin perder lo
 * escrito (contrato de `InlineEdit`).
 *
 * VACÍO BORRA EL OVERRIDE. `InlineEdit` manda `''` cuando se borra el campo, y la acción lo traduce
 * a NULL: convertirlo a 0 fabricaría un dato y liquidaría a alguien en cero.
 */
export function CeldaEditable({
  campo, valor, formato, manual, personaId, quincena, grupo, soloLectura, ancho = 'w-24',
}: {
  campo: CampoEditable
  valor: number | null
  formato: (n: number | null) => string
  manual: boolean
  personaId: string
  quincena: VentanaDeQuincena
  grupo: string
  soloLectura: boolean
  /** La clase de ancho de Tailwind. Pagos tiene columnas más angostas que el cuadro clásico. */
  ancho?: string
}) {
  if (soloLectura) {
    return <>{formato(valor)}{manual && <Manual />}</>
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
      <InlineEdit
        valor={valor}
        tipo="numero"
        alineado="right"
        ancho={ancho}
        falta="—"
        etiqueta={`${campo} de ${personaId}`}
        testid={`celda-${campo}-${personaId}`}
        mostrar={(v) => formato(Number(v))}
        guardar={async (v) => {
          const r = await guardarCeldaLiquidacion({
            ...quincena, grupo, persona_id: personaId, campo, valor: v.trim(),
          })
          return r.ok ? { ok: true } : { ok: false, error: r.error }
        }}
      />
      {manual && <Manual />}
    </span>
  )
}

/**
 * EL $/HORA. Escribe `persona_tarifa` con `desde` = hoy, no la línea de esta quincena.
 *
 * SIN HISTORIAL POR TECLEO: el handoff dice que la retribución no lo tiene y que lo que conserva el
 * pasado es el sellado al cerrar. Vaciar la celda borra la tarifa de hoy y vuelve a mandar la
 * anterior — así un error de tipeo no queda como un aumento.
 */
export function CeldaValorHora({ valor, origen, personaId, quincena, grupo, soloLectura }: {
  valor: number | null
  origen: string | null
  personaId: string
  quincena: VentanaDeQuincena
  grupo: string
  soloLectura: boolean
}) {
  if (soloLectura) return <span title={origen ?? undefined}>{pesos(valor)}</span>

  return (
    <span title={origen ?? undefined} style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
      <InlineEdit
        valor={valor}
        tipo="numero"
        alineado="right"
        ancho="w-20"
        falta="sin tarifa"
        etiqueta={`valor hora de ${personaId}`}
        testid={`celda-valorHora-${personaId}`}
        mostrar={(v) => pesos(Number(v))}
        guardar={async (v) => {
          const r = await guardarValorHora({
            ...quincena, grupo, persona_id: personaId, valor: v.trim(),
          })
          return r.ok ? { ok: true } : { ok: false, error: r.error }
        }}
      />
    </span>
  )
}

/**
 * LA CELDA DEL DUEÑO. Guarda al perder el foco y no recarga la pantalla.
 *
 * VACÍO BORRA EL REDONDEO, NO ESCRIBE CERO: cero significaría «no le doy nada en mano», que es una
 * afirmación distinta de «todavía no lo escribí».
 */
export function CeldaRedondeo({ personaId, valor, quincena, grupo, bloqueada, ancho = 96 }: {
  personaId: string
  valor: number | null
  quincena: VentanaDeQuincena
  grupo: string
  bloqueada: boolean
  ancho?: number
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor))
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()

  if (bloqueada) return <>{pesos(valor)}</>

  const guardar = () => {
    const limpio = texto.trim().replace(/[$.\s]/g, '').replace(',', '.')
    if (limpio === (valor == null ? '' : String(valor))) return
    empezar(async () => {
      const r = await guardarEfectivoRedondeado({
        ...quincena, grupo, persona_id: personaId, importe: limpio,
      })
      setError(r.ok ? null : r.error)
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        disabled={guardando}
        inputMode="decimal"
        aria-label="Efectivo redondeado"
        data-testid={`redondeo-${personaId}`}
        style={{
          width: ancho, textAlign: 'right', fontSize: '12.5px', padding: '3px 6px',
          border: `1px solid ${error ? V.neg : V.linea}`, borderRadius: 4,
          background: '#FFFFFF', color: V.tinta, fontVariantNumeric: 'tabular-nums',
        }}
      />
      {error && <span style={{ fontSize: '10.5px', color: V.neg }}>{error}</span>}
    </span>
  )
}
