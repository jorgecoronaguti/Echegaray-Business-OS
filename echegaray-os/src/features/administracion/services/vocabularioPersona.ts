// LOS CINCO HECHOS DE UNA PERSONA — y por qué no son el mismo.
//
// ═══ EL DEFECTO QUE ESTO CIERRA ═══
//
// «Albañil» y «Oficial» contestan preguntas distintas y la pantalla los mezclaba: la fila del
// listado escribía `especialidad ?? puesto` debajo del nombre, y `puesto` viene del CARGO de la
// nómina, que en muchos legajos ES la categoría del convenio. Resultado medido: filas que decían
// «OFICIAL» debajo del nombre y «Ayudante» en la columna CATEGORÍA — dos respuestas al mismo hecho,
// distintas, sin que nada avisara.
//
// Los cinco hechos, y quién los decide:
//
//   OFICIO / ESPECIALIDAD   albañil, electricista, yesero     lo que la persona SABE HACER
//   CATEGORÍA UOCRA         oficial, medio oficial, ayudante  lo que COBRA (CCT) — efecto económico
//   ROL ORGANIZACIONAL      jefe de obra, administración      lo que DECIDE dentro de la empresa
//   CUADRILLA               a qué equipo pertenece            derivado de la pertenencia vigente
//   ASIGNACIÓN A OBRA       en qué obra está hoy              derivado de la asignación vigente
//
// Los dos últimos NO se guardan en la persona: se derivan (`persona_directorio`). Por eso no
// pueden envejecer respecto de la ficha, y por eso no viven acá.
//
// ═══ POR QUÉ NO SE ARREGLA EN LA BASE ═══
//
// `personas.puesto` es texto libre y hoy tiene las dos cosas mezcladas en filas reales. Limpiarlo es
// una corrección de dato maestro con efecto laboral —la categoría es lo que liquida— y la decide el
// dueño, no una migración de UI. Lo que esta capa hace es NO PUBLICAR como oficio algo que es una
// categoría: preferir callar a afirmar el hecho equivocado.

import { esCategoriaDeConvenio, etiquetaCategoria } from '../types/index.ts'

/** Normaliza para comparar contra el catálogo: la nómina escribe «OFICIAL», «Medio Oficial»,
 *  «medio_oficial» y «Medio oficial» para el mismo puesto. */
function clave(v: string): string {
  return v.trim().toLocaleLowerCase('es-AR')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '_')
}

/**
 * ¿ESTE TEXTO LIBRE ES, EN REALIDAD, UNA CATEGORÍA DEL CONVENIO?
 *
 * Se compara contra el catálogo tanto por su clave (`medio_oficial`) como por su etiqueta («Medio
 * oficial»), porque `personas.puesto` tiene las dos grafías. No intenta adivinar más allá de eso:
 * un texto que no está en el catálogo se trata como oficio, que es lo que suele ser.
 */
export function pareceCategoria(texto: string | null): boolean {
  if (!texto) return false
  const k = clave(texto)
  // 'oficial especializado' → 'oficial_especializado' ya por la normalización de espacios.
  return esCategoriaDeConvenio(k)
}

/**
 * EL OFICIO QUE SE PUEDE MOSTRAR, o `null`.
 *
 * `especialidad` es el campo hecho para esto y manda. `puesto` sólo entra como respaldo cuando NO
 * es una categoría disfrazada: mostrar «OFICIAL» como oficio le contesta al que mira una pregunta
 * que no hizo, y encima con el dato que la columna de al lado ya publica.
 */
export function oficioVisible(
  especialidad: string | null, puesto: string | null,
): string | null {
  const e = especialidad?.trim()
  if (e) return e
  const p = puesto?.trim()
  if (!p || pareceCategoria(p)) return null
  return p
}

/**
 * LA CATEGORÍA QUE SE PUEDE MOSTRAR, o `null`.
 *
 * ═══ POR QUÉ ESTA COLUMNA MUESTRA CATEGORÍA Y NO OFICIO (07/09/2026) ═══
 *
 * Pedido del dueño: *«en la sección personal quiero que se vea la CATEGORÍA en lugar del puesto»*.
 * Y tiene el peso a favor: la categoría es lo que LIQUIDA —es el hecho con efecto económico— y el
 * oficio no decide nada en esta pantalla. Barrer la lista de arriba abajo para saber quién es
 * oficial y quién ayudante es la pregunta que se hace todos los días; «albañil» no lo es.
 *
 * `categoria` es el campo hecho para esto y manda. `puesto` entra SÓLO cuando el texto libre resulta
 * ser una categoría del convenio disfrazada —`pareceCategoria` ya sabe reconocerlo—, que es
 * exactamente el caso que `oficioVisible` descarta. Los dos usan el mismo catálogo: lo que uno
 * rechaza por ser categoría, el otro lo rescata por serlo. No puede haber una fila que caiga en los
 * dos ni una que se pierda entre los dos.
 *
 * Devuelve `null` y no «Sin categoría»: quién dibuja la ausencia, y de qué color, lo decide la
 * pantalla. Una función pura que ya eligió la palabra le saca esa decisión a quien la muestra.
 */
export function categoriaVisible(
  categoria: string | null, puesto: string | null,
): string | null {
  const c = categoria?.trim()
  if (c) return etiquetaCategoria(c)
  const p = puesto?.trim()
  return p && pareceCategoria(p) ? etiquetaCategoria(clave(p)) : null
}
