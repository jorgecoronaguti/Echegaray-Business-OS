// LA FIRMA DE LO QUE EL OS DEJÓ ESCRITO — para que los agentes respeten CUALQUIER edición del dueño.
//
// POR QUÉ (24/07). El dueño perdió su trabajo varias veces: editaba una pestaña y el generador la
// volvía a escribir. La detección por rótulos sólo caza reescrituras totales. Esta es la robusta: el
// OS guarda una FIRMA (hash) de lo que dejó en la pestaña; antes de reescribir compara la firma actual
// con la suya. Si difieren, el dueño editó → el OS NO la pisa. Falla del lado seguro: ante cualquier
// duda (mismatch), preserva. La verdad del dueño es definitiva.
//
// La firma se calcula sobre el TEXTO CRUDO (fórmulas incluidas, render FORMULA) para que un cambio de
// valor por recálculo NO cuente como edición —lo que cambia es la fórmula sólo si una persona la toca—.
// Y se guarda desde una RE-LECTURA post-escritura, así la normalización de Google en el ida y vuelta
// no genera un falso "editado".

import { createHash } from 'node:crypto'

/**
 * NÚCLEO PURO: la firma de una grilla. Normaliza cada celda (trim) y las une con un separador que no
 * aparece en el contenido, luego hashea. Dos grillas con el MISMO contenido visible/fórmula dan la
 * misma firma; un cambio de una persona (texto, fórmula, fila) la cambia.
 */
export function firmaDeGrid(grid = []) {
  const norm = (grid || [])
    .map((f) => (f || []).map((c) => String(c ?? '').trim()).join('␟'))
    .join('␞')
    // Filas totalmente vacías al final no cambian la firma (Google a veces devuelve o recorta filas
    // vacías): se recortan los separadores de fin.
    .replace(/[␞␟]+$/g, '')
  return createHash('sha256').update(norm).digest('hex')
}

async function q(deps) {
  if (deps?.query) return deps.query
  return (await import('./db.mjs')).query
}

/** La firma que el OS guardó para esta pestaña (o null si nunca la escribió con este mecanismo). */
export async function leerFirma(deps, fileId, pestana) {
  try {
    const query = await q(deps)
    const r = await query('select firma from public.sheet_tab_firma where file_id = $1 and pestana = $2', [fileId, pestana])
    return r.rows[0]?.firma ?? null
  } catch { return null }
}

/** Guarda la firma de lo que el OS dejó en la pestaña (idempotente por pestaña). */
export async function guardarFirma(deps, fileId, pestana, firma) {
  try {
    const query = await q(deps)
    await query(
      `insert into public.sheet_tab_firma (file_id, pestana, firma, escrito_en) values ($1, $2, $3, now())
         on conflict (file_id, pestana) do update set firma = excluded.firma, escrito_en = now()`,
      [fileId, pestana, firma])
  } catch { /* sin base no se puede guardar; la próxima corrida no tendrá baseline y escribirá normal */ }
}

/**
 * NÚCLEO PURO: ¿editó una persona la pestaña desde la última vez que el OS la escribió? Compara la
 * firma actual contra la que guardó el OS. Si no hay baseline (nunca la escribió con este mecanismo),
 * NO se puede afirmar que la editó → devuelve editado:false (se escribe normal y se establece baseline).
 *
 * @returns {{editado:boolean, hayBaseline:boolean}}
 */
export function humanoEdito(firmaActual, firmaGuardada) {
  if (!firmaGuardada) return { editado: false, hayBaseline: false }
  return { editado: firmaActual !== firmaGuardada, hayBaseline: true }
}

