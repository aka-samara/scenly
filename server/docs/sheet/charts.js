// Charts. ExcelJS cannot write charts, so the finished .xlsx is opened once more and real,
// editable Excel charts are added to it. The same chart data also feeds the preview.
import JSZip from 'jszip';
import { parseRange, parseCell, cellName, colName, quoteSheet } from './a1.js';
import { rangeValues } from './calc.js';
import { esc } from '../util.js';

export const PALETTE = ['#2E75B6', '#ED7D31', '#70AD47', '#FFC000', '#7F6BB3', '#17A2B8', '#C0504D', '#8C8C8C', '#264478', '#9E480E', '#43682B', '#997300'];
const sheetOf = (spec, home, ref, fallback) => {
  const m = String(ref).match(/^(.*)!/);
  const name = m ? m[1].replace(/^'|'$/g, '').replace(/''/g, "'") : fallback || home.name;
  return spec.sheets.find((x) => x.name.toLowerCase() === name.toLowerCase()) || home;
};
const absRef = (sheet, p) => `${quoteSheet(sheet.name)}!$${colName(p.c1)}$${p.r1}:$${colName(p.c2)}$${p.r2}`;
// Whole-column and oversized ranges are cut down to the cells that hold data.
function trim(p, calc, sheet) {
  const sh = calc.sheets.find((x) => x.name === sheet.name);
  const out = { ...p };
  if (sh) { out.r2 = Math.min(p.r2, Math.max(sh.ex.maxR, p.r1)); out.c2 = Math.min(p.c2, Math.max(sh.ex.maxC, p.c1)); }
  if (p.wholeCols && sh?.ex.layout.hasTable) { out.r1 = sh.ex.layout.first; out.r2 = Math.max(sh.ex.layout.last, out.r1); }
  return out;
}

// Everything a chart needs, with the numbers already worked out.
export function chartData(spec, home, ch, calc, T) {
  const colours = [T?.accent, ...PALETTE].filter((c, i, a) => c && a.indexOf(c) === i);
  const cat = ch.categories ? (() => { const sheet = sheetOf(spec, home, ch.categories, ch.sheet); const p = trim(parseRange(ch.categories), calc, sheet); return { sheet, p, f: absRef(sheet, p), values: rangeValues(calc, sheet.name, cellName(p.c1, p.r1) + ':' + cellName(p.c2, p.r2)) }; })() : null;
  const series = ch.series.map((s, i) => {
    const sheet = sheetOf(spec, home, s.values, ch.sheet);
    const p = trim(parseRange(s.values), calc, sheet);
    const values = rangeValues(calc, sheet.name, cellName(p.c1, p.r1) + ':' + cellName(p.c2, p.r2)).map((v) => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(v))).map((v) => (Number.isFinite(v) ? v : null));
    let name = s.name;
    if (name == null) { // the header cell above (or left of) the data
      const sh = calc.sheets.find((x) => x.name === sheet.name);
      const up = p.c1 === p.c2 ? sh?.ex.cells.get(p.r1 - 1 + ',' + p.c1) : sh?.ex.cells.get(p.r1 + ',' + (p.c1 - 1));
      name = up && typeof up.v === 'string' ? up.v : `Series ${i + 1}`;
    }
    return { name: String(name), f: absRef(sheet, p), values, color: s.color || colours[i % colours.length] };
  });
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const categories = cat ? cat.values.slice(0, n).map((v) => (v == null ? '' : String(v))) : Array.from({ length: n }, (_x, i) => String(i + 1));
  return { type: ch.type, title: ch.title || '', categories, catRef: cat?.f || null, catNumeric: !!cat && cat.values.every((v) => v == null || typeof v === 'number'), catRaw: cat?.values || null, series, xTitle: ch.xTitle, yTitle: ch.yTitle, legend: ch.legend !== false && (series.length > 1 || ['pie', 'doughnut'].includes(ch.type)), anchor: ch.anchor, width: ch.width, height: ch.height, pieColors: colours };
}

const rgb = (hex) => String(hex).replace('#', '').toUpperCase();
const strCache = (vals) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v ?? '')}</c:v></c:pt>`).join('')}</c:strCache>`;
const numCache = (vals) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v == null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache>`;
const text = (t, size = 1000, bold = false) => `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size}" b="${bold ? 1 : 0}"/></a:pPr><a:r><a:rPr lang="en-GB" sz="${size}" b="${bold ? 1 : 0}"/><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>`;
const fill = (c) => `<a:solidFill><a:srgbClr val="${rgb(c)}"/></a:solidFill>`;

