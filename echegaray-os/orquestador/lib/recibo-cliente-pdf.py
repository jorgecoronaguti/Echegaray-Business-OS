#!/usr/bin/env python3
"""
EL RECIBO DE UN CLIENTE, DIBUJADO DESDE COBRANZAS.

═══ POR QUÉ SE GENERA DESDE COBRANZAS Y NO SE COPIA EL ANTERIOR ═══

Los recibos 2 a 17 son un Excel exportado a PDF. Intenté reconstruir el 17 con `find_tables` para
continuarlo y la extracción no recupera la grilla: devuelve celdas fusionadas y columnas corridas.
Continuar un documento a partir de una lectura que no cierra sería poner números que no verifiqué
delante de un cliente — que es exactamente lo que las reglas del OS prohíben.

Cobranzas SÍ es fuente de verdad, la mantiene el dueño y ya tiene el pago aplicado. Cada número de
este PDF sale de una fila de esa pestaña y se puede señalar cuál. El documento lo dice.

═══ POR QUÉ PyMuPDF Y NO UN NAVEGADOR ═══

Ya está en la VM, no levanta un Chromium de 400 MB para dibujar una tabla, y produce un PDF con
texto real —no una imagen— así que el propio motor documental del OS después puede leerlo.

  python3 recibo-cliente-pdf.py <datos.json> <salida.pdf>
"""
import sys, json
import fitz

TINTA = (0.188, 0.188, 0.184)      # el grafito de la marca
APAGADO = (0.45, 0.45, 0.44)
LINEA = (0.85, 0.85, 0.83)
ACENTO = (0.992, 0.788, 0.0)       # el amarillo de la marca
VERDE = (0.15, 0.45, 0.28)

M = 48                              # margen
ANCHO, ALTO = 595, 842              # A4


def pesos(n):
    """Formato argentino: miles con punto, decimales con coma."""
    s = f"{abs(n):,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return f"-$ {s}" if n < 0 else f"$ {s}"


def fecha_ar(iso):
    if not iso:
        return ""
    a, m, d = str(iso)[:10].split("-")
    return f"{d}/{m}/{a}"


class Hoja:
    def __init__(self, doc):
        self.doc = doc
        self.p = doc.new_page(width=ANCHO, height=ALTO)
        self.y = M

    def espacio(self, alto):
        """Si lo que sigue no entra, se abre otra página. Un renglón cortado al pie es un renglón
        que el cliente no lee."""
        if self.y + alto > ALTO - M:
            self.p = self.doc.new_page(width=ANCHO, height=ALTO)
            self.y = M

    def texto(self, x, s, tam=9, color=TINTA, negrita=False, ancho=None, derecha=False):
        f = "hebo" if negrita else "helv"
        if derecha and ancho:
            w = fitz.get_text_length(s, fontname=f, fontsize=tam)
            x = x + ancho - w
        self.p.insert_text((x, self.y), s, fontname=f, fontsize=tam, color=color)

    def regla(self, color=LINEA, grosor=0.5):
        self.p.draw_line(fitz.Point(M, self.y), fitz.Point(ANCHO - M, self.y), color=color, width=grosor)


