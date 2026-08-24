// LOS NÚMEROS DE ARRIBA SON EL FILTRO — pantalla 24, §estados de control.
//
// No es un tablero decorativo: cada cifra se toca y la lista de abajo queda con esas filas. Es la
// regla 10 del CLAUDE.md raíz —*nunca crear un dashboard sin decisiones asociadas*— resuelta de la
// forma más barata que hay: el número ES el acceso al trabajo que representa.
//
// ═══ POR QUÉ NO ES `Filtros` DEL DESIGN SYSTEM ═══
//
// `Filtros` dibuja una fila de etiquetas de texto con subrayado. Acá el protagonista es la CIFRA
// —«18 por revisar» se lee de un vistazo, «por revisar» sin número no dice si hay trabajo—, y esa
// jerarquía (valor grande arriba, rótulo chico abajo, separadores) es lo que el contrato de diseño
// pide para esta pantalla. Se usa `Estado` para los tonos y se hereda el resto del sistema.
//
// ═══ EL COLOR SÓLO CUANDO HAY ALGO ═══
//
// «0 duplicados» en rojo enseña a ignorar el rojo. Un KPI en cero se dibuja apagado: el tono es
// información sobre si hay trabajo, no una etiqueta permanente de la columna.

import Link from 'next/link'
import { ROTULO_FILTRO, type FiltroCompras } from '../services/comprasEstado'
import type { Conteos } from '../services/comprasService'

// ESTRUCTURA NO SE ENCIENDE NUNCA. No es trabajo pendiente: el gasto ya está donde va. Está en la
// fila porque explica por qué el costo de las obras es menor que el libro entero, y porque poder
// verlo separado es lo que impide contarlo como «sin imputar».
const TONO: Record<FiltroCompras, string> = {
  capturadas: 'text-ink',
  'por-revisar': 'text-warn',
  'sin-imputar': 'text-warn',
  'sin-resolver': 'text-warn',
  estructura: 'text-ink',
  duplicados: 'text-neg',
}

const ORDEN: FiltroCompras[] = [
  'capturadas', 'por-revisar', 'sin-imputar', 'sin-resolver', 'estructura', 'duplicados',
]

/** Los que son trabajo pendiente: sólo ésos se pintan cuando tienen algo. */
const PENDIENTE: FiltroCompras[] = ['por-revisar', 'sin-imputar', 'sin-resolver', 'duplicados']

export function EstadosDeControl({
  conteos,
  activo,
  hrefDe,
}: {
  conteos: Conteos
  activo: FiltroCompras
  hrefDe: (f: FiltroCompras) => string
}) {
  return (
    <div
      data-testid="estados-de-control"
      className="mb-5 flex flex-wrap items-stretch border-y border-line"
    >
      {ORDEN.map((f) => {
        const n = conteos[f]
        const encendido = PENDIENTE.includes(f) && n > 0
        return (
          <Link
            key={f}
            href={hrefDe(f)}
            data-testid={`kpi-${f}`}
            data-activo={f === activo ? '' : undefined}
            aria-current={f === activo ? 'true' : undefined}
            className={`min-w-[124px] border-r border-line px-4 py-2.5 transition-colors last:border-r-0 hover:bg-surface-quiet ${
              // La regla de la marca sale del TOKEN, no de un hex suelto: `globals.css` es donde
              // vive el amarillo, y una copia acá deja de moverse el día que se corrija allá.
              f === activo ? 'bg-surface-quiet shadow-[inset_0_-2px_0_var(--os-marca)]' : ''
            }`}
          >
            <div className={`font-mono text-[19px] font-semibold leading-tight tabular-nums ${encendido ? TONO[f] : 'text-ink'}`}>
              {n.toLocaleString('es-AR')}
            </div>
            <div className={`mt-0.5 text-[11px] ${encendido ? TONO[f] : 'text-muted'}`}>{ROTULO_FILTRO[f]}</div>
          </Link>
        )
      })}
    </div>
  )
}
