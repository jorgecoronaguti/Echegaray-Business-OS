// LA SUITE CORRE CONTRA LA BASE PRODUCTIVA. ESTA GUARDA DECIDE QUÉ PUEDE ESCRIBIR.
//
// ═══ EL DEFECTO QUE EXISTE PARA QUE NO SE REPITA ═══
//
// El 20/08/2026 un test negativo de `administracion-personas-proveedores.spec.ts` creaba un
// proveedor llamado `QA NO DEBE ENTRAR ${Date.now()}` esperando un 4xx. La RLS lo dejó entrar: la
// aserción se puso roja —hizo su trabajo— pero la fila quedó. Cuatro corridas, cuatro proveedores
// de prueba en el maestro real, encontrados dos días después. Un test negativo no limpia lo que
// «no iba a crear»: ése es el agujero, y no se tapa pidiéndole a cada autor que se acuerde.
//
// ═══ POR QUÉ NO SE PROHÍBE ESCRIBIR Y LISTO ═══
//
// Los `.pg.test.mjs` escriben A PROPÓSITO dentro de una transacción que termina en ROLLBACK: es la
// única forma de probar una propiedad de la BASE (una policy, un CHECK, un índice único, el
// `at time zone` de una función). Prohibir la escritura los volvería tests que no prueban nada.
//
// Y hay tres archivos —`*-persistencia.test.mjs`— que escriben COMMITEADO y tienen razón: la
// huella de celda y el centinela de conteo se prueban contra la tabla real porque su propiedad es
// que SOBREVIVE. Ésos declaran, y su declaración los vuelve una lista enumerable en vez de un
// hábito invisible.
//
// ═══ LA REGLA, ENTONCES ═══
//
//   fuera de un test                          → no se interviene, jamás
//   base declarada de prueba                  → pasa todo
//   test + base productiva, sin declarar      → lectura pasa; escritura dentro de transacción pasa
//                                               (el rollback la deshace); COMMIT de una transacción
//                                               que escribió se convierte en ROLLBACK y falla;
//                                               escritura en autocommit falla
//   test + base productiva, declarado         → pasa, con un aviso ruidoso por stderr
//
// FALLA CERRADO: una sentencia que el clasificador no reconoce cuenta como escritura. Preferimos un
// rojo que obligue a mirar antes que un `merge` nuevo colándose porque nadie lo previó.

/** El motivo declarado por el proceso, si alguien declaró. `null` = nadie declaró. */
let declaracion = null
let avisado = false

/**
 * DECLARAR QUE ESTE PROCESO DE PRUEBA ESCRIBE EN SERIO SOBRE LA BASE PRODUCTIVA.
 *
 * Se llama en el cuerpo del archivo de test, antes del primer `test(...)`, con el motivo real.
 * No es una formalidad: el motivo se imprime por stderr en cada corrida, así que un archivo que
 * declara sin necesitarlo se nota.
 */
export function declararEscrituraEnPrueba(motivo) {
  if (typeof motivo !== 'string' || motivo.trim().length < 20) {
    throw new Error('declararEscrituraEnPrueba(motivo): el motivo es obligatorio y tiene que decir '
      + 'POR QUÉ esta prueba no puede vivir con transacción + rollback (mínimo 20 caracteres).')
  }
  declaracion = motivo.trim()
  return declaracion
}

/** Sólo para los tests de la guarda: vuelve el módulo a su estado inicial. */
export function olvidarDeclaracion() { declaracion = null; avisado = false }

/** El motivo declarado, o null. */
export function declaracionVigente() { return declaracion }

/**
 * ¿ESTE PROCESO ES UN TEST?
 *
 * `node --test` exporta `NODE_TEST_CONTEXT` a cada hijo. Con `--experimental-test-isolation=none`
 * no hay hijo y la variable no está, así que también se mira `execArgv`: si el propio proceso
 * arrancó con `--test`, es un test aunque nadie le haya avisado por entorno.
 */
