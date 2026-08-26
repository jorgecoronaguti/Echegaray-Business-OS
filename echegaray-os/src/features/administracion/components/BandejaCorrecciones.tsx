// 19c v2 · LA COLA DE CORRECCIONES Y SU PANEL — `19c · Asistencia Correcciones.dc.html` (84-190).
//
// La lista es una tabla sin caja: encabezado de 26px cerrado por un filo, filas de 44px con dos
// renglones adentro (nombre + fecha, qué pide + motivo) y la diferencia en mono a la derecha.
//
// ═══ EL PANEL COMPARA LO QUE HAY CON LO QUE SE PIDE ═══
//
// Es la decisión de diseño que hace resoluble esta pantalla: aprobar sin ver contra qué se compara
// es firmar a ciegas. Las dos mitades están una al lado de la otra —«Lo que quedó registrado» sobre
// gris, «Lo que pide» sobre el amarillo de selección— y abajo va el formulario que resuelve.
//
// ═══ LA COLUMNA «OBRA» DEL MOCKUP NO SE DIBUJA ═══
//
// `solicitud_correccion_asistencia` no guarda a qué obra pertenece el día, y la vista de la bandeja
// tampoco la trae. Cruzarla contra la asignación vigente daría la obra de HOY, no la del día que se
// está corrigiendo — que es justo el dato que decidiría a qué obra van esas horas.

import Link from 'next/link'
import {
  CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, RotuloPanel, V,
} from '@/shared/components/v2/patron'
import { IconoCerrar, IconoPersona } from '@/shared/components/iconos'
import { ResolverCorreccion } from './ResolverCorreccion'
import { diferenciaEnHoras, quePide, textoDeDiferencia } from '../services/bandejaCorrecciones'
import type { CorreccionEnBandeja } from '../services/correccionAsistenciaService'
import { hora } from '@/features/empleado/services/asistencia'
import { horaCorta } from '@/features/empleado/services/correccion'
import { dm } from '@/features/empleado/services/fecha'

const COLS
  = 'grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,120px)]'
  + ' max-[1249px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,110px)]'

