// LA FICHA DEL PROVEEDOR — lo que se puede DERIVAR de sus comprobantes, sin guardar nada.
//
// ═══ POR QUÉ ACÁ NO HAY NINGUNA CONSULTA ═══
//
// Todo este archivo es aritmética sobre filas que ya vinieron. Separarlo de la lectura es lo que
// deja probar el caso que rompe —una nota de crédito, un comprobante sin importe, una obra sin
// imputar— sin una base de datos y sin una sesión. La consulta vive en `fichaProveedorService.ts`.
//
// ═══ LO QUE NUNCA SE GUARDA ═══
//
// Ningún total se escribe en `proveedores`. Un total al lado de sus filas es la segunda versión del
// mismo número, y el día que entra un comprobante nuevo dejan de coincidir sin avisar. Lo mismo
// vale para el rubro y para la lista de lo que provee: se DERIVAN de las operaciones, que es lo que
// `design/screens/proveedores-compras.md` exige textualmente —«Las relaciones se DERIVAN de
// operaciones, nunca se cargan a mano»—.

import { normalizarNombreProveedor } from '../../../../orquestador/lib/proveedor-identidad.mjs'

/**
 * Una fila de `costos_obra`, el espejo de la pestaña Compras.
 *
 * NO se lee de `compras` ni de `compra_resumen`: las dos tablas existen en Postgres y las dos están
 * VACÍAS (0 filas, medido el 21/08/2026). Leerlas devolvería una ficha en blanco para los 40
 * proveedores, que es la forma más silenciosa de decir que nadie le compró nada a nadie.
 */
export interface ComprobanteProveedor {
  id: string
  fecha: string | null
  comprobante: string | null
  tipo: string | null
  obra_texto: string | null
  concepto: string | null
  modalidad: string | null
  /** El total con IVA. `null` es un comprobante SIN IMPORTE cargado, no un comprobante de $ 0. */
  total: number | null
}

export interface ResumenProveedor {
  comprobantes: number
  /** Suma de los totales. `null` cuando no hay ni un comprobante: 0 diría que se le compró nada. */
  comprado: number | null
  /** Cuántos llegaron sin importe. El total de arriba NO los cuenta como cero. */
  sinImporte: number
  primera: string | null
  ultima: string | null
  /** Comprobantes cuya obra no está imputada. Es la excepción que la ficha tiene que decir. */
  sinImputar: number
}

export interface CompraPorObra {
  obra: string | null
  comprobantes: number
  total: number | null
  /** Participación sobre lo comprado, 0–100. `null` cuando no se puede calcular. */
  participacion: number | null
}

export interface ConceptoProvisto {
  concepto: string
  comprobantes: number
  ultima: string | null
}

/**
 * LO ÚLTIMO QUE PASÓ CON ESTE PROVEEDOR — el bloque de actividad de la anatomía de ficha.
 *
 * No hay tabla de eventos: la actividad de un proveedor SON sus comprobantes. Inventar un registro
 * de auditoría paralelo para llenar este bloque sería fabricar una fuente que después habría que
 * mantener sincronizada con la real.
 *
 * Dos cosas que parecen detalle y no lo son:
 *
 * · UN COMPROBANTE SIN FECHA NO ES EL MÁS VIEJO. Ordenar con `''` o con `0` lo manda al fondo y lo
 *   esconde; se ordena al final de los fechados pero se muestra, porque un papel sin fecha es
 *   trabajo pendiente, no un papel antiguo.
 * · UN COMPROBANTE SIN IMPORTE NO VALE $ 0. Llega como `null` hasta la fila, y la fila lo escribe
 *   con su nombre. Ésa es la regla del NULL, y acá es donde se pierde si se descuida.
 */
