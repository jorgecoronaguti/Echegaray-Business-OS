// UNA CONEXIÓN QUE SE PUEDE PRESTAR — factorizado del mecanismo que `caja-conteo-centinela.mjs` usa
// desde el 25/09/2026, para que cada `*-persistencia.test.mjs` no lo reescriba a su manera.
//
// ═══ POR QUÉ EXISTE ═══
//
// Un test de `*-persistencia.test.mjs` prueba una propiedad del SQL —que una marca sobreviva al
// barrido de la corrida siguiente, que una fila resista un `ON CONFLICT`— corriendo el código REAL
// contra la base REAL. Sin este mecanismo hay sólo dos caminos, y los dos son malos:
//
//   · escribir COMMITEADO con un `file_id` sintético y un `t.after` que limpia — optimista: si el
//     proceso muere entre la escritura y la limpieza, la fila queda en producción para siempre. Pasó
//     el 25/09 con `caja_conteo_observado`: 500 filas `TEST_CENTINELA_*` de un proceso que murió a
//     mitad de camino.
//   · no poder escribir el test, porque `guarda-base-de-prueba.mjs` frena cualquier escritura
//     commiteada de un test contra la base productiva que no declare por qué no puede vivir con
//     rollback (`declararEscrituraEnPrueba`).
//
// ═══ LA SOLUCIÓN ═══
//
// Todo el test corre dentro de UNA transacción prestada que termina en ROLLBACK. Una "corrida
// siguiente" adentro del mismo test es sólo la sentencia siguiente sobre el mismo cliente —Postgres
// hace ver a una transacción sus propias escrituras no confirmadas—, así que la propiedad que importa
// («esto sobrevive a la corrida siguiente») se sigue probando de verdad. Y muera el proceso donde
// muera, no queda una fila: el rollback no necesita que nadie llegue a ejecutarlo desde JS, alcanza
// con que la conexión se cierre (y si ni eso pasa, el `pg_terminate_backend` del servidor la deshace).
//
// `ejecutar(sql, params)` es el reemplazo de `query(sql, params)` para el módulo que lo adopta: usa la
// conexión prestada si alguien la prestó con `conConexion`, y si no cae al pool de siempre — así el
// módulo se comporta EXACTAMENTE igual en producción, donde nadie presta nada.
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * @param {(sql:string, params?:any[]) => Promise<any>} queryPorDefecto el `query` de `db.mjs`
 * @returns {{ejecutar: (sql:string, params?:any[]) => Promise<any>, conConexion: (cliente:object, fn:Function) => any}}
 */
export function crearConexionPrestable(queryPorDefecto) {
  const conexion = new AsyncLocalStorage()
  const ejecutar = (sql, params) => {
    const c = conexion.getStore()
    return c ? c.query(sql, params) : queryPorDefecto(sql, params)
  }
  /** Corre `fn` con TODAS las lecturas/escrituras de este módulo por `cliente` (un `pg.Client` al que
   *  quien llama ya le corrió `begin`). Anidado por `AsyncLocalStorage`: sobrevive a los `await` de
   *  adentro sin que el módulo que presta la conexión tenga que pasarla a mano en cada llamada. */
  function conConexion(cliente, fn) { return conexion.run(cliente, fn) }
  return { ejecutar, conConexion }
}
