'use client'

// 15 · PRESUPUESTO EDICIÓN, la tabla — porte literal de
// `echegaray-design/15 · Presupuesto Edición.dc.html` (líneas 128-176).
//
// ═══ LA EDICIÓN ES EN EL LUGAR, Y YA GUARDABA ═══
//
// Código, descripción, unidad, cantidad y horas por unidad se escriben en la celda y se guardan al
// salir del campo (`CeldaEditable` → `editarCampoPartida`). Eso no cambió con el porte: lo que
// cambió es que ahora la tabla se ve como el canónico. El dueño fue explícito —«que si quiero
// editar edite ahí mismo, no me sirve que me cargue y me lleve a otro lado»— y esta pantalla ya lo
// cumplía; el porte no podía romperlo.
//
// ═══ DOS COLUMNAS SE RENOMBRAN, Y NO ES COSMÉTICA ═══
//
// Decían «P. unit.» y «Total». Lo que traen es `costo_unitario` y `subtotal` de
// `cotizacion_partida_valorizada`, que son COSTO — el precio sale recién de la cascada, aplicando
// los ocho porcentajes sobre el costo directo. Con los rótulos viejos, la misma palabra «Total»
// significaba COSTO en la fila y PRECIO en el pie de la misma tabla, a quince renglones de
// distancia. Ahora dicen COSTO UNIT. y COSTO. Es la regla de oro 6 aplicada a un rótulo: no
// confundir lo que se gasta con lo que se cobra.
//
// El canónico dibuja «P. UNIT.» y «TOTAL» como columnas siempre visibles y «COSTO» y «MARGEN» detrás
// del interruptor «Costo y margen». Ese modelo supone un precio POR PARTIDA, y en esta base no
// existe: el margen se aplica al conjunto, no partida por partida. Dibujar cuatro columnas donde
// hay dos datos sería inventar dos.
//
// ═══ UNA COLUMNA QUE EL CANÓNICO NO TIENE: HS/UN. ═══
//
// Es el rendimiento, y es EDITABLE: escribirlo acá gana sobre el del análisis (el `coalesce` de la
// vista prefiere el de la partida), sube las HH y el plazo y NO cambia el costo. Es una capacidad
// real que ya estaba; sacarla para parecerse más al mockup sería perder una palanca de cotización.
//
// ═══ EL RUBRO ES UNA FILA DE AGRUPACIÓN, NO UNA ENTIDAD ═══
//
// `cotizacion_partida.rubro` es un texto de la partida. La fila de rubro se arma agrupando lo que la
// vista ya devolvió, y su subtotal suma las partidas que TIENEN subtotal — las que no lo tienen no
// cuentan como cero, se declaran al lado. Pliega, como en el canónico: un presupuesto de 68 partidas
// se recorre por rubro. Se abre por defecto — cerrar todo esconde el trabajo.
//
// ═══ EL TOTAL DE LA TABLA NO SE SUMA ACÁ ═══
//
// Sale de `cotizacion_cascada`, que es el mismo número que abre la franja de arriba. Sumar las filas
// otra vez daría un segundo camino al mismo total, y el día que difieran —una partida filtrada por
// el buscador, un `null` contado como cero— nadie sabría cuál mirar.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { BotonAccion } from '@/shared/components/ui'
import {
  ALTO, C, CeldaTexto, EncabezadoCanon, FilaCanon, PieCanon, TarjetaTabla, VacioCanon,
  BuscadorCaja, IcoAlerta, IcoChevron, IcoQuitar, entero, pesos, porcentajeCanon,
} from '@/shared/components/canon'
import type { PartidaValorizada } from '../types'
import {
  contarFaltantes, filasDeLaTabla, filtrarPartidas, filtrarPorFalta, faltantesDe,
  type FaltaPartida,
} from '../services/partidas'
import { importe, rendimiento } from '../services/formato'
import { quitarPartida } from '../services/actionsPartida'
import { CeldaEditable } from './CeldaEditable'

/**
 * `15`, línea 130, con dos cambios declarados arriba: entra HS/UN. (80px, tomado del mismo ancho
 * que HH) y la columna de acciones pasa de 26px a 60px porque lleva DOS acciones —abrir el análisis
 * y quitar la partida— y el canónico sólo dibuja la primera.
 */
