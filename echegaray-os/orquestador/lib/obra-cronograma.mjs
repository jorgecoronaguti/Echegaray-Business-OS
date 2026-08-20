// EL CRONOGRAMA DE OBRA, CON LAS FECHAS PUESTAS.
//
// ═══ POR QUÉ EXISTE, AL LADO DE `avance-fisico.mjs` Y NO ADENTRO (17/08/2026) ═══
//
// El archivo "Avances de Obra" de Drive es un tracker estilo MS-Project y trae, por actividad:
// `# · Activity · CUADRILLA · Start · End · Days · Status · % Done · COMENTARIOS`, y en algunas
// pestañas además `Dias Reales`. O sea: **el Gantt existe desde siempre**.
//
// `avance-fisico.mjs` lee ese mismo archivo y se queda con `{codigo, actividad, pct, estado}`:
// tira Start, End, Days, Días Reales y la cuadrilla. No es un defecto de aquel módulo —le pidieron
// un porcentaje y devuelve un porcentaje— pero es la razón por la que la base no tenía cronograma y
// parecía que había que inventarlo. No hay que inventarlo: hay que dejar de descartarlo.
//
// Se escribe ACÁ y no allá porque `avanceHoja()` lo consumen el chat, el briefing y el sync de
// `avance_obra`, y cambiarle la forma de retorno rompería tres cosas para arreglar una.
//
// ═══ LO QUE NO HACE, A PROPÓSITO ═══
//
// · NO deduce dependencias. El archivo no tiene columna de predecesoras, y que una actividad
//   empiece el día que termina otra no prueba que dependa de ella. Una flecha inventada es peor que
//   ninguna: convierte una coincidencia en una causa.
// · NO sella baseline. El plan aprobado se congela con un acto explícito y con fecha; un
//   sincronizador que lo sellara solo haría que el desvío contra baseline diera siempre cero.
// · NO inventa fechas. Una actividad sin Start ni End entra igual —con su nombre y su avance— pero
//   con las fechas en null, y el Gantt la muestra fuera de la línea de tiempo en vez de ubicarla en
//   un día cualquiera.

/** El tracker real de la empresa en Drive: una pestaña por obra. Lo pasó el dueño el 15/07/2026. */
export const AVANCE_FILE_ID = '1XHiqSC1wiMVrXAob8H_koN5vHr9BQLLvXn61yIW18Ug'

const norm = (s) => String(s ?? '').trim()

/**
 * "% Done" → porcentaje 0-100.
 *
 * ═══ ACÁ SE LEE SIN FORMATO, Y ESO CAMBIA LA REGLA (17/08/2026) ═══
 *
 * `avance-fisico.mjs` lee la hoja FORMATEADA y recibe la cadena `"100%"`. Este módulo lee con
 * `UNFORMATTED_VALUE` —porque necesita las fechas como serial, no como texto— y entonces la misma
 * celda llega como el número **1**. Copiar su regla tal cual publicaba una obra terminada como si
 * estuviera al 1%.
 *
 * Con lectura sin formato, una celda con formato de porcentaje SIEMPRE es una fracción: 1 = 100%,
 * 0,85 = 85%. Por eso el corte es `≤ 1` sin mirar si tiene punto decimal.
 */
export function parsePct(v) {
  const s = norm(v).replace('%', '').replace(',', '.').trim()
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n <= 1 ? n * 100 : n
}

/**
 * Serial de Sheets → ISO. Se lee con `UNFORMATTED_VALUE`, así que las fechas llegan como número.
 * Un texto tipo "22-jun-26" devuelve null: preferimos una fecha faltante a una fecha adivinada por
 * un parser de locale, que es exactamente cómo este repo se comió 699 filas una vez.
 */
export function serialAIso(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = Math.round((n - 25569) * 86400000)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const iso = d.toISOString().slice(0, 10)
  // Un cronograma de obra fuera de esta ventana es un error de lectura, no un dato.
  return iso >= '2015-01-01' && iso <= '2100-01-01' ? iso : null
}

/** Ubica la fila de encabezado y mapea las columnas por su NOMBRE, no por su posición: las
 *  pestañas son heterogéneas (Quattropani agrega columnas, LE-Comedor y Messina agregan otras). */
