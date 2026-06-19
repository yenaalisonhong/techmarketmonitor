'use strict';

const {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  Footer,
  PageNumber,
  LevelFormat,
  PageBreak,
  Packer,
} = require('docx');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════
const C = {
  PRIMARY : '1F4E79',
  ACCENT  : '2E75B6',
  TH_BG   : '1F4E79',
  LIGHT   : 'D6E4F0',
  GRAY    : 'F2F2F2',
  PH      : '595959',
  WHITE   : 'FFFFFF',
  BLACK   : '000000',
};

// A4 dimensions in DXA (twentieths of a point). 1 inch = 1440 DXA.
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN  = 1440;
const CW      = PAGE_W - 2 * MARGIN;  // 9026 DXA usable content width

const EN = 'Arial';
const KO = 'Malgun Gothic';

// ═══════════════════════════════════════════════════════════
// BULLET NUMBERING CONFIG
// ═══════════════════════════════════════════════════════════
const BREF = 'doc-bullets';
const NUM_CFG = [{
  reference: BREF,
  levels: [{
    level: 0,
    format: LevelFormat.BULLET,
    text: '\u2022',
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: { indent: { left: 720, hanging: 360 } },
    },
  }],
}];

// ═══════════════════════════════════════════════════════════
// DOCUMENT STYLES
// ═══════════════════════════════════════════════════════════
const DOC_STYLES = {
  paragraphStyles: [
    {
      id: 'Heading1',
      name: 'heading 1',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { font: EN, size: 28, bold: true, color: C.PRIMARY },
      paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 },
    },
    {
      id: 'Heading2',
      name: 'heading 2',
      basedOn: 'Normal',
      next: 'Normal',
      quickFormat: true,
      run: { font: EN, size: 24, bold: true, color: C.ACCENT },
      paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 },
    },
  ],
};

// ═══════════════════════════════════════════════════════════
// FOOTER — "Fraunhofer | Korea Office | Page X of Y"
// ═══════════════════════════════════════════════════════════
function mkFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'Fraunhofer | Korea Office | Page ', size: 16, color: C.PH }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.PH }),
        new TextRun({ text: ' of ', size: 16, color: C.PH }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C.PH }),
      ],
    })],
  });
}

// ═══════════════════════════════════════════════════════════
// PRIMITIVE ELEMENT BUILDERS
// ═══════════════════════════════════════════════════════════
function R(text, { font = EN, pt = 10, bold = false, italic = false, color = C.BLACK } = {}) {
  return new TextRun({ text, font, size: pt * 2, bold, italics: italic, color });
}

function H1(text, font = EN) {
  return new Paragraph({
    style: 'Heading1',
    spacing: { before: 400, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.ACCENT, space: 4 } },
    children: [R(text, { font, pt: 14, bold: true, color: C.PRIMARY })],
  });
}

function H2(text, font = EN) {
  return new Paragraph({
    style: 'Heading2',
    spacing: { before: 280, after: 100 },
    children: [R(text, { font, pt: 12, bold: true, color: C.ACCENT })],
  });
}

function BODY(text, font = EN) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [R(text, { font })],
  });
}

function PH(text, font = EN) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [R(text, { font, italic: true, color: C.PH })],
  });
}

function BUL(text, font = EN, isPh = false) {
  return new Paragraph({
    numbering: { reference: BREF, level: 0 },
    spacing: { before: 50, after: 50 },
    children: [R(text, { font, italic: isPh, color: isPh ? C.PH : C.BLACK })],
  });
}

function BR() {
  return new Paragraph({ children: [new PageBreak()] });
}

function SP(pts = 120) {
  return new Paragraph({
    spacing: { before: pts, after: 0 },
    children: [new TextRun({ text: '' })],
  });
}

// ═══════════════════════════════════════════════════════════
// TABLE CELL BUILDERS
// ═══════════════════════════════════════════════════════════
function TH(text, w, font = EN) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.TH_BG },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [R(text, { font, pt: 9, bold: true, color: C.WHITE })],
    })],
  });
}

function TD(text, w, font = EN, { fill = C.WHITE, italic = false, color = C.BLACK, align = AlignmentType.LEFT } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: align,
      children: [R(text, { font, pt: 9, italic, color })],
    })],
  });
}

function PC(text, w, font = EN, fill = C.WHITE) {
  return TD(text, w, font, { fill, italic: true, color: C.PH });
}

// Mark a cell value as a placeholder: p('[text]')
function p(text) { return { __ph: true, t: text }; }

function mkTable(headers, rows, widths, font = EN) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => TH(h, widths[i], font)),
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => {
          const fill = ri % 2 === 0 ? C.WHITE : C.GRAY;
          if (cell && typeof cell === 'object' && cell.__ph) {
            return PC(cell.t, widths[ci], font, fill);
          }
          return TD(String(cell ?? ''), widths[ci], font, { fill });
        }),
      })),
    ],
  });
}

// ═══════════════════════════════════════════════════════════
// COVER FIELD — bold blue label + italic gray value
// ═══════════════════════════════════════════════════════════
function coverField(label, value, font = EN) {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    children: [
      R(label + ':   ', { font, pt: 11, bold: true, color: C.ACCENT }),
      R(value, { font, pt: 11, italic: true, color: C.PH }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════
// SWOT 2×2 TABLE HELPERS
// ═══════════════════════════════════════════════════════════
function swotHdr(text, w, font = EN) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.ACCENT },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [R(text, { font, pt: 11, bold: true, color: C.WHITE })],
    })],
  });
}

function swotBody(items, w, font = EN) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: C.WHITE },
    margins: { top: 120, bottom: 120, left: 140, right: 100 },
    children: items.map(txt => new Paragraph({
      numbering: { reference: BREF, level: 0 },
      spacing: { before: 50, after: 50 },
      children: [R(txt, { font, pt: 9, italic: true, color: C.PH })],
    })),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ██████████   ENGLISH PART   ██████████
// ═══════════════════════════════════════════════════════════════════════════