const COLS = 'minmax(0,1.9fr) 44px 84px 80px 80px 116px 116px 60px'

export function TablaPartidas({
  partidas,
  cotizacionId,
  costoDirecto,
  hhPrevistas,
  precioVenta,
  margenPct,
  seleccionada,
  congelado,
  accion,
}: {
  partidas: PartidaValorizada[]
  cotizacionId: string
  costoDirecto: number | null
  /** Los tres del pie salen de `cotizacion_cascada`, igual que el costo directo: nunca se suman acá. */
  hhPrevistas: number | null
  precioVenta: number | null
  margenPct: number | null
  seleccionada: string | null
  congelado: boolean
  accion?: React.ReactNode
}) {
  const [busqueda, setBusqueda] = useState('')
  const [falta, setFalta] = useState<FaltaPartida | null>(null)
  const [cerrados, setCerrados] = useState<string[]>([])

  const deuda = useMemo(() => contarFaltantes(partidas), [partidas])
  const visibles = useMemo(
    () => filtrarPorFalta(filtrarPartidas(partidas, busqueda), falta),
    [partidas, busqueda, falta],
  )
  const filas = useMemo(() => filasDeLaTabla(visibles, costoDirecto), [visibles, costoDirecto])

  function alternar(clave: string) {
    setCerrados((v) => (v.includes(clave) ? v.filter((x) => x !== clave) : [...v, clave]))
  }

  return (
    <div className="min-w-0">
      {/* LA BARRA DE HERRAMIENTAS DEL CANÓNICO (`15:98`): la acción primaria a la izquierda, el
          buscador de 214px y los chips de deuda de carga. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 10px', flexWrap: 'wrap' }}>
        {accion}
        <div style={{ marginLeft: 6 }}>
          <BuscadorCaja
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar partida"
            ancho={214}
            testid="buscador-partidas"
          />
        </div>
        {busqueda && (
          <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: C.tenue }} data-testid="cuenta-partidas">
            {visibles.length} de {partidas.length}
          </span>
        )}
        <Chip
          n={deuda.sinAnalisis}
          activo={falta === 'sin_analisis'}
          onClick={() => setFalta((v) => (v === 'sin_analisis' ? null : 'sin_analisis'))}
          testid="chip-sin-analisis"
        >
          sin análisis
        </Chip>
        <Chip
          n={deuda.sinComputo}
          activo={falta === 'sin_computo'}
          onClick={() => setFalta((v) => (v === 'sin_computo' ? null : 'sin_computo'))}
          testid="chip-sin-computo"
        >
          sin cómputo
        </Chip>
      </div>

      <TarjetaTabla testid="tabla-partidas" cols={COLS}>
        <EncabezadoCanon
          cols={COLS}
          columnas={[
            { rotulo: 'PARTIDA' },
            { rotulo: 'UN.' },
            { rotulo: 'CANT.', alineacion: 'derecha' },
            { rotulo: 'HS/UN.', alineacion: 'derecha' },
            { rotulo: 'HH', alineacion: 'derecha' },
            { rotulo: 'COSTO UNIT.', alineacion: 'derecha' },
            { rotulo: 'COSTO', alineacion: 'derecha' },
            { rotulo: '', vacia: true },
          ]}
        />

        {filas.map((f) => {
          if (f.tipo === 'rubro') {
            const abierto = !cerrados.includes(f.clave)
            return (
              <FilaCanon
                key={f.clave}
                cols={COLS}
                alto={ALTO.filaRubro}
                fondo={C.superficieRubro}
                onClick={() => alternar(f.clave)}
                testid="fila-rubro"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}>
                    <IcoChevron s={11} w={2.4} rotacion={abierto ? 'rotate(90deg)' : 'rotate(0deg)'} />
                  </span>
                  <span
                    className="truncate"
                    style={{ fontSize: '11.5px', fontWeight: 600, color: C.tinta, letterSpacing: '.05em', minWidth: 0 }}
                  >
                    {f.nombre}
                  </span>
                  {f.nSinAnalisis > 0 && (
                    <span
                      title={`${f.nSinAnalisis} ${f.nSinAnalisis === 1 ? 'partida sin análisis' : 'partidas sin análisis'}`}
                      style={{ display: 'flex', color: C.warn, flexShrink: 0 }}
                    >
                      <IcoAlerta s={13} />
                    </span>
                  )}
                </div>
                <span /><span />
                <span />
                <CeldaTexto mono tam="11.5px" alineacion="derecha" color={C.tintaSuave}>
                  {entero(f.hh) ?? 'sin dato'}
                </CeldaTexto>
                <span />
                <CeldaTexto mono tam="12px" peso={600} alineacion="derecha" color={C.tinta}>
                  {pesos(f.subtotal) ?? 'sin cargar'}
                </CeldaTexto>
                <span />
              </FilaCanon>
            )
          }
          if (cerrados.includes(f.rubroClave)) return null
          return (
            <FilaPartida
              key={f.clave}
              p={f.partida}
              cotizacionId={cotizacionId}
              seleccionada={seleccionada === f.partida.partida_id}
              congelado={congelado}
            />
          )
        })}

        {visibles.length === 0 && (
          <VacioCanon testid="partidas-vacias">
            {partidas.length === 0 ? (
              'Este presupuesto todavía no tiene partidas. Sin partidas no hay costo directo, y sin costo directo no hay precio.'
            ) : falta !== null ? (
              <>
                Ninguna partida queda {falta === 'sin_analisis' ? 'sin análisis' : 'sin cómputo'} con lo que buscaste.{' '}
                <button type="button" onClick={() => setFalta(null)} style={{ color: C.tinta, textDecoration: 'underline', textUnderlineOffset: 2 }}>Ver todas</button>.
              </>
            ) : (
              <>
                Nada coincide con «{busqueda}».{' '}
                <button type="button" onClick={() => setBusqueda('')} style={{ color: C.tinta, textDecoration: 'underline', textUnderlineOffset: 2 }}>Ver todo</button>.
              </>
            )}
          </VacioCanon>
        )}

        {/* EL PIE SALE DE LA VISTA, NO DE LA SUMA DE ARRIBA (canon 15: HH TOTALES · COSTO · TOTAL ·
            MARGEN). Los cuatro son los mismos números de la franja de arriba, y ésa es la razón de
            que estén: al pie de 68 filas la franja quedó tres pantallas atrás, y quien termina de
            recorrer el cómputo necesita ver contra qué total lo estuvo comparando sin volver a
            subir. Repetir el número es barato; recalcularlo sería otro camino al mismo total.

            Acá «TOTAL» SÍ es precio de venta, y por eso las columnas de arriba dejaron de llamarse
            «Total»: en la misma tabla no pueden convivir dos totales que significan cosas
            distintas. */}
        <div data-testid="pie-presupuesto">
          <PieCanon
            totales={[
              { rotulo: 'HH TOTALES', valor: entero(hhPrevistas) ?? 'sin cargar', testid: 'total-hh' },
              { rotulo: 'COSTO', valor: pesos(costoDirecto) ?? 'sin cargar', testid: 'total-costo-directo' },
              { rotulo: 'TOTAL', valor: pesos(precioVenta) ?? 'sin cargar', fuerte: true, testid: 'total-precio-venta' },
              {
                rotulo: 'MARGEN',
                valor: porcentajeCanon(margenPct) ?? 'sin dato',
                color: margenPct === null ? C.tenue : C.pos,
                testid: 'total-margen',
              },
            ]}
          />
        </div>
      </TarjetaTabla>
    </div>
  )
}

