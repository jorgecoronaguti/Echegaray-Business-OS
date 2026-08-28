// REGISTRAR QUE EL OS LEYÓ UNA FUENTE — cerrar el trinquete de la frescura desde el otro lado.
//
// ═══ POR QUÉ EXISTE (23/07) ═══
//
// La alerta de frescura dejó de ser un trinquete de una sola vía (ver la migración
// 20260723210000_frescura_bidireccional): `recalcular_frescura_fuentes()` ya devuelve una fuente a
// 'actualizado' cuando su `ultima_sincronizacion_exitosa` vuelve a entrar en ventana. Pero eso sólo
// sirve si ALGUIEN escribe esa fecha, y NADIE lo hacía: el OS lee el Cash Flow, el avance y las
// compras todo el tiempo y jamás registraba la lectura. Resultado: "Flujo de Caja - Cash Flow
// (Sheet)" figuraba atrasado (sync 06/07) cuando el pipeline lo reconstruye entero cada día.
//
// Esta capacidad es la contraparte honesta: cuando un ingester del OS TERMINA de leer una fuente con
// éxito, la marca. No estima, no inventa: registra un hecho —"lo leí recién y salió bien"— y deja
// que `recalcular_frescura_fuentes()` decida el estado (una capacidad, una fuente de verdad del
// estado). No toca 'error' ni 'fuente_no_disponible' ni juicios humanos: sólo mueve la fecha.

/**
 * NÚCLEO PURO (sin DB): decide a qué fila de fuentes_datos le corresponde un registro de lectura.
 *
 * Es deliberadamente estricto: si el identificador no matchea EXACTAMENTE una fila, no elige ninguna.
 * Marcar la fuente equivocada como fresca es peor que no marcar nada — escondería un atraso real.
 *
 * @param {Array<{id:any, nombre?:string, drive_file_id?:string}>} fuentes
 * @param {{driveFileId?:string, nombre?:string}} ident
 * @returns {{ok:true, id:any, nombre:string} | {ok:false, motivo:string}}
 */
export function elegirFuente(fuentes = [], { driveFileId, nombre } = {}) {
  if (!driveFileId && !nombre) return { ok: false, motivo: 'no se pasó ni driveFileId ni nombre' }
  const match = fuentes.filter((f) =>
    (driveFileId && f.drive_file_id === driveFileId) ||
    (nombre && String(f.nombre).trim() === String(nombre).trim()))
  if (match.length === 0) return { ok: false, motivo: `ninguna fuente coincide con ${driveFileId ? `drive_file_id=${driveFileId}` : `nombre="${nombre}"`}` }
  if (match.length > 1) return { ok: false, motivo: `${match.length} fuentes coinciden — el identificador es ambiguo, no se marca ninguna` }
  return { ok: true, id: match[0].id, nombre: match[0].nombre }
}

/**
 * Registra una lectura exitosa del OS sobre una fuente y recalcula su frescura.
 *
 * NO falla el proceso que la llama si la fuente no está registrada: un sync no debe romperse porque
 * su fila en fuentes_datos falte o el nombre no matchee. Devuelve el resultado para que el que llama
 * lo informe, y nunca tira.
 *
 * @param {object} deps  {query} — inyectable para test; por defecto usa lib/db.mjs
 * @param {{driveFileId?:string, nombre?:string, coberturaHasta?:string|Date|null}} opts
 *        `coberturaHasta` sólo se escribe si se pasa explícito: NUNCA se inventa hasta dónde llega el
 *        dato. Si no se sabe, no se toca (queda como estaba).
 * @returns {Promise<{ok:boolean, nombre?:string, estado?:string, motivo?:string}>}
 */
export async function registrarSincronizacion(deps = {}, opts = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  const { driveFileId, nombre, coberturaHasta } = opts
  try {
    const { rows } = await query('select id, nombre, drive_file_id from public.fuentes_datos')
    const sel = elegirFuente(rows, { driveFileId, nombre })
    if (!sel.ok) return { ok: false, motivo: sel.motivo }

    // Sólo se mueve la fecha (y la cobertura si se declara). El estado lo decide recalcular.
    if (coberturaHasta !== undefined) {
      await query(
        `update public.fuentes_datos
            set ultima_sincronizacion_exitosa = now(), ultima_lectura = now(),
                cobertura_hasta = $2, updated_at = now()
          where id = $1`,
        [sel.id, coberturaHasta])
    } else {
      await query(
        `update public.fuentes_datos
            set ultima_sincronizacion_exitosa = now(), ultima_lectura = now(), updated_at = now()
          where id = $1`,
        [sel.id])
    }
    await query('select public.recalcular_frescura_fuentes()')
    const { rows: [f] } = await query('select estado from public.fuentes_datos where id = $1', [sel.id])
    return { ok: true, nombre: sel.nombre, estado: f?.estado ?? null }
  } catch (e) {
    return { ok: false, motivo: String(e?.message ?? e).slice(0, 160) }
  }
}

