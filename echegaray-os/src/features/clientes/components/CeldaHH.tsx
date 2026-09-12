'use client'

// EL ACUMULADO DE HH DE UN TRABAJO, Y EL CAMINO AL DESGLOSE.
//
// «Que de ahí me lleve a un desglose de la obra entera con las personas por día que participaron de
// las HH» (dueño, 11/09/2026 18:38). El número es la puerta: un total sin forma de abrirlo obliga a
// preguntar por mail quién cargó esas horas.
//
// ES UN `<button>` Y NO UN `<a>`, POR LA MISMA RAZÓN QUE `OrdenesDeLaObra`: esta celda vive DENTRO
// del `<Link>` de la fila, y un `<a>` adentro de otro `<a>` es HTML inválido — el navegador desarma
// el anidado y la fila queda con zonas que navegan a cualquier lado. `preventDefault` y
// `stopPropagation` son obligatorios: sin cortar el evento, tocar el número navegaría TAMBIÉN al
// detalle del trabajo, que es a donde va la fila.
//
// LO QUE SE PIERDE, DICHO: al no ser un ancla no hay «abrir en pestaña nueva» ni «copiar dirección».
// Es el precio de que la fila entera siga siendo un enlace.
//
// SIN HORAS NO HAY PUERTA: `href` en `null` dibuja el mismo texto sin navegación. Un «—» que se
// puede apretar y lleva a una pantalla vacía es peor que un «—» quieto.

import { useRouter } from 'next/navigation'
import { V } from '@/shared/components/v2/patron'

export function CeldaHH({ texto, ayuda, href }: {
  /** Ya formateado por `services/horasDeObra.ts`: acá no se decide qué significa un hueco. */
  texto: string
  ayuda: string
  href: string | null
}) {
  const router = useRouter()
  const estilo = { fontSize: '12px', color: V.tintaSuave, textAlign: 'right' as const }

  if (!href) {
    return (
      <span className="truncate font-mono tabular-nums" style={estilo} title={ayuda}>{texto}</span>
    )
  }
  return (
    <button
      type="button"
      data-testid="abrir-desglose-hh"
      data-href={href}
      aria-label={`Ver el desglose de horas por persona y por día (${texto} HH)`}
      title={`${ayuda} — abre el desglose por persona y por día`}
      className="truncate font-mono tabular-nums hover:underline"
      style={estilo}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href) }}
    >
      {texto}
    </button>
  )
}
