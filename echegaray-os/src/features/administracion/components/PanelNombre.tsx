'use client'

// RESOLVER UN NOMBRE DE COMPRAS — `22 · Proveedores v2.dc.html`, líneas 234-266.
//
// ═══ LAS TRES SALIDAS, Y NINGUNA AUTOMÁTICA ═══
//
// Vincular a uno que existe · crear uno nuevo con el nombre ya cargado · declarar que no es un
// proveedor. La tercera es la que permite que la cola llegue a cero: SUELDOS, ARCA, SINDICATOS y
// BANCO son conceptos de gasto y no hay proveedor que inventarles. Sin esa salida quedarían para
// siempre arriba de la lista, y una lista que no puede vaciarse deja de mirarse.
//
// Lo que NO hay es «unir los parecidos». En la cola conviven «SOSTEM SA» y «SOSTEN SA», «LINARC» y
// «LINARC SAS». Puede que alguno de esos pares sea la misma empresa: lo decide una persona con la
// factura a la vista, no una distancia de edición. Y el CUIT no se completa solo nunca.
//
// ═══ POR QUÉ ESTE FORMULARIO NO USA `FormAccion` ═══
//
// `FormAccion` existe para que el error del servidor no se trague en catorce formularios, y esa
// disciplina se copia entera acá abajo —el error se muestra siempre, el formulario no se limpia si
// falló—. Lo que no se puede reusar es su BOTÓN: el mockup especifica el CTA apagado con colores
// propios (#F2F1ED sobre #B5B3AC), un icono de check adentro y el texto contando los comprobantes
// que va a mover. Es el control que decide la escritura más cara de esta pantalla y el zip lo dibuja
// al píxel. Un botón parecido en el único lugar donde el diseño es explícito no sirve.
//
// ═══ EL BUSCADOR DE CANDIDATOS NO ESTÁ EN EL MOCKUP, Y SE QUEDA ═══
//
// Con 36 proveedores la lista se recorre; el maestro crece con cada nombre que se resuelve, y una
// lista larga de radios se resuelve mirando cuál se parece — que es la forma más rápida de vincular
// el equivocado, o sea el defecto exacto que esta pantalla existe para impedir. Filtra en memoria
// sobre la lista ya cargada: no cuesta un viaje.

