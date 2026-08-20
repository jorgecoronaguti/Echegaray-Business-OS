// CÓMO SE ORDENA EL PORTAFOLIO — la decisión, separada de las dos pantallas que la usan.
//
// El dueño (19/08/2026): *"necesito filtros dentro de cada columna de la vista de «resumen» y gantt
// porque quiero q las obras se vayan acomodando según como quiero verlas, por ejemplo quiero verlas
// por etapa de avance o por avance o por montos"*.
//
// ═══ TRES DECISIONES QUE NO SON OBVIAS ═══
//
// 1. **LA ETAPA SE ORDENA POR EL CICLO DE VIDA, NO ALFABÉTICAMENTE.** «por etapa de avance» quiere
//    decir Previo → Inicio → Desarrollo → Terminación → Cierre. Alfabéticamente daría Cierre,
//    Desarrollo, Inicio, Previo, Terminación: un orden que no significa nada y que además pondría
//    primero lo que ya terminó. El orden canónico ya existe una sola vez, en `ETAPAS`, y se reusa.
//
// 2. **LO QUE NO ESTÁ CARGADO VA ÚLTIMO, SIEMPRE — también al invertir.** Una obra sin avance no es
//    una obra con 0% y una sin contrato no vale $0: son huecos. Si el nulo participara del orden,
//    ordenar por contratado descendente pondría arriba las que nadie cargó, que es exactamente al
//    revés de lo que el que ordena está buscando. El nulo no compite: se va al fondo y espera.
//
// 3. **EL EMPATE LO DESEMPATA EL NOMBRE.** Sin criterio final, dos obras con el mismo avance se
//    intercambian entre corridas y la tabla "parpadea" al recargar. El orden tiene que ser total.
//
// Es núcleo puro: entra un arreglo y sale otro, sin base, sin React y sin fechas del reloj.

// LA RUTA CON EXTENSIÓN NO ES UN DESCUIDO. `node --test` ejercita este archivo con borrado de tipos
// y NO resuelve el import de un DIRECTORIO: `from '../types'` muere con ERR_UNSUPPORTED_DIR_IMPORT
// antes de correr una sola aserción. `ETAPAS` es un valor real y tiene que poder resolverse; es la
// misma razón por la que `usuarios/services/reglas.ts` importa `'../../auth/types/areas.ts'`.
import { ETAPAS } from '../types/index.ts'

/** Cada campo por el que se puede ordenar, con el rótulo que ya muestra la tabla. */
export const CAMPOS = {
  nombre: 'Obra',
  cliente: 'Cliente',
  etapa: 'Etapa',
  avance: 'Avance',
  plazo: 'Plazo',
  contratado: 'Contratado',
  costo: 'Costo real',
} as const

export type CampoOrden = keyof typeof CAMPOS
export type Direccion = 'asc' | 'desc'

/** La dirección con la que conviene ABRIR cada campo: la que contesta la pregunta que uno se hace. */
const PRIMERA_DIRECCION: Record<CampoOrden, Direccion> = {
  // Los textos se leen de la A a la Z; los números y el riesgo, de mayor a menor: quien ordena por
  // costo quiere ver primero la obra que más gastó, no la que menos.
  nombre: 'asc',
  cliente: 'asc',
  etapa: 'asc',
  avance: 'desc',
  plazo: 'desc',
  contratado: 'desc',
  costo: 'desc',
}

/** NÚCLEO PURO: ¿es un campo ordenable? Protege contra una query inventada a mano. */
export function esCampo(v: unknown): v is CampoOrden {
  return typeof v === 'string' && Object.hasOwn(CAMPOS, v)
}

/** NÚCLEO PURO: la dirección con la que hay que abrir un campo, o la contraria si ya está abierto. */
export function proximaDireccion(campo: CampoOrden, campoActual: CampoOrden | null, dirActual: Direccion | null): Direccion {
  if (campo !== campoActual || !dirActual) return PRIMERA_DIRECCION[campo]
  return dirActual === 'asc' ? 'desc' : 'asc'
}

/** El índice de la etapa en el ciclo de vida. Fuera de la lista (o sin declarar) = sin ubicar. */
function ordenDeEtapa(etapa: string | null | undefined): number | null {
  if (!etapa) return null
  const i = (ETAPAS as readonly string[]).indexOf(String(etapa).toLowerCase())
  return i < 0 ? null : i
}

export type FilaOrdenable = {
  obra_id: string
  nombre?: string | null
  cliente_nombre?: string | null
  cliente_texto?: string | null
  etapa?: string | null
  avance_pct?: number | null
  monto_contratado?: number | null
  costo_real?: number | null
}

/** El desvío de plazo de la obra, que vive en la otra lectura y no en la fila. */
export type DesvioDeObra = (obraId: string) => number | null

/**
 * NÚCLEO PURO: el valor por el que se compara cada fila. `null` = sin cargar, y va último.
 *
 * El cliente se compara por el nombre que la tabla MUESTRA —canónico si existe, texto de origen si
 * no—, porque ordenar por un dato invisible hace que la pantalla parezca desordenada.
 */
export function valorDe(o: FilaOrdenable, campo: CampoOrden, desvio: DesvioDeObra): string | number | null {
  switch (campo) {
    case 'nombre': return o.nombre?.trim() || null
    case 'cliente': return (o.cliente_nombre ?? o.cliente_texto)?.trim() || null
    case 'etapa': return ordenDeEtapa(o.etapa)
    case 'avance': return o.avance_pct ?? null
    case 'plazo': return desvio(o.obra_id)
    case 'contratado': return o.monto_contratado ?? null
    case 'costo': return o.costo_real ?? null
  }
}

/**
 * NÚCLEO PURO: ordena una copia. NO muta el arreglo que recibe — el que llega es el de la lectura
 * compartida y otras partes de la pantalla lo siguen usando.
 */
export function ordenar<T extends FilaOrdenable>(
  obras: readonly T[],
  campo: CampoOrden | null,
  dir: Direccion,
  desvio: DesvioDeObra = () => null,
): T[] {
  const filas = [...obras]
  if (!campo) return filas
  const signo = dir === 'asc' ? 1 : -1
  const nombre = (o: T) => (o.nombre ?? '').toLocaleLowerCase('es-AR')
  return filas.sort((a, b) => {
    const va = valorDe(a, campo, desvio)
    const vb = valorDe(b, campo, desvio)
    // EL NULO NO COMPITE: va al fondo en las dos direcciones. Ver la decisión 2 de la cabecera.
    if (va === null && vb === null) return nombre(a).localeCompare(nombre(b), 'es-AR')
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'string' && typeof vb === 'string'
      ? va.localeCompare(String(vb), 'es-AR', { sensitivity: 'base' })
      : Number(va) - Number(vb)
    if (cmp !== 0) return cmp * signo
    return nombre(a).localeCompare(nombre(b), 'es-AR')
  })
}
