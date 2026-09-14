// EL SUELDO DE UN OBRERO: BLANCO (EL RECIBO) + NEGRO (LAS HORAS QUE EL RECIBO NO PAGA).
//
// Dueño, 14/09/2026: *«revisar en cada caso el valor hs segun categoria q aparece en recibo de sueldo,
// esa es la parte en blanco y es una parte del sueldo. la otra es otro valor hora q se viene dando por
// sheet jornales … q cubre el otro 50 en negro del salario»*. Decisiones que tomó al preguntarle:
//
//   NEGRO = horas que faltan × $/h negro. El negro paga SÓLO las horas que no están en el recibo.
//   TOTAL = neto del recibo + negro.
//   SIN RECIBO todavía: blanco = la MITAD de las horas × $/h de su categoría, marcado «estimado».
//
// ═══ POR QUÉ EL NETO ESTIMADO USA LA PROPORCIÓN DEL ÚLTIMO RECIBO Y NO UNA ALÍCUOTA ═══
//
// Los descuentos de un recibo (jubilación, obra social, sindicato, fondo de cese) dependen de la
// persona. Una alícuota escrita acá sería un número que nadie firmó. La proporción neto/bruto de SU
// último recibo real es evidencia de esa persona; sin ninguno, el neto queda `null` y la pantalla
// dice «sin neto». Un total sin neto no se publica: sería el negro disfrazado de sueldo.
//
// ═══ SIN LA TABLA `recibo_sueldo_linea` ═══
//
// Mientras no exista, el neto del período sale de `nomina_recibo_neto` (`netoDeNomina`): es real, pero
// ese registro no trae horas ni bruto, así que las horas del blanco se estiman igual (mitad) y el
// estado es 'estimado' con `origenNeto: 'nomina'`.
//
// Puro: sin base, sin React. Lo usa `aplicarOverrides`, y se prueba en `sueldoBlancoNegro.test.ts`.

/** Una línea de `recibo_sueldo_linea`, normalizada. `null` = el recibo no lo dice. */
export interface ReciboDeSueldo {
  personaId: string | null
  cuil: string | null
  /** `Q2-08/2026`, el formato de `nomina_recibo_neto` y de `periodoDeRecibo`. */
  periodo: string
  categoria: string | null
  valorHora: number | null
  horasBlanco: number | null
  bruto: number | null
  neto: number | null
  driveFileId: string | null
}

/** Lo que el blanco necesita saber de una persona, además de sus horas y su $/h negro. */
export interface EntradaDeBlanco {
  /** El recibo de ESTE período. */
  recibo: ReciboDeSueldo | null
  /** El neto de `nomina_recibo_neto` del período, cuando no hay línea de recibo. */
  netoDeNomina: number | null
  /** El piso vigente de su categoría y convenio (`pisoVigente`, vía la exposición al convenio). */
  pisoCategoria: number | null
  /** El último recibo real ANTERIOR con bruto y neto: de él sale la proporción del neto estimado. */
  ultimoRecibo: Pick<ReciboDeSueldo, 'bruto' | 'neto'> & { periodo?: string } | null
}

export interface EntradaDeSueldo extends EntradaDeBlanco {
  /** Hs pagas de la quincena: las horas de la app con el coeficiente de extras de JORNALES. */
  horas: number | null
  /** `persona_tarifa` vigente: el $/h editable del cuadro. */
  valorHoraNegro: number | null
}

export type EstadoDelBlanco = 'recibo' | 'estimado'

export interface SueldoBlancoNegro {
  estado: EstadoDelBlanco
  horas: number | null
  horasBlanco: number | null
  valorHoraCategoria: number | null
  bruto: number | null
  neto: number | null
  /** De dónde salió el neto: el recibo, `nomina_recibo_neto`, o la proporción del último recibo. */
  origenNeto: 'recibo' | 'nomina' | 'estimado' | null
  horasNegro: number | null
  valorHoraNegro: number | null
  negro: number | null
  /** neto + negro. `null` si falta cualquiera de los dos. */
  total: number | null
  /** El recibo paga más horas que las cargadas: el negro queda en 0 y la pantalla lo marca en ámbar. */
  reciboExcedeHoras: boolean
  driveFileId: string | null
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const num = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : v)

