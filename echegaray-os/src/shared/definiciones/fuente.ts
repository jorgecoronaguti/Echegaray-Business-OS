// LEER EL FUENTE COMO FUENTE DE VERDAD — lo compartido entre los tests que miran el código.
//
// Dos controles de este repo prueban reglas que NO tienen valor de retorno: «ningún `<Link>` de una
// lista precarga» (`shared/components/prefetch-en-listas.test.ts`) y «ningún archivo lee una fuente
// que dejó de ser la canónica» (`definiciones/canonico-definiciones.test.ts`). Los dos leen el
// repositorio, y los dos tienen el mismo agujero: un comentario que NOMBRA lo prohibido no es una
// infracción, y acusarlo pone rojo un archivo correcto.
//
// El 10/09/2026 el barrido de prefetch acusó a `TablaClientes.tsx:229` por un comentario que
// explicaba dónde vive el alto de la fila. `sinComentarios` nació ahí y vive acá para que el
// segundo control no lo copie: dos copias de la misma función de lectura es exactamente el defecto
// que el registro de definiciones existe para impedir, una capa más abajo.

import { execFileSync } from 'node:child_process'

/**
 * Borra los comentarios SIN MOVER LAS LÍNEAS: cada carácter se reemplaza por un espacio y los
 * saltos de línea se conservan, así el número de línea que se reporta sigue siendo el del archivo.
 *
 * LO QUE NO HACE: no entiende strings. Un `'// esto no es un comentario'` dentro de una cadena se
 * blanquea igual. Es aceptable para lo que estos dos controles buscan —atributos JSX y nombres de
 * tabla— y la alternativa (un parser de TypeScript) costaría más de lo que el defecto vale.
 */
export function sinComentarios(fuente: string): string {
  const blanquear = (s: string) => s.replace(/[^\n]/g, ' ')
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, blanquear)
    .replace(/^([ \t]*)\/\/.*$/gm, (m) => blanquear(m))
}

/** Las extensiones que son código de este repo. El `.sql` NO entra: las migraciones son la fuente. */
const EXTENSIONES = ['.ts', '.tsx', '.mjs', '.js', '.jsx']

/**
 * TODOS LOS ARCHIVOS DE CÓDIGO bajo `carpetas`, sin tests ni dependencias.
 *
 * Los `*.test.*` quedan afuera A PROPÓSITO: un test que prueba que la fuente vieja ya no se lee
 * tiene que poder NOMBRARLA. Si el barrido los mirara, el propio control se acusaría.
 *
 * Se usa `find` y no una lista: una lista escrita a mano no ve el archivo nuevo, que es justamente
 * donde vuelve el defecto. Lo aprendió el barrido de prefetch el 07/09/2026 — su lista estaba en
 * verde mientras el defecto vivía en cinco pantallas.
 */
export function archivosDeCodigo(raiz: string, carpetas: string[]): string[] {
  const salida: string[] = []
  for (const carpeta of carpetas) {
    const encontrados = execFileSync(
      'find', [raiz + carpeta, '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.next/*'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    ).trim().split('\n').filter(Boolean)
    for (const a of encontrados) {
      if (!EXTENSIONES.some((e) => a.endsWith(e))) continue
      if (/\.test\.[a-z]+$/.test(a)) continue
      salida.push(a)
    }
  }
  return salida
}

/**
 * Dónde matchea `patron` en `fuente`, por número de línea y ya sin comentarios.
 *
 * SE BUSCA SOBRE EL ARCHIVO ENTERO, no línea por línea, y no es un detalle: una consulta a Supabase
 * se escribe en varias líneas —`.from('obra_panel')` en una y `.select('… monto_contratado')` en la
 * siguiente— así que un barrido por líneas no ve NINGUNA de las lecturas que importan. Un patrón
 * como `from\('obra_panel'\)[^;]*monto_contratado` cruza el salto de línea porque `[^;]` lo incluye,
 * y el punto y coma corta en el final de la sentencia. La línea se calcula por posición.
 */
export function lineasQueMatchean(fuenteCruda: string, patron: RegExp): number[] {
  const fuente = sinComentarios(fuenteCruda)
  const re = new RegExp(patron.source, patron.flags.includes('g') ? patron.flags : `${patron.flags}g`)
  const salida: number[] = []
  for (let m = re.exec(fuente); m !== null; m = re.exec(fuente)) {
    salida.push(fuente.slice(0, m.index).split('\n').length)
    // Un patrón que puede matchear vacío colgaría el bucle.
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return salida
}
