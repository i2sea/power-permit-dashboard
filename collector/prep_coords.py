import re
# ---------- coordinates ----------
DMS = re.compile(r"(\d{2,3})\s*°\s*(\d{1,2})\s*['‘’′]\s*(\d{1,2}(?:\s*\.\s*\d+)?|\d\s+\d(?:\.\d+)?)\s*[\"“”″˝]?\s*([NSEW])?")
def parse_dms(s):
    t = re.sub(r'\s+', '', s)
    t = t.replace("''", 'S').replace('``', 'S')
    t = re.sub('[°˚º]', 'D', t)
    t = re.sub("['‘’′`´]", 'M', t)
    t = re.sub('["“”″˝]', 'S', t)
    vals = []
    for m in re.finditer(r"(3[2-9]|12[3-9]|13[0-2])D(\d{1,2})M(\d{1,2}(?:\.\d+)?)", t):
        v = int(m.group(1)) + int(m.group(2)) / 60 + float(m.group(3)) / 3600
        vals.append(v)
    if not vals:
        for m in re.finditer(r"(?<!\d)(3[2-9]|12[3-9]|13[0-2])-(\d{1,2})-(\d{1,2}(?:\.\d+)?)", s):
            vals.append(int(m.group(1)) + int(m.group(2)) / 60 + float(m.group(3)) / 3600)
    pts = []
    i = 0
    while i + 1 < len(vals):
        a, b = vals[i], vals[i + 1]
        if 32 < a < 40 and 123 < b < 133:
            pts.append((round(b, 5), round(a, 5)))  # lon, lat
            i += 2
        else:
            i += 1
    return pts

def parse_decimal(s):
    pts = []
    for m in re.finditer(r"(3[2-9]\.\d{3,})\s*[,/ ]?\s*[EＥ]?\s*(12[3-9]\.\d{3,}|13[0-2]\.\d{3,})", s):
        pts.append((round(float(m.group(2)), 5), round(float(m.group(1)), 5)))
    return pts

def coords(p):
    s = p.get('location_coords') or ''
    # the reference site's PDF extraction sometimes appends other projects' coordinates after the first ')'
    first = s[:s.index(')', 1) + 1] if ')' in s[1:] else s
    pts = parse_dms(first) or parse_decimal(first) or parse_dms(s) or parse_decimal(s)
    # keep points close to the first point (drop bleed from neighbouring rows)
    if pts:
        x0, y0 = pts[0]
        pts = [q for q in pts if abs(q[0] - x0) < 0.35 and abs(q[1] - y0) < 0.35]
    return pts

