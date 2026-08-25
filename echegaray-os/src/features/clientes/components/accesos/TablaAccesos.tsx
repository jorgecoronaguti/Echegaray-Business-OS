'use client'

// «MAILS HABILITADOS» (`31:62`–`31:170`).
//
//   grilla   `minmax(0,1.7fr) 150px 132px 124px 76px`, `gap:12px`, filas `minHeight:58px`
//   avatar   círculo de 30px `#F2F1ED`; el que NUNCA entró lo lleva PUNTEADO sobre `#FAFAF8`
//   permisos tres íconos de 16px: `#1F1F1E` el que tiene, `#D7D5CF` el que no
//   ingreso  mono 12px + dispositivo 11px; sin ingresar, reloj `#B54708` y el texto en su color
//   acción   lápiz para editar; para el que no entró, el sobre de «Reenviar el mail de acceso»
//
// EL RENGLÓN DE ARRIBA ES LA REGLA: «el mail que carga acá es la llave: entra solo quien lo tiene».
// Está copiado del mockup porque es la frase que explica por qué esta tabla es peligrosa.

import { C, MONO, ROTULO_COL } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { BotonIcono, TituloBloque, Vacio } from '../canon/Piezas'
import { iniciales, momentoCorto } from '../../services/cobranzaFormato'
import { estaHabilitado, textoDeObras } from '../../services/reglasPortal'
import type { AccesoPortal } from '../../types/cobranzas'

const COLS = 'minmax(0,1.7fr) 150px 132px 124px 76px'

function Permiso({ tiene, titulo, d }: { tiene: boolean; titulo: string; d: React.ReactNode }) {
  return (
    <span title={titulo} style={{ display: 'flex', color: tiene ? C.tinta : C.apagado }}>
      <Ico d={d} s={16} />
    </span>
  )
}

export function TablaAccesos({ accesos, totalObras, hoy, elegido, onEditar, onReenviar, onRevocar }: {
  accesos: AccesoPortal[]
  totalObras: number
  hoy: string
  elegido: string | null
  onEditar: (id: string) => void
  onReenviar: (id: string) => void
  onRevocar: (id: string) => void
}) {
  return (
    <div data-testid="accesos">
      <TituloBloque
        icono={<Ico d={P.mail} s={15} />}
        titulo="Mails habilitados"
        derecha={
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: C.tenue }}>
            el mail que carga acá es la llave: entra solo quien lo tiene
          </span>
        }
      />

      <div style={{
        display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'end', height: '30px',
        borderBottom: `1px solid ${C.borde}`,
      }}>
        <span style={ROTULO_COL}>PERSONA Y MAIL</span>
        <span style={ROTULO_COL}>PUEDE</span>
        <span style={ROTULO_COL}>OBRAS</span>
        <span style={ROTULO_COL}>ÚLTIMO INGRESO</span>
        <span style={{ paddingBottom: '7px' }} />
      </div>

      {accesos.map((a) => {
        const vivo = estaHabilitado(a)
        const nuevo = a.primer_ingreso_at == null
        const ultimo = momentoCorto(a.ultimo_ingreso_at, hoy)
        return (
          <div
            key={a.id} data-testid={`fila-acceso-${a.id}`}
            style={{
              display: 'grid', gridTemplateColumns: COLS, gap: '12px', alignItems: 'center',
              minHeight: '58px', borderBottom: `1px solid ${C.bordeFila}`,
              background: elegido === a.id ? C.superficie : undefined,
              boxShadow: elegido === a.id ? `inset 3px 0 0 ${C.marca}` : undefined,
              opacity: vivo ? 1 : 0.6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '15px', flexShrink: 0,
                background: nuevo ? C.tenueFondo : '#F2F1ED',
                border: nuevo ? `1px dashed ${C.bordeFuerte}` : undefined,
                color: nuevo ? C.tenue : C.tintaMedia,
                fontSize: '10.5px', fontWeight: 600, display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}>{iniciales(a.persona_contacto ?? a.email)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12.5px', color: C.tinta }}>
                  {a.persona_contacto ?? 'sin nombre cargado'}
                  {!vivo && <span style={{ color: C.neg, marginLeft: '6px' }}>revocado</span>}
                </div>
                <div style={{
                  fontFamily: MONO, fontSize: '11px', color: C.tintaSuave, marginTop: '1px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.email}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
              <Permiso tiene={a.puede_ver_obra} titulo={a.puede_ver_obra ? 'Ve la obra' : 'No ve la obra'} d={P.ojo} />
              <Permiso tiene={a.puede_ver_montos} titulo={a.puede_ver_montos ? 'Ve montos y facturas' : 'No ve montos ni facturas'} d={P.montos} />
              <Permiso tiene={a.puede_aprobar} titulo={a.puede_aprobar ? 'Aprueba certificados' : 'No aprueba certificados'} d={P.aprueba} />
            </div>

            <span style={{ fontSize: '11.5px', color: C.tintaMedia }}>{textoDeObras(a, totalObras)}</span>

            {ultimo
              ? (
                <div>
                  <div style={{ fontFamily: MONO, fontSize: '12px', color: C.tinta }}>{ultimo}</div>
                  {a.ultimo_dispositivo && (
                    <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{a.ultimo_dispositivo}</div>
                  )}
                </div>
              )
              : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: C.warn }}>
                  <Ico d={P.reloj} s={14} w={2} />
                  <span style={{ fontSize: '11.5px' }}>sin ingresar</span>
                </div>
              )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              {nuevo && vivo && (
                <BotonIcono titulo="Reenviar el mail de acceso" lado={30} onClick={() => onReenviar(a.id)} testid={`reenviar-${a.id}`}>
                  <Ico d={P.mail} s={15} />
                </BotonIcono>
              )}
              {vivo
                ? (
                  <BotonIcono titulo="Editar" lado={30} onClick={() => onEditar(a.id)} testid={`editar-acceso-${a.id}`}>
                    <Ico d={P.lapiz} s={15} />
                  </BotonIcono>
                )
                : null}
              {vivo && !nuevo && (
                <BotonIcono titulo="Quitarle el acceso" lado={30} tono="alerta" onClick={() => onRevocar(a.id)} testid={`revocar-${a.id}`}>
                  <Ico d={P.pausa} s={15} />
                </BotonIcono>
              )}
            </div>
          </div>
        )
      })}

      {accesos.length === 0 && (
        <Vacio testid="accesos-vacio">
          Nadie de este cliente entra al portal todavía. El primer mail que se habilite acá va a ser
          la llave: entra sólo quien lo tenga.
        </Vacio>
      )}
    </div>
  )
}
