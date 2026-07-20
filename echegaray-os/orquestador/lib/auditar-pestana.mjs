// AUDITORÍA DE UNA PESTAÑA — el protocolo "cómo auditar un Sheet ajeno" de la skill
// google-sheets-business-systems, ejecutado sobre la grilla real en vez de descrito.
//
// Por qué existe: el dueño va pestaña por pestaña pidiendo "analizá todo, entendé el contenido y
// mejoralo con mejores prácticas". Sin esto el modelo miraba VALORES (readSheetValues) y opinaba
// sobre una foto: no podía ver si un total era fórmula o número pegado, ni un rango abierto, ni un
// IFERROR tapando filas rotas. Todo eso ahora se mide, y el criterio profesional se aplica ARRIBA
// de hechos, no en lugar de ellos.
//
// 0 API, determinístico, testeable. NO decide qué está bien: reporta hechos verificables y los
// contrasta contra reglas duras de la skill.

const COL = (i) => {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}
export const colA1 = COL

/** ¿La celda tiene contenido (fórmula o valor)? */
const llena = (c) => !!(c && (c.formula || (c.valor !== null && c.valor !== '')))

/** Heurística: ¿la fila parece el encabezado? La primera fila con ≥2 celdas de texto no numérico. */
export function detectarEncabezado(filas, max = 10) {
  for (let i = 0; i < Math.min(filas.length, max); i++) {
    const f = filas[i] || []
    const textos = f.filter((c) => llena(c) && c.numero === null && !c?.formula)
    if (textos.length >= 2) return i
  }
  return filas.length ? 0 : -1
}

/**
 * NÚCLEO PURO. Audita una grilla ya leída.
 * @param {{titulo:string, filas:Array<Array<{formula,valor,numero,formato}>>, merges:Array}} grid
 */