export function enContextoDePrueba(env = process.env, execArgv = process.execArgv) {
  if (env.ORQ_FORZAR_CONTEXTO_PRUEBA === '1') return true
  if (env.NODE_TEST_CONTEXT) return true
  return execArgv.some((a) => a === '--test' || a.startsWith('--test='))
}

/**
 * ¿LA BASE A LA QUE APUNTA `url` ESTÁ DECLARADA COMO DE PRUEBA?
 *
 * Fail-closed: si nadie declaró nada, la base es la productiva. Una base de prueba se declara de
 * una sola forma —poniendo su URL en `ORQ_TEST_DB_URL` (o `PG_TEST_URL`, que ya usaba
 * `recordatorios.pg.test.mjs` con su Postgres en Docker)— y sólo cuenta si es LA MISMA a la que se
 * está conectando. Declarar una URL de prueba y conectarse a producción no es una base de prueba.
 */
export function baseDeclaradaDePrueba(url, env = process.env) {
  if (env.ORQ_BASE_ES_DE_PRUEBA === '1') return true
  const declaradas = [env.ORQ_TEST_DB_URL, env.PG_TEST_URL].filter(Boolean)
  if (!url || declaradas.length === 0) return false
  return declaradas.some((d) => d.trim() === String(url).trim())
}

const LECTURA = /^(select|with|show|explain|table|values|fetch|close|analyze|reset|discard|listen|unlisten|deallocate|checkpoint)\b/
const ESCRIBE_EN_CTE = /\b(insert\s+into|update\s+\S|delete\s+from|merge\s+into)\b/
const SELECT_INTO = /\bselect\b[\s\S]*\binto\s+(?!strict\b)/

/**
 * QUÉ ES ESTA SENTENCIA: 'lectura' · 'escritura' · 'abre' · 'confirma' · 'deshace' · 'sesion'.
 *
 * El caso que un `startsWith('select')` deja pasar es el CTE que modifica:
 * `with x as (delete from t returning *) select * from x` empieza con `with` y borra. Por eso una
 * sentencia de lectura que contiene un verbo de escritura vuelve a contar como escritura.
 */
export function claseDeSentencia(sql) {
  if (typeof sql !== 'string') return 'escritura'
  const limpio = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')     // comentarios de bloque
    .replace(/--[^\n]*/g, ' ')             // comentarios de línea
    .trim().toLowerCase()
  if (!limpio) return 'sesion'
  if (/^(begin|start\s+transaction)\b/.test(limpio)) return 'abre'
  if (/^(commit|end)\b/.test(limpio)) return 'confirma'
  // `ROLLBACK TO [SAVEPOINT] x` NO cierra la transacción: vuelve a un punto y SIGUE ADENTRO.
  // Tratarlo como un rollback entero dejó a la guarda creyendo que el resto del caso controlado
  // corría en autocommit, y frenó 31 escrituras legítimas que ya estaban dentro de un `begin`.
  if (/^rollback\s+to\b/.test(limpio)) return 'sesion'
  if (/^(rollback|abort)\b/.test(limpio)) return 'deshace'
  if (/^(savepoint|release\s+savepoint|prepare\s+transaction)\b/.test(limpio)) return 'sesion'
  if (/^(set|lock)\b/.test(limpio)) return 'sesion'
  if (LECTURA.test(limpio)) {
    return ESCRIBE_EN_CTE.test(limpio) || SELECT_INTO.test(limpio) ? 'escritura' : 'lectura'
  }
  return 'escritura' // falla cerrado
}

/**
 * LA DECISIÓN, PURA. `estado` es lo que la guarda sabe de esta conexión:
 *   { enTransaccion, escribio }  — `escribio` es «alguna sentencia de escritura desde el begin».
 *
 * Devuelve `{ accion, motivo, estado }`:
 *   accion 'pasa'      — se ejecuta tal cual
 *   accion 'frena'     — se lanza el error con `motivo`, sin tocar la base
 *   accion 'deshace'   — se ejecuta un ROLLBACK en lugar de lo pedido y DESPUÉS se lanza el error
 */
