'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { CLAVES_VISTA, cookieDeVista, preferenciaDe } from '../services/vistaRecordada'

// QUIÉN GUARDA LA PREFERENCIA DE VISTA — y por qué NO puede ser el servidor.
//
// ═══ EL DEFECTO QUE ESTO CORRIGE (19/08/2026, medido contra producción) ═══
//
// La preferencia se guardaba en el middleware: cada GET a `/obras` con claves de vista escribía la
// cookie. Pero **Next precarga todos los `<Link prefetch={false}>` que entran en pantalla**, y una precarga es un GET
// idéntico al de una navegación. La barra de filtros tiene seis pastillas, así que el navegador
// guardaba seis preferencias sin que nadie tocara nada y ganaba la última en llegar: se elegía
// «Terminación» y la vista volvía con `etapa=inicio` o con `etapa=` (la pastilla «Todas»).
//
// Se intentó distinguir la precarga por sus cabeceras —`next-router-prefetch`,
// `next-router-segment-prefetch`, `purpose`— y cerró casi todo, pero no todo: seguía entrando una
// forma de precarga que llega con las mismas cabeceras que una navegación real. Perseguir nombres de
// cabecera de un framework que los cambia entre versiones es una carrera que se pierde sola.
//
// ═══ LA DIVISIÓN QUE SÍ SE SOSTIENE ═══
//
//   **El navegador es el único que sabe qué está EN PANTALLA. El servidor es el único que puede
//   evitar el parpadeo al restaurar.**
//
// Una precarga trae bytes y no monta nada: este efecto no corre. Sólo corre cuando la pantalla se
// dibujó de verdad — o sea, cuando alguien está mirando esa vista. Por eso GUARDA el navegador.
// RESTAURAR sigue en el middleware, que es lo que hace que la pantalla salga derecha en la primera
// pintura en vez de corregirse sola a los cien milisegundos.
//
// La cookie deja de ser `httpOnly` porque ahora la escribe el navegador. No es un dato sensible: es
// «cómo quiero ver la lista de obras».
export function RecordarVista() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const nombre = cookieDeVista(pathname)
    if (!nombre) return
    const params = new URLSearchParams(searchParams.toString())
    // Sin ninguna clave de vista no hay nada que recordar — y no se borra lo que había: entrar a
    // `/obras` pelada es justamente lo que dispara la restauración.
    if (!CLAVES_VISTA.some((k) => params.has(k))) return
    const preferencia = preferenciaDe(params)
    if (!preferencia) return
    document.cookie =
      `${nombre}=${encodeURIComponent(preferencia)}; path=/obras; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }, [pathname, searchParams])

  return null
}
