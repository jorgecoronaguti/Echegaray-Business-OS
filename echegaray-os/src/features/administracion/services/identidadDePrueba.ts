// LAS IDENTIDADES QUE EXISTEN PARA PROBAR NO SON PERSONAL.
//
// ═══ EL HALLAZGO (QA visual en producción, 11/09/2026) ═══
//
// «[PRUEBA E2E] QA Campo» —la cuenta de nivel campo de `tests/util/identidades.ts`— aparecía en las
// solapas Convenios y Recibos de Liquidación como una persona más: «18 sin piso» en vez de 17. No es
// cosmético. Esa fila entra en un conteo de exposición al convenio UOCRA y en la lista de recibos,
// que son dos números con los que se decide plata y se discute con el estudio contable.
//
// ═══ POR QUÉ SE FILTRA ACÁ Y NO SÓLO EN LA BASE ═══
//
// La base YA resuelve la mitad: `persona_directorio` filtra `es_prueba is not true` desde el
// 07/09/2026, y por eso Plantel, Asistencia y la grilla de Horas no la muestran. Lo que filtra
// Convenios y Recibos es `persona_legajo`, que NO mira la columna —se creó el 19/08 para otra cosa— y
// ahí se cuela. La migración `20260911T1910` lo cierra del lado correcto.
//
// Pero una migración commiteada no es una columna aplicada, y el fixture de E2E crea la fila de nuevo
// en cada corrida CON `es_prueba` en su valor por defecto. Así que acá hay un segundo filtro
// explícito: lo que la base marque manda, y lo que no esté marcado pero se NOMBRE como prueba
// tampoco entra. Dos redes para el mismo pez porque las dos fallan por motivos distintos.
//
// ═══ EL CRITERIO ES DELIBERADAMENTE ANGOSTO ═══
//
// Esconder a una persona REAL del plantel de liquidación es un defecto peor que mostrar una de
// prueba: nadie nota a quien falta. Así que no hay heurística de «parece de prueba»: son tres marcas
// literales que sólo pueden venir de este repo, y el mail de prueba sale del mismo archivo que lo
// crea. Un apellido real no puede empezar con `[PRUEBA` ni contener `E2E`.
//
// NO SE DA DE BAJA A NADIE. Los E2E necesitan esa identidad viva: lo que cambia es que no se publica.
//
// ═══ Y DESDE EL 12/09/2026, «NO SE PUBLICA» TIENE UN DESTINATARIO ═══
//
// «No se publica» era absoluto, y eso dejó a la suite sin poder probar por navegador que teclear una
// celda de horas escribe en `registros_hh`: la única persona sobre la que un test puede escribir sin
// mover el jornal de un obrero no aparecía en la pantalla donde se escribe. La regla pasó a mirar
// también quién pregunta —`sePublicaA()`, y en la base `sesion_es_de_prueba()`— y el único que ve lo
// que existe para probar es quien TAMBIÉN existe para probar. Una cuenta real no ve ninguna, que es
// lo que se decidió el 11/09 y no cambia.

/** Lo mínimo que hace falta para decidir. Cualquiera de los tres puede faltar. */
export interface IdentidadPosible {
  nombre?: string | null
  /** `personas.es_prueba`. `true` manda y alcanza: lo declaró un fixture o una migración. */
  esPrueba?: boolean | null
  email?: string | null
}

/**
 * LAS MARCAS DEL NOMBRE. Las escribe este repo y nadie más.
 *
 * `[PRUEBA` es el prefijo que usa la migración `20260907T1600` para marcar («nombre_completo ilike
 * '[PRUEBA%'») y `E2E` el de los fixtures de Playwright. Van como expresiones y no como `startsWith`
 * porque el nombre real en producción es «[PRUEBA E2E] QA Campo»: el corchete está al principio y la
 * sigla en el medio.
 */
export const MARCAS_DE_NOMBRE: readonly RegExp[] = [
  /^\s*\[\s*prueba/i,
  /\bE2E\b/,
]

/**
 * LOS MAILS DE LAS TRES IDENTIDADES DE `tests/util/identidades.ts`.
 *
 * Se escriben acá y no se importan de `tests/` a propósito: `src/` no puede depender de la carpeta de
 * pruebas —no viaja al build—, y un import así haría que el producto dejara de compilar si alguien
 * reorganiza los specs. Si esa lista cambia, cambia ésta; el test de abajo cita las dos.
 */
export const MAILS_DE_PRUEBA: readonly RegExp[] = [
  /^qa\.[a-z.]+@ecsas\.com\.ar$/i,
  /\+direccion-test-\d+@/i,
]

/** ¿Esta fila existe para probar el sistema? */
export function esIdentidadDePrueba(p: IdentidadPosible): boolean {
  if (p.esPrueba === true) return true
  const nombre = (p.nombre ?? '').trim()
  if (nombre && MARCAS_DE_NOMBRE.some((re) => re.test(nombre))) return true
  const email = (p.email ?? '').trim()
  return email.length > 0 && MAILS_DE_PRUEBA.some((re) => re.test(email))
}

/**
 * ¿ESTA FILA SE LE PUBLICA A ESTA SESIÓN?
 *
 * Es el MISMO predicado que la migración `20260912T1200` escribe en `persona_directorio`,
 * `persona_legajo` y `persona_plantel`, en TypeScript:
 *
 *     se publica  ⇔  no es de prueba  ∨  quien pregunta es una cuenta de prueba
 *
 * ═══ POR QUÉ LA SESIÓN ENTRA ACÁ Y NO ALCANZA CON LA VISTA (12/09/2026) ═══
 *
 * Porque la base y el código filtran por motivos distintos y fallan por motivos distintos. La vista
 * cubre a cualquiera que lea la base; este filtro cubre el rato en que la migración todavía no está
 * aplicada. Si sólo cambiara la vista, la solapa Quincena seguiría escondiendo la identidad de
 * prueba —la filtra `plantelDeLaQuincena`— y el E2E de escritura de horas seguiría siendo imposible:
 * la pantalla no mostraría la única persona sobre la que un test puede escribir.
 *
 * `laSesionEsDePrueba` es `false` por defecto Y a propósito: quien no sabe quién pregunta esconde.
 * Mostrar una cuenta de Playwright en una liquidación real es un defecto; esconder a una persona
 * real es uno peor, pero el default seguro para ESTA pregunta es el de antes del cambio.
 */
export function sePublicaA(p: IdentidadPosible, laSesionEsDePrueba = false): boolean {
  return !esIdentidadDePrueba(p) || laSesionEsDePrueba === true
}

/**
 * LA LISTA SIN LAS IDENTIDADES DE PRUEBA — salvo que quien mira TAMBIÉN exista para probar.
 *
 * `lector` existe porque cada servicio nombra sus campos distinto (`nombre`, `nombre_completo`,
 * `persona`): obligar a una forma única habría hecho que tres llamadores armaran un objeto
 * intermedio, y el que se olvidara de un campo filtraría de menos sin que nada avisara.
 */
export function sinIdentidadesDePrueba<T>(
  items: readonly T[], lector: (item: T) => IdentidadPosible, laSesionEsDePrueba = false,
): T[] {
  return items.filter((i) => sePublicaA(lector(i), laSesionEsDePrueba))
}
