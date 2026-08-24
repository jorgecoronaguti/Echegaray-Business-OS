// LA ICONOGRAFÍA CANÓNICA DEL OS — Design System 23/08/2026, sección 11.
//
// UNA ACCIÓN = UN ICONO en toda la plataforma; nunca dos iconos para la misma acción ni el mismo
// icono para dos acciones. Trazo 1.6, viewBox 24×24, `currentColor`, sin emojis. El tamaño lo pone
// la clase de quien lo usa; el color lo decide el estado del texto, nunca el icono (semántico sólo
// cuando comunica estado real: pos hecho · info en curso · warn falta un dato · neg bloqueo — el
// amarillo de marca no se usa en iconos de estado).
//
// Icono solo + tooltip (`title`/`aria-label` de quien lo usa) en toolbars, filas y paneles.
// Icono + texto en la acción primaria del contexto y en la navegación.
//
// Los cinco de `/campo` son canónicos y NO se redibujan: `IconoProblema` (Alerta) e
// `IconoHerramienta` (Equipo) de la tabla del Design System son ésos y acá se re-exportan.
// Los del jefe siguen en `features/jefe/components/Iconos.tsx`.

import type { ReactNode } from 'react'

type Props = { className?: string }

function Trazo({ className = 'h-[24px] w-[24px]', children }: Props & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
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

export { IconoProblema, IconoHerramienta } from '@/app/campo/iconos'

/** Filtrar por texto, siempre instantáneo. */
export function IconoBuscar(p: Props) {
  return <Trazo {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></Trazo>
}
/** Nueva entidad o fila. */
export function IconoCrear(p: Props) {
  return <Trazo {...p}><path d="M12 5v14M5 12h14" /></Trazo>
}
/** Abrir edición del registro. */
export function IconoEditar(p: Props) {
  return <Trazo {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Trazo>
}
/** Baja o borrado. */
export function IconoEliminar(p: Props) {
  return <Trazo {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Trazo>
}
/** Cerrar panel, modal o chip. */
export function IconoCerrar(p: Props) {
  return <Trazo {...p}><path d="M6 6l12 12M18 6L6 18" /></Trazo>
}
/** Menú contextual de la fila. */
export function IconoMasAcciones(p: Props) {
  return <Trazo {...p}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Trazo>
}
/** Filtros avanzados. */
export function IconoFiltrar(p: Props) {
  return <Trazo {...p}><path d="M4 5h16l-6 7v6l-4 2v-8z" /></Trazo>
}
/** Cambiar orden de la tabla. */
export function IconoOrdenar(p: Props) {
  return <Trazo {...p}><path d="M7 4v16M4 8l3-4 3 4M17 20V4M14 16l3 4 3-4" /></Trazo>
}
/** Disclosure de jerarquía o sección. */
export function IconoDesplegar(p: Props) {
  return <Trazo {...p}><path d="M6 9l6 6 6-6" /></Trazo>
}
/** Ir al detalle o a otra vista. */
export function IconoAbrir(p: Props) {
  return <Trazo {...p}><path d="M9 6l6 6-6 6" /></Trazo>
}
/** Confirmar, guardado, hecho. */
export function IconoCompletar(p: Props) {
  return <Trazo {...p}><path d="M5 13l4 4L19 7" /></Trazo>
}
/** Impedimento que frena el trabajo. */
export function IconoBloqueo(p: Props) {
  return <Trazo {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16v.01" /></Trazo>
}
/** Plazo, jornada, calendario. */
export function IconoFecha(p: Props) {
  return <Trazo {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Trazo>
}
/** Horas hombre, duración. */
export function IconoHH(p: Props) {
  return <Trazo {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 2" /></Trazo>
}
/** Usuario, contacto, responsable. */
export function IconoPersona(p: Props) {
  return <Trazo {...p}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="3.6" /></Trazo>
}
/** Grupo, dotación, personal externo. */
export function IconoCuadrilla(p: Props) {
  return <Trazo {...p}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 00-3-3.8" /></Trazo>
}
/** Proyecto, workspace de obra. */
export function IconoObra(p: Props) {
  return <Trazo {...p}><path d="M3 21h18M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" /></Trazo>
}
/** Empresa contratante. */
export function IconoCliente(p: Props) {
  return <Trazo {...p}><path d="M4 21V6l8-3v18M12 21h8V10l-8-3" /><path d="M8 10v.01M8 14v.01M16 13v.01M16 17v.01" /></Trazo>
}
/** Proveedor y subcontratista. */
export function IconoProveedor(p: Props) {
  return <Trazo {...p}><path d="M3 17h2l1.5-5h9L17 17h4" /><circle cx="7.5" cy="19" r="2" /><circle cx="17.5" cy="19" r="2" /></Trazo>
}
/** Archivo, plano, certificado. */
export function IconoDocumento(p: Props) {
  return <Trazo {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></Trazo>
}
/** Sumar archivo al registro. */
export function IconoAdjuntar(p: Props) {
  return <Trazo {...p}><path d="M21 12l-8.5 8.5a5 5 0 01-7-7l8-8a3.5 3.5 0 015 5l-8 8a2 2 0 01-3-3l7.5-7.5" /></Trazo>
}
/** Evidencia de campo. */
export function IconoFoto(p: Props) {
  return <Trazo {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.2" /></Trazo>
}
/** Nota, observación. */
export function IconoComentario(p: Props) {
  return <Trazo {...p}><path d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z" /></Trazo>
}
/** Vínculo entre actividades. */
export function IconoDependencia(p: Props) {
  return <Trazo {...p}><path d="M9 7H5a2 2 0 00-2 2v6a2 2 0 002 2h4M15 7h4a2 2 0 012 2v6a2 2 0 01-2 2h-4M8 12h8" /></Trazo>
}
/** Progreso físico registrado. */
export function IconoAvance(p: Props) {
  return <Trazo {...p}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></Trazo>
}
/** Costo, certificación, pago. */
export function IconoDinero(p: Props) {
  return <Trazo {...p}><path d="M12 3v18M8 7h6.5a2.5 2.5 0 010 5H9.5a2.5 2.5 0 000 5H16" /></Trazo>
}
/** Cotización y partidas. */
export function IconoPresupuesto(p: Props) {
  return <Trazo {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></Trazo>
}
/** Comprobante imputado. */
export function IconoCompra(p: Props) {
  return <Trazo {...p}><path d="M4 5h2l2.2 10h9.4L20 8H7" /><circle cx="9.5" cy="19" r="1.6" /><circle cx="17.5" cy="19" r="1.6" /></Trazo>
}
/** Trazabilidad del registro. */
export function IconoHistorial(p: Props) {
  return <Trazo {...p}><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /><path d="M12 8v4.5l3 2" /></Trazo>
}
/** Ajustes del contexto. */
export function IconoConfig(p: Props) {
  return <Trazo {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L5 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h5l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.2-1z" /></Trazo>
}
