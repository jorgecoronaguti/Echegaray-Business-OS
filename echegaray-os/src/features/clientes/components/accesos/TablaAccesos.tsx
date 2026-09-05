'use client'

// «MAILS HABILITADOS» — grilla LITERAL de `CRM · Clientes · una pantalla.dc.html:366-386`.
//
//   MAIL HABILITADO · OBRAS · QUÉ PUEDE · ESTADO · ÚLTIMO INGRESO · [menú de 28px]
//   `minmax(230px,1.6fr) 150px 120px 140px 150px 28px`, `gap:28px`, `padding-left:16px`
//
// ═══ QUÉ CAMBIÓ CONTRA EL PORTE ANTERIOR, Y POR QUÉ ═══
//
// Esta tabla era el porte del mockup 31 —`PERSONA Y MAIL · PUEDE · OBRAS · ÚLTIMO INGRESO`, con
// avatar de 30px y una fila de tres botones al final—. El handoff v4 la redibujó: el mail sube a
// primer renglón (es LA LLAVE: entra quien lo tiene, se llame como se llame), OBRAS pasa delante de
// QUÉ PUEDE —el alcance antes que el detalle—, y aparece ESTADO, que antes había que deducir de un
// avatar punteado y de una opacidad.
//
// LAS TRES ACCIONES SE VAN AL MENÚ `···`. Tres botones dibujados en cada fila son tres objetivos de
// clic compitiendo con los datos —uno de ellos revoca—, y era lo que rompía la última pista de
// 28px del handoff.
//
// EL RENGLÓN DE ARRIBA ES LA REGLA: «el mail que carga acá es la llave: entra solo quien lo tiene».
// Está copiado del mockup porque es la frase que explica por qué esta tabla es peligrosa.

import { useState } from 'react'
import { C, MONO, ROTULO_COL } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque, Vacio } from '../canon/Piezas'
import { momentoCorto } from '../../services/cobranzaFormato'
import { estaHabilitado, textoDeObras } from '../../services/reglasPortal'
import type { AccesoPortal } from '../../types/cobranzas'

// 230+150+120+140+150+28 + 5×28 = 958px útiles. La cara «Acceso al portal» se dibuja a sangre (sin
// el costado de 353px), así que entra desde ~1100px de viewport: por encima, el panel de alta va al
// lado; por debajo de 1386px el panel baja solo —`flex-wrap` ya estaba— y la tabla se queda con
// todo el ancho. Debajo de 1100 se dibujan las mismas seis pistas, elásticas y con la mitad del aire.
const COLS
  = 'gap-[14px] grid-cols-[minmax(0,1.5fr)_minmax(0,110px)_84px_minmax(0,100px)_minmax(0,110px)_28px]'
  + ' min-[1100px]:gap-[28px]'
  + ' min-[1100px]:grid-cols-[minmax(230px,1.6fr)_150px_120px_140px_150px_28px]'

/**
 * EL CHIP DE PERMISO ES UNA LETRA, NO UN ÍCONO (`dc.html:376-378`).
 *
 * Tres íconos de línea a 16px se distinguían entre sí sólo mirándolos de cerca; O · M · A se leen
 * de un vistazo y sobreviven a la miniatura. Encendido = grafito pleno; apagado = contorno. El
 * `title` dice la consecuencia, no el nombre del permiso.
 */
function Chip({ on, letra, titulo }: { on: boolean; letra: string; titulo: string }) {
  return (
    <span
      title={titulo}
      aria-label={titulo}
      style={{
        width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
        ...(on
          ? { background: C.grafito, color: '#FFFFFF' }
          : { border: `1px solid ${C.bordeFuerte}`, color: C.fantasma }),
      }}
    >
      {letra}
    </span>
  )
}

/**
 * EL ESTADO SALE DE DOS COLUMNAS DE LA BASE Y DE NINGÚN CÁLCULO.
 *
 * `revocado_at` ⇒ revocado (apagado: es una decisión tomada, no un problema). `primer_ingreso_at`
 * NULL ⇒ «sin entrar» en ÁMBAR: el mail se habilitó y del otro lado no pasó nada, que es trabajo
 * pendiente —reenviar la invitación—. Sólo el que ya entró y sigue vivo se dice en verde.
 */
function estadoDelAcceso(a: AccesoPortal): { texto: string; color: string } {
  if (!estaHabilitado(a)) return { texto: 'revocado', color: C.tenue }
  if (a.primer_ingreso_at == null) return { texto: 'sin entrar', color: C.warn }
  return { texto: 'activo', color: C.pos }
}

