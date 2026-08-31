// EL CONTADOR DE LLAMADAS AL MODELO QUE **PUEDE DECIR QUE NO** — y que también puede decir que sí.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO VIENE A CORREGIR ═══
//
// El criterio §13 «funciona sin Claude» quedó NO_VERIFICABLE con este motivo, y era exacto:
// `correr()` arma sus métricas con `llamadasLLM: []` CABLEADO, así que `llamadas_llm === 0` no era
// una medición sino una constante. Un cero que no puede ser otra cosa no prueba nada. Es el mismo
// defecto que este repo ya pagó dos veces: el Claude Avoidance Rate que daba 100 % siempre, y el
// control de $ 4,1 M que era literalmente una constante.
//
// ═══ POR QUÉ SE MIDE EN EL TRANSPORTE Y NO EN LA DECLARACIÓN ═══
//
// `crearRegistro().anotarLLM()` cuenta lo que el llamador DECLARA. Sirve, pero un contador que
// depende de que quien gasta se acuse a sí mismo tiene el mismo agujero que una rendición sin
// comprobantes: el que se olvida de declarar no aparece, y el que llama al modelo por fuera del
// fast path no aparece nunca.
//
// Este medidor cuenta en el ÚNICO lugar por donde no se puede pasar sin que se note: la salida
// HTTP. Envuelve `fetch` —el mismo que usa `lib/ia/proveedores/anthropic.mjs`, que recibe su
// `fetchImpl` de `globalThis.fetch`— y anota toda petición dirigida a un host de modelo, la haya
// declarado alguien o no. Los tokens y el costo salen del `usage` que devuelve el proveedor, no de
// una estimación nuestra.
//
// ═══ LA LLAVE Y EL CAMINO SON LOS DEL SISTEMA DE VERDAD ═══
//
// En este repo ya hubo una sonda que declaró muerto un token sano porque probaba con OTRA llave.
// Por eso acá no hay un cliente propio ni un host propio: se envuelve el `fetch` global y se
// reconoce el host por la misma URL que el proveedor real construye. Si mañana el OS cambia de
// proveedor, el medidor lo ve igual — lo que no puede cambiar es que una llamada salga por la red.
//
// ═══ LO QUE ESTE MEDIDOR NO HACE ═══
//
// No bloquea, no reintenta y no decide. Cuenta. La decisión de si esa llamada estaba permitida es
// de `fast-path.mjs` (`esDeterministica`), y la de si se puede llamar es de `estadoDelProveedor`.
//
// ═══ POR QUÉ VIVE EN `lib/ia/` Y NO EN `lib/cotizador/` ═══
//
// `xsas-sin-llm.mjs` audita que NINGÚN módulo de `lib/cotizador/` importe algo de un modelo, y ésa
// es la garantía estructural del §13. Un medidor que necesita la tabla de precios de
// `engines/anthropic-api.mjs` metido ahí adentro habría obligado a ablandar esa auditoría para que
// no se marcara a sí mismo — y una auditoría con una excepción escrita a medida deja de auditar.
// Acá no molesta a nadie y está al lado de la puerta que mide. El medidor NO puede llamar a un
// modelo: envuelve `fetch`, nunca origina una petición.

/**
 * LOS HOSTS QUE CUENTAN COMO «UN MODELO». Es una lista y no una heurística a propósito: adivinar
 * por la forma de la URL contaría como LLM cualquier `/v1/messages` de cualquier servicio.
 *
 * `ORQ_ANTHROPIC_HOST` y `ORQ_IA_ALT_BASE_URL` son las dos escotillas que el OS ya tiene para
 * apuntar a otro endpoint; si no se leyeran, un cambio de host apagaría el contador en silencio.
 */
export const hostsDeModelo = () => [
  'api.anthropic.com',
  'api.openai.com',
  ...[process.env.ORQ_ANTHROPIC_HOST, process.env.ORQ_IA_ALT_BASE_URL]
    .filter(Boolean)
    .map((u) => { try { return new URL(u).host } catch { return null } })
    .filter(Boolean),
]

/** ¿Esta URL va a un modelo? PURA salvo por el entorno, que se lee en `hostsDeModelo`. */
export function esUrlDeModelo(url) {
  let host
  try { host = new URL(String(url)).host } catch { return false }
  return hostsDeModelo().includes(host)
}

/** El nombre que el proveedor le dio al modelo en la RESPUESTA. Se prefiere al que se pidió porque
 *  trae el sufijo de versión, y el precio de este repo sabe recortarlo. PURA. */
const modeloDe = (json, cuerpoPedido) => json?.model ?? cuerpoPedido?.model ?? null

/** Los tokens tal como los reporta el proveedor. No se estiman: un token estimado en un contador de
 *  costo es una cifra inventada con dos decimales. PURA. */
function tokensDe(json) {
  const u = json?.usage ?? null
  if (!u) return null
  const entrada = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
  return { in: entrada, out: u.output_tokens ?? 0, crudo: u }
}

/** El precio lo pone la tabla que ya existe en `engines/anthropic-api.mjs`. Importarla en vez de
 *  copiarla evita el defecto que este repo ya midió: dos definiciones del mismo número conviviendo
 *  y sólo una recibiendo las correcciones. `null` si el modelo no está en la tabla — inventar un
 *  precio sería peor que no tenerlo. */
async function costoUsd(modeloId, usage) {
  if (!modeloId || !usage) return null
  try {
    const { estimateCostUsd } = await import('../../engines/anthropic-api.mjs')
    return estimateCostUsd(modeloId, usage)
  } catch { return null }
}

