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
// `Card` dibuja borde, fondo y sombra, y desde el Design Handoff V2 las tablas de este record ya no
// van en caja: hairline superior y divisores de fila (`COMPONENTS.md` §Table). Una `Card` alrededor
// devolvería el marco que se acaba de sacar, y cuatro bloques darían cuatro marcos concéntricos con
// la tabla adentro. Acá el bloque aporta SEPARACIÓN y JERARQUÍA —un título, un contador— y nada más.

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
  // EL `id` ES EL DEL TESTID, y no un tercer identificador: el índice de solapas de la ficha
  // (`#bloque-obras`) apunta a estos anclajes. Con dos nombres para lo mismo, renombrar un testid
  // rompería en silencio un enlace que sigue existiendo y ya no lleva a ningún lado.
  return (
    <section id={testid} data-testid={testid} className="scroll-mt-4 min-w-0">
      {/* 13/600 SIN VERSALITAS (mock 2h). En versalitas, «Obras asociadas» y «Documentos» pesaban
          más que los nombres de las obras que rotulan: el título de un bloque orienta, no compite. */}
      <h2 className="mb-3 flex items-baseline gap-2 text-[13px] font-semibold text-ink">
        {titulo}
        {cuenta != null && <span className="font-mono text-[11.5px] font-normal tabular-nums text-faint">{cuenta}</span>}
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
