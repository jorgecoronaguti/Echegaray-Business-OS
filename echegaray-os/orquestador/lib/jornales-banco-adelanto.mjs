// EL ADELANTO DE LAS QUINCENAS SIN COLUMNA BANCO — plan, evidencia bancaria, escritura por override y reversa.
//
// ═══ EL PROBLEMA (17/09/2026) ═══
//
// El dueño reclamó que están mal los cobros «por banco» de los legajos. Medido:
//
//   · El legajo lee el espejo de JORNALES (`jornales_bloque_persona`, vía `orquestador/lib/jornales-espejo.mjs`)
//     y lo pagado que el cargador copió de la planilla (`liquidacion_linea.pagado_banco/pagado_efectivo`).
//   · La columna BANCO está VACÍA —NULL en TODAS las filas del bloque, no cero— en 8 bloques de Obreros de
//     2026. En esas quincenas la planilla anota todo como ADELANTO y EN EFECTIVO, y la app lo publica como
//     «$0 por banco, todo en efectivo». (El defecto de PRESENTACIÓN —NULL leído como 0— se arregla aparte, en
//     `liquidacionOverrides.ts` / `retribucionDelLegajo.ts`: «sin desglose».)
//
// La pregunta que sólo puede contestar el dueño, y que NO contestó: ESE ADELANTO, ¿SALE POR TRANSFERENCIA O EN
// BILLETES? No se le vuelve a preguntar. Se decide con EVIDENCIA, quincena por quincena, contra el extracto del
// Santander (`banco_movimientos`, que arranca el 28/05/2026).
//
// ═══ LOS DOS ESCENARIOS ═══
//
// A) POR TRANSFERENCIA → el adelanto es dinero que salió del banco. Ese concepto YA EXISTE en el modelo con
//    nombre: `ya_transferido` (la columna «ADELANTO BANCO» de JORNALES). `yaTransferido` alimenta `pagadoBanco`
//    y se resta del efectivo. Corregir = mover el importe de `adelanto` a `ya_transferido` POR OVERRIDE
//    (`liquidacion_linea.ya_transferido_manual` / `adelanto_manual`), NO tocando el Sheet.
//
// B) EN BILLETES → el dato de hoy ya es correcto y el defecto es otro: el extracto muestra lotes de haberes que
//    la planilla no anotó como BANCO. Ese caso NO lo arregla este módulo.
//
// ═══ LA EVIDENCIA QUE HABILITA EL ESCENARIO A EN UNA QUINCENA ═══
//
// Para cada quincena con BANCO vacío se mira el extracto en la ventana de pago (del último día del bloque a
// ocho días después) y se buscan salidas que CUADREN con el adelanto de cada persona (±1 %):
//
//   FUERTE  una transferencia cuyo concepto lleva el CUIL o el nombre de la persona, por ese importe;
//   DÉBIL   una línea de un lote de haberes por ese importe exacto, sin nombre (el extracto no itemiza quién).
//
// El veredicto de la quincena es «sí» sólo si TODAS las personas con adelanto tienen un apareo (fuerte o débil
// único); «parcial» si alguna; «no» si ninguna; «sin extracto» si la ventana cae antes del primer movimiento
// importado. SÓLO «sí» habilita `--aplicar` sin la palabra del dueño.
//
// ═══ DÓNDE ESCRIBE, Y POR QUÉ AHÍ ═══
//
// En `liquidacion_linea.ya_transferido_manual` y `.adelanto_manual`, NO en `jornales_bloque_persona`:
//   1. `jornales_bloque_persona` es el ESPEJO del Sheet: la próxima corrida de `jornales-espejo-bloques.mjs` lo
//      pisaría y la corrección se evaporaría sin aviso.
//   2. Las columnas `*_manual` son nullable a propósito: un 0 ahí significa «alguien escribió cero», distinto de
//      «no hay override». Las columnas sin sufijo nacieron NOT NULL DEFAULT 0 y no pueden decir eso.
//   3. La precedencia `manual > JORNALES > calculado` ya está construida y probada (`liquidacionOverrides.ts`).
//
// ═══ EL JOIN: EL BLOQUE PERTENECE A LA QUINCENA DONDE EMPIEZA, NO A LA DE FECHAS IGUALES ═══
//
// El bloque de JORNALES lleva las fechas REALES que el dueño escribió en el encabezado (02/02..14/02,
// 02/03..14/03, 18/05..30/05, 04/05..16/05) y la liquidación usa la quincena calendario (01/02..15/02,
// 01/03..15/03, 16/05..31/05, 01/05..15/05). El primer ensayo hizo `b.quincena_desde = lq.desde` y perdió tres
// quincenas; la contención (`b.hasta <= lq.hasta`) perdía la de 04/05..16/05. La regla es el PRIMER DÍA:
// `lq.desde <= b.desde <= lq.hasta`, mismo grupo. `getEspejoDeLaPlanilla` (la app) usa la misma regla desde
// el 17/09/2026: antes pedía igualdad exacta y en 8 de 32 bloques de 2026 no veía JORNALES.
//
// ═══ LA REVERSA ═══
//
// Antes de escribir se guarda, línea por línea, el valor PREVIO de las dos columnas. `revertirQuincena`
// restaura ese valor sólo si la línea sigue con lo que este módulo escribió: si alguien la tocó después, no
// se pisa y se avisa. La reversa se prueba en `jornales-banco-adelanto.pg.test.mjs` dentro de una
// transacción con rollback, contra la base real, sin dejar rastro.
//
// NO TOCA NINGÚN GOOGLE SHEET. Hay freno explícito del dueño sobre escrituras a Sheets.

