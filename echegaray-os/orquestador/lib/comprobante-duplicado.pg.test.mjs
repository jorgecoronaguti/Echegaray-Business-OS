// EL POSIBLE DUPLICADO, PROBADO CONTRA LA BASE REAL — con la migración aplicada y deshecha.
//
// La vista `comprobante_posible_duplicado` acusa: le dice a una persona «esto ya lo pagaste». Un
// falso positivo manda a investigar una compra legítima; un falso negativo deja pasar el pago dos
// veces. Los dos modos de falla se prueban acá, y los tres casos que el encargo nombra explícito son
// los tres primeros: duplicado real detectado · re-sync NO · nota de crédito NO.
//
// LA MIGRACIÓN SE APLICA ADENTRO DE LA TRANSACCIÓN Y LA TRANSACCIÓN TERMINA EN ROLLBACK. No queda
// una función, una columna ni una fila en la base viva: aplicarla es decisión de quien integra, no
// de un test. Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getPool } from './db.mjs'
import { NOTAS_DE_CREDITO, SUMAN, NOMBRE, signo, nombreTipo } from './comprobante-arca.mjs'

const MIGRACION = fileURLToPath(
  new URL('../../supabase/migrations/20260821T5500_el_duplicado_posible_y_el_estado_de_control.sql', import.meta.url),
)

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Un CUIT que no existe en el libro real: la vista cruza contra TODA la tabla, así que sin un
 *  emisor propio las 632 filas verdaderas podrían aparecer en el conteo y el test mediría otra cosa. */
const CUIT = '30999999997'

