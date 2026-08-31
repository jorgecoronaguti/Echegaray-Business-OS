// UN ÁMBITO QUE LLEGA COMO PLANILLAS, LISTO PARA `correr()`. Puro — recibe todo, no consulta nada.
//
// ═══ QUÉ ARMA, Y EN QUÉ ORDEN ═══
//
//   artefacto → versión que rige → cómputos + huecos → mapeos → choques de suministro → partidas
//
// Cada paso vive en su módulo y acá sólo se los encadena. Lo único que este archivo DECIDE es la
// regla del final, y es la que sostiene todo el caso:
//
// ═══ UNA PARTIDA CON CHOQUE DE SUMINISTRO NO ENTRA AL COSTO ═══
//
// El ítem 5.3 de ARCOR cierra contra `T1064`, cuyo análisis COMPRA la puerta que ARCOR ya compró.
// Si esa partida entra a `partidas`, el motor la costea, la suma al COSTO DIRECTO y publica un
// número que paga dos veces el mismo material — sin una sola marca en el resultado.
//
// Así que no entra: se convierte en un issue BLOQUEANTE con su plata. El efecto medido es que ARCOR
// cotiza MENOS partidas y su COSTO DIRECTO queda sin afirmar. Ése es el resultado correcto, y es
// exactamente lo contrario de acomodar el caso para que cierre.

import { seleccionarTodas } from '../plano/seleccion.mjs'
import { versionOperativa, issueDeVersion, issuesDeDuplicados } from './ambito-planillas.mjs'
import { computosDePlanilla, issuesDePlanilla } from './planilla-cliente.mjs'
import { barrerSuministros } from './suministro-del-cliente.mjs'
import { reconciliarAmbito } from './reconciliacion-ambito.mjs'

/** Un cómputo mapeado → la partida que `correr()` costea. PURA. */
export function partidaDeMapeo(mapeo, composiciones = new Map()) {
  return {
    id: mapeo.tarea.id,
    codigo: mapeo.tarea.codigo,
    descripcion: mapeo.tarea.nombre,
    rubro: mapeo.computo?.evidencia?.rubro ?? null,
    unidad: mapeo.tarea.unidad,
    cantidad: Number(mapeo.computo.cantidad.valor),
    tareaTipoId: mapeo.tarea.id,
    composicion: composiciones.get(mapeo.tarea.id) ?? [],
    // La cita viaja pegada a la partida: es lo que se le contesta al cliente cuando pregunta de
    // dónde salió la cantidad. «Lo dice tu planilla, fila 12» es una respuesta; «lo calculamos» no.
    nota: `planilla del cliente: «${String(mapeo.computo.nombre).slice(0, 90)}» ${mapeo.computo.cantidad.valor} ${mapeo.computo.unidad} (${mapeo.computo.evidencia?.hoja} f${mapeo.computo.evidencia?.fila})`,
  }
}

/**
 * EL CASO ENTERO. PURA.
 *
 * `catalogo` y `composiciones` son la Base Maestra ya leída; `costoPorRecurso` los precios ya
 * resueltos. Nada de eso se consulta acá: el borde que llama trae los datos y esta función es
 * reproducible con ellos.
 */
