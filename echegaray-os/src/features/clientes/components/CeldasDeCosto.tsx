// LAS CELDAS DE COSTO A LA FECHA DE LA CARTERA — Materiales y Mano de obra (dueño, 13/09/2026).
//
// «Que las columnas de materiales y mano de obra del módulo CRM muestren los costos hasta el momento,
// sumados, de cada obra de cada cliente, no lo presupuestado; eso tiene que estar dentro de cada obra.»
//
// Reemplazan a `ComponenteDelContrato`, que dibujaba lo que el PAPEL fijaba de cada componente. La
// ficha del cliente ya dibujaba el costo a la fecha: estas celdas NO deciden qué significa un hueco,
// delegan en `services/costosDeObra.ts` —las mismas funciones y los mismos tests que la ficha—, así
// la cartera y la ficha no pueden publicar dos costos distintos del mismo trabajo.
//
// ═══ EN EL TELÉFONO EL COSTO NO DESAPARECE (QA de tercero, 13/09/2026) ═══
//
// Debajo de 1250px las dos columnas se sueltan y a 390px la cartera quedaba en Cliente y Contratado:
// el dato que el dueño pidió ver desde el celular no estaba. Se descartó el scroll horizontal —a
// 390px esconde el nombre al deslizar y la fila deja de decir de quién es el número— y se eligió
// una LÍNEA A LO ANCHO de la fila, debajo del nombre: «Mat. $ X · MO $ Y · a la fecha». Sale de
// `costoDeObra`/`costoDelCliente`, los MISMOS valores que las celdas: una fuente, dos cortes.

import { V } from '@/shared/components/v2/patron'
import { plata } from '@/shared/utils/format'
import {
  textoManoObra, textoMateriales, textoSubcontratos, textoTotalManoObra, textoTotalMateriales,
  textoTotalSubcontratos, tituloManoObra, tituloMateriales, tituloSubcontratos, totalesDelCliente,
  type CostoDeObra, type GastoSinObra,
} from '../services/costosDeObra'
import { SOLO_ANCHO, SOLO_ANGOSTO } from './CeldasDeCartera'

const CELDA = 'flex items-center justify-end tabular-nums truncate'

const NO_PUEDO = 'No puedo leer el costo a la fecha: lo ve Administración.'

/** Lo que dicen las dos cifras de una fila. Texto vacío = no se pudo leer. */
interface CostoDeFila {
  estado: 'a-la-fecha' | 'sin-leer'
  materiales: string
  tituloMateriales: string | null
  subcontratos: string
  tituloSubcontratos: string | null
  manoObra: string
  manoObraParcial: boolean
  /** Una parte del importe es estimada: la celda dice «est.» (20260915T0500). */
  manoObraEstimado: boolean
  tituloManoObra: string | null
}

function costoDeObra(costos: ReadonlyMap<string, CostoDeObra> | null, obraId: string): CostoDeFila {
  if (costos === null) {
    return { estado: 'sin-leer', materiales: '', tituloMateriales: NO_PUEDO, subcontratos: '', tituloSubcontratos: NO_PUEDO, manoObra: '', manoObraParcial: false, manoObraEstimado: false, tituloManoObra: NO_PUEDO }
  }
  const c = costos.get(obraId) ?? null
  const mo = textoManoObra(c)
  // SIN INICIO DE OBRA: la cartera no transporta `hh_obra`, y pedirlo sería otra definición.
  return {
    estado: 'a-la-fecha', materiales: textoMateriales(c), tituloMateriales: tituloMateriales(c),
    subcontratos: textoSubcontratos(c), tituloSubcontratos: tituloSubcontratos(c),
    manoObra: mo.texto, manoObraParcial: mo.parcial, manoObraEstimado: mo.estimado, tituloManoObra: tituloManoObra(c, null),
  }
}

/**
 * LOS DOS TOTALES DEL CLIENTE, sumados por `totalesDelCliente` de las MISMAS filas que se ven debajo
 * más lo que Compras le imputa sin obra. Es la función del pie de la ficha: una suma, dos pantallas.
 */
