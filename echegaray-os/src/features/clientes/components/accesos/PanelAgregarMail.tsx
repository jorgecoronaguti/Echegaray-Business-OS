'use client'

// «AGREGAR MAIL AL PORTAL» (`31:229`–`31:303`).
//
//   tarjeta  blanca, radio 10; cabecera `padding:13px 16px` con ícono y título 13px/600
//   campo    borde `#D7D5CF`, radio 7, `minHeight:42px`, mail en mono 13px
//   permisos casilla de 20px + ícono de 16px + título 12,5px + detalle 11px, separados por `#F5F4F0`
//   obras    dos chips; «Elegir obras» despliega las del cliente
//   primaria ancho completo, `minHeight:42px`, 13px/600, y debajo la nota de dos renglones
//
// ═══ LOS TRES PERMISOS SON UNA CASCADA, NO TRES CASILLAS ═══
//
// Marcar «Aprobar certificados» enciende «Ver montos» y «Ver la obra»; apagar «Ver montos» apaga
// «Aprobar». La regla vive en `reglasPortal.ts` con test: aprobar un certificado sin ver el monto
// es apretar un botón a ciegas sobre un documento que habilita una factura.
//
// EL MAIL SE CRUZA CONTRA LOS CONTACTOS DE LA FICHA. Es el único control que hay contra un typo
// —`g.molnia@…` habilitado por error es una puerta abierta a un desconocido—, y por eso el cartel
// verde («es contacto del cliente») y el ámbar («no figura entre los contactos») pesan distinto.

import { useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui/FormAccion'
import type { EntradaAltaAcceso } from '../../services/entradasCobranza'
import { C, MONO, PRIMARIA, TARJETA } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { Boton, Casilla, Chip } from '../canon/Piezas'
import {
  accesoExistente, alCambiarPermiso, contactoDelMail, mailPlausible, type ContactoConocido, type Permisos,
} from '../../services/reglasPortal'
import type { AccesoPortal } from '../../types/cobranzas'

export interface ObraElegible { id: string; nombre: string }

const PERMISOS: { clave: keyof Permisos; d: React.ReactNode; titulo: string; detalle: string }[] = [
  { clave: 'puede_ver_obra', d: P.ojo, titulo: 'Ver la obra', detalle: 'avance, hitos, fotos, documentos' },
  { clave: 'puede_ver_montos', d: P.montos, titulo: 'Ver montos y facturas', detalle: 'certificados, saldo, vencimientos' },
  { clave: 'puede_aprobar', d: P.aprueba, titulo: 'Aprobar certificados', detalle: 'su aprobación habilita la factura' },
]

export function PanelAgregarMail({ accesos, contactos, obras, edicion, onCerrarEdicion, habilitar }: {
  accesos: AccesoPortal[]
  contactos: ContactoConocido[]
  obras: ObraElegible[]
  /** El acceso que se está editando, o `null` para el alta. */
  edicion: AccesoPortal | null
  onCerrarEdicion: () => void
  /** Ya atada al cliente por `bind` en la vista: acá sólo viaja lo que se llenó en el formulario.
   *  EN CAMELCASE, que es el idioma de la action — los permisos se dibujan en snake_case porque
   *  nombran columnas, y el borde entre las dos grafías se cruza acá, una sola vez y a la vista. */
  habilitar: (entrada: Omit<EntradaAltaAcceso, 'clienteId'>) => Promise<ResultadoAccion>
}) {
  const [mail, setMail] = useState(edicion?.email ?? '')
  const [permisos, setPermisos] = useState<Permisos>({
    puede_ver_obra: edicion?.puede_ver_obra ?? true,
    puede_ver_montos: edicion?.puede_ver_montos ?? false,
    puede_aprobar: edicion?.puede_aprobar ?? false,
  })
  const [elegidas, setElegidas] = useState<string[] | null>(edicion?.obras ?? null)
  // CON QUÉ NOMBRE LO SALUDA EL PORTAL. Se precarga con el contacto si el mail ya figura en la
  // ficha, y se puede escribir a mano: es el nombre de una PERSONA, no el de la empresa.
  const [nombre, setNombre] = useState(edicion?.persona_contacto ?? '')
  const [avisar, setAvisar] = useState(true)
  const [resultado, setResultado] = useState<ResultadoAccion | null>(null)
  const [enviando, setEnviando] = useState(false)

  const contacto = contactoDelMail(mail, contactos)
  const yaEsta = accesoExistente(mail, accesos)
  const valido = mailPlausible(mail)
  const editando = edicion != null

  async function enviar() {
    setEnviando(true)
    setResultado(null)
    const r = await habilitar({
      email: mail,
      // Lo escrito a mano manda sobre el cruce automático: quien lo tipeó sabe más que el cruce.
      personaContacto: nombre.trim() || contacto?.nombre || edicion?.persona_contacto || undefined,
      puedeVerObra: permisos.puede_ver_obra,
      puedeVerMontos: permisos.puede_ver_montos,
      puedeAprobar: permisos.puede_aprobar,
      obras: elegidas,
      avisarPorMail: avisar,
    })
    setEnviando(false)
    setResultado(r)
  }

  return (
    <div style={TARJETA} data-testid="panel-acceso">
      <div style={{
        display: 'flex', alignItems: 'center', gap: '9px', padding: '13px 16px',
        borderBottom: `1px solid ${C.bordeFila}`,
      }}>
        <span style={{ display: 'flex', color: C.tintaSuave }}>
          <Ico d={editando ? P.lapiz : P.mas} s={16} />
        </span>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>
          {editando ? 'Editar el acceso' : 'Agregar mail al portal'}
        </div>
        {editando && (
          <button
            type="button" onClick={onCerrarEdicion} data-testid="acceso-cancelar-edicion"
            style={{
              marginLeft: 'auto', display: 'flex', color: C.tenue, background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
            title="Cerrar"
          ><Ico d={P.cerrar} s={16} /></button>
        )}
      </div>

      <div style={{ padding: '15px 16px 8px' }}>
        <div style={{ fontSize: '11px', color: C.tenue, letterSpacing: '.05em' }}>MAIL</div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px', marginTop: '7px',
          border: `1px solid ${C.bordeCampo}`, borderRadius: '7px', padding: '0 12px', minHeight: '42px',
        }}>
          <Ico d={P.mail} s={16} style={{ color: C.tenue }} />
          <input
            type="email" value={mail} onChange={(e) => setMail(e.target.value)}
            // EN LA EDICIÓN EL MAIL NO SE TOCA: cambiarlo no es corregir un acceso, es crear otro
            // y dejar el viejo abierto. Para eso está revocar y volver a habilitar.
            readOnly={editando}
            placeholder="nombre@empresa.com" data-testid="acceso-mail" aria-label="Mail"
            style={{
              fontFamily: MONO, fontSize: '13px', color: C.tinta, flex: 1, border: 'none',
              outline: 'none', background: 'transparent', padding: 0,
            }}
          />
        </div>
        {mail !== '' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px', marginTop: '8px', fontSize: '11.5px',
            color: C.tintaSuave,
          }} data-testid="acceso-cruce">
            {yaEsta && !editando
              ? (<><Ico d={P.alerta} s={14} w={2} style={{ color: C.warn }} />Este mail ya está habilitado.</>)
              : contacto
                ? (<><Ico d={P.okCirculo} s={14} w={2} style={{ color: C.pos }} />
                    Es contacto del cliente: {contacto.nombre}{contacto.rol ? `, ${contacto.rol}` : ''}</>)
                : (<><Ico d={P.alerta} s={14} w={2} style={{ color: C.warn }} />
                    No figura entre los contactos de esta ficha.</>)}
          </div>
        )}

        {/* EL NOMBRE CON EL QUE EL PORTAL LO SALUDA. Vacío no es un error: sin nombre el portal
            saluda con el del cliente, que es cierto aunque sea menos cálido. Nunca se inventa uno a
            partir del mail — «j.perez@» no es «J Perez». */}
        <div style={{ fontSize: '11px', color: C.tenue, letterSpacing: '.05em', marginTop: '15px' }}>
          NOMBRE <span style={{ letterSpacing: 0, textTransform: 'none' }}>· así lo saluda el portal</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '9px', marginTop: '7px',
          border: `1px solid ${C.bordeCampo}`, borderRadius: '7px', padding: '0 12px', minHeight: '42px',
        }}>
          <Ico d={P.globo} s={16} style={{ color: C.tenue }} />
          <input
            type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder={contacto?.nombre ?? 'Marta Ruiz'} maxLength={80}
            data-testid="acceso-nombre" aria-label="Nombre de la persona"
            style={{
              fontSize: '13px', color: C.tinta, flex: 1, border: 'none',
              outline: 'none', background: 'transparent', padding: 0,
            }}
          />
        </div>
      </div>

      <div style={{ padding: '14px 16px 8px' }}>
        <div style={{ fontSize: '11px', color: C.tenue, letterSpacing: '.05em' }}>QUÉ PUEDE HACER</div>
        {PERMISOS.map((p, k) => (
          <div
            key={p.clave}
            style={{
              display: 'flex', alignItems: 'center', gap: '11px',
              marginTop: k === 0 ? '10px' : undefined,
              paddingTop: k === 0 ? 0 : '11px',
              paddingBottom: k === PERMISOS.length - 1 ? '12px' : '11px',
              borderBottom: k === PERMISOS.length - 1 ? undefined : `1px solid ${C.bordeLista}`,
            }}
          >
            <Casilla
              marcada={permisos[p.clave]} etiqueta={p.titulo} testid={`permiso-${p.clave}`}
              onClick={() => setPermisos((v) => alCambiarPermiso(v, p.clave, !v[p.clave]))}
            />
            <Ico d={p.d} s={16} style={{ color: permisos[p.clave] ? C.tintaSuave : C.tenue }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '12.5px', color: C.tinta }}>{p.titulo}</div>
              <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{p.detalle}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ fontSize: '11px', color: C.tenue, letterSpacing: '.05em' }}>EN QUÉ OBRAS</div>
        <div style={{ display: 'flex', gap: '7px', marginTop: '9px', flexWrap: 'wrap' }}>
          <Chip activo={elegidas == null} onClick={() => setElegidas(null)} testid="obras-todas">
            Todas las obras
          </Chip>
          <Chip activo={elegidas != null} onClick={() => setElegidas(elegidas ?? [])} testid="obras-elegir">
            Elegir obras
          </Chip>
        </div>
        {elegidas != null && (
          <div style={{ display: 'flex', gap: '7px', marginTop: '9px', flexWrap: 'wrap' }}>
            {obras.map((o) => (
              <Chip
                key={o.id} activo={elegidas.includes(o.id)} testid={`obra-${o.id}`}
                onClick={() => setElegidas((v) => (v ?? []).includes(o.id)
                  ? (v ?? []).filter((x) => x !== o.id)
                  : [...(v ?? []), o.id])}
              >{o.nombre}</Chip>
            ))}
            {obras.length === 0 && (
              <span style={{ fontSize: '11.5px', color: C.tenue }}>Este cliente no tiene obras cargadas.</span>
            )}
          </div>
        )}
        {/* «TODAS» INCLUYE LAS QUE TODAVÍA NO EXISTEN, y eso hay que decirlo antes de marcarlo: es
            la diferencia entre mostrarle tres obras y mostrarle las próximas diez. */}
        <div style={{ fontSize: '11px', color: C.tenue, marginTop: '8px', lineHeight: 1.45 }}>
          {elegidas == null
            ? 'Incluye las obras que se le carguen más adelante.'
            : `${elegidas.length} de ${obras.length} elegidas. Las obras nuevas NO se suman solas.`}
        </div>
      </div>

      <div style={{ padding: '14px 16px 16px', marginTop: '6px', borderTop: `1px solid ${C.bordeFila}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', paddingBottom: '11px' }}>
          <Casilla
            marcada={avisar} etiqueta="Avisarle por mail" testid="acceso-avisar"
            onClick={() => setAvisar((v) => !v)}
          />
          <span style={{ fontSize: '12px', color: C.tintaSuave }}>Mandarle el mail con el link</span>
        </div>
        <Boton
          estilo={{
            ...PRIMARIA, width: '100%', justifyContent: 'center', minHeight: '42px',
            fontSize: '13px', borderRadius: '7px', gap: '7px',
          }}
          hoverFondo={C.marcaHover}
          deshabilitado={!valido || enviando || (yaEsta != null && !editando)}
          onClick={enviar}
          testid="habilitar-acceso"
        >
          <Ico d={P.mail} s={15} w={2} />
          {enviando
            ? 'Habilitando…'
            : editando
              ? 'Guardar los permisos'
              : avisar ? 'Habilitar y avisarle por mail' : 'Habilitar sin avisarle'}
        </Boton>
        <div style={{ fontSize: '11.5px', color: C.tintaSuave, marginTop: '10px', lineHeight: 1.5 }}>
          {avisar
            ? 'Recibe un mail con el link al portal. Entra con ese mail, sin contraseña.'
            : 'Queda habilitado pero no se entera: el link se lo tenés que pasar vos.'}
        </div>
        {resultado?.ok === false && (
          <div data-testid="acceso-error" style={{ marginTop: '9px', fontSize: '11.5px', color: C.neg, lineHeight: 1.45 }}>
            {resultado.error}
          </div>
        )}
        {resultado?.ok === true && (
          <div data-testid="acceso-ok" style={{ marginTop: '9px', fontSize: '11.5px', color: C.pos, lineHeight: 1.45 }}>
            {resultado.mensaje ?? 'Habilitado.'}
          </div>
        )}
      </div>
    </div>
  )
}
