// EL CERTIFICADO MÉDICO Y LOS DÍAS DE LICENCIA QUE RESPALDA — las reglas, sin base y sin React.
//
// El dueño, 16/09/2026: subió un certificado de licencia a la carpeta de Drive porque el legajo no
// tenía por dónde recibirlo. Ahora lo recibe, y además contesta la única pregunta que hace que el
// papel valga algo: ¿qué días de licencia declarada cubre?
//
// ═══ EL CERTIFICADO NO CREA LA LICENCIA ═══
//
// La licencia la declara el jefe en `asistencia_dia` (estado `licencia`, motivo del catálogo). El
// certificado la RESPALDA. Cruzarlos dice «cubre 4 días» o «no cubre ningún día declarado» —y las
// dos frases son información: la segunda es un jefe que no marcó la licencia o un rango mal
// tipeado—. Lo que este módulo NUNCA hace es escribir un día de licencia porque llegó un papel.
//
// ═══ QUÉ MOTIVOS PIDEN CERTIFICADO ═══
//
// Del catálogo (`orquestador/lib/asistencia-motivos.mjs`), sólo los que un médico firma: enfermedad
// y los dos accidentes. Vacaciones, franco y licencia especial también son «licencia» para la
// grilla y no llevan certificado médico; contarlos como cubiertos inflaría la cobertura.

/** Un día declarado en `asistencia_dia`, con lo mínimo para decidir si un certificado lo cubre. */
export interface DiaDeclarado {
  fecha: string
  estado: string
  motivo: string | null
}

/** Un certificado ya guardado: el rango que respalda y con qué nombre se lo ve. */
export interface CertificadoVigente {
  desde: string
  hasta: string
  nombre: string
}

export const MOTIVOS_CON_CERTIFICADO = ['enfermedad', 'accidente', 'accidente_in_itinere'] as const

export const pideCertificado = (motivo: string | null | undefined): boolean =>
  Boolean(motivo) && (MOTIVOS_CON_CERTIFICADO as readonly string[]).includes(String(motivo))

const ISO = /^\d{4}-\d{2}-\d{2}$/
const esISO = (s: unknown): s is string => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(s))

/**
 * ¿EL RANGO SIRVE? Las dos fechas o ninguna; `hasta` no antes de `desde`; y a lo sumo un año, que es
 * el mismo techo que el CHECK de la base (`licencia_hasta <= licencia_desde + 366`).
 */
export function revisarRango(
  desde: string | null | undefined, hasta: string | null | undefined,
): { ok: true; desde: string | null; hasta: string | null } | { ok: false; error: string } {
  const d = desde || null
  const h = hasta || null
  if (d === null && h === null) return { ok: true, desde: null, hasta: null }
  if (d === null || h === null) return { ok: false, error: 'El certificado necesita las dos fechas: desde y hasta.' }
  if (!esISO(d) || !esISO(h)) return { ok: false, error: 'Las fechas del certificado no tienen forma de fecha.' }
  if (h < d) return { ok: false, error: 'El certificado termina antes de empezar: revisá desde y hasta.' }
  // `desde + 366` en la base es un DESPLAZAMIENTO de días, no un conteo inclusive: 367 días calendario.
  if (diasEntre(d, h) - 1 > 366) return { ok: false, error: 'Un certificado de más de un año no es un certificado: revisá las fechas.' }
  return { ok: true, desde: d, hasta: h }
}

/** Días calendario de `desde` a `hasta`, ambos inclusive. `2026-09-08`→`2026-09-08` es 1. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1
}

/**
 * LOS DÍAS DECLARADOS QUE EL CERTIFICADO CUBRE: licencia por un motivo que pide certificado, dentro
 * del rango. Devuelve las fechas y no un número para que la pantalla pueda nombrarlas si hace falta.
 */
export function diasCubiertos(
  declarados: readonly DiaDeclarado[], desde: string, hasta: string,
): string[] {
  return declarados
    .filter((d) => d.estado === 'licencia' && pideCertificado(d.motivo))
    .map((d) => d.fecha.slice(0, 10))
    .filter((f) => f >= desde && f <= hasta)
    .sort()
}

/** La frase de la ficha. Cero es una frase, no un silencio: es el jefe que no marcó la licencia. */
export function fraseDeCobertura(n: number): string {
  if (n === 0) return 'no cubre ningún día de licencia declarado'
  return n === 1 ? 'cubre 1 día de licencia' : `cubre ${n} días de licencia`
}

/**
 * EL CERTIFICADO QUE RESPALDA UN DÍA, para el clip de la grilla. Con dos que se solapen gana el
 * que EMPIEZA más tarde: es el más específico para ese día y, en la práctica, el último que llegó.
 */
export function certificadoDelDia(
  certificados: readonly CertificadoVigente[], fecha: string,
): CertificadoVigente | null {
  let mejor: CertificadoVigente | null = null
  for (const c of certificados) {
    if (fecha < c.desde || fecha > c.hasta) continue
    if (!mejor || c.desde > mejor.desde) mejor = c
  }
  return mejor
}

/** `persona_id|fecha` → nombre del certificado, para las grillas que dibujan a muchas personas. */
export function certificadosPorPersonaYDia(
  certificados: readonly (CertificadoVigente & { persona_id: string })[],
  dias: readonly string[],
): Record<string, string> {
  const salida: Record<string, string> = {}
  const porPersona = new Map<string, CertificadoVigente[]>()
  for (const c of certificados) {
    const lista = porPersona.get(c.persona_id) ?? []
    lista.push(c)
    porPersona.set(c.persona_id, lista)
  }
  for (const [persona, lista] of porPersona) {
    for (const fecha of dias) {
      const c = certificadoDelDia(lista, fecha)
      if (c) salida[`${persona}|${fecha}`] = c.nombre
    }
  }
  return salida
}
