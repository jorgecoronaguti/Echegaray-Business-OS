# LA CAPA DE TEXTO Y LAS LÍNEAS DE UNA LÁMINA, CRUDAS. Nada más.
#
# Mismo reparto que `recortar.py`: acá se saca lo que sólo MuPDF puede sacar —dónde está cada
# palabra, hacia dónde está escrita, y dónde está cada segmento dibujado— y NINGUNA decisión. Qué es
# una cota, qué línea está partida en dos y a qué elemento pertenece se decide en `cotas.mjs`, que
# es puro y se puede probar sin abrir un PDF.
#
# Uso:  python3 cotas.py <pdf> [pagina]   →  JSON por stdout
#
# Las coordenadas salen en el sistema de MuPDF (origen arriba a la izquierda) y en puntos, que es el
# mismo en el que salen las palabras: mezclar con el sistema de pdfjs que usa `segmentar.mjs` daría
# distancias correctas y posiciones espejadas.

import sys
import json
import math

import fitz


def palabras(page):
    """Cada palabra con su caja y la DIRECCIÓN de escritura. El texto de una cota se dibuja
    paralelo a su línea, y sin la dirección no se puede distinguir de un rótulo cualquiera."""
    out = []
    for bloque in page.get_text("dict")["blocks"]:
        for linea in bloque.get("lines", []):
            dx, dy = linea.get("dir", (1, 0))
            for span in linea.get("spans", []):
                x0, y0, x1, y1 = span["bbox"]
                partes = span["text"].split()
                if not partes:
                    continue
                # El span puede traer varias palabras y una sola caja: se reparte proporcional al
                # largo de cada una. Es aproximado y alcanza — la tolerancia de todo lo que sigue
                # está en puntos, no en caracteres.
                total = sum(len(p) for p in partes)
                pos = x0
                for p in partes:
                    w = (x1 - x0) * len(p) / max(total, 1)
                    out.append({"t": p, "x0": pos, "y0": y0, "x1": pos + w, "y1": y1, "dir": [dx, dy]})
                    pos += w + (x1 - x0) * 0.5 / max(total, 1)
    return out


def segmentos(page, minimo=3.0):
    """Todos los segmentos rectos dibujados. Los rectángulos se abren en sus cuatro lados: una cota
    encerrada en un cuadro es una línea como cualquier otra."""
    out = []
    def agregar(a, b, c, d):
        if math.hypot(c - a, d - b) >= minimo:
            out.append([a, b, c, d])
    for path in page.get_drawings():
        for it in path["items"]:
            if it[0] == "l":
                agregar(it[1].x, it[1].y, it[2].x, it[2].y)
            elif it[0] == "re":
                r = it[1]
                agregar(r.x0, r.y0, r.x1, r.y0)
                agregar(r.x1, r.y0, r.x1, r.y1)
                agregar(r.x1, r.y1, r.x0, r.y1)
                agregar(r.x0, r.y1, r.x0, r.y0)
    return out


def main():
    if len(sys.argv) < 2:
        print("uso: cotas.py <pdf> [pagina]", file=sys.stderr)
        return 2
    doc = fitz.open(sys.argv[1])
    try:
        page = doc[int(sys.argv[2]) - 1 if len(sys.argv) > 2 else 0]
        json.dump({"palabras": palabras(page), "segmentos": segmentos(page),
                   "ancho": page.rect.width, "alto": page.rect.height}, sys.stdout)
        return 0
    finally:
        doc.close()


if __name__ == "__main__":
    sys.exit(main())
