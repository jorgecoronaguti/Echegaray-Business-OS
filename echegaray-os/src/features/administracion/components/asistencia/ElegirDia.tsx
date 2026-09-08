'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ELEGIR EL DÍA — «‹ ayer · lunes 7 de septiembre · mañana ›» con el calendario adentro del rótulo.
//
// ═══ POR QUÉ LOS DOS SALTOS SON ENLACES Y EL CALENDARIO NO ═══
//
// «ayer» y «mañana» son navegación: enlaces reales, compartibles, y funcionan aunque el JavaScript
// todavía no hidrató — que en un teléfono en obra, con 3G, es la mitad del tiempo que la pantalla
// está a la vista. El `<input type="date">` no puede ser un enlace porque su destino no existe
// hasta que alguien elige; ése sí navega por código.
//
// ═══ LA PLANTILLA, Y NO UNA FUNCIÓN ═══
//
// El destino lo arma el servidor (que es quien sabe la ruta, la obra y el resto de la query) y lo
// manda como un texto con `__DIA__` adentro. Una función `hrefDe` no cruza el borde servidor →
// cliente, y duplicar acá el armado de la URL sería una segunda definición de la misma ruta: es
// exactamente el bug del `?dia=…?obra=…` que dejó `/campo/asistencia` girando sobre sí mismo.

const TOKEN = '__DIA__'

export function ElegirDia({ dia, rotulo, hrefAyer, hrefManana, plantilla }: {
  dia: string
  rotulo: string
  hrefAyer: string
  hrefManana: string
  /** La URL del día con `__DIA__` donde va la fecha. */
  plantilla: string
}) {
  const router = useRouter()
  return (
    <div className="flex items-center justify-between gap-2" data-testid="elegir-dia">
      <Link
        prefetch={false}
        href={hrefAyer}
        data-testid="dia-anterior"
        aria-label="Ir al día anterior"
        className="inline-flex h-[44px] min-w-[44px] items-center justify-center rounded-[6px] px-2 text-[13px] text-muted hover:text-ink"
      >
        ‹ ayer
      </Link>

      {/* EL RÓTULO ES EL CONTROL. Una etiqueta que dice el día y, al tocarla, abre el calendario:
          el input queda encima con opacidad 0 para conservar el objetivo táctil nativo del sistema
          —que es el único que abre el selector del teléfono— sin dibujar el cuadrito gris de
          `type=date`, que en 390px come la mitad de la línea. */}
      <label className="relative flex h-[44px] min-w-0 flex-1 items-center justify-center rounded-[6px] border border-line px-2">
        <span className="truncate text-[13px] font-medium text-ink" data-testid="dia-rotulo">{rotulo}</span>
        <input
          type="date"
          value={dia}
          aria-label="Elegir el día"
          data-testid="dia-input"
          onChange={(e) => {
            if (e.target.value) router.push(plantilla.replace(TOKEN, e.target.value))
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>

      <Link
        prefetch={false}
        href={hrefManana}
        data-testid="dia-siguiente"
        aria-label="Ir al día siguiente"
        className="inline-flex h-[44px] min-w-[44px] items-center justify-center rounded-[6px] px-2 text-[13px] text-muted hover:text-ink"
      >
        mañana ›
      </Link>
    </div>
  )
}

export const TOKEN_DIA = TOKEN
