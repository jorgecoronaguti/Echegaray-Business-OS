// LA CARTERA DE POSTGRES CONTRA LA PESTAÑA OBRAS — LA COMPARACIÓN, SIN LA BASE.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO (07/09/2026) ═══
//
// La migración `20260907T2000_la_cartera_de_obras_es_la_del_sheet…` dejó escrito, con todas las
// letras, que *"el test `obras-cartera-canonica.test.mjs` falla si vuelven a separarse"*. Ese test
// nunca se escribió, y ese mismo día las dos fuentes ya se habían separado en dos obras:
//
//     pisos-industriales      Sheet 05/08 → 30/09   ·   obra_canonica 22/08 → 02/10
//     entrepiso-y-escalera    Sheet 10/08 → 21/08   ·   obra_canonica 10/08 → 18/09
//
// Nadie vio un error. El Gantt dibujó las dos barras con la fecha equivocada, con el mismo color y
// la misma confianza que las otras siete — que es exactamente la forma que tiene esta clase de
// defecto: no rompe, MIENTE. Una afirmación que nadie puede contradecir porque el control que la
// contradiría no existía.
//
// ═══ QUÉ ES FUENTE Y QUÉ ES ESPEJO ═══
//
// `orquestador/lib/obras-datos.mjs#obrasVendidas` es la transcripción de la pestaña OBRAS del
// «Flujo de Caja - Cash Flow»: es lo que el dueño mira y lo que proyecta la caja. `obra_canonica`
// es el espejo que alimenta las pantallas de app.ecsas.com.ar. Cuando difieren, MANDA LA FUENTE:
// una fecha de obra es un compromiso con un cliente, no un campo de un formulario.
//
// ═══ EL ID NO ES EL MISMO DE LOS DOS LADOS, Y EL MAPEO NO SE TIPEA ACÁ ═══
//
// La clave del Sheet (`sf-pisos-industriales`) y el id canónico (`pisos-industriales`) difieren en
// cuatro de las diez obras, porque cambiarle el id a una obra que el ledger del Cash Flow ya apunta
// habría roto once filas por $87M. El vínculo YA está declarado en
// `obra_egreso_proyectado(obra_clave, obra_canonica_id)`, así que se LEE de ahí: escribirlo otra vez
// acá sería la tercera copia del mismo mapeo —después de la migración— y la que se quede vieja va a
// decir que una obra falta cuando en realidad se llama distinto.
//
// Cuando no hay vínculo declarado, la clave del Sheet ES el id canónico: es la regla que ya aplicó
// la migración, no una invención de este módulo.

/** El id canónico de una obra de la pestaña OBRAS. `vinculos` es `obra_clave → obra_canonica_id`. */
export const idCanonicoDe = (clave, vinculos) => vinculos.get(clave) ?? clave

/**
 * LAS DIFERENCIAS ENTRE LA PESTAÑA OBRAS Y `obra_canonica`, clasificadas.
 *
 * Función pura: recibe las tres lecturas ya hechas y no toca red ni base. Devuelve una lista de
 * hallazgos, nunca lanza — quien decide si un hallazgo es un rojo es el script que la llama, y así
 * el mismo cálculo sirve para el control y para el informe.
 *
 * @param {Array<{clave:string,obra:string,inicio:string,fin:string}>} vendidas la pestaña OBRAS
 * @param {Map<string,string>} vinculos `obra_clave → obra_canonica_id` de `obra_egreso_proyectado`
 * @param {Array<{id:string,estado:string,fecha_inicio_plan:string|null,fecha_fin_plan:string|null}>} canonicas
 * @returns {Array<{clave:string,id:string,obra:string,tipo:string,esperado:string|null,encontrado:string|null}>}
 */
export function diferenciasDeCartera(vendidas, vinculos, canonicas) {
  const porId = new Map(canonicas.map((o) => [o.id, o]))
  const hallazgos = []
  for (const v of vendidas) {
    const id = idCanonicoDe(v.clave, vinculos)
    const o = porId.get(id)
    // FALTA ES DISTINTO DE DIFERIR, y por eso son dos tipos y no un solo "mal". Una obra que no
    // existe en Postgres no se arregla con un `update`: hay que crearla con su cliente.
    if (!o) {
      hallazgos.push({ clave: v.clave, id, obra: v.obra, tipo: 'falta_en_la_base', esperado: `${v.inicio} → ${v.fin}`, encontrado: null })
      continue
    }
    // UNA OBRA DE LA PESTAÑA QUE EN LA BASE NO ESTÁ ACTIVA NO SE DIBUJA EN NINGUNA PANTALLA. No es
    // un detalle de estado: es una obra vendida que desapareció de la cartera sin que nadie avise.
    if (o.estado !== 'activa') {
      hallazgos.push({ clave: v.clave, id, obra: v.obra, tipo: 'no_esta_activa', esperado: 'activa', encontrado: o.estado })
    }
    const enBase = `${o.fecha_inicio_plan ?? '—'} → ${o.fecha_fin_plan ?? '—'}`
    const enSheet = `${v.inicio} → ${v.fin}`
    if (enBase !== enSheet) {
      hallazgos.push({ clave: v.clave, id, obra: v.obra, tipo: 'fechas_distintas', esperado: enSheet, encontrado: enBase })
    }
  }
  return hallazgos
}

/**
 * EL `UPDATE` MÍNIMO que deja la base diciendo lo que dice la pestaña, para las obras cuyas fechas
 * difieren. NO se emite para `falta_en_la_base` —eso es un `insert` con cliente y no lo decide un
 * control— ni para `no_esta_activa`: que una obra salga de la cartera es una decisión del dueño
 * (Mampostería salió el 07/09 porque está cobrada entera), y un script que la reactive solo estaría
 * deshaciendo esa decisión todas las noches.
 *
 * Devuelve el SQL como texto para que se pueda leer antes de correrlo; no lo ejecuta.
 */
export function sqlDeCorreccion(vendidas, vinculos, hallazgos) {
  const porClave = new Map(vendidas.map((v) => [v.clave, v]))
  const lineas = []
  for (const h of hallazgos.filter((x) => x.tipo === 'fechas_distintas')) {
    const v = porClave.get(h.clave)
    if (!v) continue
    lineas.push(
      `update public.obra_canonica set fecha_inicio_plan = '${v.inicio}'::date, `
      + `fecha_fin_plan = '${v.fin}'::date where id = '${h.id}';`,
    )
  }
  return lineas.join('\n')
}