export function decidir({ sql, esPrueba, baseDePrueba, declarado, estado = {} }) {
  const clase = claseDeSentencia(sql)
  const previo = { enTransaccion: Boolean(estado.enTransaccion), escribio: Boolean(estado.escribio) }
  const siguiente =
    clase === 'abre' ? { enTransaccion: true, escribio: false }
      : clase === 'confirma' || clase === 'deshace' ? { enTransaccion: false, escribio: false }
        : { enTransaccion: previo.enTransaccion, escribio: previo.escribio || clase === 'escritura' }

  if (!esPrueba || baseDePrueba || declarado) return { accion: 'pasa', motivo: null, estado: siguiente }

  if (clase === 'escritura' && !previo.enTransaccion) {
    return {
      accion: 'frena',
      motivo: 'ESCRITURA COMMITEADA DESDE UN TEST SOBRE LA BASE PRODUCTIVA.\n'
        + `  sentencia: ${resumir(sql)}\n`
        + '  Fuera de una transacción, esto queda en producción para siempre — así llegaron cuatro\n'
        + '  proveedores «QA NO DEBE ENTRAR» al maestro real.\n'
        + '  Tres salidas, en este orden:\n'
        + '   1. envolver la prueba en `begin` … `rollback` (lo que hace todo `*.pg.test.mjs`);\n'
        + '   2. correr contra una base aislada: ORQ_TEST_DB_URL=<url> (o PG_TEST_URL);\n'
        + '   3. si la prueba es JUSTAMENTE que el dato sobrevive, declararlo:\n'
        + "      import { declararEscrituraEnPrueba } from '<…>/guarda-base-de-prueba.mjs'\n"
        + "      declararEscrituraEnPrueba('por qué esta prueba no puede vivir con rollback')",
      estado: previo,
    }
  }

  if (clase === 'confirma' && previo.escribio) {
    return {
      accion: 'deshace',
      motivo: 'COMMIT DE UNA TRANSACCIÓN QUE ESCRIBIÓ, DESDE UN TEST, SOBRE LA BASE PRODUCTIVA.\n'
        + '  Se ejecutó ROLLBACK en su lugar: la base quedó como estaba.\n'
        + '  Un test que necesita commitear necesita una base propia (ORQ_TEST_DB_URL) o una\n'
        + '  declaración explícita con `declararEscrituraEnPrueba(motivo)`.',
      estado: { enTransaccion: false, escribio: false },
    }
  }

  return { accion: 'pasa', motivo: null, estado: siguiente }
}