/** Una acción de la línea que abre el `···`. Texto subrayado: la fila ya está llena de datos. */
function AccionDeLinea({ children, onClick, testid, destructiva }: {
  children: string
  onClick: () => void
  testid: string
  destructiva?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} data-testid={testid}
      style={{
        fontSize: '12.5px', textDecoration: 'underline', textUnderlineOffset: '2px',
        color: destructiva ? C.neg : C.tintaMedia, cursor: 'pointer',
      }}
    >
      {children}
    </button>
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
  // Uno abierto a la vez. Es estado de pantalla y no de dirección: esta cara ya es de cliente, así
  // que no hace falta el parámetro de URL que usan las tablas de servidor de la ficha.
  const [menu, setMenu] = useState<string | null>(null)

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

      <div
        className={`grid ${COLS}`}
        style={{ alignItems: 'end', height: '30px', paddingLeft: 16, borderBottom: `1px solid ${C.borde}` }}
      >
        <span style={ROTULO_COL}>MAIL HABILITADO</span>
        <span style={ROTULO_COL}>OBRAS</span>
        <span style={ROTULO_COL}>QUÉ PUEDE</span>
        <span style={ROTULO_COL}>ESTADO</span>
        <span style={ROTULO_COL}>ÚLTIMO INGRESO</span>
        <span style={{ paddingBottom: '7px' }} />
      </div>

      {accesos.map((a) => {
        const vivo = estaHabilitado(a)
        const nuevo = a.primer_ingreso_at == null
        const ultimo = momentoCorto(a.ultimo_ingreso_at, hoy)
        const estado = estadoDelAcceso(a)
        const obras = textoDeObras(a, totalObras)
        const abierto = menu === a.id
        return (
          <div key={a.id}>
            <div
              data-testid={`fila-acceso-${a.id}`}
              className={`grid ${COLS}`}
              style={{
                alignItems: 'center', minHeight: '58px', paddingLeft: 16,
                borderBottom: `1px solid ${C.bordeFila}`,
                background: elegido === a.id || abierto ? C.superficie : undefined,
                boxShadow: elegido === a.id ? `inset 2px 0 0 ${C.marca}` : undefined,
                opacity: vivo ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{
                  fontFamily: MONO, fontSize: '12.5px', color: C.tinta,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.email}</span>
                {/* SIN NOMBRE NO ES UN NOMBRE VACÍO: es un mail que nadie ató a un contacto del
                    cliente, y por eso va en ámbar — es el cruce que ataja el typo en la llave. */}
                <span style={{
                  fontSize: '11.5px', color: a.persona_contacto ? C.tenue : C.warn,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.persona_contacto ?? 'sin contacto vinculado'}</span>
              </div>

              {/* «Ninguna» es alcance CERO: el mail entra y no ve nada. Bloquea, y va en ámbar. */}
              <span style={{
                fontSize: '12px', color: obras === 'Ninguna' ? C.warn : C.tintaMedia,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{obras}</span>

              <span style={{ display: 'flex', gap: 6 }}>
                <Chip on={a.puede_ver_obra} letra="O" titulo="Ve la obra y su avance" />
                <Chip on={a.puede_ver_montos} letra="M" titulo="Ve montos, certificados y facturas" />
                <Chip on={a.puede_aprobar} letra="A" titulo="Aprueba certificados: habilita una factura" />
              </span>

              <span style={{ fontSize: '12px', color: estado.color }}>{estado.texto}</span>

              {/* NUNCA ENTRÓ NO ES UNA FECHA VIEJA NI UN CERO: es un guion. Que todavía no haya
                  entrado ya lo dice ESTADO en ámbar; repetirlo acá sería la misma ausencia contada
                  dos veces en dos colores. */}
              {ultimo
                ? (
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: MONO, fontSize: '12px', color: C.tinta }}>{ultimo}</div>
                      {a.ultimo_dispositivo && (
                        <div style={{
                          fontSize: '11px', color: C.tenue, marginTop: '1px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{a.ultimo_dispositivo}</div>
                      )}
                    </div>
                  )
                : (
                    <span title="Todavía no entró ninguna vez" style={{ fontFamily: MONO, fontSize: '12px', color: C.fantasma }}>
                      —
                    </span>
                  )}

              <button
                type="button"
                onClick={() => setMenu(abierto ? null : a.id)}
                aria-label="Acciones del acceso"
                aria-expanded={abierto}
                data-testid={`acciones-acceso-${a.id}`}
                style={{
                  display: 'flex', justifyContent: 'flex-end', fontSize: '15px', lineHeight: 1,
                  color: abierto ? C.tinta : C.tenue, cursor: 'pointer',
                }}
              >
                ···
              </button>
            </div>

            {/* LA LÍNEA EXPANDE DENTRO DE LA FILA, no en un popover flotante: es el ancho entero de
                la fila, así que las tres acciones y su aclaración caben escritas con palabras. */}
            {abierto && (
              <div
                data-testid={`acciones-acceso-abierto-${a.id}`}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px',
                  padding: '8px 16px', background: C.tenueFondo,
                  borderBottom: `1px solid ${C.bordeFila}`,
                }}
              >
                {vivo && (
                  <AccionDeLinea onClick={() => onEditar(a.id)} testid={`editar-acceso-${a.id}`}>
                    Editar
                  </AccionDeLinea>
                )}
                {nuevo && vivo && (
                  <AccionDeLinea onClick={() => onReenviar(a.id)} testid={`reenviar-${a.id}`}>
                    Reenviar el mail de acceso
                  </AccionDeLinea>
                )}
                {vivo && !nuevo && (
                  <AccionDeLinea destructiva onClick={() => onRevocar(a.id)} testid={`revocar-${a.id}`}>
                    Revocar
                  </AccionDeLinea>
                )}
                <span style={{ fontSize: '11.5px', color: C.tenue }}>
                  {vivo
                    ? 'Revocar corta el acceso de ese mail; el resto de los habilitados sigue entrando.'
                    : 'Este acceso ya está revocado: ese mail no entra.'}
                </span>
              </div>
            )}
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
