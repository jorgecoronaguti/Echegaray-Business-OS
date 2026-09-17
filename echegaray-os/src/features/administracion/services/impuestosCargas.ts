// CARGAS SOCIALES — qué se paga de F931 y de sus planes, leído de la MISMA `impuesto_posicion` que el
// resto de la pantalla. Lo consumen dos caras: la pantalla de Impuestos y el bloque «Cargas sociales a
// pagar» de la pestaña «Impuestos y Financieros» (`orquestador/lib/impuestos-cargas-bloque.mjs`). Por
// eso vive una sola vez, acá, sin React ni Supabase.
//
// ═══ UN PLAN NO TIENE TABLA PROPIA: ES UN CONCEPTO CON FORMA ═══
//
// El sincronizador escribe cada cuota como obligación del período financiado, con el concepto
// «<plan> · cuota n/N» («Plan F931 W303094 · cuota 3/3», «Deuda previsional ene-26 · cuota 4/6»).
// Agrupar por ese nombre es la única forma de mostrar el plan sin inventar una tabla que la base no
// tiene; un concepto que no calza la forma NO se adivina: queda como fila del período, a la vista.
import { aPagarProximos, type PosicionImpuesto } from './impuestos.ts'

const CUOTA = /^(.+?) · cuota (\d+)\/(\d+)$/

export interface CuotaPlan {
  n: number
  de: number
  importe: number | null
  pagado: number
  pendiente: number | null
  vencimiento: string | null
  confianza: PosicionImpuesto['vencimiento_confianza']
  estado: PosicionImpuesto['estado']
  pagada: boolean
}

export interface PlanDePago {
  nombre: string
  periodo: string
  cuotas: CuotaPlan[]
  pagadas: number
  /** Lo que falta pagar con importe conocido. Una cuota sin importe no suma cero: cuenta en `sinImporte`. */
  saldo: number
  sinImporte: number
}

/** Saldada es `pendiente === 0` o estado pagado. `pendiente` null NO es saldada: es importe desconocido. */
const saldada = (f: PosicionImpuesto) => f.estado === 'pagado' || f.pendiente === 0

const dePlan = (f: PosicionImpuesto) => CUOTA.exec(f.concepto)

/** Las obligaciones de cargas sociales que NO son cuota de un plan: el F931 de cada período. */
export function f931PorPeriodo(filas: PosicionImpuesto[]) {
  return filas
    .filter((f) => f.impuesto === 'cargas_sociales' && !dePlan(f))
    .sort((a, b) => b.periodo.localeCompare(a.periodo) || a.concepto.localeCompare(b.concepto))
}

/**
 * LOS PLANES, CON SUS CUOTAS n/N. Primero los que tienen algo por pagar; dentro de cada plan, las
 * cuotas en orden. Un plan con todas sus cuotas pagadas se sigue mostrando: es historia de deuda.
 */
export function planesDePago(filas: PosicionImpuesto[]): PlanDePago[] {
  const planes = new Map<string, PlanDePago>()
  for (const f of filas) {
    const m = f.impuesto === 'cargas_sociales' ? dePlan(f) : null
    if (!m) continue
    const p = planes.get(m[1]) ?? { nombre: m[1], periodo: f.periodo, cuotas: [], pagadas: 0, saldo: 0, sinImporte: 0 }
    const pagada = saldada(f)
    p.cuotas.push({
      n: Number(m[2]), de: Number(m[3]), importe: f.a_pagar ?? f.determinado, pagado: f.pagado,
      pendiente: f.pendiente, vencimiento: f.vencimiento, confianza: f.vencimiento_confianza, estado: f.estado, pagada,
    })
    if (pagada) p.pagadas += 1
    else if (f.pendiente === null) p.sinImporte += 1
    else p.saldo += f.pendiente
    planes.set(m[1], p)
  }
  const lista = [...planes.values()]
  for (const p of lista) p.cuotas.sort((a, b) => a.n - b.n)
  const abierto = (p: PlanDePago) => p.saldo > 0 || p.sinImporte > 0
  return lista.sort((a, b) => Number(abierto(b)) - Number(abierto(a)) || b.periodo.localeCompare(a.periodo) || a.nombre.localeCompare(b.nombre))
}

/**
 * LO QUE FALTA PAGAR DE CARGAS SOCIALES, SIN VENTANA: todo F931 y toda cuota no saldada. Es lo que
 * publica el bloque de la pestaña. La ventana de 30 días la aplica `cargasSociales` para la pantalla.
 */
export function pendientesDeCargas(filas: PosicionImpuesto[]) {
  return filas
    .filter((f) => f.impuesto === 'cargas_sociales' && !saldada(f) && (f.pendiente === null || f.pendiente > 0))
    .sort((a, b) => (a.vencimiento ?? '9999').localeCompare(b.vencimiento ?? '9999') || a.concepto.localeCompare(b.concepto))
}

/** Todo lo que la sección de la pantalla necesita, desde las mismas filas. */
export function cargasSociales(filas: PosicionImpuesto[], hoy: string) {
  const propias = filas.filter((f) => f.impuesto === 'cargas_sociales')
  const pendientes = pendientesDeCargas(propias)
  return {
    proximos: aPagarProximos(propias, hoy),
    periodos: f931PorPeriodo(propias),
    planes: planesDePago(propias),
    pendienteTotal: pendientes.reduce((s, f) => s + (f.pendiente ?? 0), 0),
    pendienteSinImporte: pendientes.filter((f) => f.pendiente === null).length,
  }
}

/** La forma «<plan> · cuota n/N» leída: la pantalla y la pestaña rotulan la cuota con esto. */
export function cuotaDePlan(concepto: string) {
  const m = CUOTA.exec(concepto)
  return m ? { plan: m[1], n: Number(m[2]), de: Number(m[3]) } : null
}
