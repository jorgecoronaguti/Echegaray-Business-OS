// LO QUE SE LE DEBE A ESTE PROVEEDOR, DICHO EN SU FICHA — «necesito q dentro de la ficha de cada
// proveedor pueda ver si tengo monto adeudado y cuanto, son muchos clicks hasta llegar a ver algo y
// esta muy oculto en la ux» (dueño, 22/09/2026).
//
// ═══ ESTE MÓDULO NO DEFINE LA DEUDA: LA TRADUCE ═══
//
// Qué se debe, qué venció y qué todavía no lo decide `deudaProveedores.ts` —la misma regla que
// dibuja la sección «A quién le debo»— sobre la misma fuente (`compra_sheet.saldo_pendiente`, el
// espejo de la pestaña Compras). Acá NO se vuelve a sumar nada: entra la fila que esa regla ya armó
// y sale lo que la cabecera de la ficha tiene que decir. Con una segunda cuenta habría dos verdades
// para el mismo número y el día que difieran nadie sabría cuál mirar.
//
// ═══ LOS TRES ESTADOS, Y POR QUÉ NINGUNO ES UN CERO ═══
//
//   DEBE      hay saldo vivo. Se publica el total, y partido en vencido / por vencer / sin fecha.
//   AL DÍA    se leyó la deuda y este proveedor no tiene ninguna compra con saldo. Se DICE «al día»:
//             es una afirmación sobre la empresa y merece una palabra, no un renglón en blanco.
//   SIN LEER  no se pudo mirar (no es Administración, falló la lectura, o la lista llegó cortada).
//             Se dice POR QUÉ. Un «$ 0» acá se leería como «no le debo nada», que es exactamente la
//             mentira que la regla de oro 2 prohíbe: la ausencia de dato no es la ausencia de deuda.
//
// ═══ «DESDE CUÁNDO» ES LA FECHA VENCIDA MÁS VIEJA ═══
//
// No la de la compra ni la del último pago: la del vencimiento más antiguo que todavía no se pagó,
// que es lo que mide cuánto hace que este proveedor espera. Los días se cuentan en fechas ISO sin
// `Date` local de por medio — con husos, un vencimiento del día se corría a «1 día de atraso».
//
// Sin imports de React ni de Supabase: se prueba con `node --test`.

import type { DeudaDeProveedor } from './deudaProveedores.ts'

export type EstadoDeudaFicha = 'debe' | 'al-dia' | 'sin-leer'

export interface DeudaDeLaFicha {
  estado: EstadoDeudaFicha
  /** Por qué no se puede saber. Sólo en `sin-leer`, y nunca vacío ahí. */
  motivo: string | null
  /** Todos en pesos. En `al-dia` y `sin-leer` son 0 y NO se dibujan: el estado manda sobre el número. */
  total: number
  vencido: number
  porVencer: number
  sinFecha: number
  /** Filas de Compras con saldo, no tramos de vencimiento. */
  comprobantes: number
  /** La fecha vencida más vieja, ISO. `null` = no hay nada vencido. */
  desde: string | null
  /** Días que hace que venció la más vieja. `null` cuando no hay nada vencido. */
  diasDeAtraso: number | null
  /** El próximo vencimiento que todavía no pasó, ISO. `null` = no hay nada por vencer. */
  proximo: string | null
  /** La clave de la fila en «A quién le debo» — la que abre su detalle. `null` = no hay detalle que abrir. */
  clave: string | null
  /** El día contra el que se decidió qué está vencido. Va en la pantalla: el corte se declara. */
  hoyISO: string
  /** `true` = la lectura llegó al tope y el total puede quedar corto. Se dice, no se calla. */
  truncado: boolean
  /** El descuadre contra `public.proveedor_deuda`. `null` = cierran o no hay con qué cotejar. */
  cotejo: string | null
}

