// DOCUMENTOS · LAS CATEGORÍAS — una taxonomía DE PRESENTACIÓN, no una tabla.
//
// ═══ POR QUÉ NO ES UNA TABLA NI UNA COLUMNA ═══
//
// El canónico pide chips de categoría (planos · contractuales · seguros · personal · certificados ·
// compras · evidencia). Nada en la base dice a qué categoría pertenece un archivo: `drive_index` es
// un espejo de Drive y sus columnas son las de Drive. Crear `drive_index.categoria` obligaría a
// clasificar 3.123 archivos a mano o a que el indexador adivine, y a mantener dos verdades cuando
// alguien renombre una carpeta. Entonces la categoría se DERIVA de la ruta y del nombre, cada vez.
// Es una lectura, no un dato: si mañana el criterio cambia, cambia acá y no hay que migrar nada.
//
// ═══ LAS REGLAS, MEDIDAS CONTRA LOS 3.123 ARCHIVOS (21/08/2026) ═══
//
//   personal 1.273 · planos 111 · certificados 57 · evidencia 33 · contrato 25 · seguros 10 ·
//   compras 9 · otros 1.605   (suman 3.123)
//
// El orden de arriba ES la prioridad: la primera regla que engancha se queda con el archivo. Sin
// prioridad, «Certificado Afiliacion - ART.pdf» sería certificado Y seguro, y la misma fila
// aparecería en dos chips distintos. Va a `seguros` porque eso ES: el papel de la ART.
//
// ═══ LO QUE ESTA TAXONOMÍA NO PUEDE HACER, DICHO ACÁ ═══
//
// 1. **`otros` es el 51% del archivo (1.605).** Lo dominan `PRESUPUESTOS - CLIENTES` (1.154) y
//    `archivo-fiscal` (376): dos cosas grandes y reales que NO son ninguna de las siete categorías
//    del canónico. Meterlas a la fuerza en `contrato` o en `compras` haría un chip que miente a
//    escala. Para esas dos ya existe el filtro por carpeta raíz, que es exacto.
// 2. **`FACTURAS A` (203 archivos) NO es `compras`.** Los nombres son
//    `30716304643_001_00001_00000129.pdf`: el CUIT es el de ECSAS, o sea son facturas EMITIDAS —
//    ventas, no compras. Confundirlas sería confundir facturación con costo. Quedan en `otros`
//    hasta que exista el vínculo con comprobantes, que es donde ese dato vive de verdad.
// 3. **Es léxica, y una regla léxica tiene falsos positivos.** «02. Procedimiento de trabajo
//    seguro.pdf» cae en `seguros` por el adjetivo. Es un filtro de búsqueda, no una imputación
//    contable: el costo de un error acá es una fila de más en una lista, no un número mal.
//
// ═══ LA MISMA REGLA CORRE EN DOS LADOS, Y POR ESO VIVE ACÁ ═══
//
// La chip filtra en Postgres (son 3.123 archivos y la pantalla dibuja 200: filtrar en el navegador
// mostraría «los planos que hay entre los 200 más recientes», que es otra pregunta). La etiqueta de
// la fila la calcula esta función. Si las dos definiciones vivieran separadas, un archivo podría
// entrar por el filtro `planos` y decir `otros` en su fila. Por eso el filtro SQL se genera desde
// esta misma tabla: `patronesDe` y `patronesAnteriores` son lo que el servicio traduce.

export type ClaveCategoria =
  | 'personal' | 'seguros' | 'planos' | 'certificados' | 'contrato' | 'compras' | 'evidencia' | 'otros'

/** El campo del índice contra el que se compara. Los dos están cargados en las 3.123 filas. */
export type CampoPatron = 'path' | 'nombre_norm'

/** Un patrón `LIKE` de SQL: `%` es «cualquier cosa». Se evalúa igual en Postgres y acá. */
export interface Patron {
  campo: CampoPatron
  patron: string
}

export interface Categoria {
  clave: Exclude<ClaveCategoria, 'otros'>
  etiqueta: string
  patrones: Patron[]
}

const p = (campo: CampoPatron, patron: string): Patron => ({ campo, patron })

/**
 * LA TABLA. El orden es la prioridad y no es alfabético: va de la regla estructural (dónde vive el
 * archivo) a la léxica (cómo se llama), y dentro de las léxicas, del sustantivo más específico al
 * más general.
 */
