'use client'

// EL BOTÓN «PRESENTE» DE LA COLUMNA HOY — 09/09/2026.
//
// El dueño, textual: *«marcar que la persona está en el trabajo, a través de los usuarios admin /
// jefe de obra, es tan simple como un botón en la vista de computadora que tenés que crear ahí
// donde dice "sin marcar"»*. Hasta hoy declarar presencia se podía SÓLO desde el teléfono
// (`/campo/asistencia`), y Administración —que mira el plantel en una pantalla de 1440— tenía que
// abrir la vista móvil de la obra para decir un hecho que ya sabía.
//
// ═══ NO HAY UNA SEGUNDA ESCRITURA ═══
//
// Llama a `guardarPresencia`, la misma server action del teléfono, con UNA marca. Con eso viene
// gratis todo lo que esa acción ya sabe hacer y que una escritura nueva habría tenido que copiar
// mal: la verificación de la obra, el upsert por `(persona, fecha)` que corrige en vez de duplicar,
// la jornada por defecto en `registros_hh` (9 h L–J, 8 h V) y el `revalidatePath` de las pantallas
// que muestran el día. La regla «la presencia NUNCA se deduce de las horas» sigue intacta: acá se
// afirma el estado y las horas son su consecuencia, nunca al revés.
//
// ═══ LA FILA ENTERA ES UN ENLACE ═══
//
// `TablaPersonas` dibuja cada persona como un `<Link>` al legajo. Sin `preventDefault` +
// `stopPropagation` este clic marcaría la presencia Y navegaría al legajo, y quien lo tocara
// perdería de vista el acuse. Mismo patrón y mismo motivo que `CeldaComprobante`.
//
// ═══ POR QUÉ NO ESTÁ «AUSENTE» AL LADO ═══
//
// Una ausencia sin motivo no sirve para liquidar, y el motivo es un desplegable de once opciones
// que no entra en una celda de 150 px sin convertir la lista en un formulario. «No vino» ya tiene
// su lugar —la pantalla de presencia y la grilla de Asistencia— y ahí se carga con su causa. Queda
// DECLARADO COMO PENDIENTE, no como hecho.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { guardarPresencia } from '../services/presenciaDelDiaActions'

export function BotonPresenteHoy({ personaId, nombre, obraId, fecha }: {
  personaId: string
  /** Sólo para el rótulo accesible: la celda no tiene lugar para repetir el nombre. */
  nombre: string
  /** La obra asignada HOY. Nunca llega vacía: sin obra la celda no dibuja este botón. */
  obraId: string
  fecha: string
}) {
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancar] = useTransition()

  // LO GUARDADO SE DICE EN LA CELDA, NO EN UN CARTEL. `guardarPresencia` revalida
  // `/administracion/personas`, así que el servidor va a devolver «● presente» solo; este estado
  // local es lo que hace que el cambio se vea EN EL ACTO y sin recargar la página.
  if (listo) {
    return (
      <span className="text-pos" style={{ fontSize: '11.5px' }} data-testid="marcado-presente">
        <span style={{ fontWeight: 600 }}>●</span> presente
      </span>
    )
  }

  const marcar = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    setError(null)
    arrancar(async () => {
      const r = await guardarPresencia({
        obra_id: obraId,
        fecha,
        marcas: [{ persona_id: personaId, estado: 'presente', motivo: null }],
      })
      // EL ACUSE SALE DE LO QUE LA BASE DEVOLVIÓ. `guardarPresencia` sólo responde `ok` cuando el
      // upsert trajo filas: un rechazo silencioso de la policy no puede pintar la celda de verde.
      if (r.ok) setListo(true)
      else setError(r.error)
    })
  }

  return (
    <button
      type="button"
      onClick={marcar}
      disabled={pendiente}
      data-testid="marcar-presente"
      aria-label={`Marcar presente a ${nombre} hoy`}
      // EL FALLO SE DICE ENTERO Y DONDE SE TOCÓ. Es lo único que justifica un `title` en esta celda:
      // el mensaje de la base no cabe en 150 px y sin él «no se pudo» no se puede arreglar.
      title={error ?? undefined}
      style={{
        flexShrink: 0, height: 22, padding: '0 7px', borderRadius: 4, cursor: pendiente ? 'wait' : 'pointer',
        fontSize: '11.5px', fontWeight: 500, lineHeight: 1, background: 'transparent',
        // EL AMARILLO NO ES DE ESTA CELDA. La única primaria de la pantalla es «Nueva persona»;
        // diecisiete botones amarillos en una columna convertirían el acento de la marca en el
        // color del fondo. La acción se dice en grafito y el amarillo aparece SÓLO bajo el mouse,
        // que es cuando hay una intención de tocarla.
        border: `1px solid ${error ? V.neg : V.lineaFuerte}`,
        color: error ? V.neg : V.grafito,
      }}
      // EL `!` NO ES ADORNO: el color de fondo y el borde van en `style` —dependen del error— y un
      // estilo inline le gana a cualquier clase que no sea `!important`. Sin él el hover no pinta.
      className={error ? undefined : 'transition-colors hover:!border-[#FDC900] hover:!bg-[#FDC900]'}
    >
      {pendiente ? '…' : error ? 'no se pudo' : 'Presente'}
    </button>
  )
}
