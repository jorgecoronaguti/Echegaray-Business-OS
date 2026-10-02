'use client'

// LA CASILLA Y LA BARRA DE LOS RECIBOS EN LOTE (dueño, 01/10/2026; rehecho el mismo día).
//
// La primera versión registraba en los legajos y mandaba a imprimir con un clic, sin mostrar la hoja. El dueño la
// rechazó; lo que se rehizo, contra cómo lo resuelven los sistemas de sueldos y las guías de acciones masivas:
//
//   · la barra aparece sólo con algo tildado y dice «7 de 19 seleccionados» (la parte sobre el total a la vista);
//   · su acción es «Vista previa»: nada se guarda ni se imprime sin haber visto la hoja (`VistaPreviaDeRecibos`);
//   · la casilla de quien no tiene nada que cobrar nace apagada, con el motivo: se sabe antes, no después.
//
// El recibo de UNA persona sigue siendo «Generar recibo» en su panel: esto no lo toca.

import { V } from '@/shared/components/v2/patron'
import { textoDeSeleccion, type EstadoDeSeccion } from './lotesDeRecibos'

/** El checkbox de una fila o de un cuadro. El área táctil es de 44 px en el teléfono; el cuadrito es de 16. */
export function CasillaDeRecibo({ estado, alternar, etiqueta, testid, apagada }: {
  estado: EstadoDeSeccion
  alternar: () => void
  etiqueta: string
  testid: string
  /** Por qué no se puede tildar. Con texto, la casilla va apagada y el motivo es su `title`. */
  apagada?: string
}) {
  return (
    <label title={apagada ?? etiqueta}
      className={`inline-flex min-h-8 min-w-8 flex-none items-center justify-center max-[767px]:min-h-11 max-[767px]:min-w-11 ${apagada ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={!apagada && estado === 'todas'} disabled={Boolean(apagada)} onChange={alternar}
        aria-label={apagada ? `${etiqueta}. ${apagada}` : etiqueta} data-testid={testid} data-apagada={apagada ? 'si' : undefined}
        ref={(el) => { if (el) el.indeterminate = !apagada && estado === 'algunas' }}
        style={{ width: 16, height: 16, accentColor: V.grafito, cursor: apagada ? 'not-allowed' : 'pointer', opacity: apagada ? 0.35 : 1 }} />
    </label>
  )
}

export function BarraDeRecibos({ cuantos, de, verPrevia, verDiferencias, quitar }: {
  /** Los tildados que están a la vista. */
  cuantos: number
  /** Las personas a la vista: el «de 19». */
  de: number
  verPrevia: () => void
  /** «Recibos por la diferencia» (dueño, 02/10/2026): el recibo de pago en efectivo de lo que faltó, para los tildados. */
  verDiferencias: () => void
  quitar: () => void
}) {
  if (cuantos === 0) return null
  return (
    // PEGADA AL PIE de la grilla, en el flujo: no empuja el cuadro de arriba. En el teléfono se despega 64 px del
    // borde: ahí abajo vive la barra de navegación (`BarraTelefono`), que le tapaba el botón (QA 01/10/2026, 390 px).
    <div data-testid="barra-recibos" className="sticky bottom-0 bg-surface max-md:bottom-16"
      style={{ zIndex: 5, borderTop: `1px solid ${V.lineaFuerte}`, padding: '8px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', fontSize: '12.5px' }}>
      <span data-testid="barra-recibos-cuenta" style={{ color: V.tinta, fontWeight: 600 }}>{textoDeSeleccion(cuantos, de)}</span>
      <button type="button" onClick={verPrevia} data-testid="recibos-lote-previa"
        className="min-h-9 rounded-md border-0 px-4 text-[13px] font-semibold text-white max-[767px]:min-h-11 max-[767px]:flex-1"
        style={{ background: V.grafito, cursor: 'pointer' }}>
        Vista previa
      </button>
      <button type="button" onClick={verDiferencias} data-testid="recibos-lote-diferencia"
        className="min-h-9 rounded-md bg-transparent px-4 text-[13px] font-semibold max-[767px]:min-h-11 max-[767px]:flex-1"
        style={{ border: `1px solid ${V.lineaFuerte}`, color: V.tinta, cursor: 'pointer' }}>
        Recibos por la diferencia
      </button>
      <button type="button" onClick={quitar} data-testid="recibos-lote-quitar"
        className="min-h-9 border-0 bg-transparent px-1 text-[12.5px] underline max-[767px]:min-h-11"
        style={{ color: V.apagado, cursor: 'pointer' }}>
        quitar selección
      </button>
    </div>
  )
}
