// EL TOQUE DE 44 EN EL TELÉFONO SIN MOVER EL DIBUJO (dueño 24/09: «controles de 44 px en el teléfono»).
//
// Un chevron de 12, una casilla de 16 o un enlace de texto miden lo que dibuja el diseño; lo que crece
// es un `::after` transparente de 44 × 44 centrado sobre el control, sólo por debajo de `md`. El
// renglón no se corre, la PC no cambia, y el dedo acierta. El control tiene que ser `relative` (lo pone
// la clase) y no puede recortar su desborde.
export const TOQUE_44 =
  "relative max-md:after:absolute max-md:after:left-1/2 max-md:after:top-1/2 max-md:after:h-11 max-md:after:min-w-11 max-md:after:w-full max-md:after:-translate-x-1/2 max-md:after:-translate-y-1/2 max-md:after:content-['']"