function resumir(sql) {
  const s = String(sql).replace(/\s+/g, ' ').trim()
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

/** El aviso ruidoso, una sola vez por proceso: una declaración que nadie ve no disciplina a nadie. */
function avisarUnaVez(escribir) {
  if (avisado || !declaracion) return
  avisado = true
  escribir(`\n⚠  ESTA PRUEBA ESCRIBE EN SERIO SOBRE LA BASE PRODUCTIVA — declarado:\n   ${declaracion}\n`)
}

/**
 * ENVUELVE EL POOL. Devuelve el mismo objeto si no hay nada que vigilar, para que fuera de los
 * tests no haya ni una capa de más entre el Fabric y el driver.
 *
 * `pool.query` es el camino de autocommit; `pool.connect` devuelve el cliente donde vive la
 * transacción, y por eso el estado se lleva POR CLIENTE: dos clientes del mismo pool están en
 * transacciones distintas y un `commit` de uno no dice nada del otro.
 */
export function instalarGuarda(pool, {
  esPrueba = enContextoDePrueba(),
  baseDePrueba = false,
  aviso = (m) => process.stderr.write(m),
} = {}) {
  if (!esPrueba || baseDePrueba) return pool

  // ═══ LA FIRMA DE `query` TIENE DOS CARAS, Y `pg` USA LAS DOS ═══
  //
  // `Pool.prototype.query` llama por dentro a `client.query(texto, valores, callback)` — forma de
  // callback, sin promesa. Una envoltura `async (texto, params)` ignora ese tercer argumento, no lo
  // invoca nunca y la promesa que `Pool.query` le devolvió a quien llamó NO SE RESUELVE JAMÁS: la
  // suite no falla, se cuelga. Pasó mientras se construía esto — tres archivos, cinco minutos sin
  // una sola línea de salida.
  const vigilar = (ejecutar, estado) => (texto, valores, cb) => {
    const callback = typeof cb === 'function' ? cb : typeof valores === 'function' ? valores : null
    const params = typeof valores === 'function' ? undefined : valores
    const sql = typeof texto === 'string' ? texto : typeof texto?.text === 'string' ? texto.text : null

    const declarado = declaracion !== null
    if (declarado) avisarUnaVez(aviso)
    const { accion, motivo, estado: nuevo } = decidir({
      sql, esPrueba: true, baseDePrueba: false, declarado, estado,
    })
    estado.enTransaccion = nuevo.enTransaccion
    estado.escribio = nuevo.escribio

    if (accion === 'pasa') {
      return callback ? ejecutar(texto, params, callback) : ejecutar(texto, params)
    }
    const error = new Error(motivo)
    if (accion === 'frena') {
      if (callback) { callback(error); return undefined }
      return Promise.reject(error)
    }
    // 'deshace': la base vuelve atrás PRIMERO y recién después se avisa. Al revés, una conexión
    // con la transacción abierta vuelve al pool y el que la tome después escribe adentro de ella.
    const volver = Promise.resolve(ejecutar('rollback')).catch(() => {})
    if (callback) { volver.then(() => callback(error)); return undefined }
    return volver.then(() => { throw error })
  }

  const queryOriginal = pool.query.bind(pool)
  const connectOriginal = pool.connect.bind(pool)

  /** Le pone la guarda a un cliente ya conectado, con estado propio: dos clientes del mismo pool
   *  están en transacciones distintas. Idempotente — `pg` reusa clientes del pool y volver a
   *  envolver uno ya envuelto encadenaría una guarda por cada préstamo. */
  const envolver = (cliente) => {
    if (!cliente || cliente[YA_VIGILADO]) return cliente
    const estado = { enTransaccion: false, escribio: false }
    const original = cliente.query.bind(cliente)
    cliente.query = vigilar((t, p, c) => (c ? original(t, p, c) : original(t, p)), estado)
    // `pg` presta el mismo cliente muchas veces. Sin este reset, un `begin` que nadie cerró deja al
    // préstamo siguiente creyendo que está en transacción — y sus escrituras pasarían.
    if (typeof cliente.release === 'function') {
      const soltar = cliente.release.bind(cliente)
      cliente.release = (...args) => {
        estado.enTransaccion = false
        estado.escribio = false
        return soltar(...args)
      }
    }
    cliente[YA_VIGILADO] = true
    return cliente
  }

  // `pool.query` se vigila con estado NUEVO en cada llamada: cada una sale por una conexión
  // distinta del pool, así que un `begin` acá no abre nada que la siguiente pueda ver. Es
  // autocommit por definición.
  pool.query = (texto, valores, cb) =>
    vigilar((t, p, c) => (c ? queryOriginal(t, p, c) : queryOriginal(t, p)),
      { enTransaccion: false, escribio: false })(texto, valores, cb)

  // DOS FORMAS DE LLAMAR, Y `pg` USA LAS DOS. `Pool.prototype.query` llama por dentro a
  // `this.connect(callback)`: una envoltura que sólo contemplara la promesa devolvía `undefined`
  // y rompía TODA lectura del Fabric bajo test — 30 archivos en rojo sin un solo defecto real.
  pool.connect = (cb) => {
    if (typeof cb === 'function') {
      return connectOriginal((err, cliente, done) => cb(err, envolver(cliente), done))
    }
    return connectOriginal().then(envolver)
  }
  return pool
}

const YA_VIGILADO = Symbol.for('orq.guarda-base-de-prueba.vigilado')
