// EL PERÍODO DE UN RECIBO DE SUELDO, LEÍDO DEL NOMBRE DEL ARCHIVO — la misma regla que «Mis recibos».
//
// «Mis recibos» del empleado lo resuelve en la vista `mi_recibo` (migración 20260820T6000): el período
// sale del NOMBRE («Recibo 2026-08 Q2 · APELLIDO NOMBRE.pdf»), no de `fecha_documento`, porque las dos
// quincenas de un mes están cargadas con la misma fecha.
//
// ═══ POR QUÉ HAY UNA COPIA EN TYPESCRIPT, Y POR QUÉ NO PUEDE DIVERGIR ═══
//
// Liquidación necesita los recibos de TODAS las personas. `mi_recibo` filtra `mi_persona_id()` —devuelve
// sólo los del empleado que pregunta— y cambiarla sería una migración. Así que las tres expresiones se
// escriben acá, UNA vez, y `recibosDeLaQuincena.test.ts` lee la migración y exige que sean las mismas:
// si alguien cambia una, el test da rojo. Un período sin quincena en el nombre no inventa una.

/** Las tres expresiones de `mi_recibo`, textuales. El test las busca en la migración. */
export const REGEX_DEL_PERIODO = {
  anio: '(\\d{4})-(\\d{2})',
  mes: '\\d{4}-(\\d{2})',
  quincena: 'Q([12])',
} as const

export interface PeriodoDelRecibo {
  /** `2026-08`. */
  periodo: string
  /** `'1'` o `'2'`; `null` cuando el nombre no dice la quincena. */
  quincena: string | null
}

/** `Recibo 2026-08 Q2 · AGUERO CRISTIAN.pdf` → `{ periodo: '2026-08', quincena: '2' }`. `null` sin período. */
export function periodoDelNombre(nombre: string | null | undefined): PeriodoDelRecibo | null {
  if (!nombre) return null
  const anio = new RegExp(REGEX_DEL_PERIODO.anio).exec(nombre)
  if (!anio) return null
  const mes = new RegExp(REGEX_DEL_PERIODO.mes).exec(nombre)
  const q = new RegExp(REGEX_DEL_PERIODO.quincena).exec(nombre)
  return { periodo: `${anio[1]}-${mes ? mes[1] : anio[2]}`, quincena: q ? q[1] : null }
}
