'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Tarjeta, CabeceraTarjeta, Chevron } from './TarjetaResumen'

// ATENCIÓN — LO ÚNICO QUE HAY QUE IR A HACER HOY, Y EL VERBO QUE LO HACE.
//
// ═══ POR QUÉ EL RENGLÓN DEJÓ DE SER ROJO ENTERO ═══
//
// Antes cada ítem era una oración larga pintada de rojo o ámbar de punta a punta. Cinco renglones
// rojos seguidos no jerarquizan nada: el ojo los lee como un bloque de ruido y el color deja de
// significar urgencia porque lo tiene todo. El canónico 02 parte la fila en cuatro piezas con pesos
// distintos —punto de color · QUÉ pasa en tinta · DÓNDE pasa en faint · el VERBO que lo resuelve—
// y el color queda sólo en el punto y en el verbo, que es donde decide.
//
// ═══ EL VERBO NO ES DECORACIÓN ═══
//
// «Resolver», «Asignar», «Cargar», «Ver» declaran qué tipo de trabajo espera del otro lado del
// click. Una alerta que no dice qué se hace con ella es una alerta que se mira y se deja.
//
// ═══ LOS FILTROS SEPARAN DOS COSAS QUE NO SON LA MISMA ═══
//
// «Bloqueos» es la obra frenada por un hecho —un impedimento vencido, un atraso medido—. «Faltan
// datos» es el OS diciendo que no puede medir: no hay línea base sellada, no hay HH cargadas. Las
// dos piden trabajo, pero de gente distinta y con urgencia distinta, y mezcladas en una sola lista
// el faltante administrativo entierra al bloqueo de obra. El filtro es del cliente porque es una
// lectura, no una consulta: los ítems ya están todos acá y ninguno se pide de nuevo al servidor.

export type ClaseAtencion = 'bloqueo' | 'dato'

export interface ItemAtencion {
  clave: string
  tono: 'neg' | 'warn'
  clase: ClaseAtencion
  /** QUÉ pasa, corto. Va en tinta. */
  titulo: string
  /** DÓNDE pasa: la actividad, el proveedor, la fecha. Va en faint, al lado. */
  contexto?: string
  /** El verbo de la acción, a la derecha. */
  accion: string
  href: string
  /** De dónde sale el dato. Viaja en el `title`, nunca en el renglón: sirve para auditar. */
  origen?: string
}

const PUNTO = { neg: 'bg-neg', warn: 'bg-warn' } as const
const VERBO = { neg: 'text-neg', warn: 'text-warn' } as const

function IconoAlerta() {
  return (
    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}

function Chip({ activo, texto, n, onClick }: {
  activo: boolean; texto: string; n: number; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      data-testid={`filtro-atencion-${texto.toLowerCase().replace(/\s/g, '-')}`}
      className={`flex items-center gap-1.5 rounded-control border px-2.5 py-[3px] text-[11.5px] transition-colors ${
        activo
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-surface text-muted hover:bg-surface-quiet hover:text-ink'
      }`}
    >
      {texto}
      <span className={`font-mono text-[10.5px] tabular-nums ${activo ? 'text-white/70' : 'text-faint'}`}>{n}</span>
    </button>
  )
}

/** Los tres cortes del canónico 02. `null` = «Todo». */
type Corte = null | ClaseAtencion

export function AtencionObra({ items }: { items: ItemAtencion[] }) {
  const [corte, setCorte] = useState<Corte>(null)
  const bloqueos = items.filter((i) => i.clase === 'bloqueo').length
  const datos = items.filter((i) => i.clase === 'dato').length
  const visibles = corte == null ? items : items.filter((i) => i.clase === corte)
  const graves = items.filter((i) => i.tono === 'neg').length

  if (items.length === 0) {
    return (
      <Tarjeta testid="atencion-obra">
        <CabeceraTarjeta icono={<span className="text-pos"><IconoAlerta /></span>} titulo="Atención" />
        <div className="flex items-center gap-2 px-4 py-5 text-[12.5px] text-pos" data-testid="sin-atencion">
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
          Nada que atender hoy.
        </div>
      </Tarjeta>
    )
  }

  return (
    <Tarjeta testid="atencion-obra">
      <CabeceraTarjeta
        icono={<span className={graves > 0 ? 'text-neg' : 'text-warn'}><IconoAlerta /></span>}
        titulo="Atención"
        cifra={`${items.length} para resolver`}
        accion={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Chip activo={corte == null} texto="Todo" n={items.length} onClick={() => setCorte(null)} />
            <Chip activo={corte === 'bloqueo'} texto="Bloqueos" n={bloqueos} onClick={() => setCorte('bloqueo')} />
            <Chip activo={corte === 'dato'} texto="Faltan datos" n={datos} onClick={() => setCorte('dato')} />
          </div>
        }
      />
      {visibles.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-faint" data-nulo="">
          Nada en este corte. Hay {items.length} en «Todo».
        </p>
      ) : (
        <ul>
          {visibles.map((i) => (
            <li key={i.clave} className="border-b border-surface-sunken last:border-b-0">
              <Link
                href={i.href}
                title={i.origen}
                data-testid={`atencion-${i.clave}`}
                className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-quiet"
              >
                <span aria-hidden className={`h-[7px] w-[7px] shrink-0 rounded-full ${PUNTO[i.tono]}`} />
                <span className="min-w-0 shrink truncate text-[12.5px] text-ink">{i.titulo}</span>
                {i.contexto && (
                  <span className="min-w-0 shrink truncate text-[11.5px] text-faint">{i.contexto}</span>
                )}
                <span className={`ml-auto shrink-0 text-[11.5px] font-medium ${VERBO[i.tono]}`}>{i.accion}</span>
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  )
}
