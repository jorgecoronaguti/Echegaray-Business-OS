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

/**
 * ═══ LA PERSONA NO ESTÁ, PERO SUS HORAS SÍ (auditoría 11/09/2026) ═══
 *
 * La guarda miraba SÓLO `personas`, y con eso decía «limpio» mientras `registros_hh` conservaba
 * 8 h del 19/08 de «ZZ-E2E hh-imputacion» imputadas a la obra Quattropani. `persona_directorio`
 * filtra a las de prueba, así que la fila no se veía en el plantel — pero los lectores de
 * `registros_hh` (productividad, HH por obra, costo) NO filtran `es_prueba` y esas horas sumaban en
 * números que el dueño mira. Regla de oro 1: nunca fabricar datos.
 *
 * Marcar la persona como prueba no alcanza: hay que borrar lo que cargó. Esto lo detecta.
 *
 * `filas` son las horas cruzadas con la persona: `{ id, persona_es_prueba, fecha, horas, obra }`.
 */
export function horasDePersonasDePrueba(filas) {
  return (filas ?? []).filter((f) => f.persona_es_prueba === true)
}

/** La queja de las horas: dice cuántas, de qué obra salen y cómo se van. */
export function quejaDeHoras(horas) {
  const total = horas.reduce((n, h) => n + Number(h.horas ?? 0), 0)
  const obras = [...new Set(horas.map((h) => h.obra ?? 'sin obra'))].join(' · ')
  return `${horas.length} registro(s) de horas de personas de prueba siguen en \`registros_hh\`: `
    + `${total} h imputadas a ${obras}. Los lectores de HH no filtran \`es_prueba\`, así que suman `
    + 'en productividad y en el costo por obra. Se borran con '
    + '`delete from registros_hh h using personas p where p.id = h.persona_id and p.es_prueba is true` '
    + '(antes, sus filas de `registro_hh_correccion`); y la prueba que las creó tiene que borrarlas '
    + 'en su `afterAll`.'
}

/** El mensaje del rojo: qué se encontró y qué hacer, sin mandar a leer otro archivo. */
export function quejaDeResiduos(residuos) {
  const cuales = residuos.map((r) => `${r.nombre_completo} (${r.id})`).join(' · ')
  return `${residuos.length} persona(s) de prueba visibles en el plantel real: ${cuales}. `
    + 'Se sacan con `update personas set es_prueba = true where id = …`; y la prueba que las creó '
    + 'tiene que insertarlas ya con `es_prueba = true`.'
}
