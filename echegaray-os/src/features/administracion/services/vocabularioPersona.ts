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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ROL ORGANIZACIONAL — QUIÉN ES JEFE DE OBRA (08/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Orden del dueño, textual: *«dividir en la pestaña asistencia y plantel a los jefes de obra del
// resto de los obreros»*.
//
// ═══ LA FUENTE, Y POR QUÉ ESA ═══
//
// `personas.puesto`. Es el ROL ORGANIZACIONAL de la tabla de arriba —lo que la persona DECIDE
// dentro de la empresa—, y es un hecho de la PERSONA, que es lo que las dos pantallas necesitan:
// el plantel es una lista global, no una lista por obra.
//
// Medido en la base el 08/09/2026: `personas.puesto` tiene UN SOLO valor no nulo en toda la tabla
// —«JEFE DE OBRA»— y lo llevan exactamente dos personas activas: MALDONADO BATISTA EMILIANO MIGUEL
// y NIEVAS VILLEGAS JUAN PABLO. Las otras 15 del plantel activo lo tienen en NULL.
//
// SEGUNDA FUENTE QUE CONFIRMA, sin usarse: `perfiles.rol = 'jefe_obra'` devuelve esas mismas dos
// personas, ni una más ni una menos. Dos fuentes independientes que coinciden 2/2 — por eso el
// criterio se escribe sobre `puesto` y no se sale a buscar un tercero.
//
// ═══ LAS QUE SE DESCARTARON, Y POR QUÉ ═══
//
//   `obra_asignacion.rol = 'responsable'`   Es de la ASIGNACIÓN, no de la persona, y su propia
//                                           migración dice «el jefe de obra O CAPATAZ»: no
//                                           distingue los dos hechos. Medido: 1 sola fila
//                                           ('PASTRAN MARCELO IVAN', con `puesto` NULL) contra 135
//                                           integrantes. Usarla pondría a un capataz en el grupo de
//                                           los jefes y dejaría afuera a los dos que sí lo son.
//   `perfiles.rol = 'jefe_obra'`            Es quién ENTRA AL OS, no quién dirige una obra. Un jefe
//                                           sin usuario existiría en la empresa y no en el grupo;
//                                           un login no es un cargo.
//   `categoria`                             Los dos jefes son `oficial_especializado`, pero también
//                                           lo son dos personas que NO son jefes. La categoría es
//                                           lo que COBRA (CCT), no lo que decide.
//
// ═══ LO QUE ESTE CRITERIO NO PUEDE ═══
//
// A quien sea jefe de obra y tenga `puesto` en NULL lo va a poner con los obreros, en silencio. No
// hay forma de detectarlo desde acá: la ausencia de dato no se distingue de la negativa. Si
// aparece un jefe nuevo, el dato que hay que cargar es `personas.puesto`, y la migración aditiva
// `20260908T2000_el_rol_organizacional_es_un_campo_propio.sql` deja escrita la alternativa —una
// columna booleana— para el día que el dueño decida que el texto libre no alcanza.

/** La grafía de la nómina (`JEFE DE OBRA`) y la del OS (`jefe_obra`), normalizadas por `clave()`.
 *  Las dos nombran el mismo rol; no se acepta ninguna otra, porque adivinar a partir de un texto
 *  parecido pondría a alguien a decidir sobre una obra sin que nadie lo haya declarado. */
const PUESTOS_DE_JEFE = new Set(['jefe_de_obra', 'jefe_obra'])

/**
 * ¿ESTA PERSONA ES JEFE DE OBRA? La única definición del OS; todo lo que agrupe por rol la usa.
 *
 * Recibe `puesto` y no la persona entera a propósito: la función no puede mirar la categoría ni la
 * especialidad aunque las tenga a mano, y así no hay una segunda regla escondida.
 */
export function esJefeDeObra(puesto: string | null | undefined): boolean {
  return puesto ? PUESTOS_DE_JEFE.has(clave(puesto)) : false
}

/** Un grupo del plantel con su rótulo ya resuelto. `clave` es para las pruebas y los `data-*`; el
 *  `rotulo` es lo que se lee en pantalla. */
export interface GrupoDeRol<T> {
  clave: 'jefes' | 'obreros'
  rotulo: string
  integrantes: T[]
}

/** «Jefe de obra · 1», no «Jefes de obra · 1». El conteo va al lado del rótulo porque es la misma
 *  pregunta —cuántos hay de éstos— y una fila aparte para un número sería una tarjeta por dato. */
function rotuloDe(clave: 'jefes' | 'obreros', n: number): string {
  const palabra = clave === 'jefes'
    ? (n === 1 ? 'Jefe de obra' : 'Jefes de obra')
    : (n === 1 ? 'Obrero' : 'Obreros')
  return `${palabra} · ${n}`
}

/**
 * LOS DOS GRUPOS, JEFES PRIMERO — y SÓLO los que tienen gente.
 *
 * Un grupo vacío no se devuelve: un rótulo «Jefes de obra · 0» encima de una lista sin jefes es
 * ruido que además desmiente lo que la lista muestra. Cuando queda un solo grupo, quien dibuja
 * puede omitir el rótulo y la pantalla se ve exactamente como antes de este cambio — que es lo
 * correcto para los filtros e «Inactivos», donde partir en dos no responde ninguna pregunta.
 *
 * EL ORDEN INTERNO NO SE TOCA. Llega ordenado por quien lo leyó de la base (por nombre, en las dos
 * pantallas) y sale igual: reordenar acá agregaría una segunda regla de orden que nadie declaró.
 */
export function agruparPorRolOrganizacional<T>(
  items: readonly T[], esJefe: (item: T) => boolean,
): GrupoDeRol<T>[] {
  const jefes = items.filter(esJefe)
  const obreros = items.filter((x) => !esJefe(x))
  const grupos: GrupoDeRol<T>[] = []
  if (jefes.length > 0) grupos.push({ clave: 'jefes', rotulo: rotuloDe('jefes', jefes.length), integrantes: jefes })
  if (obreros.length > 0) grupos.push({ clave: 'obreros', rotulo: rotuloDe('obreros', obreros.length), integrantes: obreros })
  return grupos
}