const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fecha = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10))

/** Días después del último día del bloque en los que se busca el pago. El lote suele salir 1–3 días después. */
export const VENTANA_DE_PAGO_DIAS = 8
/** Tolerancia del apareo de importes: ±1 %. */
export const TOLERANCIA = 0.01

/**
 * LOS BLOQUES AFECTADOS — los define el DATO, no una lista escrita a mano.
 *
 * Criterio: un bloque de JORNALES donde NINGUNA fila tiene BANCO (todas NULL). Un bloque con BANCO parcial NO
 * entra: ahí la planilla sí midió el canal y decidió que esas filas no llevaban banco; pisarlo sería reemplazar
 * un dato por una suposición. Es la diferencia entre «no lo midió nadie» y «lo midió y dio cero».
 */
export const SQL_BLOQUES_SIN_BANCO = `
  select b.pestana, b.bloque_fila1,
         min(b.quincena_desde)::date bloque_desde, max(b.quincena_hasta)::date bloque_hasta,
         case when b.pestana like 'Obreros%' then 'obreros' else 'oficina' end grupo,
         count(*) filas,
         sum(coalesce(b.adelanto, 0)) adelanto,
         count(*) filter (where b.persona_id is null and coalesce(b.adelanto, 0) <> 0) sin_persona
    from public.jornales_bloque_persona b
   where b.quincena_desde >= $1::date
   group by b.pestana, b.bloque_fila1
  having count(*) filter (where b.por_banco is not null) = 0
   order by 3, 5`

/** La quincena de la liquidación donde EMPIEZA el bloque, del mismo grupo. */
export const SQL_QUINCENA_DEL_BLOQUE = `
  select lq.id, lq.desde::date desde, lq.hasta::date hasta, lq.grupo, lq.estado
    from public.liquidacion_quincena lq
   where lq.grupo = $2 and lq.desde <= $1::date and $1::date <= lq.hasta
   order by lq.desde limit 1`

/** Las líneas de esa liquidación cruzadas con las filas del bloque que tienen adelanto. */
export const SQL_LINEAS = `
  select l.id linea_id, l.persona_id, p.nombre_completo, p.legajo, p.cuil,
         l.adelanto, l.adelanto_manual, l.ya_transferido, l.ya_transferido_manual, l.pagada_en,
         b.adelanto planilla_adelanto, b.nombre_planilla
    from (select persona_id, min(nombre_planilla) nombre_planilla, sum(coalesce(adelanto, 0)) adelanto
            from public.jornales_bloque_persona
           where pestana = $2 and bloque_fila1 = $3 and persona_id is not null
           group by persona_id) b
    join public.liquidacion_linea l on l.liquidacion_id = $1 and l.persona_id = b.persona_id
    join public.personas p on p.id = l.persona_id
   where b.adelanto <> 0
   order by p.nombre_completo`

