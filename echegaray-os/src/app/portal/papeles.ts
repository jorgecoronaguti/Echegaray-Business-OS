// LOS PAPELES DEL CLIENTE, YA ESPEJADOS — reglas puras, sin red y sin base.
//
// `documentos.ts` traduce una carpeta de Drive leída EN VIVO. Este archivo traduce la otra mitad: qué
// de esa carpeta puede salir del OS, y qué de lo que ya salió puede ver cada acceso. Las dos son
// reglas de negocio y viven separadas de la llamada para poder probarse con nombres reales.
//
// ═══ POR QUÉ ESTO EXISTE (26/08/2026) ═══
//
// La pantalla leía Drive en cada carga con la cuenta de servicio, cuya credencial es un archivo en
// el disco de la VM. El portal corre en Vercel, donde no hay disco: los cinco clientes veían «No
// pudimos leer la carpeta ahora» y cero enlaces de descarga. Ahora un proceso de la VM baja los
// papeles a Storage y la pantalla lee el espejo.
//
// ═══ EL RIESGO REAL DE ESPEJAR UNA CARPETA ENTERA ═══
//
// La carpeta de la obra NO es la carpeta del cliente. Ahí adentro conviven el contrato firmado y
// «COMPUTO.xlsx», «Gastos - Franco Quattropani.pdf», «POSIBLES ADICIONALES.xlsm» y una subcarpeta
// «COTIZACION INTERNA». Publicarle a un cliente el cómputo con el que se le cotizó es un daño
// económico que no se deshace: por eso el espejo FALLA CERRADO — lo que no reconoce como papel del
// cliente queda con `visible_portal = false`, y lo que directamente es material de trabajo interno
// ni siquiera sale de Drive.

import { revisionDe, disciplinaDe, ROTULO_DISCIPLINA, ORDEN_DISCIPLINAS, type Disciplina } from './documentos.ts'
import { alcanzaLaObra } from './permisos.ts'

export type Categoria = 'cotizacion' | 'contrato' | 'plano' | 'certificado' | 'factura' | 'recibo' | 'otro'