test('posible duplicado y estado de control — contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    // LAS DOS ÉPOCAS: T5500 ya vive en la base y T6220 (imputación fina de compras) recreó su
    // vista por encima — re-aplicar el .sql acá tiraba «cannot drop columns from view». Si el
    // objeto está vivo, se afirma contra el esquema real; si no (base nueva), se aplica.
    const vivo = await c.query("select to_regclass('public.comprobante_posible_duplicado') as v")
    if (!vivo.rows[0].v) await c.query(await readFile(MIGRACION, 'utf8'))

    /** Siembra un comprobante del libro de compras y devuelve su id. */
    const sembrar = async ({ tipo, pv, nro, fecha, total = 1284600, cuit = CUIT }) =>
      (await uno(
        `insert into comprobantes_arca
           (tipo_libro, tipo_comprobante, punto_venta, numero, fecha_emision, emisor_cuit,
            emisor_nombre, imp_total, origen, created_at)
         values ('R', $1, $2, $3, $4::date, $5, 'ZZ CORRALON DE PRUEBA', $6, 'zz-test', $4::timestamptz)
         returning id`,
        [tipo, pv, nro, fecha, cuit, total],
      )).id

    /** Los parecidos que la vista le encuentra a un comprobante. */
    const parecidosDe = async (id) =>
      q(`select parecido_a_id, dias_de_distancia from comprobante_posible_duplicado where comprobante_id = $1`, [id])

    await t.test('1 · duplicado real: mismo proveedor, mismo importe, números distintos, 10 días', async () => {
      const viejo = await sembrar({ tipo: '1', pv: '0001', nro: '00204480', fecha: '2026-08-01' })
      const nuevo = await sembrar({ tipo: '1', pv: '0001', nro: '00204518', fecha: '2026-08-11' })

      const enElNuevo = await parecidosDe(nuevo)
      assert.equal(enElNuevo.length, 1, 'el comprobante nuevo tenía que señalar UN parecido')
      assert.equal(enElNuevo[0].parecido_a_id, viejo, 'señaló a otro comprobante, no al que se repite')
      assert.equal(Number(enElNuevo[0].dias_de_distancia), 10)

      // UNA FILA POR PAR, colgada del MÁS NUEVO. Simétrica contaría cada par dos veces y el KPI
      // «duplicados» diría el doble de lo que hay que revisar.
      assert.equal((await parecidosDe(viejo)).length, 0, 'el par apareció también sobre el más viejo: se cuenta dos veces')
    })

    await t.test('2 · re-sync NO es duplicado: mismo punto de venta y mismo número', async () => {
      // Es el MISMO comprobante bajado dos veces del libro. Lo resuelve `sinComprobantesRepetidos()`
      // sin preguntarle a nadie; acusarlo acá mandaría a investigar un defecto de la réplica.
      const a = await sembrar({ tipo: '1', pv: '0007', nro: '00000123', fecha: '2026-07-02', total: 555000 })
      const b = await sembrar({ tipo: '1', pv: '0007', nro: '00000123', fecha: '2026-07-02', total: 555000 })
      assert.equal((await parecidosDe(b)).length, 0, 'el re-sync entró como posible duplicado')
      assert.equal((await parecidosDe(a)).length, 0)
    })

    await t.test('3 · la nota de crédito NO es duplicado de su factura — la trampa del 21/07', async () => {
      // Factura A y Nota de Crédito A: mismo emisor, mismo importe, dos días. Todo igual menos el
      // SIGNO. Sin este filtro la vista marcaría como duplicada cada anulación del año.
      const fac = await sembrar({ tipo: '1', pv: '0038', nro: '00000002', fecha: '2026-03-23', total: 509980 })
      const nc = await sembrar({ tipo: '3', pv: '0038', nro: '00000003', fecha: '2026-03-25', total: 509980 })
      assert.equal((await parecidosDe(nc)).length, 0, 'la nota de crédito quedó marcada como duplicado de la factura')
      assert.equal((await parecidosDe(fac)).length, 0)

      // Y dos notas de crédito iguales entre sí SÍ se emparejan: el filtro es el signo, no «las
      // notas de crédito no cuentan». Con otro importe, para no cruzarse con el filtro de recurrencia.
      const nc2 = await sembrar({ tipo: '3', pv: '0038', nro: '00000008', fecha: '2026-03-26', total: 601000 })
      const nc3 = await sembrar({ tipo: '3', pv: '0038', nro: '00000009', fecha: '2026-03-28', total: 601000 })
      assert.equal((await parecidosDe(nc3)).length, 1, 'dos notas de crédito idénticas tienen que emparejarse')
      assert.equal((await parecidosDe(nc3))[0].parecido_a_id, nc2)
    })

    await t.test('4 · más de 35 días: dos consumos mensuales del mismo proveedor no son un duplicado', async () => {
      await sembrar({ tipo: '1', pv: '0009', nro: '00000001', fecha: '2026-01-05', total: 777000 })
      const lejos = await sembrar({ tipo: '1', pv: '0009', nro: '00000002', fecha: '2026-02-12', total: 777000 })
      assert.equal((await parecidosDe(lejos)).length, 0, '38 días de distancia entraron igual')

      // El borde, con OTRO importe: un tercer comprobante de $777.000 lo convertiría en un cargo
      // recurrente y este chequeo mediría el filtro equivocado.
      await sembrar({ tipo: '1', pv: '0009', nro: '00000003', fecha: '2026-01-05', total: 778000 })
      const cerca = await sembrar({ tipo: '1', pv: '0009', nro: '00000004', fecha: '2026-02-09', total: 778000 })
      assert.equal((await parecidosDe(cerca)).length, 1, '35 días exactos tienen que entrar: el borde es inclusivo')
    })

    await t.test('4b · el abono mensual deja de señalarse en la tercera factura', async () => {
      // Medido sobre el libro real el 21/08: sin este filtro, 34 pares señalados y la mayoría eran
      // STARLINK, el alquiler y el seguro — el mismo importe todos los meses. Una alerta que se
      // enciende siempre por lo mismo se apaga sola en la cabeza de quien la mira.
      const ABONO = 217800
      await sembrar({ tipo: '1', pv: '0002', nro: '00008390', fecha: '2026-05-09', total: ABONO })
      const segunda = await sembrar({ tipo: '1', pv: '0002', nro: '00008553', fecha: '2026-06-06', total: ABONO })
      // Con DOS apariciones todavía se señala: el segundo cobro tiene que verse.
      assert.equal((await parecidosDe(segunda)).length, 1, 'el segundo cobro del mismo importe dejó de verse')

      // La tercera convierte al importe en un cargo recurrente y apaga TODOS los pares de ese importe.
      const tercera = await sembrar({ tipo: '1', pv: '0002', nro: '00008716', fecha: '2026-07-09', total: ABONO })
      assert.equal((await parecidosDe(tercera)).length, 0, 'el abono mensual siguió señalado como duplicado')
      assert.equal((await parecidosDe(segunda)).length, 0, 'el par anterior del abono quedó señalado')

      // Y NO se lleva puesto al resto: otro importe del mismo proveedor sigue cruzándose.
      await sembrar({ tipo: '1', pv: '0002', nro: '00008900', fecha: '2026-07-10', total: 44444 })
      const otro = await sembrar({ tipo: '1', pv: '0002', nro: '00008901', fecha: '2026-07-12', total: 44444 })
      assert.equal((await parecidosDe(otro)).length, 1, 'el filtro de recurrencia apagó un importe que no es abono')
    })

    await t.test('5 · letra distinta: una A y una B son dos circuitos, no un papel repetido', async () => {
      await sembrar({ tipo: '1', pv: '0011', nro: '00000001', fecha: '2026-05-04', total: 333000 })
      const enB = await sembrar({ tipo: '6', pv: '0011', nro: '00000002', fecha: '2026-05-06', total: 333000 })
      assert.equal((await parecidosDe(enB)).length, 0, 'una Factura B se emparejó con una Factura A')
    })

    await t.test('6 · sin CUIT no se empareja, y un importe en cero tampoco', async () => {
      await sembrar({ tipo: '1', pv: '0021', nro: '00000001', fecha: '2026-06-01', total: 999000, cuit: null })
      const sinCuit = await sembrar({ tipo: '1', pv: '0021', nro: '00000002', fecha: '2026-06-03', total: 999000, cuit: null })
      assert.equal((await parecidosDe(sinCuit)).length, 0, 'dos emisores desconocidos se fusionaron en uno')

      await sembrar({ tipo: '1', pv: '0022', nro: '00000001', fecha: '2026-06-01', total: 0 })
      const enCero = await sembrar({ tipo: '1', pv: '0022', nro: '00000002', fecha: '2026-06-03', total: 0 })
      assert.equal((await parecidosDe(enCero)).length, 0, 'dos comprobantes en cero no son un duplicado, son dos huecos')
    })

    await t.test('7 · el signo de la base y el de JavaScript son la MISMA lista', async () => {
      // Si alguien agrega un código en un lado y se olvida del otro, el error no aparece acá: aparece
      // en un cuadro de IVA seis meses después. Por eso se comparan código por código.
      for (const codigo of [...NOTAS_DE_CREDITO, ...SUMAN]) {
        const enLaBase = (await uno(`select public.comprobante_signo($1) as s`, [codigo])).s
        assert.equal(Number(enLaBase), signo(codigo), `el código ${codigo} tiene distinto signo en la base y en JS`)
      }
      // Un código que ninguno de los dos conoce da NULL en los dos: «no sé» no se convierte en +1.
      assert.equal((await uno(`select public.comprobante_signo('63') as s`)).s, null)
      assert.equal(signo('63'), null)

      // El NOMBRE también: la web no puede importar este módulo, así que lee el nombre de la base.
      // Dos tablas de códigos que nadie compara terminan diciendo cosas distintas del mismo papel.
      for (const codigo of Object.keys(NOMBRE)) {
        const enLaBase = (await uno(`select public.comprobante_nombre_tipo($1) as n`, [codigo])).n
        assert.equal(enLaBase, nombreTipo(codigo), `el código ${codigo} se llama distinto en la base y en JS`)
      }
      assert.equal((await uno(`select public.comprobante_nombre_tipo('63') as n`)).n, nombreTipo('63'))
    })

    await t.test('10 · el libro de compras que lee la pantalla: sólo recibidos, con el papel traducido', async () => {
      const id = await sembrar({ tipo: '3', pv: '0051', nro: '00000001', fecha: '2026-02-03', total: 88000 })
      const v = await uno(`select tipo_nombre, letra, signo, comprobante, imp_total, tiene_posible_duplicado
                           from comprobante_compra where id=$1`, [id])
      assert.equal(v.tipo_nombre, 'Nota de Crédito A')
      assert.equal(v.letra, 'A')
      assert.equal(Number(v.signo), -1)
      assert.equal(v.comprobante, '0051-00000001')
      // EL IMPORTE SE PUBLICA COMO ESTÁ EN EL PAPEL. Si la vista lo devolviera ya multiplicado por el
      // signo, un tipo desconocido (signo NULL) borraría el número en vez de marcarlo.
      assert.equal(Number(v.imp_total), 88000)
      assert.equal(v.tiene_posible_duplicado, false)

      // Un comprobante EMITIDO (libro 'E') no es una compra y no puede aparecer en esta pantalla.
      const emitido = await uno(
        `insert into comprobantes_arca (tipo_libro, tipo_comprobante, punto_venta, numero, fecha_emision,
           emisor_cuit, imp_total, origen) values ('E','1','0001','1', current_date, $1, 1000, 'zz-test')
         returning id`, [CUIT])
      assert.equal((await q(`select 1 from comprobante_compra where id=$1`, [emitido.id])).length, 0,
        'una venta se coló en el libro de compras')
    })

    await t.test('8 · el estado de control nace sin revisar, rechaza inventos y lo escribe la web', async () => {
      const id = await sembrar({ tipo: '1', pv: '0031', nro: '00000001', fecha: '2026-08-15', total: 121000 })
      assert.equal((await uno(`select estado_control from comprobantes_arca where id=$1`, [id])).estado_control, 'sin_revisar')

      await c.query('savepoint estado_invalido')
      await assert.rejects(
        () => c.query(`update comprobantes_arca set estado_control='resuelto' where id=$1`, [id]),
        /check constraint|comprobantes_arca_estado_control_check/i,
        'la base aceptó un estado de control que la pantalla no puede dibujar',
      )
      await c.query('rollback to savepoint estado_invalido')

      // LA COLUMNA NUEVA TIENE QUE NACER CON PERMISO. El grant de las migraciones 140000/360000 es de
      // TABLA, así que la alcanza; cuando el grant es por columna pasa lo contrario y la web escribe
      // en el vacío sin un solo error. Se prueba ASUMIENDO el rol, no leyendo el grant.
      const alguien = await uno(`select id from perfiles limit 1`)
      if (alguien) {
        await c.query('savepoint como_web')
        await c.query(`select set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: alguien.id, role: 'authenticated' })])
        await c.query(`set local role authenticated`)
        await c.query(`update comprobantes_arca set estado_control='confirmado', estado_control_por='zz@test',
          estado_control_en=now() where id=$1`, [id])
        const visto = await uno(`select estado_control, estado_control_por from comprobantes_arca where id=$1`, [id])
        assert.equal(visto.estado_control, 'confirmado', 'la web no pudo escribir el estado de control')
        assert.equal(visto.estado_control_por, 'zz@test')
        // Y la vista se lee con la sesión de la web, no sólo con la del dueño de la base.
        await q(`select 1 from comprobante_posible_duplicado limit 1`)
        await c.query('rollback to savepoint como_web')
      }
    })

    await t.test('9 · confirmar no borra el parecido: lo que resuelve es el ESTADO, y la vista lo publica', async () => {
      const viejo = await sembrar({ tipo: '1', pv: '0041', nro: '00000001', fecha: '2026-04-01', total: 464000 })
      const nuevo = await sembrar({ tipo: '1', pv: '0041', nro: '00000002', fecha: '2026-04-05', total: 464000 })
      await c.query(`update comprobantes_arca set estado_control='confirmado' where id=$1`, [nuevo])
      const fila = await uno(
        `select parecido_a_id, estado_control from comprobante_posible_duplicado where comprobante_id=$1`, [nuevo])
      assert.equal(fila.parecido_a_id, viejo, 'confirmar hizo desaparecer la evidencia del parecido')
      // El KPI cuenta los SIN RESOLVER: la vista publica el estado para que ese conteo no tenga que
      // volver a la tabla y quedarse con dos definiciones de «duplicado pendiente».
      assert.equal(fila.estado_control, 'confirmado')
    })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
