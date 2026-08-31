// QUÉ SE PUEDE HACER CON CADA FORMATO, Y QUÉ NO. NÚCLEO PURO, cero I/O.
//
// ═══ POR QUÉ ESTE ARCHIVO DICE QUE NO ═══
//
// La única librería de planillas de este repo es SheetJS (`xlsx`), y SheetJS community LEE un .xlsx
// bastante bien y lo REESCRIBE perdiendo casi todo lo que no sean valores: validación de datos,
// formato condicional, gráficos, tablas dinámicas, rangos con nombre, y —en un .xlsm— el
// `vbaProject.bin` donde viven las macros, salvo que se lo preserve a mano y aun así el resto se
// pierde igual.
//
// Un motor que "soporta XLSM" con esa base no soporta XLSM: lo destruye y devuelve ok. El dueño se
// entera cuando abre su archivo y los botones no hacen nada. Es exactamente la forma de falla que
// este repo ya pagó seis veces del lado de los Sheets, y la respuesta correcta es la misma: **falla
// cerrado, con nombre**. `FORMATO_NO_SOPORTADO` es una respuesta útil; un archivo roto no.
//
// La evidencia de la pérdida no es una afirmación: está medida en `formatos.test.mjs`, que arma un
// .xlsx real con una validación de datos, lo pasa por el único escritor disponible y muestra que
// vuelve sin ella.
//
// ═══ EL CAMINO QUE SÍ EXISTE ═══
//
// Para operar un .xlsx/.xlsm de verdad: convertirlo a Sheet nativo (una COPIA, nunca el original) y
// trabajar ahí. Eso es una decisión del dueño sobre su archivo, no algo que el motor haga solo, y
// por eso se devuelve como sugerencia y no se ejecuta.

/** Los MIME que importan. Los de Office son largos y se escriben mal: se nombran una vez. */
export const MIME = Object.freeze({
  SHEET_GOOGLE: 'application/vnd.google-apps.spreadsheet',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  XLSM: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  XLS: 'application/vnd.ms-excel',
  CSV: 'text/csv',
})

export const FORMATOS = Object.freeze({
  GOOGLE: 'google_sheets',
  XLSX: 'xlsx',
  XLSM: 'xlsm',
  XLS: 'xls',
  CSV: 'csv',
  DESCONOCIDO: 'desconocido',
})

/** MIME (o nombre de archivo, si no hay MIME) → formato del motor. */
export function formatoDe({ mimeType, name } = {}) {
  const m = String(mimeType || '').trim()
  if (m === MIME.SHEET_GOOGLE) return FORMATOS.GOOGLE
  if (m === MIME.XLSM) return FORMATOS.XLSM
  if (m === MIME.XLSX) return FORMATOS.XLSX
  if (m === MIME.XLS) return FORMATOS.XLS
  if (m === MIME.CSV) return FORMATOS.CSV
  // Drive a veces devuelve `application/octet-stream` para un adjunto subido crudo: ahí manda la
  // extensión, que es el único dato que queda.
  const n = String(name || '').toLowerCase()
  if (n.endsWith('.xlsm')) return FORMATOS.XLSM
  if (n.endsWith('.xlsx')) return FORMATOS.XLSX
  if (n.endsWith('.xls')) return FORMATOS.XLS
  if (n.endsWith('.csv')) return FORMATOS.CSV
  return FORMATOS.DESCONOCIDO
}

/**
 * Qué permite cada formato. `leer` es la lectura estructural (valores, fórmulas, tipos);
 * `escribir` es cambiar celdas; `estructura` es crear/copiar/borrar hojas y rangos con nombre.
 *
 * `motivo` explica el NO en términos de lo que se perdería, no en términos de la librería: al que
 * pregunta le importa su archivo, no nuestras dependencias.
 */
export function capacidades(formato) {
  switch (formato) {
    case FORMATOS.GOOGLE:
      return { formato, leer: true, escribir: true, estructura: true, motivo: null, alternativa: null }
    case FORMATOS.XLSM:
      return {
        formato,
        leer: true,
        escribir: false,
        estructura: false,
        motivo: 'escribir un .xlsm con las herramientas de este sistema borra el proyecto VBA '
          + '(las macros), la validación de datos, el formato condicional, los gráficos y las tablas '
          + 'dinámicas. El archivo quedaría abriéndose sin dar error y sin funcionar.',
        alternativa: 'convertir una COPIA a Google Sheets y operar sobre la copia',
      }
    case FORMATOS.XLSX:
      return {
        formato,
        leer: true,
        escribir: false,
        estructura: false,
        motivo: 'reescribir un .xlsx con las herramientas de este sistema conserva los valores pero '
          + 'pierde validación de datos, formato condicional, gráficos, tablas dinámicas y rangos '
          + 'con nombre. La pérdida es silenciosa: el archivo abre igual.',
        alternativa: 'convertir una COPIA a Google Sheets y operar sobre la copia',
      }
    case FORMATOS.XLS:
      return {
        formato,
        leer: true,
        escribir: false,
        estructura: false,
        motivo: 'el formato .xls (Excel 97-2003) sólo se lee; escribirlo no está implementado.',
        alternativa: 'convertir una COPIA a Google Sheets y operar sobre la copia',
      }
    case FORMATOS.CSV:
      return {
        formato,
        leer: true,
        escribir: false,
        estructura: false,
        motivo: 'un CSV no tiene fórmulas, tipos, hojas ni formato: escribirlo desde un motor que '
          + 'promete preservar esas cosas prometería algo que el formato no puede cumplir.',
        alternativa: 'importarlo a una hoja de Google Sheets',
      }
    default:
      return {
        formato: FORMATOS.DESCONOCIDO,
        leer: false,
        escribir: false,
        estructura: false,
        motivo: 'no es una planilla que este motor sepa leer.',
        alternativa: null,
      }
  }
}

/** ¿Este formato admite la operación? Devuelve `null` si sí, o el objeto de capacidades si no —
 *  así el llamador tiene el motivo listo para el error sin volver a pedirlo. */
export function permite(formato, operacion) {
  const cap = capacidades(formato)
  return cap[operacion] ? null : cap
}
