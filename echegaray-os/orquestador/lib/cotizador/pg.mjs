// EL BORDE DEL COTIZADOR — lo único de esta carpeta que toca la base.
//
// ═══ POR QUÉ VIVE APARTE ═══
//
// Los quince módulos de `cotizador/` son puros: entran datos, salen datos, y por eso el CLAUDE-ZERO
// se puede probar sin red. Ese diseño sólo se sostiene si hay UN archivo que traduce entre la base
// y esa forma, y es éste. Un `query()` colgado dentro de `costo.mjs` convertiría el motor entero en
// algo que no se puede correr sin Postgres, y ahí se termina la posibilidad de probarlo.
//
// ═══ SIN N+1, Y NO ES UNA PREFERENCIA ═══
//
// Un presupuesto real tiene entre 40 y 120 partidas. Pedir la composición de cada una por separado
// son 120 viajes; pedir el precio de cada recurso por separado son otros 600. Con la latencia real
// contra Supabase eso es medio minuto de reloj para armar una pantalla. Acá son CINCO consultas
// fijas, con `= any($1::uuid[])`, independientemente del tamaño del presupuesto.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ ESTE MÓDULO **NO ES PARA LA WEB**. LA RLS NO APLICA ACÁ.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `leerEstado` y las tres funciones de escritura reciben un `query` que en la práctica es el POOL
// del servidor. Ese pool se conecta con un rol que NO pasa por row-level security: las policies de
// `cotizacion_alcance`, `cotizacion_evento` y `cotizacion_huella` **no se evalúan**, y los seis
// permisos del contrato quedan sin hacer cumplir.
//
// Es exactamente la clase de agujero que este repo ya pagó —«RLS no es GRANT», «una capability de
// lectura que escribía»— así que se dice acá, con mayúsculas, en vez de en una nota al pie.
//
//   · USO LEGÍTIMO: scripts del orquestador, informes, tests, el worker. Todo lo que corre del lado
//     del servidor con una decisión ya tomada por alguien.
//   · USO PROHIBIDO: una ruta de Next, una server action, o cualquier cosa que atienda a un
//     usuario. Ahí la escritura la tiene que hacer el CALLER con SU credencial —el plan que
//     devuelve `comandos.ejecutar()` está pensado para eso— y la base vuelve a preguntar quién es.
//
// `pg.pg.test.mjs` prueba las policies aparte, con `set local role authenticated` y un JWT real,
// justamente porque este módulo por sí solo no las ejercita.
//
// ═══ LO QUE NO HACE ═══
//
// No calcula nada. No decide nada. No corrige nada. Si `cotizacion_partida.cantidad` viene en NULL,
// llega como NULL — el que decide qué significa eso es `costo.mjs`, y ya sabe. La tentación de
// «arreglar» los datos en el adaptador es la forma más rápida de que un hueco desaparezca sin que
// nadie se entere.

import { observacionDePrecio, DIAS_VIGENCIA } from './precios.mjs'
import { entradaDeAlcance, ALCANCE } from './alcance.mjs'
import { politicaComercial } from './comercial.mjs'
import { subcontrato } from './costo.mjs'

/** Cuántos días vale un precio, cuando la fila no lo dice. La columna `vigencia_dias` es nueva y
 *  nullable: las filas viejas caen acá, y eso queda DECLARADO en la observación que se construye. */
const vigenciaDe = (fila) => (fila.vigencia_dias === null || fila.vigencia_dias === undefined ? DIAS_VIGENCIA : Number(fila.vigencia_dias))

