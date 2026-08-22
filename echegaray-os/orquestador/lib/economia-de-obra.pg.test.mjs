// EL PANEL ECONÓMICO DE LA OBRA, CONTRA LA BASE REAL — frente 4.5 de la auditoría E2E.
//
// Lo que se prueba es que el sistema NO conteste un número donde no tiene con qué:
//
//   1 · `margen_actual` (contratado − costo real) NO EXISTE. Si alguien revierte la migración, el
//       primer subtest se pone rojo. Es el defecto textual: quattropani publicaba $64.713.000 de
//       «margen» con tres facturas de materiales imputadas y 1 hora registrada.
//   2 · Sin presupuesto y sin forecast, `margen_cotizado` y `margen_final_proyectado` son NULL —y en
//       ninguna columna aparece la resta vieja disfrazada.
//   3 · Con presupuesto aparece el margen COTIZADO y sólo ése; el proyectado sigue NULL.
//   4 · Un adicional APROBADO suma a la venta; uno cotizado y no aprobado, no.
//   5 · El costo comprometido es NULL y dice por qué —y hay un cable trampa por si mañana el modelo
//       gana la columna que hoy no tiene.
//   6 · La cobranza sale de `cobranzas`, no de la tabla `certificados` vacía; una fila «Cobrado» con
//       fecha futura no se cuenta como cobrada; una obra sin cobranzas publica NULL, no 0.
//   7 · Una compra con obra conocida NO está «sin imputar», y una de Estructura tampoco.
//
// Las migraciones se aplican DENTRO de la transacción y todo termina en ROLLBACK: no queda una fila
// ni una vista modificada en la base. Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations')
const MIGRACIONES = [
  '20260822T6200_la_cobranza_de_la_obra_sale_de_cobranzas.sql',
  '20260822T6210_el_margen_no_es_la_venta_menos_lo_gastado.sql',
  '20260822T6220_una_compra_con_obra_no_esta_sin_imputar.sql',
].map((f) => readFileSync(join(dir, f), 'utf8'))

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const OBRA = 'zz-test-economia'
const OTRA = 'zz-test-economia-vacia'
// Los números del caso real: contrato de quattropani y las tres facturas de Alumetal.
const CONTRATO = 97650000
const COSTO = 32937000
const FALSO_MARGEN = CONTRATO - COSTO // 64.713.000 — el número que la ficha llamaba «MARGEN ACTUAL»

