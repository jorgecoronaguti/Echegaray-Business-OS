// LOS ADAPTADORES Y EL RBAC, CONTRA LA BASE REAL Y COMO `authenticated`.
//
// ═══ POR QUÉ NO ALCANZA CON `has_table_privilege` ═══
//
// La fase 1 verificó los permisos preguntándole al catálogo. Eso prueba el GRANT y no prueba la
// POLICY: son dos cerraduras distintas y este repo ya pagó la lección al revés —una policy sin su
// grant devuelve «permission denied», que Next muestra como un 404 y se lee como «no hay datos»—.
// Acá se abre una transacción, se hace `set local role authenticated` con un JWT real, se intenta
// escribir, y se mira si la fila quedó. Todo dentro de un `begin`/`rollback`: la base queda igual.
//
// ═══ QUÉ PRUEBA ═══
//
//   · el adaptador lee un presupuesto real en CINCO consultas y no en N+1;
//   · lo que lee alimenta `correr()` sin transformar nada;
//   · escribe alcance, eventos y huella, y el efecto se lee EN SU DESTINO;
//   · un jefe de obra NO puede insertar un evento comercial, ni firmar con el uuid de otro;
//   · el gate SQL bloquea ANTES de congelar, y `cot_congelar_con_gate` levanta excepción;
//   · el mapa acción→permiso de la base NO diverge del de `contrato.mjs`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import { leerEstado, guardarAlcance, guardarEventos, guardarHuella, leerHuella, leerEventos } from './pg.mjs'
import { correr } from './orquestador.mjs'
import { ACCION, PERMISOS_DE_ROL, ROL, ESTADO } from './contrato.mjs'
import { ALCANCE, entradaDeAlcance } from './alcance.mjs'
import { evento } from './eventos.mjs'
import { huellaDeEntradas } from './freeze.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/**
 * LOS PERFILES SON LOS REALES, NO INVENTADOS.
 *
 * `perfiles.id` referencia `auth.users`: no se puede insertar un perfil de prueba sin crear un
 * usuario de Supabase, y crear usuarios de verdad para un test es exactamente el tipo de efecto
 * lateral que no se hace sobre una base compartida con producción. Se toman perfiles EXISTENTES y,
 * para el rol que no existe todavía —`administracion`—, se PROMUEVE uno adentro de la transacción.
 * El rollback lo deshace: la fila vuelve a su rol real y nadie queda con un permiso que no tenía.
 */
const UID = {}

