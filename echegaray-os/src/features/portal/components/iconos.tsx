import type { ReactNode } from 'react'

// LOS ICONOS DEL PORTAL — copiados carácter por carácter de `29` y `30`.
//
// No se reusan los de `shared/components/canon/iconos.tsx` ni los del OS: el portal dibuja con
// `strokeWidth` 1.8 y 1.9 (el canon usa 2) y varios trazos son distintos —la casa del `29` lleva la
// puerta (`M10 21v-6h4v6`) en la solapa y NO la lleva en el selector del header, línea 32 contra 72—.
// A 13–16px de caja esas diferencias son la mitad del peso del trazo, que es exactamente lo que el
// dueño llamó «aspecto distinto».
//
// Cada icono cita la línea del `.dc.html` de la que salió.

function Ico({ s = 15, w = 1.9, children, style }: {
  s?: number; w?: number; children: ReactNode; style?: React.CSSProperties
}) {
  return (
    <svg
      aria-hidden
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  )
}

type P = { s?: number; w?: number }

/** Obra, con puerta. Solapa «Mi obra» (`29:72`) y la barra de abajo del teléfono (`30:223`). */
export const IcoObra = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M3 21h18M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" /></Ico>
)

/** Obra sin puerta — el selector de obra del header (`29:32`). */
export const IcoObraSelector = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M3 21h18M6 21V8l6-4 6 4v13" /></Ico>
)

/** Tarjeta: solapa «Certificados y pagos» y el botón Pagar (`29:76`, `29:620`). */
export const IcoPago = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></Ico>
)

/** Calendario: la solapa Pagos del teléfono y el conmutador de vista (`30:120`, `30:227`). */
export const IcoCalendario = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ico>
)

/** Carpeta: solapa «Documentos» (`29:81`). */
export const IcoCarpeta = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></Ico>
)

/** Documento con renglones: «Certificados y facturas» (`29:242`). */
export const IcoDocumento = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>
)

/** Documento liso: «Plan de trabajos», la solapa Comprobantes del teléfono (`29:557`, `30:231`). */
export const IcoArchivo = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></Ico>
)

/** Documento con tilde: contrato firmado, recibo pagado (`29:530`, `30:285`). */
export const IcoArchivoOk = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5M9 14l1.6 1.6L14 12" /></Ico>
)

/** Planos: pila de hojas (`29:545`). */
export const IcoPlano = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" /><path d="M9 4v13M15 7v13" /></Ico>
)

/** Escudo: la póliza y la línea de seguridad del ingreso (`29:569`, `30:54`). */
export const IcoEscudo = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M12 3l8 4v6c0 4.2-3.2 7.4-8 8-4.8-.6-8-3.8-8-8V7z" /></Ico>
)

/** Lápiz: el acta que requiere firma (`29:581`). */
export const IcoFirmar = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Ico>
)

/** Bocadillo: Observar, Consultas, «En revisión» (`29:154`, `29:634`). */
export const IcoConsulta = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M20 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2z" /></Ico>
)

/** Portapapeles con tilde: el certificado que espera aprobación (`29:134`). */
export const IcoParaAprobar = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M9 11l3 3 7-7" /><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h8" /></Ico>
)

/** El tilde de Aprobar, trazo 2.2 (`29:158`). */
export const IcoTilde = ({ s = 14, w = 2.2 }: P) => (
  <Ico s={s} w={w}><path d="M5 13l4 4L19 7" /></Ico>
)

/** Reloj: «A vencer» y «la más antigua hace 40 días» (`29:284`, `29:600`). */
export const IcoReloj = ({ s = 14, w = 2 }: P) => (
  <Ico s={s} w={w}><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5l3 2" /></Ico>
)

/** Círculo con tilde: pagado, hito terminado (`29:371`, `29:427`). */
export const IcoOk = ({ s = 14, w = 2 }: P) => (
  <Ico s={s} w={w}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.6 2.6L16 9.5" /></Ico>
)

/** Triángulo de atención: vencido, hito atrasado (`29:328`). */
export const IcoAlerta = ({ s = 14, w = 2 }: P) => (
  <Ico s={s} w={w}><path d="M12 3l9 16H3z" /><path d="M12 9v4.5M12 16.5h.01" /></Ico>
)

/** Círculo vacío: hito sin iniciar (`29:457`). */
export const IcoPendiente = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><circle cx="12" cy="12" r="9" /></Ico>
)

/** Flecha abajo: descargar (`29:268`). */
export const IcoDescargar = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" /></Ico>
)

/** Flecha arriba: «Informar transferencia» (`29:624`). */
export const IcoSubir = ({ s = 14, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14" /></Ico>
)

/** «+» de nueva consulta, trazo 2.2 (`29:638`). */
export const IcoMas = ({ s = 14, w = 2.2 }: P) => (
  <Ico s={s} w={w}><path d="M12 5v14M5 12h14" /></Ico>
)

/** Chevron abajo: el selector de obra (`29:34`). */
export const IcoChevron = ({ s = 13, w = 2 }: P) => (
  <Ico s={s} w={w}><path d="M6 9l6 6 6-6" /></Ico>
)

/** Chevrons del navegador de mes del teléfono (`30:112`, `30:116`). */
export const IcoAnterior = ({ s = 15, w = 2 }: P) => (
  <Ico s={s} w={w}><path d="M15 6l-6 6 6 6" /></Ico>
)
export const IcoSiguiente = ({ s = 15, w = 2 }: P) => (
  <Ico s={s} w={w}><path d="M9 6l6 6-6 6" /></Ico>
)

/** Chincheta: la ubicación de la obra (`29:47`). */
export const IcoUbicacion = ({ s = 13, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></Ico>
)

/** Calendario chico de la línea de fechas de la obra (`29:51`). */
export const IcoFechas = ({ s = 13, w = 1.9 }: P) => (
  <Ico s={s} w={w}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ico>
)

/** Renglones: el bloque «Hitos» (`29:421`). */
export const IcoHitos = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M4 6h16M4 12h10M4 18h13" /></Ico>
)

/** Listado: el conmutador del teléfono (`30:123`). */
export const IcoListado = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1" /></Ico>
)

/** Cámara: «Fotos de avance» (`29:480`). */
export const IcoFoto = ({ s = 15, w = 1.9 }: P) => (
  <Ico s={s} w={w}>
    <rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.4" />
    <path d="M9 6l1.2-2h3.6L15 6" />
  </Ico>
)

/** Cámara del recuadro vacío de foto, trazo 1.5 y sin la muesca (`29:488`). */
export const IcoFotoVacia = ({ s = 26, w = 1.5 }: P) => (
  <Ico s={s} w={w}><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.4" /></Ico>
)

/** Teléfono: «Llamar» en el bloque Su contacto (`29:682`). */
export const IcoLlamar = ({ s = 16, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M5 3h4l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z" /></Ico>
)

/** Sobre: el campo de mail del ingreso (`30:45`). */
export const IcoMail = ({ s = 17, w = 1.9 }: P) => (
  <Ico s={s} w={w}><path d="M4 5h16v14H4z" /><path d="M4 9l8 5 8-5" /></Ico>
)