/** Una fila de `public.documento_cliente` tal como la necesita la pantalla. */
export interface Papel {
  id: string
  obraId: string | null
  titulo: string
  categoria: Categoria
  disciplina: Disciplina | null
  /** `null` = el nombre no la trae. Se escribe «sin revisión», nunca «rev 1». */
  revision: string | null
  /** `null` = nadie las contó. No es 0. */
  hojas: number | null
  fecha: string | null
  bytes: number | null
  visiblePortal: boolean
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * QUÉ ES ESTE ARCHIVO PARA EL CLIENTE. Se mira el nombre del archivo y, si no alcanza, el de la
 * carpeta que lo contiene: los doce «Recibo 12.pdf» de San Francisco viven en «CERTIFICADOS» y las
 * facturas de Quattropani se llaman `30716304643_001_00001_00000220.pdf`, que es el nombre que le
 * pone ARCA — CUIT, punto de venta y número, sin la palabra «factura» en ningún lado.
 */
export function categoriaDe(nombre: string, carpeta = ''): Categoria {
  const n = sinTildes(nombre)
  const c = sinTildes(carpeta)
  if (/^\d{11}[_-]\d{3,5}[_-]\d{4,6}[_-]\d{6,10}/.test(n) || /factura/.test(n) || /factura/.test(c)) return 'factura'
  if (/\brecibo/.test(n)) return 'recibo'
  if (/certificad/.test(n)) return 'certificado'
  if (/contrato/.test(n)) return 'contrato'
  if (/cotizacion|presupuesto|\bppto\b/.test(n)) return 'cotizacion'
  if (/plano|\.dwg$/.test(n) || revisionDe(nombre) !== null || disciplinaDe(nombre) !== 'otra') return 'plano'
  // La carpeta decide sólo cuando el nombre del archivo no dijo nada. «Recibo 3.pdf» dentro de
  // «CERTIFICADOS» es un recibo; un PDF sin nombre útil ahí adentro, un certificado.
  if (/certificad/.test(c)) return 'certificado'
  if (/plano/.test(c)) return 'plano'
  if (/contrato/.test(c)) return 'contrato'
  return 'otro'
}

/** Qué hace el espejo con un archivo de Drive. */
export type Destino = 'publicar' | 'oculto' | 'saltar'

/**
 * LO QUE NUNCA SALE DE DRIVE. No es una lista de nombres feos: es el material con el que se cotiza y
 * se controla la obra. Un cliente que ve el cómputo sabe el margen, y la próxima cotización se
 * negocia contra ese número.
 */
const INTERNO = /\bintern|computo|costo|margen|rentabilidad|contrasen|password|analisis|\bgasto|liquidacion|jornal|proveedor/

/**
 * SÓLO SE ESPEJA LO QUE EL CLIENTE PUEDE ABRIR. Un `.dwg` es el archivo de trabajo del estudio, un
 * `.bak` es su respaldo automático y un `.xlsm` es la planilla de presupuestación con sus macros.
 * Ninguno de los tres es un papel: son las herramientas con las que se hizo el papel.
 *
 * Los documentos nativos de Google tampoco entran: `alt=media` no los descarga (hay que exportarlos)
 * y bajar una exportación silenciosa publicaría una versión que nadie revisó.
 */
const MIME_ESPEJABLE = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/

export interface ArchivoParaEspejar {
  nombre: string
  mimeType: string
  /** El nombre de la carpeta que lo contiene, para desambiguar. */
  carpeta?: string
}

export interface Veredicto {
  destino: Destino
  categoria: Categoria
  disciplina: Disciplina | null
  revision: string | null
  /** Por qué, en una frase. Es lo que imprime el informe del espejo. */
  motivo: string
}

/**
 * QUÉ HACER CON ESTE ARCHIVO — la decisión completa, en una función pura.
 *
 * Falla cerrado por diseño: lo que no se reconoce como papel del cliente se espeja OCULTO, no
 * publicado. Administración lo puede publicar desde la ficha; el camino inverso —descubrir que el
 * cliente vio algo que no debía— no existe.
 */
export function veredicto({ nombre, mimeType, carpeta = '' }: ArchivoParaEspejar): Veredicto {
  const categoria = categoriaDe(nombre, carpeta)
  const disciplina = categoria === 'plano' ? disciplinaDe(nombre) : null
  const revision = revisionDe(nombre)
  const base = { categoria, disciplina, revision }

  if (mimeType === 'application/vnd.google-apps.folder') {
    return { ...base, destino: 'saltar', motivo: 'es una carpeta' }
  }
  if (!MIME_ESPEJABLE.test(mimeType)) {
    return { ...base, destino: 'saltar', motivo: `no es un papel que el cliente pueda abrir (${mimeType || 'sin mime'})` }
  }
  if (INTERNO.test(sinTildes(nombre)) || INTERNO.test(sinTildes(carpeta))) {
    return { ...base, destino: 'saltar', motivo: 'material interno de la empresa' }
  }
  if (categoria === 'otro') {
    return { ...base, destino: 'oculto', motivo: 'no se reconoce como papel del cliente' }
  }
  return { ...base, destino: 'publicar', motivo: categoria }
}

/**
 * ¿SE BAJA A ESTA SUBCARPETA?
 *
 * El espejo NO recorre la carpeta entera hacia abajo. Dos razones concretas, las dos verificadas en
 * el Drive real: la carpeta de «Galpones, Mampostería, Cancha de Padel» CONTIENE las carpetas de
 * «Entrepiso», «Pisos Industriales» e «Instalación Eléctrica» —que son otras obras, con su propio
 * acceso— y además contiene «Archivos viejos» y «Cotizacion interna». Bajar a ciegas mezclaría obras
 * y publicaría material interno de un saque.
 *
 * Se baja UN nivel y sólo a las carpetas que son, por su nombre, del cliente. El espejo además se
 * niega a entrar a la carpeta declarada de otra obra, aunque el nombre pase este filtro.
 */
export function esCarpetaDelCliente(nombre: string): boolean {
  const n = sinTildes(nombre)
  if (INTERNO.test(n) || /viejo|backup|respaldo|borrador/.test(n)) return false
  return /certificad|plano|factura|recibo/.test(n) || /^contrato/.test(n)
}

/** Dónde queda el archivo dentro del bucket. El id de Drive va en la ruta: es lo único que no se repite. */
export function rutaEnBucket(clienteId: string, obraId: string | null, driveFileId: string, nombre: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(nombre)?.[1]?.toLowerCase() ?? 'bin'
  return `${clienteId}/${obraId ?? '_cliente'}/${driveFileId}.${ext}`
}

/**
 * QUÉ PAPELES VE ESTE ACCESO — el único portero de la pantalla y de la descarga.
 *
 * Las tres reglas son independientes y las tres tienen que valer a la vez:
 *   1. `puede_ver_obra = false` no ve NINGÚN documento. El acceso económico y el documental son
 *      permisos distintos: un contacto que sólo mira vencimientos no abre el contrato de obra.
 *   2. Un papel de una obra fuera del alcance no aparece. `obras = []` es NINGUNA, y un papel sin
 *      obra sólo lo alcanza quien alcanza TODAS — con un acceso acotado no hay forma de afirmar que
 *      le corresponda, así que falla cerrado.
 *   3. `visible_portal = false` no se muestra. Es la decisión de administración sobre ese papel y
 *      gana sobre cualquier permiso.
 */
export function papelesVisibles(
  papeles: Papel[],
  acceso: { puedeVerObra: boolean; obras: string[] | null },
): Papel[] {
  if (!acceso.puedeVerObra) return []
  return papeles.filter((p) => p.visiblePortal && alcanzaLaObra(acceso.obras, p.obraId))
}

export type PlanosDeObra = { disciplina: Disciplina; rotulo: string; docs: Papel[] }

export interface VistaDeObra {
  cotizacion: Papel | null
  contrato: Papel | null
  planos: PlanosDeObra[]
  /** Certificados y recibos: para el cliente son la misma pila de comprobantes de avance. */
  certificados: Papel[]
  facturas: Papel[]
  /** Lo que no encajó. Se muestra: esconderlo haría desaparecer un papel real que ya se publicó. */
  otros: Papel[]
  hojasTotales: number | null
}

/** LA PILA DE PAPELES DE UNA OBRA, ordenada como la lee el cliente. */
export function vistaDeObra(papeles: Papel[]): VistaDeObra {
  let cotizacion: Papel | null = null
  let contrato: Papel | null = null
  const certificados: Papel[] = []
  const facturas: Papel[] = []
  const otros: Papel[] = []
  const porDisciplina = new Map<Disciplina, Papel[]>()

  for (const p of papeles) {
    if (p.categoria === 'cotizacion') {
      // Entre dos cotizaciones gana la de revisión más alta: es la vigente.
      if (!cotizacion || (p.revision ?? '') > (cotizacion.revision ?? '')) cotizacion = p
    } else if (p.categoria === 'contrato') contrato = contrato ?? p
    else if (p.categoria === 'certificado' || p.categoria === 'recibo') certificados.push(p)
    else if (p.categoria === 'factura') facturas.push(p)
    else if (p.categoria === 'plano') {
      const d = p.disciplina ?? 'otra'
      porDisciplina.set(d, [...(porDisciplina.get(d) ?? []), p])
    } else otros.push(p)
  }

  const planos: PlanosDeObra[] = [...ORDEN_DISCIPLINAS, 'otra' as Disciplina]
    .filter((d) => porDisciplina.has(d))
    .map((d) => ({ disciplina: d, rotulo: ROTULO_DISCIPLINA[d], docs: porDisciplina.get(d)! }))

  // LAS HOJAS SE SUMAN SÓLO SI TODAS SE CONOCEN. Un total armado con las que sí tienen dato diría
  // «13 hojas» cuando podrían ser treinta, y eso es peor que no decir nada.
  const todas = planos.flatMap((p) => p.docs.map((d) => d.hojas))
  const hojasTotales = todas.length && todas.every((h) => h != null)
    ? (todas as number[]).reduce((s, h) => s + h, 0)
    : null

  return { cotizacion, contrato, planos, certificados, facturas, otros, hojasTotales }
}

/** ¿Esta obra tiene algo que mostrar? Sirve para no dibujar seis rubros vacíos. */
export const hayAlgoQueMostrar = (v: VistaDeObra): boolean =>
  Boolean(v.cotizacion || v.contrato || v.planos.length || v.certificados.length || v.facturas.length || v.otros.length)
