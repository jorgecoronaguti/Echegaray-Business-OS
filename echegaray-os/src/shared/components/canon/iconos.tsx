import type { ReactNode } from 'react'

// LOS ICONOS DE LAS PANTALLAS DE ADMINISTRACIÓN — copiados de los `.dc.html`, trazo incluido.
//
// ═══ POR QUÉ NO SE REUSA `shared/components/iconos.tsx` ═══
//
// Porque dibuja con `strokeWidth="1.6"` y las nueve pantallas del zip dibujan con `2` (y `2.2`/`2.4`
// en el «+», el check y el chevron de plegado). A 13–15px de caja esa diferencia es la mitad del
// peso del trazo: el icono de 1.6 se ve desteñido al lado del texto de 12,5px y es parte de lo que
// el dueño llamó «aspecto distinto». El zip manda, así que estos son los del zip.
//
// No reemplazan al set del OS: el del OS sigue siendo el canónico de las pantallas que no están en
// este porte. Cuando el porte termine y las dos familias convivan sin motivo, se unifican — y se
// unifican HACIA ÉSTA, que es la medida.
//
// Cada icono cita la pantalla de la que salió. `d` es idéntico carácter por carácter.

function Ico({ s = 14, w = 2, children, className }: { s?: number; w?: number; children: ReactNode; className?: string }) {
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
      className={className}
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

type P = { s?: number; className?: string }

// ═══ ACCIONES ═══

/** «+» de toda acción de alta. `14:73` lo dibuja en 2.2; el del panel de `16` en 2.4. */
export const IcoMas = ({ s = 14, w = 2.2, className }: P & { w?: number }) => (
  <Ico s={s} w={w} className={className}><path d="M12 5v14M5 12h14" /></Ico>
)

/** «−» del control de margen. `16`, trazo 2.4. */
export const IcoMenos = ({ s = 15, className }: P) => (
  <Ico s={s} w={2.4} className={className}><path d="M5 12h14" /></Ico>
)

/** Lupa. `14:60`, `22`, `24`, `25`, `27` — idéntica en las cinco. */
export const IcoBuscar = ({ s = 13, className }: P) => (
  <Ico s={s} className={className}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></Ico>
)

/** Los tres puntos de «Más acciones». Es el único icono RELLENO del set. */
export const IcoMasAcciones = ({ s = 15, className }: P) => (
  <svg aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} style={{ flexShrink: 0 }}>
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
  </svg>
)

/** Lápiz de editar / «en revisión». `14`, `23`, `26`. */
export const IcoEditar = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Ico>
)

/** Duplicar. `14`, panel de la cartera. */
export const IcoDuplicar = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></Ico>
)

/** Cerrar el panel. `14`. */
export const IcoCerrar = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M6 6l12 12M18 6L6 18" /></Ico>
)

/** Chevron: abre la fila, pliega el rubro, avanza el aviso. `14`, `15`, `23`. */
export const IcoChevron = ({ s = 15, w = 2, className, rotacion }: P & { w?: number; rotacion?: string }) => (
  <svg
    aria-hidden width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className}
    style={{ flexShrink: 0, transform: rotacion }}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
)

/** Flecha de «Pedir papeles». `23`. */
export const IcoFlecha = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>
)

/** Avión de enviar. `14` (Enviar al cliente), `15` (Enviar revisión), `23` (Pedir documentación). */
export const IcoEnviar = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M4 12l16-8-7 16-2-6z" /></Ico>
)

/** Check. `14` (ok), `16` (Guardar análisis, trazo 2.2), `22` (papeles al día, trazo 2.4). */
export const IcoCheck = ({ s = 15, w = 2.4, className }: P & { w?: number }) => (
  <Ico s={s} w={w} className={className}><path d="M5 13l4 4L19 7" /></Ico>
)

/** Cruz de «perdido». `26`. */
export const IcoPerdido = ({ s = 16, className }: P) => (
  <Ico s={s} className={className}><path d="M6 6l12 12M18 6L6 18" /></Ico>
)

/** Flecha a la derecha de «convertir en obra». `14`. */
export const IcoConvertir = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M4 12h16M14 6l6 6-6 6" /></Ico>
)

/** Recalcular con base maestra. `15`. */
export const IcoRecalcular = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /></Ico>
)

/** Exportar / descargar. `15`, `27`. */
export const IcoExportar = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M12 4v12M8 12l4 4 4-4M4 19v1a1 1 0 001 1h14a1 1 0 001-1v-1" /></Ico>
)

/** Subir. `24` (Cargar comprobante), `27` (Subir). */
export const IcoSubir = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M12 16V4M8 8l4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></Ico>
)

/** Ojo de «Ver». `27`. */
export const IcoVer = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></Ico>
)

/** Tacho de «Quitar» un insumo. `16`. */
export const IcoQuitar = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Ico>
)

// ═══ ENTIDADES ═══