function chartXml(d) {
  const kind = d.type;
  const isPie = kind === 'pie' || kind === 'doughnut';
  const scatter = kind === 'scatter';
  const cat = (tag) => (d.catRef
    ? `<c:${tag}>${d.catNumeric && scatter ? `<c:numRef><c:f>${esc(d.catRef)}</c:f>${numCache(d.catRaw)}</c:numRef>` : `<c:strRef><c:f>${esc(d.catRef)}</c:f>${strCache(d.categories)}</c:strRef>`}</c:${tag}>` : '');
  const ser = d.series.map((s, i) => {
    const line = kind === 'line' || scatter;
    const sp = isPie ? '' : line ? `<c:spPr><a:ln w="28575" cap="rnd">${fill(s.color)}<a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr>${fill(s.color)}<a:ln w="9525">${fill(s.color)}</a:ln></c:spPr></c:marker>` : `<c:spPr>${fill(s.color)}</c:spPr>`;
    const pts = isPie ? s.values.map((_v, j) => `<c:dPt><c:idx val="${j}"/><c:bubble3D val="0"/><c:spPr>${fill(d.pieColors[j % d.pieColors.length])}<a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('') : '';
    const vals = `<c:numRef><c:f>${esc(s.f)}</c:f>${numCache(s.values)}</c:numRef>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(s.name)}</c:v></c:tx>${sp}${pts}${!isPie && !line && kind !== 'area' ? '<c:invertIfNegative val="0"/>' : ''}${scatter ? cat('xVal') + `<c:yVal>${vals}</c:yVal><c:smooth val="0"/>` : cat('cat') + `<c:val>${vals}</c:val>`}${kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  }).join('');
  const stacked = kind === 'stackedColumn' || kind === 'stackedBar';
  const ax = '<c:axId val="111111111"/><c:axId val="222222222"/>';
  let plot;
  if (kind === 'pie') plot = `<c:pieChart><c:varyColors val="1"/>${ser}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls><c:firstSliceAng val="0"/></c:pieChart>`;
  else if (kind === 'doughnut') plot = `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls><c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  else if (kind === 'line') plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/>${ax}</c:lineChart>`;
  else if (kind === 'area') plot = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}${ax}</c:areaChart>`;
  else if (scatter) plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${ser}${ax}</c:scatterChart>`;
  else plot = `<c:barChart><c:barDir val="${kind === 'bar' || kind === 'stackedBar' ? 'bar' : 'col'}"/><c:grouping val="${stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${ser}<c:gapWidth val="${stacked ? 60 : 80}"/>${stacked ? '<c:overlap val="100"/>' : ''}${ax}</c:barChart>`;
  const horizontal = kind === 'bar' || kind === 'stackedBar';
  const grid = '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E1E4EA"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  const axTitle = (t) => (t ? `<c:title>${text(t, 900)}</c:title>` : '');
  const axLine = '<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="BFC4CC"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-GB"/></a:p></c:txPr>';
  const axes = isPie ? '' : scatter
    ? `<c:valAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${axTitle(d.xTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}<c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>${grid}${axTitle(d.yTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}<c:crossAx val="111111111"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
    : `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/>${axTitle(d.xTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axLine}<c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 't' : 'l'}"/>${grid}${axTitle(d.yTitle)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}<c:crossAx val="111111111"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="${kind === 'area' ? 'midCat' : 'between'}"/></c:valAx>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>${d.title ? `<c:title>${text(d.title, 1300, true)}</c:title>` : ''}<c:autoTitleDeleted val="${d.title ? 0 : 1}"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${d.legend ? `<c:legend><c:legendPos val="${isPie ? 'r' : 'b'}"/><c:overlay val="0"/></c:legend>` : ''}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="D0D4DB"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

// Where charts without an anchor go: to the right of the data, one under the other.
export function placeCharts(charts, ex) {
  let row = 2;
  return charts.map((ch) => {
    const a = ch.anchor && parseCell(ch.anchor);
    if (a) return { col: a.col, row: a.row };
    const at = { col: ex.maxC + 2, row };
    row += Math.ceil((ch.height || 300) / 20) + 2;
    return at;
  });
}

// jobs: [{ sheetIndex, sheet, chart, ex }]
export async function addCharts(buf, spec, jobs, T, calc) {
  const zip = await JSZip.loadAsync(buf);
  let types = await zip.file('[Content_Types].xml').async('string');
  const bySheet = new Map();
  for (const j of jobs) (bySheet.get(j.sheetIndex) || bySheet.set(j.sheetIndex, []).get(j.sheetIndex)).push(j);
  let chartNo = 0, drawNo = 0;
  for (const [si, list] of bySheet) {
    const sheetPath = `xl/worksheets/sheet${si + 1}.xml`;
    const relPath = `xl/worksheets/_rels/sheet${si + 1}.xml.rels`;
    if (!zip.file(sheetPath)) continue;
    drawNo++;
    const places = placeCharts(list.map((j) => j.chart), list[0].ex);
    const anchors = [], rels = [];
    list.forEach((j, i) => {
      chartNo++;
      zip.file(`xl/charts/chart${chartNo}.xml`, chartXml(chartData(spec, j.sheet, j.chart, calc, T)));
      types = types.replace('</Types>', `<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      rels.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`);
      const at = places[i];
      anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${at.col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${at.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round((j.chart.width || 520) * 9525)}" cy="${Math.round((j.chart.height || 300) * 9525)}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${chartNo + 1}" name="Chart ${chartNo}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`);
    });
    zip.file(`xl/drawings/drawing${drawNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}</xdr:wsDr>`);
    zip.file(`xl/drawings/_rels/drawing${drawNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    types = types.replace('</Types>', `<Override PartName="/xl/drawings/drawing${drawNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    // Link the drawing from the sheet.
    let relXml = zip.file(relPath) ? await zip.file(relPath).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const rid = 'rIdChart' + drawNo;
    relXml = relXml.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawNo}.xml"/></Relationships>`);
    zip.file(relPath, relXml);
    let xml = await zip.file(sheetPath).async('string');
    if (!/xmlns:r=/.test(xml.slice(0, 600))) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    const tag = `<drawing r:id="${rid}"/>`;
    const before = xml.search(/<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/);
    xml = before >= 0 ? xml.slice(0, before) + tag + xml.slice(before) : xml.replace('</worksheet>', tag + '</worksheet>');
    zip.file(sheetPath, xml);
  }
  zip.file('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
