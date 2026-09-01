// LA CAPACIDAD DE DRIVE DE XSAS — llamable como función, sin un modelo en el medio.
//
// EL PROBLEMA QUE RESUELVE. Hasta ahora, hacer una operación de Drive desde la superficie
// conversacional del OS pasaba obligatoriamente por el lazo de tool-use de un modelo:
// `driveReadTools(google)` / `driveWriteTools(google)` devuelven `{schema, run}` y la única forma
// de llegar a `run` era que un modelo pidiera la tool por su `schema.name`. Si Claude desaparece,
// esa superficie se queda sin Drive. (Los 184 archivos que ya arman su propio `makeGoogleClient`
// nunca tuvieron ese problema: el agujero era acá.)
//
// Ahora la lógica vive en `lectura.mjs` y `escritura.mjs`, y las tools son una cara fina encima.
// Un modelo puede seguir invocándolas; nada obliga a que lo haga.
//
// EL BORDE. Identidad, almacenamiento y gestión. Crear el continente, encontrarlo, moverlo,
// copiarlo, archivarlo, exportarlo. **El CONTENIDO lo editan los motores** (document, spreadsheet,
// presentation), que son otra pieza. Acá no hay ni va a haber un `drive_do_everything`.

import { crearLectura } from './lectura.mjs'
import { crearEscritura } from './escritura.mjs'
import { crearAuditorPg, crearAuditorEnMemoria } from './auditoria.mjs'
import { CODIGO, DriveError, clasificar, esReintentable } from './errores.mjs'
import { referenciaDe, resumen, PROVEEDOR, PROP_IDEMPOTENCIA } from './referencia.mjs'
import { crearIndice } from '../drive-busqueda/buscar.mjs'

// EL ÍNDICE VIVE EN EL PROCESO, NO EN LA CAPACIDAD. Son ~3.700 filas: armarlo por llamada
// sería releer el índice entero cada vez que alguien pide un archivo. Mismo criterio que
// `comunicacion/asistente/capacidades/drive-buscar.mjs`, que ya lo hacía así.
let _indiceProceso = null
function indiceCompartido(db) {
  if (!_indiceProceso) _indiceProceso = crearIndice({ port: db })
  return _indiceProceso
}

/** Sólo para tests: el índice es del proceso y no debe filtrarse entre casos. */
export function _reiniciarIndiceCompartido() { _indiceProceso = null }

/** Qué capacidad de `orq.capabilities` gobierna cada operación. */
export const CAPACIDAD = Object.freeze({
  LEER: 'drive.files.read',
  GESTIONAR: 'drive.files.manage',
  ARCHIVAR: 'drive.files.archive',
})

const OPERACION_A_CAPACIDAD = Object.freeze({
  crearCarpeta: CAPACIDAD.GESTIONAR,
  crearNativo: CAPACIDAD.GESTIONAR,
  subir: CAPACIDAD.GESTIONAR,
  renombrar: CAPACIDAD.GESTIONAR,
  mover: CAPACIDAD.GESTIONAR,
  copiar: CAPACIDAD.GESTIONAR,
  exportarADrive: CAPACIDAD.GESTIONAR,
  archivar: CAPACIDAD.ARCHIVAR,
})

/**
 * Arma la capacidad.
 *
 * @param {object} o
 * @param {object} o.google        cliente de `makeGoogleClient` (o `googleDelOs()`)
 * @param {{query:Function}} [o.db] port de Postgres; sin él la capacidad anda pero NO audita
 * @param {object} [o.indice]      índice de `drive-busqueda/buscar.mjs` para la búsqueda semántica
 * @param {string} [o.actor]       QUIÉN ejecuta. Va a cada fila de auditoría.
 * @param {'persona'|'agente'|'sistema'} [o.actorTipo]
 * @param {string|null} [o.correlationId]
 * @param {((cap:string, principal:string)=>Promise<string>)|null} [o.politica]
 *        La policy del OS (`lib/policy.mjs → decide`). Si se pasa junto con `principalId`, TODA
 *        mutación la consulta antes de ejecutar. Si no se pasa, la capacidad corre sin portero:
 *        es el modo en que ya corren los scripts, y queda registrado como tal en la auditoría.
 * @param {string|null} [o.principalId]
 */
