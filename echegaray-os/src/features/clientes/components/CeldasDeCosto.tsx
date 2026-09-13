// LAS CELDAS DE COSTO A LA FECHA DE LA CARTERA — Materiales y Mano de obra (dueño, 13/09/2026).
//
// «Que las columnas de materiales y mano de obra del módulo CRM muestren los costos hasta el momento,
// sumados, de cada obra de cada cliente, no lo presupuestado; eso tiene que estar dentro de cada obra.»
//
// Reemplazan a `ComponenteDelContrato`, que dibujaba lo que el PAPEL fijaba de cada componente. La
// ficha del cliente ya dibujaba el costo a la fecha: estas celdas NO deciden qué significa un hueco,
// delegan en `services/costosDeObra.ts` —las mismas funciones y los mismos tests que la ficha—, así
// la cartera y la ficha no pueden publicar dos costos distintos del mismo trabajo.

import { V } from '@/shared/components/v2/patron'
import { plata } from '@/shared/utils/format'
import {
  textoManoObra, textoMateriales, textoTotalManoObra, textoTotalMateriales, tituloManoObra,
  tituloMateriales, totalesDelCliente, type CostoDeObra, type GastoSinObra,
} from '../services/costosDeObra'
import { SOLO_ANCHO } from './CeldasDeCartera'

const CELDA = 'flex items-center justify-end tabular-nums truncate'

const NO_PUEDO = 'No puedo leer el costo a la fecha: lo ve Administración.'

/** Un texto de celda: mono cuando es plata, tipografía de texto cuando es una frase. */
function Celda({ texto, parcial, titulo, testid, estado }: {
  texto: string
  parcial: boolean
  titulo: string | null
  testid: string
  estado: string
}) {
  return (
    <span className={`${CELDA} ${texto.startsWith('$') ? 'font-mono' : ''} ${SOLO_ANCHO}`}
      data-testid={testid} data-estado={estado} title={titulo ?? undefined}
      style={{ fontSize: '11.5px', color: parcial ? V.warn : V.tintaSuave, textAlign: 'right' }}>
      {texto}
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
  if (!veEconomia) return <><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /></>
  const estado = costos === null ? 'sin-leer' : 'a-la-fecha'
  if (costos === null) {
    return (
      <>
        <Celda testid="materiales-obra" estado={estado} texto="" parcial={false} titulo={NO_PUEDO} />
        <Celda testid="mano-obra-obra" estado={estado} texto="" parcial={false} titulo={NO_PUEDO} />
      </>
    )
  }
  const c = costos.get(obraId) ?? null
  const mo = textoManoObra(c)
  return (
    <>
      <Celda testid="materiales-obra" estado={estado} texto={textoMateriales(c)} parcial={false} titulo={tituloMateriales(c)} />
      {/* SIN INICIO DE OBRA: la cartera no transporta `hh_obra`, y pedirlo sería otra definición. */}
      <Celda testid="mano-obra-obra" estado={estado} texto={mo.texto} parcial={mo.parcial} titulo={tituloManoObra(c, null)} />
    </>
  )
}

/**
 * LOS DOS TOTALES DEL CLIENTE, sumados por `totalesDelCliente` de las MISMAS filas que se ven debajo
 * más lo que Compras le imputa sin obra. Es la función del pie de la ficha: una suma, dos pantallas.
 */
export function CostoDelCliente({ costos, sinObra, clienteId, obraIds, veEconomia }: {
  costos: ReadonlyMap<string, CostoDeObra> | null
  sinObra: ReadonlyMap<string, GastoSinObra> | null
  clienteId: string
  obraIds: readonly string[]
  veEconomia: boolean
}) {
  if (!veEconomia) return <><span className={SOLO_ANCHO} /><span className={SOLO_ANCHO} /></>
  const t = totalesDelCliente(costos, obraIds, sinObra?.get(clienteId) ?? null)
  const mo = textoTotalManoObra(t)
  // LO SIN OBRA ENTRA AL TOTAL Y SE DICE: sin la frase, el total del cliente no cierra contra las
  // filas de sus obras y la diferencia se lee como un error.
  const tituloMat = !t.legible
    ? NO_PUEDO
    : 'Suma a la fecha de lo comprado para sus trabajos en curso (Compras, columna K)'
      + (t.materialesSinObra != null ? `, incluidos ${plata(t.materialesSinObra)} sin obra asignada` : '')
      + '. Sin nómina, cargas, ARCA, financiero ni compras con fecha futura.'
  const tituloMo = !t.legible
    ? NO_PUEDO
    : 'Suma de las horas propias valorizadas (valor hora vigente × horas × cargas) de sus trabajos en curso.'
      + (t.manoObraParcial ? ` QUEDAN ${Math.round(t.horasSinValorizar).toLocaleString('es-AR')} h AFUERA: falta el dato para valorizarlas.` : '')
  const estado = t.legible ? 'a-la-fecha' : 'sin-leer'
  return (
    <>
      <Celda testid="materiales-cliente" estado={estado} texto={textoTotalMateriales(t)} parcial={false} titulo={tituloMat} />
      <Celda testid="mano-obra-cliente" estado={estado} texto={mo.texto} parcial={mo.parcial} titulo={tituloMo} />
    </>
  )
}
