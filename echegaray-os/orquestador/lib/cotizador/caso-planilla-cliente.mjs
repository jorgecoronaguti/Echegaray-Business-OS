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

  return {
    version, documentos, planilla, suministros,
    mapeos: sel.mapeos,
    // Los elementos de INTERPRET son los ítems del cliente: se «interpretaron» leyendo su grilla, no
    // mirando un plano con un modelo. Por eso el caso corre con CERO llamadas al modelo.
    elementos: planilla.computos.map((c) => ({ id: c.id, nombre: c.nombre, unidad: c.unidad, cantidad: c.cantidad, evidencia: c.evidencia })),
    partidas,
    issues: [...issuesDeVersion, ...issuesDePlanilla(planilla, { documento: version.elegido.nombre }), ...suministros.issues],
    porQue: `${version.elegido.nombre}: ${planilla.porQue} · ${sel.mapeadas} mapeada(s), ${sel.ambiguas} ambigua(s), ${sel.candidatas} sin partida · ${suministros.conChoque.length} con material del cliente`,
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
})
