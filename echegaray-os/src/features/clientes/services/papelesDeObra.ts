// QUÉ ES CADA PAPEL DE UNA OBRA — la clasificación, suelta y sin Supabase.
//
// Dueño (11/09/2026): «no encuentro las cotizaciones, los documentos, archivos y demás cuestiones
// que han conformado todas las obras».
//
// `public.obra_papel_drive` dice QUÉ ARCHIVO es de qué obra (y con qué evidencia). Lo que NO dice es
// qué ES cada archivo: eso se decide acá, con el nombre y la ruta, y en un solo lugar — la vista
// transporta, TypeScript clasifica.
//
// ═══ LA REGLA: MARCA OBLIGATORIA Y ESPECIFICIDAD (aprendido el 10/09/2026) ═══
//
// Cada categoría exige una MARCA EXPLÍCITA en el nombre o en la ruta, y las reglas se prueban de la
// MÁS ESPECÍFICA a la más general. Sin ese orden, «ADICIONAL - OC_32_0000200001923.pdf» sería una
// cotización porque en algún lado dice «presupuesto», y «PRESUPUESTO - OC/» arrastraría a toda la
// carpeta. Lo que no tiene marca es «otro»: no se adivina, y «otro» no es una falla — es la verdad
// sobre un archivo que no se puede clasificar por su nombre.
//
// Cada decisión devuelve el TEXTO que la sostiene (`porque`), que es lo que hace verificable la
// clasificación por alguien que no la escribió.

/** El orden es el de la lectura del dueño: primero lo que fija el precio, después lo que lo ejecuta. */
export const CATEGORIAS = [
  { clave: 'cotizacion', rotulo: 'Cotizaciones' },
  { clave: 'contrato', rotulo: 'Contrato' },
  { clave: 'oc', rotulo: 'Órdenes de compra y de pago' },
  { clave: 'certificacion', rotulo: 'Certificaciones y facturas' },
  { clave: 'plano', rotulo: 'Planos y cómputos' },
  { clave: 'hys', rotulo: 'Higiene y seguridad' },
  { clave: 'acta', rotulo: 'Actas y notas' },
  { clave: 'otro', rotulo: 'Otros' },
] as const

export type Categoria = (typeof CATEGORIAS)[number]['clave']

export interface PapelDeObra {
  drive_file_id: string
  obra_id: string
  nombre: string
  ruta: string
  mime_type: string | null
  size_bytes: number | null
  modified_time: string | null
  web_view_link: string | null
  /** Con qué evidencia se ató a esta obra (`obra_papel_drive.via`). */
  via: string | null
}

/**
 * LAS REGLAS, EN ORDEN. La primera que encuentra su marca gana.
 *
 * `donde: 'nombre'` mira SÓLO el nombre del archivo; `'ruta'` mira la ruta entera. La diferencia no
 * es un detalle: la carpeta «PRESUPUESTO - OC» de Messina tiene adentro OC y cotizaciones, y una
 * regla de cotización sobre la RUTA convertiría las OC en cotizaciones.
 */