function coverEN() {
  return [
    SP(2400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 280 },
      children: [R('Technology Market Research Report', { font: EN, pt: 26, bold: true, color: C.PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      children: [R('Fraunhofer Institute | Korea Office', { font: EN, pt: 14, color: C.ACCENT })],
    }),
    SP(360),
    coverField('Technology Name',  '[Enter technology name]',           EN),
    coverField('Report Period',     '[e.g., Q2 2026 – Q1 2027]',        EN),
    coverField('Prepared by',       '[Analyst / Author Name]',           EN),
    coverField('Department',        '[Department / Team Name]',          EN),
    coverField('Version',           '[e.g., v1.0 – Draft]',              EN),
    coverField('Classification',    'Internal / Confidential',           EN),
    BR(),
  ];
}

// ─── SECTION 1 ─────────────────────────────────────────────
function sec1EN() {
  // Column widths (all must sum to CW = 9026)
  const mw = [2500, 1600, 1500, 1700, 1726]; // 9026
  return [
    H1('SECTION 1 — EXECUTIVE BRIEF', EN),
    H2('1.1 Technology Snapshot', EN),
    PH('[Provide a 3-sentence plain-language description of what the technology is, how it works at a high level, and why it matters right now. Lead with the "so what" before the technical detail. Source context: Gartner, IDC, Fraunhofer-Publica.]', EN),
    H2('1.2 Key Findings', EN),
    BUL('[Market signal: e.g., Global market grew X% YoY, driven by … (Source: IDC / Gartner)]', EN, true),
    BUL('[Competitive signal: e.g., Top 3 vendors hold X% of revenue; consolidation expected … (Source: IDC MarketScape)]', EN, true),
    BUL('[Korea-specific signal: e.g., Korean government allocated ₩[X]B under IITP programme … (Source: IITP / KOTRA)]', EN, true),
    BUL('[Risk signal: e.g., EU regulatory uncertainty may delay deployment by [X] quarters … (Source: Gartner / EC)]', EN, true),
    H2('1.3 Metrics Dashboard', EN),
    mkTable(
      ['Metric', 'Current Value', 'YoY Change', 'Forecast (3yr)', 'Source'],
      [
        ['Global Market Size',            p('$[X]B'),     p('[+X%]'), p('$[X]B'),   'Gartner / IDC'],
        ['Korea Market Size',             p('$[X]B'),     p('[+X%]'), p('$[X]B'),   'KIET / KOTRA'],
        ['TRL Level',                     p('TRL [X]'),   '—',        p('TRL [X]'), 'Fraunhofer'],
        ['Top Filing Country (Patents)',  p('[Country]'),  '—',        '—',          'KIPO / Espacenet'],
        ['Leading Vendor Market Share',   p('[X]%'),       '—',        '—',          'IDC MarketScape'],
      ],
      mw, EN),
    SP(),
  ];
}

// ─── SECTION 2 ─────────────────────────────────────────────
function sec2EN() {
  const w3  = [3000, 3500, 2526];             // 9026
  const w4  = [2300, 2242, 2242, 2242];       // 9026
  const w6p = [1200, 2600, 1800, 900, 700, 1826]; // 9026
  return [
    H1('SECTION 2 — TECHNOLOGY PROFILE', EN),
    H2('2.1 Technology Definition & Principles', EN),
    PH('[Describe the technology: core function, underlying principles, key variants or sub-technologies. Cite primary sources: IEEE Xplore, Fraunhofer-Publica, ETRI, arXiv.]', EN),
    H2('2.2 Technology Readiness Level (TRL)', EN),
    mkTable(
      ['Dimension', 'Assessment', 'Basis'],
      [
        ['Current TRL',                     p('[1–9]'),       p('[Standard / Fraunhofer internal assessment]')],
        ['Target TRL',                      p('[1–9]'),       p('[Product / project roadmap]')],
        ['Estimated time to TRL 9',         p('[X] years'),   p('[Expert assessment / foresight study]')],
        ['Comparable technology benchmark', p('[Tech name]'), p('[Source / benchmark report]')],
      ],
      w3, EN),
    SP(),
    H2('2.3 Technology Differentiation', EN),
    PH('[Explain what makes this technology distinct versus alternatives: performance envelope, cost structure, IP position, maturity level, and Korea adoption trajectory.]', EN),
    mkTable(
      ['Feature', 'This Technology', 'Alternative A', 'Alternative B'],
      [
        ['Performance',    p('[Assessment]'), p('[Assessment]'), p('[Assessment]')],
        ['Cost',           p('[Assessment]'), p('[Assessment]'), p('[Assessment]')],
        ['Maturity',       p('[Assessment]'), p('[Assessment]'), p('[Assessment]')],
        ['IP Position',    p('[Assessment]'), p('[Assessment]'), p('[Assessment]')],
        ['Korea Adoption', p('[Assessment]'), p('[Assessment]'), p('[Assessment]')],
      ],
      w4, EN),
    SP(),
    H2('2.4 Patent Landscape', EN),
    BODY('Sources: Espacenet (EPO), KIPO, DPMA, JPO, CNIPA, Google Patents', EN),
    mkTable(
      ['Patent No.', 'Title', 'Assignee', 'Country', 'Year', 'Source'],
      [
        [p('[EP-XXXXXXX]'), p('[Patent title placeholder]'), p('[Assignee name]'), p('[Country]'), p('[Year]'), 'Espacenet'],
        [p('[KR-XXXXXXX]'), p('[Patent title placeholder]'), p('[Assignee name]'), p('[Country]'), p('[Year]'), 'KIPO'],
      ],
      w6p, EN),
    SP(),
  ];
}

// ─── SECTION 3 ─────────────────────────────────────────────
function sec3EN() {
  const w6s = [1500, 1700, 1100, 900, 1200, 2626]; // 9026
  const w6r = [900, 1200, 1800, 1800, 1700, 1626];  // 9026
  const w2  = [4513, 4513];                          // 9026
  return [
    H1('SECTION 3 — MARKET ANALYSIS', EN),
    H2('3.1 Market Overview', EN),
    PH('[Global market size ($XB), CAGR, historical trajectory (last 5 years), and forecast horizon (5–10 years). Sources: Gartner, IDC, Statista, McKinsey Global Institute, KIET, KOTRA, ADB.]', EN),
    H2('3.2 Market Segmentation', EN),
    mkTable(
      ['Segment Type', 'Segment Name', 'Size', 'Share', 'Growth', 'Notes'],
      [
        ['By Application', p('[App 1] / [App 2]'),   p('$[X]B'), p('[X]%'), p('[X]% CAGR'), p('[Note on growth driver]')],
        ['By End-User',    p('[Industry sector]'),    p('$[X]B'), p('[X]%'), p('[X]% CAGR'), p('[Note on demand pattern]')],
        ['By Deployment',  p('[Deployment model]'),   p('$[X]B'), p('[X]%'), p('[X]% CAGR'), p('[Note on model shift]')],
        ['By Geography',   'Korea / APAC / EU / US',  p('$[X]B'), p('[X]%'), p('[X]% CAGR'), p('[Note on regional variance]')],
      ],
      w6s, EN),
    SP(),
    H2('3.3 Regional Deep-Dive', EN),
    mkTable(
      ['Region', 'Market Size', 'Key Drivers', 'Policy Environment', 'Top Players', 'Source'],
      [
        ['Korea',   p('$[X]B'), p('[Driver]'), 'MOTIE, MSIT, IITP',     p('[Company / Institute]'), 'KIET / KOTRA'],
        ['Japan',   p('$[X]B'), p('[Driver]'), 'METI, NEDO',              p('[Company]'),              'METI'],
        ['China',   p('$[X]B'), p('[Driver]'), 'MIIT, CAICT',              p('[Company]'),              'CAICT'],
        ['EU',      p('$[X]B'), p('[Driver]'), 'EU Commission, BMBF',     p('[Company]'),              'Eurostat'],
        ['US',      p('$[X]B'), p('[Driver]'), 'NIST, DOE',                p('[Company]'),              'IDC'],
        ['SE Asia', p('$[X]B'), p('[Driver]'), 'EDB Singapore, IMDA',     p('[Company]'),              'ADB'],
        ['India',   p('$[X]B'), p('[Driver]'), 'NITI Aayog, DST',          p('[Company]'),              'ADB'],
      ],
      w6r, EN),
    SP(),
    H2('3.4 Market Drivers & Barriers', EN),
    mkTable(
      ['Drivers (with Source)', 'Barriers (with Source)'],
      [
        [p('[Driver 1: description — Source: Gartner / IDC]'),    p('[Barrier 1: description — Source: Gartner / IDC]')],
        [p('[Driver 2: description — Source: KIET / KOTRA]'),     p('[Barrier 2: description — Source: KIET / KOTRA]')],
        [p('[Driver 3: description — Source: McKinsey MGI]'),     p('[Barrier 3: description — Source: IDC / Statista]')],
      ],
      w2, EN),
    SP(),
  ];
}

// ─── SECTION 4 ─────────────────────────────────────────────
function sec4EN() {
  const w7v  = [1200, 800, 900, 1700, 1600, 1300, 1526]; // 9026
  const w4pf = [1800, 1400, 2500, 3326];                 // 9026
  const hw   = Math.floor(CW / 2);                       // 4513
  return [
    H1('SECTION 4 — COMPETITIVE LANDSCAPE', EN),
    H2('4.1 Vendor Mapping', EN),
    mkTable(
      ['Vendor', 'HQ', 'Type', 'Core Offering', 'Strategy', 'Market Position', 'Source'],
      [
        [p('[Global Vendor A]'), p('[Country]'), 'Private',        p('[Product / service]'), p('[Differentiation strategy]'), p('[Leader / Challenger]'), 'IDC MarketScape'],
        [p('[Global Vendor B]'), p('[Country]'), 'Public',         p('[Product / service]'), p('[Differentiation strategy]'), p('[Niche / Contender]'),   'Gartner MQ'],
        ['ETRI / KAIST',        'Korea',        'Public Research', p('[R&D programme]'),     'Gov-backed applied research',  'Key domestic player',      'KOTRA / KIET'],
      ],
      w7v, EN),
    SP(),
    H2('4.2 Korea-Specific Competitive Context', EN),
    PH('[Describe the Korean competitive landscape: government-backed players (ETRI, KAIST, POSTECH), chaebol involvement (Samsung, SK, LG, Hyundai), and the startup ecosystem. Sources: KOTRA, KIET, KISDI.]', EN),
    H2('4.3 SWOT Analysis', EN),
    new Table({
      width: { size: CW, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [swotHdr('Strengths', hw, EN), swotHdr('Weaknesses', CW - hw, EN)] }),
        new TableRow({ children: [
          swotBody([
            '[Strength 1: Describe a key technological or market advantage in a complete sentence.]',
            '[Strength 2: Describe IP position, manufacturing capability, or established customer base.]',
            '[Strength 3: Describe Korea-specific advantage, e.g., government support or supply chain proximity.]',
          ], hw, EN),
          swotBody([
            '[Weakness 1: Identify a gap in technology maturity or product portfolio.]',
            '[Weakness 2: Note dependency on imported components or limited domestic IP.]',
            '[Weakness 3: Describe market concentration risk or talent shortage.]',
          ], CW - hw, EN),
        ]}),
        new TableRow({ children: [swotHdr('Opportunities', hw, EN), swotHdr('Threats', CW - hw, EN)] }),
        new TableRow({ children: [
          swotBody([
            '[Opportunity 1: Identify an emerging application area or market opening.]',
            '[Opportunity 2: Describe a policy incentive or government procurement opportunity.]',
            '[Opportunity 3: Note an EU–Korea collaboration pathway via Horizon Europe.]',
          ], hw, EN),
          swotBody([
            '[Threat 1: Identify a competitor with disruptive technology or cost advantage.]',
            '[Threat 2: Note regulatory or export control risk.]',
            '[Threat 3: Describe macroeconomic or geopolitical risk factors.]',
          ], CW - hw, EN),
        ]}),
      ],
    }),
    SP(),
    H2("4.4 Porter's Five Forces Summary", EN),
    mkTable(
      ['Force', 'Intensity', 'Key Factor', 'Implication'],
      [
        ['Supplier Power', p('[High / Med / Low]'), p('[Key concentration or switching cost factor]'), p('[Strategic implication]')],
        ['Buyer Power',    p('[High / Med / Low]'), p('[Buyer concentration or price sensitivity]'),   p('[Strategic implication]')],
        ['Rivalry',        p('[High / Med / Low]'), p('[Number of competitors, market growth rate]'),  p('[Strategic implication]')],
        ['New Entrants',   p('[High / Med / Low]'), p('[Capital requirements, IP barriers]'),          p('[Strategic implication]')],
        ['Substitutes',    p('[High / Med / Low]'), p('[Availability of alternative technologies]'),   p('[Strategic implication]')],
      ],
      w4pf, EN),
    SP(),
  ];
}