test('la economía de la obra, contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  /** La fila de `obra_economia` de la obra de prueba, leída COMO DIRECCIÓN. */
  const eco = (obra = OBRA) => uno(`select * from obra_economia where obra_id=$1`, [obra])
  const num = (v) => (v === null || v === undefined ? null : Number(v))

  try {
    await c.query('begin')
    for (const sql of MIGRACIONES) await c.query(sql)

    const direccion = await uno(`select id from perfiles where rol='direccion' limit 1`)
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la economía')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: direccion.id, role: 'authenticated' }),
    ])
    assert.equal((await uno(`select ve_economia() x`)).x, true, 'la sesión de prueba no ve economía')

    // ── el mundo de prueba ───────────────────────────────────────────────────────────────────
    await q(`insert into obra_canonica (id, nombre, monto_contratado) values ($1,'ZZ Economía',$2), ($3,'ZZ Vacía', null)`,
      [OBRA, CONTRATO, OTRA])
    await q(`insert into obra_alias (alias, obra_id, clasificacion) values
             ('zz economia', $1, 'obra'),
             ('zz estructura', null, 'indirecto')`, [OBRA])
    // Tres facturas de MATERIALES (area 'obras'), ni una hora: el caso real.
    await q(`insert into costos_obra (obra_texto, area, total, origen) values
             ('ZZ Economía','obras',$1,'zz-test'),
             ('ZZ Economía','obras',$2,'zz-test'),
             ('ZZ Economía','obras',$3,'zz-test')`, [1306000, 14982000, 16649000])

    await t.test('el falso margen ya no existe en ninguna vista', async () => {
      const columnas = async (vista) =>
        (await q(`select column_name from information_schema.columns
                   where table_schema='public' and table_name=$1`, [vista])).map((r) => r.column_name)

      assert.ok(!(await columnas('obra_plan_vs_real')).includes('margen_actual'),
        'obra_plan_vs_real volvió a publicar margen_actual (contratado − costo real no es margen)')
      assert.ok(!(await columnas('obra_panel')).includes('margen_sobre_contratado_pct'),
        'obra_panel volvió a publicar margen_sobre_contratado_pct: el mismo falso margen en porcentaje')
      assert.ok(!(await columnas('obra_economia')).includes('margen_actual'),
        'obra_economia publica margen_actual: la vista nueva reintrodujo la resta vieja')
    })

    await t.test('las vistas nuevas corren con los permisos de quien pregunta, salvo la declarada', async () => {
      // `create view` SIN la opción corre como su dueño y saltea el RLS de sus tablas. Acá no se
      // puede usar `vistas-security-invoker.test.mjs` —esas vistas todavía no existen en la base
      // viva— así que el mismo control se hace sobre las que crea esta migración.
      const opts = async (v) => (await uno(
        `select coalesce(array_to_string(c.reloptions, ','), '') o
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname='public' and c.relname=$1`, [v])).o
      for (const v of ['obra_economia', 'obra_panel', 'obra_plan_vs_real', 'cliente_panel', 'comprobante_compra']) {
        assert.match(await opts(v), /security_invoker=true/, `${v} saltea el RLS de sus tablas`)
      }
      // `obra_cobranza` es la excepción DECLARADA: corre como dueña porque `authenticated` no tiene
      // select sobre `cobranzas`, y por eso lleva el portero adentro. Sin el portero publicaría las
      // ventas de la empresa a cualquiera con sesión.
      assert.doesNotMatch(await opts('obra_cobranza'), /security_invoker=true/)
      const def = (await uno(`select pg_get_viewdef('public.obra_cobranza'::regclass, true) d`)).d
      assert.match(def, /ve_economia\(\)/, 'obra_cobranza perdió su portero: publica las ventas a cualquiera')
    })

    await t.test('sin presupuesto y sin forecast, los dos márgenes son NULL — y el 64.713.000 no aparece', async () => {
      const e = await eco()
      assert.equal(num(e.venta_contratada), CONTRATO, 'la venta contratada no llegó')
      assert.equal(num(e.venta_total), CONTRATO, 'sin adicionales, venta total = contrato')
      assert.equal(num(e.costo_real), COSTO, 'el costo real imputado no llegó')
      assert.equal(num(e.costo_real_n_comprobantes), 3)

      assert.equal(e.costo_objetivo, null, 'apareció un costo objetivo sin presupuesto')
      assert.equal(e.margen_cotizado, null, 'hay margen cotizado sin presupuesto')
      assert.equal(e.costo_final_proyectado, null, 'hay EAC sin forecast')
      assert.equal(e.costo_restante_proyectado, null, 'hay ETC sin EAC')
      assert.equal(e.margen_final_proyectado, null, 'hay margen proyectado sin forecast')
      assert.match(e.costo_objetivo_origen, /sin presupuesto/i,
        'la vista no dice por qué falta el costo objetivo')

      // EL CONTROL QUE IMPORTA: ninguna columna de la fila puede valer la resta vieja. Si alguien
      // la reintroduce con otro nombre, este assert la encuentra igual.
      for (const [col, v] of Object.entries(e)) {
        assert.notEqual(num(v), FALSO_MARGEN,
          `la columna ${col} publica ${FALSO_MARGEN}: es contratado − costo real con otro nombre`)
      }
    })

    await t.test('el costo real declara que no tiene una hora adentro', async () => {
      // La mano de obra se carga con rótulos `indirecto` (sueldos, UOCRA, F931) y por diseño nunca
      // llega a una obra. El 0 es el dato: es lo que vuelve indefendible cualquier margen sobre él.
      assert.equal(num((await eco()).costo_real_mano_de_obra), 0)
    })

    await t.test('el costo comprometido es NULL y dice por qué (no 0)', async () => {
      const e = await eco()
      assert.equal(e.costo_comprometido, null, 'se publicó un comprometido que ninguna fuente respalda')
      assert.match(e.costo_comprometido_estado, /obligaciones|cheques/i)
      // CABLE TRAMPA: el día que `obligaciones` gane el eje canónico, este test se pone rojo y
      // obliga a cablear el comprometido en vez de dejar la columna en NULL para siempre.
      const cols = (await q(`select column_name from information_schema.columns
                              where table_schema='public' and table_name='obligaciones'`)).map((r) => r.column_name)
      assert.ok(!cols.includes('obra_canonica_id'),
        'obligaciones ya tiene obra_canonica_id: cablear costo_comprometido en obra_economia')
    })

    await t.test('con presupuesto aparece el margen COTIZADO, y sólo ése', async () => {
      const legacy = await uno(`select id from obras limit 1`)
      assert.ok(legacy, 'no hay ninguna obra legacy: presupuestos.obra_id es NOT NULL contra esa tabla')
      const COSTO_OBJETIVO = 70000000
      await q(`insert into presupuestos
                 (obra_id, obra_canonica_id, estado, monto_presupuestado, costo_directo_presupuestado,
                  margen_esperado, fuente_legacy, fecha_presupuesto)
               values ($1,$2,'aprobado',$3,$4,$5,'zz-test',current_date)`,
        [legacy.id, OBRA, CONTRATO, COSTO_OBJETIVO, CONTRATO - COSTO_OBJETIVO])

      const e = await eco()
      assert.equal(num(e.costo_objetivo), COSTO_OBJETIVO)
      assert.match(e.costo_objetivo_origen, /presupuesto/i)
      assert.equal(num(e.margen_cotizado), CONTRATO - COSTO_OBJETIVO,
        'el margen cotizado no es venta − costo objetivo')
      assert.equal(e.margen_final_proyectado, null,
        'el margen cotizado se filtró al proyectado: son dos números distintos')
    })

    await t.test('un adicional APROBADO suma a la venta; uno cotizado y sin aprobar, no', async () => {
      const APROBADO = 5000000
      await q(`insert into adicionales (obra_canonica_id, concepto, origen, detectado_por,
                 fecha_deteccion, fecha_cotizacion, monto_cotizado)
               values ($1,'ZZ sólo cotizado','cliente','zz',current_date,current_date,$2)`,
        [OBRA, 9000000])
      let e = await eco()
      assert.equal(num(e.venta_total), CONTRATO, 'un adicional sin aprobar entró a la venta')
      assert.equal(num(e.n_adicionales_aprobados), 0)

      await q(`insert into adicionales (obra_canonica_id, concepto, origen, detectado_por,
                 fecha_deteccion, fecha_aprobacion, monto_aprobado)
               values ($1,'ZZ aprobado','cliente','zz',current_date,current_date,$2)`,
        [OBRA, APROBADO])
      e = await eco()
      assert.equal(num(e.adicionales_aprobados), APROBADO)
      assert.equal(num(e.n_adicionales_aprobados), 1)
      assert.equal(num(e.venta_total), CONTRATO + APROBADO)
      assert.equal(num(e.margen_cotizado), CONTRATO + APROBADO - 70000000,
        'el adicional aprobado no movió el margen cotizado')
    })

    await t.test('lo cobrado sale de Cobranzas, y una fila «Cobrado» a futuro no cuenta como cobrada', async () => {
      // El caso real: dos cobros netos, un cobro que es SÓLO IVA (monto_neto NULL), una fila
      // pendiente a futuro y una marcada «Cobrado» con fecha que todavía no llegó.
      await q(`insert into cobranzas (obra_cliente, estado, fecha_cobro, total_bruto, monto_neto, origen) values
                 ('ZZ Economía','Cobrado', current_date - 10, 65678419.31, 54279685.38, 'zz-test'),
                 ('ZZ Economía','Cobrado', current_date - 5,  7130000,     7130000,     'zz-test'),
                 ('ZZ Economía','Cobrado', current_date - 3,  6510000,     null,        'zz-test'),
                 ('ZZ Economía','Pendiente', current_date + 30, 6564250,   5425000,     'zz-test'),
                 ('ZZ Economía','Cobrado', current_date + 40, 1000000,     1000000,     'zz-test')`)

      const cob = await uno(`select * from obra_cobranza where obra_id=$1`, [OBRA])
      assert.equal(num(cob.n_cobranzas), 5)
      assert.equal(num(cob.n_cobradas), 3, 'la fila «Cobrado» con fecha futura se contó como cobrada')
      assert.equal(num(cob.cobrado), 65678419.31 + 7130000 + 6510000)
      // El neto NO es el bruto menos algo: la fila de sólo IVA no tiene neto y no aporta.
      assert.equal(num(cob.cobrado_neto), 54279685.38 + 7130000)
      assert.equal(num(cob.por_cobrar_proyectado), 6564250 + 1000000,
        'el «Cobrado» a futuro no cayó en por cobrar')

      const e = await eco()
      assert.equal(num(e.cobrado), num(cob.cobrado), 'obra_economia no lee la misma fuente que obra_cobranza')
      assert.equal(num(e.por_cobrar_proyectado), num(cob.por_cobrar_proyectado))
      // Certificado y cobrado son dos hechos: no hay certificados cargados y eso no toca al cobrado.
      assert.equal(e.certificado, null, 'el cobrado se filtró al certificado')

      const plan = await uno(`select * from obra_plan_vs_real where obra_id=$1`, [OBRA])
      assert.equal(num(plan.cobrado), num(cob.cobrado),
        'obra_plan_vs_real sigue leyendo el cobrado de la tabla `certificados`, que está vacía')
      assert.equal(num(plan.por_cobrar_proyectado), num(cob.por_cobrar_proyectado))
    })

    await t.test('una obra sin cobranzas publica NULL, no 0', async () => {
      const cob = await uno(`select * from obra_cobranza where obra_id=$1`, [OTRA])
      assert.equal(num(cob.n_cobranzas), 0)
      assert.equal(cob.cobrado, null, 'una obra sin cobranzas cargadas afirma haber cobrado $0')
      assert.equal(cob.por_cobrar_proyectado, null)
      const e = await eco(OTRA)
      assert.equal(e.venta_contratada, null, 'la obra vacía inventó un contrato')
      assert.equal(e.venta_total, null, 'venta_total salió sin contrato')
      assert.equal(e.margen_cotizado, null)
      assert.equal(e.margen_final_proyectado, null)
    })

    await t.test('un rótulo que el diccionario no conoce no llega a ninguna obra', async () => {
      await q(`insert into cobranzas (obra_cliente, estado, fecha_cobro, total_bruto, monto_neto, origen)
               values ('ZZ RÓTULO QUE NADIE DECLARÓ','Cobrado', current_date - 1, 999, 999, 'zz-test')`)
      const total = await uno(`select coalesce(sum(cobrado),0) s from obra_cobranza`)
      assert.ok(!String(total.s).includes('999'),
        'una cobranza sin alias se coló a alguna obra: la resolución dejó de ser por igualdad exacta')
    })

    await t.test('una compra con obra conocida NO está «sin imputar»', async () => {
      const CAE = 'ZZ' + Date.now()
      await q(`insert into comprobantes_arca (tipo_libro, tipo_comprobante, punto_venta, numero, cae,
                 emisor_cuit, imp_total, obra_texto) values
               ('R','1','0001','1',$1||'a','20111111112', 1000, null),
               ('R','1','0001','2',$1||'b','20111111112', 1000, 'ZZ Economía'),
               ('R','1','0001','3',$1||'c','20111111112', 1000, 'ZZ Estructura'),
               ('R','1','0001','4',$1||'d','20111111112', 1000, 'ZZ ALGO QUE NADIE DECLARÓ')`, [CAE])

      const filas = await q(`select numero, imputacion, obra_id from comprobante_compra
                              where cae like $1||'%' order by numero`, [CAE])
      assert.deepEqual(filas.map((f) => f.imputacion),
        ['sin_identificar', 'obra', 'estructura', 'sin_resolver'])
      assert.equal(filas[1].obra_id, OBRA, 'la compra imputada a la obra no publicó la obra canónica')
      assert.equal(filas[2].obra_id, null, 'un gasto de Estructura salió con una obra colgada')
      assert.equal(filas[0].obra_id, null)

      // El binario viejo: `obra_texto is null` metía las cuatro en la misma bolsa. Ahora sólo UNA es
      // trabajo de imputación pendiente.
      const sinImputar = filas.filter((f) => f.imputacion === 'sin_identificar')
      assert.equal(sinImputar.length, 1, 'el estado volvió a ser binario')
    })

    await t.test('ni partida ni conciliación: se declara la ausencia, no se publica una columna vacía', async () => {
      const cols = (await q(`select column_name from information_schema.columns
                              where table_schema='public' and table_name='comprobantes_arca'`))
        .map((r) => r.column_name)
      // CABLE TRAMPA, igual que el del comprometido: si el modelo gana la partida o la
      // conciliación, este test obliga a cablearlas en `imputacion` en vez de dejarlas sueltas.
      for (const c of ['cotizacion_partida_id', 'obra_actividad_id', 'partida_id', 'conciliado_en']) {
        assert.ok(!cols.includes(c),
          `comprobantes_arca ganó la columna ${c}: cablearla en comprobante_compra.imputacion`)
      }
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
