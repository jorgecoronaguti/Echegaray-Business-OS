import type { ContratoPortal } from '../types'

// LA BARRA «SU CONTRATO» DEL PORTAL — `29 · Portal del Cliente.dc.html`, líneas 94–129.
//
// El mockup dibuja cuatro tramos sobre el contrato de $ 26,40 M: cobrado 16 % ($ 4,10 M),
// certificado sin cobrar 28 % ($ 7,40 M), fondo de reparo 3 % ($ 0,64 M) y falta ejecutar 53 %
// ($ 14,26 M). Los porcentajes NO son un dato: son la única forma de que la barra cierre contra el
// contrato. Por eso se calculan acá, con test, y no en el JSX.
//
// ═══ QUÉ DEFIENDE ESTA FUNCIÓN ═══
//
// 1. `monto: null` (sin contrato cargado) NO es un contrato de cero: devuelve `null` y la sección
//    entera no se dibuja. Una barra de cuatro tramos al 0 % le diría al cliente que su obra no vale
//    nada, que es peor que no mostrarla.
// 2. «Falta ejecutar» es un RESTO, no un dato. Si el resto diera negativo —se certificó más que el
//    contrato, que pasa de verdad cuando hay adicionales todavía no incorporados— se recorta en 0 y
//    el denominador pasa a ser lo certificado: la barra sigue sumando 100 % y el cliente ve que ya
//    no queda nada por ejecutar, en vez de una barra que se desborda de su caja.
// 3. Ningún tramo puede ser negativo. Un cobrado negativo (una nota de crédito mal firmada: ya pasó,
//    $ 41,9 M de error) rompería la barra entera; acá se recorta y el importe se sigue mostrando.

export type ClaveTramo = 'cobrado' | 'sin_cobrar' | 'reparo' | 'falta'

export interface TramoContrato {
  clave: ClaveTramo
  rotulo: string
  monto: number
  /** 0–100. Los cuatro suman 100 salvo redondeo del navegador. */
  pct: number
}

export interface BarraContrato {
  /** El total contra el que se mide la barra. */
  base: number
  tramos: TramoContrato[]
  /** `true` cuando lo certificado supera el contrato: el denominador dejó de ser el contrato. */
  sobre_contratado: boolean
}

const ROTULOS: Record<ClaveTramo, string> = {
  cobrado: 'Cobrado',
  sin_cobrar: 'Sin cobrar',
  reparo: 'Fondo de reparo',
  falta: 'Falta ejecutar',
}

const noNegativo = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/**
 * Los cuatro tramos de la barra del contrato.
 *
 * @returns `null` cuando no hay contrato cargado o cuando es cero: sin denominador no hay barra que
 *   dibujar, y quien llama escribe la línea que corresponda («sin contrato cargado»).
 */
export function barraContrato(c: ContratoPortal | null | undefined): BarraContrato | null {
  if (!c || c.monto === null || !Number.isFinite(c.monto) || c.monto <= 0) return null

  const cobrado = noNegativo(c.cobrado)
  const sinCobrar = noNegativo(c.certificado_sin_cobrar)
  const reparo = noNegativo(c.fondo_reparo)
  const comprometido = cobrado + sinCobrar + reparo

  // El denominador es el contrato, salvo que ya se haya certificado por encima: ahí manda lo
  // certificado, porque una barra que suma más de 100 se sale de su caja de 26px de alto.
  const base = Math.max(c.monto, comprometido)
  const falta = Math.max(0, c.monto - comprometido)

  const tramos: TramoContrato[] = (
    [
      ['cobrado', cobrado],
      ['sin_cobrar', sinCobrar],
      ['reparo', reparo],
      ['falta', falta],
    ] as const
  ).map(([clave, monto]) => ({
    clave,
    rotulo: ROTULOS[clave],
    monto,
    pct: (monto / base) * 100,
  }))

  return { base, tramos, sobre_contratado: comprometido > c.monto }
}
