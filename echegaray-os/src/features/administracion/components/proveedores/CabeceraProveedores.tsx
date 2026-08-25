// LAS DOS SUB-VISTAS DE NIVEL 3, EL BUSCADOR Y EL ALTA — `22v2:81-103`.
//
// NIVEL 3 ES TEXTO CON SUBRAYADO, NO UNA TERCERA BARRA DE SOLAPAS. Arriba ya están la barra del
// producto y la del área; una tercera barra deja de decir dónde está parado el que mira. El activo
// se marca con `inset 0 -2px 0 #30302F` y su conteo se pone tenue —no gris claro— porque el número
// del que está abierto sí se lee.
//
// ═══ EL HUECO DE 420px NO ES UN ERROR DE MEDICIÓN ═══
//
// El mockup reserva la columna del panel en la cabecera (`22v2:100-102`) para que el buscador y el
// botón de alta queden alineados con la LISTA QUE GOBIERNAN, no con el borde de la página. Sin ese
// hueco, abrir el panel corre la tabla 420px hacia la izquierda y los controles se quedan flotando
// sobre el panel, gobernando algo que ya no está debajo. 420 = 372 del panel + 24 de margen + 24 de
// sangría.

import Link from 'next/link'
import { IconoCrear } from '@/shared/components/iconos'
import { BuscadorFilo } from './BuscadorFilo'
import { V } from './patron'

export interface SubVista {
  clave: string
  titulo: string
  /** `null` = no se pudo contar. El conteo se omite, nunca se escribe 0. */
  cuenta: number | null
  activa: boolean
  href: string
}

export function CabeceraProveedores({ vistas, buscador, altaHref, espacioPanel }: {
  vistas: SubVista[]
  buscador: { accion: string; q?: string; placeholder: string; oculto?: Record<string, string | undefined> }
  altaHref: string
  espacioPanel: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', padding: '26px 20px 0' }}>
      <div
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
          gap: 18, flexWrap: 'wrap', rowGap: 12,
        }}
        data-testid="vistas-proveedores"
      >
        {vistas.map((v) => (
          <Link
            key={v.clave}
            href={v.href}
            data-testid={`vista-${v.clave}`}
            aria-current={v.activa ? 'page' : undefined}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 7, paddingBottom: 6,
              boxShadow: v.activa ? `inset 0 -2px 0 ${V.grafito}` : 'none',
            }}
          >
            <span
              style={{
                fontSize: '16px', fontWeight: v.activa ? 600 : 500,
                color: v.activa ? V.tinta : V.tenue, letterSpacing: '-.01em',
              }}
            >
              {v.titulo}
            </span>
            {v.cuenta !== null && (
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: '11.5px', color: v.activa ? V.tenue : V.cuentaApagada }}
              >
                {v.cuenta}
              </span>
            )}
          </Link>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <BuscadorFilo
            accion={buscador.accion}
            q={buscador.q}
            placeholder={buscador.placeholder}
            oculto={buscador.oculto}
            testid="buscar-proveedor"
          />
          <Link
            href={altaHref}
            data-testid="nuevo-proveedor"
            className="hover:bg-[#EEBE00]"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: V.marca, color: V.tinta,
              fontSize: '12.5px', fontWeight: 600, borderRadius: 6, padding: '6px 11px',
            }}
          >
            <IconoCrear className="h-[14px] w-[14px]" />
            Nuevo proveedor
          </Link>
        </div>
      </div>

      {espacioPanel && <span className="hidden shrink-0 lg:block lg:w-[420px]" aria-hidden />}
    </div>
  )
}
