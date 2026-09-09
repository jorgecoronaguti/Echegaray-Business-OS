// MI LÍNEA DEL ÍNDICE DE SOLAPAS, EN UN ARCHIVO PROPIO.
//
// `solapas/index.ts` lo construye otro frente en paralelo. Dos agentes escribiendo el mismo archivo
// terminan en un merge a mano o —peor— en una solapa que se pierde sin que nadie lo note. Cuando el
// índice exista, se hace `...SOLAPAS_DE_PAGOS_Y_CIERRE` y esto desaparece.

export const SOLAPAS_DE_PAGOS_Y_CIERRE = [
  { clave: 'pagos', titulo: 'Pagos' },
  { clave: 'cierre', titulo: 'Cierre' },
] as const

export type ClaveDeSolapaPropia = (typeof SOLAPAS_DE_PAGOS_Y_CIERRE)[number]['clave']

export const esSolapaPropia = (v: string | undefined): v is ClaveDeSolapaPropia =>
  v === 'pagos' || v === 'cierre'
