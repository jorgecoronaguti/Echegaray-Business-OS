// LO QUE EL DUEÑO LEE CUANDO MANDA UN ARCHIVO. Núcleo puro: entra el resultado, sale el texto.
//
// ═══ LA REGLA ═══
//
// Nunca se afirma nada sobre un archivo que no se pudo leer. Un archivo ilegible se contesta con lo
// único que se sabe de él —cómo se llama, cuánto pesa, qué parece ser— y con la frase que ningún
// sistema quiere escribir y todos necesitan: **no sé qué hacer con esto**. La alternativa (adivinar
// por el nombre, o resumir "lo que probablemente contiene") es fabricar datos, que es la regla de oro
// número uno del OS.
//
// ═══ Y LA SEGUNDA ═══
//
// Cuando algo SÍ produjo un efecto, el mensaje muestra el EFECTO RELEÍDO, no la intención. Un
// "importé 12 movimientos" que sale del contador del importador prueba que el importador contó hasta
// 12. Lo que prueba la importación son las filas leídas DE VUELTA desde la base.

import { FAMILIA, tamanoLegible } from './deteccion.mjs'

export const TEXTO = Object.freeze({
  SIN_ARCHIVOS: 'No vino ningún archivo con ese mensaje.',
  DEMASIADOS: (n) => `Mandá hasta ${n} archivos por vez, así los puedo revisar de a uno.`,
  NO_SE_QUE_HACER: 'No sé qué hacer con esto. Está guardado y puedo describírtelo, pero no tengo una capacidad que lo procese: decime qué querés que haga con él.',
  SIN_CLIENTE: 'No pude alcanzar Mattermost para bajar el archivo. Probá de nuevo en un minuto.',
  SIN_ESQUEMA: 'La recepción de archivos por chat todavía no está habilitada en esta instalación. Avisale a Dirección.',
})

const $ = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const s = Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '-' : ''}$${s}`
}

/** El encabezado de un archivo: cómo se llama, qué es DE VERDAD y cuánto pesa. */
export function encabezadoArchivo(l) {
  const que = l.formato ? `\`${l.formato}\`` : 'formato no reconocido'
  const disc = l.discrepancia ? ` ⚠️ ${l.discrepancia}` : ''
  return `**${l.nombre || l.fileId}** · ${que} · ${tamanoLegible(l.tamano)}${disc}`
}

/** El bloque de UN archivo, según lo que se pudo hacer con él. */
export function bloqueArchivo(l) {
  const cab = encabezadoArchivo(l)
  if (l.error) return `${cab}\n· ${l.error}`

  switch (l.familia) {
    case FAMILIA.VACIO:
      return `${cab}\n· El archivo está vacío: no tiene un solo byte adentro. Revisá la exportación y mandalo de nuevo.`
    case FAMILIA.ILEGIBLE:
      return `${cab}\n· No pude reconocer el formato: ${l.motivo}. ${TEXTO.NO_SE_QUE_HACER}`
    case FAMILIA.IMAGEN:
      return `${cab}\n· Es una imagen. ${l.nota ?? ''}`.trimEnd()
    case FAMILIA.PDF:
      return `${cab}\n${bloquePdf(l)}`
    case FAMILIA.PLANILLA:
      return `${cab}\n${bloquePlanilla(l)}`
    case FAMILIA.TEXTO:
      return `${cab}\n${bloqueTexto(l)}`
    default:
      return `${cab}\n· ${TEXTO.NO_SE_QUE_HACER}`
  }
}

function bloquePdf(l) {
  const r = l.resumen ?? {}
  if (r.escaneado) {
    return `· PDF de ${r.paginas ?? '?'} página(s) **sin texto extraíble** (está escaneado como imagen). No leí su contenido: no voy a inventarlo.`
  }
  const lineas = [`· PDF de ${r.paginas ?? '?'} página(s), ${r.caracteres ?? 0} caracteres de texto.`]
  if (r.extracto) lineas.push('', '```', r.extracto, '```')
  if (r.truncado) lineas.push('_(muestro el principio; el texto sigue)_')
  return lineas.join('\n')
}