function costoDelCliente(
  costos: ReadonlyMap<string, CostoDeObra> | null,
  sinObra: ReadonlyMap<string, GastoSinObra> | null,
  clienteId: string,
  obraIds: readonly string[],
): CostoDeFila {
  const t = totalesDelCliente(costos, obraIds, sinObra?.get(clienteId) ?? null)
  const mo = textoTotalManoObra(t)
  // LO SIN OBRA ENTRA AL TOTAL Y SE DICE: sin la frase, el total del cliente no cierra contra las
  // filas de sus obras y la diferencia se lee como un error.
  const tituloMat = !t.legible
    ? NO_PUEDO
    : 'Suma a la fecha de lo comprado para todos sus trabajos, en curso y cerrados (Compras, columna K)'
      + (t.materialesSinObra != null ? `, incluidos ${plata(t.materialesSinObra)} sin obra asignada` : '')
      + '. Sin nómina, cargas, ARCA, financiero ni compras con fecha futura.'
  const tituloMo = !t.legible
    ? NO_PUEDO
    : 'Suma de la mano de obra propia de todos sus trabajos, en curso y cerrados: costo total empleador del recibo + parte en negro, repartidos por horas.'
      + (t.manoObraEstimada > 0 ? ` Incluye ${plata(t.manoObraEstimada)} ESTIMADO (quincenas sin recibo todavía).` : '')
      + (t.manoObraParcial ? ` QUEDAN ${Math.round(t.horasSinValorizar).toLocaleString('es-AR')} h AFUERA: falta el dato para valorizarlas.` : '')
  const tituloSub = !t.legible
    ? NO_PUEDO
    : 'Suma a la fecha de los subcontratos de todos sus trabajos: proveedor con rubro «Subcontratista» declarado o familia «Subcontratos y mano de obra»'
      + (t.subcontratosSinObra != null ? `, incluidos ${plata(t.subcontratosSinObra)} sin obra asignada` : '')
      + '. No están en Materiales ni en Mano de obra.'
  return {
    estado: t.legible ? 'a-la-fecha' : 'sin-leer', materiales: textoTotalMateriales(t), tituloMateriales: tituloMat,
    subcontratos: textoTotalSubcontratos(t), tituloSubcontratos: tituloSub,
    manoObra: mo.texto, manoObraParcial: mo.parcial, manoObraEstimado: mo.estimado, tituloManoObra: tituloMo,
  }
}

/** Un texto de celda: mono cuando es plata, tipografía de texto cuando es una frase. */
function Celda({ texto, parcial, titulo, testid, estado, estimado = false }: {
  texto: string
  parcial: boolean
  estimado?: boolean
  titulo: string | null
  testid: string
  estado: string
}) {
  return (
    <span className={`${CELDA} ${texto.startsWith('$') ? 'font-mono' : ''} ${SOLO_ANCHO}`}
      data-testid={testid} data-estado={estado} title={titulo ?? undefined}
      style={{ fontSize: '11.5px', color: parcial ? V.warn : V.tintaSuave, textAlign: 'right' }}>
      {texto}
      {estimado && <span data-testid={`${testid}-estimado`} style={{ marginLeft: 4, fontSize: '10.5px', color: V.tenue }}>est.</span>}
    </span>
  )
}

function Celdas({ f, sufijo }: { f: CostoDeFila; sufijo: 'obra' | 'cliente' }) {
  return (
    <>
      <Celda testid={`materiales-${sufijo}`} estado={f.estado} texto={f.materiales} parcial={false} titulo={f.tituloMateriales} />
      <Celda testid={`subcontratos-${sufijo}`} estado={f.estado} texto={f.subcontratos} parcial={false} titulo={f.tituloSubcontratos} />
      <Celda testid={`mano-obra-${sufijo}`} estado={f.estado} texto={f.manoObra} parcial={f.manoObraParcial} estimado={f.manoObraEstimado} titulo={f.tituloManoObra} />
    </>
  )
}

