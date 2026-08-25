// EL APOYO DEL CASO CONTROLADO: la puerta, el censo y la semilla.
//
// Vive aparte de `caso-controlado-circuito.pg.test.mjs` para que el caso sea SÓLO la cadena de diez
// pasos y sus asserts. Acá está lo que no es el caso pero lo hace posible:
//
//   · `verificarCircuitoAplicado` — «¿está el circuito en ESTA base o sólo en el repo?», contestado
//     contra el catálogo (`to_regclass`, `pg_proc`, `information_schema`) y sin efectos. Es la misma
//     pregunta que los tests hermanos contestan aplicando los .sql dentro de su transacción, por el
//     otro lado: aplicar prueba que el .sql corre, esto prueba que el efecto ESTÁ.
//   · `censoDeTablas` — el conteo de antes y después del rollback. Si cambió, el caso contaminó.
//   · `sembrarCasoControlado` — la base maestra con NÚMEROS ELEGIDOS para que la aritmética se lea a
//     simple vista y cualquier eslabón que se saltee un paso se note sin calculadora.

/** Los objetos que el circuito publica. Si falta uno, no está aplicado — y se dice cuál. */
export const OBJETOS_DEL_CIRCUITO = ['cotizacion_cascada', 'cotizacion_partida_valorizada',
  'estandar_productivo', 'analisis_costo', 'recurso_costo', 'obra_actividad_control',
  'obra_actividad_forecast', 'rendimiento_a_capturar', 'rendimiento_recomendado',
  'recomendacion_pendiente', 'computo_de_partida', 'obra_causa_desvio', 'actividad_horas',
  'parametro_comercial', 'tipo_cambio', 'analisis_cuadrilla', 'causa_desvio', 'computo',
  'recomendacion_decision', 'rendimiento_historico']

/** Las tablas que el caso toca. Al terminar, ninguna puede haber cambiado de tamaño. */
export const TABLAS_TOCADAS = ['tarea_tipo', 'recurso', 'recurso_precio', 'analisis',
  'analisis_linea', 'analisis_cuadrilla', 'cotizaciones', 'cotizacion_partida',
  'cotizacion_partida_composicion', 'computo', 'plantilla_secuencia', 'plantilla_paso',
  'obra_canonica', 'obra_actividad', 'obra_dependencia', 'obra_ejecucion', 'registros_hh',
  'rendimiento_historico', 'recomendacion_decision']

/**
 * Verifica contra el catálogo que las once migraciones del circuito están aplicadas.
 *
 * @param {import('pg').PoolClient} client
 * @returns {Promise<{ faltantes: string[], resumen: object }>} `faltantes` vacío es verde. No lanza:
 *   quien llama decide si eso es un assert o un aviso.
 */