// ─── SECTION 5 ─────────────────────────────────────────────
function sec5EN() {
  const w6pb = [2000, 1600, 1800, 700, 900, 2026];      // 9026
  const w7rd = [1300, 1400, 800, 900, 1500, 900, 2226]; // 9026
  return [
    H1('SECTION 5 — INNOVATION & R&D LANDSCAPE', EN),
    H2('5.1 Academic Publication Trends', EN),
    BODY('Sources: IEEE Xplore, ACM Digital Library, arXiv, Springer/Elsevier, ETRI Journal, KISTI', EN),
    mkTable(
      ['Title', 'Authors', 'Journal / Conference', 'Year', 'Citations', 'DOI'],
      [
        [p('[Publication title placeholder]'), p('[Author A et al.]'), p('[Journal / Conference name]'), p('[Year]'), p('[X]'), p('[doi:XX.XXXX/XXXXX]')],
        [p('[Publication title placeholder]'), p('[Author B et al.]'), p('[Journal / Conference name]'), p('[Year]'), p('[X]'), p('[doi:XX.XXXX/XXXXX]')],
      ],
      w6pb, EN),
    SP(),
    H2('5.2 R&D Funding Programs', EN),
    mkTable(
      ['Program', 'Funding Body', 'Region', 'Budget', 'Focus Area', 'Timeline', 'Source'],
      [
        [p('[Program name]'), 'EU Horizon Europe', 'EU',      p('€[X]B'),  p('[Focus area]'), p('[Years]'), 'ec.europa.eu'],
        [p('[Program name]'), 'BMBF',               'Germany', p('€[X]M'),  p('[Focus area]'), p('[Years]'), 'bmbf.de'],
        [p('[Program name]'), 'IITP',               'Korea',   p('₩[X]B'), p('[Focus area]'), p('[Years]'), 'iitp.kr'],
        [p('[Program name]'), 'KISTEP',             'Korea',   p('₩[X]B'), p('[Focus area]'), p('[Years]'), 'kistep.re.kr'],
        [p('[Program name]'), 'NEDO',               'Japan',   p('¥[X]B'), p('[Focus area]'), p('[Years]'), 'nedo.go.jp'],
        [p('[Program name]'), 'NIST',               'US',      p('$[X]M'),  p('[Focus area]'), p('[Years]'), 'nist.gov'],
      ],
      w7rd, EN),
    SP(),
    H2('5.3 Emerging Research Directions', EN),
    BUL('[Next frontier topic 1: an emerging research area at the intersection of this technology with AI, materials science, or another discipline. Cite: arXiv / IEEE Xplore.]', EN, true),
    BUL('[Next frontier topic 2: a convergence trend or cross-sector application gaining traction in peer-reviewed literature.]', EN, true),
    BUL("[Next frontier topic 3: a white-space R&D opportunity relevant to Fraunhofer Korea's applied research mandate.]", EN, true),
    SP(),
  ];
}

// ─── SECTION 6 ─────────────────────────────────────────────
function sec6EN() {
  const w7pl = [1800, 1300, 700, 900, 1200, 900, 2226]; // 9026
  return [
    H1('SECTION 6 — REGULATORY & POLICY ENVIRONMENT', EN),
    H2('6.1 Policy Tracker', EN),
    mkTable(
      ['Policy / Regulation', 'Issuing Body', 'Region', 'Status', 'Effective Date', 'Impact', 'Source'],
      [
        [p('[EU Act / Directive name]'),  'EU Commission', 'EU',     p('Active / Pending'), p('[Date]'), p('[High / Med / Low]'), 'ec.europa.eu'],
        [p('[Korean policy name]'),        'MOTIE / MSIT',  'Korea',  p('Active / Pending'), p('[Date]'), p('[High / Med / Low]'), 'motie.go.kr'],
        [p('[Japanese policy name]'),      'METI',          'Japan',  p('Active / Pending'), p('[Date]'), p('[High / Med / Low]'), 'meti.go.jp'],
        [p('[US standard / policy]'),      'NIST',          'US',     p('Active / Pending'), p('[Date]'), p('[High / Med / Low]'), 'nist.gov'],
        [p('[International standard]'),    'OECD / ISO',    'Global', p('Active / Pending'), p('[Date]'), p('[High / Med / Low]'), 'oecd.org'],
      ],
      w7pl, EN),
    SP(),
    H2('6.2 Compliance Considerations', EN),
    BUL('[Data governance: applicable data localisation, privacy, or cross-border data transfer requirements relevant to this technology.]', EN, true),
    BUL('[Intellectual property: IP licensing obligations, standard-essential patent considerations, or open-source compliance requirements.]', EN, true),
    BUL('[Export control: dual-use classifications, Wassenaar Arrangement items, or Korea / EU export restrictions that may apply.]', EN, true),
    SP(),
  ];
}