/** Las filas del bloque con adelanto y SIN persona resuelta: no tienen línea que corregir y se informan. */
export const SQL_SIN_PERSONA = `
  select nombre_planilla, sum(coalesce(adelanto, 0)) adelanto
    from public.jornales_bloque_persona
   where pestana = $1 and bloque_fila1 = $2 and persona_id is null and coalesce(adelanto, 0) <> 0
   group by nombre_planilla order by 1`

/** ¿El bloque pertenece a la quincena? Sí cuando su primer día cae adentro. Puro, para probar el criterio sin base. */
export function bloquePerteneceA(q, bloque) {
  return fecha(q.desde) <= fecha(bloque.desde) && fecha(bloque.desde) <= fecha(q.hasta)
}

/** Una línea se puede tocar sólo si nadie la pagó ni la escribió a mano: ahí manda la persona. */
export function lineaBloqueada(l) {
  return l.pagada_en != null || l.ya_transferido_manual != null || l.adelanto_manual != null
}

/**
 * EL PLAN: qué cambiaría, quincena por quincena. Sólo lectura.
 *
 * `query(sql, params) → { rows }` es el port de `db.mjs`; se inyecta para poder correrlo dentro de una
 * transacción de prueba.
 */
export async function planDeCorreccion(query, { desde = '2026-01-01' } = {}) {
  const { rows: bloques } = await query(SQL_BLOQUES_SIN_BANCO, [desde])
  const plan = []
  const sinQuincena = []
  for (const b of bloques) {
    if (Number(b.adelanto) === 0) continue
    const { rows: [lq] } = await query(SQL_QUINCENA_DEL_BLOQUE, [b.bloque_desde, b.grupo])
    if (!lq) { sinQuincena.push({ pestana: b.pestana, bloque: `${fecha(b.bloque_desde)}..${fecha(b.bloque_hasta)}`, adelanto: Number(b.adelanto) }); continue }
    const { rows: lineas } = await query(SQL_LINEAS, [lq.id, b.pestana, b.bloque_fila1])
    const { rows: sinPersona } = await query(SQL_SIN_PERSONA, [b.pestana, b.bloque_fila1])
    const mueve = lineas.map((l) => ({ ...l, planilla_adelanto: Number(l.planilla_adelanto) }))
    plan.push({
      liquidacionId: lq.id,
      desde: fecha(lq.desde), hasta: fecha(lq.hasta), grupo: lq.grupo, estado: lq.estado,
      bloque: { pestana: b.pestana, fila1: Number(b.bloque_fila1), desde: fecha(b.bloque_desde), hasta: fecha(b.bloque_hasta), filas: Number(b.filas) },
      empleados: mueve.length,
      pesos: redondear2(mueve.reduce((a, l) => a + l.planilla_adelanto, 0)),
      bloqueadas: mueve.filter(lineaBloqueada),
      sinPersona: sinPersona.map((s) => ({ nombre: s.nombre_planilla, adelanto: Number(s.adelanto) })),
      lineas: mueve,
    })
  }
  return { plan, sinQuincena }
}

// ── LA EVIDENCIA BANCARIA ─────────────────────────────────────────────────────────────────────

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const digitos = (s) => String(s ?? '').replace(/\D/g, '')
const cuadra = (importe, esperado) => esperado > 0 && Math.abs(importe - esperado) <= esperado * TOLERANCIA

/** ¿El concepto nombra a la persona? Por CUIL (sólo dígitos) o por dos palabras de su nombre. */
export function conceptoNombraA(concepto, persona) {
  const c = sinTildes(concepto)
  const cuil = digitos(persona.cuil)
  if (cuil.length === 11 && c.includes(cuil)) return true
  const palabras = sinTildes(persona.nombre_completo).split(/\s+/).filter((w) => w.length >= 3)
  return palabras.length >= 2 && palabras.filter((w) => c.includes(w)).length >= 2
}

export const esLoteDeHaberes = (concepto) => /haber/i.test(String(concepto ?? ''))
export const esTransferencia = (concepto) => /transferencia|debito transf/i.test(String(concepto ?? ''))