export async function verificarCircuitoAplicado(client) {
  const faltantes = []
  const q = async (sql, params) => (await client.query(sql, params)).rows

  const sinObjeto = (await q(`select x.v from unnest($1::text[]) as x(v)
                               where to_regclass('public.' || x.v) is null`, [OBJETOS_DEL_CIRCUITO]))
    .map((r) => r.v)
  if (sinObjeto.length) faltantes.push(`no están en la base: ${sinObjeto.join(', ')}`)

  // Las FORMAS, no sólo los nombres: un objeto viejo con el nombre nuevo pasaría el chequeo de
  // arriba y haría fallar al caso doscientas líneas después, por la razón equivocada.
  const [cong] = await q(`select pg_get_function_result(oid) as t from pg_proc
                           where proname='congelar_presupuesto'`)
  if (cong?.t !== 'jsonb') faltantes.push('congelar_presupuesto no devuelve jsonb: falta la 4400')

  const [conv] = await q(`select pg_get_functiondef(oid) as d from pg_proc
                           where proname='convertir_partida_a_plan'`)
  const cuerpo = conv?.d ?? ''
  if (!/no tiene fecha de inicio/.test(cuerpo)) faltantes.push('la conversión no exige fecha de inicio: falta la 4600')
  if (!/subcontrato_fijar_precio/.test(cuerpo)) faltantes.push('la conversión no reconoce el paquete: falta la 4600')
  if (!/v_paso\.tiempo_tecnico/.test(cuerpo)) faltantes.push('la conversión no persiste el tiempo técnico: falta la 5450/T1000')

  const cols = (await q(`select column_name from information_schema.columns
                          where table_name='obra_actividad_control'
                            and column_name in ('tiempo_tecnico','hh_improductivas','hh_productivas','n_incidencias')`))
    .map((x) => x.column_name).sort()
  if (cols.length !== 4) {
    faltantes.push(`obra_actividad_control no es la reconciliada (${cols.length}/4): falta la 20260822T1000`)
  }

  const [gen] = await q(`select generation_expression as g from information_schema.columns
                          where table_name='rendimiento_historico' and column_name='hs_unitarias'`)
  if (!/hh_improductivas/.test(gen?.g ?? '')) {
    faltantes.push('rendimiento_historico.hs_unitarias no descuenta las improductivas: falta la 4700')
  }

  const [param] = await q(`select pct_gastos_generales, pct_iva from parametro_comercial where vigente`)
  if (Number(param?.pct_gastos_generales) !== 0.27 || Number(param?.pct_iva) !== 0.21) {
    faltantes.push('el parámetro comercial vigente no es el del libro (GG 27 % · IVA 21 %): falta la 4300')
  }

  return {
    faltantes,
    resumen: { objetos: OBJETOS_DEL_CIRCUITO.length, congelar_devuelve: cong?.t ?? 'no existe',
      obra_actividad_control: `${cols.length}/4 columnas reconciliadas`,
      parametro_vigente: { gg: Number(param?.pct_gastos_generales), iva: Number(param?.pct_iva) } },
  }
}

/**
 * Cuenta las filas de un puñado de tablas de `public`.
 *
 * Va por `query_to_xml` y no por SQL armado en el cliente porque así el nombre de la tabla lo cita
 * el servidor con `quote_ident` y la lista no puede convertirse en una inyección.
 *
 * @param {import('pg').PoolClient} client
 * @param {string[]} [tablas]
 * @returns {Promise<Record<string, number>>}
 */
export async function censoDeTablas(client, tablas = TABLAS_TOCADAS) {
  const { rows } = await client.query(
    `select t.tabla, x.n from unnest($1::text[]) as t(tabla),
       lateral (select (xpath('/row/c/text()',
         query_to_xml('select count(*) as c from public.' || quote_ident(t.tabla),
                      false, true, '')))[1]::text::bigint as n) x`, [tablas])
  return Object.fromEntries(rows.map((f) => [f.tabla, Number(f.n)]))
}

/**
 * Siembra la base maestra del caso dentro de la transacción abierta por quien llama.
 *
 * LOS NÚMEROS ESTÁN ELEGIDOS, no son arbitrarios: 2,0 hs/m² de oficial a $10.000, 2,0 hr de cargas
 * a $4.000 y 4 m³ de arena a $500 dan un costo unitario de $30.000 EXACTOS, y 100 m² dan $3.000.000
 * de costo directo. Con esos redondos, un eslabón que se saltee un paso se ve sin calculadora.
 *
 * La plantilla es propia y tiene un paso de trabajo y un paso TÉCNICO de 5 días: el fragüe no se
 * acorta poniendo gente, y es el que revienta si la conversión lo trata como trabajo.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ obra: string, obra2: string }} obras
 * @returns {Promise<{ tarea: string, analisis: string, cotizacion: string, partida: string, plantilla: string }>}
 */
