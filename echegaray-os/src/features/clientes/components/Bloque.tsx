// EL BLOQUE — la unidad de la que está hecho el record del cliente.
//
// ═══ POR QUÉ EXISTE ═══
//
// Cuando la ficha tenía cinco solapas, cada una era una pantalla y no necesitaba rótulo: el rótulo
// era la solapa. En un record de una sola pantalla, obras, contactos, documentos y actividad viven
// una debajo de la otra y hace falta saber, sin pensarlo, dónde termina una y empieza la otra.
//
// El alta de cada bloque («+ Contacto», «+ Nueva obra», «+ Vincular un archivo») la trae el propio
// contenido, y va ARRIBA de su tabla: al final de una tabla de 60 filas no la encuentra nadie y el
// bloque se queda vacío para siempre. Por eso este marco no tiene un slot de acciones — tenerlo
// invitaría a poner el botón en un lugar y la tabla en otro.
//
// ═══ POR QUÉ NO ES UNA `Card` ═══
//
// `Card` dibuja borde, fondo y sombra. Anidada alrededor de tablas que YA tienen su borde
// (`rounded-xl border border-line bg-white`), da dos marcos concéntricos por bloque y cuatro
// bloques dan ocho marcos: es exactamente el ruido que el dueño pidió sacar. Acá el bloque aporta
// SEPARACIÓN y JERARQUÍA —un título, un contador, una acción— y el contenido trae su propia
// superficie. Cero chrome adicional.

import type { ReactNode } from 'react'

export function Bloque({
  titulo,
  cuenta,
  children,
  testid,
}: {
  titulo: string
  /** Cuántos hay. Va PEGADO al título y no en una tarjeta: «Obras asociadas 3» se lee de un golpe,
   *  y un recuadro con un 3 adentro ocupa cien veces más para decir lo mismo. `undefined` cuando
   *  contar no significa nada (la actividad, que se recorta). */
  cuenta?: number
  children: ReactNode
  testid?: string
}) {
  return (
    <section data-testid={testid} className="min-w-0">
      <h2 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold uppercase tracking-wide text-ink">
        {titulo}
        {cuenta != null && <span className="text-[12px] font-normal tabular-nums text-faint">{cuenta}</span>}
      </h2>
      {children}
    </section>
  )
}

/**
 * El renglón rótulo/valor de las propiedades. Es el 100% del bloque INFORMACIÓN.
 *
 * Rótulo arriba y valor abajo, NO en dos columnas: en la barra lateral de 320px «Responsable
 * interno» y «Rodrigo Echegaray» no entran en la misma línea, y forzarlos parte las dos palabras
 * en cuatro renglones. Apilado entra siempre y se lee igual en el teléfono, donde la barra pasa a
 * ocupar el ancho completo.
 */
export function Propiedad({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-faint">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-ink">{children}</dd>
    </div>
  )
}

/** «sin cargar» NUNCA se dibuja como un problema: no hay rojo ni naranja. Que falte el teléfono de
 *  un cliente es un dato que falta, no un desvío. */
export function oFalta(v: string | null | undefined): ReactNode {
  return v ? v : <span className="text-faint">sin cargar</span>
}
