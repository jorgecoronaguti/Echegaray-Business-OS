// LAS FILAS CRUDAS DE LA BASE → LOS TIPOS DE LA PANTALLA. Puro, y por eso vive solo.
//
// ═══ POR QUÉ ESTÁ SEPARADO DE `clientesService.ts` ═══
//
// Las mismas filas llegan por DOS transportes: PostgREST (una consulta por vista) y la RPC
// `pantalla_clientes()`, que las trae todas en un viaje. Si cada transporte tuviera su propia
// conversión, un `null` tratado de dos maneras haría que la misma pantalla dijera cosas distintas
// según por dónde entró el dato. Una conversión, dos transportes.
//
// Y está en su propio archivo porque `clientesService.ts` arrastra imports que `node --test` no
// resuelve: lo que se prueba tiene que poder cargarse sin montar Next.

import type {
  ClientePanel, DocumentoCliente, FuentesActividad, NotaCliente, ObraDePanel,
} from '../types'

/** PostgREST devuelve `null` y `undefined` de formas que la pantalla no debe distinguir. */
export function normalizar(row: Record<string, unknown>): ClientePanel {
  const t = (k: string) => (row[k] == null ? null : String(row[k]))
  return {
    ...(row as unknown as ClientePanel),
    direccion: t('direccion'),
    telefono: t('telefono'),
    email: t('email'),
    responsable_id: t('responsable_id'),
    responsable_nombre: t('responsable_nombre'),
    razon_social: t('razon_social'),
  }
}

/** Las filas de `cliente_panel` ya leídas → la lista que dibuja la pantalla. */
export function armarClientes(filas: unknown[]): ClientePanel[] {
  return filas.map((r) => normalizar(r as Record<string, unknown>))
}

/** Las filas de `obra_panel` ya leídas → obras por cliente, para el panel lateral. */
export function armarObrasPorCliente(filas: unknown[]): Map<string, ObraDePanel[]> {
  const por = new Map<string, ObraDePanel[]>()
  for (const fila of filas) {
    const o = fila as Record<string, unknown>
    const cliente = o.cliente_id as string | null
    if (!cliente) continue
    por.set(cliente, [
      ...(por.get(cliente) ?? []),
      {
        obra_id: o.obra_id as string,
        nombre: o.nombre as string,
        estado: o.estado as string,
        // SIN `avance_pct` (10/09/2026): el avance físico es del ERP y el CRM dejó de dibujarlo
        // («Administración es un CRM y Obra un ERP»). El armador no puede seguir poniéndolo: un
        // campo servido es cómo una columna vuelve sin que nadie la decida.
      },
    ])
  }
  return por
}
/**
 * LOS VÍNCULOS DE DRIVE Y LOS ARCHIVOS, CRUZADOS EN MEMORIA.
 *
 * Se cruza acá y NO con un `join` en SQL porque la regla tiene una decisión adentro: el índice de
 * Drive se rehace entero cada 4 horas y un archivo puede desaparecer de él sin que el vínculo deje
 * de valer, así que se publica el vínculo CON EL NOMBRE EN NULL —que es la verdad— en lugar de
 * perder la fila en un `inner join`. Esa regla está escrita una vez, y acá.
 */
export function armarDocumentosCliente(
  vinculos: unknown[], archivos: unknown[],
): DocumentoCliente[] {
  const porId = new Map(
    (archivos as Record<string, unknown>[]).map((a) => [a.drive_file_id as string, a]))
  const docs: DocumentoCliente[] = (vinculos as Record<string, unknown>[]).map((v) => {
    const a = porId.get(v.drive_file_id as string)
    return {
      drive_file_id: v.drive_file_id as string,
      rol: (v.rol as string) ?? null,
      origen: (v.origen as 'manual' | 'path_inferido') ?? 'manual',
      creado_en: (v.creado_en as string) ?? null,
      name: (a?.name as string) ?? null,
      path: (a?.path as string) ?? null,
      mime_type: (a?.mime_type as string) ?? null,
      modified_time: (a?.modified_time as string) ?? null,
    }
  })
  // Lo más reciente arriba: en una carpeta de 93 archivos, el orden alfabético no ayuda a nadie.
  docs.sort((a, b) => String(b.modified_time ?? '').localeCompare(String(a.modified_time ?? '')))
  return docs
}

/**
 * LAS NOTAS Y SUS AUTORES.
 *
 * El nombre del autor NO está en `cliente_nota`: se resuelve contra `perfiles`. Si el perfil ya no
 * está, la nota queda SIN FIRMA —que es la verdad— en lugar de perderse. Por eso las dos listas
 * viajan separadas y se cruzan acá, y no con un `join` que borraría la nota huérfana.
 */
