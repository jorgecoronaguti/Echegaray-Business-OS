'use client'

// EL BUSCADOR QUE FILTRA MIENTRAS SE ESCRIBE, SIN PERDER LA URL.
//
// ═══ POR QUÉ NO ALCANZA CON `BuscadorURL` ═══
//
// El de Administración es un `form method="get"`: hay que apretar Enter y la pantalla recarga
// entera. Sobre una tabla de 223 tareas eso es un viaje al servidor por búsqueda y el foco se
// pierde en cada una. El requisito es explícito: filtrar al teclear, sin Enter y sin botón.
//
// ═══ Y POR QUÉ IGUAL LA URL CAMBIA ═══
//
// Filtrar en el navegador y no tocar la dirección haría que una búsqueda no se pueda compartir ni
// recuperar con el botón de atrás. Así que son las dos cosas a la vez, y cada una hace lo suyo:
//
//   el filtrado         es INMEDIATO y local — no espera al servidor, no parpadea
//   la URL              se actualiza en diferido (`replace`, sin apilar historial)
//
// El `replace` va en una transición de baja prioridad para que escribir nunca compita con la
// navegación: sin eso, cada tecla encola un render del servidor y el campo se traba.
//
// ═══ NADA DE `useSearchParams()` ═══
//
// Costó encontrarlo: con ese hook la pantalla se quedaba clavada en el esqueleto de carga. Hace que
// el componente SUSPENDA durante el render del servidor, y como el árbol no tiene una frontera
// propia, el que atiende la caída es el `loading.tsx` de toda el área — la pantalla entera deja de
// pintarse por una caja de búsqueda.
//
// ═══ EL `replace` SÓLO TOCA `q`, Y SE FUSIONA CON LA URL VIVA ═══
//
// Segundo defecto encontrado con el navegador, y más sutil: entre que se deja de escribir y que el
// temporizador dispara hay 300 ms, y en esos 300 ms el usuario puede hacer clic en una fila. Si el
// temporizador REARMA la dirección entera con los parámetros que tenía cuando se montó, PISA la
// navegación recién hecha y la ficha que se acababa de abrir se cierra sola.
//
// Por eso la reescritura no construye la URL: la LEE en el momento de disparar y le cambia una sola
// clave. Lo que pasó en el medio se conserva, porque el que llegó último es el usuario.

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconoBuscar } from '@/shared/components/ds'

/**
 * EL SINCRONIZADOR, APARTE DEL CONTROL. La lógica de abajo costó dos defectos encontrados con el
 * navegador —el hook que suspendía la pantalla entera y la reescritura que cerraba la ficha recién
 * abierta— y por eso vive en UNA función: el canónico 17/18 dibuja el buscador con caja en vez del
 * hairline de este componente, y copiar el efecto en el otro control habría copiado los dos
 * defectos la próxima vez que uno se arregle acá.
 */
export function useUrlQ(valor: string) {
  const router = useRouter()
  const [, empezar] = useTransition()
  const primerRender = useRef(true)

  useEffect(() => {
    // No se reescribe la URL en el primer render: entrar a `?q=acero` desde un enlace no tiene por
    // qué generar una navegación más.
    if (primerRender.current) { primerRender.current = false; return }
    const alAgendar = window.location.pathname + window.location.search
    const t = setTimeout(() => {
      const ahora = window.location.pathname + window.location.search
      // ALGUIEN NAVEGÓ MIENTRAS ESPERÁBAMOS: gana el usuario. Reescribir acá cancelaría la
      // navegación que acaba de hacer —abrir una ficha, cambiar de sub-vista— y la pantalla se le
      // cerraría sola sin explicación.
      if (ahora !== alAgendar) return
      const p = new URLSearchParams(window.location.search)
      if (valor.trim()) p.set('q', valor)
      else p.delete('q')
      const qs = p.toString()
      const destino = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      if (destino === ahora) return
      empezar(() => router.replace(destino, { scroll: false }))
    }, 300)
    return () => clearTimeout(t)
  }, [valor, router, empezar])
}

export function BuscadorVivo({
  valor,
  onCambio,
  placeholder,
  resultados,
  total,
  ancho = 'w-full sm:w-[230px]',
  testid = 'buscador',
}: {
  valor: string
  onCambio: (v: string) => void
  placeholder: string
  /** Cuántas filas quedaron. Se dibuja sólo cuando buscar cambió algo: «223 de 223» no informa. */
  resultados?: number
  total?: number
  ancho?: string
  testid?: string
}) {
  useUrlQ(valor)

  const hayFiltro = valor.trim().length > 0
  return (
    <div className={`min-w-0 shrink-0 ${ancho}`} data-testid={testid}>
      <div className="flex min-w-0 items-center gap-2 border-b border-line">
        <IconoBuscar />
        <input
          type="search"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={`${testid}-q`}
          className="h-control min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint max-lg:h-control-movil"
        />
        {hayFiltro && resultados !== undefined && resultados !== total && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint" data-testid={`${testid}-cuenta`}>
            {resultados}
          </span>
        )}
        {hayFiltro && (
          <button
            type="button"
            onClick={() => onCambio('')}
            aria-label="Limpiar la búsqueda"
            data-testid={`${testid}-limpiar`}
            className="shrink-0 px-1 text-[12px] text-faint transition-colors hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
