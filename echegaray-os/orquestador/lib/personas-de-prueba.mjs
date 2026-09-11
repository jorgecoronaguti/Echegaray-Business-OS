// UNA PERSONA DE PRUEBA NO PUEDE ESTAR EN LA LIQUIDACIÓN REAL.
//
// ═══ LO QUE PASÓ (10/09/2026) ═══
//
// El dueño abrió Personal › Liquidación › Horas y encontró «ZZ-E2E hh-imputacion» intercalada entre
// sus dieciséis obreros, con «sin tarifa» y trabando el cierre de la quincena. La fila la había
// creado `orquestador/lib/hh-imputacion.test.mjs` el 07/09: ese archivo escribe commiteado sobre la
// base productiva, una corrida se cortó antes del `finally`, y la persona quedó.
//
// ═══ POR QUÉ LA GUARDA MIRA `es_prueba` Y NO EL NOMBRE ═══
//
// `persona_directorio` —la vista de la que salen PLANTEL, ASISTENCIA y LIQUIDACIÓN— ya filtra
// `es_prueba is not true`. La marca del nombre sirve para RECONOCER el residuo; la que lo SACA de
// las pantallas es la columna. Filtrar además por el texto del nombre en cada pantalla sería una
// segunda definición de «esto es de prueba», y el día que alguien cree una persona de prueba sin la
// marca las pantallas volverían a mostrarla creyendo que están protegidas.
//
// Entonces la regla es una sola: TODA fila con la marca en el nombre tiene que llevar `es_prueba`.
//
// ═══ POR QUÉ SE PERDONA LO RECIÉN CREADO ═══
//
// `tests/asistencia-editar-en-celda.spec.ts` apaga `es_prueba` A PROPÓSITO mientras corre: mide en
// la pantalla real, y con la marca puesta la fila no existiría. Esa ventana dura minutos. Un
// residuo de más de un día no es ninguna prueba corriendo: es basura que el dueño va a ver.

/** La marca con la que se nombra todo lo que una prueba crea (`tests/util/rastro.ts`). */
export const MARCA = 'ZZ'

const UN_DIA = 24 * 60 * 60 * 1000

/** ¿El nombre delata que la fila la creó una prueba? */
export function esNombreDePrueba(nombre) {
  return typeof nombre === 'string' && nombre.trimStart().startsWith(MARCA)
}

/**
 * LAS FILAS QUE UNA PANTALLA REAL VA A DIBUJAR Y NO DEBERÍA.
 *
 * `filas`: `{ id, nombre_completo, es_prueba, created_at }`. `ahora` en ms.
 *
 * Devuelve las que llevan la marca, NO están marcadas `es_prueba` y tienen más de un día. `null` en
 * `es_prueba` cuenta como no marcada: la vista filtra `is not true`, así que `null` se publica.
 */
export function residuosEnElPlantel(filas, ahora) {
  return (filas ?? []).filter((f) => {
    if (!esNombreDePrueba(f.nombre_completo)) return false
    if (f.es_prueba === true) return false
    const nacida = f.created_at == null ? 0 : new Date(f.created_at).getTime()
    return ahora - nacida > UN_DIA
  })
}

/** El mensaje del rojo: qué se encontró y qué hacer, sin mandar a leer otro archivo. */
export function quejaDeResiduos(residuos) {
  const cuales = residuos.map((r) => `${r.nombre_completo} (${r.id})`).join(' · ')
  return `${residuos.length} persona(s) de prueba visibles en el plantel real: ${cuales}. `
    + 'Se sacan con `update personas set es_prueba = true where id = …`; y la prueba que las creó '
    + 'tiene que insertarlas ya con `es_prueba = true`.'
}
