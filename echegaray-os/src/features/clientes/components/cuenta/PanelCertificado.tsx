
//
// ═══ NO HAY `cobrado_at`: LA FECHA DE COBRO ES `vence` ═══
//
// La columna Q de Cobranzas —de donde sale `vence`— guarda la fecha ESPERADA mientras el cobro
// está pendiente y se PISA con la fecha REAL al cobrarse. Para un certificado `cobrado`, `vence`
// ya ES el día en que entró la plata. Un segundo campo sería la misma fecha con otro nombre.
//
// Consecuencia que se declara en vez de disimularse: el ATRASO de un certificado ya cobrado no es
// medible con esta fuente (restar la fecha contra sí misma da cero siempre, y publicaría una
// puntualidad perfecta para cualquier cliente). Se muestra «—», no un 0.
'use client'

// EL PANEL DEL CERTIFICADO — handoff CRM v4, «CRM · Lo que faltaba (…).dc.html:73`–`:180`.
//
//   tarjeta   376px, `#FFFFFF`, borde `#E7E6E2`, radio 10, `overflow:hidden`
//   cabecera  `padding:13px 15px`, título 13px/600, sublínea 11,5px, cruz a la derecha
//   trío      tres celdas `flex:1` separadas por `#F1F0EC`, rótulo 10,5px, número mono 18px/600
//   props     grilla `120px 1fr`, `gap:12px`, `padding:5px 0`, SIN filo entre propiedades
//   obs       `boxShadow: inset 2px 0 0 #B54708`, sin fondo y sin ícono
//   línea     «DEL CERTIFICADO AL COBRO»: puntos de 7px e hilo de 1px `#D7D5CF`
//   pie       primaria amarilla al ancho + las cuatro acciones como texto de 12px
//
// ═══ QUÉ CAMBIÓ DEL CONTRATO ANTERIOR (05/09/2026) ═══
//
// Tres piezas se dibujaban con el peso de la tanda anterior y la v4 las bajó de tono, porque el
// panel es una LECTURA y el único énfasis que se gana es el de la acción primaria:
//
//   · Las propiedades tenían rótulo «PROPIEDADES» y un filo bajo cada una: seis hairlines para
//     seis renglones, dentro de un bloque que ya está separado por su propio filo.
//   · La observación tenía fondo ámbar e ícono; ahora es un filo de 2px y el texto. Un bloque
//     entero teñido compite con el estado, que es lo que decide.
//   · Las cuatro acciones que no existen eran cuadraditos con ícono: había que apretar cada uno
//     para saber cuál era. Ahora son las cuatro palabras, y cada una sigue diciendo su motivo.
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
import { MEDIOS, aMonto } from '../../services/entradasCobranza'
import { diaMes, diasEntre, montoM, pesos } from '../../services/cobranzaFormato'
import { lecturaDelMonto, propiedadesDelCertificado } from '../../services/propiedadesCertificado'
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
/** Por qué no está cada acción del pie del panel. Se escribe el motivo REAL, no «falta el back». */
const MOTIVO: Record<string, string> = {
  'Enviar recordatorio': 'la cola de mails existe, pero el recordatorio de cobranza no tiene plantilla escrita',
  'Registrar promesa de pago': 'no hay dónde guardarla: ninguna tabla registra la promesa de un cliente',
  'Descargar comprobante': 'el certificado no guarda el archivo de la factura, sólo su número',
  Escalar: 'no hay circuito de escalamiento definido: falta decidir a quién escala y con qué efecto',
}

/** Las cuatro acciones del pie: el rótulo corto del handoff y la clave de su motivo. */
const ACCIONES = [
  { que: 'Enviar recordatorio', texto: 'Recordatorio', testid: 'panel-recordatorio' },
  { que: 'Registrar promesa de pago', texto: 'Promesa de pago', testid: 'panel-promesa' },
  { que: 'Descargar comprobante', texto: 'Comprobante', testid: 'panel-comprobante' },
  { que: 'Escalar', texto: 'Escalar', testid: 'panel-escalar' },
] as const

/**
 * UN HITO DE «DEL CERTIFICADO AL COBRO». El punto de 7px lleva el color del hito y el título va en
 * ese mismo color: es lo que hace que «Vencido» se lea en rojo sin necesidad de un ícono de alerta.
 * El hilo baja mientras haya un hito debajo.
 */
