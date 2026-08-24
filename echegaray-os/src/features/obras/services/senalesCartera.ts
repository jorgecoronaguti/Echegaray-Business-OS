// LAS TRES SEÑALES DE HOY DE LA CARTERA (Design canónico 01) — las REGLAS, sin base de datos.
//
// El canon 01 dibuja por fila si la obra tiene el parte del día y cuántos impedimentos abiertos
// arrastra, y en el pie cuántas personas hay hoy. Las lecturas viven en `senalesCarteraService.ts`;
// acá viven las decisiones, que son las que hay que poder revisar y probar sin una base al lado.
//
// ═══ LAS TRES COSAS QUE ESTAS REGLAS SE NIEGAN A DECIR ═══
//
// 1. «Esta obra no tiene parte». La señal AFIRMA que hay parte cargado hoy; su ausencia no afirma
//    nada. Un parte que todavía no cargaron a las 9 de la mañana no es una obra parada, y el canon
//    dibuja ahí un reloj naranja que a las 9 de la mañana miente en todas las obras del país.
// 2. «Cero personas». Cero marcas es SIN FICHAR —incluye al que no tiene teléfono y al que no le dio
//    permiso al GPS—, y por eso el conteo devuelve `null` cuando no hubo ninguna marca en vez de un
//    0 que se lee «hoy no vino nadie». Es la misma regla que ya aplica `presenciaObra.ts`.
// 3. «Cero impedimentos» cuando la lectura falló. Un control que no pudo mirar no dice «no está»:
//    quien no pudo leer devuelve `null`, y `null` no es 0 en ninguna de las tres señales.
//
// ═══ QUÉ ES UN IMPEDIMENTO ABIERTO, UNA SOLA VEZ ═══
//
// El que NO tiene fecha de liberación. Es la definición de `obra_actividad_control`
// (`impedimentos_abiertos`, que además vuelve `bloqueada` a la actividad) y la misma que usa la
// solapa de Operación de la obra. Existe una segunda escrita en `/campo` (`estado = 'abierta'`) que
// deja afuera las `en_curso` — todavía sin liberar, todavía trabando trabajo. Acá se usa la
// canónica: si la cartera contara distinto que la ficha, no habría manera de saber cuál miente.

/** Lo mínimo de una fila que pertenece a una obra. Un subconjunto a propósito: estas reglas no
 *  tienen por qué recompilarse cuando la tabla de origen agregue una columna. */
export interface FilaDeObra {
  obra_id: string | null
}

/** Lo mínimo de una marca del día. `estado` es el de `presencia_del_dia`. */
export interface MarcaDeCartera {
  persona_id: string
  obra_id: string | null
  estado: string
}

/**
 * QUÉ OBRAS TIENEN PARTE DE HOY. Una obra puede tener varios partes el mismo día —uno por actividad
 * medida—, y la señal es un sí/no: lo que la fila quiere contestar es «¿alguien reportó hoy acá?».
 * Contar partes diría «esta obra reportó 7» y eso no es más trabajo, es más actividades tocadas.
 */
export function obrasConParteDeHoy(filas: FilaDeObra[]): Set<string> {
  const con = new Set<string>()
  for (const f of filas) if (f.obra_id) con.add(f.obra_id)
  return con
}

/**
 * CUÁNTOS IMPEDIMENTOS ABIERTOS TIENE CADA OBRA. Sólo entran las obras que tienen al menos uno: una
 * clave con 0 y una clave ausente significarían lo mismo, y la de más invita a escribir un «0»
 * donde el canon dibuja un guion.
 */
export function impedimentosPorObra(filas: FilaDeObra[]): Map<string, number> {
  const por = new Map<string, number>()
  for (const f of filas) {
    if (!f.obra_id) continue
    por.set(f.obra_id, (por.get(f.obra_id) ?? 0) + 1)
  }
  return por
}

/**
 * QUIÉNES FICHARON HOY, POR OBRA.
 *
 * `presencia_del_dia` sale de `asistencia_marca`, así que cada fila es alguien que marcó algo. Pero
 * `sin_registrar` es una fila SIN entrada —una incidencia suelta, por ejemplo—: contarla como
 * persona en obra convertiría un aviso en una jornada. Y una marca sin obra no se le puede atribuir
 * a ninguna, así que no se reparte ni se adivina: queda afuera del cruce por obra.
 *
 * Se guarda el conjunto de personas y no un número porque la misma persona puede marcar en dos
 * obras el mismo día, y el pie de la cartera cuenta PERSONAS, no jornadas.
 */
export function ficharonPorObra(marcas: MarcaDeCartera[]): Map<string, Set<string>> {
  const por = new Map<string, Set<string>>()
  for (const m of marcas) {
    if (!m.obra_id || m.estado === 'sin_registrar') continue
    const gente = por.get(m.obra_id) ?? new Set<string>()
    gente.add(m.persona_id)
    por.set(m.obra_id, gente)
  }
  return por
}

/**
 * PERSONAS HOY en el conjunto de obras que la cartera está mostrando.
 *
 * ═══ CERO NO SE PUBLICA COMO CERO ═══
 *
 * Devuelve `null` cuando no hay ninguna marca, y el pie escribe «sin fichar» en vez de «0». Medido
 * contra producción el 24/08/2026: `asistencia_marca` tiene DOS filas en total y hoy ninguna, así
 * que un `0` sería el número que la pantalla mostraría todos los días — afirmando que la empresa no
 * trabaja mientras cinco obras cargan partes de avance. Cero marcas dice que nadie fichó, no que
 * nadie fue.
 *
 * Se cuenta sobre las obras VISIBLES por la misma razón que los totales del pie: filtrada la
 * cartera, un número que habla de obras que no están en la pantalla no se puede verificar mirándola.
 */
export function personasQueFicharon(
  porObra: Map<string, Set<string>>, obraIds: Iterable<string>,
): number | null {
  const personas = new Set<string>()
  for (const id of obraIds) for (const p of porObra.get(id) ?? []) personas.add(p)
  return personas.size === 0 ? null : personas.size
}

/** El texto del título del icono de problema. Va acá y no en el componente porque el plural es una
 *  decisión de idioma, no de marcado, y es lo único que el test puede leer sin montar React. */
export function tituloImpedimentos(n: number): string {
  return n === 1
    ? '1 impedimento abierto — trabajo trabado esperando que alguien lo libere'
    : `${n} impedimentos abiertos — trabajo trabado esperando que alguien los libere`
}
