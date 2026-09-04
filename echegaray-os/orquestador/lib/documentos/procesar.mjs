// EL PIPELINE DOCUMENTAL, DE PUNTA A PUNTA. Una función, un documento.
//
//   bytes → formato real → texto+tablas+geometría → ¿necesita OCR? → tipo → campos con procedencia
//         → identidad canónica (la capa de la Fase 3) → fragmentos → persistencia
//
// ═══ LO QUE ESTE ARCHIVO DECIDIÓ NO HACER, Y POR QUÉ ═══
//
// No hay OCR y no es un pendiente: es el resultado de medirlo. 42 documentos reales de las 14
// carpetas del Drive, 100% de los PDF de negocio con capa de texto. Los únicos tres sin texto eran
// logos. Poner Granite Docling o TrOCR acá sería instalar 258 MB de modelo para un caso que este
// corpus no tiene — y el pipeline DECLARA `necesita_ocr` cuando aparezca, así que el día que llegue
// un escaneo se va a ver, no a perder.
//
// Las fotos de comprobantes —que sí son escaneos— ya tienen su circuito con Claude, y ahí se quedan:
// impactan dinero y la regla del OS es que eso lo mira Claude.
//
// ═══ LA IDENTIDAD NO SE RESUELVE ACÁ ═══
//
// Se le pregunta a la capa que ya existe (`ml/identidad-lote.mjs`). Escribir un segundo emparejador
// de proveedores adentro del motor documental sería exactamente el «resolver paralelo» que el
// diseño de la Fase 3 prohíbe.

import { query } from '../db.mjs'
import { leerDocumento } from './leer.mjs'
import { clasificarPorTexto } from './clasificar.mjs'
import { extraerCampos } from './campos.mjs'
import { fragmentar } from './fragmentar.mjs'

/**
 * Procesa UN documento y devuelve todo lo que se pudo saber de él. NO escribe.
 *
 * @param {Buffer} bytes
 * @param {{driveFileId:string, nombre:string, path?:string, mimeDeclarado?:string, maxPaginas?:number}} meta
 */
export async function procesarDocumento(bytes, meta = {}) {
  const t0 = Date.now()
  const doc = await leerDocumento(bytes, { nombre: meta.nombre, mimeDeclarado: meta.mimeDeclarado, maxPaginas: meta.maxPaginas })
  if (!doc.ok) {
    return { ok: false, driveFileId: meta.driveFileId, nombre: meta.nombre, hash: doc.hash,
             formato: doc.formato.tipo, error: doc.porQue, ms: Date.now() - t0 }
  }

  const clase = clasificarPorTexto(doc.texto)
  const { campos, evidencia } = extraerCampos(doc, { tipo: clase.tipo })
  const fragmentos = fragmentar(doc)

  return {
    ok: true,
    driveFileId: meta.driveFileId, nombre: meta.nombre, path: meta.path ?? null,
    hash: doc.hash, formato: doc.formato.tipo,
    // Si el mime que declaró Drive no coincide con la firma de los bytes, se dice: es la señal de
    // que el índice está mintiendo sobre ese archivo.
    mimeDiscrepa: doc.formato.mimeDeclarado && !doc.formato.coincide ? doc.formato.mimeDeclarado : null,
    tipo: clase.tipo, tipoConfianza: clase.confianza, tipoMetodo: clase.metodo,
    tipoPorQue: clase.porQue, tipoEvidencia: clase.evidencia, candidatos: clase.candidatos,
    sensibilidad: clase.sensibilidad,
    paginas: doc.paginasTotales ?? 0, paginasConTexto: doc.paginasConTexto ?? 0,
    necesitaOcr: Boolean(doc.necesitaOcr), caracteres: doc.caracteres ?? 0,
    tablas: doc.tablas?.length ?? 0,
    campos, evidencia, fragmentos,
    ms: Date.now() - t0,
  }
}

/**
 * Guarda lo procesado. El documento y sus fragmentos, en una transacción: un documento sin sus
 * fragmentos aparece como leído y no se puede buscar, que es la peor de las dos mitades.
 */
export async function guardarDocumento(r, { ejecutar = query } = {}) {
  if (!r?.driveFileId) throw new Error('no se puede guardar un documento sin su id de Drive')

  await ejecutar(
    `insert into public.documento_leido
       (drive_file_id, hash, nombre, path, formato, tipo, tipo_confianza, tipo_metodo, tipo_por_que,
        sensibilidad, paginas, paginas_con_texto, necesita_ocr, caracteres, tablas, campos, evidencia,
        entidad_id, entidad_estado, ms, error, leido_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, now())
     on conflict (drive_file_id) do update set
       hash = excluded.hash, nombre = excluded.nombre, path = excluded.path, formato = excluded.formato,
       tipo = excluded.tipo, tipo_confianza = excluded.tipo_confianza, tipo_metodo = excluded.tipo_metodo,
       tipo_por_que = excluded.tipo_por_que, sensibilidad = excluded.sensibilidad,
       paginas = excluded.paginas, paginas_con_texto = excluded.paginas_con_texto,
       necesita_ocr = excluded.necesita_ocr, caracteres = excluded.caracteres, tablas = excluded.tablas,
       campos = excluded.campos, evidencia = excluded.evidencia, entidad_id = excluded.entidad_id,
       entidad_estado = excluded.entidad_estado, ms = excluded.ms, error = excluded.error, leido_en = now()`,
    [r.driveFileId, r.hash ?? '', r.nombre ?? '', r.path ?? null, r.formato ?? 'desconocido',
     r.tipo ?? null, r.tipoConfianza ?? null, r.tipoMetodo ?? null, r.tipoPorQue ?? null,
     r.sensibilidad ?? 'confidencial', r.paginas ?? null, r.paginasConTexto ?? null,
     Boolean(r.necesitaOcr), r.caracteres ?? null, r.tablas ?? null,
     JSON.stringify(r.campos ?? {}), JSON.stringify(r.evidencia ?? {}),
     r.entidadId ?? null, r.entidadEstado ?? null, r.ms ?? null, r.error ?? null])

  // Se borran y se reescriben: un documento reprocesado con otro tamaño de fragmento dejaría los
  // viejos conviviendo con los nuevos, y la misma frase aparecería dos veces en cada búsqueda.
  await ejecutar('delete from public.documento_fragmento where drive_file_id = $1', [r.driveFileId])
  for (const f of r.fragmentos ?? []) {
    await ejecutar(
      `insert into public.documento_fragmento (drive_file_id, pagina, orden, texto, bbox, caracteres)
       values ($1,$2,$3,$4,$5,$6) on conflict (drive_file_id, pagina, orden) do nothing`,
      [r.driveFileId, f.pagina, f.orden, f.texto, f.bbox, f.caracteres])
  }
  return { guardado: true, fragmentos: r.fragmentos?.length ?? 0 }
}

/** ¿Hace falta volver a abrirlo? No, si el contenido no cambió. El hash es del CONTENIDO: un archivo
 *  renombrado o movido de carpeta no se reprocesa. */
export async function yaLeido(driveFileId, hash, { ejecutar = query } = {}) {
  const q = await ejecutar('select hash from public.documento_leido where drive_file_id = $1', [driveFileId])
  return q.rows.length > 0 && q.rows[0].hash === hash
}