// ─── SECTION 7 ─────────────────────────────────────────────
function sec7EN() {
  const w5f  = [700, 2800, 1200, 2500, 1826]; // 9026
  const w6rd = [1200, 1400, 1800, 800, 1800, 2026]; // 9026
  return [
    H1('SECTION 7 — TECHNOLOGY FORECAST', EN),
    H2('7.1 Gartner Hype Cycle Position', EN),
    BODY('Current Phase:', EN),
    PH('[Innovation Trigger / Peak of Inflated Expectations / Trough of Disillusionment / Slope of Enlightenment / Plateau of Productivity]', EN),
    BODY('Time to Plateau:', EN),
    PH('[X] years', EN),
    BODY('Source:', EN),
    PH('Gartner [Year] Hype Cycle for [Category]', EN),
    H2('7.2 IDC-Style 5-Year Predictions', EN),
    mkTable(
      ['Year', 'Prediction', 'Confidence', 'Implication', 'Source'],
      [
        [p('[Year+1]'), p('[Prediction: expected market or technology milestone]'),        p('[High / Med / Low]'), p('[Strategic implication for industry]'), 'IDC'],
        [p('[Year+2]'), p('[Prediction: expected adoption or competitive shift]'),         p('[High / Med / Low]'), p('[Strategic implication for industry]'), 'IDC'],
        [p('[Year+3]'), p('[Prediction: expected regulatory or policy development]'),      p('[High / Med / Low]'), p('[Strategic implication for industry]'), 'IDC / Gartner'],
        [p('[Year+4]'), p('[Prediction: expected technology consolidation]'),              p('[High / Med / Low]'), p('[Strategic implication for industry]'), 'Gartner'],
        [p('[Year+5]'), p('[Prediction: long-range market structure outlook]'),            p('[High / Med / Low]'), p('[Strategic implication for industry]'), 'McKinsey MGI'],
      ],
      w5f, EN),
    SP(),
    H2('7.3 Technology Roadmap', EN),
    mkTable(
      ['Phase', 'Timeframe', 'Milestone', 'TRL', 'Key Enabler', 'Risk'],
      [
        ['Short-term', '0–2 years',  p('[Milestone: e.g., POC validation, pilot deployment]'),     p('TRL [X]'), p('[Key enabling technology or policy]'), p('[Primary risk factor]')],
        ['Mid-term',   '2–5 years',  p('[Milestone: e.g., commercial launch, standard adoption]'), p('TRL [X]'), p('[Key enabling technology or policy]'), p('[Primary risk factor]')],
        ['Long-term',  '5–10 years', p('[Milestone: e.g., mass market, ecosystem maturity]'),      p('TRL [X]'), p('[Key enabling technology or policy]'), p('[Primary risk factor]')],
      ],
      w6rd, EN),
    SP(),
  ];
}

// ─── SECTION 8 ─────────────────────────────────────────────
function sec8EN() {
  const w6op = [1300, 1400, 2000, 1600, 900, 1826]; // 9026
  const w5rk = [1800, 1200, 1200, 3100, 1726];      // 9026
  return [
    H1('SECTION 8 — STRATEGIC IMPLICATIONS FOR FRAUNHOFER KOREA', EN),
    H2('8.1 Opportunity Assessment', EN),
    mkTable(
      ['Opportunity', 'Type', 'Potential Partners', 'Funding Source', 'Priority', 'Timeline'],
      [
        ['Joint R&D',           'Research',          'ETRI / KAIST / POSTECH',    'IITP / BMBF',    p('[High / Med / Low]'), p('[Year]')],
        ['Tech Transfer',       'Commercialization', p('[Korean SME / Chaebol]'), 'MOTIE / KISTEP', p('[High / Med / Low]'), p('[Year]')],
        ['Policy Contribution', 'Advisory',          'MSIT / MOTIE',              '—',               p('[High / Med / Low]'), p('[Year]')],
        ['EU–Korea Bridge',     'Collaboration',     p('[EU research partner]'),  'Horizon Europe',  p('[High / Med / Low]'), p('[Year]')],
      ],
      w6op, EN),
    SP(),
    H2('8.2 Risk Register', EN),
    mkTable(
      ['Risk', 'Likelihood', 'Impact', 'Mitigation', 'Owner'],
      [
        [p('[Risk 1: e.g., technology obsolescence due to competing standard]'), p('[H/M/L]'), p('[H/M/L]'), p('[Mitigation: dual-track R&D, standard participation]'), p('[Owner / Function]')],
        [p('[Risk 2: e.g., partner dependency or IP dispute]'),                  p('[H/M/L]'), p('[H/M/L]'), p('[Mitigation: diversification, legal review]'),           p('[Owner / Function]')],
        [p('[Risk 3: e.g., funding programme discontinuation]'),                 p('[H/M/L]'), p('[H/M/L]'), p('[Mitigation: alternative funding pipeline]'),            p('[Owner / Function]')],
      ],
      w5rk, EN),
    SP(),
    H2('8.3 Recommended Actions (Next 90 Days)', EN),
    BUL('[Action 1: Schedule a structured technology briefing with ETRI / KISTEP to align on current TRL and co-funding opportunities under the IITP programme.]', EN, true),
    BUL('[Action 2: Initiate a patent freedom-to-operate analysis via Espacenet and KIPO to identify white-space areas for Fraunhofer IP development.]', EN, true),
    BUL('[Action 3: Draft a Horizon Europe partnership proposal targeting at least one Korean research university or chaebol R&D lab as a named consortium member.]', EN, true),
    SP(),
  ];
}