/** Lo que la lectura entrega. `truncado` y `cotejo` viajan porque los dos pueden invalidar el total. */
export interface LecturaDeDeuda {
  fila: DeudaDeProveedor | null
  hoy: string
  truncado?: boolean
  cotejo?: string | null
}

const VACIO = {
  total: 0, vencido: 0, porVencer: 0, sinFecha: 0, comprobantes: 0,
  desde: null, diasDeAtraso: null, proximo: null, clave: null, truncado: false, cotejo: null,
} as const

/** Días enteros entre dos ISO `YYYY-MM-DD`, contados en UTC para que ningún huso corra una fecha. */
export function diasEntre(desde: string, hasta: string): number {
  const dia = (iso: string) => Date.UTC(
    Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)),
  )
  return Math.round((dia(hasta) - dia(desde)) / 86_400_000)
}

/**
 * LO QUE LA FICHA MUESTRA ARRIBA.
 *
 * `leido === null` ⇒ no se pudo mirar, y `motivo` es obligatorio: sin él la pantalla tendría que
 * inventar una explicación. `fila === null` con lectura buena ⇒ al día.
 */
export function deudaDeLaFicha(
  leido: LecturaDeDeuda | null,
  motivo: string | null,
): DeudaDeLaFicha {
  if (!leido) {
    return {
      ...VACIO, estado: 'sin-leer', hoyISO: '',
      motivo: motivo ?? 'No se pudo leer lo que se le debe.',
    }
  }
  const { fila, hoy } = leido
  const comun = { hoyISO: hoy, truncado: leido.truncado ?? false, cotejo: leido.cotejo ?? null }
  // TRUNCADO NO PUEDE DECIR «AL DÍA»: la fila de este proveedor puede haber quedado fuera del tope.
  if (!fila || fila.total <= 0) {
    if (comun.truncado) {
      return {
        ...VACIO, ...comun, estado: 'sin-leer',
        motivo: 'La lista de compras con saldo llegó al tope de lectura: no puedo afirmar que este '
          + 'proveedor esté al día.',
      }
    }
    return { ...VACIO, ...comun, estado: 'al-dia', motivo: null }
  }
  return {
    ...comun,
    estado: 'debe',
    motivo: null,
    total: fila.total,
    vencido: fila.vencido,
    porVencer: fila.porVencer,
    sinFecha: fila.sinFecha,
    comprobantes: fila.comprobantes,
    desde: fila.masViejaVencida,
    diasDeAtraso: fila.masViejaVencida ? diasEntre(fila.masViejaVencida, hoy) : null,
    proximo: fila.proximoVencimiento,
    clave: fila.clave,
  }
}

/**
 * EL TONO DE LA CIFRA. Vencido = problema (rojo); comprometido a futuro = un hecho, sin color.
 *
 * Lo SIN FECHA también pinta: se debe y no se sabe cuándo, que es un agujero de gestión —no se puede
 * planificar el pago— y no un compromiso ordenado.
 */
export function tonoDeLaDeuda(d: DeudaDeLaFicha): 'neg' | 'warn' | undefined {
  if (d.estado !== 'debe') return undefined
  if (d.vencido > 0) return 'neg'
  if (d.sinFecha > 0) return 'warn'
  return undefined
}

/**
 * LA DEFINICIÓN DE LA CIFRA, para el `title`. Dice QUÉ suma y CON QUÉ CORTE, que es lo que impide
 * que «Adeudado» se lea como «lo comprado que falta facturar» o como un saldo de cuenta corriente.
 */
export function tituloDeLaDeuda(d: DeudaDeLaFicha, hoy: string): string {
  if (d.estado === 'sin-leer') return d.motivo ?? ''
  if (d.estado === 'al-dia') {
    return `Ninguna compra suya de la pestaña Compras tiene saldo pendiente al ${hoy}.`
  }
  return 'Suma del saldo pendiente de sus compras en la pestaña Compras (lo facturado menos lo '
    + `pagado), al ${hoy}. Es la misma cuenta que la sección «A quién le debo».`
}
