// EL ACUMULADO DEL CLIENTE, EN EL PIE DE SU TABLA DE TRABAJOS.
//
// «Un acumulado HH del CLIENTE (suma de sus obras)» (dueño, 11/09/2026) y «los costos de obra
// aparejados» (12/09/2026), en los cuatro rubros del 18/09/2026. Las cifras van acá y no en la fila de KPIs del titular por una
// razón de verdad y no de diseño: `hh_obra` y `costo_obra` viajan SÓLO en la cara Obras —es la única
// que las dibuja— y en las otras ocho la cifra tendría que decir «no la tengo», que a la velocidad
// con que se lee una fila de KPIs se lee como un cero.
//
// NO SON TARJETAS: es una línea de totales alineada a la derecha, como la de cualquier tabla. La
// skill de diseño prohíbe con nombre una card por dato.
//
// `null` NO ES CERO, y cada cifra lo dice a su manera: las HH «no puedo leerlas» (permiso), los
// materiales «—» (ninguna compra imputada) y la mano de obra «sin valorizar» cuando hay horas y falta
// el dato para convertirlas en costo. Un «$ 0» sobre un cliente con 13.221 h cargadas es la peor de
// las respuestas posibles.

import { V } from '@/shared/components/v2/patron'
import { hh as formatoHH, plata } from '@/shared/utils/format'
import { ROTULO_MANO_OBRA, ROTULO_MATERIALES, ROTULO_OTROS, ROTULO_SUBCONTRATOS, type TotalesDelCliente } from '../services/costosDeObra'

const AYUDA_HH = 'Suma de las horas hombre de todos los trabajos de este cliente. Cada trabajo '
  + 'publica las suyas: un adicional no suma a su obra mayor, así que ninguna hora se cuenta dos veces.'

const AYUDA_MATERIALES = 'Suma a la fecha de lo comprado para este cliente (pestaña Compras): lo '
  + 'asignado a cada trabajo MÁS los gastos sin obra asignada. Sin nómina, cargas, ARCA, financiero, '
  + 'filas anuladas ni compras con fecha futura; sin subcontratos ni equipos, servicios, combustible y '
  + 'fletes, que van en sus columnas.'

const AYUDA_SUBCONTRATOS = 'Suma a la fecha de los subcontratos del cliente (proveedores marcados «Subcontratista» '
  + 'o familia «Subcontratos y mano de obra»): lo de cada trabajo MÁS lo sin obra asignada.'

/** EL CUARTO RUBRO (dueño, 18/09/2026). Lo sin obra NO entra: `compras_sin_obra_de_clientes` no lo
 *  abre, y sumar sólo lo de las obras y decir «más lo sin obra» sería mentir sobre la mitad. */
const AYUDA_OTROS = 'Suma a la fecha de alquiler y traslado de equipos, servicios de obra (baño, contenedor, '
  + 'agua), combustible, fletes y honorarios de todos sus trabajos. Hasta el 18/09/2026 iban dentro de '
  + 'Materiales. Lo sin obra asignada no se abre por rubro y no entra acá.'