export function ubicarColumnas(rows = []) {
  for (let i = 0; i < Math.min(rows.length, 14); i++) {
    const r = rows[i] || []
    const find = (re) => r.findIndex((c) => re.test(norm(c)))
    // Las pestañas están en dos idiomas y ninguna es "la correcta": San Francisco y LE-* dicen
    // `Start`/`End`, Messina y Quattropani dicen `Comienzo`/`Fin`. Buscar por nombre y no por
    // posición es justamente para esto.
    const act = find(/^activity$|^actividad$|^tarea$/i)
    const ini = find(/^start$|^inicio$|^comienzo$/i)
    if (act >= 0 && ini >= 0) {
      return {
        header: i,
        num: find(/^#$|^n[°º]$|^item$/i),
        act,
        cuadrilla: find(/cuadrilla|crew/i),
        ini,
        fin: find(/^end$|^fin$/i),
        dias: find(/^days$|dias teoricos|d[ií]as te[oó]ricos/i),
        diasReales: find(/dias reales|d[ií]as reales/i),
        estado: find(/^status$|^estado$/i),
        pct: find(/%\s*done|%\s*avance|avance/i),
        comentario: find(/comentario|coment/i),
      }
    }
  }
  return null
}

/** El código `1,02` / `1.02` cuelga de `1`. Un código sin punto ni coma es de primer nivel. */
export function padreDe(codigo) {
  const c = norm(codigo).replace(',', '.')
  if (!c.includes('.')) return null
  const partes = c.split('.')
  partes.pop()
  return partes.join('.') || null
}

/** Texto → pedazo de clave: sin acentos, sin mayúsculas, sin puntuación. */
export function slug(s) {
  return norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

/**
 * LA IDENTIDAD DE UNA ACTIVIDAD SALE DE SU CONTENIDO, NUNCA DE SU POSICIÓN.
 *
 * ═══ POR QUÉ SE CAMBIÓ (17/08/2026, hallazgo del auditor de cierre) ═══
 *
 * La primera versión usaba el `#` del tracker como clave y, cuando no había, la POSICIÓN de la fila
 * (`f57`). 248 de las 325 actividades quedaron identificadas por su número de renglón. Con eso, si
 * alguien inserta una fila arriba en el tracker, el `on conflict (obra_id, codigo)` del
 * sincronizador escribe los datos de cada actividad SOBRE LA FILA VECINA —y el candado
 * `editado_a_mano` protege a la actividad equivocada—. Nadie ve un error: ve fechas cambiadas.
 *
 * Y el `#` tampoco servía: en San Francisco esa columna arranca como código (`1,01`…`1,08`) y a la
 * mitad pasa a ser una CANTIDAD (`35`, `75`, `30`, `39.583333`, tres filas distintas con `2`). Como
 * la clave era el código, la regla "código repetido: gana el primero" DESCARTABA actividades reales.
 *
 * La clave es `sección/nombre`, ambos del contenido de la fila:
 *   · sobrevive a insertar, borrar y reordenar filas — nada de eso cambia el nombre ni la sección;
 *   · dos "Encofrado" de galpones distintos son distintos, porque la sección los separa;
 *   · renombrar una actividad crea otra y deja huérfana a la vieja — el sync las REPORTA, no las
 *     borra, así que el cambio se ve en vez de propagarse solo.
 *
 * Lo único que sigue sin poder distinguirse son dos filas con el MISMO nombre en la MISMA sección:
 * ahí se numeran `~2`, `~3` por orden de aparición. Es el único resto de posición que queda.
 */
export function claveDe(seccion, nombre) {
  return `${slug(seccion) || 'raiz'}/${slug(nombre) || 'sin-nombre'}`
}

/**
 * NÚCLEO PURO: la grilla de una pestaña → actividades del cronograma.
 *
 * Una fila entra si tiene NOMBRE. El `#` decide el tipo, no la admisión: en el tracker las filas de
 * sección ("2 · Comedor-Vestuario") también tienen código y son las que dan la jerarquía.
 *
 * @param {Array<Array>} rows la pestaña cruda, leída con UNFORMATTED_VALUE
 * @returns {{actividades:Array, motivo?:string}}
 */
export function parsearCronograma(rows = []) {
  const c = ubicarColumnas(rows)
  if (!c) return { actividades: [], motivo: 'la pestaña no tiene columnas Activity + Start: no es un cronograma' }
  const actividades = []
  for (let i = c.header + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const nombre = norm(r[c.act])
    if (!nombre) continue
    // EL `#` NO ES LA CLAVE — ES UN DATO MÁS DE LA FILA. Ver `claveDe()` para por qué. Acá se
    // guarda tal cual vino, incluso repetido o vacío: sirve para mostrar y para la jerarquía cuando
    // de verdad es un código WBS (`1,01` cuelga de `1`), y no decide la identidad de nada.
    const codigo = (c.num >= 0 ? norm(r[c.num]) : '') || null

    const inicio = serialAIso(r[c.ini])
    const fin = c.fin >= 0 ? serialAIso(r[c.fin]) : null
    const pct = c.pct >= 0 ? parsePct(r[c.pct]) : null
    // `Number('')` es 0, no NaN. Con `Number.isFinite(Number(celda))` una celda VACÍA de "Days"
    // valía cero días — y cero días es la definición de hito. Así aparecieron 101 "hitos" en
    // Quattropani y 40 en San Francisco: eran renglones vacíos debajo del cronograma.
    const numOrNull = (v) => { const s = norm(v); if (!s) return null; const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : null }
    const dias = c.dias >= 0 ? numOrNull(r[c.dias]) : null
    const diasReales = c.diasReales >= 0 ? numOrNull(r[c.diasReales]) : null

    // UNA FILA ES UNA ACTIVIDAD SI EL TRACKER DICE ALGO DE ELLA. Tener texto en la columna de
    // nombre no alcanza: debajo del cronograma hay renglones de la grilla diaria y notas sueltas.
    // Se exige al menos una señal de planificación — número propio, fecha de inicio, o avance
    // cargado. Sin esto entraban 120 filas donde hay 20.
    const tieneCodigoPropio = codigo !== null
    if (!tieneCodigoPropio && !inicio && pct == null) continue

    actividades.push({
      codigo,
      codigo_padre: padreDe(codigo),
      nombre,
      // Un hito es una actividad de DURACIÓN CERO — no una tabla aparte.
      //
      // La primera versión de esto decía además `inicio === fin → hito`, y estaba mal: en estos
      // trackers una tarea de UN día tiene Comienzo y Fin el mismo día. Con esa regla, 24 de las 32
      // actividades de LE-Comedor se publicaban como hitos —o sea, como rombos sin duración— y el
      // Gantt de esa obra quedaba sin una sola barra. Duración cero es `Days = 0`, y nada más.
      tipo: dias === 0 ? 'hito' : 'tarea',
      inicio_plan: inicio,
      fin_plan: fin,
      dias_plan: dias,
      dias_real: diasReales,
      pct: pct == null ? null : Math.max(0, Math.min(100, Math.round(pct))),
      estado: c.estado >= 0 ? norm(r[c.estado]) || null : null,
      cuadrilla: c.cuadrilla >= 0 ? norm(r[c.cuadrilla]) || null : null,
      comentario: c.comentario >= 0 ? norm(r[c.comentario]) || null : null,
      fuente_fila: i + 1,
      orden: actividades.length,
    })
  }
  // Una fila que tiene hijas es un RESUMEN: su barra abarca a las suyas y su avance no se promedia
  // con el de ellas (lo pesaría doble). Y una fila sin fechas ni avance es un TÍTULO DE SECCIÓN
  // ("PILON", "TRABAJOS PREVIOS"): también es un resumen, aunque el tracker no le cuelgue hijas por
  // código. Publicarla como tarea la dibujaría como una barra de duración desconocida.
  //
  // ═══ LA REGLA PEDÍA `pct == null` Y EL ARCHIVO TRAE `0` (17/08/2026) ═══
  //
  // Con `pct == null`, Quattropani terminó con CERO filas de resumen sobre 108: "TRABAJOS PREVIOS",
  // "DEMOLICION" y "REPLANTEO" quedaron guardadas como tareas al 0%. Y como el avance de la obra
  // promedia sobre lo que no es resumen, **cada título de sección entraba al promedio como una
  // tarea sin hacer**: San Francisco se publicó al 33% cuando el resto del OS decía 85%.
  //
  // Un título de sección no tiene fechas NI duración. El porcentaje no distingue nada —una sección
  // sin cargar trae 0 igual que una tarea sin empezar—, así que se saca de la regla.
  //
  // ═══ Y UN RÓTULO NUNCA TRAE AVANCE CARGADO ═══
  //
  // Con la regla de arriba sola, "Excavación de zanjas · 100%" —una tarea hecha a la que nadie le
  // puso fechas— se guardaba como título de sección y desaparecía del cronograma. Un título del
  // tracker jamás lleva un porcentaje distinto de cero: si la fila declara avance, es trabajo.
  const conHijas = new Set(actividades.map((a) => a.codigo_padre).filter(Boolean))
  for (const a of actividades) {
    const sinPlan = !a.inicio_plan && !a.fin_plan && a.dias_plan == null
    if (conHijas.has(a.codigo) || (sinPlan && !(a.pct > 0))) a.tipo = 'resumen'
  }

  // LA CLAVE, RECIÉN ACÁ: necesita saber quién es sección y quién no. Cada actividad cuelga de la
  // última sección declarada arriba de ella; una sección cuelga de la sección anterior.
  const usadas = new Map()
  let seccion = null
  for (const a of actividades) {
    a.seccion = seccion
    const base = claveDe(seccion, a.nombre)
    const n = (usadas.get(base) ?? 0) + 1
    usadas.set(base, n)
    // Dos filas con el mismo nombre en la misma sección son indistinguibles para cualquiera:
    // se numeran por orden de aparición, y es el único resto de posición que queda en la clave.
    a.clave = n === 1 ? base : `${base}~${n}`
    if (a.tipo === 'resumen') seccion = a.nombre
  }
  return { actividades }
}