export function auditarGrid(grid = {}) {
  const filas = grid.filas || []
  const merges = grid.merges || []
  const hallazgos = []
  const add = (codigo, severidad, titulo, detalle, accion) => hallazgos.push({ codigo, severidad, titulo, detalle, accion })

  // ---- Censo básico ----
  const filasConDato = filas.filter((f) => (f || []).some(llena))
  const anchos = filasConDato.map((f) => f.length)
  const ancho = anchos.length ? Math.max(...anchos) : 0
  const celdas = filasConDato.flatMap((f) => f.filter(llena))
  const conFormula = celdas.filter((c) => c.formula)
  // Una celda DERRAMADA por una fórmula matricial no es un número escrito a mano: es cálculo. Sin
  // esta distinción, una pestaña alimentada por IMPORTRANGE parecía la peor del archivo cuando en
  // realidad es la mejor construida (hallazgo del dueño, 2026-07-20).
  const derramadas = celdas.filter((c) => c.derivada)
  const numericas = celdas.filter((c) => !c.formula && !c.derivada && c.numero !== null)

  const censo = {
    filas_con_dato: filasConDato.length,
    columnas: ancho,
    celdas_con_contenido: celdas.length,
    con_formula: conFormula.length,
    celdas_derramadas: derramadas.length,
    numeros_escritos_a_mano: numericas.length,
    celdas_combinadas: merges.length,
  }

  if (!filasConDato.length) {
    return { titulo: grid.titulo ?? null, censo, hallazgos: [], vacia: true }
  }

  const encabezadoIdx = detectarEncabezado(filas)
  const encabezado = (filas[encabezadoIdx] || []).map((c) => (c?.valor || '').trim())

  // ---- 1. Encabezados duplicados o vacíos en el medio ----
  const nombres = encabezado.filter(Boolean).map((s) => s.toLowerCase())
  const dupes = [...new Set(nombres.filter((n, i) => nombres.indexOf(n) !== i))]
  if (dupes.length) {
    add('encabezados_duplicados', 'media', `Encabezados repetidos: ${dupes.join(', ')}`,
      'Dos columnas con el mismo nombre rompen cualquier fórmula por nombre (QUERY, BUSCARV por título) y hacen ambiguo el dato.',
      'Renombrar para que cada columna diga qué contiene sin repetirse.')
  }

  // ---- 2. Totales pegados a mano (LA regla de oro del proyecto) ----
  // Una fila que dice TOTAL/SUBTOTAL y tiene números SIN fórmula: el número no se recalcula solo.
  const RE_TOTAL = /^\s*(total|totales|subtotal|suma|acumulado|saldo)\b/i
  // FALSO POSITIVO REAL (2026-07-20, pestaña Compras): la columna "Total o Parcial" tiene como DATO
  // la palabra "Total" en cada fila, y esto marcaba 615 filas de datos como filas de total. Dos
  // guardas: (a) no cuenta si la palabra cae en una columna cuyo encabezado ya habla de total —
  // ahí es un valor, no una etiqueta; (b) una fila de total es RALA (resume, no detalla), así que
  // se exige que tenga bastantes menos celdas llenas que una fila de datos típica.
  const colsTotal = new Set(encabezado.map((h, i) => (/total|saldo|suma/i.test(String(h || '')) ? i : -1)).filter((i) => i >= 0))
  const llenasPorFila = filas.slice(encabezadoIdx + 1).map((f) => (f || []).filter(llena).length).filter((n) => n > 0)
  const tipico = llenasPorFila.length
    ? llenasPorFila.slice().sort((a, b) => a - b)[Math.floor(llenasPorFila.length / 2)]
    : 0
  const totalesDuros = []
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] || []
    const etiqueta = f.find((c, ci) => c?.valor && RE_TOTAL.test(c.valor) && !colsTotal.has(ci))
    if (!etiqueta) continue
    // Una fila de total resume: si está tan llena como una fila de datos, es una fila de datos.
    if (tipico >= 4 && f.filter(llena).length > tipico * 0.7) continue
    const durosEnFila = f.filter((c) => !c?.formula && c?.numero !== null)
    if (durosEnFila.length) totalesDuros.push({ fila: i + 1, cantidad: durosEnFila.length })
  }
  if (totalesDuros.length) {
    add('total_pegado_a_mano', 'alta',
      `${totalesDuros.length} fila(s) de total con números escritos a mano`,
      `Filas ${totalesDuros.map((t) => t.fila).join(', ')}. Un total que no es fórmula deja de ser cierto en cuanto alguien agrega una fila, y nadie se entera.`,
      'Reemplazar por SUMA/SUMAR.SI.CONJUNTO sobre el rango de datos.')
  }

  // ---- 3. Rangos abiertos (A:M) — costo de cálculo y fórmulas que se rompen al crecer ----
  const abiertos = conFormula.filter((c) => /[^\w$!]\$?[A-Z]{1,3}:\$?[A-Z]{1,3}\b/.test(String(c.formula)))
  if (abiertos.length) {
    add('rangos_abiertos', 'media', `${abiertos.length} fórmula(s) con rango de columna entera (A:M)`,
      'Cada rango abierto obliga a recalcular la columna completa; en un archivo vivo es la causa #1 de lentitud.',
      'Acotar a un rango cerrado con margen (ej. A5:M2000).')
  }

  // ---- 4. IFERROR que tapa el error en vez de resolverlo ----
  const iferror = conFormula.filter((c) => /\b(SI\.ERROR|IFERROR)\s*\(/i.test(String(c.formula)))
  const iferrorCiego = iferror.filter((c) => /;\s*(""|0)\s*\)\s*$/.test(String(c.formula).trim()))
  if (iferrorCiego.length) {
    add('iferror_ciego', 'alta', `${iferrorCiego.length} fórmula(s) con SI.ERROR que devuelve "" o 0`,
      'Eso no arregla el error: lo esconde. Una fila sin obra asignada o un BUSCARV sin match desaparece del total y los números "casi cierran".',
      'Dejar el error visible, o devolver una marca explícita ("SIN DATO") que se pueda filtrar y contar.')
  }

  // ---- 5. Celdas combinadas dentro de la zona de datos ----
  const mergesEnDatos = merges.filter((m) => m.fila > encabezadoIdx)
  if (mergesEnDatos.length) {
    add('celdas_combinadas', 'alta', `${mergesEnDatos.length} celda(s) combinada(s) en la zona de datos`,
      'Las combinadas rompen el ordenar, el filtrar, las tablas dinámicas y la lectura por API: el dato queda sólo en la primera celda y el resto se lee vacío.',
      'Descombinar y repetir el valor en cada fila (si se busca estética, usar formato, no combinación).')
  }

  // ---- 6. Columna numérica contaminada con texto ----
  for (let col = 0; col < ancho; col++) {
    const cuerpo = filas.slice(encabezadoIdx + 1).map((f) => (f || [])[col]).filter((c) => llena(c) && !c.derivada)
    if (cuerpo.length < 4) continue
    const nums = cuerpo.filter((c) => c.numero !== null).length
    const txt = cuerpo.length - nums
    if (nums >= cuerpo.length * 0.7 && txt > 0) {
      add('columna_mixta', 'media', `Columna ${COL(col)} (${encabezado[col] || 's/nombre'}): ${txt} celda(s) de texto entre ${nums} números`,
        'Un número guardado como texto no suma. Es la causa silenciosa de totales que no cuadran por poco.',
        'Normalizar la columna a número (revisar espacios, guiones y "-" usado como cero).')
    }
  }

  // ---- 7. Filas totalmente vacías en el medio de los datos ----
  const idxLleno = filas.map((f, i) => ((f || []).some(llena) ? i : -1)).filter((i) => i >= 0)
  const primera = idxLleno[0], ultima = idxLleno[idxLleno.length - 1]
  let huecos = 0
  for (let i = primera; i <= ultima; i++) if (!(filas[i] || []).some(llena)) huecos++
  if (huecos) {
    add('filas_vacias_intercaladas', 'baja', `${huecos} fila(s) vacía(s) en medio de los datos`,
      'Cortan los rangos automáticos y hacen que un filtro o una tabla dinámica tome sólo el primer bloque.',
      'Eliminarlas, o separar visualmente con formato en vez de con filas en blanco.')
  }

  // ---- 8. Proporción de cálculo: ¿la pestaña calcula o es una foto? ----
  if (numericas.length > 0 && conFormula.length === 0 && derramadas.length === 0) {
    add('sin_una_sola_formula', 'alta', 'La pestaña no tiene ni una fórmula: es una foto',
      `${numericas.length} números escritos a mano y cero cálculo. Nada se actualiza solo; cada cambio depende de que alguien recuerde recalcular.`,
      'Definir qué columnas son captura (se escriben) y cuáles son cálculo (fórmula), y convertir las de cálculo.')
  }

  const orden = { alta: 3, media: 2, baja: 1 }
  hallazgos.sort((a, b) => orden[b.severidad] - orden[a.severidad])
  return { titulo: grid.titulo ?? null, encabezado: encabezado.filter(Boolean), censo, hallazgos, vacia: false }
}

