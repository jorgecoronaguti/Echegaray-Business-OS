// LAS CUENTAS DEL LEGAJO — la de sueldo y la del Fondo de Cese (dueño, 01/10/2026).
//
// *«necesito saber quiénes tienen todo creado y en regla»*. La pregunta es de Liquidación: a quién se
// le puede depositar el haber y el FCL sin que el lote rebote, y a quién todavía hay que abrirle algo.
//
// ═══ EL CONTROL VIVE EN POSTGRES; ÉSTE ES SU ESPEJO ═══
//
// `public.cuentas_del_plantel()` calcula `control` y es lo que la pantalla muestra: una sola
// definición para la web, el chat y Claude Code. Este archivo repite la regla para poder probarla
// sin base, y `cuentasDelLegajo.test.ts` ata las dos: si el patrón del convenio de la migración deja
// de ser `PATRON_CONVENIO_FCL`, el test se pone rojo. No es una segunda fuente: es la prueba de la
// primera.
//
// ═══ SIN CONVENIO CARGADO, EL FCL SE EXIGE ═══
//
// El FCL es de la Ley 22.250 (obreros UOCRA). A quien no tiene convenio cargado no se le puede decir
// «no le corresponde»: sería afirmar «en regla» sobre un dato que nadie miró. Se exige hasta que el
// convenio diga otra cosa — el control falla del lado del aviso, no del lado del silencio.
//
// Puro: sin base, sin React. Rutas relativas con extensión: lo corre `node --test`.

import { z } from 'zod'

export const ESTADOS_CUENTA = ['sin_pedir', 'pedida', 'creada'] as const
export type EstadoCuenta = (typeof ESTADOS_CUENTA)[number]

export const CONTROLES = ['completo', 'falta_sueldo', 'falta_fcl', 'falta_todo'] as const
export type ControlDeCuentas = (typeof CONTROLES)[number]

/**
 * QUÉ CONVENIO OBLIGA A TENER FCL. Los valores reales de `convenio_colectivo` son «UOCRA — Ley
 * 22.250 (construcción)» y «0076/75 UOCRA»; se reconoce cualquiera de las tres marcas. La MISMA
 * cadena está en la migración `20261001T0300` (operador `~*`, sin distinguir mayúsculas).
 */
export const PATRON_CONVENIO_FCL = 'uocra|22\\.?250|76/75'
const CONVENIO_FCL = new RegExp(PATRON_CONVENIO_FCL, 'i')

export function exigeFcl(convenio: string | null | undefined): boolean {
  const c = convenio?.trim()
  return !c || CONVENIO_FCL.test(c)
}

export interface CuentasDePersona {
  cbu: string | null
  cuenta_sueldo_estado: string | null
  fcl_cuenta: string | null
  fcl_cbu: string | null
  fcl_estado: string | null
  convenio_colectivo: string | null
}

/** Sueldo en regla = creada Y con CBU: sin CBU el banco no tiene adónde depositar. FCL en regla =
 *  creada Y con algún número: «creada» sin número no deja registro de nada. */
export function controlDeCuentas(c: CuentasDePersona): ControlDeCuentas {
  const sueldo = c.cuenta_sueldo_estado === 'creada' && Boolean(c.cbu)
  const fcl = !exigeFcl(c.convenio_colectivo)
    || (c.fcl_estado === 'creada' && Boolean(c.fcl_cuenta || c.fcl_cbu))
  if (sueldo && fcl) return 'completo'
  if (sueldo) return 'falta_fcl'
  if (fcl) return 'falta_sueldo'
  return 'falta_todo'
}

/**
 * UN CBU ES 22 DÍGITOS CON DOS VERIFICADORES (BCRA): el 8º cierra banco+sucursal, el 22º la cuenta.
 * La base sólo exige los 22 dígitos; el verificador se mira acá porque un dígito cambiado de lugar
 * pasa el largo y rebota en el banco el día del pago.
 */
export function cbuValido(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false
  const d = [...cbu].map(Number)
  const verificador = (digitos: number[], pesos: number[]) =>
    (10 - (digitos.reduce((s, x, i) => s + x * pesos[i], 0) % 10)) % 10
  return verificador(d.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) === d[7]
    && verificador(d.slice(8, 21), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === d[21]
}

/** Vacío = null. Lo que se tipea con espacios o guiones («0720 0000 …») es el mismo número. */
const texto = (max: number) => z.string().trim().max(max, `Hasta ${max} caracteres`)
  .transform((v) => (v === '' ? null : v))
const cbu = z.string().transform((v) => v.replace(/[\s.-]/g, ''))
  .refine((v) => v === '' || cbuValido(v), 'El CBU tiene 22 dígitos y los verificadores no cierran: revisalo contra el comprobante')
  .transform((v) => (v === '' ? null : v))
const estado = z.union([z.enum(ESTADOS_CUENTA), z.literal('')]).transform((v) => (v === '' ? null : v))

export const esquemaCuentas = z.object({
  cuenta_sueldo_banco: texto(80),
  cuenta_sueldo_numero: texto(40),
  cbu,
  cuenta_sueldo_estado: estado,
  fcl_cuenta: texto(40),
  fcl_cbu: cbu,
  fcl_estado: estado,
  cuentas_fuente: texto(200),
  cuentas_relevadas_en: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')])
    .transform((v) => (v === '' ? null : v)),
}).superRefine((c, ctx) => {
  // «CREADA» SIN NÚMERO NO ES UN REGISTRO: es una afirmación. La misma regla la exige la función de
  // escritura de la base; acá se dice antes de viajar, con lo tipeado intacto.
  if (c.cuenta_sueldo_estado === 'creada' && !c.cuenta_sueldo_numero && !c.cbu) {
    ctx.addIssue({ code: 'custom', message: 'Cuenta sueldo «creada» necesita el número o el CBU' })
  }
  if (c.fcl_estado === 'creada' && !c.fcl_cuenta && !c.fcl_cbu) {
    ctx.addIssue({ code: 'custom', message: 'Cuenta FCL «creada» necesita el número o el CBU' })
  }
})
export type CuentasEditadas = z.infer<typeof esquemaCuentas>

export const ROTULO_ESTADO: Record<EstadoCuenta, string> = {
  sin_pedir: 'sin pedir', pedida: 'pedida', creada: 'creada',
}

export const ROTULO_CONTROL: Record<ControlDeCuentas, string> = {
  completo: 'En regla', falta_sueldo: 'Falta sueldo', falta_fcl: 'Falta FCL', falta_todo: 'Falta todo',
}

/** Cuántos hay en cada control, sobre las personas que la lista está mostrando. `null` = esa persona
 *  no vino en la lectura de cuentas y no se cuenta en ningún lado: no es un «falta todo». */
export function conteoPorControl(
  ids: string[], control: Map<string, ControlDeCuentas>,
): Record<ControlDeCuentas, number> {
  const r: Record<ControlDeCuentas, number> = { completo: 0, falta_sueldo: 0, falta_fcl: 0, falta_todo: 0 }
  for (const id of ids) {
    const c = control.get(id)
    if (c) r[c] += 1
  }
  return r
}

export function esControl(v: string | undefined): v is ControlDeCuentas {
  return (CONTROLES as readonly string[]).includes(v ?? '')
}