// ─── SECTION 9 ─────────────────────────────────────────────
function sec9EN() {
  return [
    H1('SECTION 9 — SOURCES & METHODOLOGY', EN),
    H2('9.1 Source Registry', EN),
    BODY('Academic & Research:', EN),
    BUL('IEEE Xplore — ieee.org/xplore', EN),
    BUL('ACM Digital Library — dl.acm.org', EN),
    BUL('arXiv — arxiv.org', EN),
    BUL('Fraunhofer-Publica — publica.fraunhofer.de', EN),
    BUL('ETRI Journal — etri.re.kr', EN),
    BUL('KISTI — kisti.re.kr', EN),
    BUL('Springer / Elsevier / Wiley — via institutional access', EN),
    SP(80),
    BODY('Market Intelligence:', EN),
    BUL('Gartner — gartner.com', EN),
    BUL('IDC — idc.com', EN),
    BUL('Statista — statista.com', EN),
    BUL('McKinsey Global Institute — mckinsey.com/mgi', EN),
    BUL('KIET — kiet.re.kr', EN),
    BUL('KOTRA — kotra.or.kr', EN),
    BUL('KISDI — kisdi.re.kr', EN),
    BUL('ADB — adb.org', EN),
    BUL('OECD iLibrary — oecd-ilibrary.org', EN),
    BUL('Eurostat — ec.europa.eu/eurostat', EN),
    BUL('Destatis — destatis.de', EN),
    BUL('KOSTAT — kostat.go.kr', EN),
    SP(80),
    BODY('Patent & IP:', EN),
    BUL('Espacenet (EPO) — espacenet.epo.org', EN),
    BUL('KIPO — kipo.go.kr', EN),
    BUL('DPMA — dpma.de', EN),
    BUL('JPO — j-platpat.inpit.go.jp', EN),
    BUL('CNIPA — cnipa.gov.cn', EN),
    BUL('Google Patents — patents.google.com', EN),
    SP(80),
    BODY('Government & Policy:', EN),
    BUL('EU Commission — ec.europa.eu', EN),
    BUL('BMBF — bmbf.de', EN),
    BUL('MOTIE — motie.go.kr', EN),
    BUL('MSIT — msit.go.kr', EN),
    BUL('KISTEP — kistep.re.kr', EN),
    BUL('IITP — iitp.kr', EN),
    BUL('NIST — nist.gov', EN),
    BUL('IEA — iea.org', EN),
    BUL('NEDO — nedo.go.jp', EN),
    BUL('METI — meti.go.jp', EN),
    BUL('APEC — apec.org', EN),
    BUL('NITI Aayog — niti.gov.in', EN),
    BUL('EDB Singapore — edb.gov.sg', EN),
    SP(160),
    H2('9.2 Automated Monitoring Methodology', EN),
    PH('[Describe the automated data collection schedule: daily API pulls from Gartner, IDC, and patent databases; keyword list and Boolean search strings; deduplication and relevance-scoring logic; monthly report generation trigger and QA review process.]', EN),
    H2('9.3 Data Quality & Limitations', EN),
    PH('[Identify known data gaps by source type (e.g., Korean SME revenue data has limited public availability). State confidence levels (High / Medium / Low) for each major metric. Document update frequency: patent data weekly; market sizing quarterly; policy tracker monthly.]', EN),
    SP(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [R('— End of Report —', { font: EN, pt: 11, italic: true, color: C.PH })],
    }),
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  ██████████   KOREAN PART (한국어)   ██████████
// ═══════════════════════════════════════════════════════════════════════════

function coverKO() {
  return [
    SP(2400),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 280 },
      children: [R('기술 시장 조사 보고서', { font: KO, pt: 26, bold: true, color: C.PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 480 },
      children: [R('프라운호퍼 연구소 | 한국 사무소', { font: KO, pt: 14, color: C.ACCENT })],
    }),
    SP(360),
    coverField('기술명',      '[기술명 입력]',                        KO),
    coverField('보고서 기간',  '[예: 2026년 2분기 – 2027년 1분기]',   KO),
    coverField('작성자',      '[분석가 / 작성자 이름]',                KO),
    coverField('부서',        '[부서 / 팀 이름]',                     KO),
    coverField('버전',        '[예: v1.0 – 초안]',                    KO),
    coverField('분류',        '내부용 / 기밀',                         KO),
    BR(),
  ];
}

// ─── 섹션 1 ────────────────────────────────────────────────
function sec1KO() {
  const mw = [2500, 1600, 1500, 1700, 1726]; // 9026
  return [
    H1('섹션 1 — 핵심 요약', KO),
    H2('1.1 기술 개요', KO),
    PH('[해당 기술이 무엇인지, 어떻게 작동하는지, 그리고 지금 왜 중요한지를 평이한 언어로 3문장으로 설명하십시오. 기술적 세부 사항에 앞서 핵심 시사점("So What")을 먼저 서술합니다. 참고: Gartner, IDC, Fraunhofer-Publica.]', KO),
    H2('1.2 주요 발견 사항', KO),
    BUL('[시장 신호: 예) 글로벌 시장이 전년 대비 X% 성장, 주요 동인은 … (출처: IDC / Gartner)]', KO, true),
    BUL('[경쟁 신호: 예) 상위 3개 벤더가 매출의 X% 차지, 업계 통합 예상 … (출처: IDC MarketScape)]', KO, true),
    BUL('[한국 특화 신호: 예) 한국 정부 IITP 프로그램에 ₩[X]억 배분 … (출처: IITP / KOTRA)]', KO, true),
    BUL('[리스크 신호: 예) EU 규제 불확실성으로 도입이 [X]분기 지연 가능 … (출처: Gartner / EC)]', KO, true),
    H2('1.3 핵심 지표 대시보드', KO),
    mkTable(
      ['지표', '현재 값', '전년 대비 변화', '예측 (3년)', '출처'],
      [
        ['글로벌 시장 규모',      p('$[X]십억'), p('[+X%]'), p('$[X]십억'), 'Gartner / IDC'],
        ['한국 시장 규모',        p('$[X]십억'), p('[+X%]'), p('$[X]십억'), 'KIET / KOTRA'],
        ['TRL 수준',              p('TRL [X]'), '—',         p('TRL [X]'), '프라운호퍼'],
        ['주요 특허 출원국',      p('[국가명]'), '—',         '—',          'KIPO / Espacenet'],
        ['선도 벤더 시장 점유율', p('[X]%'),    '—',          '—',          'IDC MarketScape'],
      ],
      mw, KO),
    SP(),
  ];
}

// ─── 섹션 2 ────────────────────────────────────────────────
function sec2KO() {
  const w3  = [3000, 3500, 2526];
  const w4  = [2300, 2242, 2242, 2242];
  const w6p = [1200, 2600, 1800, 900, 700, 1826];
  return [
    H1('섹션 2 — 기술 프로파일', KO),
    H2('2.1 기술 정의 및 원리', KO),
    PH('[기술의 핵심 기능, 작동 원리, 주요 변형 또는 하위 기술을 설명하십시오. 1차 출처: IEEE Xplore, Fraunhofer-Publica, ETRI, arXiv.]', KO),
    H2('2.2 기술 준비 수준 (TRL)', KO),
    mkTable(
      ['평가 항목', '평가 결과', '평가 근거'],
      [
        ['현재 TRL',              p('[1–9]'),      p('[표준 기준 / 프라운호퍼 내부 평가]')],
        ['목표 TRL',              p('[1–9]'),      p('[제품 / 프로젝트 로드맵]')],
        ['TRL 9 도달 예상 기간',  p('[X]년'),      p('[전문가 평가 / 미래예측 연구]')],
        ['비교 기술 벤치마크',    p('[기술명]'),   p('[출처 / 벤치마크 보고서]')],
      ],
      w3, KO),
    SP(),
    H2('2.3 기술 차별성', KO),
    PH('[대안 기술 대비 이 기술의 차별점을 설명하십시오: 성능 범위, 비용 구조, 지식재산권 위치, 성숙도 수준, 한국 내 도입 현황.]', KO),
    mkTable(
      ['항목', '해당 기술', '대안 기술 A', '대안 기술 B'],
      [
        ['성능',           p('[평가]'), p('[평가]'), p('[평가]')],
        ['비용',           p('[평가]'), p('[평가]'), p('[평가]')],
        ['성숙도',         p('[평가]'), p('[평가]'), p('[평가]')],
        ['IP 위치',        p('[평가]'), p('[평가]'), p('[평가]')],
        ['한국 도입 현황', p('[평가]'), p('[평가]'), p('[평가]')],
      ],
      w4, KO),
    SP(),
    H2('2.4 특허 현황', KO),
    BODY('출처: Espacenet (EPO), KIPO, DPMA, JPO, CNIPA, Google Patents', KO),
    mkTable(
      ['특허 번호', '제목', '출원인', '국가', '연도', '출처'],
      [
        [p('[EP-XXXXXXX]'), p('[특허 제목 입력]'), p('[출원인명]'), p('[국가]'), p('[연도]'), 'Espacenet'],
        [p('[KR-XXXXXXX]'), p('[특허 제목 입력]'), p('[출원인명]'), p('[국가]'), p('[연도]'), 'KIPO'],
      ],
      w6p, KO),
    SP(),
  ];
}

