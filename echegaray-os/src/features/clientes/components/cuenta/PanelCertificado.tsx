'use client'

// EL PANEL DEL CERTIFICADO (`28:466`–`28:608`) — la tarjeta de 376px de la derecha.
//
//   tarjeta   `#FFFFFF`, borde `#E7E6E2`, radio 10, `overflow:hidden`
//   cabecera  `padding:13px 15px`, título 13px/600, sublínea 11,5px `#6B6B67`, cruz a la derecha
//   trío      tres celdas `flex:1` separadas por `#F1F0EC`, rótulo 10,5px, número mono 18px/600
//   línea     «DEL CERTIFICADO AL COBRO»: hilo de 1px `#D7D5CF` entre íconos de 15px
//   pie       primaria amarilla + cuadrados de 31px, y el de escalar contra el borde derecho
//
// ═══ REGISTRAR EL COBRO SE HACE ACÁ ADENTRO ═══
//
// El dueño, textual: «necesito que la pantalla permita que si quiero editar edite ahí mismo, no me
// sirve que me cargue y me lleve a otro lado». La primaria abre el formulario DENTRO de la tarjeta
// —fecha, monto, medio, referencia— y lo manda a `registrarCobro`. No navega a ningún lado.
//
// Y NO SE CANTA VICTORIA AL APRETAR: el cobro termina en la columna Q de la pestaña Cobranzas por
// una cola que aplica un worker en la VM. Lo que la pantalla puede afirmar es que quedó ENCOLADO;
// el cobro está hecho cuando el worker relee la celda. Esa distinción se escribe en el mensaje.

import { useActionState, useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import { C, MONO, PRIMARIA, TARJETA } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Boton, BotonIcono } from '../canon/Piezas'
import { MEDIOS } from '../../services/entradasCobranza'
import { diaMes, diasEntre, montoM, pesos } from '../../services/cobranzaFormato'
import type { CertificadoCliente } from '../../types/cobranzas'

type Accion = (form: FormData) => Promise<ResultadoAccion>

function Celda({ rotulo, valor, color = C.tinta, ultima = false }: {
  rotulo: string
  valor: string
  color?: string
  ultima?: boolean
}) {
  return (
    <div style={{
      flex: 1, padding: '11px 15px',
      borderRight: ultima ? undefined : `1px solid ${C.bordeCelda}`,
    }}>
      <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.04em' }}>{rotulo}</div>
      <div style={{ fontFamily: MONO, fontSize: '18px', fontWeight: 600, color, marginTop: '1px' }}>
        {valor}
      </div>
    </div>
  )
}

/** Un hito de «del certificado al cobro». El hilo baja mientras haya un hito debajo. */
function Hito({ icono, color, titulo, fecha, detalle, ultimo = false, apagado = false }: {
  icono: React.ReactNode
  color: string
  titulo: string
  fecha: string
  detalle?: string
  ultimo?: boolean
  apagado?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '15px',
      }}>
        <span style={{ display: 'flex', color, marginTop: '1px' }}>{icono}</span>
        {!ultimo && <div style={{ width: '1px', flex: 1, minHeight: '26px', background: C.bordeFuerte }} />}
      </div>
      <div style={{ minWidth: 0, flex: 1, paddingBottom: ultimo ? '8px' : '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{
            fontSize: '12px', fontWeight: apagado ? 400 : 500, color: apagado ? C.tenue : C.tinta,
          }}>{titulo}</span>
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{fecha}</span>
        </div>
        {detalle && (
          <div style={{ fontSize: '11.5px', color: C.tintaSuave, marginTop: '2px', lineHeight: 1.45 }}>
            {detalle}
          </div>
        )}
      </div>
    </div>
  )
}

