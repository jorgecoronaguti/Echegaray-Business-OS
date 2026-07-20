// LAS CUENTAS DE DISPONIBILIDADES — CON NOMBRES DE PLAN DE CUENTAS, NO COLOQUIALES.
//
// POR QUÉ (20/07). El dueño pidió "banco, caja grande y caja chica, cupo restante de tarjeta de
// crédito, con nombres como corresponde no coloquial". Los rótulos de acá son los que usa cualquier
// contador argentino, así que el día que esto se cruce con la contabilidad los dos lados van a estar
// hablando del mismo concepto:
//   · "caja grande"  → Caja en pesos
//   · "caja chica"   → Fondo fijo
//   · cheques de terceros recibidos y todavía no depositados → Valores a depositar
//
// LA DISTINCIÓN QUE NO SE PUEDE PERDER: el margen disponible de la tarjeta NO es una disponibilidad.
// Es capacidad de endeudarse. Va en su propio bloque, debajo del total, y NO suma. Sumarlo sería
// contar como plata propia una deuda que todavía no se tomó — que es exactamente el error que hace
// que una empresa se crea líquida el día antes de no poder pagar sueldos. Por eso CUENTAS (que sí
// suman) y CARGA (que no) están separadas acá y no en el script.
//
// POR QUÉ EL MATCH ES POR PATRÓN Y NO POR NOMBRE EXACTO: el agente reescribe la pestaña cada 2 horas
// y tiene que devolver cada saldo cargado a mano a SU cuenta. Si el dueño completa el nombre del
// banco —"Banco Galicia — Cuenta corriente en pesos"— un match exacto perdería el saldo en silencio.
// El patrón sobrevive a que le pongan el nombre real, que es justamente lo que hay que hacer.

/** Las cuentas que SUMAN al efectivo. En el orden en que se leen: de lo más líquido a lo menos. */
export const CUENTAS = [
  {
    nombre: 'Caja en pesos',
    patron: /^caja en pesos/i,
    origenSugerido: 'Arqueo de caja',
  },
  {
    nombre: 'Fondo fijo',
    patron: /^fondo fijo/i,
    origenSugerido: 'Arqueo de caja',
  },
  {
    // El nombre del banco lo completa el dueño: no está en ningún dato del archivo y no se inventa.
    nombre: 'Banco — Cuenta corriente en pesos',
    patron: /^banco.*cuenta corriente/i,
    origenSugerido: 'Extracto bancario — completar el nombre del banco',
  },
  {
    nombre: 'Valores a depositar (cheques de terceros en cartera)',
    patron: /^valores a depositar/i,
    origenSugerido: 'Cartera de cheques recibidos',
  },
]

/** Lo que se carga a mano pero NO es una disponibilidad. */
export const CARGA = {
  limiteTarjeta: 'Tarjeta de crédito — límite acordado',
}

const TODAS = [...CUENTAS.map((c) => c.patron), new RegExp(`^${CARGA.limiteTarjeta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')]

/**
 * NÚCLEO PURO: ¿este rótulo de la columna A es una fila donde se carga un dato a mano?
 * Se usa para rescatar los saldos antes de reescribir la pestaña, y para contar cuántas cuentas
 * siguen sin cargar.
 * @param {string} rotulo
 * @returns {boolean}
 */
export function filaDeCuenta(rotulo) {
  const t = String(rotulo ?? '').trim()
  return t.length > 0 && TODAS.some((p) => p.test(t))
}

/**
 * NÚCLEO PURO: la disponibilidad neta, que es el número con el que conviene decidir.
 * No es el saldo: es el saldo menos los cheques ya firmados que todavía no se debitaron. Esa plata
 * está en la cuenta y ya no es de la empresa.
 * @param {number} disponibilidades suma de CUENTAS
 * @param {number} chequesEmitidosSinDebitar
 * @returns {number}
 */
export function disponibilidadNeta(disponibilidades = 0, chequesEmitidosSinDebitar = 0) {
  return (Number(disponibilidades) || 0) - (Number(chequesEmitidosSinDebitar) || 0)
}

/**
 * NÚCLEO PURO: el margen de la tarjeta. Devuelve null si falta el límite — y null NO es cero:
 * mostrar $0 cuando el dato no se cargó haría creer que la tarjeta está agotada.
 * @returns {number|null}
 */
export function margenTarjeta(limiteAcordado, consumidoSinDebitar = 0) {
  const l = Number(limiteAcordado)
  if (!Number.isFinite(l) || l <= 0) return null
  return l - (Number(consumidoSinDebitar) || 0)
}