// ═══ ASEGURAR QUE LA FUENTE EXISTE PARA QUE LA ALERTA LA CUBRA (26/07) ═══
//
// La frescura sólo grita por lo que está CATALOGADO en fuentes_datos. Las 23 filas se sembraron el
// 08/07 (discovery). Pero dos ingestas financieras críticas NACIERON DESPUÉS y nadie las catalogó:
// el extracto del banco (`banco_movimientos`, 23/07) y el lado COMPRAS de ARCA (libro R). Sin fila,
// esos feeds se pueden congelar semanas sin que nada avise — el peor silencio, porque son los que
// alimentan caja y costo.
//
// `asegurarFuente` DECLARA la fuente (no fabrica ningún dato de negocio: registra que el OS ingiere
// este feed y con qué cadencia se lo espera). Es idempotente por `nombre` (ON CONFLICT DO NOTHING):
// si la fila ya existe —creada por el discovery o curada a mano— no la pisa. Se inserta con estado
// 'actualizado' + ultima_sincronizacion_exitosa=now() a propósito: `recalcular_frescura_fuentes()`
// SÓLO mueve entre 'actualizado'↔'atrasado' y jamás rescata un 'fuente_no_disponible'; si naciera en
// ese estado quedaría muda para siempre. Al momento de crearla acabamos de sincronizar con éxito, así
// que 'actualizado' es el hecho, no un supuesto.

/** Columnas mínimas NOT NULL de una declaración de fuente, con defaults conservadores. */
function normalizarDeclaracion(decl = {}) {
  return {
    nombre: decl.nombre,
    tipo_archivo: decl.tipo_archivo ?? 'externo_no_conectado',
    proceso_negocio: decl.proceso_negocio ?? 'Ingesta del Business OS',
    area: decl.area ?? 'Administración',
    frecuencia_actualizacion: decl.frecuencia_actualizacion ?? 'por_evento',
    vigencia: decl.vigencia ?? 'vigente',
    fuente_primaria: decl.fuente_primaria ?? true,
    naturaleza_dato: decl.naturaleza_dato ?? 'confirmado',
    criticidad: decl.criticidad ?? 'alta',
    mecanismo_integracion: decl.mecanismo_integracion ?? 'ingesta_incremental',
    drive_file_id: decl.drive_file_id ?? null,
    destino_supabase: decl.destino_supabase ?? null,
    capability_dependiente: decl.capability_dependiente ?? null,
    notas: decl.notas ?? null,
  }
}

/**
 * Asegura (idempotente) que exista la fila de fuentes_datos de un feed de ingesta.
 * Nunca pisa una fila existente ni rompe el proceso que la llama.
 * @returns {Promise<{ok:boolean, creada?:boolean, nombre?:string, motivo?:string}>}
 */
export async function asegurarFuente(deps = {}, decl = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  const d = normalizarDeclaracion(decl)
  if (!d.nombre) return { ok: false, motivo: 'falta nombre en la declaración de fuente' }
  try {
    const r = await query(
      `insert into public.fuentes_datos
         (nombre, tipo_archivo, proceso_negocio, area, frecuencia_actualizacion, vigencia,
          fuente_primaria, naturaleza_dato, criticidad, mecanismo_integracion,
          drive_file_id, destino_supabase, capability_dependiente, notas,
          estado, ultima_sincronizacion_exitosa)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'actualizado', now())
       on conflict (nombre) do nothing
       returning id`,
      [d.nombre, d.tipo_archivo, d.proceso_negocio, d.area, d.frecuencia_actualizacion, d.vigencia,
       d.fuente_primaria, d.naturaleza_dato, d.criticidad, d.mecanismo_integracion,
       d.drive_file_id, d.destino_supabase, d.capability_dependiente, d.notas])
    return { ok: true, creada: r.rowCount > 0, nombre: d.nombre }
  } catch (e) {
    return { ok: false, motivo: String(e?.message ?? e).slice(0, 160) }
  }
}

/**
 * Ingesta = asegurar la fuente + registrar la sincronización, en un solo paso.
 * Es lo que llaman los ingesters (banco, ARCA compras): garantiza que la alerta de frescura los
 * cubra desde la PRIMERA corrida, sin depender de que el discovery los hubiera catalogado.
 * @param {{declaracion:object, coberturaHasta?:string|Date|null}} opts
 * @returns {Promise<{ok:boolean, nombre?:string, estado?:string, creada?:boolean, motivo?:string}>}
 */
export async function registrarIngesta(deps = {}, opts = {}) {
  const { declaracion = {}, coberturaHasta } = opts
  const a = await asegurarFuente(deps, declaracion)
  if (!a.ok) return a
  const r = await registrarSincronizacion(deps, { nombre: declaracion.nombre, coberturaHasta })
  return { ...r, creada: a.creada }
}