/**
 * EL APAREO, PURO: para cada línea con adelanto, qué salida del extracto cuadra con ese importe.
 *
 * `movimientos`: salidas (`importe < 0`) de la ventana de pago. Devuelve por línea el apareo más fuerte, y el
 * veredicto de la quincena. Un movimiento se usa una sola vez (el mismo giro no paga a dos personas).
 */
export function aparearAdelantos(lineas, movimientos) {
  const usados = new Set()
  const salidas = movimientos.filter((m) => Number(m.importe) < 0).map((m) => ({ ...m, monto: -Number(m.importe) }))
  const apareos = lineas.map((l) => {
    const esperado = Number(l.planilla_adelanto)
    const fuerte = salidas.find((m) => !usados.has(m.id) && esTransferencia(m.concepto) && cuadra(m.monto, esperado) && conceptoNombraA(m.concepto, l))
    if (fuerte) { usados.add(fuerte.id); return { linea: l, tipo: 'fuerte', movimiento: fuerte } }
    const debiles = salidas.filter((m) => !usados.has(m.id) && esLoteDeHaberes(m.concepto) && cuadra(m.monto, esperado))
    if (debiles.length === 1) { usados.add(debiles[0].id); return { linea: l, tipo: 'debil', movimiento: debiles[0] } }
    if (debiles.length > 1) return { linea: l, tipo: 'ambiguo', candidatos: debiles.length }
    return { linea: l, tipo: 'ninguno' }
  })
  const apareadas = apareos.filter((a) => a.tipo === 'fuerte' || a.tipo === 'debil').length
  const veredicto = lineas.length === 0 ? 'no' : apareadas === lineas.length ? 'si' : apareadas > 0 ? 'parcial' : 'no'
  return { apareos, apareadas, veredicto }
}

/** La ventana de pago de una quincena: del último día del bloque a `VENTANA_DE_PAGO_DIAS` después. */
export function ventanaDePago(q) {
  const d0 = new Date(`${fecha(q.bloque?.hasta ?? q.hasta)}T00:00:00Z`)
  const d1 = new Date(d0); d1.setUTCDate(d1.getUTCDate() + VENTANA_DE_PAGO_DIAS)
  return { desde: d0.toISOString().slice(0, 10), hasta: d1.toISOString().slice(0, 10) }
}

/**
 * LA EVIDENCIA DE UNA QUINCENA CONTRA EL EXTRACTO. Sólo lectura.
 *
 * `sin-extracto` cuando la ventana termina antes del primer movimiento importado: ahí no se puede afirmar
 * ni negar nada. Lo demás lo decide `aparearAdelantos`. Devuelve también los lotes de haberes de la ventana:
 * son plata que salió por banco aunque no cuadre con ningún adelanto, y el informe tiene que decirlo.
 */
export async function evidenciaBancaria(query, q) {
  const { rows: [{ primero }] } = await query('select min(fecha)::date primero from public.banco_movimientos')
  const ventana = ventanaDePago(q)
  if (!primero || ventana.hasta < fecha(primero)) {
    return { veredicto: 'sin-extracto', ventana, extractoDesde: primero ? fecha(primero) : null, apareos: [], apareadas: 0, lotesHaberes: [] }
  }
  const { rows: movimientos } = await query(
    `select id, fecha::date fecha, importe, concepto from public.banco_movimientos
      where importe < 0 and fecha between $1::date and $2::date order by fecha, id`,
    [ventana.desde, ventana.hasta])
  const r = aparearAdelantos(q.lineas, movimientos)
  const lotesHaberes = movimientos.filter((m) => esLoteDeHaberes(m.concepto))
    .map((m) => ({ fecha: fecha(m.fecha), importe: -Number(m.importe), concepto: m.concepto }))
  return { ...r, ventana, extractoDesde: fecha(primero), lotesHaberes, totalHaberes: redondear2(lotesHaberes.reduce((a, m) => a + m.importe, 0)) }
}

// ── LA ESCRITURA, Y SU REVERSA ────────────────────────────────────────────────────────────────

/** Lo que se escribe en cada línea del escenario A. */
export const valoresDelEscenarioA = (l) => ({ ya_transferido_manual: redondear2(l.planilla_adelanto), adelanto_manual: 0 })

