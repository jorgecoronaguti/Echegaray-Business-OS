'use client'

// «TARDE» Y «SALIÓ ANTES» AL LADO DE «● presente · quitar» — 15/09/2026.
//
// El dueño, textual: *«en pantalla plantel donde marco la asistencia desde computadora tengo que
// tener disponible tardanzas o retiros anticipados»*. La marca ya existía para el teléfono
// (`FormPresencia`) y para la celda de la grilla de Horas (`EditorCeldaAsistencia`); desde el Plantel
// —la pantalla de 1440 donde Administración marca el día— no había forma de ponerla.
//
// ═══ POR QUÉ SON TEXTO APAGADO Y NO BOTONES CON CAJA ═══
//
// Es la misma jerarquía que «quitar»: una acción secundaria sobre un estado que ya está dicho. Dos
// cajas más en la celda pondrían cuatro controles del mismo peso compitiendo por 230 px, y la
// tardanza se marca una vez cada muchas presencias. Cuando la marca ESTÁ, el control deja de ser
// una acción y pasa a ser el dato: se pinta en ámbar con el ▲ —el mismo glifo y el mismo tono que la
// celda de la quincena—, porque vino pero es plata que se pierde.
//
// ═══ NO HAY UNA SEGUNDA ESCRITURA ═══
//
// Llama a `marcarTardanza`, la misma acción que la celda de Horas: la guarda de quincena cerrada, el
// rechazo sobre un ausente y el reintento ante la migración pendiente viven allá. Acá se dice lo que
// la base devolvió y nada más.
//
// ═══ LA FILA ENTERA ES UN ENLACE ═══
//
// `TablaPersonas` dibuja cada persona como un `<Link>` al legajo. Sin `preventDefault` +
// `stopPropagation` el clic marcaría la tardanza Y navegaría, y quien la tocó no vería el acuse ni el
// error. Mismo patrón y mismo motivo que `BotonPresenteHoy` y `BotonQuitarPresente`.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { marcarTardanza } from '../services/presenciaDelDiaActions'
import type { TardanzaDeHoy } from '../services/pulsoDelPlantel'

type Cual = 'llegoTarde' | 'salioAntes'

const ROTULO: Record<Cual, { corto: string; largo: string; testid: string }> = {
  llegoTarde: { corto: 'tarde', largo: 'Llegó tarde', testid: 'marcar-llego-tarde' },
  salioAntes: { corto: 'salió antes', largo: 'Salió antes', testid: 'marcar-salio-antes' },
}

export function MarcaTardanzaHoy({ personaId, nombre, fecha, inicial }: {
  personaId: string
  /** Sólo para el rótulo accesible: en la celda no entra repetir el nombre. */
  nombre: string
  /** El día que se está marcando. Lo manda el servidor, no el reloj del navegador. */
  fecha: string
  /** Lo guardado en `asistencia_dia` hoy. Sin marca llega `undefined`. */
  inicial?: TardanzaDeHoy
}) {
  const [marca, setMarca] = useState<TardanzaDeHoy>(inicial ?? { llegoTarde: false, salioAntes: false })
  const [error, setError] = useState<{ cual: Cual; mensaje: string } | null>(null)
  const [pendiente, arrancar] = useTransition()

  const alternar = (cual: Cual) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const siguiente = { ...marca, [cual]: !marca[cual] }
    setError(null)
    arrancar(async () => {
      const r = await marcarTardanza({
        persona_id: personaId, fecha, llego_tarde: siguiente.llegoTarde, salio_antes: siguiente.salioAntes,
      })
      // EL ACUSE SALE DE LO QUE LA BASE DEVOLVIÓ: la acción compara la fila escrita con lo que mandó y
      // sólo responde `ok` si coinciden. Un rechazo de la policy o una quincena cerrada no pintan ámbar.
      if (r.ok) setMarca(siguiente)
      else setError({ cual, mensaje: r.error })
    })
  }

  return (
    <span
      role="group"
      aria-label={`Tardanza de ${nombre} hoy`}
      data-testid="marca-tardanza-hoy"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
    >
      {(['llegoTarde', 'salioAntes'] as const).map((cual) => (
        <Toggle
          key={cual}
          cual={cual}
          activo={marca[cual]}
          pendiente={pendiente}
          error={error?.cual === cual ? error.mensaje : null}
          onClick={alternar(cual)}
        />
      ))}
    </span>
  )
}

/** Apagado cuando no está; ámbar con ▲ cuando está. El detalle va al `title`: en la celda no entra. */
function Toggle({ cual, activo, pendiente, error, onClick }: {
  cual: Cual; activo: boolean; pendiente: boolean; error: string | null; onClick: (e: React.MouseEvent) => void
}) {
  const r = ROTULO[cual]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pendiente}
      aria-pressed={activo}
      data-testid={r.testid}
      data-activo={activo ? 'si' : undefined}
      // EL FALLO ENTERO, DONDE SE TOCÓ: el mensaje de la base —la quincena cerrada, la migración que
      // falta, el ausente— no entra en la celda y sin él «no se pudo» no se puede arreglar.
      title={error ?? (activo
        ? `${r.largo}: pierde el presentismo de la quincena. Clic para quitar la marca.`
        : `Marcar que ${r.largo.toLowerCase()} hoy`)}
      style={{
        flexShrink: 0, background: 'transparent', border: 'none', padding: '0 2px',
        fontSize: '11.5px', lineHeight: 1, cursor: pendiente ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        fontWeight: activo ? 600 : 400,
        color: error ? V.neg : activo ? V.warn : V.apagado,
      }}
      // EL `!` NO ES ADORNO: el color va en `style` porque depende del error y del estado, y un estilo
      // inline le gana a cualquier clase que no sea `!important`. Sin él el hover no pinta.
      className={error || activo ? undefined : 'hover:!text-ink underline-offset-2 hover:underline'}
    >
      {pendiente ? '…' : error ? 'no se pudo' : activo ? `▲ ${r.corto}` : r.corto}
    </button>
  )
}