function Hito({ color, titulo, fecha, detalle, ultimo = false }: {
  color: string
  titulo: string
  fecha: string
  detalle?: string
  ultimo?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '11px' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '9px',
        paddingTop: '4px',
      }}>
        <span style={{
          width: '7px', height: '7px', borderRadius: '4px', flexShrink: 0, background: color,
        }} />
        {!ultimo && (
          <span style={{
            width: '1px', flex: 1, minHeight: '22px', background: C.bordeFuerte, marginTop: '4px',
          }} />
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1, paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color }}>{titulo}</span>
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{fecha}</span>
        </div>
        {detalle && (
          <div style={{ fontSize: '11.5px', color: C.tintaMedia, marginTop: '2px', lineHeight: 1.45 }}>
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
  // EL MONTO ES CONTROLADO PORQUE SE LEE MIENTRAS SE ESCRIBE. «3.100.000» y «3.100» se tipean casi
  // igual y encolan cosas distintas; y un cobro parcial hay que decirlo ANTES de encolar, no
  // después. `aMonto` es la misma regla argentina que valida el servidor.
  const [monto, setMonto] = useState(String(Math.round(documento.monto)))
  const [medio, setMedio] = useState<string>(MEDIOS[0])
  const [foco, setFoco] = useState<string | null>(null)
  const lectura = lecturaDelMonto(aMonto(monto), documento.monto)
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
          value={monto} onChange={(e) => setMonto(e.target.value)} placeholder={pesos(documento.monto)}
          data-testid="cobro-monto" style={{ ...campo, marginTop: '4px' }} />
        <span
          data-testid="cobro-lectura"
          style={{ display: 'block', fontSize: '11.5px', marginTop: '5px', color: lectura.color }}
        >
          {lectura.texto}
        </span>
      </label>

      {/* ═══ EL MEDIO ES UNA OPCIÓN SUBRAYADA, NO UNA PASTILLA ═══

          El handoff v4 lo dibuja como tres palabras con el filo grafito debajo de la elegida. El
          `input[type=radio]` sigue existiendo —tapado, no eliminado—: es lo que hace que el
          formulario mande `medio` y que un lector de pantalla anuncie el grupo. Por eso el foco del
          teclado se dibuja sobre la palabra: sin eso, tabular por el formulario dejaría de verse. */}
      <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
        <legend style={{ fontSize: '11.5px', color: C.tintaSuave, padding: 0 }}>Cómo entró</legend>
        <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
          {MEDIOS.map((m) => (
            <label
              key={m} data-testid={`medio-${m}`}
              style={{
                fontSize: '12.5px', cursor: 'pointer', paddingBottom: '3px',
                fontWeight: medio === m ? 600 : 400,
                color: medio === m ? C.tinta : C.tintaSuave,
                boxShadow: medio === m ? `inset 0 -2px 0 ${C.grafito}` : undefined,
                outline: foco === m ? `2px solid ${C.marca}` : undefined,
                outlineOffset: '2px',
              }}
            >
              <input
                type="radio" name="medio" value={m} required
                checked={medio === m} onChange={() => setMedio(m)}
                onFocus={() => setFoco(m)} onBlur={() => setFoco(null)}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0 }}
              />
              {m[0].toUpperCase() + m.slice(1)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ═══ POR QUÉ NO HAY CAMPO «REFERENCIA» ═══

          El diseño dibuja uno para el número de la transferencia o del cheque, y no se puede
          construir: la cola `cobranza_cambio` escribe UNA celda por fila y su CHECK sólo admite
          `fecha`, `monto`, `medio` y `estado_cobrado`. No hay columna donde poner la referencia, ni
          en la cola ni en la pestaña Cobranzas.

          Un campo que acepta texto y lo tira es peor que no tener el campo: quien lo escribe se va
          creyendo que quedó guardado. Así que se dice dónde falta, que es lo único que desbloquea. */}
      <p
        data-testid="cobro-sin-referencia"
        style={{ fontSize: '11px', color: C.tenue, marginTop: '11px', lineHeight: 1.45 }}
      >
        La referencia de la transferencia o del cheque todavía no se puede guardar acá: la cola de
        cambios escribe fecha, estado y medio, y no tiene columna para el número.
      </p>

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
  // `null` para un cobrado: ver el bloque de arriba. No es «cero días de atraso».
  const atraso = documento.estado === 'cobrado' ? null : diasEntre(documento.vence, hoy)
  // CADA UNO DICE POR QUÉ, Y SON MOTIVOS DISTINTOS. Un mensaje único de «no está conectado»
  // esconde que tres de estos cuatro están a una decisión de distancia y el otro a una tabla.
  const noConectado = (que: string) => setAviso(`«${que}» todavía no está: ${MOTIVO[que]}`)

  return (
    <div style={TARJETA} data-testid="panel-certificado">
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '13px 15px',
        borderBottom: `1px solid ${C.bordeCelda}`,
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

      <div style={{ display: 'flex', borderBottom: `1px solid ${C.bordeCelda}` }}>
        <Celda rotulo="MONTO" valor={montoM(documento.monto)} />
        <Celda
          rotulo={documento.estado === 'cobrado' ? 'COBRADO' : atraso != null && atraso > 0 ? 'VENCIÓ' : 'VENCE'}
          valor={diaMes(documento.vence) ?? '—'}
        />
        <Celda
          rotulo="ATRASO" ultima
          valor={atraso == null ? '—' : atraso > 0 ? `${atraso} d` : '0 d'}
          color={atraso != null && atraso > 0 ? C.neg : C.tinta}
        />
      </div>

      {/* ═══ LAS PROPIEDADES: LO QUE LA TABLA SABE Y LA PESTAÑA COBRANZAS NO ═══

          La pestaña tiene el número, el monto y la fecha. `certificado_cliente` tiene además el
          estado de aprobación del cliente, el período certificado, su avance, el fondo de reparo y
          el puente al Sheet — y nada de eso se estaba mostrando. Sin el reparo a la vista el
          cliente paga el neto y la empresa proyecta el bruto para esa fecha.

          Qué dice cada ausencia y de qué color va lo decide `propiedadesDelCertificado`, que se
          prueba sin React: es donde «NULL nunca es cero» se rompe sin que nadie lo note. */}
      <div
        style={{ padding: '11px 15px 13px', borderBottom: `1px solid ${C.bordeCelda}` }}
        data-testid="panel-propiedades"
      >
        {propiedadesDelCertificado(documento).map((p) => (
          <div
            key={p.k}
            data-testid={`prop-${p.k.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            style={{
              display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px',
              alignItems: 'baseline', padding: '5px 0',
            }}
          >
            <span style={{ fontSize: '11.5px', color: C.tenue }}>{p.k}</span>
            <span style={{ fontSize: '12.5px', color: p.color, minWidth: 0 }}>{p.v}</span>
          </div>
        ))}
      </div>

      {documento.observacion && (
        // La banda cálida del mockup dice la promesa de pago; acá dice la OBSERVACIÓN, que es el
        // hecho que sí está guardado y el que explica por qué el documento no avanza.
        <div style={{
          padding: '11px 15px', borderBottom: `1px solid ${C.bordeCelda}`,
          boxShadow: `inset 2px 0 0 ${C.warn}`,
        }} data-testid="panel-observacion">
          <div style={{ fontSize: '12px', fontWeight: 500, color: C.warn }}>Observado por el cliente</div>
          <div style={{ fontSize: '11.5px', color: C.tintaMedia, marginTop: '3px', lineHeight: 1.5 }}>
            {documento.observacion}
          </div>
        </div>
      )}

      <div style={{ padding: '13px 15px 4px' }}>
        <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.05em', marginBottom: '12px' }}>
          DEL CERTIFICADO AL COBRO
        </div>

        {documento.emitido_at && (
          <Hito color={C.grafito} titulo="Certificado emitido"
            fecha={diaMes(documento.emitido_at) ?? ''} detalle={documento.factura ? `Facturado ${documento.factura}` : 'Todavía sin factura'} />
        )}
        {documento.vence && (
          <Hito
            color={(atraso ?? 0) > 0 ? C.neg : C.grafito}
            titulo={documento.estado === 'cobrado' ? 'Vencía' : (atraso ?? 0) > 0 ? 'Vencido' : 'Vence'}
            fecha={diaMes(documento.vence) ?? ''}
            detalle={(atraso ?? 0) > 0 && documento.estado !== 'cobrado' ? 'Sin cobro registrado' : undefined}
            ultimo={documento.estado !== 'cobrado' && !documento.observacion}
          />
        )}
        {/* EL MOCKUP ESCRIBE ACÁ «Mientras esté observado no corre el plazo de pago» Y NO SE COPIA:
            es una afirmación CONTRACTUAL, y el OS no leyó el contrato de este cliente para poder
            sostenerla. El hito dice el hecho —que el cliente observó— y su texto ya está arriba,
            en la banda de la observación. */}
        {documento.observacion && (
          <Hito color={C.warn} titulo="Observado por el cliente"
            fecha="" ultimo={documento.estado !== 'cobrado'} />
        )}
        {documento.estado === 'cobrado' && (
          <Hito color={C.pos} titulo="Cobrado" fecha={diaMes(documento.vence) ?? ''}
            detalle="La fecha de cobro pisa la fecha esperada: el atraso ya no es medible" ultimo />
        )}
        {!documento.emitido_at && !documento.vence && (
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
            display: 'flex', flexDirection: 'column', gap: '11px', padding: '11px 15px',
            borderTop: `1px solid ${C.bordeCelda}`,
          }}>
            <Boton
              estilo={PRIMARIA} hoverFondo={C.marcaHover} testid="abrir-cobro"
              onClick={() => { setAviso(null); onCobrando(true) }}
              deshabilitado={documento.estado === 'cobrado'}
            >
              <Ico d={P.ok} s={14} w={2.2} />
              {documento.estado === 'cobrado' ? 'Ya cobrado' : 'Registrar cobro'}
            </Boton>
            {/* LAS CUATRO QUE NO EXISTEN, CON SU NOMBRE A LA VISTA. Eran cuatro cuadraditos con
                ícono: había que apretarlos para saber cuál era cuál, y el motivo de cada una —que
                es lo único que desbloquea— quedaba escondido detrás del clic. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {ACCIONES.map((a) => (
                <button
                  key={a.que} type="button" onClick={() => noConectado(a.que)} data-testid={a.testid}
                  style={{
                    fontSize: '12px', color: C.tintaSuave, background: 'none', border: 'none',
                    padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{a.texto}</button>
              ))}
            </div>
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