export function ColaDeCorrecciones({ filas, abierta, hrefDe, vacio }: {
  filas: CorreccionEnBandeja[]
  abierta?: string
  hrefDe: (id: string) => string
  vacio: string
}) {
  return (
    <div data-testid="cola-correcciones">
      <div className={`grid gap-[14px] ${COLS}`} style={{ ...ENCABEZADO, paddingLeft: 13 }}>
        <RotuloCol>Persona</RotuloCol>
        <RotuloCol>Qué pide</RotuloCol>
        <RotuloCol derecha>Diferencia</RotuloCol>
      </div>

      {filas.length === 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 11, border: `1px dashed ${V.lineaFuerte}`,
            borderRadius: 10, padding: '22px 18px', marginTop: 12,
          }}
          data-testid="cola-vacia"
        >
          <span style={{ fontSize: '12.5px', lineHeight: 1.6, color: V.tintaSuave }}>{vacio}</span>
        </div>
      )}

      {filas.map((c) => {
        const dif = diferenciaEnHoras(c)
        const elegida = c.id === abierta
        return (
          <Link
            key={c.id} href={hrefDe(c.id)} prefetch={false} data-testid="correccion-pendiente"
            data-fecha={c.fecha} data-estado={c.estado}
            className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#F2F1ED]`}
            style={{
              height: 44, paddingLeft: 13, borderBottom: `1px solid ${V.lineaFila}`,
              background: elegida ? V.seleccion : 'transparent',
              // EL FILO ÁMBAR ES «ESTO BLOQUEA»: mientras el pedido no se resuelva, las HH de ese
              // día no son las que se van a liquidar.
              boxShadow: c.estado === 'pendiente' ? FILO_BLOQUEA : 'none',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <IconoPersona className="h-[15px] w-[15px]" />
              </span>
              <span style={{ minWidth: 0 }}>
                {/* Sin legajo al lado del nombre: `personas.legajo` no tiene grant para
                    `authenticated` y nombrarla en la vista la haría fallar entera. */}
                <span className="block truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
                  {c.nombre_completo}
                </span>
                <span className="block font-mono" style={{ fontSize: '11px', color: V.lupa, marginTop: 1 }}>
                  {dm(c.fecha)}
                </span>
              </span>
            </span>

            <span style={{ minWidth: 0 }}>
              <span className="block truncate" style={{ fontSize: '12px', color: V.tinta }}>
                {quePide(c)}
              </span>
              <span className="block truncate" style={{ fontSize: '11px', color: V.tenue, marginTop: 1 }}>
                {c.motivo}
              </span>
            </span>

            {/* SIN MEDIR NO ES 0 h: falta el otro extremo de la jornada y no se sabe cuánto mueve. */}
            <span
              className="font-mono tabular-nums"
              style={{
                fontSize: dif === null ? '11.5px' : '12.5px', fontWeight: 600, textAlign: 'right',
                color: dif === null ? V.tenue : (dif < 0 ? V.neg : V.warn),
              }}
            >
              {textoDeDiferencia(dif)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** Una mitad de la comparación del panel. `19c:148-158`. */
function Mitad({ rotulo, valor, nota, tono, elegida }: {
  rotulo: string
  valor: string
  nota: string
  tono?: string
  elegida?: boolean
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '11px 13px', background: elegida ? V.seleccion : '#FAFAF8' }}>
      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.tenue, marginBottom: 5 }}>
        {rotulo}
      </div>
      <div className="font-mono" style={{ fontSize: '15px', fontWeight: 600, color: V.tinta }}>{valor}</div>
      <div style={{ fontSize: '11px', color: tono ?? V.tenue, marginTop: 3 }}>{nota}</div>
    </div>
  )
}

export function PanelCorreccion({ c, cerrarHref }: { c: CorreccionEnBandeja; cerrarHref: string }) {
  const dif = diferenciaEnHoras(c)
  const registrada = c.tipo === 'salida' ? hora(c.salida) : hora(c.entrada)
  const contraria = c.tipo === 'salida' ? hora(c.entrada) : hora(c.salida)

  return (
    <div data-testid="panel-correccion" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: V.tinta, lineHeight: 1.25 }}>
            {c.nombre_completo}
          </div>
          <div style={{ fontSize: '12px', color: V.apagado, marginTop: 3 }}>
            {dm(c.fecha)} · pide {c.tipo === 'salida' ? 'la salida' : 'la entrada'}
          </div>
        </div>
        <Link href={cerrarHref} prefetch={false} title="Cerrar" data-testid="cerrar-panel" style={{ display: 'flex', color: V.tenue, flexShrink: 0 }}>
          <IconoCerrar className="h-[14px] w-[14px]" />
        </Link>
      </div>

      {/* APROBAR SIN VER CONTRA QUÉ SE COMPARA ES FIRMAR A CIEGAS. */}
      <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 18, border: `1px solid ${V.linea}`, borderRadius: 8, overflow: 'hidden' }}>
        <Mitad
          rotulo="Lo que quedó registrado"
          valor={registrada ?? 'sin marca'}
          nota={contraria ? `${c.tipo === 'salida' ? 'entró' : 'salió'} ${contraria}` : 'el otro extremo tampoco está'}
        />
        <div style={{ width: 1, background: V.linea }} />
        <Mitad
          elegida
          rotulo="Lo que pide"
          valor={horaCorta(c.hora_propuesta) ?? '—'}
          nota={textoDeDiferencia(dif)}
          tono={dif === null ? V.tenue : (dif < 0 ? V.neg : V.warn)}
        />
      </div>

      <div style={{ marginTop: 18 }}>
        <Dato k="Motivo" v={c.motivo} />
        <Dato k="Pedido el" v={dm(c.creado_en) ?? c.creado_en} />
        <Dato k="Estado" v={c.estado} />
        {c.nota_resolucion && <Dato k="Nota" v={c.nota_resolucion} />}
        {/* LA PRUEBA DEL EFECTO, no del trámite: `marca_id` es lo que demuestra que la aprobación
            llegó a la asistencia real. Una aprobada SIN marca es una inconsistencia. */}
        {c.estado === 'aprobada' && (
          <Dato
            k="Marca escrita"
            v={c.marca_id ? 'sí' : 'NO — el estado cambió y la asistencia no'}
            tono={c.marca_id ? undefined : V.neg}
          />
        )}
      </div>

      {/* QUE LA SALIDA YA EXISTA NO ES NORMAL —el pedido nace de un día sin salida— y si pasó,
          aprobar la va a PISAR. Se avisa antes, no después. */}
      {c.tipo === 'salida' && c.salida && c.estado === 'pendiente' && (
        <p style={{ fontSize: '12px', color: V.warn, marginTop: 14 }} data-testid="ya-tiene-salida">
          Ojo: ese día ya tiene salida registrada a las {hora(c.salida)}. Aprobar la reemplaza.
        </p>
      )}

      {c.estado === 'pendiente' && (
        <div style={{ marginTop: 20 }}>
          <RotuloPanel>Qué se registra</RotuloPanel>
          <ResolverCorreccion id={c.id} />
        </div>
      )}
    </div>
  )
}

function Dato({ k, v, tono }: { k: string; v: string; tono?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', borderBottom: `1px solid ${V.lineaPanel}` }}>
      <span style={{ fontSize: '11.5px', color: V.tenue, width: 104, flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: '12px', color: tono ?? V.tintaSuave, minWidth: 0, textWrap: 'pretty' }}>{v}</span>
    </div>
  )
}
