// EL COLCHÓN QUE NO SE VE.
//
// POR QUÉ EXISTE (04/08). Entre la sección 1 y la sección 2 había un agujero de filas vacías que el
// dueño lee como un error de la pestaña. El colchón tiene una razón legítima —una dinámica que crece
// sin lugar NO se renderiza, Google se niega y deja la sección invisible— pero reservar de más y
// dejarlo puesto convierte una precaución en un defecto visible.
//
// LA SOLUCIÓN NO ES RESERVAR MENOS, ES DEVOLVER LO QUE SOBRÓ. El generador sigue reservando con
// holgura antes de escribir (ahí no sabe cuánto va a emitir la dinámica) y DESPUÉS de escribir mide
// el alto real y borra el sobrante, dejando un colchón chico. La capacidad de crecer no se pierde:
// las filas del colchón absorben el crecimiento chico sin correr nada, y cuando no alcanzan el mismo
// generador inserta.
//
// ═══ POR QUÉ SE MIDE DESDE ABAJO Y NO DESDE ARRIBA ═══
//
// `altoEmitido` cuenta hasta la PRIMERA fila en blanco. Eso funciona mientras el bloque sea macizo, y
// deja de funcionar en cuanto una fila de separación tiene un resto en cualquier columna: ya no está
// en blanco, el conteo sigue de largo y devolvió 31 donde había 11. Con 31 el sobrante calculado es
// negativo y no se borra nada; con un número al revés, se borrarían filas con datos.
//
// Acá se ancla al TÍTULO DE ABAJO —texto real que el generador de texto escribe y nadie discute— y se
// sube buscando la última fila con algo. Un resto perdido en el medio del aire no mueve el resultado;
// un resto ABAJO del bloque hace que se borre de MENOS, que es el lado seguro del error.
//
// ═══ EL ANCHO SE MIRA ENTERO, NO HASTA LA G ═══
//
// Borrar una fila es destructivo y no hay huella que lo recupere. Ya pasó que un generador se declaró
// dueño hasta su última columna y le borró al dueño catorce fechas que vivían más a la derecha. Acá
// una fila cuenta como vacía sólo si está vacía en TODO el ancho leído, y la lectura se pide con
// `FORMULA`: una fórmula que devuelve "" se ve como fórmula (hay algo) y no como celda vacía.

/** Filas de aire que quedan entre un bloque y el título siguiente. Tres absorben el crecimiento
 *  chico de una corrida a la otra sin que nadie tenga que insertar nada. */
export const COLCHON_FINAL = 3

const vacia = (f) => (f ?? []).every((c) => String(c ?? '').trim() === '')

/**
 * LA FILA DE UN TÍTULO, buscada por su texto en la columna A. Base 1; 0 si no está.
 *
 * Un generador que se ubica buscando su propia salida anterior se engancha en otro lado el día que
 * esa salida está rota. Los títulos son de otro dueño y son texto plano: son el único ancla que no
 * depende de que ayer haya salido todo bien.
 */
export function filaDelTitulo(filas = [], re) {
  const i = filas.findIndex((f) => re.test(String((f ?? [])[0] ?? '').trim()))
  return i < 0 ? 0 : i + 1
}

/**
 * CUALQUIER TÍTULO DE SECCIÓN: "1 · ", "7 · ", "12 - ". El número NO se da por sabido.
 *
 * POR QUÉ (04/08). El límite de abajo estaba anclado a `/^3 ·/` y un día dejó de existir: el
 * generador del bloque de texto renumeró y la pestaña pasó a decir 1, 2, 7, 5. Anclar al NÚMERO de
 * la sección de al lado es anclar en algo que no es mío y que se mueve; lo que no se mueve es que
 * abajo del bloque empieza OTRA sección. Un límite que desaparece frena todo el generador, y frenar
 * está bien —no se escribe a ciegas— pero frenarse por un número es frenarse de gusto.
 */
// El espacio a los DOS lados del separador y la letra después no son decoración: sin ellos
// `0004-00003637` (un número de comprobante) es un título de sección, y el límite del bloque cae en
// la primera factura. El número va acotado a dos dígitos por lo mismo: `2026 - saldo` no es una
// sección. El contrato de la pestaña es "N · TÍTULO", y acá se exige entero.
export const TITULO_DE_SECCION = /^\d{1,2}\s+[·.\-]\s+\p{L}/u

/**
 * LA PRIMERA SECCIÓN QUE EMPIEZA DESPUÉS DE `desde`. Base 1; 0 si no hay ninguna.
 *
 * Es el límite de abajo de un bloque: hasta ahí llega lo mío y ni una fila más.
 */
export function filaDelSiguienteTitulo(filas = [], desde = 0) {
  const i = filas.findIndex((f, j) => j + 1 > desde && TITULO_DE_SECCION.test(String((f ?? [])[0] ?? '').trim()))
  return i < 0 ? 0 : i + 1
}

/**
 * LA ÚLTIMA FILA CON ALGO dentro de [desde, hasta), mirando desde abajo. Base 1; 0 si está todo vacío.
 */
export function ultimaConDato(filas = [], { desde, hasta }) {
  for (let i = hasta - 1; i >= desde; i--) {
    if (!vacia(filas[i - 1])) return i
  }
  return 0
}

/**
 * CUÁNTAS FILAS DE AIRE SOBRAN ENTRE EL BLOQUE Y EL TÍTULO DE ABAJO.
 *
 * @param {{filas:Array<Array<any>>, desde:number, hasta:number, colchon?:number}} o
 *        `desde` la primera fila del bloque y `hasta` la fila del título siguiente, las dos base 1.
 * @returns {{ultima:number, blancas:number, sobrante:number, desdeBorrar:number, hastaBorrar:number}}
 *        `desdeBorrar`/`hastaBorrar` en base 1, `hastaBorrar` exclusivo. Sobrante 0 = no se toca nada.
 */
export function sobranteDeColchon({ filas = [], desde, hasta, colchon = COLCHON_FINAL }) {
  const nada = { ultima: 0, blancas: 0, sobrante: 0, desdeBorrar: 0, hastaBorrar: 0 }
  if (!(desde > 0) || !(hasta > desde)) return nada
  const ultima = ultimaConDato(filas, { desde, hasta })
  // Sin una sola fila con dato el bloque no existe o no se pudo leer: no se borra a ciegas.
  if (ultima === 0) return nada
  const blancas = hasta - 1 - ultima
  const sobrante = Math.max(0, blancas - colchon)
  if (sobrante === 0) return { ultima, blancas, sobrante: 0, desdeBorrar: 0, hastaBorrar: 0 }
  // Se borran las de ABAJO del colchón, pegadas al título: así el bloque conserva su aire propio y
  // el título siguiente queda a distancia fija de lo que tiene arriba.
  return { ultima, blancas, sobrante, desdeBorrar: ultima + colchon + 1, hastaBorrar: hasta }
}

/**
 * ¿ES SEGURO BORRAR ESTAS FILAS? Se comprueba contra la MISMA lectura con la que se decidió.
 *
 * La comprobación es redundante por diseño: `sobranteDeColchon` ya sólo propone filas en blanco. Es
 * el cinturón que impide que un cambio futuro en el cálculo se coma una fila con datos sin que un
 * test se ponga rojo. Devuelve las filas (base 1) que NO están vacías; vacío = se puede borrar.
 */
export function filasNoVacias(filas = [], { desdeBorrar, hastaBorrar }) {
  const sucias = []
  for (let i = desdeBorrar; i < hastaBorrar; i++) if (!vacia(filas[i - 1])) sucias.push(i)
  return sucias
}
