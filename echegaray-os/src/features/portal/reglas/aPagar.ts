import type { CertificadoPortal } from '../types'

// «A PAGAR AHORA» — `29 · Portal del Cliente.dc.html`, líneas 595–629, y la cifra A PAGAR de la
// cabecera de obra (línea 66).
//
// El mockup lo dice con números: el panel suma $ 8,20 M y lista dos documentos —Certificado 2
// («vencido hace 20 días», $ 5,80 M) y Certificado final («en revisión», $ 2,40 M, vencido hace
// 40 d)—, mientras que los certificados 3 y 4, que vencen en 11 y 24 días por $ 6,20 M y $ 3,10 M,
// NO entran. O sea: **a pagar ahora = lo vencido**, y la fecha manda sobre el estado.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// · Un certificado COBRADO no se reclama nunca más. Contarlo sería pedirle al cliente plata que ya
//   pagó — el peor error posible de esta pantalla, y el más fácil de cometer si se filtra por estado
//   («vencido») en vez de por fecha de cobro.
// · Un certificado SIN fecha de vencimiento no está vencido. `null` no es «hace mucho»: es que
//   todavía no se pactó cuándo se paga, y en Cobranzas eso es lo normal hasta que se fija la Q.
// · «La más antigua hace N días» sale del vencido MÁS VIEJO, no del primero de la lista ni del de
//   monto mayor.
// · El día de hoy NO es una lectura del reloj adentro de la regla: entra por parámetro. Un test que
//   afirma el estado del mundo se pone rojo solo un martes cualquiera.

export interface CorteAPagar {
  /** Vencidos: `vence` anterior a hoy y todavía sin cobrar. Ordenados del más viejo al más nuevo. */
  vencidos: CertificadoPortal[]
  /** Sin cobrar con vencimiento de hoy en adelante. Ordenados por vencimiento. */
  proximos: CertificadoPortal[]
  /** Sin cobrar y sin fecha de vencimiento. No entran en ninguna suma. */
  sin_fecha: CertificadoPortal[]
  /** La suma de los vencidos — el número grande del panel y el A PAGAR de la cabecera. */
  total_vencido: number
  /** La suma de los próximos. */
  total_proximo: number
  /** Días desde el vencimiento más antiguo. `null` cuando no hay vencidos. */
  dias_mas_antigua: number | null
}

/** `2026-08-24T10:00:00Z` y `2026-08-24` dan lo mismo: el día, sin hora ni zona. */
export function soloFecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const dia = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null
}

/** Días enteros entre dos días (b − a). Sobre UTC a mediodía: ningún cambio de hora los corre. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)
  return Math.round(ms / 86_400_000)
}

const sinCobrar = (c: CertificadoPortal) => c.cobrado_at === null && c.estado !== 'cobrado'

/**
 * Parte los certificados en vencido / próximo / sin fecha y saca los totales del panel.
 *
 * @param hoy el día en curso en `YYYY-MM-DD`. Lo pasa quien dibuja, no lo lee esta función.
 */
export function aPagarAhora(certificados: CertificadoPortal[], hoy: string): CorteAPagar {
  const vencidos: CertificadoPortal[] = []
  const proximos: CertificadoPortal[] = []
  const sin_fecha: CertificadoPortal[] = []

  for (const c of certificados) {
    if (!sinCobrar(c)) continue
    const vence = soloFecha(c.vence)
    if (vence === null) sin_fecha.push(c)
    else if (vence < hoy) vencidos.push(c)
    else proximos.push(c)
  }

  const porVencimiento = (a: CertificadoPortal, b: CertificadoPortal) =>
    (soloFecha(a.vence) ?? '').localeCompare(soloFecha(b.vence) ?? '')
  vencidos.sort(porVencimiento)
  proximos.sort(porVencimiento)

  const suma = (xs: CertificadoPortal[]) => xs.reduce((t, c) => t + (Number(c.monto) || 0), 0)
  const masAntigua = soloFecha(vencidos[0]?.vence)

  return {
    vencidos,
    proximos,
    sin_fecha,
    total_vencido: suma(vencidos),
    total_proximo: suma(proximos),
    dias_mas_antigua: masAntigua ? diasEntre(masAntigua, hoy) : null,
  }
}
