#!/usr/bin/env python3
"""EXTRAE EL FORMATO DE UNA PESTAÑA DESDE UN .xlsx EXPORTADO DE UNA REVISIÓN DE DRIVE.

POR QUÉ EXISTE (01/08). El dueño: "el formato es algo que me debés respetar como regla de oro" y
"te dije que revisaras el historial". La firma de formato del OS detecta que un formato es suyo y lo
protege, pero guarda un HASH: no sirve para VOLVER a él una vez que un generador ya lo pisó. Drive
sí guarda el archivo entero, y exportado a .xlsx trae el formato completo.

Sale a JSON: por cada fila, el rótulo de la columna A —que es con lo que se va a emparejar contra la
pestaña viva, porque las filas se movieron— y el formato de cada celda. Emparejar por POSICIÓN sería
repetir el defecto que este repo ya pagó cuatro veces.

  python3 extraer-formato-xlsx.py <archivo.xlsx> <NombreDePestaña> > formato.json
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

# Los formatos de número que Excel numera de fábrica. Sólo los que aparecen en una planilla financiera.
BUILTIN = {0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%',
           14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 22: 'dd/mm/yyyy hh:mm',
           37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)',
           40: '#,##0.00;[Red](#,##0.00)', 44: '_("$"* #,##0.00_)', 49: '@'}


def col_de(ref):
    """'AF15' -> 31 (0-based)."""
    letras = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for c in letras:
        n = n * 26 + (ord(c) - 64)
    return n - 1


def fila_de(ref):
    return int(re.search(r'\d+', ref).group(0))


def color(el):
    """El color de un <color rgb="FFRRGGBB"/> como {red,green,blue} 0..1. None si es indexado/tema."""
    if el is None:
        return None
    rgb = el.get('rgb')
    if not rgb or len(rgb) < 6:
        return None
    rgb = rgb[-6:]
    return {'red': int(rgb[0:2], 16) / 255, 'green': int(rgb[2:4], 16) / 255, 'blue': int(rgb[4:6], 16) / 255}


def main():
    ruta, pestana = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(ruta)

    # ── qué archivo es la pestaña ──
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    destino = {r.get('Id'): r.get('Target') for r in rels}
    hoja = None
    for s in wb.find('m:sheets', NS):
        if s.get('name') == pestana:
            hoja = destino[s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
    if not hoja:
        print(json.dumps({'error': f'no encontré la pestaña "{pestana}"'}))
        return
    if not hoja.startswith('xl/'):
        hoja = 'xl/' + hoja.lstrip('/')

    # ── los estilos ──
    st = ET.fromstring(z.read('xl/styles.xml'))
    numfmt = dict(BUILTIN)
    nf = st.find('m:numFmts', NS)
    if nf is not None:
        for f in nf:
            numfmt[int(f.get('numFmtId'))] = f.get('formatCode')
    fonts = st.find('m:fonts', NS)
    fills = st.find('m:fills', NS)
    xfs = st.find('m:cellXfs', NS)

    def formato(idx):
        """El userEnteredFormat de Sheets equivalente al estilo `idx` del xlsx."""
        if xfs is None or idx is None or idx >= len(xfs):
            return None
        xf = xfs[idx]
        out = {}
        # número
        nid = int(xf.get('numFmtId', 0))
        code = numfmt.get(nid)
        if code and code != 'General':
            tipo = 'DATE' if re.search(r'[dmyDMY]', code) and '#' not in code and '0' not in code.replace('0', '', 0) and re.search(r'(dd|mm|yy)', code) else None
            if tipo is None:
                tipo = 'TEXT' if code == '@' else ('PERCENT' if '%' in code else ('CURRENCY' if '$' in code else 'NUMBER'))
            out['numberFormat'] = {'type': tipo, 'pattern': code}
        # fuente
        if xf.get('applyFont') == '1' or xf.get('fontId'):
            f = fonts[int(xf.get('fontId', 0))]
            tf = {}
            if f.find('m:b', NS) is not None:
                tf['bold'] = True
            if f.find('m:i', NS) is not None:
                tf['italic'] = True
            sz = f.find('m:sz', NS)
            if sz is not None:
                tf['fontSize'] = int(float(sz.get('val')))
            c = color(f.find('m:color', NS))
            if c:
                tf['foregroundColor'] = c
            if tf:
                out['textFormat'] = tf
        # relleno
        fid = int(xf.get('fillId', 0))
        if fid and fid < len(fills):
            pf = fills[fid].find('m:patternFill', NS)
            if pf is not None and pf.get('patternType') not in (None, 'none'):
                c = color(pf.find('m:fgColor', NS))
                if c:
                    out['backgroundColor'] = c
        # alineación
        al = xf.find('m:alignment', NS)
        if al is not None:
            if al.get('horizontal'):
                h = {'left': 'LEFT', 'center': 'CENTER', 'centerContinuous': 'CENTER',
                     'right': 'RIGHT', 'general': None, 'justify': 'LEFT', 'fill': 'LEFT',
                     'distributed': 'CENTER'}.get(al.get('horizontal'), None)
                if h:
                    out['horizontalAlignment'] = h
            if al.get('vertical'):
                # xlsx dice center/top/bottom; Sheets quiere TOP/MIDDLE/BOTTOM. "CENTER" es un 400.
                v = {'center': 'MIDDLE', 'top': 'TOP', 'bottom': 'BOTTOM'}.get(al.get('vertical'))
                if v:
                    out['verticalAlignment'] = v
            if al.get('wrapText') == '1':
                out['wrapStrategy'] = 'WRAP'
        return out or None

    # ── la pestaña ──
    sh = ET.fromstring(z.read(hoja))
    anchos = []
    cols = sh.find('m:cols', NS)
    if cols is not None:
        for c in cols:
            for i in range(int(c.get('min')) - 1, int(c.get('max'))):
                # el ancho del xlsx está en "caracteres"; ~7px por carácter más 5 de padding
                anchos.append({'col': i, 'px': int(round(float(c.get('width', 10)) * 7 + 5))})
    congeladas = 0
    pane = sh.find('.//m:sheetView/m:pane', NS)
    if pane is not None and pane.get('ySplit'):
        congeladas = int(float(pane.get('ySplit')))

    # los textos, para poder emparejar por contenido
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in ss]

    filas = []
    for row in sh.find('m:sheetData', NS):
        n = int(row.get('r'))
        celdas = []
        rotulo = ''
        for c in row:
            ref = c.get('r')
            if not ref:
                continue
            col = col_de(ref)
            if col == 0:
                v = c.find('m:v', NS)
                if v is not None and v.text is not None:
                    rotulo = shared[int(v.text)] if c.get('t') == 's' and int(v.text) < len(shared) else str(v.text)
            f = formato(int(c.get('s')) if c.get('s') else None)
            if f:
                celdas.append({'col': col, 'fmt': f})
        if celdas:
            filas.append({'fila': n, 'rotulo': rotulo.strip(), 'celdas': celdas})

    json.dump({'pestana': pestana, 'filas': filas, 'anchos': anchos, 'congeladas': congeladas},
              sys.stdout, ensure_ascii=False)


main()
