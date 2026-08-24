'use client'

// LA COLUMNA IZQUIERDA DEL CRONOGRAMA — actividad y desvío, medida sobre `07 · Obra Cronograma`.
//
// ═══ POR QUÉ ES UN ARCHIVO Y NO UN COMPONENTE DENTRO DEL LIENZO ═══
//
// Es la mitad de la pantalla que NO se dibuja: es una tabla. Vivía adentro del lienzo y cada
// cambio de tipografía de la lista obligaba a leer 450 líneas de aritmética de barras para
// encontrarla. Lo único que comparte con el lienzo es el alto de fila, que por eso viaja como
// prop: si los dos números se separan, la barra deja de estar en la fila de su actividad y ningún
// test lo nota.
//
// ═══ EL DESVÍO ES LA ÚNICA CIFRA DE ESTA COLUMNA ═══
//
// El mockup pone «ACTIVIDAD» a la izquierda y «DESVÍO» a la derecha, y nada más. Lo demás —HH,
// avance, responsable— vive en el panel de la actividad seleccionada: una tabla con seis columnas
// al lado de un Gantt es dos pantallas peleando por el mismo ancho.

import Link from 'next/link'
import { IconoDesplegar, IconoProblema } from '@/shared/components/iconos'
import { oracionDeActividad } from '../services/nombreDeActividad'
import type { FilaVista } from '../services/vistaCronograma'

/** El desvío contra la base, en palabras. `null` NO es «en fecha»: es que nadie selló una base
 *  contra la cual estar en fecha, y decirlo «en fecha» convertiría una obra sin línea base en una
 *  obra perfectamente cumplida. Los cortes son los del mockup: más de 5 días es rojo. */
export function textoDesvio(d: number | null): { texto: string; clase: string } {
  if (d == null) return { texto: 'sin base', clase: 'text-faint' }
  if (d === 0) return { texto: 'en fecha', clase: 'text-pos' }
  if (d < 0) return { texto: `${d} d`, clase: 'text-pos' }
  return { texto: `+${d} d`, clase: d > 5 ? 'text-neg' : 'text-warn' }
}

/** UNA CABECERA DE FRENTE NUNCA ESTÁ SELECCIONADA. Su `actividadId` es null y la comparación
 *  `seleccionada === f.actividadId` daba verdadero con nada seleccionado —null === null—: las diez
 *  cabeceras aparecían resaltadas en amarillo como si el usuario las hubiera tocado todas. */
export const estaSeleccionada = (f: FilaVista, sel: string | null) =>
  f.actividadId != null && f.actividadId === sel

/** El rayo del camino crítico (mockup 07, `f.critico`). No entra en `shared/components/iconos`
 *  todavía: ese archivo es la iconografía canónica del OS y agregarle un icono nuevo se decide una
 *  vez, para todas las pantallas. Acá queda declarado como deuda visible, no escondido. */
function RayoCritico() {
  return (
    <span title="Camino crítico" data-testid="marca-critica" className="flex shrink-0 text-warn">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
      </svg>
    </span>
  )
}

export interface Props {
  filas: FilaVista[]
  seleccionada: string | null
  hrefDe: (c: { sel?: string | null; mover?: number | null }) => string
  cerrados: ReadonlySet<string>
  plegar: (clave: string) => void
  altoFila: number
  altoCabecera: number
}

export function TablaCronogramaObra({
  filas, seleccionada, hrefDe, cerrados, plegar, altoFila, altoCabecera,
}: Props) {
  // La sangría sólo tiene sentido cuando hay de qué colgar: en la vista plana de actividades todas
  // las filas son del mismo nivel, y sangrarlas a todas es un margen izquierdo disfrazado de árbol.
  const hayGrupos = filas.some((f) => f.nivel === 0)
  return (
    <div className="w-[300px] shrink-0 border-r border-line lg:w-[340px]">
      <div
        className="flex items-end gap-2 border-b border-line bg-surface-quiet px-3.5 pb-[9px] text-[10px] uppercase tracking-[0.05em] text-faint"
        style={{ height: altoCabecera }}
      >
        <span className="flex-1">Actividad</span>
        <span>Desvío</span>
      </div>
      {filas.map((f) => {
        const d = textoDesvio(f.desvio)
        const esGrupo = f.nivel === 0
        const sel = estaSeleccionada(f, seleccionada)
        return (
          <div
            key={f.clave}
            className={`flex items-center gap-2 border-b border-surface-sunken px-3.5 ${
              sel ? 'bg-marca-soft' : 'hover:bg-surface-quiet'
            }`}
            style={{ height: altoFila }}
          >
            {esGrupo
              ? (
                <button
                  type="button" onClick={() => plegar(f.clave)}
                  aria-expanded={!cerrados.has(f.clave)}
                  aria-label={`${cerrados.has(f.clave) ? 'Abrir' : 'Cerrar'} ${f.nombre}`}
                  className="shrink-0 text-faint hover:text-ink"
                >
                  <IconoDesplegar className={`h-[11px] w-[11px] transition-transform ${cerrados.has(f.clave) ? '-rotate-90' : ''}`} />
                </button>
                )
              : <span className="w-[11px] shrink-0" aria-hidden />}
            <Link
              href={f.actividadId ? hrefDe({ sel: f.actividadId, mover: null }) : hrefDe({ sel: null, mover: null })}
              scroll={false}
              data-sel={sel ? '1' : undefined}
              className="flex min-w-0 flex-1 items-center gap-[7px]"
              style={{ paddingLeft: hayGrupos && !esGrupo ? 14 : 0 }}
            >
              <span className={`truncate text-ink ${esGrupo
                ? 'text-[11.5px] font-semibold uppercase tracking-[0.05em]'
                : 'text-[12.5px]'}`}
              >
                {/* Se LEE en oración, se GUARDA como se cargó: la carga viene gritada y 30 filas
                    en mayúsculas no tienen silueta. El dato no se toca. */}
                {oracionDeActividad(f.nombre)}
              </span>
              {f.critica && <RayoCritico />}
              {f.tieneImpedimento && (
                <span className="shrink-0 text-neg" title="Impedimento abierto">
                  <IconoProblema className="h-3.5 w-3.5" />
                </span>
              )}
            </Link>
            <span className={`shrink-0 font-mono text-[11.5px] tabular-nums ${d.clase}`} data-testid="desvio-fila">
              {d.texto}
            </span>
          </div>
        )
      })}
    </div>
  )
}
