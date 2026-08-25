// EL NOMBRE DE UNA ACTIVIDAD, ESCRITO COMO SE LEE — la regla, sin pantalla.
//
// El árbol de trabajo se cargó desde la cotización y llega gritado: «HORMIGON DE LIMPIEZA e=0,05 m».
// Trescientas filas en mayúscula sostenida no tienen silueta —todas las palabras miden lo mismo— y
// hay que leerlas letra por letra. El canónico 03/07 las dibuja en ORACIÓN.
//
// ═══ POR QUÉ NO ALCANZA CON `shared/utils/texto.oracion()` ═══
//
// Esa función resuelve un problema distinto y devuelve **título**: «CRISTIAN AGÜERO» → «Cristian
// Agüero», que es lo correcto para un NOMBRE PROPIO. Aplicada a una actividad devuelve «Hormigon de
// Limpieza», y el canónico escribe «Hormigón de limpieza»: una actividad es una FRASE, no un
// nombre. Son dos reglas, no una con excepciones, y por eso son dos funciones — fusionarlas
// obligaría a que la llamada declare cuál de las dos quiere, que es la misma decisión con más
// ceremonia.
//
// LA CONVERSIÓN ES DE DIBUJO, NO DE DATO. Lo que se guarda sigue siendo lo que el que cotizó
// escribió: acá se decide cómo se PINTA.

/** Lo que sobrevive a la bajada, porque bajarlo pierde información:
 *  · cualquier token con un dígito — «H17», «e=0,05», «18×18», «#8» son designaciones técnicas;
 *  · un token de una sola letra — «A», «B» son rótulos de sector, no iniciales de palabra. */
function conservar(token: string): boolean {
  return /\d/u.test(token) || token.replace(/[^\p{L}]/gu, '').length === 1
}

const TIENE_MINUSCULA = /\p{Ll}/u

/**
 * Un nombre de actividad gritado, escrito en oración. Lo que ya trae minúsculas vuelve INTACTO:
 * «Viga de fundación H17» la escribió una persona con su criterio, y un pase genérico por encima
 * sólo puede romperlo.
 *
 * @example oracionDeActividad('HORMIGON DE LIMPIEZA e=0,05 m')  // se devuelve intacto (ya tiene minúsculas)
 * @example oracionDeActividad('COLUMNA DE ENCADENADO H17')       // 'Columna de encadenado H17'
 * @example oracionDeActividad('SECTOR A · PABELLÓN AULAS')       // 'Sector A · pabellón aulas'
 */
export function oracionDeActividad(nombre: string | null | undefined): string {
  const s = String(nombre ?? '')
  if (!s.trim() || TIENE_MINUSCULA.test(s)) return s
  const bajado = s
    // Se parte CONSERVANDO los separadores: los espacios del que cargó no se reescriben.
    .split(/(\s+)/)
    .map((token) => (conservar(token) ? token : token.toLocaleLowerCase('es-AR')))
    .join('')
  // La primera LETRA, no el primer carácter: «· FRENTE ÚNICO» y «(A) MURO» empiezan con signo.
  return bajado.replace(/\p{L}/u, (c) => c.toLocaleUpperCase('es-AR'))
}