export const CATEGORIAS: Categoria[] = [
  {
    // ESTRUCTURAL Y PRIMERA: lo que está en el legajo es del legajo, aunque se llame «contrato».
    clave: 'personal',
    etiqueta: 'Personal',
    patrones: [p('path', 'administracion/PERSONAL:%'), p('path', 'libro-sueldos/%')],
  },
  {
    // Antes que `certificados`: el «Certificado de Afiliación ART» es el papel del seguro.
    // `art` va con separadores porque suelto engancharía «cuarto», «carta» y «tarta».
    clave: 'seguros',
    etiqueta: 'Seguros',
    patrones: [
      p('nombre_norm', '%poliza%'), p('nombre_norm', '%caucion%'), p('nombre_norm', '%aseguradora%'),
      p('nombre_norm', '%seguro%'),
      p('nombre_norm', 'art'), p('nombre_norm', 'art %'), p('nombre_norm', '% art %'), p('nombre_norm', '% art'),
    ],
  },
  {
    // La extensión manda sobre el nombre: un `.dwg` es un plano aunque se llame «EEA885.dwg». Son
    // 22 archivos que el `tipo` del indexador clasifica como imagen porque su mime es `image/vnd.dwg`.
    clave: 'planos',
    etiqueta: 'Planos',
    patrones: [
      p('path', '%.dwg'), p('path', '%.dxf'),
      p('nombre_norm', '%plano%'), p('nombre_norm', '%croquis%'), p('nombre_norm', '%relevamiento%'),
    ],
  },
  { clave: 'certificados', etiqueta: 'Certificados', patrones: [p('nombre_norm', '%certificad%')] },
  {
    clave: 'contrato',
    etiqueta: 'Contractuales',
    patrones: [
      p('nombre_norm', '%contrato%'), p('nombre_norm', '%pliego%'), p('nombre_norm', '%convenio%'),
      p('nombre_norm', 'acta%'), p('nombre_norm', '% acta%'),
    ],
  },
  { clave: 'compras', etiqueta: 'Compras', patrones: [p('nombre_norm', '%remito%'), p('nombre_norm', '%factura%'), p('nombre_norm', '%orden de compra%')] },
  {
    // POR EXTENSIÓN, NO POR `tipo`. `tipo = 'imagen'` son 62 archivos e incluye los 22 `.dwg`, que
    // son planos. La foto de avance del canónico es un jpg/png sacado con un teléfono.
    clave: 'evidencia',
    etiqueta: 'Evidencia',
    patrones: [
      p('path', '%.jpg'), p('path', '%.jpeg'), p('path', '%.png'),
      p('path', '%.heic'), p('path', '%.heif'), p('path', '%.tif'), p('path', '%.tiff'),
    ],
  },
]

export const ETIQUETA_CATEGORIA: Record<ClaveCategoria, string> = {
  ...Object.fromEntries(CATEGORIAS.map((c) => [c.clave, c.etiqueta])),
  otros: 'Otros',
} as Record<ClaveCategoria, string>

/** `true` si la clave que llegó por la URL es una categoría de verdad. Nada más se acepta. */
export function esCategoria(valor: string | undefined): valor is ClaveCategoria {
  if (!valor) return false
  return valor === 'otros' || CATEGORIAS.some((c) => c.clave === valor)
}

/** Los patrones propios de una categoría. `otros` no tiene: se define por exclusión. */
export function patronesDe(clave: ClaveCategoria): Patron[] {
  return CATEGORIAS.find((c) => c.clave === clave)?.patrones ?? []
}

/**
 * Los patrones de TODAS las categorías de mayor prioridad. Es lo que hay que excluir para que el
 * filtro de Postgres devuelva exactamente lo que `categoriaDe` etiqueta — ni un archivo más.
 * Para `otros`, son los de las siete.
 */
export function patronesAnteriores(clave: ClaveCategoria): Patron[] {
  const hasta = clave === 'otros' ? CATEGORIAS.length : CATEGORIAS.findIndex((c) => c.clave === clave)
  return CATEGORIAS.slice(0, Math.max(hasta, 0)).flatMap((c) => c.patrones)
}

/**
 * LA CATEGORÍA DE UN ARCHIVO. Primera regla que engancha, y `otros` cuando ninguna lo hace.
 *
 * `nombre_norm` es lo que escribió el indexador (minúsculas, sin tildes, sin puntuación) y se usa
 * TAL CUAL en vez de normalizar el nombre de nuevo acá: si esta función normalizara distinto que la
 * base, la fila diría una categoría y el chip filtraría por otra.
 */
export function categoriaDe(archivo: { path: string | null; nombre_norm: string | null }): ClaveCategoria {
  for (const c of CATEGORIAS) {
    if (c.patrones.some((pat) => coincide(valorDe(archivo, pat.campo), pat.patron))) return c.clave
  }
  return 'otros'
}

function valorDe(archivo: { path: string | null; nombre_norm: string | null }, campo: CampoPatron): string | null {
  return campo === 'path' ? archivo.path : archivo.nombre_norm
}

/**
 * `LIKE` de SQL, en TypeScript. Insensible a mayúsculas, igual que el `ilike` que corre en Postgres.
 *
 * Un valor nulo NO coincide con nada —ni siquiera con `%`—, que es lo que hace `NULL LIKE '%'` en
 * SQL: devuelve NULL, no `true`. Dibujar una categoría a partir de una columna vacía sería
 * clasificar por ausencia.
 */
export function coincide(valor: string | null, patron: string): boolean {
  if (valor === null) return false
  const escapado = patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')
  return new RegExp(`^${escapado}$`, 'i').test(valor)
}