export function armarCaso(artefacto, { catalogo = [], composiciones = new Map(), cliente = null, costoPorRecurso = {} } = {}) {
  const version = versionOperativa(artefacto)
  const ambito = artefacto?.ambito ?? null
  const documentos = (artefacto?.documentos ?? []).map((d) => ({
    hash: d.hash, nombre: d.nombre, formato: d.formato ?? null,
    // `abierto` es lo que el lector logró, no lo que el inventario dice. Un documento que no se pudo
    // abrir NO es un documento leído, y el conteo del informe se apoya en esta distinción.
    parseado: d.abierto === true,
    porQue: d.abierto ? null : (d.porQueNoSeAbrio ?? d.lectura?.porQue ?? null),
  }))

  const issuesDeVersion = [
    ...(issueDeVersion(version.conflicto, { ambito }) ? [issueDeVersion(version.conflicto, { ambito })] : []),
    ...issuesDeDuplicados(version.duplicados, { ambito }),
  ]
  if (!version.elegido) {
    return {
      version, documentos, planilla: null, mapeos: [], suministros: null,
      // La misma forma que en el camino bueno, con su `resumen: null`: sin versión que rija no hay
      // nada que reconciliar, y eso es distinto de haber reconciliado y no encontrar nada.
      reconciliacion: reconciliarAmbito({}),
      elementos: [], partidas: [], issues: issuesDeVersion,
      porQue: `no hay una versión que rija: ${version.porQue}`,
    }
  }

  const planilla = computosDePlanilla(version.elegido.lectura, { documento: version.elegido.nombre })
  const sel = seleccionarTodas(planilla.computos, catalogo)
  const suministros = barrerSuministros(sel.mapeos, { composiciones, cliente, costoPorRecurso, documento: version.elegido.nombre })
  const conChoque = new Set(suministros.conChoque.map((c) => c.elemento))

  const partidas = sel.mapeos
    .filter((m) => m.estado === 'MAPEADA' && !conChoque.has(m.computo?.id))
    .map((m) => partidaDeMapeo(m, composiciones))

  // ═══ LA RECONCILIACIÓN VA EN EL CASO, NO EN UN INFORME APARTE ═══
  //
  // `versionOperativa` ya medía la BRECHA entre los dos cómputos del ámbito —sobre ARCOR son
  // $ 31.882.681— y ese número solo no se puede llevar a una reunión: no dice qué ítem explica qué
  // peso. Acá se descompone renglón por renglón, con el choque de suministro pisando cualquier otro
  // veredicto: un ítem que coincide perfecto entre los dos documentos y cuyo análisis compra el
  // material que el cliente ya compró NO es un MATCH, es plata pagada dos veces.
  //
  // Los choques vienen indexados por el ID DEL CÓMPUTO y la reconciliación lee las filas crudas de la
  // planilla, que no lo conocen: lo único que las dos vistas comparten es el NÚMERO DE FILA. Sin
  // adjuntarlo, la reconciliación publicaba «0 CLIENT_SUPPLIED» al lado de un choque de $ 2.894.561
  // que el barrido sí había encontrado — dos partes del mismo caso diciendo cosas distintas.
  const filaDe = new Map(planilla.computos.map((c) => [c.id, c.evidencia?.fila ?? null]))
  const contra = version.versiones.find((v) => v.nombre !== version.elegido.nombre) ?? null
  const reconciliacion = reconciliarAmbito({
    rige: version.elegido, contra,
    suministros: { ...suministros, conChoque: suministros.conChoque.map((c) => ({ ...c, fila: filaDe.get(c.elemento) ?? null })) },
  })

  return {
    version, documentos, planilla, suministros, reconciliacion,
    mapeos: sel.mapeos,
    // Los elementos de INTERPRET son los ítems del cliente: se «interpretaron» leyendo su grilla, no
    // mirando un plano con un modelo. Por eso el caso corre con CERO llamadas al modelo.
    elementos: planilla.computos.map((c) => ({ id: c.id, nombre: c.nombre, unidad: c.unidad, cantidad: c.cantidad, evidencia: c.evidencia })),
    partidas,
    // Los issues de la reconciliación NO duplican los del suministro: `barrerSuministros` emite uno
    // por CHOQUE y la reconciliación uno por RENGLÓN reconciliado, y sólo los ítems que además están
    // en los dos cómputos aparecen en las dos listas. Se filtra por entidad para no contar la misma
    // plata dos veces en la cola.
    issues: [
      ...issuesDeVersion,
      ...issuesDePlanilla(planilla, { documento: version.elegido.nombre }),
      ...suministros.issues,
      ...reconciliacion.issues.filter((i) => !String(i.entity).startsWith('reconciliacion:') || !suministros.conChoque.some((c) => String(i.entity) === `reconciliacion:${c.elemento}`)),
    ],
    porQue: `${version.elegido.nombre}: ${planilla.porQue} · ${sel.mapeadas} mapeada(s), ${sel.ambiguas} ambigua(s), ${sel.candidatas} sin partida · ${suministros.conChoque.length} con material del cliente`
      + (reconciliacion.resumen ? ` · reconciliación ${Object.entries(reconciliacion.resumen).filter(([, v]) => v.n).map(([k, v]) => `${v.n} ${k}`).join(', ')}` : ' · sin segundo cómputo que reconciliar'),
  }
}

/** Los números del caso, en una línea comparable con los otros. PURA. */
export const numerosDelCaso = (caso) => ({
  documentos: caso.documentos.length,
  documentosAbiertos: caso.documentos.filter((d) => d.parseado).length,
  itemsDelCliente: caso.planilla?.resumen.items ?? 0,
  computos: caso.planilla?.resumen.computos ?? 0,
  huecosDeLectura: caso.planilla?.huecos.length ?? 0,
  mapeadas: caso.mapeos.filter((m) => m.estado === 'MAPEADA').length,
  ambiguas: caso.mapeos.filter((m) => m.estado === 'AMBIGUO').length,
  sinPartida: caso.mapeos.filter((m) => m.estado === 'PARTIDA_CANDIDATA').length,
  choquesDeSuministro: caso.suministros?.conChoque.length ?? 0,
  plataDeSuministro: caso.suministros?.plataEnRiesgo ?? null,
  partidasCosteables: caso.partidas.length,
  brechaDeAlcance: caso.version.conflicto?.brecha ?? null,
  // `null` cuando no hubo con qué reconciliar. Seis ceros dirían que se miró y no había nada.
  reconciliacion: caso.reconciliacion?.resumen ?? null,
})