/**
 * NÚCLEO PURO: la decisión de la firma, con el bootstrap resuelto del lado SEGURO.
 *
 * POR QUÉ (24/07). El dueño perdió su trabajo una vez más y pidió arreglar "el problema general".
 * El hueco era el ARRANQUE EN FRÍO: cuando una pestaña todavía no tiene firma baseline, `humanoEdito`
 * devolvía editado:false y el generador escribía ENCIMA de la edición del dueño (y recién después
 * sellaba). Eso es fallar hacia el lado abierto: justo lo contrario de lo que el dueño pide.
 *
 * Acá se falla hacia el lado CERRADO. Sin baseline no se puede comparar firma contra firma, pero sí
 * hay otra señal honesta: el historial de revisiones de Drive dice si una PERSONA tocó el archivo
 * después de la última escritura del OS. Si la tocó (o no se pudo verificar), la pestaña se toma como
 * suya y NO se pisa. Sólo si consta que el único que escribió fue el OS se adopta y se sella.
 *
 * @param {{firmaActual:string, firmaGuardada:string|null, hayEdicionHumana?:boolean}} p
 * @returns {{editada:boolean, motivo:string}}
 */
export function evaluarFirma({ firmaActual, firmaGuardada, hayEdicionHumana = false }) {
  if (firmaGuardada) {
    return firmaActual === firmaGuardada
      ? { editada: false, motivo: 'coincide con mi última escritura' }
      : { editada: true, motivo: 'la firma difiere de mi última escritura: la editaste' }
  }
  // Sin baseline: no puedo comparar. Fail-closed con el historial de Drive.
  if (hayEdicionHumana) return { editada: true, motivo: 'sin baseline y una persona tocó el archivo: la tomo como tuya' }
  return { editada: false, motivo: 'sin baseline y sólo el OS tocó el archivo: la adopto y sello' }
}

/**
 * Guardia de firma para generadores que escriben por su PROPIO camino (no por escribirPreservando).
 * Lee el estado actual de la pestaña (FORMULA) y, si difiere de la firma que guardó el OS, la auto-canda
 * y devuelve editada:true — el generador debe SALTAR esa pestaña. Rango A1:BZ (toda la pestaña), así
 * una edición en cualquier parte cuenta. Sin baseline, no se puede afirmar edición → editada:false.
 */
export async function firmaGuardia(google, fileId, pestana, ref = pestana) {
  try {
    const actual = await google.readSheetValues(fileId, `${ref}!A1:BZ`, { render: 'FORMULA' }).catch(() => null)
    if (!actual) return { editada: false }
    const firmaGuardada = await leerFirma({}, fileId, pestana)
    // ARRANQUE EN FRÍO (sin baseline): la firma no alcanza para decidir, así que se mira el historial
    // de Drive. Si una persona tocó el archivo después del OS —o no se pudo verificar— se falla del
    // lado seguro: la pestaña se toma como suya. Sólo se consulta cuando NO hay baseline (barato).
    let hayEdicionHumana = false
    if (!firmaGuardada) {
      try {
        const { historialEdiciones } = await import('./historial-ediciones.mjs')
        const h = await historialEdiciones(google, fileId)
        hayEdicionHumana = Boolean(h?.hubo || h?.desconocido)
      } catch { hayEdicionHumana = true /* no se pudo verificar: lado seguro */ }
    }
    const { editada, motivo } = evaluarFirma({ firmaActual: firmaDeGrid(actual), firmaGuardada, hayEdicionHumana })
    if (editada) {
      const { bloquear } = await import('./pestana-bloqueada.mjs')
      await bloquear({}, fileId, pestana, { motivo: `auto: ${motivo}`, por: 'auto' })
      console.log(`  🔒 "${pestana}": ${motivo} — la tomo como tuya, no la piso.`)
      return { editada: true }
    }
  } catch { /* no crítico: sin firma, el resto de la preservación sigue activa */ }
  return { editada: false }
}

/** Sella la firma de lo que el OS dejó en la pestaña, desde una RE-LECTURA (A1:BZ, FORMULA). */
export async function sellarFirma(google, fileId, pestana, ref = pestana) {
  try {
    const readback = await google.readSheetValues(fileId, `${ref}!A1:BZ`, { render: 'FORMULA' }).catch(() => null)
    if (readback) await guardarFirma({}, fileId, pestana, firmaDeGrid(readback))
  } catch { /* no crítico */ }
}