function FormularioCobro({ documento, registrarCobro, onCerrar }: {
  documento: CertificadoCliente
  registrarCobro: Accion
  onCerrar: () => void
}) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_p, form) => registrarCobro(form), null,
  )
  const campo: React.CSSProperties = {
    width: '100%', border: `1px solid ${C.bordeCampo}`, borderRadius: '7px', padding: '0 12px',
    minHeight: '38px', fontSize: '13px', fontFamily: MONO, color: C.tinta, background: C.superficie,
  }
  return (
    <form action={ejecutar} data-testid="form-cobro" style={{ padding: '13px 15px', borderTop: `1px solid ${C.bordeFila}` }}>
      <div style={{ fontSize: '11px', color: C.tenue, letterSpacing: '.05em' }}>REGISTRAR EL COBRO</div>

      <label style={{ display: 'block', marginTop: '9px' }}>
        <span style={{ fontSize: '11.5px', color: C.tintaSuave }}>Fecha en que entró la plata</span>
        <input type="date" name="fecha" required defaultValue={documento.vence ?? undefined}
          data-testid="cobro-fecha" style={{ ...campo, marginTop: '4px' }} />
      </label>

      <label style={{ display: 'block', marginTop: '9px' }}>
        <span style={{ fontSize: '11.5px', color: C.tintaSuave }}>Monto cobrado</span>
        {/* Sale del documento, y se puede corregir: un cobro parcial es la mitad de los casos de
            esta pantalla y forzar el total sería inventar que entró todo. */}
        <input type="text" name="monto" required inputMode="decimal"
          defaultValue={String(Math.round(documento.monto))} placeholder={pesos(documento.monto)}
          data-testid="cobro-monto" style={{ ...campo, marginTop: '4px' }} />
      </label>

      <fieldset style={{ border: 'none', padding: 0, margin: '11px 0 0' }}>
        <legend style={{ fontSize: '11.5px', color: C.tintaSuave, padding: 0 }}>Cómo entró</legend>
        <div style={{ display: 'flex', gap: '7px', marginTop: '7px', flexWrap: 'wrap' }}>
          {MEDIOS.map((m, i) => (
            <label key={m} style={{
              fontSize: '12px', color: C.tinta, border: `1px solid ${C.borde}`, borderRadius: '14px',
              padding: '5px 11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}>
              <input type="radio" name="medio" value={m} defaultChecked={i === 0} required />
              {m[0].toUpperCase() + m.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '13px' }}>
        <Boton type="submit" estilo={PRIMARIA} hoverFondo={C.marcaHover} deshabilitado={pendiente} testid="cobro-guardar">
          <Ico d={P.ok} s={14} w={2.2} />
          {pendiente ? 'Encolando…' : 'Registrar cobro'}
        </Boton>
        <button type="button" onClick={onCerrar} data-testid="cobro-cancelar" style={{
          fontSize: '12.5px', color: C.tintaSuave, borderRadius: '6px', padding: '8px 12px',
          border: `1px solid ${C.borde}`, background: C.superficie, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancelar</button>
      </div>

      {estado?.ok === false && (
        <div data-testid="cobro-error" style={{ marginTop: '9px', fontSize: '11.5px', color: C.neg, lineHeight: 1.45 }}>
          {estado.error}
        </div>
      )}
      {estado?.ok === true && (
        <div data-testid="cobro-ok" style={{ marginTop: '9px', fontSize: '11.5px', color: C.pos, lineHeight: 1.45 }}>
          {estado.mensaje ?? 'Encolado. El cobro queda registrado cuando el worker escribe la fila de Cobranzas y la relee.'}
        </div>
      )}
    </form>
  )
}

export function PanelCertificado({ documento, hoy, registrarCobro, onCerrar, cobrando, onCobrando }: {
  documento: CertificadoCliente
  hoy: string
  registrarCobro: Accion
  onCerrar: () => void
  /** El formulario lo puede abrir la primaria de la CABECERA, dos columnas más arriba: por eso el
   *  estado vive en la vista y no acá adentro. */
  cobrando: boolean
  onCobrando: (v: boolean) => void
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const atraso = diasEntre(documento.vence, documento.estado === 'cobrado' ? documento.cobrado_at : hoy)
  const noConectado = (que: string) =>
    setAviso(`«${que}» todavía no está conectado: lo aterriza back-28-32.`)

  return (
    <div style={TARJETA} data-testid="panel-certificado">
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px 15px',
        borderBottom: `1px solid ${C.bordeFila}`,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>
            {documento.numero}{documento.factura ? ` · ${documento.factura}` : ''}
          </div>
          <div style={{ fontSize: '11.5px', color: C.tintaSuave, marginTop: '2px' }}>
            {[documento.obra_nombre, documento.emitido_at ? `emitido ${diaMes(documento.emitido_at)}` : null]
              .filter(Boolean).join(' · ') || 'sin obra ni fecha de emisión'}
          </div>
        </div>
        <BotonIcono titulo="Cerrar" lado={30} onClick={onCerrar} testid="panel-cerrar">
          <Ico d={P.cerrar} s={16} />
        </BotonIcono>
      </div>

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.bordeFila}` }}>
        <Celda rotulo="MONTO" valor={montoM(documento.monto)} />
        <Celda
          rotulo={documento.estado === 'cobrado' ? 'COBRADO' : atraso != null && atraso > 0 ? 'VENCIÓ' : 'VENCE'}
          valor={diaMes(documento.estado === 'cobrado' ? documento.cobrado_at : documento.vence) ?? '—'}
        />
        <Celda
          rotulo="ATRASO" ultima
          valor={atraso == null ? '—' : atraso > 0 ? `${atraso} d` : '0 d'}
          color={atraso != null && atraso > 0 ? C.neg : C.tinta}
        />
      </div>

      {documento.observacion && (
        // La banda cálida del mockup dice la promesa de pago; acá dice la OBSERVACIÓN, que es el
        // hecho que sí está guardado y el que explica por qué el documento no avanza.
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '11px 15px',
          background: C.warnFondo, borderBottom: `1px solid ${C.bordeFila}`,
        }} data-testid="panel-observacion">
          <span style={{ display: 'flex', color: C.warn, flexShrink: 0, marginTop: '1px' }}>
            <Ico d={P.chat} s={15} w={2} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: 500, color: C.warn }}>Observado por el cliente</div>
            <div style={{ fontSize: '11.5px', color: C.tintaSuave, marginTop: '2px', lineHeight: 1.45 }}>
              {documento.observacion}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '13px 15px 4px' }}>
        <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.05em', marginBottom: '11px' }}>
          DEL CERTIFICADO AL COBRO
        </div>

        {documento.emitido_at && (
          <Hito icono={<Ico d={P.okCirculo} s={15} w={2} />} color={C.grafito} titulo="Certificado emitido"
            fecha={diaMes(documento.emitido_at) ?? ''} detalle={documento.factura ? `Facturado ${documento.factura}` : 'Todavía sin factura'} />
        )}
        {documento.vence && (
          <Hito
            icono={<Ico d={(atraso ?? 0) > 0 ? P.alerta : P.calendario} s={15} w={2} />}
            color={(atraso ?? 0) > 0 ? C.neg : C.grafito}
            titulo={(atraso ?? 0) > 0 ? 'Vencido' : 'Vence'}
            fecha={diaMes(documento.vence) ?? ''}
            detalle={(atraso ?? 0) > 0 && documento.estado !== 'cobrado' ? 'Sin cobro registrado' : undefined}
            ultimo={!documento.cobrado_at && !documento.observacion}
          />
        )}
        {documento.observacion && (
          <Hito icono={<Ico d={P.chat} s={15} w={2} />} color={C.warn} titulo="Observado por el cliente"
            fecha="" detalle={documento.observacion} ultimo={!documento.cobrado_at} />
        )}
        {documento.cobrado_at && (
          <Hito icono={<Ico d={P.okCirculo} s={15} w={2} />} color={C.pos} titulo="Cobrado"
            fecha={diaMes(documento.cobrado_at) ?? ''} ultimo />
        )}
        {!documento.emitido_at && !documento.vence && !documento.cobrado_at && (
          <div style={{ fontSize: '11.5px', color: C.tenue, paddingBottom: '10px' }}>
            Este documento no tiene fechas cargadas todavía.
          </div>
        )}

        {/* LO QUE FALTA, DICHO. El mockup dibuja acá los recordatorios, las llamadas y la promesa
            de pago; ese historial de gestión no tiene tabla en el OS y por eso no se dibuja. */}
        <div style={{ fontSize: '11px', color: C.tenue, paddingBottom: '10px', lineHeight: 1.45 }}>
          Recordatorios, llamadas y promesas de pago todavía no se registran en el OS: esta línea
          muestra sólo lo que está guardado.
        </div>
      </div>

      {cobrando
        ? <FormularioCobro documento={documento} registrarCobro={registrarCobro} onCerrar={() => onCobrando(false)} />
        : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px', padding: '11px 15px',
            borderTop: `1px solid ${C.bordeFila}`,
          }}>
            <Boton
              estilo={PRIMARIA} hoverFondo={C.marcaHover} testid="abrir-cobro"
              onClick={() => { setAviso(null); onCobrando(true) }}
              deshabilitado={documento.estado === 'cobrado'}
            >
              <Ico d={P.ok} s={14} w={2.2} />
              {documento.estado === 'cobrado' ? 'Ya cobrado' : 'Registrar cobro'}
            </Boton>
            <BotonIcono titulo="Enviar recordatorio" onClick={() => noConectado('Enviar recordatorio')} testid="panel-recordatorio">
              <Ico d={P.mail} s={16} />
            </BotonIcono>
            <BotonIcono titulo="Registrar promesa de pago" onClick={() => noConectado('Registrar promesa de pago')} testid="panel-promesa">
              <Ico d={P.calendarioOk} s={16} />
            </BotonIcono>
            <BotonIcono titulo="Descargar comprobante" onClick={() => noConectado('Descargar comprobante')} testid="panel-comprobante">
              <Ico d={P.bajar} s={16} />
            </BotonIcono>
            <span style={{ marginLeft: 'auto' }}>
              <BotonIcono titulo="Escalar" tono="alerta" onClick={() => noConectado('Escalar')} testid="panel-escalar">
                <Ico d={P.arriba} s={16} />
              </BotonIcono>
            </span>
          </div>
        )}

      {aviso && (
        <div data-testid="panel-aviso" style={{
          padding: '0 15px 12px', fontSize: '11.5px', color: C.warn, lineHeight: 1.45,
        }}>{aviso}</div>
      )}
    </div>
  )
}