export async function sembrarCasoControlado(client, { obra, obra2 }) {
  const q = async (sql, params) => (await client.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]

  const tarea = await uno(`insert into tarea_tipo (codigo, nombre, unidad, metodo_medicion)
                           values ('ZZ-CC','ZZ Contrapiso alisado','m2','cantidad') returning id`)
  const rMo = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                         values ('ZZ-CC-MO','ZZ Oficial contrapiso','hs','mano_obra') returning id`)
  const rCs = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                         values ('ZZ-CC-CS','ZZ Cargas sociales contrapiso','hr','carga_social') returning id`)
  const rMat = await uno(`insert into recurso (codigo, nombre, unidad, tipo)
                          values ('ZZ-CC-MAT','ZZ Arena','m3','material') returning id`)
  await q(`insert into recurso_precio (recurso_id, costo, moneda, fecha_precio, fuente, vigente) values
           ($1, 10000, 'ARS', current_date, 'ZZ caso', true),
           ($2,  4000, 'ARS', current_date, 'ZZ caso', true),
           ($3,   500, 'ARS', current_date, 'ZZ caso', true)`, [rMo.id, rCs.id, rMat.id])
  const an = await uno(`insert into analisis (tarea_tipo_id, version, vigente, motivo)
                        values ($1, 1, true, 'ZZ base del caso') returning id`, [tarea.id])
  await q(`insert into analisis_linea (analisis_id, recurso_id, cantidad, orden) values
           ($1,$2, 2.0, 1), ($1,$3, 2.0, 2), ($1,$4, 4.0, 3)`, [an.id, rMo.id, rCs.id, rMat.id])
  await q(`insert into analisis_cuadrilla (analisis_id, categoria, cantidad)
           values ($1,'oficial',1), ($1,'ayudante',2)`, [an.id])
  await q(`insert into obra_canonica (id, nombre, jornada_horas, dias_habiles)
           values ($1,'ZZ Caso Circuito', 8, '{1,2,3,4,5}'), ($2,'ZZ Caso Otra Obra', 8, '{1,2,3,4,5}')`,
  [obra, obra2])

  // La cotización COPIA los ocho porcentajes del parámetro vigente, que es como una obra negocia su
  // precio sin tocar el estándar de la empresa.
  const cot = await uno(`insert into cotizaciones (cliente, obra_nombre, numero, fecha_cotizacion, estado,
      pct_gastos_generales, pct_beneficio, pct_financiero, factor_financiero,
      pct_iibb, pct_ganancias, pct_cheque, pct_iva, parametro_comercial_id, convertida_obra_id)
    select 'ZZ Cliente Caso','ZZ Obra del caso','ZZ-CASO-1', current_date, 'borrador',
           p.pct_gastos_generales, p.pct_beneficio, p.pct_financiero, p.factor_financiero,
           p.pct_iibb, p.pct_ganancias, p.pct_cheque, p.pct_iva, p.id, $1
      from public.parametro_comercial p where p.vigente returning id`, [obra])
  const part = await uno(`insert into cotizacion_partida (cotizacion_id, orden, rubro, codigo, descripcion,
      cantidad, unidad, tarea_tipo_id, analisis_id, metodo_medicion)
    values ($1, 1, 'ZZ Contrapisos','ZZ-CC-01','ZZ contrapiso alisado esp. 10 cm',
            100, 'm2', $2, $3, 'cantidad') returning id`, [cot.id, tarea.id, an.id])
  // El cómputo: dos paños medidos del plano y el descuento de la zona de máquinas, en NEGATIVO.
  await q(`insert into computo (cotizacion_partida_id, documento_nombre, revision, elemento, unidad,
             cantidad, origen, criterio) values
           ($1,'ZZ-PL-10','A','Nave A','m2', 70, 'plano', '35,00 × 2,00'),
           ($1,'ZZ-PL-10','A','Nave B','m2', 40, 'plano', '20,00 × 2,00'),
           ($1,'ZZ-PL-10','A','Zona de máquinas','m2', -10, 'plano', '5,00 × 2,00 se descuenta')`, [part.id])

  const plantilla = await uno(`insert into plantilla_secuencia (nombre, descripcion)
                               values ('ZZ Contrapiso y fragüe','ZZ caso controlado') returning id`)
  await q(`insert into plantilla_paso (plantilla_id, orden, nombre, peso, tiempo_tecnico, dias_tecnicos)
           values ($1, 1, 'ZZ Ejecución', 90, false, null), ($1, 2, 'ZZ Fragüe', 10, true, 5)`, [plantilla.id])

  return { tarea: tarea.id, analisis: an.id, cotizacion: cot.id, partida: part.id, plantilla: plantilla.id }
}