import Link from 'next/link'
import { startTransition, useActionState, useMemo, useState, type FormEvent } from 'react'
import { BotonAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { IconoBuscar, IconoCerrar, IconoCompletar } from '@/shared/components/iconos'
import { pesos } from '@/shared/components/canon/formato'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { formatearCuit } from '../services/identidad'
import { CamposProveedor } from './proveedores/CamposProveedor'
import { PanelFilo, V } from './proveedores/patron'
import type { NombrePendiente, Proveedor } from '../types'

export function PanelNombre({
  nombre, candidatos, cerrarHref, vincular, crearYVincular, noEsProveedor,
}: {
  nombre: NombrePendiente
  candidatos: Proveedor[]
  cerrarHref: string
  vincular: AccionFormulario
  /** Ya atada al nombre en el servidor: una función no cruza la frontera al revés. */
  crearYVincular: AccionFormulario
  noEsProveedor: (nombreNorm: string, nombreOrigen: string) => Promise<ResultadoAccion>
}) {
  const [elegido, setElegido] = useState('')
  const [filtro, setFiltro] = useState('')
  const [crear, setCrear] = useState(false)
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_previo, form) => vincular(form),
    null,
  )

  const visibles = useMemo(
    () => candidatos.filter((p) => contieneEnAlguno([p.nombre, p.razon_social, p.cuit], filtro)),
    [candidatos, filtro],
  )

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = new FormData(e.currentTarget)
    startTransition(() => ejecutar(datos))
  }

  return (
    <PanelFilo testid="panel-nombre">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="truncate font-mono" style={{ fontSize: '15px', fontWeight: 600, color: V.tinta }}>
            {nombre.nombre_origen}
          </h2>
          <p style={{ fontSize: '12px', color: V.apagado, marginTop: 4 }} data-testid="nombre-resumen">
            {nombre.comprobantes} {nombre.comprobantes === 1 ? 'comprobante' : 'comprobantes'} ·{' '}
            {/* Sin importe NO es $ 0: el gasto existió aunque la fila no traiga total. */}
            {Number(nombre.total ?? 0) > 0 ? pesos(nombre.total) : 'sin importe'}
          </p>
        </div>
        <Link href={cerrarHref} data-testid="cerrar-nombre" aria-label="Cerrar el panel" title="Cerrar" style={{ display: 'flex', color: V.tenue, flexShrink: 0 }}>
          <IconoCerrar className="h-[14px] w-[14px]" />
        </Link>
      </div>

      {/* EL FILTRO Y LOS BOTONES VIVEN FUERA DEL `<form>` Y SE ATAN CON `form="…"`.
          `<form>` DENTRO DE `<form>` ES HTML INVÁLIDO: el navegador descarta el interno al parsear,
          el árbol del servidor y el del cliente dejan de coincidir y React rehace la rama entera —
          «Hydration failed». Se vio en el navegador el 25/08 con «No es proveedor», que trae su
          propio formulario. El atributo `form` deja el botón donde el mockup lo dibuja sin anidar
          nada. Y el filtro afuera evita que un Enter mientras se filtra dispare la vinculación. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 6px' }}>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: V.tenue }}>
          ¿Cuál proveedor es?
        </span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${filtro ? V.grafito : V.linea}`, padding: '2px 1px', width: 150 }}>
          <span style={{ display: 'flex', color: V.lupa, flexShrink: 0 }}><IconoBuscar className="h-[12px] w-[12px]" /></span>
          <span className="sr-only">Filtrar proveedores</span>
          <input
            type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar" data-testid="filtrar-candidatos"
            style={{ border: 'none', background: 'transparent', fontSize: '11.5px', color: V.tinta, width: '100%', padding: 0, outline: 'none' }}
          />
        </label>
      </div>

      <form onSubmit={enviar} id="form-vincular" data-testid="form-vincular">
        <input type="hidden" name="nombre_norm" value={nombre.nombre_norm} />
        <input type="hidden" name="nombre_origen" value={nombre.nombre_origen} />

        {visibles.length === 0
          ? (
              <p data-testid="sin-candidatos" style={{ fontSize: '12px', color: V.tenue, padding: '7px 0' }}>
                Ningún proveedor del maestro coincide con lo filtrado.
              </p>
            )
          : (
              <div data-testid="candidatos" className="max-h-[288px] overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {visibles.map((p) => (
                  <label
                    key={p.id}
                    data-testid="candidato"
                    data-elegido={elegido === p.id ? '' : undefined}
                    className={elegido === p.id ? '' : 'hover:bg-[#F2F1ED]'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 7,
                      cursor: 'pointer',
                      background: elegido === p.id ? V.seleccion : 'transparent',
                      boxShadow: elegido === p.id ? `inset 2px 0 0 ${V.marca}` : 'none',
                    }}
                  >
                    <input
                      type="radio" name="proveedor_id" value={p.id} className="sr-only"
                      checked={elegido === p.id} onChange={() => setElegido(p.id)}
                    />
                    <span
                      aria-hidden
                      style={{
                        width: 12, height: 12, borderRadius: 7, flexShrink: 0,
                        border: `1px solid ${elegido === p.id ? V.grafito : V.lineaFuerte}`,
                        background: elegido === p.id ? V.grafito : 'transparent',
                      }}
                    />
                    <span className="min-w-0 truncate" style={{ fontSize: '12.5px', fontWeight: elegido === p.id ? 600 : 400, color: V.tinta }}>
                      {p.nombre}
                    </span>
                    <span className="font-mono" style={{ marginLeft: 'auto', fontSize: '11px', color: V.tenue, flexShrink: 0 }}>
                      {p.cuit ? formatearCuit(p.cuit) : 'sin CUIT'}
                    </span>
                  </label>
                ))}
              </div>
            )}
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button
          type="submit"
          form="form-vincular"
          disabled={!elegido || pendiente}
          data-testid="vincular"
          style={{
            display: 'flex', alignItems: 'center', gap: 7, borderRadius: 6, padding: '8px 13px',
            fontSize: '12.5px', fontWeight: 600,
            background: elegido ? V.marca : V.hover,
            color: elegido ? V.tinta : V.lupa,
            cursor: elegido ? 'pointer' : 'not-allowed',
          }}
        >
          <IconoCompletar className="h-[14px] w-[14px]" />
          {pendiente ? 'Vinculando…' : `Vincular ${nombre.comprobantes} ${nombre.comprobantes === 1 ? 'comprobante' : 'comprobantes'}`}
        </button>
        <button
          type="button" onClick={() => setCrear((v) => !v)} data-testid="abrir-crear-proveedor"
          style={{ fontSize: '12.5px', color: V.apagado, padding: '8px 4px' }}
        >
          Crear proveedor
        </button>
        <BotonAccion
          accion={noEsProveedor} args={[nombre.nombre_norm, nombre.nombre_origen]}
          testid="no-es-proveedor"
        >
          No es proveedor
        </BotonAccion>
      </div>

      {/* EL CTA APAGADO NOMBRA LO QUE FALTA, y el error del servidor se muestra siempre: los dos
          son la misma regla —nadie se va creyendo que escribió algo que no escribió—. */}
      {!elegido && (
        <p style={{ fontSize: '11.5px', color: V.tenue, marginTop: 8 }} data-testid="vincular-bloqueado">
          Elegí el proveedor de la lista.
        </p>
      )}
      {estado?.ok === true && <p style={{ fontSize: '12px', color: '#067647', marginTop: 8 }} data-testid="vincular-ok">Vinculado.</p>}
      {estado?.ok === false && <p style={{ fontSize: '12px', color: V.neg, marginTop: 8 }} data-testid="vincular-error">{estado.error}</p>}

      {crear && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${V.lineaFila}`, paddingTop: 14 }} data-testid="crear-desde-pendiente">
          {/* El nombre viene precargado con el texto del Sheet: es el que hay que reconocer después,
              y retipearlo es la forma más rápida de crear una variante más. El CUIT queda vacío. */}
          <FormCrear nombre={nombre} accion={crearYVincular} />
        </div>
      )}

      <p style={{ fontSize: '11px', lineHeight: 1.6, color: V.tenue, marginTop: 12, textWrap: 'pretty' }} data-testid="nota-vincular">
        Vincular escribe una sola fila y resuelve los {nombre.comprobantes} comprobantes de una vez.
        El OS no vincula por parecido: el nombre tiene que estar escrito exactamente igual.
      </p>
    </PanelFilo>
  )
}

/** El alta desde la cola, con el mismo formulario del maestro para no tener dos definiciones. */
function FormCrear({ nombre, accion }: { nombre: NombrePendiente; accion: AccionFormulario }) {
  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_previo, form) => accion(form),
    null,
  )
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); startTransition(() => ejecutar(d)) }}
      data-testid="form-crear-vincular"
    >
      <CamposProveedor proveedor={{ id: '', nombre: nombre.nombre_origen, razon_social: null, cuit: null, notas: null, activo: true }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="submit" disabled={pendiente} data-testid="form-crear-vincular-enviar"
          style={{ borderRadius: 6, padding: '7px 13px', fontSize: '12.5px', fontWeight: 600, background: V.marca, color: V.tinta }}
        >
          {pendiente ? 'Creando…' : 'Crear y vincular'}
        </button>
        {estado?.ok === true && <span style={{ fontSize: '12px', color: '#067647' }} data-testid="form-crear-vincular-ok">Proveedor creado y vinculado.</span>}
        {estado?.ok === false && <span style={{ fontSize: '12px', color: V.neg }} data-testid="form-crear-vincular-error">{estado.error}</span>}
      </div>
    </form>
  )
}