/** El blanco: con recibo, lo que dice el recibo; sin él, la mitad de las horas por el piso. */
function blancoDe(e: EntradaDeSueldo): Pick<SueldoBlancoNegro,
  'estado' | 'horasBlanco' | 'valorHoraCategoria' | 'bruto' | 'neto' | 'origenNeto' | 'driveFileId'> {
  const r = e.recibo
  if (r && num(r.horasBlanco) != null) {
    return {
      estado: 'recibo', horasBlanco: r.horasBlanco, valorHoraCategoria: num(r.valorHora),
      bruto: num(r.bruto), neto: num(r.neto), origenNeto: num(r.neto) == null ? null : 'recibo',
      driveFileId: r.driveFileId,
    }
  }
  const horasBlanco = e.horas == null ? null : r2(e.horas / 2)
  const piso = num(e.pisoCategoria)
  const bruto = horasBlanco == null || piso == null ? null : r2(horasBlanco * piso)
  // Un recibo sin horas todavía trae un neto real: vale lo mismo que el de nómina.
  const netoReal = num(r?.neto) ?? num(e.netoDeNomina)
  if (netoReal != null) {
    return { estado: 'estimado', horasBlanco, valorHoraCategoria: piso, bruto, neto: netoReal, origenNeto: 'nomina', driveFileId: r?.driveFileId ?? null }
  }
  const u = e.ultimoRecibo
  const proporcionable = u != null && num(u.bruto) != null && u.bruto! > 0 && num(u.neto) != null
  const neto = bruto == null || !proporcionable ? null : r2((bruto * u!.neto!) / u!.bruto!)
  return { estado: 'estimado', horasBlanco, valorHoraCategoria: piso, bruto, neto, origenNeto: neto == null ? null : 'estimado', driveFileId: null }
}

export function sueldoBlancoNegro(e: EntradaDeSueldo): SueldoBlancoNegro {
  const b = blancoDe(e)
  const horas = num(e.horas)
  const faltan = horas == null || b.horasBlanco == null ? null : r2(horas - b.horasBlanco)
  const horasNegro = faltan == null ? null : Math.max(0, faltan)
  const valorHoraNegro = num(e.valorHoraNegro)
  const negro = horasNegro == null || valorHoraNegro == null ? null : r2(horasNegro * valorHoraNegro)
  return {
    ...b,
    horas,
    horasNegro,
    valorHoraNegro,
    negro,
    total: b.neto == null || negro == null ? null : r2(b.neto + negro),
    reciboExcedeHoras: faltan != null && faltan < 0,
  }
}

/** `Q2-08/2026` → `2026-08-2`: ordena períodos como texto. */
export function periodoOrdenable(periodo: string): string {
  const m = /^Q([12])-(\d{2})\/(\d{4})$/.exec(periodo.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/**
 * LA ENTRADA DEL BLANCO DE UNA PERSONA. El recibo se empareja por persona o, si la línea no la trae,
 * por CUIL (la llave del estudio). El último recibo es el más nuevo ANTERIOR al período mirado y con
 * bruto: uno sin bruto no da proporción.
 */
export function entradaDeBlanco(d: {
  personaId: string; cuil: string | null; periodo: string; recibos: readonly ReciboDeSueldo[]
  pisoCategoria: number | null; netoDeNomina: number | null
}): EntradaDeBlanco {
  const suyos = d.recibos.filter((r) => r.personaId === d.personaId || (d.cuil != null && r.cuil === d.cuil))
  const actual = periodoOrdenable(d.periodo)
  const recibo = suyos.find((r) => periodoOrdenable(r.periodo) === actual) ?? null
  let ultimo: ReciboDeSueldo | null = null
  for (const r of suyos) {
    const p = periodoOrdenable(r.periodo)
    if (p === '' || p >= actual || !(num(r.bruto) != null && r.bruto! > 0) || num(r.neto) == null) continue
    if (!ultimo || p > periodoOrdenable(ultimo.periodo)) ultimo = r
  }
  return { recibo, netoDeNomina: d.netoDeNomina, pisoCategoria: d.pisoCategoria, ultimoRecibo: ultimo }
}