const REGLAS: { categoria: Categoria; donde: 'nombre' | 'ruta'; patron: RegExp }[] = [
  // UNA OC SE RECONOCE POR SU NUMERACIÓN, no por la palabra: los PDF que manda el cliente se llaman
  // «OC_32_0000200002256.pdf» y «O_P_0000000004807_G00002174.pdf».
  // `[_\s-]*` y no `\s*`: el cliente los nombra «OC_32_0000200002256.pdf», con guión bajo. Con
  // `\boc\s*\d`, «ADICIONAL - OC_32_0000200001923.pdf» caía en cotización por la palabra
  // «ADICIONAL» — el test lo puso rojo.
  { categoria: 'oc', donde: 'nombre', patron: /^o_p_|\borden(es)? de (compra|pago)\b|\bo[cp][_\s-]*\d/i },
  { categoria: 'contrato', donde: 'nombre', patron: /\bcontrato\b|\bmemoria descriptiva\b/i },
  { categoria: 'hys', donde: 'nombre', patron: /\bprograma de seguridad\b|\baviso de obra\b|\bh\s*y\s*s\b|hys|higiene y seguridad|\bart\b|\bssma\b/i },
  { categoria: 'certificacion', donde: 'nombre', patron: /certificad|factura|^fc\s|remito|\brecibo\b/i },
  { categoria: 'plano', donde: 'nombre', patron: /\.(dwg|dxf|bak)$|\bplano(s)?\b|\bcomputo\b|arquitectura|estructura|\blegajo de planos\b/i },
  { categoria: 'cotizacion', donde: 'nombre', patron: /cotizac|presupuesto|\badicional\b|\boferta\b/i },
  { categoria: 'acta', donde: 'nombre', patron: /\bacta\b|\bnota\b|\bminuta\b|\binforme\b/i },
  // LA CARPETA SÓLO DECIDE CUANDO EL NOMBRE NO DIJO NADA. Es el último recurso antes de «otro».
  { categoria: 'contrato', donde: 'ruta', patron: /\/contrato de obra\//i },
  { categoria: 'hys', donde: 'ruta', patron: /\/programa de seguridad/i },
  { categoria: 'plano', donde: 'ruta', patron: /\/planos?\b/i },
  { categoria: 'certificacion', donde: 'ruta', patron: /\/(certificados?|facturas?|recibos)\b/i },
  { categoria: 'cotizacion', donde: 'ruta', patron: /\/(cotizacion|cotizaciones|presupuestos?)\b/i },
]

/** Qué es este papel y QUÉ TEXTO lo dice. `porque: null` sólo cuando es «otro». */
/**
 * LA RUTA QUE DECIDE ES LA DE ADENTRO DE LA CARPETA DEL CLIENTE.
 *
 * La raíz del data room se llama «administracion/PRESUPUESTOS - CLIENTES» y está en TODAS las rutas:
 * con la ruta entera, la regla de cotización por carpeta matcheaba «/PRESUPUESTOS» en cada archivo
 * del Drive y TODO lo que no tenía marca en el nombre quedaba clasificado como cotización. Lo
 * encontró el test, no la pantalla.
 */
const rutaDeAdentro = (ruta: string) =>
  '/' + String(ruta ?? '').split('/').slice(3).join('/')

export function categoriaDePapel(p: { nombre: string; ruta: string }): {
  categoria: Categoria; porque: string | null
} {
  for (const r of REGLAS) {
    const texto = r.donde === 'nombre' ? p.nombre ?? '' : rutaDeAdentro(p.ruta)
    const m = texto.match(r.patron)
    if (m) return { categoria: r.categoria, porque: `${r.donde}: «${m[0].trim()}»` }
  }
  return { categoria: 'otro', porque: null }
}

/**
 * LA VERSIÓN DE UNA COTIZACIÓN, cuando el nombre la dice. `null` = no la dice, y entonces ordena la
 * fecha del archivo. No se inventa un número de revisión: «Cotizacion Final.pdf» y
 * «Cotizacion APROBADA.pdf» no tienen versión, tienen una palabra.
 */
export function versionDe(nombre: string): number | null {
  const m = String(nombre ?? '').match(/\bv\.?\s?(\d+(?:\.\d+)?)\b/i) ?? String(nombre ?? '').match(/\betapa\s+(\d+(?:\.\d+)?)\b/i)
  return m ? Number(m[1]) : null
}

/** Un papel con su clasificación ya resuelta: lo que dibuja la cara Documentos. */
export type PapelClasificado = PapelDeObra & {
  categoria: Categoria
  porque: string | null
  aceptada: boolean
}

export interface GrupoDeCategoria {
  clave: Categoria
  rotulo: string
  papeles: PapelClasificado[]
}

export interface PapelesDeUnaObra {
  obra_id: string
  total: number
  /** `false` = ninguna carpeta de Drive está vinculada a esta obra. NO es «no tiene papeles». */
  tieneCarpeta: boolean
  grupos: GrupoDeCategoria[]
}

/**
 * LOS PAPELES DE CADA OBRA, AGRUPADOS Y ORDENADOS.
 *
 * Las cotizaciones van de la MÁS NUEVA a la más vieja —versión declarada primero, después la fecha
 * del archivo— y la que fija el precio del contrato queda MARCADA (`aceptada`): de seis cotizaciones
 * de la misma obra, la pregunta del dueño es cuál se firmó. Esa marca NO se deduce del nombre
 * («FINAL», «APROBADA» y «v2» conviven en la misma carpeta): la dice `obra_contrato`, que es el
 * papel que el OS ya leyó para escribir el precio.
 *
 * Una obra SIN papeles y una obra SIN CARPETA VINCULADA se devuelven distintas: la primera está sin
 * documentar y la segunda es trabajo del OS que falta hacer.
 */
export function papelesPorObra(
  papeles: PapelDeObra[],
  { obrasConCarpeta, aceptadas }: { obrasConCarpeta: Set<string>; aceptadas: Set<string> },
): Map<string, PapelesDeUnaObra> {
  const porObra = new Map<string, PapelDeObra[]>()
  for (const p of papeles ?? []) {
    porObra.set(p.obra_id, [...(porObra.get(p.obra_id) ?? []), p])
  }

  const salida = new Map<string, PapelesDeUnaObra>()
  for (const obra of new Set([...porObra.keys(), ...obrasConCarpeta])) {
    const suyos = porObra.get(obra) ?? []
    const grupos: GrupoDeCategoria[] = []
    for (const { clave, rotulo } of CATEGORIAS) {
      const enLaCategoria = suyos
        .map((p) => ({ ...p, ...categoriaDePapel(p), aceptada: aceptadas.has(p.drive_file_id) }))
        .filter((p) => p.categoria === clave)
      if (!enLaCategoria.length) continue
      enLaCategoria.sort((a, b) => {
        if (a.aceptada !== b.aceptada) return a.aceptada ? -1 : 1
        const va = versionDe(a.nombre)
        const vb = versionDe(b.nombre)
        if (va !== null && vb !== null && va !== vb) return vb - va
        return String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? ''))
      })
      grupos.push({ clave, rotulo, papeles: enLaCategoria })
    }
    salida.set(obra, {
      obra_id: obra, total: suyos.length, tieneCarpeta: obrasConCarpeta.has(obra), grupos,
    })
  }
  return salida
}

/** «1,4 MB» · «318 kB» · «—» cuando Drive no publica el tamaño (los nativos de Google no lo tienen). */
export function peso(bytes: number | null): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