export function ultimosMovimientos(
  filas: ComprobanteProveedor[],
  limite = 6,
): ComprobanteProveedor[] {
  return [...filas]
    .sort((a, b) => {
      const fa = a.fecha?.slice(0, 10) ?? ''
      const fb = b.fecha?.slice(0, 10) ?? ''
      if (fa === fb) return 0
      if (fa === '') return 1
      if (fb === '') return -1
      return fb.localeCompare(fa)
    })
    .slice(0, limite)
}

const norm = (v: string | null | undefined): string | null =>
  (normalizarNombreProveedor(v ?? '') as string | null) ?? null

/**
 * LOS TEXTOS CRUDOS DE COMPRAS QUE PERTENECEN A ESTE PROVEEDOR.
 *
 * `proveedor_nombre_resuelto` publica el nombre NORMALIZADO; `costos_obra` guarda el texto tal cual
 * lo escribió una persona en el Sheet. PostgREST no puede llamar a `normalizar_nombre_proveedor()`
 * dentro de un filtro, así que el cruce se hace acá — con el MISMO módulo que la base declara como
 * su espejo (`normalizar_nombre_proveedor` ↔ `normalizarNombreProveedor`). Escribir una segunda
 * normalización en TypeScript daría dos respuestas posibles a «¿de quién es este comprobante?».
 */
export function textosCrudosDe(nombresNorm: string[], crudos: (string | null)[]): string[] {
  const buscados = new Set(nombresNorm.map(norm).filter((n): n is string => n !== null))
  if (buscados.size === 0) return []
  const salida = new Set<string>()
  for (const crudo of crudos) {
    if (crudo === null || crudo === undefined) continue
    const n = norm(crudo)
    if (n !== null && buscados.has(n)) salida.add(crudo)
  }
  return [...salida]
}

/** Lo que la ficha titula. Las fechas se comparan como texto ISO: `YYYY-MM-DD` ordena solo. */
export function resumirProveedor(filas: ComprobanteProveedor[]): ResumenProveedor {
  let comprado: number | null = null
  let sinImporte = 0
  let primera: string | null = null
  let ultima: string | null = null
  let sinImputar = 0
  for (const f of filas) {
    if (f.total === null || f.total === undefined) sinImporte += 1
    else comprado = (comprado ?? 0) + Number(f.total)
    const d = f.fecha?.slice(0, 10) ?? null
    if (d) {
      if (primera === null || d < primera) primera = d
      if (ultima === null || d > ultima) ultima = d
    }
    if (!f.obra_texto || f.obra_texto.trim() === '') sinImputar += 1
  }
  return { comprobantes: filas.length, comprado, sinImporte, primera, ultima, sinImputar }
}

// LA CLAVE DEL GRUPO «SIN IMPUTAR», QUE NO PUEDE CHOCAR CON UNA OBRA REAL.
//
// El espacio inicial es lo que la hace imposible de escribir en el Sheet: `obra_texto` llega
// recortado, así que ninguna obra puede llamarse así. Acá había un byte NUL literal en vez del
// espacio —seguramente de un copiar y pegar—: funcionaba igual, pero git trataba el archivo como
// BINARIO y ningún diff de este módulo se podía revisar. Un archivo que no se puede leer en una
// revisión es un archivo donde se cuela cualquier cosa.
const CLAVE_SIN_IMPUTAR = ' sin-imputar'

/**
 * DÓNDE SE GASTÓ. Ordenado por lo comprado, con lo SIN IMPUTAR incluido —no descartado—: esconderlo
 * haría que la suma de la lista no diera el total de arriba, y sin decir por qué.
 */
export function comprasPorObra(filas: ComprobanteProveedor[]): CompraPorObra[] {
  const mapa = new Map<string, CompraPorObra>()
  for (const f of filas) {
    const obra = f.obra_texto?.trim() ? f.obra_texto.trim() : null
    const clave = obra ?? CLAVE_SIN_IMPUTAR
    const acc = mapa.get(clave) ?? { obra, comprobantes: 0, total: null, participacion: null }
    acc.comprobantes += 1
    if (f.total !== null && f.total !== undefined) acc.total = (acc.total ?? 0) + Number(f.total)
    mapa.set(clave, acc)
  }
  return conParticipacion([...mapa.values()])
}