def dibujar(d, salida):
    doc = fitz.open()
    h = Hoja(doc)

    # ── CABECERA ──
    h.p.draw_rect(fitz.Rect(M, M - 6, M + 3, M + 26), color=ACENTO, fill=ACENTO)
    h.y = M + 6
    h.texto(M + 12, "ECHEGARAY CONSTRUCCIONES S.A.S.", 11, TINTA, True)
    h.y += 13
    h.texto(M + 12, "CUIT 30-71630464-3", 8, APAGADO)
    h.y = M + 6
    h.texto(M, f"RECIBO N° {d['numero']}", 11, TINTA, True, ancho=ANCHO - 2 * M, derecha=True)
    h.y += 13
    h.texto(M, fecha_ar(d["fecha"]), 8, APAGADO, ancho=ANCHO - 2 * M, derecha=True)

    h.y += 26
    h.regla()
    h.y += 18
    h.texto(M, d["cliente"], 13, TINTA, True)
    h.y += 14
    if d.get("cuit_cliente"):
        h.texto(M, f"CUIT {d['cuit_cliente']}", 8, APAGADO)
    h.y += 22

    # ── EL PAGO QUE ORIGINA ESTE RECIBO ──
    if d.get("pago"):
        p = d["pago"]
        alto = 34 + 13 * len(p["aplica"])
        h.p.draw_rect(fitz.Rect(M, h.y - 10, ANCHO - M, h.y + alto), color=LINEA, fill=(0.98, 0.98, 0.97), width=0.5)
        h.p.draw_rect(fitz.Rect(M, h.y - 10, M + 2.5, h.y + alto), color=ACENTO, fill=ACENTO)
        h.y += 6
        h.texto(M + 14, f"RECIBIMOS {p['forma'].upper()}", 8, APAGADO, True)
        h.texto(M, pesos(p["monto"]), 15, TINTA, True, ancho=ANCHO - 2 * M - 14, derecha=True)
        h.y += 18
        h.texto(M + 14, "Imputado a:", 8, APAGADO)
        h.y += 13
        for a in p["aplica"]:
            h.texto(M + 24, a["concepto"], 8.5, TINTA)
            h.texto(M, pesos(a["monto"]), 8.5, TINTA, ancho=ANCHO - 2 * M - 14, derecha=True)
            h.y += 13
        h.y += 14

    # ── LAS SECCIONES ──
    for sec in d["secciones"]:
        h.espacio(46 + 13 * len(sec["filas"]))
        h.y += 8
        h.texto(M, sec["titulo"].upper(), 8.5, TINTA, True)
        h.texto(M, pesos(sec["total"]), 9, TINTA, True, ancho=ANCHO - 2 * M, derecha=True)
        h.y += 6
        h.regla()
        h.y += 14
        for f in sec["filas"]:
            nuevo = f.get("nuevo")
            color = VERDE if nuevo else TINTA
            if nuevo:
                h.p.draw_rect(fitz.Rect(M - 6, h.y - 8, M - 3.5, h.y + 3), color=ACENTO, fill=ACENTO)
            h.texto(M, fecha_ar(f.get("fecha")) or "—", 8, APAGADO)
            # El concepto se recorta con puntos suspensivos, no a cuchillo: «2ª de 2 cuotas · can»
            # deja al lector adivinando si dice «cancela» o «cancelado».
            # El puntito suspensivo se escribe con tres puntos: la Helvetica base-14 de PDF no trae
            # el carácter «…» y lo dibuja como un punto medio, que se confunde con el separador que
            # usan los propios conceptos («2ª de 2 cuotas · cancela»).
            c = f["concepto"]
            TOPE = 246
            if fitz.get_text_length(c, fontname="helv", fontsize=8.5) > TOPE:
                while fitz.get_text_length(c + "...", fontname="helv", fontsize=8.5) > TOPE and len(c) > 4:
                    c = c[:-1]
                c = c.rstrip(" ·") + "..."
            h.texto(M + 58, c, 8.5, color, bool(nuevo))
            h.texto(M + 330, f.get("forma", ""), 8, APAGADO)
            h.texto(M, pesos(f["monto"]), 8.5, color, bool(nuevo), ancho=ANCHO - 2 * M, derecha=True)
            h.y += 13
        h.y += 6

    # ── EL CIERRE ──
    h.espacio(70)
    h.y += 10
    h.regla(TINTA, 1)
    h.y += 18
    h.texto(M, "SALDO PENDIENTE", 9, TINTA, True)
    h.texto(M, pesos(d["saldo"]), 13, TINTA, True, ancho=ANCHO - 2 * M, derecha=True)
    h.y += 22
    h.texto(M, d["pie"], 7, APAGADO)

    doc.save(salida)
    doc.close()
    return {"ok": True, "ruta": salida, "paginas": 1}


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        datos = json.load(f)
    print(json.dumps(dibujar(datos, sys.argv[2])))
