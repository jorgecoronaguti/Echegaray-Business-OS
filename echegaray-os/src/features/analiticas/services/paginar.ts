// LEER UNA VISTA ENTERA A TRAVÉS DE POSTGREST, QUE CORTA EN 1.000 FILAS SIN AVISAR.
//
// `egreso_por_area` ya tenía 900 filas el 17/09/2026 (auditoría, D6). La fila 1.001 no da error: la
// respuesta llega con 1.000 y la Caja habría publicado un «salió» más chico que el real, con cara de
// dato. Se pide de a páginas hasta que una vuelva incompleta.
//
// POR QUÉ ES SEGURO SIN UN ID: quien llama ordena por TODAS las columnas que selecciona. Dos filas que
// empatan en el orden son idénticas en lo leído, así que aunque cambien de lugar entre dos páginas el
// conjunto leído es el mismo.

export type PedirPagina = (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>

/** Todas las filas, o `null` si alguna página falló: media lectura no es una lectura. */
export async function leerPaginado(pedir: PedirPagina, tamano = 1000, tope = 100): Promise<unknown[] | null> {
  const filas: unknown[] = []
  for (let pagina = 0; pagina < tope; pagina++) {
    const desde = pagina * tamano
    const { data, error } = await pedir(desde, desde + tamano - 1)
    if (error || !data) return null
    filas.push(...data)
    if (data.length < tamano) return filas
  }
  // Más de `tope` páginas: no se publica un total que no se terminó de leer.
  return null
}
