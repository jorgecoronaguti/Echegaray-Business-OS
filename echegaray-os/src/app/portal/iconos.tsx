// LOS ICONOS DEL PORTAL DEL CLIENTE — trazo, no emoji, y ninguno redibujado a ojo.
//
// ═══ DE DÓNDE SALEN ═══
//
// Cada `path` de acá está copiado de las maquetas `Cliente · Compu.dc.html` y `Cliente · Mobile.dc.html`,
// no dibujado de nuevo. Redibujar "algo parecido" es la forma más barata de perder la fidelidad: dos
// iconos con el mismo nombre y medio píxel de diferencia se ven mal juntos y nadie sabe cuál es el bueno.
//
// La FIRMA es la canónica del repo (`app/campo/iconos.tsx`): `viewBox 0 0 24 24`, `strokeWidth 1.6`,
// `fill none`, `stroke currentColor`. El color lo decide siempre quien lo usa —el estado de la fila—,
// nunca el icono. Por eso ninguno trae color propio.
//
// EL TRIÁNGULO NO SE REDIBUJA: se importa `IconoProblema` de `/campo`. Es el mismo icono, ya dibujado
// y ya en producción. La contra es que acopla dos productos que son independientes; se acepta a
// propósito, porque la alternativa es una tercera copia del mismo triángulo (el jefe de obra ya tiene
// la segunda) y ahí la divergencia es cuestión de tiempo.
//
// ═══ POR QUÉ EL TAMAÑO ES UN NÚMERO Y NO UNA CLASE ═══
//
// Las maquetas cambian el DIBUJO según el tamaño: el calendario muestra sus marcas internas a 21px y
// las pierde a 20px; la factura muestra sus renglones a 21px y los pierde a 20px. No es un descuido —
// a 20px esos trazos se empastan y el icono se convierte en una mancha. Si el tamaño llegara por
// `className`, el icono no podría saberlo y esa decisión quedaría en manos de cada pantalla, que es
// donde se olvida. Llega como número, y el icono decide solo.

import type { ReactNode } from 'react'
import { IconoProblema } from '../campo/iconos'

/** El umbral de las maquetas: de acá para arriba el icono se permite detalle interior. */
export const DETALLE_DESDE = 21

type Props = { tamano?: number; className?: string }

function Trazo({ tamano = 20, className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

/* ── LOS CINCO DESTINOS DEL MENÚ ────────────────────────────────────────────────────────────── */

/** Inicio: la casa, con puerta. */
export function IconoInicio(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M3.5 20.5h17" />
      <path d="M6.5 20.5V9l5.5-4 5.5 4v11.5" />
      {(p.tamano ?? 20) >= DETALLE_DESDE ? <path d="M10 20.5v-5h4v5" /> : null}
    </Trazo>
  )
}

/** Pagos: el calendario. Las marcas de adentro son los pagos anotados; se pierden en chico. */
export function IconoPagos(p: Props) {
  return (
    <Trazo {...p}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      {(p.tamano ?? 20) >= DETALLE_DESDE ? <path d="M8 14h3M14 14h2" /> : null}
    </Trazo>
  )
}

/** Facturas: la hoja con la esquina doblada. Los renglones se pierden en chico. */
export function IconoFactura(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M14 3.5H7a1.5 1.5 0 00-1.5 1.5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8z" />
      <path d="M14 3.5V8h4.5" />
      {(p.tamano ?? 20) >= DETALLE_DESDE ? <path d="M9 13h6M9 16.5h4" /> : null}
    </Trazo>
  )
}

/** Documentos: la carpeta. Es la carpeta de la obra en Drive, no una metáfora. */
export function IconoCarpeta(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M3.5 7.5A1.5 1.5 0 015 6h4l2 2.5h8a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0119 19.5H5A1.5 1.5 0 013.5 18z" />
    </Trazo>
  )
}