// ─── 섹션 3 ────────────────────────────────────────────────
function sec3KO() {
  const w6s = [1500, 1700, 1100, 900, 1200, 2626];
  const w6r = [900, 1200, 1800, 1800, 1700, 1626];
  const w2  = [4513, 4513];
  return [
    H1('섹션 3 — 시장 분석', KO),
    H2('3.1 시장 개요', KO),
    PH('[글로벌 시장 규모($X십억), CAGR, 과거 5년 추이, 예측 기간(5~10년)을 제공하십시오. 출처: Gartner, IDC, Statista, McKinsey Global Institute, KIET, KOTRA, ADB.]', KO),
    H2('3.2 시장 세분화', KO),
    mkTable(
      ['세분화 유형', '세그먼트명', '규모', '점유율', '성장률', '비고'],
      [
        ['응용 분야별',   p('[앱 1] / [앱 2]'),      p('$[X]십억'), p('[X]%'), p('[X]% CAGR'), p('[성장 동인 비고]')],
        ['최종 사용자별', p('[산업 분야]'),           p('$[X]십억'), p('[X]%'), p('[X]% CAGR'), p('[수요 패턴 비고]')],
        ['배포 방식별',   p('[배포 모델]'),           p('$[X]십억'), p('[X]%'), p('[X]% CAGR'), p('[모델 전환 비고]')],
        ['지역별',        '한국 / APAC / EU / 미국', p('$[X]십억'), p('[X]%'), p('[X]% CAGR'), p('[지역별 차이 비고]')],
      ],
      w6s, KO),
    SP(),
    H2('3.3 지역별 심층 분석', KO),
    mkTable(
      ['지역', '시장 규모', '주요 동인', '정책 환경', '주요 플레이어', '출처'],
      [
        ['한국',   p('$[X]십억'), p('[동인]'), 'MOTIE, MSIT, IITP',      p('[기업 / 연구기관]'), 'KIET / KOTRA'],
        ['일본',   p('$[X]십억'), p('[동인]'), 'METI, NEDO',               p('[기업]'),             'METI'],
        ['중국',   p('$[X]십억'), p('[동인]'), 'MIIT, CAICT',               p('[기업]'),             'CAICT'],
        ['EU',     p('$[X]십억'), p('[동인]'), 'EU Commission, BMBF',      p('[기업]'),             'Eurostat'],
        ['미국',   p('$[X]십억'), p('[동인]'), 'NIST, DOE',                 p('[기업]'),             'IDC'],
        ['동남아', p('$[X]십억'), p('[동인]'), 'EDB Singapore, IMDA',       p('[기업]'),             'ADB'],
        ['인도',   p('$[X]십억'), p('[동인]'), 'NITI Aayog, DST',            p('[기업]'),             'ADB'],
      ],
      w6r, KO),
    SP(),
    H2('3.4 시장 동인 및 장벽', KO),
    mkTable(
      ['동인 (출처 포함)', '장벽 (출처 포함)'],
      [
        [p('[동인 1: 설명 — 출처: Gartner / IDC]'),    p('[장벽 1: 설명 — 출처: Gartner / IDC]')],
        [p('[동인 2: 설명 — 출처: KIET / KOTRA]'),     p('[장벽 2: 설명 — 출처: KIET / KOTRA]')],
        [p('[동인 3: 설명 — 출처: McKinsey MGI]'),     p('[장벽 3: 설명 — 출처: IDC / Statista]')],
      ],
      w2, KO),
    SP(),
  ];
}

// ─── 섹션 4 ────────────────────────────────────────────────
function sec4KO() {
  const w7v  = [1200, 800, 900, 1700, 1600, 1300, 1526];
  const w4pf = [1800, 1400, 2500, 3326];
  const hw   = Math.floor(CW / 2);
  return [
    H1('섹션 4 — 경쟁 환경', KO),
    H2('4.1 벤더 매핑', KO),
    mkTable(
      ['벤더', '본사', '유형', '핵심 제공 서비스', '전략', '시장 포지션', '출처'],
      [
        [p('[글로벌 벤더 A]'), p('[국가]'), '민간',         p('[제품/서비스]'), p('[차별화 전략]'), p('[리더 / 챌린저]'), 'IDC MarketScape'],
        [p('[글로벌 벤더 B]'), p('[국가]'), '상장',          p('[제품/서비스]'), p('[차별화 전략]'), p('[틈새 / 경쟁자]'), 'Gartner MQ'],
        ['ETRI / KAIST',      '한국',     '공공 연구기관', p('[R&D 프로그램]'), '정부 지원 응용 연구', '핵심 국내 플레이어', 'KOTRA / KIET'],
      ],
      w7v, KO),
    SP(),
    H2('4.2 한국 특화 경쟁 환경', KO),
    PH('[한국 경쟁 환경을 설명하십시오: 정부 지원 기관(ETRI, KAIST, POSTECH), 재벌 참여(삼성, SK, LG, 현대), 스타트업 생태계. 출처: KOTRA, KIET, KISDI.]', KO),
    H2('4.3 SWOT 분석', KO),
    new Table({
      width: { size: CW, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [swotHdr('강점 (Strengths)', hw, KO),      swotHdr('약점 (Weaknesses)', CW - hw, KO)] }),
        new TableRow({ children: [
          swotBody([
            '[강점 1: 핵심 기술적 또는 시장 우위를 완전한 문장으로 설명하십시오.]',
            '[강점 2: 지식재산권 위치, 제조 역량, 또는 확립된 고객 기반을 설명하십시오.]',
            '[강점 3: 정부 지원, 공급망 근접성 등 한국 특화 장점을 설명하십시오.]',
          ], hw, KO),
          swotBody([
            '[약점 1: 기술 성숙도 또는 제품 포트폴리오의 격차를 파악하십시오.]',
            '[약점 2: 수입 부품 의존성 또는 제한된 국내 IP를 설명하십시오.]',
            '[약점 3: 시장 집중 리스크 또는 인재 부족을 설명하십시오.]',
          ], CW - hw, KO),
        ]}),
        new TableRow({ children: [swotHdr('기회 (Opportunities)', hw, KO), swotHdr('위협 (Threats)', CW - hw, KO)] }),
        new TableRow({ children: [
          swotBody([
            '[기회 1: 새로운 응용 분야 또는 시장 기회를 파악하십시오.]',
            '[기회 2: 정책 인센티브 또는 정부 조달 기회를 설명하십시오.]',
            '[기회 3: Horizon Europe을 통한 EU–한국 협력 경로를 설명하십시오.]',
          ], hw, KO),
          swotBody([
            '[위협 1: 파괴적 기술 또는 비용 우위를 가진 경쟁자를 파악하십시오.]',
            '[위협 2: 규제 또는 수출 통제 리스크를 설명하십시오.]',
            '[위협 3: 거시경제 또는 지정학적 리스크 요인을 설명하십시오.]',
          ], CW - hw, KO),
        ]}),
      ],
    }),
    SP(),
    H2('4.4 포터의 5가지 경쟁 요인 요약', KO),
    mkTable(
      ['경쟁 요인', '강도', '핵심 요인', '시사점'],
      [
        ['공급자 교섭력', p('[높음 / 중간 / 낮음]'), p('[핵심 집중도 또는 전환 비용 요인]'), p('[전략적 시사점]')],
        ['구매자 교섭력', p('[높음 / 중간 / 낮음]'), p('[구매자 집중도 또는 가격 민감도]'),  p('[전략적 시사점]')],
        ['경쟁 강도',     p('[높음 / 중간 / 낮음]'), p('[경쟁자 수, 시장 성장률]'),          p('[전략적 시사점]')],
        ['신규 진입자',   p('[높음 / 중간 / 낮음]'), p('[자본 요건, IP 장벽]'),              p('[전략적 시사점]')],
        ['대체재',        p('[높음 / 중간 / 낮음]'), p('[대안 기술의 가용성]'),              p('[전략적 시사점]')],
      ],
      w4pf, KO),
    SP(),
  ];
}