export function crearCapacidadDrive({
  google, db = null, indice = null, actor = 'sistema', actorTipo = 'sistema',
  correlationId = null, politica = null, principalId = null, auditor: auditorDado = null,
} = {}) {
  // SIN CUENTA CONECTADA NO ES UN ERROR DE PROGRAMACIÓN, ES UN PERMISO QUE FALTA. `os.mjs`
  // documenta que `googleClient()` devuelve `null` cuando nadie autorizó, y quien reciba este
  // error tiene algo que hacer (autorizar), no un bug que reportar.
  if (!google) throw new DriveError(CODIGO.PERMISSION_REQUIRED,
    'No hay una cuenta de Google conectada: autorizá el acceso a Drive y volvé a intentar.')

  const auditor = auditorDado
    ?? (db ? crearAuditorPg({ db, actor, actorTipo, correlationId, capability: CAPACIDAD.GESTIONAR }) : null)

  // EL ÍNDICE SE ARMA SOLO SI HAY BASE. Sin esto, `buscarEnIndice` quedaba con cero
  // consumidores: los cuatro entrypoints llaman a las factorías sin `indice` y el buscador
  // determinístico —el único que entiende "vision/traccion"— nunca se alcanzaba desde ahí.
  const indiceEfectivo = indice ?? (db ? indiceCompartido(db) : null)

  const lectura = crearLectura({ google, indice: indiceEfectivo })
  const escritura = crearEscritura({ google, lectura, auditor })

  /**
   * EL PORTERO. intent → operación estructurada → actor → RBAC → política → validación →
   * operación → verificación → audit. Las tres primeras ya ocurrieron cuando se llama a una
   * función tipada; acá se cierran las que faltan antes de tocar Drive.
   */
  async function conPortero(nombreOperacion, fn, args) {
    const capacidad = OPERACION_A_CAPACIDAD[nombreOperacion] ?? CAPACIDAD.GESTIONAR
    if (politica && principalId) {
      const dispo = await politica(capacidad, principalId)
      if (dispo === 'forbidden') {
        throw new DriveError(CODIGO.FORBIDDEN, `La capacidad ${capacidad} está prohibida para ${actor}.`, { capability: capacidad })
      }
      if (dispo === 'requires_approval') {
        // La capacidad NO encola: encolar es del `tool-executor`, que ya tiene la cola y la
        // pantalla de aprobación. Acá se dice que falta el permiso y se corta ANTES del efecto.
        throw new DriveError(CODIGO.PERMISSION_REQUIRED,
          `La capacidad ${capacidad} requiere aprobación humana: no se ejecutó.`,
          { capability: capacidad, requiere_aprobacion: true })
      }
    }
    const salida = await fn(args)
    return { ...salida, capability: capacidad, actor, policy: politica && principalId ? 'evaluada' : 'no-evaluada' }
  }

  const gestion = {}
  for (const nombre of Object.keys(OPERACION_A_CAPACIDAD)) {
    gestion[nombre] = (args) => conPortero(nombre, escritura[nombre], args)
  }

  return {
    // ── READ (identidad y almacenamiento) ──────────────────────────────────
    referencia: lectura.referencia,
    referenciaViva: lectura.referenciaViva,
    listarCarpeta: lectura.listarCarpeta,
    buscarCarpetas: lectura.buscarCarpetas,
    buscarPorNombre: lectura.buscarPorNombre,
    buscarPorMetadata: lectura.buscarPorMetadata,
    porClaveDeIdempotencia: lectura.porClaveDeIdempotencia,
    buscarEnIndice: lectura.buscarEnIndice,
    revisiones: lectura.revisiones,
    descargar: lectura.descargar,
    exportar: lectura.exportar,

    // ── CREATE + MANAGEMENT (con portero, verificación y auditoría) ────────
    ...gestion,

    // Nivel F. No pasa por el portero porque no hay disposición que lo habilite.
    borrarDefinitivo: escritura.borrarDefinitivo,

    // ── AUDITORÍA ─────────────────────────────────────────────────────────
    historia: auditor?.historia ? (fileId, o) => auditor.historia(fileId, o) : async () => {
      throw new DriveError(CODIGO.AUDIT_UNAVAILABLE, 'esta capacidad se armó sin auditor: no hay historia que leer')
    },
    auditor,
    actor,
  }
}

export {
  crearLectura, crearEscritura, crearAuditorPg, crearAuditorEnMemoria,
  CODIGO, DriveError, clasificar, esReintentable,
  referenciaDe, resumen, PROVEEDOR, PROP_IDEMPOTENCIA,
}
