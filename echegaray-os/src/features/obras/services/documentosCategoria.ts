// LAS CATEGORÍAS DE LOS DOCUMENTOS DE UNA OBRA.
//
// VIVE EN `services/` Y NO EN EL COMPONENTE, y no es por prolijidad: `node --test` sabe borrar los
// tipos de un `.ts` pero no de un `.tsx`, así que una función pura metida adentro del componente
// sólo se puede ejercitar levantando un navegador — y entonces no se ejercita.

import type { DocumentoObra } from '../types'

// ═══ AGRUPADO POR CATEGORÍA, CON LO QUE YA HAY (20/08/2026) ═══
//
// El dueño: *"Organizar visualmente por categorías si ya existe metadata suficiente"* · *"No
// inventar clasificación automática insegura"*.
//
// La metadata que existe es `rol`, texto libre que escribe una persona al vincular. Se agrupa POR
// ESE TEXTO y nada más: no se adivina la categoría por el nombre del archivo ni por la carpeta de
// Drive. Un PDF que se llama «contrato_v3_final.pdf» puede ser el borrador que el cliente rechazó, y
// archivarlo solo bajo «Contrato» convierte una suposición en un hecho que después alguien cita.
//
// LO NO CLASIFICADO SE LLAMA «Sin clasificar» Y VA AL FINAL, no «Otros»: «Otros» suena a una
// decisión tomada —«miramos y no encaja en ninguna»— y esto es lo contrario, es lo que nadie miró
// todavía. La diferencia importa porque de ahí sale el trabajo pendiente.
//
// Las categorías sugeridas se ofrecen como `datalist` en el alta: empujan a que «Planos», «planos» y
// «PLANOS» sean uno solo, sin prohibir escribir otra cosa. Un vocabulario cerrado obligaría a elegir
// mal cuando el papel no entra en ninguna casilla.
export const CATEGORIAS_SUGERIDAS = ['Contrato', 'Planos', 'Certificaciones', 'Compras', 'Seguridad'] as const

export const SIN_CLASIFICAR = 'Sin clasificar'

// ═══ PARA QUÉ SIRVE CADA GRUPO (Design canónico 23/08, pantalla 12) ═══
//
// «Los documentos se agrupan por para qué sirven, no por tipo de archivo». La frase que acompaña al
// título del grupo no es decoración: es lo que hace que alguien que busca el papel para cobrar sepa
// dónde mirar sin abrir cuatro grupos.
//
// SÓLO PARA LAS CATEGORÍAS QUE EL OS PROPONE. `rol` es texto libre: si alguien escribe «Acta de
// medición», nadie sabe para qué sirve salvo quien la escribió, e inventarle una función sería
// afirmar algo que nadie declaró. Esas categorías van sin frase — y eso es correcto, no un hueco.
const PARA_QUE: Record<string, string> = {
  contrato: 'para cobrar',
  planos: 'para construir',
  certificaciones: 'para certificar el avance',
  compras: 'para respaldar el costo',
  seguridad: 'para poder trabajar',
}

/** La frase de la cabecera del grupo, o `null` cuando la categoría la inventó una persona. */
export function paraQueSirve(categoria: string): string | null {
  if (categoria === SIN_CLASIFICAR) return 'nadie dijo todavía para qué sirve'
  return PARA_QUE[categoria.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] ?? null
}

/**
 * Los documentos por categoría, en el orden en que se leen: las sugeridas primero y en su orden
 * —es el orden del ciclo de vida de la obra, no el alfabético—, después las que alguien inventó, y
 * al final lo que no tiene rol.
 *
 * Función pura y exportada para poder probar el agrupamiento sin navegador.
 */
export function porCategoria(documentos: DocumentoObra[]): { categoria: string; docs: DocumentoObra[] }[] {
  const grupos = new Map<string, DocumentoObra[]>()
  for (const d of documentos) {
    const bruto = (d.rol ?? '').trim()
    // Se agrupa sin distinguir mayúsculas ni acentos, pero se MUESTRA el texto tal como lo
    // escribieron la primera vez: normalizar para agrupar es ordenar; normalizar para mostrar sería
    // corregirle la letra a quien lo cargó.
    const clave = bruto ? bruto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : ''
    const rotulo = bruto || SIN_CLASIFICAR
    const yaEsta = [...grupos.keys()].find((k) => k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === clave)
    const destino = yaEsta ?? rotulo
    grupos.set(destino, [...(grupos.get(destino) ?? []), d])
  }
  const peso = (c: string) => {
    if (c === SIN_CLASIFICAR) return 9999
    const i = CATEGORIAS_SUGERIDAS.findIndex((s) => s.toLowerCase() === c.toLowerCase())
    return i >= 0 ? i : 500
  }
  return [...grupos.entries()]
    .map(([categoria, docs]) => ({ categoria, docs }))
    .sort((a, b) => peso(a.categoria) - peso(b.categoria) || a.categoria.localeCompare(b.categoria, 'es'))
}

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * LO MISMO, FILTRADO AL TECLEAR.
 *
 * Filtra por nombre, ruta y CATEGORÍA —escribir «seguridad» tiene que traer el grupo entero, que es
 * lo que alguien espera cuando busca por para qué sirve el papel— y **descarta los grupos que
 * quedan vacíos**: una cabecera con cero filas debajo se lee como «este grupo está vacío», que es
 * lo contrario de «nada de este grupo coincide con lo que escribiste».
 *
 * Vive acá y no en el componente por la misma razón que `porCategoria`: es la regla que decide qué
 * se ve, y `node --test` no sabe leer un `.tsx`.
 */
export function porCategoriaFiltrado(
  documentos: DocumentoObra[], consulta: string,
): { categoria: string; docs: DocumentoObra[] }[] {
  const q = normalizar(consulta.trim())
  const grupos = porCategoria(documentos)
  if (q === '') return grupos
  return grupos
    .map(({ categoria, docs }) => ({
      categoria,
      docs: normalizar(categoria).includes(q)
        ? docs
        : docs.filter((d) => normalizar(`${d.name ?? d.drive_file_id} ${d.path ?? ''}`).includes(q)),
    }))
    .filter((g) => g.docs.length > 0)
}