// ─── 섹션 5 ────────────────────────────────────────────────
function sec5KO() {
  const w6pb = [2000, 1600, 1800, 700, 900, 2026];
  const w7rd = [1300, 1400, 800, 900, 1500, 900, 2226];
  return [
    H1('섹션 5 — 혁신 및 연구개발(R&D) 현황', KO),
    H2('5.1 학술 논문 발표 동향', KO),
    BODY('출처: IEEE Xplore, ACM Digital Library, arXiv, Springer/Elsevier, ETRI Journal, KISTI', KO),
    mkTable(
      ['제목', '저자', '저널 / 학회', '연도', '인용 수', 'DOI'],
      [
        [p('[논문 제목 입력]'), p('[저자 A 외]'), p('[저널 / 학회명]'), p('[연도]'), p('[X]'), p('[doi:XX.XXXX/XXXXX]')],
        [p('[논문 제목 입력]'), p('[저자 B 외]'), p('[저널 / 학회명]'), p('[연도]'), p('[X]'), p('[doi:XX.XXXX/XXXXX]')],
      ],
      w6pb, KO),
    SP(),
    H2('5.2 연구개발 지원 프로그램', KO),
    mkTable(
      ['프로그램', '지원 기관', '지역', '예산', '핵심 분야', '기간', '출처'],
      [
        [p('[프로그램명]'), 'EU Horizon Europe', 'EU',  p('€[X]십억'), p('[핵심 분야]'), p('[기간]'), 'ec.europa.eu'],
        [p('[프로그램명]'), 'BMBF',               '독일', p('€[X]백만'), p('[핵심 분야]'), p('[기간]'), 'bmbf.de'],
        [p('[프로그램명]'), 'IITP',               '한국', p('₩[X]억'),  p('[핵심 분야]'), p('[기간]'), 'iitp.kr'],
        [p('[프로그램명]'), 'KISTEP',             '한국', p('₩[X]억'),  p('[핵심 분야]'), p('[기간]'), 'kistep.re.kr'],
        [p('[프로그램명]'), 'NEDO',               '일본', p('¥[X]십억'), p('[핵심 분야]'), p('[기간]'), 'nedo.go.jp'],
        [p('[프로그램명]'), 'NIST',               '미국', p('$[X]백만'), p('[핵심 분야]'), p('[기간]'), 'nist.gov'],
      ],
      w7rd, KO),
    SP(),
    H2('5.3 신흥 연구 방향', KO),
    BUL('[미래 연구 주제 1: 이 기술과 AI, 소재 과학 또는 다른 분야의 교차점에서 나타나는 새로운 연구 영역을 설명하십시오. 인용: arXiv / IEEE Xplore.]', KO, true),
    BUL('[미래 연구 주제 2: 학술 문헌에서 주목받는 기술 융합 트렌드 또는 분야 간 응용을 설명하십시오.]', KO, true),
    BUL('[미래 연구 주제 3: 프라운호퍼 한국의 응용 연구 역할과 관련된 현재 R&D 환경의 공백 기회를 파악하십시오.]', KO, true),
    SP(),
  ];
}

// ─── 섹션 6 ────────────────────────────────────────────────
function sec6KO() {
  const w7pl = [1800, 1300, 700, 900, 1200, 900, 2226];
  return [
    H1('섹션 6 — 규제 및 정책 환경', KO),
    H2('6.1 정책 트래커', KO),
    mkTable(
      ['정책 / 규제', '발행 기관', '지역', '상태', '시행 일자', '기술 영향', '출처'],
      [
        [p('[EU 법안 / 지침명]'),  'EU Commission', 'EU',     p('시행 / 대기'), p('[날짜]'), p('[높음 / 중간 / 낮음]'), 'ec.europa.eu'],
        [p('[한국 정책명]'),        'MOTIE / MSIT',  '한국',   p('시행 / 대기'), p('[날짜]'), p('[높음 / 중간 / 낮음]'), 'motie.go.kr'],
        [p('[일본 정책명]'),        'METI',          '일본',   p('시행 / 대기'), p('[날짜]'), p('[높음 / 중간 / 낮음]'), 'meti.go.jp'],
        [p('[미국 표준 / 정책]'),   'NIST',          '미국',   p('시행 / 대기'), p('[날짜]'), p('[높음 / 중간 / 낮음]'), 'nist.gov'],
        [p('[국제 표준]'),          'OECD / ISO',    '글로벌', p('시행 / 대기'), p('[날짜]'), p('[높음 / 중간 / 낮음]'), 'oecd.org'],
      ],
      w7pl, KO),
    SP(),
    H2('6.2 컴플라이언스 고려 사항', KO),
    BUL('[데이터 거버넌스: 이 기술에 적용되는 데이터 현지화, 개인정보보호, 또는 국경 간 데이터 이전 요건을 설명하십시오.]', KO, true),
    BUL('[지식재산권: IP 라이선싱 의무, 표준필수특허(SEP) 고려 사항, 또는 오픈소스 컴플라이언스 요건을 설명하십시오.]', KO, true),
    BUL('[수출 통제: 이중 용도 분류, 바세나르 체제 품목, 또는 한국/EU 수출 제한 사항을 파악하십시오.]', KO, true),
    SP(),
  ];
}

// ─── 섹션 7 ────────────────────────────────────────────────
function sec7KO() {
  const w5f  = [700, 2800, 1200, 2500, 1826];
  const w6rd = [1200, 1400, 1800, 800, 1800, 2026];
  return [
    H1('섹션 7 — 기술 전망', KO),
    H2('7.1 가트너 하이프 사이클 위치', KO),
    BODY('현재 단계:', KO),
    PH('[혁신 촉발 / 과대 기대의 정점 / 환멸의 계곡 / 계몽의 경사면 / 생산성의 고원]', KO),
    BODY('고원 도달 예상 기간:', KO),
    PH('[X]년', KO),
    BODY('출처:', KO),
    PH('Gartner [연도] Hype Cycle for [카테고리]', KO),
    H2('7.2 IDC 방식 5년 예측', KO),
    mkTable(
      ['연도', '예측', '신뢰도', '시사점', '출처'],
      [
        [p('[Year+1]'), p('[Year+1] 예측: 시장 또는 기술 마일스톤 설명'), p('[높음/중간/낮음]'), p('[업계 전략적 시사점]'), 'IDC'],
        [p('[Year+2]'), p('[Year+2] 예측: 도입 또는 경쟁 구도 변화 설명'), p('[높음/중간/낮음]'), p('[업계 전략적 시사점]'), 'IDC'],
        [p('[Year+3]'), p('[Year+3] 예측: 규제 또는 정책 개발 설명'), p('[높음/중간/낮음]'), p('[업계 전략적 시사점]'), 'IDC / Gartner'],
        [p('[Year+4]'), p('[Year+4] 예측: 기술 통합 전망 설명'), p('[높음/중간/낮음]'), p('[업계 전략적 시사점]'), 'Gartner'],
        [p('[Year+5]'), p('[Year+5] 예측: 장기 시장 구조 전망 설명'), p('[높음/중간/낮음]'), p('[업계 전략적 시사점]'), 'McKinsey MGI'],
      ],
      w5f, KO),
    SP(),
    H2('7.3 기술 로드맵', KO),
    mkTable(
      ['단계', '기간', '마일스톤', 'TRL', '핵심 촉진 요인', '리스크'],
      [
        ['단기', '0–2년',   p('[마일스톤: POC 검증, 파일럿 배포 등]'),  p('TRL [X]'), p('[핵심 기술 또는 정책]'), p('[주요 리스크]')],
        ['중기', '2–5년',   p('[마일스톤: 상용화 출시, 표준 채택 등]'), p('TRL [X]'), p('[핵심 기술 또는 정책]'), p('[주요 리스크]')],
        ['장기', '5–10년',  p('[마일스톤: 대량 시장, 생태계 성숙 등]'), p('TRL [X]'), p('[핵심 기술 또는 정책]'), p('[주요 리스크]')],
      ],
      w6rd, KO),
    SP(),
  ];
}

