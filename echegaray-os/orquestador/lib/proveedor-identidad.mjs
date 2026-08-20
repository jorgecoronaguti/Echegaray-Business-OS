// IDENTIDAD DE UN PROVEEDOR — la definición única de "es el mismo proveedor".
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE Y NO ES UNA FUNCIÓN SUELTA EN LA PANTALLA ═══
//
// El mismo criterio lo necesitan tres consumidores: el formulario de alta (validar antes de
// escribir), la vista de resolución de nombres del Sheet (decidir qué está pendiente) y la
// migración de Postgres (el índice único que impide el duplicado de verdad). Escrito tres veces
// serían tres definiciones de "el mismo proveedor", que es exactamente el problema que el dueño
// pidió resolver. Vive acá, en `.mjs`, porque es el único lugar del repo que `node --test` corre y
// que además la web puede importar (mismo patrón que `obra-operacion.mjs`).
//
// La contraparte SQL de `normalizarCuit` y `normalizarNombreProveedor` está en
// `20260819T1200_administracion_personas_proveedores.sql` y tiene que decir LO MISMO. Por eso las
// dos reglas son deliberadamente triviales —sólo dígitos; mayúsculas y espacios colapsados—: toda
// sofisticación que agregue (sacar acentos, quitar "S.A.", abreviar) es una regla más que puede
// divergir entre los dos motores y volver a partir la identidad en dos.
//
// ═══ LA REGLA QUE ESTE MÓDULO HACE CUMPLIR ═══
//
// NUNCA se vincula por parecido. `clasificarNombre` sólo devuelve un proveedor cuando la
// coincidencia es EXACTA sobre el texto normalizado, o cuando una persona ya dejó escrito el
// vínculo. Todo lo demás es PENDIENTE, y lo resuelve alguien. El dueño lo pidió con esas palabras
// ("no inventar imputaciones") y el dato le da la razón: entre los nombres del Sheet hay "SUELDOS",
// "ARCA", "BANCO" y "SINDICATOS", que no son proveedores de nada. Un emparejador por similitud los
// habría colgado del proveedor de nombre más parecido y nadie lo habría notado.

/** Un CUIT es su serie de 11 dígitos. Escrito con guiones y sin guiones son el mismo CUIT, y si se
 *  guardaran de las dos formas dejarían de cruzar contra ARCA — para lo único que sirve la columna. */
export function normalizarCuit(valor) {
  if (valor == null) return ''
  return String(valor).replace(/\D/g, '')
}

/** Sólo la FORMA: once dígitos. No dice que el CUIT exista, dice que puede ser uno. */
export function cuitTieneForma(valor) {
  return /^\d{11}$/.test(normalizarCuit(valor))
}

/**
 * El dígito verificador de ARCA sobre los primeros 10 dígitos.
 *
 * Se calcula para AVISAR, nunca para rechazar: un CUIT con DV inválido casi siempre es un typo, y
 * avisarlo en el momento de cargarlo es lo que impide el proveedor duplicado por un dígito. Pero
 * bloquear el alta con esto sería peor —dejaría a Administración sin poder registrar un comprobante
 * real por una regla que el OS no puede confirmar contra ARCA en ese instante—, así que la pantalla
 * muestra la advertencia y guarda igual.
 */
export function cuitDigitoVerificadorOk(valor) {
  const c = normalizarCuit(valor)
  if (!/^\d{11}$/.test(c)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(c[i]), 0)
  const resto = suma % 11
  // Las dos excepciones de la norma: resto 0 → DV 0; resto 1 → DV 9 (y no 10, que no es un dígito).
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  return dv === Number(c[10])
}

/** Mayúsculas, sin espacios en los bordes y con los internos colapsados. Nada más: ver la nota de
 *  arriba sobre por qué no se sacan acentos ni sufijos societarios. */
export function normalizarNombreProveedor(valor) {
  if (valor == null) return ''
  return String(valor).replace(/\s+/g, ' ').trim().toUpperCase()
}

/**
 * Qué es un nombre de texto libre del Sheet: un proveedor ya conocido, o algo que tiene que
 * resolver una persona.
 *
 * @param nombre       el texto tal como vino de `Compras!E`
 * @param canonicos    proveedores existentes: [{ id, nombre }]
 * @param resoluciones lo que una persona ya decidió: [{ nombre_norm, proveedor_id, estado }]
 * @returns { estado: 'vinculado'|'no_es_proveedor'|'pendiente', proveedorId, nombreNorm, via }
 */
export function clasificarNombre(nombre, canonicos = [], resoluciones = []) {
  const nombreNorm = normalizarNombreProveedor(nombre)
  if (!nombreNorm) return { estado: 'pendiente', proveedorId: null, nombreNorm, via: 'vacio' }

  // 1. LO QUE UNA PERSONA YA DECIDIÓ MANDA SOBRE TODO LO DEMÁS. Si Administración dijo que "FEMENIA"
  //    es tal proveedor, o que "SUELDOS" no es un proveedor, esa decisión no se recalcula nunca.
  const decidido = resoluciones.find((r) => normalizarNombreProveedor(r.nombre_norm) === nombreNorm)
  if (decidido) {
    return {
      estado: decidido.estado === 'no_es_proveedor' ? 'no_es_proveedor' : 'vinculado',
      proveedorId: decidido.estado === 'no_es_proveedor' ? null : (decidido.proveedor_id ?? null),
      nombreNorm,
      via: 'resolucion_manual',
    }
  }

  // 2. COINCIDENCIA EXACTA sobre el texto normalizado. Es la única automática que se permite:
  //    "Corralón Progreso" y "CORRALON  PROGRESO" son la misma cadena una vez normalizadas, no dos
  //    cadenas parecidas. No hay umbral, no hay distancia, no hay "casi".
  const exacto = canonicos.filter((p) => normalizarNombreProveedor(p.nombre) === nombreNorm)
  // Si dos proveedores canónicos normalizan al mismo nombre, la base está ambigua y NO se elige uno:
  // eso es precisamente el duplicado que hay que resolver a mano.
  if (exacto.length === 1) return { estado: 'vinculado', proveedorId: exacto[0].id, nombreNorm, via: 'exacto' }
  if (exacto.length > 1) return { estado: 'pendiente', proveedorId: null, nombreNorm, via: 'ambiguo' }

  return { estado: 'pendiente', proveedorId: null, nombreNorm, via: 'sin_match' }
}

/** Los nombres del Sheet que nadie resolvió todavía, ordenados por cuánto pesan (más comprobantes
 *  primero): resolver el que aparece 190 veces vale más que el que aparece una. */
export function nombresPendientes(filas, canonicos = [], resoluciones = []) {
  const porNombre = new Map()
  for (const f of filas) {
    const nombreNorm = normalizarNombreProveedor(f.proveedor)
    if (!nombreNorm) continue
    const acc = porNombre.get(nombreNorm) ?? { nombreNorm, nombreOrigen: String(f.proveedor).trim(), comprobantes: 0, total: 0 }
    acc.comprobantes += 1
    acc.total += Number(f.total ?? 0)
    porNombre.set(nombreNorm, acc)
  }
  return [...porNombre.values()]
    .filter((n) => clasificarNombre(n.nombreNorm, canonicos, resoluciones).estado === 'pendiente')
    .sort((a, b) => b.comprobantes - a.comprobantes || a.nombreNorm.localeCompare(b.nombreNorm))
}
