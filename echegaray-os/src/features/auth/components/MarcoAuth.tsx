import Image from 'next/image'

// EL MARCO DE LAS PANTALLAS SIN SESIÓN — login, alta, recuperar, contraseña nueva.
//
// LA MARCA VA ENTERA ACÁ Y EN NINGÚN OTRO LADO. Adentro del OS el isotipo mide 26px y el logotipo es
// una palabra: ahí la marca es una firma, no el contenido. En estas pantallas todavía no hay
// contenido, así que el logo completo es lo correcto — y es el archivo oficial del dueño
// (`public/marca/logo.png`), no un redibujo.
//
// Sin gradiente, sin card flotando en el medio de un fondo de color, sin ilustración: el dueño pidió
// *"software operativo moderno, sobrio y extremadamente claro"* y *"no imitar la UI de un banco"*.
// Una pantalla de login que parece una landing es exactamente lo que no se quiere.
//
// ═══ POR QUÉ ES UN COMPONENTE Y NO CUATRO COPIAS ═══
//
// Con la recuperación de contraseña (M01) las pantallas sin sesión pasaron de dos a cuatro. Cuatro
// copias del mismo encabezado son cuatro lugares donde el logo puede quedar de distinto tamaño, y el
// único momento en que alguien lo nota es cuando ya está en producción.

export function MarcoAuth({
  titulo, bajada, children,
}: {
  titulo: string
  /** Una línea que dice qué es esta pantalla. No es un eslogan: es lo que hay que hacer acá. */
  bajada: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {/* 384px: la medida de un formulario de una sola columna. Más ancho obliga a barrer el ojo de
          punta a punta para leer una etiqueta de dos palabras. */}
      <div className="w-full max-w-sm">
        <Image
          src="/marca/logo.png"
          alt="Echegaray Construcciones"
          width={578}
          height={432}
          priority
          className="mb-8 h-auto w-[188px]"
        />
        <h1 className="text-[20px] font-semibold leading-tight text-ink">{titulo}</h1>
        <p className="mt-1 mb-6 text-[13px] text-muted">{bajada}</p>
        {children}
      </div>
    </div>
  )
}