// CATÁLOGO ÚNICO de las fuentes de ingesta que el OS mantiene frescas por sí mismo. Vive acá, en un
// solo lugar, para que el nombre exacto no se repita (y no se desincronice) entre el ingester y la
// alerta. Cambiar un nombre acá es cambiar la fila que la frescura vigila.
export const FUENTES_INGESTA = {
  banco: {
    nombre: 'Extracto bancario Santander (movimientos)',
    tipo_archivo: 'externo_no_conectado',
    proceso_negocio: 'Tesorería — movimientos y disponibilidades de la cuenta corriente',
    area: 'Finanzas',
    frecuencia_actualizacion: 'diaria',
    naturaleza_dato: 'confirmado',
    criticidad: 'alta',
    mecanismo_integracion: 'ingesta_incremental',
    destino_supabase: 'banco_movimientos',
    capability_dependiente: 'posicion_financiera',
    notas: 'Entra por importar-banco.mjs (CSV o pegado). No hay API de banca empresa: el dato entra a mano.',
  },
  // El resumen de la tarjeta. Llega UNA vez por mes y por mail: si un mes no llega, nada avisa —y la
  // pestaña sigue publicando el resumen viejo como si fuera el vigente. Catalogarlo hace que el
  // atraso lo levante `recalcular_frescura_fuentes()` sin que nadie se acuerde de mirar.
  tarjeta: {
    nombre: 'Resumen de tarjeta Visa Santander (PDF del banco)',
    tipo_archivo: 'externo_no_conectado',
    proceso_negocio: 'Tesorería — obligación de la tarjeta: cuánto se debita, cuándo y qué cargos trae',
    area: 'Finanzas',
    frecuencia_actualizacion: 'mensual',
    naturaleza_dato: 'confirmado',
    criticidad: 'alta',
    mecanismo_integracion: 'ingesta_incremental',
    destino_supabase: 'tarjeta_resumen',
    capability_dependiente: 'posicion_financiera',
    notas: 'Entra por importar-tarjeta.mjs desde el PDF (PyMuPDF). No hay API: el resumen llega por mail.',
  },
  arcaCompras: {
    nombre: 'Comprobantes ARCA — Compras (Libro IVA Compras)',
    tipo_archivo: 'externo_no_conectado',
    proceso_negocio: 'Fiscal/Contable — comprobantes recibidos (gastos y crédito fiscal)',
    area: 'Administración',
    frecuencia_actualizacion: 'mensual',
    naturaleza_dato: 'confirmado',
    criticidad: 'alta',
    mecanismo_integracion: 'api',
    destino_supabase: 'comprobantes_arca',
    capability_dependiente: 'situacion_fiscal',
    notas: 'Baja por AfipSDK (clave fiscal), tipo_libro=R. Sync mensual (echegaray-arca-sync.timer).',
  },
  // BADLAR — la tasa de la que cuelga la TNA de FONDEFIN (60% de la Badlar, por reglamento). Se
  // cataloga para que el ATRASO GRITE SOLO: si el canario deja de correr, `recalcular_frescura_fuentes()`
  // la marca 'atrasado' y la alerta la levanta sin que nadie se acuerde de mirar. Es la contraparte
  // del `vigencia_hasta` de la fila: la vigencia hace que el número muera, la fuente hace que se avise.
  badlarBcra: {
    nombre: 'Badlar bancos privados — BCRA (estadísticas monetarias, idVariable 7)',
    // 'externo_no_conectado' es lo que admite el CHECK de la tabla para una fuente de afuera; que se
    // lea por API lo dice `mecanismo_integracion`. Misma convención que el feed de ARCA de acá arriba.
    tipo_archivo: 'externo_no_conectado',
    proceso_negocio: 'Finanzas — tasa de referencia de las líneas indexadas a Badlar (FONDEFIN)',
    area: 'Finanzas',
    // SEMANAL y no diaria aunque el BCRA publique todos los hábiles: con 'diaria' el umbral es de 2
    // días y un fin de semana largo prendería el ⚠ sin que falte nada. Un aviso que nunca se apaga
    // deja de leerse — es el fracaso del trinquete de frescura que ya hubo que arreglar una vez. Los
    // 9 días de 'semanal' siguen gritando ANTES de que caduque la foto (15 días), que es lo que importa.
    frecuencia_actualizacion: 'semanal',
    naturaleza_dato: 'confirmado',
    criticidad: 'media',
    mecanismo_integracion: 'api',
    destino_supabase: null,
    capability_dependiente: 'comparar_financiamiento',
    notas: 'API pública del BCRA, sin credenciales. La lee scripts/canario-badlar-fondefin.mjs, que además contrasta la Badlar guardada en lib/badlar-bcra.mjs contra la publicada.',
  },
}