/**
 * La barra sólo se dibuja si el número es una fracción 0–100, y la fracción se mide contra la suma
 * de los POSITIVOS: con notas de crédito el neto puede dar 0 o negativo, y dividir por eso dibuja
 * barras de ancho infinito o del signo contrario.
 */
function conParticipacion(filas: CompraPorObra[]): CompraPorObra[] {
  const base = filas.reduce((a, o) => a + Math.max(o.total ?? 0, 0), 0)
  for (const o of filas) {
    o.participacion =
      base > 0 && o.total !== null ? Math.max(0, Math.min(100, (o.total / base) * 100)) : null
  }
  return filas.sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity))
}

/**
 * QUÉ NOS PROVEE — derivado de los conceptos escritos en los comprobantes, VERBATIM.
 *
 * Los conceptos reales tienen forma «Galpon 7 — ART PLOMERIA», «combustible — auto elevador». Es
 * tentador partirlos por el guión y llamar «rubro» a la izquierda, pero a veces la izquierda es un
 * lugar y a veces un rubro: sería fabricar una estructura que la fuente no tiene. Todavía no hay
 * catálogo de insumos —lo dice el handoff— así que acá se agrupa por el texto tal cual está.
 */
export function conceptosProvistos(filas: ComprobanteProveedor[], limite = 12): ConceptoProvisto[] {
  const mapa = new Map<string, ConceptoProvisto>()
  for (const f of filas) {
    const c = f.concepto?.trim()
    if (!c) continue
    const acc = mapa.get(c) ?? { concepto: c, comprobantes: 0, ultima: null }
    acc.comprobantes += 1
    const d = f.fecha?.slice(0, 10) ?? null
    if (d && (acc.ultima === null || d > acc.ultima)) acc.ultima = d
    mapa.set(c, acc)
  }
  return [...mapa.values()]
    .sort((a, b) => b.comprobantes - a.comprobantes || a.concepto.localeCompare(b.concepto, 'es'))
    .slice(0, limite)
}

// ═══ LOS PAQUETES CONTRATADOS (canónico 23) ═══
//
// La ARITMÉTICA vive acá y la lectura en `fichaProveedorService.ts`, como el resto de este par: un
// archivo con `SupabaseClient` adentro no lo puede ejercitar `node --test`, y lo que hay que probar
// —que un paquete sin precio no vale $ 0— es exactamente esto.

export interface PaqueteDelProveedor {
  id: string
  obra: string
  trabajo: string
  estado: string
  /** `null` cuando el paquete todavía no tiene precio: 0 diría que se contrató gratis. */
  precio: number | null
  documentacion_ok: boolean
}

export interface FilaSubcontrato {
  id: string
  nombre: string
  estado: string
  precio_contratado: number | string | null
  documentacion_ok: boolean
  obra_id: string
  obra_canonica: { nombre: string } | { nombre: string }[] | null
}

/** El nombre de la obra, o su slug. Nunca vacío: una fila sin obra legible sigue siendo un paquete. */
function nombreDeObra(fila: FilaSubcontrato): string {
  const rel = Array.isArray(fila.obra_canonica) ? fila.obra_canonica[0] : fila.obra_canonica
  return rel?.nombre?.trim() || fila.obra_id
}

export function armarPaquetes(filas: FilaSubcontrato[]): PaqueteDelProveedor[] {
  return filas
    .map((f) => ({
      id: f.id,
      obra: nombreDeObra(f),
      trabajo: f.nombre,
      estado: f.estado,
      precio: f.precio_contratado === null || f.precio_contratado === undefined
        ? null
        : Number(f.precio_contratado),
      documentacion_ok: f.documentacion_ok,
    }))
    .sort((a, b) => (b.precio ?? 0) - (a.precio ?? 0))
}

