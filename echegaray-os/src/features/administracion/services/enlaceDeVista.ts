// UN ENLACE DENTRO DE UNA VISTA, CONSERVANDO LO QUE YA ESTABA PUESTO.
//
// ═══ POR QUÉ EXISTE ═══
//
// La misma regla estaba escrita tres veces en `/administracion/personas`: `armarHref` en el Plantel,
// `hrefSolapa` en Liquidación y `hrefDeAsistencia` en Horas. Las tres contestan la misma pregunta
// —cómo se arma un enlace que no pierde el recorte que el usuario ya puso— y sólo una de las tres
// tenía el defecto arreglado y el test que lo fija.
//
// EL DEFECTO QUE ESTO IMPIDE (vistaDeAsistencia.ts, 10/09/2026): con un filtro puesto, tocar
// «‹ anterior» devolvía la empresa entera sin que nadie lo pidiera, porque ese enlace escribía la
// URL desde cero. Cada parámetro nuevo de una vista tiene que entrar en SU lista de conservados, y
// con tres copias de la regla la que se olvide vuelve a tirar el recorte al primer clic.
//
// LAS DOS CONVENCIONES, UNA SOLA VEZ:
//
//   · un `undefined` en `cambios` BORRA ese parámetro — así se apaga un filtro con el mismo enlace
//     que lo prendió;
//   · un valor vacío NO es un parámetro: `?q=` no filtra nada y ensucia lo que se comparte por chat.
//
// EL ORDEN DE LAS CLAVES ES PARTE DEL CONTRATO: los fijos primero y después los conservados en el
// orden en que la vista los declara. Un `cambios` cambia el VALOR, no el lugar. Las URLs de esta
// pantalla se comparan literales en sus tests y se comparten por mensaje: que la misma vista escriba
// hoy `?vista=asistencia&obra=X` y mañana `?obra=X&vista=asistencia` no rompe nada técnico, pero
// convierte dos enlaces iguales en dos textos distintos.

export function enlaceConservando(
  ruta: string,
  /** Lo que define la vista y no depende de lo puesto (`vista=asistencia`). Van primero. */
  fijos: Record<string, string>,
  /** Lo que la vista lleva puesto ahora. El orden de estas claves es el orden de la URL. */
  actual: Record<string, string | undefined>,
  cambios: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams(fijos)
  for (const [clave, valor] of Object.entries({ ...actual, ...cambios })) {
    if (valor) params.set(clave, valor)
  }
  const qs = params.toString()
  return `${ruta}${qs ? `?${qs}` : ''}`
}