// ─── 섹션 8 ────────────────────────────────────────────────
function sec8KO() {
  const w6op = [1300, 1400, 2000, 1600, 900, 1826];
  const w5rk = [1800, 1200, 1200, 3100, 1726];
  return [
    H1('섹션 8 — 프라운호퍼 한국을 위한 전략적 시사점', KO),
    H2('8.1 기회 평가', KO),
    mkTable(
      ['기회', '유형', '잠재적 파트너', '재원', '우선순위', '타임라인'],
      [
        ['공동 연구개발',   '연구',    'ETRI / KAIST / POSTECH',     'IITP / BMBF',    p('[높음 / 중간 / 낮음]'), p('[연도]')],
        ['기술 이전',       '상용화',  p('[한국 중소기업 / 대기업]'), 'MOTIE / KISTEP', p('[높음 / 중간 / 낮음]'), p('[연도]')],
        ['정책 기여',       '자문',    'MSIT / MOTIE',                '—',               p('[높음 / 중간 / 낮음]'), p('[연도]')],
        ['EU-한국 브리지', '협력',    p('[EU 연구 파트너]'),          'Horizon Europe',  p('[높음 / 중간 / 낮음]'), p('[연도]')],
      ],
      w6op, KO),
    SP(),
    H2('8.2 리스크 등록부', KO),
    mkTable(
      ['리스크', '발생 가능성', '영향', '완화 방안', '담당자'],
      [
        [p('[리스크 1: 경쟁 표준으로 인한 기술 진부화]'), p('[높음/중간/낮음]'), p('[높음/중간/낮음]'), p('[완화 전략: 이중 트랙 R&D, 표준 참여]'), p('[담당자]')],
        [p('[리스크 2: 파트너 의존성 또는 IP 분쟁]'),     p('[높음/중간/낮음]'), p('[높음/중간/낮음]'), p('[완화 전략: 다각화, 법적 검토]'),         p('[담당자]')],
        [p('[리스크 3: 지원 프로그램 중단]'),              p('[높음/중간/낮음]'), p('[높음/중간/낮음]'), p('[완화 전략: 대체 재원 파이프라인]'),       p('[담당자]')],
      ],
      w5rk, KO),
    SP(),
    H2('8.3 권고 조치 사항 (향후 90일)', KO),
    BUL('[조치 1: ETRI / KISTEP과 구조화된 기술 브리핑을 개최하여 현재 TRL 및 IITP 프로그램의 공동 재원 기회를 조율하십시오.]', KO, true),
    BUL('[조치 2: Espacenet 및 KIPO를 통해 특허 자유 실시(FTO) 분석을 착수하여 프라운호퍼 IP 개발을 위한 공백 영역을 파악하십시오.]', KO, true),
    BUL('[조치 3: 최소 1개의 한국 연구 대학 또는 대기업 R&D 연구소를 포함하는 Horizon Europe 파트너십 제안서 초안을 작성하십시오.]', KO, true),
    SP(),
  ];
}

// ─── 섹션 9 ────────────────────────────────────────────────
function sec9KO() {
  return [
    H1('섹션 9 — 출처 및 방법론', KO),
    H2('9.1 출처 등록부', KO),
    BODY('학술 및 연구:', KO),
    BUL('IEEE Xplore — ieee.org/xplore', KO),
    BUL('ACM Digital Library — dl.acm.org', KO),
    BUL('arXiv — arxiv.org', KO),
    BUL('Fraunhofer-Publica — publica.fraunhofer.de', KO),
    BUL('ETRI Journal — etri.re.kr', KO),
    BUL('KISTI — kisti.re.kr', KO),
    BUL('Springer / Elsevier / Wiley — 기관 구독을 통한 접근', KO),
    SP(80),
    BODY('시장 인텔리전스:', KO),
    BUL('Gartner — gartner.com', KO),
    BUL('IDC — idc.com', KO),
    BUL('Statista — statista.com', KO),
    BUL('McKinsey Global Institute — mckinsey.com/mgi', KO),
    BUL('KIET — kiet.re.kr', KO),
    BUL('KOTRA — kotra.or.kr', KO),
    BUL('KISDI — kisdi.re.kr', KO),
    BUL('ADB — adb.org', KO),
    BUL('OECD iLibrary — oecd-ilibrary.org', KO),
    BUL('Eurostat — ec.europa.eu/eurostat', KO),
    BUL('Destatis — destatis.de', KO),
    BUL('KOSTAT — kostat.go.kr', KO),
    SP(80),
    BODY('특허 및 IP:', KO),
    BUL('Espacenet (EPO) — espacenet.epo.org', KO),
    BUL('KIPO — kipo.go.kr', KO),
    BUL('DPMA — dpma.de', KO),
    BUL('JPO — j-platpat.inpit.go.jp', KO),
    BUL('CNIPA — cnipa.gov.cn', KO),
    BUL('Google Patents — patents.google.com', KO),
    SP(80),
    BODY('정부 및 정책:', KO),
    BUL('EU Commission — ec.europa.eu', KO),
    BUL('BMBF — bmbf.de', KO),
    BUL('MOTIE — motie.go.kr', KO),
    BUL('MSIT — msit.go.kr', KO),
    BUL('KISTEP — kistep.re.kr', KO),
    BUL('IITP — iitp.kr', KO),
    BUL('NIST — nist.gov', KO),
    BUL('IEA — iea.org', KO),
    BUL('NEDO — nedo.go.jp', KO),
    BUL('METI — meti.go.jp', KO),
    BUL('APEC — apec.org', KO),
    BUL('NITI Aayog — niti.gov.in', KO),
    BUL('EDB Singapore — edb.gov.sg', KO),
    SP(160),
    H2('9.2 자동화 모니터링 방법론', KO),
    PH('[자동화 데이터 수집 일정을 설명하십시오: Gartner, IDC 및 특허 데이터베이스에서의 일일 API 수집; 키워드 목록 및 불리언 검색 문자열; 중복 제거 및 관련성 점수 로직; 월간 보고서 생성 트리거 및 QA 검토 프로세스.]', KO),
    H2('9.3 데이터 품질 및 한계', KO),
    PH('[출처 유형별 알려진 데이터 격차를 파악하십시오(예: 한국 중소기업 매출 데이터는 공개 가용성 제한). 주요 지표별 신뢰도 수준(높음 / 중간 / 낮음)을 명시하십시오. 업데이트 주기: 특허 데이터 주 1회, 시장 규모 분기 1회, 정책 트래커 월 1회.]', KO),
    SP(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [R('— 보고서 끝 —', { font: KO, pt: 11, italic: true, color: C.PH })],
    }),
  ];
}

// ═══════════════════════════════════════════════════════════
// ASSEMBLE & WRITE
// ═══════════════════════════════════════════════════════════
const enChildren = [
  ...coverEN(),
  ...sec1EN(), ...sec2EN(), ...sec3EN(), ...sec4EN(), ...sec5EN(),
  ...sec6EN(), ...sec7EN(), ...sec8EN(), ...sec9EN(),
];

const koChildren = [
  ...coverKO(),
  ...sec1KO(), ...sec2KO(), ...sec3KO(), ...sec4KO(), ...sec5KO(),
  ...sec6KO(), ...sec7KO(), ...sec8KO(), ...sec9KO(),
];

const doc = new Document({
  numbering:  { config: NUM_CFG },
  styles:     DOC_STYLES,
  sections: [{
    properties: {
      page: {
        size:   { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    footers: { default: mkFooter() },
    // English part → hard page break → Korean part (all in one section)
    children: [...enChildren, BR(), ...koChildren],
  }],
});

Packer.toBuffer(doc)
  .then(buf => {
    fs.writeFileSync('./Fraunhofer_TMR_Template.docx', buf);
    console.log('');
    console.log('  ✅  Fraunhofer_TMR_Template.docx written successfully.');
    console.log(`  📄  Size: ${(buf.length / 1024).toFixed(1)} KB`);
  })
  .catch(err => {
    console.error('  ❌  Error generating document:', err.message || err);
    process.exit(1);
  });
