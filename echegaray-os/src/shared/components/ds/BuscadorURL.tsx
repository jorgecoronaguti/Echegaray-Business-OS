'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Buscador } from './Controles'
import { urlDeBusqueda } from '@/shared/utils/busqueda'

// EL BUSCADOR QUE FILTRA MIENTRAS SE ESCRIBE Y DEJA EL FILTRO EN LA URL.
//
// ═══ EL DEFECTO QUE CIERRA ═══
//
// El contrato de diseño dice, literal: *"Buscadores filtran al teclear, sin Enter ni botón
// Buscar"*. Obras, Personal y Proveedores exigían Enter —eran `form` GET— y no mostraban ninguna
// señal de que había que apretarlo: quien escribía tres letras veía la lista entera y concluía que
// el buscador estaba roto, o peor, que el dato no estaba. Clientes y Cuentas, en cambio, ya
// filtraban al teclear. La misma lupa tenía tres comportamientos.
//
// ═══ POR QUÉ NO SE RESOLVIÓ HACIENDO TODO DE CLIENTE ═══
//
// Estas listas se filtran en Postgres (`getDirectorio`, `buscarProveedores`, la cartera de obras):
// el navegador no tiene los datos que el filtro descarta. Volverlas de cliente obligaría a bajar el
// legajo entero para poder buscar en él, que es exactamente lo que la RLS y el `select` por columnas
// evitan hoy. Así que el estado sigue viviendo en la URL —se comparte, se recarga y vuelve con el
// botón de atrás— y lo único que cambia es QUIÉN la escribe: antes el navegador al enviar el
// formulario, ahora este componente a cada tecla.
//
// ═══ EL FORMULARIO SIGUE AHÍ ═══
//
// Envuelto en `<form method="get">` con sus campos ocultos: sin JavaScript el buscador sigue
// funcionando como funcionaba. Con JavaScript, Enter no hace nada porque ya no hay nada que enviar
// —la lista se filtró hace 250 ms— y se frena el envío para no repetir la navegación.

/**
 * 250 ms.
 *
 * Entre tecla y tecla de alguien que escribe corrido pasan ~150-200 ms, así que con 250 la consulta
 * sale UNA vez al terminar la palabra en vez de una por letra: escribir «messina» son 7 viajes a
 * Postgres con 0 ms y 1 con 250. Y queda por debajo del umbral en el que la pausa se empieza a
 * sentir como demora (~300 ms), que es el otro lado del error: un debounce generoso convierte
 * «filtra al teclear» en «filtra cuando se me antoja».
 *
 * No se aplica a los buscadores en memoria —Clientes, Cuentas, Operarios, Costos—: ahí filtrar no
 * cuesta un viaje de red y esperar 250 ms sería introducir una demora para no ahorrar nada.
 */
export const ESPERA_MS = 250

export function BuscadorURL({
  accion,
  q,
  placeholder,
  oculto,
  ancho = 'w-full sm:w-[240px]',
  testid,
  variante = 'hairline',
}: {
  /** La ruta a la que vuelve. Es la misma pantalla. */
  accion: string
  q?: string
  placeholder: string
  /** Lo que hay que preservar al buscar (el filtro puesto, el panel abierto). */
  oculto?: Record<string, string | undefined>
  ancho?: string
  /** Nombra el CAMPO, que es con lo que se interactúa; el formulario que lo envuelve queda como
   *  `${testid}-form`. Al revés —el nombre en el formulario— un `getByTestId(...).fill()` apunta al
   *  `<form>` y falla sin decir por qué. */
  testid?: string
  /** `caja` para las carteras portadas del zip. Ver `ds/Controles.tsx` § Buscador. */
  variante?: 'hairline' | 'caja'
}) {
  const router = useRouter()
  const [texto, setTexto] = useState(q ?? '')
  const [navegando, iniciar] = useTransition()
  // Lo último que ESTE campo mandó a la URL. Sirve para distinguir un cambio propio de uno que vino
  // de afuera —un enlace de filtro, «quitar filtros», el botón de atrás—: sin esa distinción el
  // campo se pisaría a sí mismo con la `q` del render anterior mientras se escribe, y escribir
  // «messina» terminaría en «m».
  const enviado = useRef(q ?? '')

  // Los props que llegan como objeto son nuevos en cada render aunque su contenido no cambie: si el
  // efecto dependiera de `oculto` se dispararía siempre. Depende de su CONTENIDO.
  const ocultoClave = JSON.stringify(oculto ?? {})

  useEffect(() => {
    const entrante = q ?? ''
    if (entrante === enviado.current) return
    enviado.current = entrante
    setTexto(entrante)
  }, [q])

  useEffect(() => {
    if (texto.trim() === enviado.current.trim()) return
    const t = setTimeout(() => {
      enviado.current = texto
      const fijos = JSON.parse(ocultoClave) as Record<string, string | undefined>
      // `replace` y no `push`: con `push` el botón de atrás desharía la búsqueda letra por letra y
      // volver a la pantalla anterior costaría siete clics.
      iniciar(() => router.replace(urlDeBusqueda(accion, fijos, texto), { scroll: false }))
    }, ESPERA_MS)
    return () => clearTimeout(t)
  }, [texto, accion, ocultoClave, router])

  return (
    <form
      method="get"
      action={accion}
      onSubmit={(e) => e.preventDefault()}
      data-testid={testid ? `${testid}-form` : undefined}
      aria-busy={navegando || undefined}
      className={`min-w-0 shrink-0 ${ancho}`}
    >
      {Object.entries(oculto ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <Buscador
        value={texto}
        onChange={setTexto}
        name="q"
        placeholder={placeholder}
        testid={testid ?? 'buscador'}
        variante={variante}
      />
    </form>
  )
}
