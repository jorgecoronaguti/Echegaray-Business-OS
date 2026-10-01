'use client'

// LOS RANGOS DE FECHA DE LA LÍNEA DE FILTROS DE COBRANZAS (dueño, 01/10/2026).
//
// Es un componente de cliente sólo para aplicar al elegir la fecha, sin un botón «Aplicar» que el
// dueño tendría que buscar. El estado NO vive acá: cada cambio reescribe la URL (`router.replace`) y
// el servidor vuelve a medir filas, cifras y cuentas. Recibe sólo strings —ninguna función— para no
// cruzar la frontera servidor/cliente con una arrow (React #419).
//
// Los rótulos son los del Sheet: «Factura» = «Fecha de Factura» (col. Q), «Cobro» = «Fecha cobro» (col. R).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

type Clave = 'fdesde' | 'fhasta' | 'cdesde' | 'chasta'

const CAMPO =
  'h-8 min-w-0 rounded-md border border-line bg-transparent px-2 text-[12px] text-ink '
  + 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent max-md:min-h-[44px] max-md:flex-1'

function Rango({ rotulo, testid, claves, valores, aplicar }: {
  rotulo: string
  testid: string
  claves: [Clave, Clave]
  valores: [string, string]
  aplicar: (clave: Clave, valor: string) => void
}) {
  return (
    <div data-testid={testid} className="flex items-center gap-2 max-md:w-full">
      <span className="text-[12px] font-semibold text-ink-soft max-md:w-16">{rotulo}</span>
      {([0, 1] as const).map((i) => (
        <label key={claves[i]} className="flex min-w-0 items-center gap-1 max-md:flex-1">
          <span className="sr-only">{rotulo} {i === 0 ? 'desde' : 'hasta'}</span>
          <input
            type="date"
            data-testid={`${testid}-${i === 0 ? 'desde' : 'hasta'}`}
            defaultValue={valores[i]}
            // La clave por valor: «quitar fechas» vuelve a montar el campo vacío.
            key={`${claves[i]}-${valores[i]}`}
            onChange={(e) => aplicar(claves[i], e.target.value)}
            className={CAMPO}
          />
        </label>
      ))}
    </div>
  )
}

export function FiltroDeFechas({ hrefSinFechas, valores, hayActivas, conFactura }: {
  /** La dirección actual SIN los cuatro parámetros de fecha: conserva solapa y recorte. */
  hrefSinFechas: string
  valores: Record<Clave, string>
  hayActivas: boolean
  /** `false` = la vista todavía no publica la fecha de factura: no se ofrece un filtro que no mide nada. */
  conFactura: boolean
}) {
  const router = useRouter()
  const [, empezar] = useTransition()

  const aplicar = (clave: Clave, valor: string) => {
    const [ruta, query = ''] = hrefSinFechas.split('?')
    const p = new URLSearchParams(query)
    const siguiente = { ...valores, [clave]: valor }
    for (const [k, v] of Object.entries(siguiente)) if (v) p.set(k, v)
    const s = p.toString()
    empezar(() => router.replace(`${ruta}${s ? `?${s}` : ''}`, { scroll: false }))
  }

  return (
    <div data-testid="filtro-fechas" className="flex flex-wrap items-center gap-x-4 gap-y-2 max-md:w-full">
      {conFactura && <Rango rotulo="Factura" testid="filtro-fechas-factura" claves={['fdesde', 'fhasta']} valores={[valores.fdesde, valores.fhasta]} aplicar={aplicar} />}
      <Rango rotulo="Cobro" testid="filtro-fechas-cobro" claves={['cdesde', 'chasta']} valores={[valores.cdesde, valores.chasta]} aplicar={aplicar} />
      {hayActivas && (
        <Link
          href={hrefSinFechas}
          prefetch={false}
          data-testid="filtro-fechas-quitar"
          className="text-[12px] text-ink underline max-md:inline-flex max-md:min-h-[44px] max-md:items-center"
        >
          Quitar fechas
        </Link>
      )}
    </div>
  )
}
