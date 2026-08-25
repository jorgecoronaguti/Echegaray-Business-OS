// AYUDA CONTEXTUAL — la explicación que estaba clavada en la pantalla, ahora a un clic.
//
// ═══ POR QUÉ ═══
//
// La regla de lectura de una pantalla del OS es DATO → ESTADO → ACCIÓN. Un párrafo permanente que
// explica CÓMO FUNCIONA la pantalla se lee la primera vez y estorba las otras trescientas: empuja
// el dato hacia abajo, compite con las advertencias de estado —que sí hay que leer— y entrena a
// saltear el texto, con lo cual el aviso que importa tampoco se lee.
//
// La explicación no se tira: se mueve acá. La necesita el que entra por primera vez y el que vuelve
// después de dos meses; no la necesita el jefe de obra que abre esta pantalla seis veces por día.
//
// ═══ POR QUÉ UN `details` NATIVO Y NO UN TOOLTIP ═══
//
// Sin JavaScript, sin estado y sin librería: funciona en un server component, se abre con el dedo
// —un tooltip de hover no existe en un teléfono, y estas pantallas se usan en obra— y el buscador
// del navegador (Ctrl+F) encuentra el texto aunque esté cerrado. Es el mismo patrón que ya usaba
// «Cargar comprobante» en Compras.
//
// LO QUE NO VA ACÁ: un dato, una advertencia de estado real o el motivo de un vacío. Eso se lee sí
// o sí, y esconderlo detrás de un clic es esconder el problema.

export function Ayuda({
  titulo = 'Cómo funciona',
  children,
  testid,
}: {
  /** Lo que se lee cerrado. Corto: es un rótulo, no la explicación. */
  titulo?: string
  children: React.ReactNode
  testid?: string
}) {
  return (
    <details className="mt-2 min-w-0" data-testid={testid}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11.5px] text-faint hover:text-muted">
        <span aria-hidden className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-full border border-line text-[9px] leading-none">
          ?
        </span>
        {titulo}
      </summary>
      <div className="mt-1.5 max-w-[560px] text-[11.5px] leading-relaxed text-muted">
        {children}
      </div>
    </details>
  )
}