const iso = (v) => {
  if (!v) return null
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return String(v).slice(0, 10)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LECTURA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EL ESTADO DE UNA COTIZACIÓN, en la forma que `correr()` consume. SEIS consultas fijas.
 *
 * Devuelve además `crudo`, con las filas tal cual salieron, porque cuando un número no cuadra la
 * primera pregunta es «¿eso lo trajo así la base o lo transformó el adaptador?» y sin las filas
 * originales esa pregunta no se puede contestar sin volver a consultar.
 */
export async function leerEstado({ query }, cotizacionId, { hoy = new Date() } = {}) {
  // ── 1 · las partidas
  const partidasSql = await query(
    `select p.id, p.orden, p.rubro, p.codigo, p.descripcion, p.cantidad, p.unidad,
            p.tarea_tipo_id, p.analisis_id, p.subcontratada, p.precio_subcontrato,
            p.costo_unitario, p.hs_unitarias, p.nota, p.creado_en
       from public.cotizacion_partida p
      where p.cotizacion_id = $1
      order by p.orden, p.codigo`, [cotizacionId])

  const analisisIds = [...new Set(partidasSql.rows.map((r) => r.analisis_id).filter(Boolean))]

  // ── 2 · TODAS las composiciones de una vez
  const compSql = analisisIds.length
    ? await query(
      `select al.analisis_id, al.orden, r.codigo, r.nombre, r.tipo, r.unidad, r.desperdicio, al.cantidad
         from public.analisis_linea al
         join public.recurso r on r.id = al.recurso_id
        where al.analisis_id = any($1::uuid[])
        order by al.analisis_id, al.orden`, [analisisIds])
    : { rows: [] }

  const composiciones = new Map()
  for (const l of compSql.rows) {
    const lista = composiciones.get(l.analisis_id) ?? []
    lista.push({
      recursoCodigo: l.codigo, nombre: l.nombre, tipo: l.tipo, unidad: l.unidad,
      cantidad: Number(l.cantidad), desperdicio: l.desperdicio === null ? 0 : Number(l.desperdicio),
    })
    composiciones.set(l.analisis_id, lista)
  }

  // ── 3 · TODOS los precios de una vez, sólo de los recursos que este presupuesto usa
  const codigos = [...new Set(compSql.rows.map((r) => r.codigo))]
  const preciosSql = codigos.length
    ? await query(
      `select r.codigo, rp.costo, rp.moneda, rp.fuente, rp.proveedor, rp.fecha_precio, rp.vigencia_dias
         from public.recurso_precio rp
         join public.recurso r on r.id = rp.recurso_id
        where r.codigo = any($1::text[]) and rp.costo is not null and rp.fecha_precio is not null
        order by r.codigo, rp.fecha_precio desc`, [codigos])
    : { rows: [] }

  const observaciones = preciosSql.rows.map((r) => observacionDePrecio({
    recursoCodigo: r.codigo, precio: Number(r.costo), moneda: r.moneda ?? 'ARS',
    // Sin fuente la fila no se puede construir —`observacionDePrecio` lo exige— y perderla en
    // silencio sería exactamente el hueco que el motor existe para no tener. Se declara.
    fuente: r.fuente ?? r.proveedor ?? 'recurso_precio sin fuente declarada',
    observadoEn: iso(r.fecha_precio), vigenciaDias: vigenciaDe(r),
  }))

  // ── 4 · el alcance
  const alcanceSql = await query(
    `select patron, estado, fuente, texto_literal, motivo
       from public.cotizacion_alcance where cotizacion_id = $1 order by patron`, [cotizacionId])
  const alcance = alcanceSql.rows.map((r) => entradaDeAlcance({
    patron: r.patron, estado: r.estado, fuente: r.fuente, textoLiteral: r.texto_literal, motivo: r.motivo,
  }))

  // ── 5 · la política: la que COPIÓ la cotización, no la vigente de hoy
  // Una cotización de agosto se defiende con los porcentajes de agosto. Leer la vigente
  // reescribiría el precio de una oferta ya emitida cada vez que la empresa cambia su política.
  const polSql = await query(
    `select c.pct_gastos_generales, c.pct_beneficio, c.pct_financiero, c.factor_financiero,
            c.pct_iibb, c.pct_ganancias, c.pct_cheque, c.pct_iva, c.parametro_comercial_id,
            c.cliente, c.obra_nombre, c.numero, c.version, c.congelada_en,
            pc.version as pc_version, pc.fuente as pc_fuente
       from public.cotizaciones c
       left join public.parametro_comercial pc on pc.id = c.parametro_comercial_id
      where c.id = $1`, [cotizacionId])
  const pol = polSql.rows[0] ?? null

  const politica = pol && pol.pct_gastos_generales !== null
    ? politicaComercial({
      version: pol.pc_version ?? 1, origen: 'QUOTE',
      fuente: pol.pc_fuente ? `copiada de parametro_comercial v${pol.pc_version} — ${pol.pc_fuente}` : 'porcentajes propios de la cotización',
      pctGastosGenerales: Number(pol.pct_gastos_generales), pctBeneficio: Number(pol.pct_beneficio),
      pctFinanciero: Number(pol.pct_financiero), factorFinanciero: Number(pol.factor_financiero),
      pctIibb: Number(pol.pct_iibb), pctGanancias: Number(pol.pct_ganancias),
      pctCheque: Number(pol.pct_cheque), pctIva: Number(pol.pct_iva),
    })
    : null

  // ── los documentos salen de `public.computo`, que es la genealogía ya cableada
  const overrides = await leerOverridesDePrecio({ query }, cotizacionId)

  const docsSql = await query(
    `select distinct c.documento_drive_id, c.documento_nombre
       from public.computo c
       join public.cotizacion_partida p on p.id = c.cotizacion_partida_id
      where p.cotizacion_id = $1 and c.documento_nombre is not null
      order by c.documento_nombre`, [cotizacionId])

  const partidas = partidasSql.rows.map((r) => ({
    id: r.id, codigo: r.codigo ?? r.id, descripcion: r.descripcion, rubro: r.rubro,
    unidad: r.unidad,
    cantidad: r.cantidad === null ? null : Number(r.cantidad),
    tareaTipoId: r.analisis_id,     // el motor indexa las composiciones por analisis_id
    composicion: composiciones.get(r.analisis_id) ?? [],
    subcontratada: r.subcontratada === true,
    subcontrato: r.subcontratada === true
      ? subcontrato({
        alcance: r.descripcion ?? r.codigo ?? 'subcontrato sin descripción',
        cantidad: r.cantidad === null ? null : Number(r.cantidad), unidad: r.unidad,
        // Un `precio_subcontrato` en NULL entra como NULL. `subcontrato()` lo convierte en
        // FALTA_DATO y NO en $0, que es todo el punto del §14.
        precio: r.precio_subcontrato === null ? null : Number(r.precio_subcontrato),
        // ═══ LA FECHA NO SE FABRICA ═══
        // Ponerle `hoy` a un subcontrato cargado hace ocho meses lo dejaba VIGENTE PARA SIEMPRE: la
        // guarda de vencimiento nunca podía dispararse porque el dato que mira lo inventaba el
        // adaptador. `cotizacion_partida` no guarda la fecha de la cotización del subcontratista,
        // así que se usa la fecha de creación de la partida —que es lo más cercano que hay— y se
        // DECLARA en la fuente que es una aproximación, no el dato.
        ...(r.precio_subcontrato === null ? {} : {
          fuente: r.creado_en
            ? `cotizacion_partida.precio_subcontrato · fecha aproximada por creado_en (la tabla no guarda la fecha de la cotización del subcontratista)`
            : 'cotizacion_partida.precio_subcontrato · SIN FECHA de cotización',
          cotizadoEn: r.creado_en ? iso(r.creado_en) : null,
        }),
      })
      : null,
    hh: r.hs_unitarias === null || r.cantidad === null ? null : Number(r.hs_unitarias) * Number(r.cantidad),
  }))

  return {
    cotizacionId,
    cliente: pol?.cliente ?? null,
    obraNombre: pol?.obra_nombre ?? null,
    numero: pol?.numero ?? null,
    versionCotizacion: pol?.version ?? null,
    congeladaEn: pol?.congelada_en ?? null,
    documentos: docsSql.rows.map((d) => ({ hash: d.documento_drive_id ?? d.documento_nombre, nombre: d.documento_nombre, parseado: true })),
    elementos: [],
    partidas, composiciones, observaciones, alcance, politica, fx: null, hoy,
    overridesDePrecio: overrides,
    /** Las filas tal cual salieron. Sin esto, «¿lo trajo así la base o lo transformó el adaptador?»
     *  no se puede contestar sin volver a consultar. */
    crudo: { partidas: partidasSql.rows, composiciones: compSql.rows, precios: preciosSql.rows },
    consultas: 6,
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ESCRITURA
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** El alcance, idempotente por (cotizacion_id, patron). PURA salvo por la escritura. */
export async function guardarAlcance({ query }, cotizacionId, entradas = []) {
  const escritas = []
  for (const e of entradas) {
    const r = await query(
      `insert into public.cotizacion_alcance (cotizacion_id, patron, estado, fuente, texto_literal, motivo)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (cotizacion_id, patron) do update
         set estado = excluded.estado, fuente = excluded.fuente,
             texto_literal = excluded.texto_literal, motivo = excluded.motivo
       returning id, patron, estado`,
      [cotizacionId, e.patron, e.estado, e.fuente, e.textoLiteral ?? null, e.motivo ?? null])
    escritas.push(r.rows[0])
  }
  return escritas
}

/**
 * LOS EVENTOS. Sólo INSERT — la tabla no tiene GRANT de UPDATE ni de DELETE, así que un intento de
 * reescribir la historia falla en la base y no en una convención de este archivo.
 */
export async function guardarEventos({ query }, cotizacionId, eventos = []) {
  const escritos = []
  for (const e of eventos) {
    const r = await query(
      `insert into public.cotizacion_evento
         (cotizacion_id, accion, entidad, campo, antes, despues, motivo, correlation_id, revierte_a, cuando)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,coalesce($10::timestamptz, now()))
       returning id, accion, entidad, correlation_id`,
      [cotizacionId, e.accion, e.entidad, e.campo ?? null,
        JSON.stringify(e.antes ?? null), JSON.stringify(e.despues ?? null),
        e.motivo ?? null, e.correlationId, e.revierteA ?? null, e.cuando ?? null])
    escritos.push(r.rows[0])
  }
  return escritos
}

/** La huella de las entradas con las que se congeló una versión. Una por versión: el UNIQUE lo
 *  impone la base, así que dos congelados de la misma versión no pueden dar dos huellas. */
export async function guardarHuella({ query }, cotizacionId, version, huella) {
  const r = await query(
    `insert into public.cotizacion_huella (cotizacion_id, version, sha256, partes, resumen)
     values ($1,$2,$3,$4::jsonb,$5) returning id, sha256, version`,
    [cotizacionId, version, huella.sha256, JSON.stringify(huella.partes), huella.resumen ?? null])
  return r.rows[0]
}

/** La huella guardada de una versión, para comparar contra la de hoy en una revisión. */
export async function leerHuella({ query }, cotizacionId, version) {
  const r = await query(
    `select sha256, partes, resumen, calculada_en from public.cotizacion_huella
      where cotizacion_id = $1 and version = $2`, [cotizacionId, version])
  const f = r.rows[0]
  return f ? { sha256: f.sha256, partes: f.partes, resumen: f.resumen, calculadaEn: f.calculada_en } : null
}

/**
 * LOS OVERRIDES DE PRECIO VENCIDO, EN LA FORMA QUE LA COLA CONSUME.
 *
 * ═══ POR QUÉ ESTA FUNCIÓN EXISTE ═══
 *
 * La migración creó `cotizacion_override_precio` y el gate de SQL la lee, pero del lado del motor
 * NADIE la leía: el override de la base y el del motor no se tocaban. Con eso, el gate de SQL
 * destrababa un precio vencido y el del motor lo seguía bloqueando — dos respuestas distintas a la
 * misma pregunta, que es justo lo que el vigilante existe para impedir.
 *
 * `entidad` sale como el CÓDIGO del recurso: `overrideDe()` compara por prefijo porque la entidad
 * de un issue de precio es `codigo (NOMBRE)`.
 */
export async function leerOverridesDePrecio({ query }, cotizacionId) {
  const r = await query(
    `select o.recurso_codigo, o.autorizado_por, o.motivo, o.creado_en
       from public.cotizacion_override_precio o
      where o.cotizacion_id = $1 order by o.recurso_codigo`, [cotizacionId])
  return r.rows.map((o) => ({
    entidad: o.recurso_codigo,
    autorizadoPor: o.autorizado_por,
    motivo: o.motivo,
    firmadoEn: o.creado_en?.toISOString?.() ?? o.creado_en,
  }))
}

/**
 * FIRMAR UN OVERRIDE DE PRECIO VENCIDO.
 *
 * ═══ POR QUÉ NO HAY `do update` ═══
 *
 * La versión anterior hacía `on conflict … do update set motivo = excluded.motivo` y **fallaba con
 * `permission denied` (42501)**: la migración otorga `select, insert` y no hay policy de UPDATE. O
 * sea que la única salida que el DoD le ofrece al dueño para los 285 precios vencidos —firmar el
 * override— no funcionaba por la vía que el código provee. Es «RLS no es GRANT» del otro lado.
 *
 * Se podía cerrar de dos maneras y se eligió la segunda:
 *
 *   (a) `GRANT UPDATE` + policy de UPDATE con el mismo predicado. Funciona, y deja que una firma se
 *       reescriba: el motivo con el que alguien asumió $8,5 M cambiaría sin dejar rastro.
 *   (b) **Sin UPDATE.** Una firma es un hecho, y §21 dice que la historia no se borra. Re-firmar no
 *       es corregir: si el motivo cambió, cambió porque pasó algo nuevo, y eso es otro hecho. El
 *       `do nothing` devuelve la firma que YA estaba, con quién y cuándo, en vez de pisarla.
 *
 * La policy exige `COMMERCIAL_WRITE` y `autorizado_por = auth.uid()`: no se puede firmar por otro.
 */
export async function firmarOverrideDePrecio({ query }, cotizacionId, recursoCodigo, motivo = null) {
  const r = await query(
    `insert into public.cotizacion_override_precio (cotizacion_id, recurso_codigo, motivo)
     values ($1,$2,$3)
     on conflict (cotizacion_id, recurso_codigo) do nothing
     returning id, recurso_codigo, autorizado_por, motivo, creado_en`, [cotizacionId, recursoCodigo, motivo])
  if (r.rows[0]) return { ...r.rows[0], nueva: true }
  // Ya estaba firmada. NO se pisa: se devuelve la que existe para que quien llama pueda decir
  // «esto ya lo asumió fulano el tal día» en vez de sobrescribir el motivo de una decisión ajena.
  const ya = await query(
    `select id, recurso_codigo, autorizado_por, motivo, creado_en
       from public.cotizacion_override_precio
      where cotizacion_id = $1 and recurso_codigo = $2`, [cotizacionId, recursoCodigo])
  return ya.rows[0] ? { ...ya.rows[0], nueva: false } : null
}

/** Los eventos de una cotización, en orden. La historia que contesta «¿por qué quedó en 168?». */
export async function leerEventos({ query }, cotizacionId) {
  const r = await query(
    `select id, accion, entidad, campo, antes, despues, actor, motivo, correlation_id, revierte_a, cuando
       from public.cotizacion_evento where cotizacion_id = $1 order by cuando, id`, [cotizacionId])
  return r.rows.map((e) => ({
    id: e.id, accion: e.accion, entidad: e.entidad, campo: e.campo,
    antes: e.antes, despues: e.despues, actor: e.actor, motivo: e.motivo,
    correlationId: e.correlation_id, revierteA: e.revierte_a, cuando: e.cuando?.toISOString?.() ?? e.cuando,
  }))
}

export { ALCANCE }
