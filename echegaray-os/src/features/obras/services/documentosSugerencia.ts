// LA SUGERENCIA DE CATEGORÍA — una regla ESCRITA, no un modelo que adivina.
//
// ═══ POR QUÉ ES UNA SUGERENCIA Y NUNCA UNA ESCRITURA ═══
//
// El dueño (20/08): *"No inventar clasificación automática insegura"*. Y sigue valiendo: un PDF
// llamado «contrato_v3_final.pdf» puede ser el borrador que el cliente rechazó. Lo que cambió es
// otra cosa — con 32 papeles en «Sin clasificar», pedirle a alguien que los clasifique de cero es
// pedirle 32 decisiones desde cero, y por eso no las toma nadie.
//
// La salida de este archivo es un CANDIDATO que la pantalla dibuja como «sugerido: X — confirmar».
// Nadie escribe `obra_documento.rol` acá: eso lo hace `clasificarDocumento`, y sólo después de un
// clic de una persona. La distinción es la misma de siempre: esto produce una INFERENCIA, y una
// inferencia no se guarda como si fuera un HECHO.
//
// ═══ POR QUÉ POR TOKENS Y NO POR `includes` ═══
//
// «art» adentro de «Parte diario.pdf» y de «cuarto piso.jpg» daría Seguridad e higiene en los dos
// casos. Una regla que se equivoca así una vez de cada cinco enseña a apretar «confirmar» sin
// leer — y ahí la sugerencia deja de ser una ayuda y pasa a ser una fuente de datos falsos. Se
// parte el nombre en palabras y se compara la palabra entera.
//
// ═══ DOS REGLAS QUE COINCIDEN NO SE DESEMPATAN ═══
//
// «plano de la nómina.jpg» dispara Planos, Seguridad y Evidencia. Elegir una por orden de
// precedencia sería inventar un criterio que nadie declaró y que además queda escondido en el
// orden de un array. Cuando coincide más de una categoría la sugerencia es `null`: el archivo se
// queda en «Sin clasificar», que es exactamente lo que es — algo que hay que mirar.

import { CATEGORIAS, type Categoria } from './documentosCategoria.ts'

/** Las palabras que disparan cada categoría. Palabra ENTERA del nombre, sin acentos y en minúscula. */
const PALABRAS: Record<Categoria, readonly string[]> = {
  [CATEGORIAS.PLANOS]: ['plano', 'planos', 'planimetria'],
  [CATEGORIAS.CONTRATO]: ['contrato', 'contratos', 'presupuesto', 'presupuestos', 'orden', 'ordenes'],
  [CATEGORIAS.SEGURIDAD]: ['art', 'seguro', 'seguros', 'nomina', 'nominas', 'f931'],
  [CATEGORIAS.EVIDENCIA]: ['foto', 'fotos'],
}

/** Extensiones que por sí solas dicen de qué es el archivo. Un `.dwg` no es «un archivo»: es un plano. */
const EXTENSIONES: Record<Categoria, readonly string[]> = {
  [CATEGORIAS.PLANOS]: ['dwg', 'dxf', 'rvt', 'ifc'],
  [CATEGORIAS.CONTRATO]: [],
  [CATEGORIAS.SEGURIDAD]: [],
  [CATEGORIAS.EVIDENCIA]: ['jpg', 'jpeg', 'png', 'heic', 'webp'],
}

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Las palabras del nombre. Todo lo que no es letra o número separa: `plano_estructura-rev3.pdf`. */
function palabrasDe(nombre: string): Set<string> {
  return new Set(sinAcentos(nombre).split(/[^a-z0-9]+/).filter(Boolean))
}

function extensionDe(nombre: string): string | null {
  const punto = nombre.lastIndexOf('.')
  // Un punto en la posición 0 es un archivo oculto, no una extensión.
  if (punto <= 0 || punto === nombre.length - 1) return null
  return sinAcentos(nombre.slice(punto + 1))
}

/**
 * LA CATEGORÍA QUE EL NOMBRE SUGIERE, o `null` cuando no hay una sola respuesta.
 *
 * Devuelve `null` en tres casos distintos que la pantalla trata igual —no sugiere nada— pero que
 * significan cosas diferentes: no coincidió ninguna regla, coincidió más de una, o no hay nombre.
 * Ninguno de los tres justifica escribir una categoría.
 *
 * Función pura: no lee la base, no llama a nadie, no escribe. Es la única forma de que la regla se
 * pueda probar sin navegador y de que revertirla ponga un test en rojo.
 */
export function sugerirCategoria(
  nombre: string | null, mimeType?: string | null,
): Categoria | null {
  const limpio = (nombre ?? '').trim()
  if (limpio === '') return null

  const palabras = palabrasDe(limpio)
  const ext = extensionDe(limpio)
  // El mime manda sobre la extensión cuando existe: lo publica Drive, la extensión la escribió una
  // persona. Un `image/jpeg` es una foto aunque el archivo se llame `IMG_0421` sin extensión.
  const esImagen = (mimeType ?? '').toLowerCase().startsWith('image/')

  const candidatas = (Object.keys(PALABRAS) as Categoria[]).filter((c) => {
    if (PALABRAS[c].some((p) => palabras.has(p))) return true
    if (ext !== null && EXTENSIONES[c].includes(ext)) return true
    return c === CATEGORIAS.EVIDENCIA && esImagen
  })

  return candidatas.length === 1 ? candidatas[0] : null
}

/** El texto que se muestra al lado del papel. Vive acá para que la pantalla no lo arme a mano. */
export function textoSugerencia(categoria: Categoria): string {
  return `sugerido: ${categoria}`
}