export function armarNotasCliente(filas: unknown[], autores: unknown[]): NotaCliente[] {
  const nombres = new Map<string, string>()
  for (const p of autores as Record<string, unknown>[]) {
    nombres.set(p.id as string, p.nombre as string)
  }
  return (filas as Record<string, unknown>[]).map((n) => ({
    id: n.id as string,
    texto: n.texto as string,
    autor_id: (n.autor_id as string) ?? null,
    autor_nombre: nombres.get(n.autor_id as string) ?? null,
    creado_en: (n.creado_en as string) ?? null,
  }))
}

/**
 * LAS FUENTES DE LA LÍNEA DE TIEMPO — puro, y por eso puede alimentarse de los dos transportes.
 *
 * NINGUNA de estas listas se filtra ni se ordena acá: el orden, el descarte de lo que no tiene
 * fecha y el texto de cada evento los decide `construirLineaDeTiempo`, que está probado en
 * `orquestador/lib/cliente-actividad.test.mjs`. Esto sólo le da forma a lo leído.
 *
 * El nombre del archivo de Drive y el nombre de la obra de un certificado se resuelven contra su
 * lista: si el índice no conoce el archivo, el evento muestra el id, y si la obra no está, dice
 * «obra sin identificar». Feo y cierto — y es la razón por la que las listas viajan separadas en
 * vez de venir cruzadas por un `join` que perdería la fila huérfana.
 */
export function armarFuentesActividad(fuentes: {
  ficha: { nombre_comercial?: unknown; created_at?: unknown; updated_at?: unknown }
  obras: unknown[]
  contactos: unknown[]
  documentos: unknown[]
  archivosDeDrive: unknown[]
  notas: NotaCliente[]
  notasNoDisponibles: string | null
  certificados: unknown[]
  /** obra_id → primera fecha con horas. De `hh_obra`; sin ella, la obra sólo tiene su alta. */
  inicioConHoras?: Map<string, string | null>
}): FuentesActividad {
  const obras = fuentes.obras as Record<string, unknown>[]
  const nombrePorObra = new Map(obras.map((o) => [o.obra_id as string, o.nombre as string]))
  const nombrePorArchivo = new Map(
    (fuentes.archivosDeDrive as Record<string, unknown>[])
      .map((a) => [a.drive_file_id as string, a.name as string]))
  return {
    cliente: {
      nombre: fuentes.ficha.nombre_comercial as string,
      creado_en: (fuentes.ficha.created_at as string) ?? null,
      actualizado_en: (fuentes.ficha.updated_at as string) ?? null,
    },
    contactos: (fuentes.contactos as Record<string, unknown>[]).map((c) => ({
      id: c.id as string, nombre: c.nombre as string,
      rol: (c.rol as string) ?? null, creado_en: (c.creado_en as string) ?? null,
    })),
    obras: obras.map((o) => ({
      obra_id: o.obra_id as string, nombre: o.nombre as string,
      creada_en: (o.creada_en as string) ?? null,
      fecha_inicio_real: (o.fecha_inicio_real as string) ?? null,
      fecha_fin_real: (o.fecha_fin_real as string) ?? null,
      inicio_con_horas: fuentes.inicioConHoras?.get(o.obra_id as string) ?? null,
    })),
    documentos: (fuentes.documentos as Record<string, unknown>[]).map((d) => ({
      drive_file_id: d.drive_file_id as string,
      name: nombrePorArchivo.get(d.drive_file_id as string) ?? null,
      rol: (d.rol as string) ?? null,
      origen: (d.origen as 'manual' | 'path_inferido') ?? 'manual',
      creado_en: (d.creado_en as string) ?? null,
    })),
    notas: fuentes.notas,
    notasNoDisponibles: fuentes.notasNoDisponibles,
    certificados: (fuentes.certificados as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      numero: (c.numero as string) ?? null,
      obra_id: (c.obra_canonica_id as string) ?? null,
      obra_nombre: nombrePorObra.get(c.obra_canonica_id as string) ?? 'obra sin identificar',
      fecha_certificacion: (c.fecha_certificacion as string) ?? null,
      monto_certificado: (c.monto_certificado as number) ?? null,
      fecha_facturacion: (c.fecha_facturacion as string) ?? null,
      monto_facturado: (c.monto_facturado as number) ?? null,
      fecha_cobranza: (c.fecha_cobranza as string) ?? null,
      monto_cobrado: (c.monto_cobrado as number) ?? null,
    })),
  }
}