/** Lo gastado y lo trabajado, sumado de las MISMAS filas que la tabla de arriba. */
export function PieDeLosTrabajos({ hh, obras, costos }: {
  /** Σ de las HH de los trabajos del cliente. `null` = no se pudieron leer. */
  hh: number | null
  obras: number
  costos: TotalesDelCliente
}) {
  return (
    <p
      data-testid="pie-trabajos-cliente"
      style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 24,
        flexWrap: 'wrap', fontSize: '11.5px', color: V.apagado, padding: '10px 16px 0 0',
      }}
    >
      <span data-testid="hh-del-cliente" title={AYUDA_HH} style={LINEA}>
        <Rotulo texto="HH acumuladas" />
        <Cifra texto={formatoHH(hh) ?? 'no puedo leerlas'} />
        <span style={{ color: V.tenue }}>
          {obras === 1 ? 'en su único trabajo' : `en sus ${obras} trabajos`}
        </span>
      </span>

      <span data-testid="materiales-del-cliente" title={AYUDA_MATERIALES} style={LINEA}>
        <Rotulo texto={ROTULO_MATERIALES} />
        {/* NO PUDE LEERLO NO ES «—». Con la clave sin llegar —cara que no la transporta, rol que no
            la ve, migración sin aplicar— «—» afirmaría que ningún trabajo tiene una compra imputada,
            que es exactamente lo contrario de no saberlo. Visto en la captura de Quattropani. */}
        <Cifra texto={costos.legible ? plata(costos.materiales) : 'no puedo leerlos'} />
        {/* EL TOTAL INCLUYE LO SIN OBRA, Y LO DICE: sin esta marca, la suma del pie no cerraría contra
            las filas de arriba y la diferencia se leería como un error. */}
        {costos.legible && costos.materialesSinObra != null && (
          <span data-testid="materiales-sin-obra-en-pie" style={{ color: V.tenue }}>
            {`incl. ${plata(costos.materialesSinObra)} sin obra`}
          </span>
        )}
      </span>

      <span data-testid="subcontratos-del-cliente" title={AYUDA_SUBCONTRATOS} style={LINEA}>
        <Rotulo texto={ROTULO_SUBCONTRATOS} />
        <Cifra texto={costos.legible ? plata(costos.subcontratos) : 'no puedo leerlos'} />
      </span>

      {/* OTROS, SUMADO DE LAS MISMAS FILAS QUE LA COLUMNA DE ARRIBA (`totalesDelCliente`, `t.otros`).
          «—» = ningún trabajo tiene un comprobante de este rubro; «no puedo leerlos» = no se leyó. */}
      <span data-testid="otros-del-cliente" title={AYUDA_OTROS} style={LINEA}>
        <Rotulo texto={ROTULO_OTROS} />
        <Cifra texto={costos.legible ? plata(costos.otros) : 'no puedo leerlos'} />
      </span>

      {/* LA MANO DE OBRA DICE SI EL TOTAL ESTÁ COMPLETO. Un total al que le faltan 12.500 horas
          publicado liso se lee como el costo de la mano de obra del cliente; es el mismo defecto que
          la solapa «Costo a la obra» evita diciendo «N obras sin costo publicable». */}
      <span data-testid="mano-obra-del-cliente" title={tituloManoObra(costos)} style={LINEA}>
        <Rotulo texto={ROTULO_MANO_OBRA} />
        <Cifra
          texto={!costos.legible
            ? 'no puedo leerla'
            : costos.manoObra == null ? 'sin valorizar' : plata(costos.manoObra)}
          tono={costos.manoObraParcial ? V.warn : undefined}
        />
        {costos.manoObraParcial && costos.manoObra != null && (
          <span style={{ color: V.warn }}>parcial</span>
        )}
      </span>
    </p>
  )
}

function tituloManoObra(c: TotalesDelCliente): string {
  if (!c.legible) {
    return 'No puedo leer el costo de la mano de obra de este cliente: lo ve Administración, y sólo '
      + 'en la cara Trabajos.'
  }
  const base = 'Suma de la mano de obra propia con la definición de la solapa «Costo a la obra» de '
    + 'Liquidación: costo total empleador del recibo + parte en negro, repartidos por horas.'
  if (!c.manoObraParcial) return base
  const h = Math.round(c.horasSinValorizar).toLocaleString('es-AR')
  return `${base} QUEDAN ${h} h AFUERA: falta el dato para valorizarlas —la `
    + 'tarifa de alguien—, y el detalle de cada trabajo dice cuál.'
}

const LINEA = { display: 'flex', alignItems: 'baseline', gap: 8 } as const

function Rotulo({ texto }: { texto: string }) {
  return (
    <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.tenue }}>
      {texto}
    </span>
  )
}

function Cifra({ texto, tono }: { texto: string; tono?: string }) {
  return (
    <span className="font-mono tabular-nums" style={{ fontSize: '12.5px', color: tono ?? V.tinta }}>
      {texto}
    </span>
  )
}