/** El edificio del CLIENTE. `14`, `26`, `27`. */
export const IcoCliente = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M4 21V6l8-3v18M12 21h8V10l-8-3" /></Ico>
)

/** La casa de la OBRA. `14`, `26`, `27`. */
export const IcoObra = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M3 21h18M6 21V8l6-4 6 4v13" /><path d="M10 21v-6h4v6" /></Ico>
)

/** Una PERSONA sola. `14`, `23`, `26`, `27`. */
export const IcoPersona = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="3.6" /></Ico>
)

/** La CUADRILLA / el SUBCONTRATISTA: dos personas. `16`, `22`, `23`, `24`. */
export const IcoCuadrilla = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="3.2" /><path d="M22 21v-2a4 4 0 00-3-3.8" />
  </Ico>
)

/** El PRESUPUESTO: la hoja con renglones. `14`, `26`. */
export const IcoPresupuesto = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></Ico>
)

/** El DOCUMENTO: la hoja con la esquina doblada. `22`, `23`, `24`, `26`, `27`. */
export const IcoDocumento = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" /><path d="M14 3v5h5" /></Ico>
)

/** El MATERIAL: la caja. `16`, `22`, `24`. */
export const IcoMaterial = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M4 8l8-4 8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8" /></Ico>
)

/** El EQUIPO / el camión del PROVEEDOR. `16`, `22`, `24`, `27`. */
export const IcoEquipo = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}>
    <path d="M3 17h2l1.5-5h9L17 17h4" /><circle cx="7.5" cy="19" r="2" /><circle cx="17.5" cy="19" r="2" />
  </Ico>
)

/** El SERVICIO: el escudo. `22`, `24`. */
export const IcoServicio = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></Ico>
)

/** La BASE MAESTRA: el barril de datos. `15`, `16`. */
export const IcoBaseMaestra = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}>
    <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" /><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
  </Ico>
)

/** El PAQUETE contratado. `23`. */
export const IcoPaquete = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M9 7H5a2 2 0 00-2 2v6a2 2 0 002 2h4M15 7h4a2 2 0 012 2v6a2 2 0 01-2 2h-4M8 12h8" /></Ico>
)

/** La LISTA: partidas, «todos». `14`, `27`. */
export const IcoLista = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><path d="M4 7h16M4 12h16M4 17h9" /></Ico>
)

// ═══ DATOS Y ESTADO ═══

/** El triángulo de ALERTA. El más repetido del zip: aparece en las nueve pantallas. */
export const IcoAlerta = ({ s = 13, w = 2, className }: P & { w?: number }) => (
  <Ico s={s} w={w} className={className}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" /></Ico>
)

/** El BLOQUEO: el círculo con la exclamación. `23` — es más grave que la alerta. */
export const IcoBloqueo = ({ s = 16, className }: P) => (
  <Ico s={s} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16v.01" /></Ico>
)

/** El RELOJ: HH del cómputo, «vence pronto», historial. `14`, `23`, `27`. */
export const IcoReloj = ({ s = 14, className }: P) => (
  <Ico s={s} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5l3 2" /></Ico>
)

/** El HISTORIAL: la flecha que vuelve, con la aguja adentro. `16`, `23`, `26`. */
export const IcoHistorial = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4M3 4v4h4" /><path d="M12 8v4.5l3 2" /></Ico>
)

/** El CALENDARIO. `14`, `23`, `26`. */
export const IcoFecha = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ico>
)

/** El CUIT: la tarjeta con la banda. `22`, `23`, `26`. */
export const IcoCuit = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></Ico>
)

/** El MAIL: el sobre. Se distingue del CUIT por la solapa, no por la caja. `23`, `26`. */
export const IcoMail = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></Ico>
)

/** El TELÉFONO. `23`, `26`. */
export const IcoTelefono = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M5 3h4l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z" /></Ico>
)

/** El DOMICILIO. `26`. */
export const IcoCasa = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></Ico>
)

/** El signo PESOS: condición de pago, costo y margen, a pagar. `15`, `23`, `24`, `26`. */
export const IcoDinero = ({ s = 15, className }: P) => (
  <Ico s={s} className={className}><path d="M12 3v18M8 7h6.5a2.5 2.5 0 010 5H9.5a2.5 2.5 0 000 5H16" /></Ico>
)

/** Las BARRAS del rendimiento. `23`. */
export const IcoRendimiento = ({ s = 16, className }: P) => (
  <Ico s={s} className={className}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></Ico>
)

/** Comparación contra la base maestra: sube · baja · igual. `16`. */
export const IcoSube = ({ s = 13, className }: P) => (
  <Ico s={s} className={className}><path d="M12 19V5M6 11l6-6 6 6" /></Ico>
)
export const IcoBaja = ({ s = 13, className }: P) => (
  <Ico s={s} className={className}><path d="M12 5v14M6 13l6 6 6-6" /></Ico>
)
export const IcoIgual = ({ s = 13, className }: P) => (
  <Ico s={s} className={className}><path d="M5 10h14M5 14h14" /></Ico>
)
