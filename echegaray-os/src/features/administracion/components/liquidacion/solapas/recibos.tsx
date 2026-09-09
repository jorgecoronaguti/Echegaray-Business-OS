// PANTALLA 12 · LOS TRES ESLABONES QUE YA VIVEN EN EL LEGAJO — la liquidación los lee, no los vuelve
// a pedir.
//
//   Retribución        `persona_tarifa` vigente, con su origen.
//   Ausencias          la tabla motivo → paga, literal, y las ausencias declaradas de la quincena.
//   Lote vs extracto   el recibo del estudio contra el giro que el banco muestra.
//
// ═══ R7 · UN RECIBO SIN GIRO NO CUENTA COMO BANCO ═══
//
// Que el estudio haya liquidado un neto no dice que la plata salió. Hasta que el extracto muestra el
// lote, esa plata sigue por pagar y la fila lo dice en ámbar: es pendiente accionable, no un error.
//
// ═══ Y UN CONTROL QUE NO PUDO MIRAR NO DICE «NO ESTÁ» ═══
//
// Sin extracto importado para la ventana, todos los recibos se verían «sin movimiento» y el cuadro
// acusaría a la administración de no haber pagado nada. Con `banco_movimientos` vacío en la ventana,
// la columna entera dice «sin extracto» y ninguna fila se marca. El repo ya pagó ese defecto con los
// seis falsos faltantes de Drive.
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No edita la retribución: eso es el bloque LABORAL del legajo, que ya tiene su formulario y su
// auditoría de cambios. Dos formularios sobre la misma columna serían dos definiciones del mismo
// dato. Y no sube el recibo del estudio: no hay bucket ni tabla de documentos de persona en el OS —
// `obra_documento`, `cliente_documento` y `proveedor_documento` existen; el de persona, no—. El botón
// está y está apagado, con el porqué escrito: apagado y explicado es un pedido; ausente es un olvido.

import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import {
  getAusenciasDeLaQuincena, getEslabonesDeLaQuincena, type EslabonPersona,
} from '../../../services/eslabonesLegajoService'
import { PAGA_POR_MOTIVO } from '../../../services/liquidacionDeAusencias'
import { esFechaISO, quincenaDe, rotuloQuincena } from '../../../services/quincena'
import { Cuadro, Cuerpo, Encabezado, Fila, Hueco, MONO, Titulo, Total, miles } from './tabla'

const COLS_RET = 'minmax(140px,1fr) 100px 150px'
const COLS_AUS = '86px minmax(110px,1fr) 150px'
const COLS_LOTE = 'minmax(110px,1fr) 100px 110px'