/** Texto para el chat. PURO. */
export function formatAuditoria(r) {
  if (!r) return 'sin datos'
  if (r.vacia) return `Pestaña "${r.titulo}": vacía.`
  const c = r.censo
  const L = [`PESTAÑA "${r.titulo}" — ${c.filas_con_dato} filas × ${c.columnas} columnas`]
  L.push(`Columnas: ${r.encabezado.join(' | ') || '(sin encabezado claro)'}`)
  L.push(`Cálculo: ${c.con_formula} celdas con fórmula${c.celdas_derramadas ? ` · ${c.celdas_derramadas} derramadas por fórmula matricial (IMPORTRANGE/ARRAYFORMULA)` : ''} vs ${c.numeros_escritos_a_mano} números escritos a mano${c.celdas_combinadas ? ` · ${c.celdas_combinadas} combinadas` : ''}`)
  const v = r.vinculos
  if (v?.obras_reconocidas?.length) L.push(`Obras reconocidas por el OS: ${v.obras_reconocidas.map((o) => o.en_el_sheet === o.obra ? o.obra : `${o.en_el_sheet}→${o.obra}`).join(', ')}`)
  if (v?.sabe_el_os?.length) L.push(`\nLO QUE EL OS YA SABE de esta área (no lo redescubras):\n  - ${v.sabe_el_os.join('\n  - ')}`)
  if (!r.hallazgos.length) { L.push('\nSin defectos estructurales detectados.'); return L.join('\n') }
  L.push('')
  for (const h of r.hallazgos) {
    L.push(`[${h.severidad.toUpperCase()}] ${h.titulo}`)
    L.push(`  ${h.detalle}`)
    L.push(`  → ${h.accion}`)
  }
  return L.join('\n')
}