/**
 * LA LÍNEA DEL ANGOSTO: ocupa toda la fila de la grilla (`col-span-full`) y sólo existe donde las
 * celdas no. En la celda «no pude leer» es un hueco con `title`; en el teléfono no hay `title`, así
 * que el hueco se dice con palabras. «—» sigue siendo «—»: se leyó y no hay.
 */
function LineaAngosta({ f, sufijo, sangria }: { f: CostoDeFila; sufijo: 'obra' | 'cliente'; sangria: number }) {
  const cifra = (texto: string, parcial: boolean, titulo: string | null) => (
    <span className={texto.startsWith('$') ? 'font-mono tabular-nums' : ''} title={titulo ?? undefined}
      style={{ color: texto === '' ? V.lupa : parcial ? V.warn : V.tintaSuave }}>
      {texto === '' ? 'no pude leer' : texto}
    </span>
  )
  return (
    <span className={`col-span-full -mt-[10px] flex flex-wrap items-baseline gap-x-[6px] ${SOLO_ANGOSTO}`}
      data-testid={`costo-angosto-${sufijo}`} data-estado={f.estado}
      style={{ fontSize: '11px', color: V.apagado, paddingLeft: sangria, minWidth: 0 }}>
      <span>Mat.</span>{cifra(f.materiales, false, f.tituloMateriales)}
      <span aria-hidden>·</span>
      <span>Sub.</span>{cifra(f.subcontratos, false, f.tituloSubcontratos)}
      <span aria-hidden>·</span>
      <span>MO</span>{cifra(f.manoObra, f.manoObraParcial, f.tituloManoObra)}{f.manoObraEstimado && <span style={{ color: V.tenue }}>est.</span>}
      <span>· a la fecha</span>
    </span>
  )
}

/** MATERIALES y MANO DE OBRA de UN trabajo: lo que lleva gastado, no lo que el contrato fija. */
export function CostoDeLaObra({ costos, obraId, veEconomia }: {
  /** `null` = no se pudo leer: las dos celdas quedan vacías, nunca «—». */
  costos: ReadonlyMap<string, CostoDeObra> | null
  obraId: string
  veEconomia: boolean
}) {
  if (!veEconomia) return <><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /></>
  return <Celdas f={costoDeObra(costos, obraId)} sufijo="obra" />
}

/** El mismo costo del trabajo, en la línea que aparece debajo de 1250px. */
export function CostoDeLaObraAngosto({ costos, obraId, veEconomia, sangria }: {
  costos: ReadonlyMap<string, CostoDeObra> | null
  obraId: string
  veEconomia: boolean
  sangria: number
}) {
  if (!veEconomia) return null
  return <LineaAngosta f={costoDeObra(costos, obraId)} sufijo="obra" sangria={sangria} />
}

export function CostoDelCliente({ costos, sinObra, clienteId, obraIds, veEconomia }: {
  costos: ReadonlyMap<string, CostoDeObra> | null
  sinObra: ReadonlyMap<string, GastoSinObra> | null
  clienteId: string
  obraIds: readonly string[]
  veEconomia: boolean
}) {
  if (!veEconomia) return <><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /></>
  return <Celdas f={costoDelCliente(costos, sinObra, clienteId, obraIds)} sufijo="cliente" />
}

/** El mismo total del cliente, en la línea que aparece debajo de 1250px. */
export function CostoDelClienteAngosto({ costos, sinObra, clienteId, obraIds, veEconomia }: {
  costos: ReadonlyMap<string, CostoDeObra> | null
  sinObra: ReadonlyMap<string, GastoSinObra> | null
  clienteId: string
  obraIds: readonly string[]
  veEconomia: boolean
}) {
  if (!veEconomia) return null
  return <LineaAngosta f={costoDelCliente(costos, sinObra, clienteId, obraIds)} sufijo="cliente" sangria={24} />
}