/**
 * APLICA EL ESCENARIO A EN UNA QUINCENA, dentro de la transacción `tx` (`tx.query`). Devuelve la reversa.
 *
 * Primero se lee y se bloquea cada línea (`for update`) y se guarda su valor previo; después se escribe, y sólo
 * si la línea sigue sin pagar y sin override. `motivo` queda en la reversa para que quien la mire sepa por qué
 * se escribió (la evidencia bancaria, o la palabra del dueño).
 */
export async function aplicarQuincena(tx, q, { motivo, cuando = new Date().toISOString() }) {
  const reversa = { cuando, motivo, liquidacionId: q.liquidacionId, desde: q.desde, hasta: q.hasta, grupo: q.grupo, lineas: [] }
  const noEscritas = []
  for (const l of q.lineas) {
    const { rows: [previa] } = await tx.query(
      `select id, adelanto_manual, ya_transferido_manual, pagada_en from public.liquidacion_linea where id = $1 for update`,
      [l.linea_id])
    if (!previa) { noEscritas.push({ linea: l, motivo: 'la línea ya no existe' }); continue }
    if (lineaBloqueada(previa)) { noEscritas.push({ linea: l, motivo: previa.pagada_en ? 'pagada' : 'ya escrita a mano' }); continue }
    const nuevo = valoresDelEscenarioA(l)
    const { rowCount } = await tx.query(
      `update public.liquidacion_linea
          set ya_transferido_manual = $2::numeric, adelanto_manual = $3::numeric, actualizado_en = now()
        where id = $1`,
      [l.linea_id, nuevo.ya_transferido_manual, nuevo.adelanto_manual])
    if (rowCount !== 1) { noEscritas.push({ linea: l, motivo: 'la base no la actualizó' }); continue }
    reversa.lineas.push({
      lineaId: l.linea_id, personaId: l.persona_id, nombre: l.nombre_completo,
      previo: { ya_transferido_manual: previa.ya_transferido_manual, adelanto_manual: previa.adelanto_manual },
      escrito: nuevo,
    })
  }
  return { reversa, noEscritas }
}

const mismoNumero = (a, b) => (a == null && b == null) || (a != null && b != null && redondear2(a) === redondear2(b))

/**
 * DESHACE lo que `aplicarQuincena` escribió, dentro de `tx`. Restaura el valor PREVIO de cada línea sólo si la
 * línea sigue con lo ESCRITO por este módulo: si alguien la cambió después, no se pisa y se avisa.
 */
export async function revertirQuincena(tx, reversa) {
  const restauradas = []
  const noRestauradas = []
  for (const r of reversa.lineas) {
    const { rows: [actual] } = await tx.query(
      `select id, adelanto_manual, ya_transferido_manual from public.liquidacion_linea where id = $1 for update`, [r.lineaId])
    if (!actual) { noRestauradas.push({ ...r, motivo: 'la línea ya no existe' }); continue }
    if (!mismoNumero(actual.ya_transferido_manual, r.escrito.ya_transferido_manual)
      || !mismoNumero(actual.adelanto_manual, r.escrito.adelanto_manual)) {
      noRestauradas.push({ ...r, motivo: `cambió después: hoy ya_transferido_manual=${actual.ya_transferido_manual} adelanto_manual=${actual.adelanto_manual}` })
      continue
    }
    await tx.query(
      `update public.liquidacion_linea
          set ya_transferido_manual = $2::numeric, adelanto_manual = $3::numeric, actualizado_en = now()
        where id = $1`,
      [r.lineaId, r.previo.ya_transferido_manual, r.previo.adelanto_manual])
    restauradas.push(r)
  }
  return { restauradas, noRestauradas }
}

/** LA EVIDENCIA ES LO LEÍDO EN LA BASE, no el rowCount: se vuelve a consultar después de escribir. */
export async function leerLineas(query, lineaIds) {
  if (!lineaIds.length) return []
  const { rows } = await query(
    `select l.id linea_id, p.nombre_completo, l.adelanto, l.adelanto_manual, l.ya_transferido, l.ya_transferido_manual
       from public.liquidacion_linea l join public.personas p on p.id = l.persona_id
      where l.id = any($1::uuid[]) order by p.nombre_completo`, [lineaIds])
  return rows
}