function bloquePlanilla(l) {
  const r = l.resumen ?? {}
  if (r.error) return `· No pude leer la planilla: ${r.error}`
  const l1 = [`· Planilla${r.hoja ? ` (hoja **${r.hoja}**` : ''}${r.hojas?.length > 1 ? ` de ${r.hojas.length}` : ''}${r.hoja ? ')' : ''}: ${r.filas ?? 0} fila(s) leída(s).`]
  if (r.encabezado?.length) l1.push(`· Columnas: ${r.encabezado.slice(0, 12).map((c) => `\`${c}\``).join(' · ')}`)
  if (!r.esExtracto) {
    l1.push(`· No la reconocí como extracto bancario (${r.motivo}). ${TEXTO.NO_SE_QUE_HACER}`)
  }
  return l1.join('\n')
}

function bloqueTexto(l) {
  const r = l.resumen ?? {}
  const out = [`· Texto de ${r.caracteres ?? 0} caracteres, ${r.lineas ?? 0} línea(s).`]
  if (r.extracto) out.push('', '```', r.extracto, '```')
  if (!r.esExtracto && r.motivoExtracto) out.push(`· No lo reconocí como extracto bancario (${r.motivoExtracto}). ${TEXTO.NO_SE_QUE_HACER}`)
  return out.join('\n')
}

/**
 * LA PREVISUALIZACIÓN DEL EXTRACTO — lo que se muestra ANTES de tocar la base.
 *
 * Muestra las tres cosas que hacen falta para decidir, y ninguna se calcula dos veces: cuántos
 * movimientos se leyeron, qué líneas NO se entendieron (callarlas es cómo se pierde un movimiento
 * sin que nadie se entere) y si la CADENA DE SALDOS cierra. Un extracto cuya cadena no cierra tiene
 * un typo o le falta un movimiento, y eso hay que verlo antes de escribir, no después.
 */
export function previsualizacionBanco(p = {}) {
  const movs = p.movimientos ?? []
  const rech = p.rechazos ?? []
  const cad = p.cadena ?? { ok: true, cortes: [] }
  const out = []
  out.push(`**Extracto bancario** — leí ${movs.length} movimiento(s)${rech.length ? ` y ${rech.length} línea(s) que no entendí` : ''}.`)
  if (movs.length) {
    const desde = movs[0]?.fecha
    const hasta = movs[movs.length - 1]?.fecha
    out.push(`· Ventana: **${desde} → ${hasta}**`)
    const suma = movs.reduce((a, m) => a + Number(m.importe || 0), 0)
    out.push(`· Neto del período: **${$(suma)}**`)
    const conRef = movs.filter((m) => m.referencia != null).length
    out.push(`· ${conRef}/${movs.length} traen la referencia del banco (es la clave con la que no se duplica).`)
  }
  if (typeof p.nuevos === 'number') {
    out.push(`· **${p.nuevos} son nuevos** · ${movs.length - p.nuevos} ya estaban cargados (las ventanas del extracto se superponen).`)
  }
  out.push(cad.ok
    ? '· ✅ La cadena de saldos cierra de punta a punta.'
    : `· ⚠️ **La cadena de saldos NO cierra en ${cad.cortes.length} punto(s)** — hay un typo, falta un movimiento, o el extracto arranca en otra ventana.`)
  for (const c of (cad.cortes ?? []).slice(0, 3)) {
    out.push(`   · ${c.fecha} · ${String(c.concepto).slice(0, 40)} · esperaba ${$(c.esperado)} y dice ${$(c.declarado)}`)
  }
  if (rech.length) {
    out.push('', '**Líneas que no entendí** (no se van a cargar):')
    for (const r of rech.slice(0, 5)) out.push(`   · línea ${r.linea}: ${r.motivo} — \`${String(r.texto).slice(0, 70)}\``)
  }
  if (movs.length) {
    out.push('', '**Primeros movimientos:**', '```')
    for (const m of movs.slice(0, 6)) {
      out.push(`${m.fecha}  ${String(m.concepto).slice(0, 44).padEnd(46)}${$(m.importe).padStart(16)}`)
    }
    if (movs.length > 6) out.push(`… y ${movs.length - 6} más`)
    out.push('```')
  }
  return out.join('\n')
}

/**
 * EL AVISO DE QUE NO SE APLICA SOLO. Importar movimientos cambia el saldo de CAJA: es efecto
 * económico, y ningún efecto económico se aplica sin que una persona lo diga.
 */
export const AVISO_CONFIRMACION =
  '_Leer y previsualizar es automático. **Escribir no**: esto cambia el saldo de CAJA, así que no cargo nada hasta que lo confirmes._'

/** Los botones del extracto. Ids simples: un id con guión bajo ya rompió la ruta de acciones. */
export function botonesBanco({ id, url }) {
  return [{
    text: '',
    actions: [
      { id: 'importar', name: 'Importar a la base', integration: { url, context: { accion: 'importar', archivo: id } } },
      { id: 'descartar', name: 'Descartar', integration: { url, context: { accion: 'descartar', archivo: id } } },
    ],
  }]
}

/**
 * EL RESULTADO DE LA IMPORTACIÓN, PROBADO CONTRA EL DESTINO.
 *
 * `releidos` son las filas traídas DE VUELTA de `public.banco_movimientos` después de escribir. No es
 * el eco del importador: es el dato leído en su destino, que es lo único que prueba una escritura.
 */
export function mensajeImportado({ insertados = 0, releidos = [], cobertura = null, total = null, error = null } = {}) {
  if (error) return `⚠️ No pude completar la importación: ${error}\nNo quedó nada a medias: la base rechaza los duplicados por su índice único.`
  if (!insertados) {
    return ['**No cargué nada nuevo**: todos esos movimientos ya estaban en la base.',
      total != null ? `La cuenta sigue con ${total} movimiento(s).` : null].filter(Boolean).join('\n')
  }
  const out = [`✅ **${insertados} movimiento(s) cargados.**`, '', '**Releído de la base** (esto es lo que quedó, no lo que intenté escribir):', '```']
  for (const m of releidos.slice(0, 8)) {
    out.push(`${m.fecha}  ${String(m.concepto).slice(0, 40).padEnd(42)}${$(m.importe).padStart(16)}${m.saldo == null ? '' : `   saldo ${$(m.saldo)}`}`)
  }
  if (releidos.length > 8) out.push(`… y ${releidos.length - 8} más`)
  out.push('```')
  if (total != null) out.push(`La cuenta queda con **${total} movimiento(s)**${cobertura ? ` hasta el **${cobertura}**` : ''}.`)
  out.push('', '_Para que el Sheet lo tome: `node orquestador/scripts/banco-raw-pestana.mjs` — CAJA, Impuestos y Cheques se recalculan solos porque leen esa réplica._')
  return out.join('\n')
}