/**
 * Terminadas: el tilde con el círculo ABIERTO.
 *
 * No es el mismo que `IconoCheck`. El cerrado afirma un hecho puntual —esta factura está pagada—; el
 * abierto es el destino "obras terminadas", donde el arco que no cierra sugiere el recorrido. Las
 * maquetas los usan en lugares distintos y no se intercambian.
 */
export function IconoTerminadas(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M20.5 6.5l-9 9-4-4" />
      <path d="M20.5 12.5A8.5 8.5 0 1112 4" />
    </Trazo>
  )
}

/* ── ESTADOS ────────────────────────────────────────────────────────────────────────────────── */

/** Pagado: el tilde en el círculo cerrado. */
export function IconoCheck(p: Props) {
  return (
    <Trazo {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.3l2.4 2.4 4.6-5" />
    </Trazo>
  )
}

/**
 * Vencido: el triángulo. NO se redibuja — es el de `/campo`, ya en producción.
 *
 * Va envuelto porque `IconoProblema` mide por clase de Tailwind y acá el tamaño es un número: una
 * clase armada por interpolación (`h-[${tamano}px]`) NO existe para Tailwind —compila las clases
 * leyendo el archivo, no ejecutándolo— y el icono saldría del tamaño que tenga por defecto. El
 * envoltorio fija la medida de verdad y el trazo la ocupa entera.
 */
export function IconoAlerta({ tamano = 20, className }: Props) {
  return (
    <span className={className} style={{ display: 'inline-flex', width: tamano, height: tamano }}>
      <IconoProblema className="h-full w-full" />
    </span>
  )
}

/** Próximo / programado: el reloj. */
export function IconoReloj(p: Props) {
  return (
    <Trazo {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Trazo>
  )
}

/* ── ACCIONES ───────────────────────────────────────────────────────────────────────────────── */

/** Descargar: la flecha al piso. El icono más repetido del portal. */
export function IconoDescarga(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M12 4v11" />
      <path d="M8 11.5l4 4 4-4" />
      <path d="M4.5 19.5h15" />
    </Trazo>
  )
}

/** Adjuntar: el clip. */
export function IconoClip(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M20 11.5l-7.6 7.6a4.2 4.2 0 01-6-6l7.7-7.7a2.8 2.8 0 014 4l-7.7 7.7a1.4 1.4 0 01-2-2l7-7" />
    </Trazo>
  )
}

/** Transferir: el frente del banco. Es la acción primaria del Inicio. */
export function IconoBanco(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M4 10.5L12 5l8 5.5" />
      <path d="M5.5 10.5v8M18.5 10.5v8M3.5 19h17M9.5 10.5v8M14.5 10.5v8" />
    </Trazo>
  )
}

/** El cliente. Va en "salir" y en la barra de obras. */
export function IconoUsuario(p: Props) {
  return (
    <Trazo {...p}>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 19.5c1.4-3 3.8-4.5 6.5-4.5s5.1 1.5 6.5 4.5" />
    </Trazo>
  )
}

/* ── NAVEGACIÓN ─────────────────────────────────────────────────────────────────────────────── */

/** El chevron. Un solo icono: hacia dónde apunta es un dato, no otro dibujo. */
export function IconoChevron({ hacia = 'derecha', ...p }: Props & { hacia?: 'derecha' | 'izquierda' }) {
  return <Trazo {...p}>{hacia === 'derecha' ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}</Trazo>
}

/** La flecha larga del botón «Continuar». No es el chevron: el chevron navega, la flecha confirma. */
export function IconoFlecha(p: Props) {
  return (
    <Trazo {...p}>
      <path d="M5 12h13" />
      <path d="M13 7l5 5-5 5" />
    </Trazo>
  )
}

/** El sobre del campo de mail. Único lugar donde entra un dato en todo el portal. */
export function IconoMail(p: Props) {
  return (
    <Trazo {...p}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 8l8 5.5L20 8" />
    </Trazo>
  )
}
