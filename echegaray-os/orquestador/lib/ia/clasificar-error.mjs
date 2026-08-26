// QUÉ CLASE DE FALLA ES — la única definición, para los cuatro caminos que hablan con un modelo.
//
// ═══ POR QUÉ SE EXTRAJO (25/08/2026) ═══
//
// Esta tabla vivía dentro de `engines/anthropic-api.mjs`, acoplada al SDK y a su forma de error. Los
// otros tres caminos —la lectura de comprobantes, el ruteo del Director y la interpretación del
// asistente— llaman a la API con `fetch` crudo y ninguno la usaba: `razonar-ruteo` e `interpretar`
// devuelven `null` ante CUALQUIER fallo, así que un 429 pasajero y una credencial vencida se ven
// igual desde afuera. Uno se reintenta y el otro hay que avisarlo.
//
// LA DISTINCIÓN QUE IMPORTA, y es de negocio, no técnica:
//
//   `credit`     la cuenta se quedó sin saldo → el OS DEGRADA (estado-cerebro) y avisa. No reintentar.
//   `auth`       la credencial no sirve → igual que arriba, pero lo arregla una persona.
//   `rate_limit` hay cuota, está ocupada → reintentar con espera. NO es una caída.
//   `server`     Anthropic tiene un problema → reintentar. Tampoco es una caída nuestra.
//   `network`    la VM no llegó → reintentar; puede ser el resolver de la VM, no el proveedor.
//   `client`     mandamos algo mal → es UN BUG NUESTRO y no se esconde con un reintento.
//
// `reintentable` NUNCA es cierto para `client`: reintentar un pedido mal armado lo manda de nuevo
// igual de mal, gasta cuota y tapa el defecto. Es la regla que el mandato pide explícitamente —
// «no usar fallback para esconder bugs internos».

/** Un mensaje de la API que habla de saldo, en cualquiera de las formas en que Anthropic lo dice. */
const SALDO = /credit balance|insufficient|billing|quota|out of credit|payment/

/** Lo que devuelve cualquiera de las dos funciones de este módulo. */
function clasificacion(kind, { hard = false, status = null, reintentable = false } = {}) {
  return { kind, hard, status, reintentable }
}

/** La tabla, sobre un status HTTP y el texto del cuerpo. Es el núcleo puro que usan las dos puertas. */
export function clasificarStatus(status, mensaje = '') {
  const msg = String(mensaje ?? '').toLowerCase()
  if (status === 402 || (status === 400 && SALDO.test(msg))) return clasificacion('credit', { hard: true, status })
  if (status === 401) return clasificacion('auth', { hard: true, status })
  if (status === 403) return clasificacion('permission', { hard: true, status })
  if (status === 429) return clasificacion('rate_limit', { status, reintentable: true })
  if (typeof status === 'number' && status >= 500) return clasificacion('server', { status, reintentable: true })
  // 4xx que no es ninguno de los de arriba: lo mandamos mal nosotros. NO se reintenta.
  if (typeof status === 'number' && status >= 400) return clasificacion('client', { status })
  return clasificacion('unknown', { status })
}

/** Un error lanzado por el SDK de Anthropic o por `fetch`. */
export function clasificarError(err) {
  const status = err?.status ?? err?.statusCode ?? null
  const msg = String(err?.message ?? err?.error?.message ?? '')
  if (status == null) {
    // Sin status no hay respuesta: o no salimos de la VM, o se cortó a mitad. Se reintenta.
    const red = err?.name === 'APIConnectionError'
      || err?.name === 'APIConnectionTimeoutError'
      || err?.name === 'AbortError'
      || err?.name === 'TimeoutError'
      || /fetch failed|econnreset|enotfound|etimedout|socket hang up/i.test(msg)
    return red ? clasificacion('network', { reintentable: true }) : clasificacion('unknown')
  }
  return clasificarStatus(status, msg)
}

/** Una respuesta de `fetch` que no vino `ok`, con el cuerpo ya leído. */
export function clasificarRespuesta(status, cuerpo = '') {
  return clasificarStatus(status, cuerpo)
}

/** ¿Esta falla tiene que apagar el razonador y degradar el OS? Sólo saldo y credencial. */
export function apagaElRazonador(c) {
  return c?.kind === 'credit' || c?.kind === 'auth'
}