/**
 * Un chip de deuda de carga. En CERO no se dibuja: «0 sin análisis» es una felicitación, y una
 * barra con dos felicitaciones permanentes es exactamente el ruido que el rediseño saca.
 *
 * Los colores son los del canónico (`15:110`): texto y borde ámbar sobre `#FDF6EE`.
 */
function Chip({ n, activo, onClick, children, testid }: {
  n: number; activo: boolean; onClick: () => void; children: React.ReactNode; testid: string
}) {
  if (n === 0) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 500,
        color: C.warn, background: activo ? '#F7E7D2' : '#FDF6EE',
        border: '1px solid #F0E1CD', borderRadius: 6, padding: '5px 10px',
      }}
    >
      <IcoAlerta s={14} />
      <span className="font-mono tabular-nums">{n}</span>
      {children}
    </button>
  )
}

function FilaPartida({
  p, cotizacionId, seleccionada, congelado,
}: {
  p: PartidaValorizada
  cotizacionId: string
  seleccionada: boolean
  congelado: boolean
}) {
  const faltantes = faltantesDe(p)
  const base = `/presupuestos/${cotizacionId}`
  return (
    <FilaCanon
      cols={COLS}
      alto={ALTO.filaPartida}
      seleccionada={seleccionada}
      testid="fila-partida"
      data-partida={p.partida_id}
    >
      {/* SANGRÍA DE 18px, como el canónico: es lo que hace que la partida se lea como hija de su
          rubro sin necesidad de una línea ni de un color. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingLeft: 18 }}>
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="codigo"
          valor={p.codigo ?? ''} mono ancho="w-[58px]" placeholder="s/c"
          deshabilitada={congelado} testid={`codigo-${p.partida_id}`} />
        <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="descripcion"
          valor={p.descripcion} deshabilitada={congelado} testid={`descripcion-${p.partida_id}`} />
        {faltantes.map((f) => (
          <span
            key={f}
            title={f}
            data-testid="badge-falta"
            style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.warn, flexShrink: 0 }}
          >
            <IcoAlerta s={13} />
            <span style={{ fontSize: '9.5px' }}>{f}</span>
          </span>
        ))}
      </div>

      <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="unidad"
        valor={p.unidad ?? ''} ancho="w-[38px]" placeholder="un." deshabilitada={congelado} />

      <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="cantidad"
        valor={p.cantidad === null ? '' : String(p.cantidad).replace('.', ',')} alineacion="derecha"
        mono ancho="w-full" deshabilitada={congelado} testid={`cantidad-${p.partida_id}`} />

      {/* HS/UN. es el esfuerzo. Escribirlo acá GANA sobre el del análisis: el `coalesce` de la vista
          prefiere el de la partida. Sube las HH y el plazo; NO cambia el costo. */}
      <CeldaEditable partidaId={p.partida_id} cotizacionId={cotizacionId} campo="hs_unitarias"
        valor={p.hs_unitarias === null ? '' : rendimiento(p.hs_unitarias)!} alineacion="derecha"
        mono ancho="w-full" placeholder="sin dato" deshabilitada={congelado}
        testid={`hs-${p.partida_id}`} />

      <CeldaTexto mono tam="11.5px" alineacion="derecha" color={p.hh === null ? C.warn : C.tinta}>
        {entero(p.hh) ?? 'sin cargar'}
      </CeldaTexto>

      <CeldaTexto mono tam="11.5px" alineacion="derecha" color={p.costo_unitario === null ? C.warn : C.tintaSuave}>
        {importe(p.costo_unitario) ?? 'sin precio'}
      </CeldaTexto>

      <CeldaTexto mono tam="12px" alineacion="derecha" color={p.subtotal === null ? C.warn : C.tinta}>
        {importe(p.subtotal) ?? 'sin precio'}
      </CeldaTexto>

      {/* El canónico dibuja UNA acción —el chevron que abre el análisis— y por eso su columna mide
          26px. Acá van dos, porque quitar una partida es una capacidad que ya existía y sacarla
          para parecerse más al mockup sería perderla. `BotonAccion` con tono peligro pide
          confirmación: borrar una partida se lleva su composición. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
        <Link
          href={`${base}?partida=${p.partida_id}`}
          prefetch={false}
          title="Ver el detalle en el panel"
          data-testid={`ver-${p.partida_id}`}
          className="flex text-[#C9C4C2] transition-colors hover:text-[#1F1F1E]"
        >
          <span className="sr-only">Ver el detalle en el panel</span>
          <IcoChevron s={15} />
        </Link>
        {!congelado && (
          <BotonAccion accion={quitarPartida} args={[p.partida_id, cotizacionId]}
            tono="peligro" testid={`borrar-${p.partida_id}`}
            className="[&_button]:border-transparent [&_button]:px-1 [&_button]:py-1 [&_button]:text-[#C9C4C2] [&_button:hover]:text-[#B42318]">
            <span title="Quitar la partida" className="flex items-center">
              <span className="sr-only">Quitar la partida</span>
              <IcoQuitar s={14} />
            </span>
          </BotonAccion>
        )}
      </div>
    </FilaCanon>
  )
}
