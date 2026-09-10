'use client'

// LOS NÚMEROS DE LAS OC DE UNA OBRA, DEBAJO DE SU NOMBRE — «OC 1984 · 18/06 · $4.336.587».
//
// ═══ POR QUÉ VOLVIERON, Y QUÉ CAMBIÓ ═══
//
// El 10/09/2026 a la mañana los saqué: colgaban del nombre en monoespaciado, mezclaban OC y OP en
// el mismo rótulo y competían con las siete columnas de plata de la derecha. El dueño, mirando
// producción a las 16:20: «esta pantalla sigue sin mostrar el nº de OC». Tenía razón — con el total
// solo, una obra con cinco OC no muestra NINGÚN número, y el número es lo que se busca cuando se
// mira esta lista: es lo que el cliente cita en su orden de pago y en su factura.
//
// Lo que se corrigió no era mostrarlos, era CÓMO:
//
//   · TIPOGRAFÍA NORMAL, no monoespaciada. El mono de esta tabla es para lo que se compara de
//     arriba abajo —las columnas de plata—; un rótulo que se lee en línea no se compara con nada y
//     en mono se ve como una terminal.
//   · SÓLO ÓRDENES DE COMPRA. La OP no se imputa a la fila de la obra: mezclarlas en el mismo
//     renglón —«OP 5146 · 03/09 · $15.328.174 · OC 2162 · +8»— fue lo que hizo ilegible la versión
//     anterior. Lo del cliente se resume en su propia columna.
//   · UNA LÍNEA, y «+N» recién a partir de la QUINTA. Cuatro entran; la quinta empieza a empujar.
//     El «+N» despliega en el lugar y no esconde nada en silencio.
//   · SIN SUBRAYADO FIJO. Aparece al pasar el mouse: cuatro rayas debajo de cada obra son cuatro
//     rayas.
//
// ═══ CADA NÚMERO ABRE SU PDF ═══
//
// Drive cuando el papel ya está subido, el proxy de bytes cuando todavía no (`hrefDelPapel`). Se
// abre en una pestaña nueva: quien está recorriendo la cartera no quiere perder la lista.
//
// ES UN `<button>` Y NO UN `<a>`, y no es un descuido: esto vive DENTRO del `<Link>` de la fila, y
// un `<a>` adentro de otro `<a>` es HTML inválido — el navegador desarma el anidado y la fila queda
// con zonas que navegan a cualquier lado. `preventDefault` + `stopPropagation` son obligatorios por
// lo mismo: sin cortar el evento, tocar un número navegaría además a la obra.
//
// LO QUE SE PIERDE, DICHO: al no ser un ancla no hay «abrir en pestaña nueva» del menú del botón
// derecho ni «copiar dirección del enlace». Es el precio de que la fila entera siga siendo un
// enlace, que es lo que hace usable la lista.

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { MAX_OC_EN_FILA, hrefDelPapel, rotuloDeOC, type Orden } from '../services/papelesCliente'
import { V } from '@/shared/components/v2/patron'

const CLASE_UNO = 'whitespace-nowrap text-left hover:underline max-[767px]:whitespace-normal'
/** Uno al lado del otro; APILADOS a 390px, donde no hay ancho para dos rótulos. */
const CLASE_FILA
  = 'flex items-baseline gap-x-3 gap-y-[2px] flex-wrap max-[767px]:flex-col max-[767px]:items-start'

const ESTILO: CSSProperties = { flexShrink: 0, textAlign: 'left', fontSize: '11.5px' }

export function OrdenesDeLaObra({ ordenes, veEconomia, sangria = 22 }: {
  ordenes: Orden[]
  /** El importe de una OC es precio de venta: sin permiso económico va el número y la fecha. */
  veEconomia: boolean
  /** Cuánto se corre a la derecha para alinearse bajo el nombre (icono + aire). */
  sangria?: number
}) {
  const [todas, setTodas] = useState(false)
  if (!ordenes.length) return null
  const visibles = todas ? ordenes : ordenes.slice(0, MAX_OC_EN_FILA)
  const resto = ordenes.length - visibles.length

  const abrir = (o: Orden) => (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault(); e.stopPropagation()
    window.open(hrefDelPapel(o), '_blank', 'noopener,noreferrer')
  }

  return (
    <span className={CLASE_FILA} style={{ minWidth: 0, paddingLeft: sangria }} data-testid="ordenes-de-la-obra">
      {visibles.map((o) => (
        <button
          key={o.clave}
          type="button"
          data-testid="chip-orden"
          data-orden={o.clave}
          data-drive={o.driveFileId ?? undefined}
          aria-label={`Abrir el PDF de la ${rotuloDeOC(o, veEconomia)}`}
          title={o.driveFileId ? 'Abrir el PDF en Drive' : 'Descargar el PDF (todavía no está subido a Drive)'}
          className={CLASE_UNO}
          style={{ ...ESTILO, color: V.apagado }}
          onClick={abrir(o)}
        >
          {rotuloDeOC(o, veEconomia)}
        </button>
      ))}
      {resto > 0 && (
        <button
          type="button"
          data-testid="chip-orden-resto"
          aria-label={`Ver las otras ${resto} órdenes de compra de esta obra`}
          className={CLASE_UNO}
          style={{ ...ESTILO, color: V.apagado, textDecoration: 'underline', textUnderlineOffset: 3 }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTodas(true) }}
        >
          +{resto}
        </button>
      )}
    </span>
  )
}