export async function SolapaRecibos({ quincenaPedida, hoy }: {
  quincenaPedida?: string; hoy: string
}) {
  const q = quincenaDe(esFechaISO(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const { personas, hayExtracto, sinGiro, errores } = await getEslabonesDeLaQuincena(supabase, q)
  const ausencias = await getAusenciasDeLaQuincena(
    supabase, q, new Map(personas.map((p) => [p.personaId, p.nombre])),
  )

  return (
    <section data-testid="solapa-recibos">
      <Titulo numero="12" titulo="Los tres eslabones que ya viven en el legajo"
        bajada="la liquidación los lee; no los vuelve a pedir." />

      {errores.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" testid="recibos-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 400 }}>
          <Cuadro testid="cuadro-retribucion">
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Retribución · bloque LABORAL</span>
            <Cuerpo>
              <Encabezado columnas={COLS_RET} celdas={['Persona', 'Retribución', 'Origen']} />
              {personas.slice(0, 8).map((p) => (
                <Fila key={p.personaId} columnas={COLS_RET} alto={46} testid={`retribucion-${p.personaId}`} celdas={[
                  <Nombre key="n">{p.nombre}</Nombre>,
                  p.valorHora != null
                    ? `${miles(p.valorHora)} $/h`
                    : p.netoMensual != null
                      ? `${miles(p.netoMensual)} /mes`
                      : <Hueco key="r">sin retribución</Hueco>,
                  <Hueco key="o"><span style={{ fontSize: '10.5px' }}>{p.origenTarifa ?? 'sin origen'}</span></Hueco>,
                ]} />
              ))}
              {personas.length > 8 && (
                <Fila columnas={COLS_RET} alto={34} tenue celdas={[`${personas.length - 8} más`, '', '']} />
              )}
            </Cuerpo>
            <p style={{ margin: 0, fontSize: '11px', color: V.apagado, lineHeight: 1.55 }}>
              Se edita en el bloque LABORAL del legajo, no acá: dos formularios sobre la misma columna
              serían dos definiciones del mismo dato. Al cerrar, la quincena sella el valor hora que usó.
            </p>
          </Cuadro>
        </div>

        <div style={{ flex: 1, minWidth: 400 }}>
          <Cuadro testid="cuadro-ausencias">
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Ausencia · el motivo decide la paga</span>
            <Cuerpo>
              <Encabezado columnas={COLS_AUS} celdas={['Día', 'Persona', 'Motivo']} />
              {ausencias.length === 0 && (
                <Fila columnas={COLS_AUS} alto={44} tenue celdas={[
                  `Sin ausencias declaradas en ${rotuloQuincena(q)}.`, '', '',
                ]} />
              )}
              {ausencias.slice(0, 6).map((a) => {
                const paga = a.motivo ? PAGA_POR_MOTIVO[a.motivo.trim()]?.paga === true : false
                return (
                  <Fila key={`${a.personaId}-${a.fecha}`} columnas={COLS_AUS} alto={46}
                    testid={`ausencia-${a.personaId}-${a.fecha}`} celdas={[
                      <span key="f" style={{ fontFamily: MONO, fontSize: '11.5px' }}>{a.fecha.slice(8, 10)}/{a.fecha.slice(5, 7)}</span>,
                      <Nombre key="n">{a.nombre}</Nombre>,
                      <span key="m" style={{ color: paga ? V.apagado : V.neg, fontSize: '11.5px' }}>
                        {a.motivo?.trim() || 'sin motivo'} · {paga ? 'paga' : '0 h'}
                      </span>,
                    ]} />
                )
              })}
              {ausencias.length > 6 && (
                <Fila columnas={COLS_AUS} alto={34} tenue celdas={[`${ausencias.length - 6} más`, '', '']} />
              )}
            </Cuerpo>
            <TablaDeMotivos />
          </Cuadro>
        </div>

        <div style={{ flex: 1, minWidth: 400 }}>
          <Cuadro testid="cuadro-lote">
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Lote contra extracto · Documentos</span>
            <Cuerpo>
              <Encabezado columnas={COLS_LOTE} celdas={['Persona', 'Neto recibo', 'Extracto']} />
              {personas.filter((p) => p.reciboNeto != null || p.chip != null).slice(0, 8)
                .map((p) => <FilaLote key={p.personaId} p={p} hayExtracto={hayExtracto} />)}
              {personas.every((p) => p.reciboNeto == null && p.chip == null) && (
                <Fila columnas={COLS_LOTE} alto={44} tenue celdas={[
                  'Ningún recibo del estudio para esta quincena.', '', '',
                ]} />
              )}
              <Total columnas={COLS_LOTE} testid="total-sin-giro" celdas={[
                'Sin giro',
                hayExtracto
                  ? <span key="s" style={{ color: sinGiro > 0 ? V.warn : V.tinta }}>{miles(sinGiro)}</span>
                  : <Hueco key="s"><span style={{ fontWeight: 400 }}>sin extracto</span></Hueco>,
                '',
              ]} />
            </Cuerpo>
            <SubirRecibo />
          </Cuadro>
        </div>
      </div>
    </section>
  )
}

/** Una fila del lote. El ámbar es pendiente accionable; sin extracto no hay color ni acusación. */
function FilaLote({ p, hayExtracto }: { p: EslabonPersona; hayExtracto: boolean }) {
  return (
    <Fila columnas={COLS_LOTE} alto={46} testid={`lote-${p.personaId}`} celdas={[
      <span key="n" style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <Nombre>{p.nombre}</Nombre>
        {p.chip && (
          <span style={{
            flex: 'none', fontSize: '10px', color: p.chip === 'cargado' ? '#067647' : V.warn,
          }}>{p.chip}</span>
        )}
      </span>,
      p.reciboNeto != null ? miles(p.reciboNeto) : <Hueco key="r">sin recibo</Hueco>,
      !hayExtracto
        ? <Hueco key="e"><span style={{ fontSize: '11px' }}>sin extracto</span></Hueco>
        : p.giroEnElLote
          ? <span key="e" style={{ fontSize: '11px', color: '#067647' }}>conciliado</span>
          : <span key="e" style={{ fontSize: '11px', color: V.warn }}>sin movimiento</span>,
    ]} />
  )
}

/**
 * LA TABLA LITERAL DE `PAGA_POR_MOTIVO`, GENERADA DE LA CONSTANTE Y NO TIPEADA.
 *
 * Escribir los motivos a mano en el JSX crearía una segunda definición de qué se paga: el día que el
 * dueño agregue un motivo, la pantalla seguiría mostrando la lista vieja y nadie se enteraría.
 */
function TablaDeMotivos() {
  const pagan = Object.entries(PAGA_POR_MOTIVO).filter(([, r]) => r.paga).map(([m]) => m)
  const noPagan = Object.entries(PAGA_POR_MOTIVO).filter(([, r]) => !r.paga).map(([m]) => m)
  return (
    <p data-testid="tabla-motivos" style={{ margin: 0, fontSize: '11px', color: V.apagado, lineHeight: 1.55 }}>
      <strong style={{ color: '#067647', fontWeight: 600 }}>Pagan</strong> {pagan.join(', ')}.{' '}
      <strong style={{ color: V.neg, fontWeight: 600 }}>No pagan</strong> {noPagan.join(', ')} y{' '}
      <strong style={{ color: V.neg, fontWeight: 600 }}>sin motivo</strong>.
    </p>
  )
}

/** El botón que no existe todavía, apagado y con el porqué. Ausente sería un olvido. */
function SubirRecibo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" disabled data-testid="cargar-recibo-estudio"
        style={{
          alignSelf: 'flex-start', height: 28, padding: '0 12px', border: `1px solid ${V.linea}`,
          borderRadius: 6, background: '#FFFFFF', color: V.tenue, fontSize: '11.5px', cursor: 'not-allowed',
        }}>
        Cargar el recibo del estudio
      </button>
      <span style={{ fontSize: '10.5px', color: V.tenue, lineHeight: 1.5 }}>
        Sin infraestructura de documentos de persona en el OS: hay bucket y tabla para obra, cliente y
        proveedor, no para el legajo. Hoy el recibo llega por <code>recibo_empleado</code> con su
        <code> drive_file_id</code>.
      </span>
    </div>
  )
}

const Nombre = ({ children }: { children: React.ReactNode }) => (
  <span style={{ display: 'block', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
    {children}
  </span>
)
