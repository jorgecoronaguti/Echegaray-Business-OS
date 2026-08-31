// LA POLÍTICA VERSIONADA CONTRA LA BASE REAL, Y COMO `authenticated`.
//
// ═══ POR QUÉ NO ALCANZA CON PROBAR EL MÓDULO PURO ═══
//
// `politica-version.mjs` puede exigir todo lo que quiera: `pg.mjs` escribe con el pool del servidor,
// que NO pasa por RLS. Si la base no lo hace cumplir, los permisos viven sólo en JavaScript y
// cualquier PATCH de PostgREST los saltea — que es exactamente lo que encontró la auditoría del
// 29/08, cuando un rol `administracion` reescribió el margen objetivo a 99.
//
// Acá se abre una transacción, se hace `set local role authenticated` con un JWT real, se intenta
// escribir y se mira si la fila quedó. Todo adentro de un `begin`/`rollback`: la base queda igual.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { ESTADO } from './contrato.mjs'
import { leerVersionDePolitica, leerCatalogoDePoliticas, leerPoliticaDeCotizacion, leerEstructuraIndirecta, leerVigenciaDeSubcontratos } from './politica-pg.mjs'
import { politicaEfectiva, proyectarACascada, resolverReferencia, referenciaDePolitica, cumpleMargenObjetivo } from './politica-version.mjs'
import { indirectoCalculado } from './indirectos.mjs'
import { cascada } from './comercial.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('cotizador · la política versionada en la base', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  const query = (sql, params) => c.query(sql, params)
  const UID = {}

  const como = async (uid) => {
    await c.query('reset role')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    await c.query('set local role authenticated')
  }
  const comoDios = async () => { await c.query('reset role') }

  /** Un intento que TIENE que fallar, sin llevarse la transacción puesta: una violación de RLS
   *  aborta todo lo que venga después y los tests siguientes fallarían por un motivo prestado. */
  const rechaza = async (sql, params, re, mensaje) => {
    await c.query('savepoint intento')
    let error = null
    try { await c.query(sql, params) } catch (e) { error = e }
    if (error) await c.query('rollback to savepoint intento')
    else await c.query('release savepoint intento')
    assert.ok(error, mensaje ?? `la base ACEPTÓ lo que tenía que rechazar: ${String(sql).slice(0, 90)}`)
    if (re) assert.match(String(error.message), re, `rechazó por el motivo equivocado: ${error.message}`)
  }

  /** Una escritura que la policy deja pasar sin filas afectadas: RLS no tira, simplemente no toca
   *  nada. Un UPDATE que no actualiza NADA se ve igual que uno exitoso desde el cliente. */
  const noTocaNada = async (sql, params, mensaje) => {
    const r = await c.query(sql, params)
    assert.equal(r.rowCount, 0, mensaje ?? 'la policy dejó pasar una escritura que tenía que bloquear')
  }

  try {
    await c.query('begin')

    const dir = await uno(`select id from public.perfiles where rol='direccion' order by id limit 1`)
    const jefes = await q(`select id from public.perfiles where rol='jefe_obra' order by id limit 2`)
    assert.ok(dir && jefes.length >= 2, 'el fixture necesita 1 dirección y 2 jefe_obra reales')
    UID.direccion = dir.id
    UID.jefe = jefes[0].id
    UID.administracion = jefes[1].id
    await q(`update public.perfiles set rol='administracion' where id=$1`, [UID.administracion])

    // ── 1 · LO SEMBRADO ES LO QUE LA EMPRESA YA USA ─────────────────────────────────────────
    await t.test('la v1 sembrada son los ocho porcentajes con los que la empresa ya cotiza', async () => {
      const v = await leerVersionDePolitica({ query })
      assert.equal(v.version, 1)
      assert.equal(v.estado, 'PUBLICADA')
      const pc = await uno(`select * from public.parametro_comercial where vigente`)
      assert.equal(v.porClave.pctBeneficio.valor, Number(pc.pct_beneficio))
      assert.equal(v.porClave.pctIva.valor, Number(pc.pct_iva))
      assert.equal(v.porClave.pctIva.normativo, true, 'el IVA es lo único normativo de la cascada')
      // Riesgo y contingencia en NULL, que NO es cero: el libro no los tiene.
      assert.equal(v.porClave.pctRiesgo.valor, null)
      assert.equal(v.porClave.pctRiesgo.estado, ESTADO.FALTA_DATO)
      assert.equal(v.porClave.pctContingencia.valor, null)
    })

    await t.test('el 17 vs 12 sigue en CONFLICTO en la base y el motor NO juzga con él', async () => {
      const v = await leerVersionDePolitica({ query })
      const m = v.porClave.margenObjetivoPct
      assert.equal(m.valor, null, 'elegir uno fabricaría una regla que la empresa no decidió')
      assert.equal(m.estado, ESTADO.CONFLICTO)
      assert.match(m.conflicto, /17 %/)
      assert.match(m.conflicto, /12 %/)
      const r = cumpleMargenObjetivo({ version: v, margenLogrado: 0.1554 })
      assert.equal(r.estado, ESTADO.CONFLICTO)
      assert.equal(r.cumple, null)
    })

    await t.test('la proyección a la cascada da el coeficiente real de la empresa', async () => {
      const v = await leerVersionDePolitica({ query })
      const proy = proyectarACascada({ efectiva: politicaEfectiva({ version: v }), pctGastosGenerales: 0.27 })
      assert.equal(proy.estado, ESTADO.CALCULADO)
      const cc = cascada({ costoDirecto: 100_000_000, politica: proy.politica })
      assert.equal(cc.coeficienteSinIva, 1.681968)
      // Y da lo MISMO que la vista SQL con los mismos porcentajes: dos definiciones que no divergen.
      const sql = await uno(
        `select round((1 + $1::numeric) * ((1 + $2::numeric) * (1 + $3::numeric + $4::numeric) + $5::numeric * $6::numeric) * (1 + $7::numeric), 6) as coef`,
        [0.27, 0.22, 0.024, 0.02, 0.07, 0.5, 0.012])
      assert.equal(Number(sql.coef), cc.coeficienteSinIva, 'el motor y la base no pueden dar dos coeficientes')
    })

    // ── 2 · LA ESTRUCTURA DE INDIRECTOS ─────────────────────────────────────────────────────
    await t.test('el catálogo de indirectos son conceptos REALES sin montos inventados', async () => {
      const e = await leerEstructuraIndirecta({ query })
      assert.ok(e.conceptos.length >= 14)
      assert.equal(e.costoDirectoAnual, null, 'el denominador no se conoce: ponerle un número sería fabricar la base del precio')
      assert.ok(e.conceptos.every((x) => /hoja GG/.test(x.fuente)), 'cada concepto cita su celda del libro')
      const calc = indirectoCalculado({ estructura: e, costoDirectoObra: 100_000_000 })
      assert.equal(calc.pct, null, 'sin montos el indirecto NO es cero: es desconocido')
      assert.equal(calc.estado, ESTADO.FALTA_DATO)
      assert.equal(calc.nHuecos, e.conceptos.length)
      // Y el precio NO se calcula sobre un indirecto desconocido.
      const v = await leerVersionDePolitica({ query })
      const proy = proyectarACascada({ efectiva: politicaEfectiva({ version: v }), pctGastosGenerales: calc.pct })
      assert.equal(proy.politica, null)
      assert.match(proy.porQue, /NO es cero/)
    })

    await t.test('un concepto no puede traer el valor en el campo de otra base', async () => {
      const e = await uno(`select id from public.indirecto_estructura where vigente`)
      await rechaza(
        `insert into public.indirecto_concepto (estructura_id, version, concepto, base, bloque, monto_anual, pct, fuente)
         values ($1, 99, 'ZZ mal declarado', 'PCT_COSTO_DIRECTO', 'EMPRESA', 1000, 0.02, 'test')`,
        [e.id], /valor_en_su_campo/)
    })

    await t.test('un concepto sin monto YA se puede declarar: el NOT NULL obligaba a mentir un 0', async () => {
      const e = await uno(`select id from public.indirecto_estructura where vigente`)
      const f = await uno(
        `insert into public.indirecto_concepto (estructura_id, version, concepto, base, bloque, monto_anual, fuente)
         values ($1, 98, 'ZZ seguros de obra', 'PRORRATEO_ANUAL', 'EMPRESA', null, 'test') returning monto_anual`, [e.id])
      assert.equal(f.monto_anual, null, 'NULL es el hueco; 0 sería la decisión de no gastarlo')
      await q(`delete from public.indirecto_concepto where concepto='ZZ seguros de obra'`)
    })

    // ── 3 · LOS PERMISOS: EL TEST NEGATIVO ──────────────────────────────────────────────────
    await t.test('quien NO tiene GLOBAL_POLICY_WRITE no publica una versión de política', async () => {
      // `administracion` TIENE ve_economia() y COMMERCIAL_WRITE. No alcanza — y ese es todo el punto:
      // el portero anterior era `ve_economia()` a secas y por ahí entró la auditoría del 29/08.
      await como(UID.administracion)
      assert.equal((await q(`select public.ve_economia() as v`))[0].v, true, 'administración SÍ ve lo económico')
      assert.equal((await q(`select public.cot_permiso('COMMERCIAL_WRITE') as v`))[0].v, true)
      assert.equal((await q(`select public.cot_permiso('GLOBAL_POLICY_WRITE') as v`))[0].v, false)
      await rechaza(
        `insert into public.politica_comercial_version (version, estado, fuente, publicada_por_declarado)
         values (91, 'PUBLICADA', 'intento de administración', 'administración')`, [], /row-level security/)
      // Y tampoco puede meterle un componente a una versión existente.
      const v1 = await uno(`select id from public.politica_comercial_version where version = 1`)
      await rechaza(
        `insert into public.politica_comercial_componente (politica_version_id, concepto, clave, valor, fuente)
         values ($1, 'BENEFICIO', 'ZZ pctFalso', 0.99, 'intento')`, [v1.id], /row-level security/)
      await comoDios()
      // MUTACIÓN CORRIDA: en la migración, volver la policy de alta a `using (ve_economia())` sin el
      //   `cot_permiso('GLOBAL_POLICY_WRITE')`. FALLA: «la base ACEPTÓ lo que tenía que rechazar».
    })

    await t.test('el jefe de obra no ve NI puede tocar la política comercial', async () => {
      await como(UID.jefe)
      assert.equal((await q(`select public.ve_economia() as v`))[0].v, false)
      assert.equal((await q(`select count(*)::int n from public.politica_comercial_version`))[0].n, 0,
        'la policy de lectura lo deja ver CERO filas: no hay 404 que le cuente que existen')
      assert.equal((await q(`select count(*)::int n from public.politica_comercial_componente`))[0].n, 0)
      await comoDios()
    })

    await t.test('una versión PUBLICADA es INMUTABLE, incluso para Dirección', async () => {
      await como(UID.direccion)
      assert.equal((await q(`select public.cot_permiso('GLOBAL_POLICY_WRITE') as v`))[0].v, true, 'Dirección SÍ tiene el permiso')
      // Y aun así no puede editarla: para cambiarla se crea la siguiente versión.
      await noTocaNada(
        `update public.politica_comercial_version set fuente = 'reescrita' where version = 1`, [],
        'una versión publicada se dejó editar: entonces «la cotización referencia la v1» no garantiza nada')
      await noTocaNada(
        `update public.politica_comercial_componente set valor = 0.99
          where clave = 'pctBeneficio' and politica_version_id = (select id from public.politica_comercial_version where version = 1)`, [],
        'el beneficio de una política publicada se dejó reescribir')
      // Lo que SÍ puede: crear la versión siguiente.
      const nueva = await uno(
        `insert into public.politica_comercial_version (version, estado, fuente)
         values (92, 'BORRADOR', 'ZZ propuesta de Dirección') returning id, estado`)
      assert.equal(nueva.estado, 'BORRADOR')
      // Y un BORRADOR sí se edita, hasta que se publica.
      const tocada = await c.query(`update public.politica_comercial_version set fuente='ZZ corregida' where id=$1`, [nueva.id])
      assert.equal(tocada.rowCount, 1)
      await comoDios()
      await q(`delete from public.politica_comercial_version where version = 92`)
      // MUTACIÓN CORRIDA: sacar `and estado = 'BORRADOR'` del `using` de politica_version_edicion →
      //   el UPDATE toca 1 fila. FALLA: «una versión publicada se dejó editar: 1 !== 0».
    })

    await t.test('un override necesita motivo, evidencia y no se puede firmar por otro', async () => {
      const cot = await uno(`select id from public.cotizaciones order by fecha_cotizacion, id limit 1`)
      await como(UID.administracion)
      // Sin motivo: lo rechaza el NOT NULL, no una convención de JavaScript.
      await rechaza(
        `insert into public.cotizacion_politica_override (cotizacion_id, clave, valor, evidencia)
         values ($1, 'pctBeneficio', 0.19, 'mail del 28/08')`, [cot.id], /motivo/)
      // Con motivo vacío: lo rechaza el CHECK.
      await rechaza(
        `insert into public.cotizacion_politica_override (cotizacion_id, clave, valor, motivo, evidencia)
         values ($1, 'pctBeneficio', 0.19, '   ', 'mail del 28/08')`, [cot.id], /check|motivo/)
      // Firmando por otro: lo rechaza la policy.
      await rechaza(
        `insert into public.cotizacion_politica_override (cotizacion_id, clave, valor, autorizado_por, motivo, evidencia)
         values ($1, 'pctBeneficio', 0.19, $2, 'cliente recurrente', 'mail del 28/08')`,
        [cot.id, UID.direccion], /row-level security/)
      // El IVA es normativo: lo rechaza el trigger, aunque venga completo y bien firmado.
      await rechaza(
        `insert into public.cotizacion_politica_override (cotizacion_id, clave, valor, motivo, evidencia)
         values ($1, 'pctIva', 0.105, 'obra de vivienda', 'consulta al contador')`, [cot.id], /NORMATIVO/)
      // Completo y firmado por sí mismo: entra.
      const ok = await uno(
        `insert into public.cotizacion_politica_override (cotizacion_id, clave, valor, motivo, evidencia)
         values ($1, 'pctBeneficio', 0.19, 'cliente recurrente, tercera obra del año', 'mail 28/08 · hilo «ajuste»')
         returning clave, valor, autorizado_por`, [cot.id])
      assert.equal(Number(ok.valor), 0.19)
      assert.equal(ok.autorizado_por, UID.administracion)
      await comoDios()

      // Y el motor lo lee y lo aplica sobre la versión REFERENCIADA, dejando el anterior a la vista.
      await q(`insert into public.cotizacion_politica_ref (cotizacion_id, politica_version_id, version)
               select $1, id, version from public.politica_comercial_version where version = 1`, [cot.id])
      const { referencia, overrides } = await leerPoliticaDeCotizacion({ query }, cot.id)
      assert.equal(referencia.version, 1)
      const catalogo = await leerCatalogoDePoliticas({ query })
      const res = resolverReferencia(referencia, catalogo)
      assert.equal(res.ok, true)
      const ef = politicaEfectiva({ version: res.version, overrides })
      assert.equal(ef.valores.pctBeneficio, 0.19)
      assert.equal(ef.aplicados[0].valorAnterior, 0.22)
      assert.equal(ef.aplicados[0].motivo, 'cliente recurrente, tercera obra del año')
      assert.equal(ef.versionReferenciada, 1, 'un override de cotización NO crea una versión de la política de la empresa')
    })

    await t.test('el indirecto aplicado no puede diferir del calculado sin los cuatro datos', async () => {
      const cot = await uno(`select id from public.cotizaciones order by fecha_cotizacion, id limit 1`)
      await como(UID.administracion)
      await rechaza(
        `insert into public.cotizacion_indirecto (cotizacion_id, pct_calculado, pct_aplicado)
         values ($1, 0.0715, 0.27)`, [cot.id], /aplicado_explicado/)
      await rechaza(
        `insert into public.cotizacion_indirecto (cotizacion_id, pct_calculado, pct_aplicado, override_actor, override_motivo)
         values ($1, 0.0715, 0.27, $2, 'redondeo del libro')`, [cot.id, UID.administracion], /override_completo/)
      const ok = await uno(
        `insert into public.cotizacion_indirecto (cotizacion_id, pct_calculado, pct_aplicado, override_actor, override_motivo, override_evidencia, override_fecha)
         values ($1, 0.0715, 0.27, $2, 'la estructura explica 7,15 % y la empresa cotiza 27 %', 'parametro_comercial v1', current_date)
         returning pct_calculado, pct_aplicado`, [cot.id, UID.administracion])
      assert.notEqual(Number(ok.pct_calculado), Number(ok.pct_aplicado), 'los dos números viven: el calculado no se pierde')
      await comoDios()
      // MUTACIÓN CORRIDA: quitar el CHECK `indirecto_aplicado_explicado` de la migración → el primer
      //   insert entra. FALLA: «la base ACEPTÓ lo que tenía que rechazar».
    })

    await t.test('la vigencia de subcontratos sale de la base y hoy sólo tiene el corte GENERAL', async () => {
      const tabla = await leerVigenciaDeSubcontratos({ query })
      assert.equal(tabla.GENERAL, 180)
      assert.equal(Object.keys(tabla).length, 1, 'los defaults POR TIPO no están medidos: sembrarlos sería inventarlos')
      // Un jefe de obra SÍ puede leerla —necesita saber si la oferta del sub todavía vale— y NO
      // puede escribirla.
      await como(UID.jefe)
      assert.equal((await q(`select count(*)::int n from public.subcontrato_vigencia_default`))[0].n, 1)
      await rechaza(
        `insert into public.subcontrato_vigencia_default (tipo, dias, fuente) values ('SANITARIA', 15, 'inventado')`,
        [], /row-level security/)
      await comoDios()
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