/** Textos únicos del cuerpo de una columna que parece contener nombres de obra. PURA. */
export function textosDeColumnasObra(grid, encabezado = []) {
  const filas = grid.filas || []
  const idx = encabezado
    .map((h, i) => [String(h || '').toLowerCase(), i])
    .filter(([h]) => /\bobra|cliente|proyecto|centro de costo|imputa/.test(h))
    .map(([, i]) => i)
  if (!idx.length) return []
  const out = new Set()
  for (const f of filas) {
    for (const i of idx) {
      const v = (f || [])[i]
      const s = String(v?.valor || '').trim()
      if (s && s.length > 2 && v?.numero === null) out.add(s)
    }
  }
  // El encabezado mismo no es un dato.
  for (const h of encabezado) out.delete(String(h).trim())
  return [...out]
}

/**
 * VINCULA lo que se ve en la pestaña con lo que el OS ya sabe. Sin esto la auditoría es sólo
 * higiene de planilla; con esto el chat contrasta el contenido contra la realidad del negocio.
 *
 * Dos cruces, los dos determinísticos y honestos:
 *  1. NOMBRES DE OBRA que la pestaña usa y el OS no reconoce → el dato no se puede consolidar con
 *     costo real, avance ni margen. Es la falla más cara y la más invisible.
 *  2. CONOCIMIENTO ACUMULADO del área (lo que el OS ya aprendió sobre este documento) para que no
 *     vuelva a descubrir de cero lo mismo en cada pestaña.
 */
export async function vincularConOS(auditoria, grid, { area } = {}) {
  const { query } = await import('./db.mjs')
  const vinculos = { obras_desconocidas: [], obras_reconocidas: [], sabe_el_os: [] }
  try {
    const textos = textosDeColumnasObra(grid, auditoria.encabezado || [])
    if (textos.length) {
      // norm_obra() es la fuente única de normalización (vive en Postgres, no duplicada en JS).
      const { rows } = await query(
        `with t as (select unnest($1::text[]) as txt)
         select t.txt,
                coalesce(oc.nombre, oc2.nombre) as canonica
           from t
           left join public.obra_canonica oc  on public.norm_obra(oc.nombre) = public.norm_obra(t.txt)
           left join public.obra_alias   oa   on public.norm_obra(oa.alias)  = public.norm_obra(t.txt)
           left join public.obra_canonica oc2 on oc2.id = oa.obra_id`,
        [textos])
      for (const r of rows) {
        if (r.canonica) vinculos.obras_reconocidas.push({ en_el_sheet: r.txt, obra: r.canonica })
        else vinculos.obras_desconocidas.push(r.txt)
      }
      if (vinculos.obras_desconocidas.length) {
        auditoria.hallazgos.unshift({
          codigo: 'obras_no_reconocidas',
          severidad: 'alta',
          titulo: `${vinculos.obras_desconocidas.length} nombre(s) de obra que el OS no reconoce: ${vinculos.obras_desconocidas.slice(0, 6).join(', ')}`,
          detalle: 'Lo que se carga con un nombre que no matchea ninguna obra canónica no se puede cruzar con costo real, avance ni margen: queda fuera de todo control económico.',
          accion: 'Unificar el nombre con el de la obra canónica, o darlo de alta como alias si es la misma obra escrita distinto.',
        })
      }
    }
    if (area) {
      const { rows } = await query(
        `select afirmacion, veces_confirmado from public.conocimiento_empresa
          where vigente and area = $1 order by veces_confirmado desc, updated_at desc limit 6`, [area])
      vinculos.sabe_el_os = rows.map((r) => r.afirmacion)
    }
  } catch (e) {
    vinculos.error = `no pude cruzar con el OS: ${String(e?.message ?? e).slice(0, 120)}`
  }
  return vinculos
}

/** Lee la pestaña real, la audita y la vincula con el conocimiento del OS. */
export async function auditarPestana(google, fileId, pestana, rango, { area } = {}) {
  if (!google?.readSheetGrid) throw new Error('no hay cuenta de Google autorizada para leer el Sheet')
  const grid = await google.readSheetGrid(fileId, rango || `${pestana}`)
  const auditoria = auditarGrid(grid)
  if (auditoria.vacia) return auditoria
  auditoria.vinculos = await vincularConOS(auditoria, grid, { area })
  return auditoria
}
