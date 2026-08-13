// EL SYNC DE ARCA DICE LA VERDAD SOBRE SÍ MISMO — el núcleo puro de esa disciplina.
//
// ═══ LO QUE PASÓ EL 03/08/2026 ═══
//
// El timer semanal corrió a las 03:00. Las DOS descargas fallaron. En el journal:
//
//   [arca-sync] R falló: file:///…/afipsdk-comprobantes.mjs:70
//   [arca-sync] E falló: file:///…/afipsdk-comprobantes.mjs:70
//   [arca-sync] ingest: TOTAL ingerido: 586
//   [arca-sync] frescura IVA 2026: ventas hasta 2026-07-30 → actualizado
//   [arca-sync] listo
//   systemd: Finished echegaray-arca-sync.service.
//
// Tres mentiras encadenadas, y ninguna dio error:
//
//   1. EL MOTIVO SE PERDIÓ. `String(e.stderr).slice(0, 200)` corta los primeros 200 caracteres del
//      volcado de Node, que son la ruta del archivo, la línea de código y el cursor `^`. El renglón
//      `Error: crear automation: <status>` viene DESPUÉS. O sea: se registró el ruido y se tiró el
//      status HTTP, que era el único dato que importaba.
//   2. EL INGEST FESTEJÓ. Corría sin argumentos, así que releía TODOS los `out/*.json` de corridas
//      anteriores. "586 ingerido" no era nada nuevo: era el archivo viejo entrando otra vez.
//   3. LA FRESCURA MINTIÓ. Salía de `max(fecha_emision)` de la tabla — un dato que existe aunque la
//      descarga no haya traído nada. Registró "actualizado" con la cobertura de la semana anterior.
//
// Y el proceso terminó con código 0, así que systemd anotó "Finished". Un sync que no sincronizó
// nada, dijo que sí, y el OS quedó declarando frescura sobre datos viejos.
//
// LA REGLA QUE ESTO IMPONE: la frescura sale del RESULTADO DE LA DESCARGA, no del contenido de la
// tabla. Una tabla llena no prueba que la descarga anduvo; sólo prueba que alguna vez anduvo.

/** dd/mm/aaaa → aaaa-mm-dd. Null si no es una fecha con esa forma. PURA. */
export function aISO(ddmmaaaa) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(ddmmaaaa ?? '').trim())
  if (!m) return null
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
}

/**
 * EL MOTIVO REAL DE UNA FALLA DE PROCESO HIJO, sin el volcado que lo tapa.
 *
 * Node imprime la excepción no atrapada como ruta + línea de código + `^` + línea en blanco + el
 * `Error: …` de verdad. Truncar por el principio se queda con el envoltorio. Acá se busca el renglón
 * que empieza con `Error:`; si no está, el último renglón con contenido que no sea de la pila. PURA.
 */
export function motivoDeFalla(e) {
  // El fallback NO puede ser el error entero: un objeto sin `stderr` ni `message` se convierte en
  // "[object Object]", que es aún menos útil que decir que no hubo salida.
  const crudo = e?.stderr || e?.message || (typeof e === 'string' ? e : '')
  const texto = String(crudo ?? '').trim()
  if (!texto) return 'sin salida de error'
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const conError = lineas.find((l) => /^[A-Za-z]*Error:/.test(l))
  if (conError) return conError.slice(0, 300)
  const util = lineas.filter((l) => !/^at\s/.test(l) && !/^\^+$/.test(l) && !/^file:\/\//.test(l))
  return (util[util.length - 1] ?? lineas[lineas.length - 1]).slice(0, 300)
}

/** El status HTTP que quedó adentro del motivo, o null. PURA. */
export function statusHttp(motivo) {
  const m = /crear automation:\s*(\d{3})/.exec(String(motivo ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * ¿Esa falla GASTÓ una automatización?
 *
 * Si AfipSDK rechazó la CREACIÓN (cualquier 4xx/5xx en `crear automation`), no se creó nada y no se
 * consumió cuota. Contarla igual le restaría corridas al mes por un error ajeno — y con el plan free
 * en 10, tres errores de token dejarían al dueño sin poder bajar sus comprobantes. PURA.
 */
export function consumioCuota({ ok, motivo } = {}) {
  if (ok) return true
  return statusHttp(motivo) === null
}

/** La ruta del JSON que la descarga acaba de escribir, leída de SU PROPIA salida. PURA. */
export function archivoDescargado(stdout) {
  const m = /Detalle\s*->\s*(\S+\.json)/.exec(String(stdout ?? ''))
  return m ? m[1] : null
}

/**
 * NÚCLEO PURO: qué frescura se puede declarar, dado el resultado real de cada descarga.
 *
 * Sólo se declara cobertura de un libro cuando ESE libro se descargó Y se ingirió. Si el libro E
 * falló, la frescura de ventas no se toca: dejarla como estaba es correcto (envejece y la alerta
 * salta), pisarla con "actualizado" es la mentira del 03/08.
 *
 * @param {Array<{tipo:'R'|'E', ok:boolean, hasta:string, ingerido:boolean}>} resultados
 * @returns {{ventas:{registrar:boolean, cobertura:string|null, motivo:string},
 *            compras:{registrar:boolean, cobertura:string|null, motivo:string}}}
 */
export function decidirFrescura(resultados = []) {
  const porLibro = (tipo, etiqueta) => {
    const r = resultados.find((x) => x?.tipo === tipo)
    if (!r) return { registrar: false, cobertura: null, motivo: `no se intentó descargar ${etiqueta}` }
    if (!r.ok) return { registrar: false, cobertura: null, motivo: `la descarga de ${etiqueta} falló: no declaro cobertura nueva` }
    if (!r.ingerido) return { registrar: false, cobertura: null, motivo: `${etiqueta} se descargó pero no se ingirió: la base no tiene esos datos` }
    const cobertura = aISO(r.hasta)
    if (!cobertura) return { registrar: false, cobertura: null, motivo: `no entiendo hasta qué fecha llegó ${etiqueta} ("${r.hasta}")` }
    return { registrar: true, cobertura, motivo: `${etiqueta} descargado e ingerido hasta ${cobertura}` }
  }
  return { ventas: porLibro('E', 'ventas (libro E)'), compras: porLibro('R', 'compras (libro R)') }
}

/**
 * NÚCLEO PURO: con qué código termina el proceso.
 *
 * UNA DESCARGA ROTA ES UNA FALLA, aunque el ingest haya andado. Terminar en 0 hace que systemd anote
 * "Finished" y que nadie mire el journal nunca más — que es exactamente cómo el 03/08 pasó
 * desapercibido cuatro días. PURA.
 */
export function codigoDeSalida(resultados = [], { ingestOk = true } = {}) {
  if (!resultados.length) return 1
  if (!ingestOk) return 1
  return resultados.every((r) => r?.ok) ? 0 : 1
}

/** Una línea por descarga, para el journal. El status HTTP va SIEMPRE que exista. PURA. */
export function resumenDeCorrida(resultados = []) {
  return resultados.map((r) => {
    if (r?.ok) return `${r.tipo}: ok hasta ${r.hasta}${r.archivo ? ` → ${r.archivo}` : ''}`
    const st = statusHttp(r?.motivo)
    return `${r?.tipo}: FALLÓ${st ? ` (HTTP ${st})` : ''} — ${r?.motivo ?? 'sin motivo'}`
  })
}