/**
 * EL MEDIDOR. No es puro —acumula—, pero todo lo que acumula viene de una petición que realmente
 * salió: no hay ninguna vía por la que un número suba sin que haya habido una llamada.
 *
 * `instalar()` reemplaza `globalThis.fetch` y devuelve la función que lo restituye. Se restituye
 * SIEMPRE en un `finally`: dejar el `fetch` global parcheado después de una corrida contaminaría
 * todo lo que siga en el mismo proceso, incluidos otros tests.
 */
export function crearMedidorLLM({ ahora = () => Date.now() } = {}) {
  let llamadas = []
  let instalado = null

  const anotar = (l) => { llamadas.push(Object.freeze(l)) }

  async function medir(original, args) {
    const [entrada, opciones] = args
    const url = typeof entrada === 'string' ? entrada : (entrada?.url ?? String(entrada))
    if (!esUrlDeModelo(url)) return original(...args)

    let cuerpoPedido = null
    try { cuerpoPedido = JSON.parse(String(opciones?.body ?? '')) } catch { /* no siempre es JSON */ }

    const t0 = ahora()
    let res
    try {
      res = await original(...args)
    } catch (e) {
      // UNA LLAMADA QUE NO LLEGÓ SIGUE SIENDO UNA LLAMADA. Consumió tiempo, y borrarla del registro
      // haría parecer que el proveedor nunca falla. Sin tokens porque no hubo respuesta.
      anotar({ url, ok: false, estado: null, error: String(e?.message ?? e).slice(0, 200), modelo: cuerpoPedido?.model ?? null, tokensIn: 0, tokensOut: 0, usd: null, ms: ahora() - t0 })
      throw e
    }

    // `clone()` y no `res`: leer el cuerpo del original dejaría al llamador con un stream consumido.
    // Un medidor que rompe lo que mide no es un medidor.
    let json = null
    try { json = await res.clone().json() } catch { /* un 4xx no siempre trae JSON */ }
    const tk = tokensDe(json)
    const modelo = modeloDe(json, cuerpoPedido)
    anotar({
      url, ok: res.ok, estado: res.status, error: null, modelo,
      tokensIn: tk?.in ?? 0, tokensOut: tk?.out ?? 0,
      usd: tk ? await costoUsd(modelo, tk.crudo) : null,
      ms: ahora() - t0,
    })
    return res
  }

  return {
    instalar() {
      if (instalado) return instalado
      const original = globalThis.fetch
      globalThis.fetch = (...args) => medir(original, args)
      instalado = () => { globalThis.fetch = original; instalado = null }
      return instalado
    },

    /** Lo medido, en la forma que `metricasDeCorrida` ya sabe leer (`llamadasLLM`). El `usd` en
     *  `null` —modelo sin precio— se cuenta como 0 en el total pero se declara aparte: no es lo
     *  mismo «costó cero» que «no se pudo poner precio». */
    instantanea() {
      const conPrecio = llamadas.filter((l) => l.usd !== null && l.usd !== undefined)
      return Object.freeze({
        llamadas: llamadas.map((l) => Object.freeze({ tokensIn: l.tokensIn, tokensOut: l.tokensOut, usd: l.usd ?? 0, nivel: null })),
        detalle: Object.freeze([...llamadas]),
        total: llamadas.length,
        fallidas: llamadas.filter((l) => !l.ok).length,
        tokens: llamadas.reduce((a, l) => a + l.tokensIn + l.tokensOut, 0),
        usd: Math.round(conPrecio.reduce((a, l) => a + l.usd, 0) * 1e6) / 1e6,
        sinPrecio: llamadas.length - conPrecio.length,
        ms: llamadas.reduce((a, l) => a + l.ms, 0),
      })
    },

    reiniciar() { llamadas = [] },
  }
}

/**
 * EL MEDIDOR DEL PROCESO. Uno solo, porque `globalThis.fetch` es uno solo: dos medidores instalados
 * a la vez se envolverían entre sí y contarían la misma llamada dos veces.
 */
export const medidorGlobal = crearMedidorLLM()

/**
 * CORRER ALGO CON EL MEDIDOR PUESTO. La forma recomendada de usarlo: no hay manera de olvidarse de
 * desinstalarlo, porque lo hace el `finally`.
 *
 * @returns `{ resultado, medicion }` — y si `fn` tira, el medidor se desinstala igual y el error
 *   sigue subiendo: tapar el error para devolver la medición sería medir una corrida que no pasó.
 */
export async function medirLlamadasLLM(fn, { medidor = crearMedidorLLM() } = {}) {
  const desinstalar = medidor.instalar()
  try {
    const resultado = await fn()
    return { resultado, medicion: medidor.instantanea() }
  } finally {
    desinstalar()
  }
}

/**
 * EL CRUCE ENTRE LO QUE SE DECLARÓ Y LO QUE SALIÓ POR LA RED. PURA.
 *
 * Es el control que hace que declarar de menos no sirva de nada: si el transporte vio más llamadas
 * que las que alguien anotó, la diferencia se publica como `noDeclaradas` y el total informado es
 * el MAYOR de los dos. Un contador de gasto sólo puede equivocarse para arriba.
 */
export function conciliarLLM({ declaradas = 0, medidas = 0 } = {}) {
  const d = Math.max(0, Number(declaradas) || 0)
  const m = Math.max(0, Number(medidas) || 0)
  return Object.freeze({
    declaradas: d,
    medidas: m,
    noDeclaradas: Math.max(0, m - d),
    total: Math.max(d, m),
    cuadra: d === m,
    porQue: d === m
      ? 'lo declarado y lo que salió por la red coinciden'
      : m > d
        ? `salieron ${m - d} llamada(s) al modelo que NADIE declaró: el fast path no las vio pasar`
        : `se declararon ${d - m} llamada(s) que no salieron por la red (dobles de test, o una llamada que falló antes de la petición)`,
  })
}