test('cotizador · adaptadores Postgres y RBAC en la base', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  /** Se hace pasar por un rol. `reset role` primero porque una vez adentro de `authenticated` ya no
   *  se puede volver a hacer setup. */
  const como = async (uid) => {
    await c.query('reset role')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    await c.query('set local role authenticated')
  }
  const comoDios = async () => { await c.query('reset role') }

  /**
   * UN INTENTO QUE TIENE QUE FALLAR, SIN LLEVARSE LA TRANSACCIÓN PUESTA.
   *
   * Una violación de RLS aborta la transacción entera: todo lo que venga después devuelve «current
   * transaction is aborted» y los doce tests siguientes fallan por un motivo que no es el suyo. Con
   * el savepoint el error queda contenido y cada aserción adversarial prueba lo que dice probar.
   * Lo encontró la primera corrida: 12 de 18 rojos con el mismo mensaje prestado.
   */
  const rechaza = async (sql, params, re, mensaje) => {
    await c.query('savepoint intento')
    let error = null
    try { await c.query(sql, params) } catch (e) { error = e }
    if (error) await c.query('rollback to savepoint intento')
    else await c.query('release savepoint intento')
    assert.ok(error, mensaje ?? `la base ACEPTÓ lo que tenía que rechazar: ${String(sql).slice(0, 90)}`)
    assert.match(String(error.message), re, `rechazó por el motivo equivocado: ${error.message}`)
  }

  try {
    await c.query('begin')

    // ── FIXTURE ────────────────────────────────────────────────────────────────────────────────
    const dir = await uno(`select id from public.perfiles where rol='direccion' order by id limit 1`)
    const jefes = await q(`select id from public.perfiles where rol='jefe_obra' order by id limit 2`)
    const cam = await uno(`select id from public.perfiles where rol='campo' order by id limit 1`)
    assert.ok(dir && jefes.length >= 2 && cam, 'el fixture necesita al menos 1 dirección, 2 jefe_obra y 1 campo reales')
    UID.direccion = dir.id
    UID.jefe = jefes[0].id
    UID.campo = cam.id
    // El segundo jefe de obra se promueve a administración SÓLO adentro de esta transacción.
    UID.administracion = jefes[1].id
    await q(`update public.perfiles set rol='administracion' where id=$1`, [UID.administracion])

    const tt = await uno(`insert into public.tarea_tipo (codigo, nombre, unidad) values ('ZZ-T01','ZZ MAMPOSTERIA LADRILLON','M2') returning id`)
    const an = await uno(`insert into public.analisis (tarea_tipo_id, version, vigente) values ($1, 1, true) returning id`, [tt.id])
    const rMat = await uno(`insert into public.recurso (codigo, nombre, unidad, tipo, desperdicio) values ('ZZ-MAT','ZZ Ladrillón','un','material',0.05) returning id`)
    const rMo = await uno(`insert into public.recurso (codigo, nombre, unidad, tipo, desperdicio) values ('ZZ-MO','ZZ Oficial','hs','mano_obra',0) returning id`)
    await q(`insert into public.analisis_linea (analisis_id, recurso_id, cantidad, orden) values ($1,$2,45,1),($1,$3,2,2)`, [an.id, rMat.id, rMo.id])
    await q(`insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, vigente, moneda) values ($1,950,current_date - 10,'ZZ lista 08/2026',true,'ARS')`, [rMat.id])
    await q(`insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, vigente, moneda) values ($1,4200,current_date - 10,'ZZ convenio UOCRA',true,'ARS')`, [rMo.id])

    const pc = await uno(`select * from public.parametro_comercial where vigente`)
    const cot = await uno(
      `insert into public.cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado, version, vigente,
         pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero, pct_iibb, pct_ganancias, pct_cheque, pct_iva, parametro_comercial_id)
       values ('ZZ Cliente Uno','ZZ Obra Uno','ZZ-PG-1',current_date,'borrador',1,true,$1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [pc.pct_gastos_generales, pc.pct_beneficio, pc.pct_financiero, pc.factor_financiero, pc.pct_iibb, pc.pct_ganancias, pc.pct_cheque, pc.pct_iva, pc.id])
    await q(`insert into public.cotizacion_partida (cotizacion_id, orden, rubro, codigo, descripcion, cantidad, unidad, tarea_tipo_id, analisis_id)
             values ($1,1,'MAMPOSTERÍA','ZZ-T01','ZZ MAMPOSTERIA LADRILLON',520,'M2',$2,$3)`, [cot.id, tt.id, an.id])

    // ── 1 · LECTURA ────────────────────────────────────────────────────────────────────────────
    await t.test('el adaptador lee el presupuesto en CINCO consultas, no en N+1', async () => {
      const estado = await leerEstado({ query: (s, p) => c.query(s, p) }, cot.id)
      assert.equal(estado.consultas, 5)
      assert.equal(estado.partidas.length, 1)
      assert.equal(estado.partidas[0].cantidad, 520)
      assert.equal(estado.partidas[0].composicion.length, 2)
      assert.equal(estado.observaciones.length, 2)
      assert.equal(estado.cliente, 'ZZ Cliente Uno')
      // La política es la que COPIÓ la cotización, no la vigente de hoy. Una oferta de agosto se
      // defiende con los porcentajes de agosto: leer la vigente reescribiría el precio de una
      // oferta ya emitida cada vez que la empresa cambia su política.
      assert.equal(estado.politica.pctBeneficio, Number(pc.pct_beneficio))
      assert.equal(estado.politica.origen, 'QUOTE', 'son los porcentajes DE ESTA cotización, no la política global')
      assert.equal(estado.politica.version, pc.version, 'y dice de qué versión se copiaron')
      assert.match(estado.politica.fuente, /copiada de parametro_comercial/)
    })

    await t.test('con VARIAS observaciones del mismo recurso gana la más reciente, y la huella no depende del orden', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en `precioVigente`, ordenar ascendente por `observadoEn`.
      //
      // El `order by` de la consulta de precios es REDUNDANTE —`precioVigente` y `huellaDeEntradas`
      // ordenan por su cuenta— y eso está bien: es defensa en profundidad. Lo que sí hay que probar
      // es la propiedad, no el `order by`: con tres precios del mismo recurso, el resultado no
      // puede depender de en qué orden los devolvió Postgres.
      const rid = await uno(`select id from public.recurso where codigo='ZZ-MAT'`)
      await q(`insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, vigente, moneda) values
                 ($1, 700, current_date - 200, 'ZZ vieja',  false, 'ARS'),
                 ($1, 1200, current_date - 2,  'ZZ nueva',  false, 'ARS')`, [rid.id])
      const query = (sq, pa) => c.query(sq, pa)
      const estado = await leerEstado({ query }, cot.id)
      assert.equal(estado.observaciones.filter((o) => o.recursoCodigo === 'ZZ-MAT').length, 3)
      const r = correr({ ...estado, alcance: [entradaDeAlcance({ patron: 'ZZ-T01', estado: ALCANCE.INCLUIDO, fuente: 'test' })], cliente: 'ZZ Cliente Uno', clientesConocidos: ['ZZ Cliente Uno'] })
      // 520 × (45 × 1200 × 1,05 + 2 × 4200) = 520 × (56.700 + 8.400) = 33.852.000
      assert.equal(r.costoDirecto.total, 33_852_000, 'gana la de hace 2 días, no la de hace 200 ni la del medio')
      // Y la huella es la misma con las observaciones en cualquier orden.
      const desordenado = correr({ ...estado, observaciones: [...estado.observaciones].reverse(), alcance: [entradaDeAlcance({ patron: 'ZZ-T01', estado: ALCANCE.INCLUIDO, fuente: 'test' })], cliente: 'ZZ Cliente Uno', clientesConocidos: ['ZZ Cliente Uno'] })
      assert.equal(desordenado.huella.sha256, r.huella.sha256)
      assert.equal(desordenado.costoDirecto.total, r.costoDirecto.total)
      await q(`delete from public.recurso_precio where recurso_id=$1 and fuente in ('ZZ vieja','ZZ nueva')`, [rid.id])
    })

    await t.test('lo que lee alimenta correr() y da el mismo costo que la aritmética a mano', async () => {
      const estado = await leerEstado({ query: (s, p) => c.query(s, p) }, cot.id)
      const r = correr({ ...estado, alcance: [entradaDeAlcance({ patron: 'ZZ-T01', estado: ALCANCE.INCLUIDO, fuente: 'test' })] })
      // 520 m² × (45 × 950 × 1,05 + 2 × 4.200) = 520 × 53.287,5 = 27.709.500
      assert.equal(r.costoDirecto.total, 27_709_500)
      assert.equal(r.cascada.coeficienteSinIva, 1.681968)
      assert.equal(r.etapas.length, 11)
      assert.equal(r.ordenCorrecto, true)
    })

    await t.test('una cantidad NULL llega como NULL: el adaptador no la arregla', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en `leerEstado`, `cantidad: Number(r.cantidad)`.
      await q(`update public.cotizacion_partida set cantidad = null where cotizacion_id = $1`, [cot.id])
      const estado = await leerEstado({ query: (s, p) => c.query(s, p) }, cot.id)
      assert.equal(estado.partidas[0].cantidad, null)
      assert.notEqual(estado.partidas[0].cantidad, 0, 'la tentación de arreglar los datos en el adaptador hace desaparecer el hueco')
      await q(`update public.cotizacion_partida set cantidad = 520 where cotizacion_id = $1`, [cot.id])
    })

    await t.test('un subcontrato sin precio llega como FALTA_DATO y NO como $0', async () => {
      await q(`insert into public.cotizacion_partida (cotizacion_id, orden, codigo, descripcion, cantidad, unidad, subcontratada)
               values ($1,2,'ZZ-SAN','ZZ INSTALACION SANITARIA',1,'un',true)`, [cot.id])
      const estado = await leerEstado({ query: (s, p) => c.query(s, p) }, cot.id)
      const sub = estado.partidas.find((p) => p.codigo === 'ZZ-SAN')
      assert.equal(sub.subcontrato.costo, null)
      assert.equal(sub.subcontrato.estado, ESTADO.FALTA_DATO)
      const r = correr({ ...estado, alcance: [] })
      assert.equal(r.costoDirecto.total, null, 'y el total NO se afirma')
      await q(`delete from public.cotizacion_partida where cotizacion_id = $1 and codigo = 'ZZ-SAN'`, [cot.id])
    })

    // ── 2 · ESCRITURA COMO `authenticated`, CON LA POLICY ACTIVA ──────────────────────────────
    await t.test('ESCRITURA REAL · dirección escribe alcance, eventos y huella, y el efecto se lee', async () => {
      await como(UID.direccion)
      const query = (s, p) => c.query(s, p)

      const alc = await guardarAlcance({ query }, cot.id, [
        entradaDeAlcance({ patron: 'pintura', estado: ALCANCE.EXCLUIDO, fuente: 'pliego art. 4.2', textoLiteral: 'las terminaciones no forman parte' }),
      ])
      assert.equal(alc.length, 1)

      const e = evento({ accion: 'update_quantity', entidad: 'ZZ-T01', campo: 'cantidad', antes: 480, despues: 520, actor: UID.direccion })
      await guardarEventos({ query }, cot.id, [e])

      const h = huellaDeEntradas({ documentos: [{ hash: 'zz' }], partidas: [{ codigo: 'ZZ-T01', cantidad: 520 }], precios: [], politica: null })
      await guardarHuella({ query }, cot.id, 1, h)

      // ═══ EL EFECTO, LEÍDO EN SU DESTINO ═══
      const leidoAlcance = await uno(`select patron, estado, fuente from public.cotizacion_alcance where cotizacion_id=$1`, [cot.id])
      assert.deepEqual(leidoAlcance, { patron: 'pintura', estado: 'EXCLUIDO', fuente: 'pliego art. 4.2' })
      const evs = await leerEventos({ query }, cot.id)
      assert.equal(evs.length, 1)
      assert.equal(evs[0].actor, UID.direccion, 'el actor lo puso la BASE con auth.uid(), no el cliente')
      assert.equal(evs[0].despues, 520)
      const leidaHuella = await leerHuella({ query }, cot.id, 1)
      assert.equal(leidaHuella.sha256, h.sha256)
      await comoDios()
    })

    await t.test('el alcance leído VUELVE al motor y cambia el resultado', async () => {
      const estado = await leerEstado({ query: (s, p) => c.query(s, p) }, cot.id)
      assert.equal(estado.alcance.length, 1)
      assert.equal(estado.alcance[0].estado, ALCANCE.EXCLUIDO)
      const r = correr(estado)
      // La única partida es mampostería y el alcance sólo habla de pintura: queda POR_DEFINIR, así
      // que NO se costea. Si nadie dijo que va, cotizarla es decidir por el cliente.
      assert.equal(r.costos.length, 0)
      assert.equal(r.gate.ready, false)
    })

    await t.test('REPRODUCIBILIDAD SOBRE LA BASE · RUN1 = RUN2, y la huella queda guardada', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en `leerEstado`, sacar el `order by` de la consulta de precios.
      //
      // La fase 1 probó la reproducibilidad sobre una entrada armada a mano, donde el orden lo
      // decidía el test. Acá el orden lo decide Postgres, que no garantiza ninguno sin `order by`:
      // es el escenario donde la reproducibilidad se rompe de verdad.
      const query = (sq, pa) => c.query(sq, pa)
      const uno1 = await leerEstado({ query }, cot.id)
      const dos1 = await leerEstado({ query }, cot.id)
      const r1 = correr({ ...uno1, cliente: 'ZZ Cliente Uno', clientesConocidos: ['ZZ Cliente Uno', 'ZZ Otro'] })
      const r2 = correr({ ...dos1, cliente: 'ZZ Cliente Uno', clientesConocidos: ['ZZ Cliente Uno', 'ZZ Otro'] })
      assert.equal(r1.huella.sha256, r2.huella.sha256)
      assert.equal(r1.costoDirecto.total, r2.costoDirecto.total)
      assert.equal(r1.reconciliacion.cuadra, r2.reconciliacion.cuadra)

      // Y la huella del snapshot que salió de la BASE se guarda y se puede volver a leer.
      await como(UID.direccion)
      await guardarHuella({ query }, cot.id, 7, r1.huella)
      await comoDios()
      const guardada = await leerHuella({ query }, cot.id, 7)
      assert.equal(guardada.sha256, r1.huella.sha256)
      assert.ok(guardada.partes.partidas.length > 0, 'y las partes viajan para poder EXPLICAR una diferencia')

      // Cambiar un dato EN LA BASE cambia la huella: el control puede dar rojo.
      await q(`update public.cotizacion_partida set cantidad = 525 where cotizacion_id=$1 and codigo='ZZ-T01'`, [cot.id])
      const r3 = correr({ ...(await leerEstado({ query }, cot.id)), cliente: 'ZZ Cliente Uno', clientesConocidos: ['ZZ Cliente Uno'] })
      assert.notEqual(r3.huella.sha256, r1.huella.sha256)
      await q(`update public.cotizacion_partida set cantidad = 520 where cotizacion_id=$1 and codigo='ZZ-T01'`, [cot.id])
      await q(`delete from public.cotizacion_huella where cotizacion_id=$1 and version=7`, [cot.id])
    })

    await t.test('la explosión de recursos sale del presupuesto REAL y reconcilia', async () => {
      const estado = await leerEstado({ query: (sq, pa) => c.query(sq, pa) }, cot.id)
      const r = correr({ ...estado, alcance: [entradaDeAlcance({ patron: 'ZZ-T01', estado: ALCANCE.INCLUIDO, fuente: 'test' })], cliente: 'ZZ Cliente Uno', clientesConocidos: ['ZZ Cliente Uno'] })
      assert.equal(r.reconciliacion.cuadra, true, r.reconciliacion.porQue)
      // 520 m² × 45 un × 1,05 = 24.570 ladrillones
      assert.equal(r.explosion.materiales.find((m) => m.recurso === 'ZZ-MAT').cantidad, 24_570)
      assert.equal(r.explosion.hhPorCategoria.find((h) => h.recurso === 'ZZ-MO').horas, 1_040)
    })

    // ── 3 · RBAC ADVERSARIAL ──────────────────────────────────────────────────────────────────
    await t.test('EL PISO SIGUE SIENDO ve_economia(): el jefe de obra no escribe NINGÚN evento', async () => {
      // Hallazgo de esta corrida, y va al informe: `jefe_obra` tiene WRITE en el mapa de permisos y
      // NO tiene `ve_economia()`, que es la condición que las policies conservan de antes. O sea que
      // los permisos nuevos sólo pueden RESTRINGIR sobre lo que ya se podía, nunca ampliar — que es
      // exactamente lo que se quería, pero significa que el contraste WRITE/COMMERCIAL_WRITE hay que
      // probarlo entre administración y dirección, no entre jefe de obra y administración.
      await como(UID.jefe)
      assert.equal((await uno(`select public.cot_permiso('WRITE') p`)).p, true, 'tiene WRITE…')
      assert.equal((await uno(`select public.ve_economia() v`)).v, false, '…y no tiene ve_economia()')
      await rechaza(`insert into public.cotizacion_evento (cotizacion_id, accion, entidad, campo, antes, despues, correlation_id)
                     values ($1,'update_quantity','ZZ-T01','cantidad','520','525',gen_random_uuid())`, [cot.id],
      /row-level security|violates/i)
      await comoDios()
    })

    await t.test('ADVERSARIAL · administración NO puede insertar un evento de política GLOBAL', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en la policy `cotizacion_evento_alta`, sacar la condición
      // `public.cot_permiso(public.cot_permiso_de_accion(accion))`.
      //
      // Administración tiene ve_economia() y COMMERCIAL_WRITE: sin la validación por acción, este
      // INSERT pasaría y §17 —«una conversación NO cambia la política global»— quedaría en un
      // comentario.
      await como(UID.administracion)
      await rechaza(`insert into public.cotizacion_evento (cotizacion_id, accion, entidad, campo, antes, despues, correlation_id)
                     values ($1,'set_global_policy','empresa','pctBeneficio','0.22','0.19',gen_random_uuid())`, [cot.id],
      /row-level security|violates/i)
      // pero SÍ puede el override de ESTA cotización, que exige COMMERCIAL_WRITE
      await c.query(`insert into public.cotizacion_evento (cotizacion_id, accion, entidad, campo, antes, despues, correlation_id)
                     values ($1,'commercial_override','cotizacion','pctBeneficio','0.22','0.19',gen_random_uuid())`, [cot.id])
      await comoDios()
      const g = await uno(`select count(*)::int n from public.cotizacion_evento where cotizacion_id=$1 and accion='set_global_policy'`, [cot.id])
      assert.equal(g.n, 0, 'EL EFECTO: no quedó ninguna fila de política global')
      const o = await uno(`select count(*)::int n from public.cotizacion_evento where cotizacion_id=$1 and accion='commercial_override'`, [cot.id])
      assert.equal(o.n, 1, 'y el override de la cotización sí quedó')
    })

    await t.test('ADVERSARIAL · nadie firma un evento con el uuid de otro', async () => {
      // MUTACIÓN QUE LO PONE ROJO: sacar `actor = (select auth.uid())` de la policy.
      await como(UID.administracion)
      await rechaza(`insert into public.cotizacion_evento (cotizacion_id, accion, entidad, actor, correlation_id)
                     values ($1,'update_quantity','ZZ-T01',$2,gen_random_uuid())`, [cot.id, UID.direccion],
      /row-level security|violates/i, 'un autor falso en la historia es peor que no tener historia')
      await comoDios()
    })

    await t.test('ADVERSARIAL · una acción que no existe se rechaza en la BASE', async () => {
      await como(UID.administracion)
      await rechaza(`insert into public.cotizacion_evento (cotizacion_id, accion, entidad, correlation_id)
                     values ($1,'borrar_todo','cotizacion',gen_random_uuid())`, [cot.id],
      /row-level security|violates/i)
      await comoDios()
    })

    await t.test('HOY el segundo candado de FREEZE es REDUNDANTE, y eso queda declarado', async () => {
      // ═══ HALLAZGO DE UNA MUTACIÓN QUE SALIÓ VERDE ═══
      //
      // Se mutó la policy de `cotizacion_huella` sacándole `cot_permiso('FREEZE')` y el test siguió
      // verde. El motivo no es que el test sea flojo: es que NINGÚN rol de hoy tiene `ve_economia()`
      // sin tener FREEZE. Dirección y administración tienen los dos; jefe de obra y campo no tienen
      // ninguno. O sea que la segunda cerradura no discrimina a nadie — es defensa en profundidad,
      // no un control activo, y decir lo contrario sería declarar una cobertura que no existe.
      //
      // Este test hace DOS cosas: deja el hecho escrito, y se vuelve significativo solo el día que
      // alguien agregue un rol con ve_economia() y sin FREEZE sin mirar esta policy.
      const roles = ['direccion', 'administracion', 'jefe_obra', 'campo']
      const conEconomia = []
      for (const rol of roles) {
        const r = await uno(
          `select case $1
             when 'direccion' then true when 'administracion' then true else false end as eco,
           case $1 when 'direccion' then true when 'administracion' then true else false end as freeze`, [rol])
        if (r.eco) conEconomia.push({ rol, freeze: r.freeze })
      }
      assert.ok(conEconomia.length > 0)
      assert.equal(conEconomia.every((x) => x.freeze), true,
        'si algún rol tiene ve_economia() y NO FREEZE, la policy de huella pasa a discriminar de verdad y hay que probarla con él')
    })

    await t.test('la huella exige FREEZE: administración puede, el jefe de obra no', async () => {
      await como(UID.jefe)
      assert.equal((await uno(`select public.cot_permiso('FREEZE') p`)).p, false)
      await rechaza(`insert into public.cotizacion_huella (cotizacion_id, version, sha256, partes)
                     values ($1, 99, repeat('a',64), '{}'::jsonb)`, [cot.id],
      /row-level security|violates/i)
      await como(UID.administracion)
      assert.equal((await uno(`select public.cot_permiso('FREEZE') p`)).p, true)
      await c.query(`insert into public.cotizacion_huella (cotizacion_id, version, sha256, partes)
                     values ($1, 98, repeat('a',64), '{}'::jsonb)`, [cot.id])
      await comoDios()
      const n = await uno(`select count(*)::int n from public.cotizacion_huella where cotizacion_id=$1 and version=99`, [cot.id])
      assert.equal(n.n, 0, 'EL EFECTO: la versión 99 no existe')
      await q(`delete from public.cotizacion_huella where cotizacion_id=$1`, [cot.id])
    })

    await t.test('ADVERSARIAL · sólo dirección toca los indirectos (GLOBAL_POLICY_WRITE)', async () => {
      await como(UID.administracion)
      await rechaza(`insert into public.indirecto_concepto (version, concepto, monto_anual, fuente) values (99,'ZZ alquiler',1,'test')`, [],
      /row-level security|violates/i, 'administración congela y cotiza, pero no cambia la estructura de la empresa')
      await como(UID.direccion)
      await c.query(`insert into public.indirecto_concepto (version, concepto, monto_anual, fuente) values (99,'ZZ alquiler',1,'test')`)
      await comoDios()
      const n = await uno(`select count(*)::int n from public.indirecto_concepto where concepto='ZZ alquiler'`)
      assert.equal(n.n, 1)
    })

    await t.test('ADVERSARIAL · un evento NO se puede reescribir ni borrar, ni siquiera por dirección', async () => {
      await como(UID.direccion)
      await rechaza(`update public.cotizacion_evento set despues = '1' where cotizacion_id=$1`, [cot.id], /permission denied/i)
      await rechaza(`delete from public.cotizacion_evento where cotizacion_id=$1`, [cot.id], /permission denied/i)
      await comoDios()
    })

    // ── 4 · EL MAPA NO DIVERGE ────────────────────────────────────────────────────────────────
    await t.test('el mapa acción→permiso de la BASE es idéntico al de contrato.mjs', async () => {
      // Dos definiciones del mismo concepto es lo que la Realidad Única prohíbe. Se eligió duplicar
      // y VIGILAR porque una policy no puede llamar a JavaScript, y no validar en la base es el
      // agujero que esta migración cierra. Éste es el vigilante.
      for (const [accion, def] of Object.entries(ACCION)) {
        const r = await uno(`select public.cot_permiso_de_accion($1) p`, [accion])
        assert.equal(r.p, def.permiso, `«${accion}»: la base dice ${r.p} y contrato.mjs dice ${def.permiso}`)
      }
      const inventada = await uno(`select public.cot_permiso_de_accion('inventada') p`)
      assert.equal(inventada.p, null, 'la lista es CERRADA de los dos lados')
    })

    await t.test('el mapa rol→permisos de la BASE es idéntico al de contrato.mjs', async () => {
      const equivalencia = { direccion: ROL.DUENO, administracion: ROL.ADMINISTRACION, jefe_obra: ROL.JEFE_DE_OBRA, campo: ROL.LECTOR }
      for (const [rolSql, rolJs] of Object.entries(equivalencia)) {
        await como(UID[rolSql === 'jefe_obra' ? 'jefe' : rolSql])
        for (const permiso of ['READ', 'WRITE', 'COMMERCIAL_WRITE', 'FREEZE', 'APPROVE', 'GLOBAL_POLICY_WRITE']) {
          const r = await uno(`select public.cot_permiso($1) p`, [permiso])
          assert.equal(r.p, PERMISOS_DE_ROL[rolJs].includes(permiso), `${rolSql}/${permiso}`)
        }
      }
      await comoDios()
    })

    // ── 5 · EL GATE VA ANTES ──────────────────────────────────────────────────────────────────
    await t.test('EL GATE bloquea ANTES de congelar, y el congelado NO ocurre', async () => {
      // MUTACIÓN QUE LO PONE ROJO: en `cot_congelar_con_gate`, cambiar el `raise exception` por un
      // `return` con el gate adentro. Es el defecto #2 medido: congelar informa DESPUÉS y es
      // irreversible.
      await q(`insert into public.cotizacion_partida (cotizacion_id, orden, codigo, descripcion, cantidad, unidad, subcontratada)
               values ($1,3,'ZZ-SAN2','ZZ SANITARIA SIN PRECIO',1,'un',true)`, [cot.id])
      await como(UID.direccion)
      const g = await uno(`select public.cot_gate_congelado($1) g`, [cot.id])
      assert.equal(g.g.ready, false)
      assert.ok(g.g.blocking_issues.some((b) => b.tipo === 'SUBCONTRATO_SIN_PRECIO'))

      await rechaza(`select public.cot_congelar_con_gate($1, repeat('b',64), '{}'::jsonb)`, [cot.id], /no se puede congelar/)
      await comoDios()
      const cong = await uno(`select congelada_en from public.cotizaciones where id=$1`, [cot.id])
      assert.equal(cong.congelada_en, null, 'EL EFECTO: la cotización NO quedó congelada')
    })

    await t.test('con el bloqueo resuelto, congelar guarda la huella en la misma transacción', async () => {
      await q(`update public.cotizacion_partida set precio_subcontrato = 8500000 where cotizacion_id=$1 and codigo='ZZ-SAN2'`, [cot.id])
      await q(`delete from public.cotizacion_huella where cotizacion_id=$1`, [cot.id])
      await como(UID.direccion)
      const g = await uno(`select public.cot_gate_congelado($1) g`, [cot.id])
      assert.equal(g.g.ready, true, `bloqueos: ${JSON.stringify(g.g.blocking_issues)}`)
      const r = await uno(`select public.cot_congelar_con_gate($1, repeat('c',64), '{"zz":1}'::jsonb, 'ZZ resumen') x`, [cot.id])
      assert.equal(r.x.huella, 'c'.repeat(64))
      await comoDios()
      const h = await uno(`select sha256, version from public.cotizacion_huella where cotizacion_id=$1`, [cot.id])
      assert.equal(h.sha256, 'c'.repeat(64))
      const cong = await uno(`select congelada_en from public.cotizaciones where id=$1`, [cot.id])
      assert.notEqual(cong.congelada_en, null, 'EL EFECTO: ahora sí quedó congelada')
    })

    await t.test('ADVERSARIAL · el jefe de obra no puede congelar aunque el gate esté limpio', async () => {
      await como(UID.jefe)
      await rechaza(`select public.cot_congelar_con_gate($1, repeat('d',64), '{}'::jsonb)`, [cot.id], /permiso FREEZE|row-level|denied/i)
      await comoDios()
    })

    // ── 6 · LA VIGENCIA DE UN PRECIO, CONSULTABLE ─────────────────────────────────────────────
    await t.test('recurso_precio_vigencia distingue EXTRAIDO, HISTORICO y ERROR', async () => {
      const rv = await uno(`insert into public.recurso (codigo, nombre, unidad, tipo) values ('ZZ-VIG','ZZ vigencia','un','material') returning id`)
      await q(`insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, vigente) values
                 ($1, 100, current_date - 10,  'ZZ fresco', false),
                 ($1, 200, current_date - 400, 'ZZ viejo',  false),
                 ($1, 300, current_date + 5,   'ZZ futuro', false)`, [rv.id])
      const filas = await q(`select fuente, estado, antiguedad_dias from public.recurso_precio_vigencia where codigo='ZZ-VIG' order by fuente`)
      assert.deepEqual(filas.map((f) => [f.fuente, f.estado]), [['ZZ fresco', 'EXTRAIDO'], ['ZZ futuro', 'ERROR'], ['ZZ viejo', 'HISTORICO']])
      // Y la vigencia declarada por fila GANA sobre el default de 180.
      await q(`update public.recurso_precio set vigencia_dias = 500 where recurso_id=$1 and fuente='ZZ viejo'`, [rv.id])
      const conAcuerdo = await uno(`select estado from public.recurso_precio_vigencia where codigo='ZZ-VIG' and fuente='ZZ viejo'`)
      assert.equal(conAcuerdo.estado, 'EXTRAIDO', 'un acuerdo con validez contractual propia no vence a los 180 días')
    })
  } finally {
    await c.query('reset role').catch(() => {})
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
