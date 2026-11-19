// Ready-made workbooks. Each one is a normal spreadsheet plan with live formulas, so it opens
// instantly (no model call) and can then be changed by prompt or by hand like any other.
import { colName } from './a1.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const year = () => new Date().getFullYear();

function budget() {
  const months = MONTHS.map((m) => ({ header: m, format: 'currency0', width: 11 }));
  const cols = [{ header: 'Category', width: 24 }, ...months, { header: 'Year', format: 'currency0', width: 13, formula: '=SUM(B{r}:M{r})' }];
  const totals = Object.fromEntries('BCDEFGHIJKLMN'.split('').map((c) => [c, 'sum']));
  const income = [['Salary', 4200], ['Side income', 450], ['Other income', 0]];
  const spend = [['Rent or mortgage', 1400], ['Utilities', 180], ['Groceries', 520], ['Transport', 160], ['Insurance', 140], ['Phone and internet', 75], ['Eating out', 180], ['Subscriptions', 45], ['Health', 60], ['Savings', 500], ['Other', 100]];
  const rows = (list) => list.map(([name, v]) => [name, ...MONTHS.map(() => v), null]);
  const s = (n) => `'${n}'`;
  return { title: `Monthly budget ${year()}`, sheets: [
    { name: 'Summary', cells: {
      A1: { v: `Budget ${year()}`, bold: true, size: 16 }, A3: { v: 'Month', bold: true }, B3: { v: 'Income', bold: true }, C3: { v: 'Spending', bold: true }, D3: { v: 'Left over', bold: true }, E3: { v: 'Saved %', bold: true },
      ...Object.fromEntries(MONTHS.flatMap((m, i) => { const r = 4 + i, c = colName(2 + i); return [[`A${r}`, m], [`B${r}`, { v: `=Income!${c}5`, format: 'currency0' }], [`C${r}`, { v: `=Spending!${c}13`, format: 'currency0' }], [`D${r}`, { v: `=B${r}-C${r}`, format: 'currency0' }], [`E${r}`, { v: `=IF(B${r}=0,0,D${r}/B${r})`, format: 'percent' }]]; })),
      A16: { v: 'Year', bold: true }, B16: { v: '=SUM(B4:B15)', format: 'currency0', bold: true }, C16: { v: '=SUM(C4:C15)', format: 'currency0', bold: true }, D16: { v: '=B16-C16', format: 'currency0', bold: true }, E16: { v: '=IF(B16=0,0,D16/B16)', format: 'percent', bold: true },
    }, styles: [{ range: 'A3:E3', fill: '#1F3A5F', color: '#FFFFFF', align: 'center' }, { range: 'A16:E16', border: 'top', fill: '#E3E8EF' }], widths: { A: 14, B: 14, C: 14, D: 14, E: 11 },
      conditional: [{ range: 'D4:D15', rule: 'lessThan', value: 0, fill: '#F8CBAD', color: '#9C0006' }, { range: 'D4:D15', rule: 'greaterThan', value: 0, fill: '#C6EFCE', color: '#006100' }],
      charts: [{ type: 'column', title: 'Income and spending by month', categories: 'A4:A15', series: [{ name: 'Income', values: 'B4:B15' }, { name: 'Spending', values: 'C4:C15' }], anchor: 'G3', width: 560, height: 300 }, { type: 'doughnut', title: 'Where the money goes', categories: `${s('Spending')}!A2:A12`, series: [{ values: `${s('Spending')}!N2:N12` }], anchor: 'G19', width: 560, height: 300 }] },
    { name: 'Income', columns: cols, rows: rows(income), totals, totalLabel: 'Total income', freeze: 'B2', tabColor: '#70AD47' },
    { name: 'Spending', columns: cols, rows: rows(spend), totals, totalLabel: 'Total spending', freeze: 'B2', banded: true, tabColor: '#ED7D31' },
  ] };
}

function tracker() {
  const d = (n) => { const t = new Date(Date.now() + n * 864e5); return t.toISOString().slice(0, 10); };
  const rows = [
    ['Agree the scope with the client', 'Planning', 'Aisha', 'High', d(-14), d(-7), 'Done', 1], ['Write the project plan', 'Planning', 'Aisha', 'Medium', d(-9), d(-2), 'Done', 1],
    ['Design the first draft', 'Design', 'Ben', 'High', d(-3), d(6), 'In progress', 0.6], ['Review the design with the team', 'Design', 'Chloe', 'Medium', d(5), d(8), 'Not started', 0],
    ['Build the core features', 'Build', 'Dev', 'High', d(7), d(28), 'Not started', 0], ['Prepare the test plan', 'Testing', 'Chloe', 'Low', d(-6), d(-1), 'In progress', 0.4],
    ['Test with five customers', 'Testing', 'Ben', 'Medium', d(29), d(36), 'Not started', 0], ['Go live', 'Launch', 'Aisha', 'High', d(40), d(41), 'Not started', 0],
  ].map((r) => [...r, null, null]);
  return { title: 'Project tracker', sheets: [
    { name: 'Tasks', columns: [{ header: 'Task', width: 36, wrap: true }, { header: 'Phase', width: 13 }, { header: 'Owner', width: 12 }, { header: 'Priority', width: 11, align: 'center' }, { header: 'Start', format: 'date', width: 13 }, { header: 'Due', format: 'date', width: 13 }, { header: 'Status', width: 14, align: 'center' }, { header: '% done', format: 'percent0', width: 9 },
      { header: 'Days left', format: 'plain', width: 10, formula: '=IF(G{r}="Done","",F{r}-TODAY())' }, { header: 'Flag', width: 11, align: 'center', formula: '=IF(G{r}="Done","",IF(F{r}<TODAY(),"Overdue",IF(F{r}-TODAY()<=7,"Due soon","")))' }],
      rows, freeze: 'B2', filter: true, banded: true,
      validation: [{ range: 'G2:G500', list: ['Not started', 'In progress', 'Blocked', 'Done'] }, { range: 'D2:D500', list: ['High', 'Medium', 'Low'] }, { range: 'H2:H500', type: 'decimal', min: 0, max: 1, message: 'Enter a value between 0% and 100%.' }],
      conditional: [{ range: 'G2:G500', rule: 'equal', value: 'Done', fill: '#C6EFCE', color: '#006100' }, { range: 'G2:G500', rule: 'equal', value: 'In progress', fill: '#FFEB9C', color: '#7F6000' }, { range: 'G2:G500', rule: 'equal', value: 'Blocked', fill: '#F8CBAD', color: '#9C0006' },
        { range: 'J2:J500', rule: 'equal', value: 'Overdue', fill: '#F8CBAD', color: '#9C0006', bold: true }, { range: 'J2:J500', rule: 'equal', value: 'Due soon', fill: '#FFEB9C', color: '#7F6000' }, { range: 'H2:H500', rule: 'dataBar', fill: '#63A0E8' }, { range: 'D2:D500', rule: 'equal', value: 'High', color: '#C00000', bold: true }] },
    { name: 'Overview', cells: {
      A1: { v: 'Project overview', bold: true, size: 16 }, A3: { v: 'Status', bold: true }, B3: { v: 'Tasks', bold: true },
      A4: 'Not started', B4: '=COUNTIF(Tasks!G:G,A4)', A5: 'In progress', B5: '=COUNTIF(Tasks!G:G,A5)', A6: 'Blocked', B6: '=COUNTIF(Tasks!G:G,A6)', A7: 'Done', B7: '=COUNTIF(Tasks!G:G,A7)',
      A8: { v: 'All tasks', bold: true }, B8: { v: '=SUM(B4:B7)', bold: true },
      D3: { v: 'Progress', bold: true }, D4: 'Overall % done', E4: { v: '=IFERROR(AVERAGE(Tasks!H:H),0)', format: 'percent0' }, D5: 'Overdue tasks', E5: '=COUNTIF(Tasks!J:J,"Overdue")', D6: 'Due in the next 7 days', E6: '=COUNTIF(Tasks!J:J,"Due soon")', D7: 'High priority still open', E7: '=COUNTIFS(Tasks!D:D,"High",Tasks!G:G,"<>Done")',
    }, styles: [{ range: 'A3:B3', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'D3:E3', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'A8:B8', border: 'top' }], widths: { A: 16, B: 9, C: 4, D: 26, E: 11 },
      conditional: [{ range: 'E5', rule: 'greaterThan', value: 0, fill: '#F8CBAD', color: '#9C0006' }],
      charts: [{ type: 'doughnut', title: 'Tasks by status', categories: 'A4:A7', series: [{ values: 'B4:B7' }], anchor: 'A11', width: 480, height: 280 }] },
  ] };
}

function financialModel() {
  const y0 = year();
  const yrs = [0, 1, 2, 3, 4].map((i) => y0 + i);
  const C = (i) => colName(2 + i); // B..F
  const line = (r, label, f, fmt = 'currency0', style = {}) => Object.fromEntries([[`A${r}`, { v: label, ...style }], ...yrs.map((_y, i) => [`${C(i)}${r}`, { v: f(i, C(i), i ? C(i - 1) : null), format: fmt, ...style }])]);
  const bold = { bold: true };
  const pl = {
    A1: { v: 'Five-year forecast', bold: true, size: 16 }, A2: { v: 'Change the blue cells on the Assumptions sheet; everything here recalculates.', italic: true, color: '#6B7280' },
    A4: { v: 'Profit and loss', ...bold }, ...Object.fromEntries(yrs.map((y, i) => [`${C(i)}4`, { v: y, ...bold, align: 'center', format: 'plain' }])),
    ...line(5, 'Customers (year end)', (i, c, p) => (i ? `=ROUND(${p}5*(1+Growth)*(1-Churn),0)` : '=StartCustomers'), 'integer'),
    ...line(6, 'Revenue', (i, c, p) => (i ? `=AVERAGE(${p}5,${c}5)*Price*12*(1+PriceRise)^${i}` : `=${c}5*Price*12`)),
    ...line(7, 'Cost of sales', (_i, c) => `=-${c}6*CostOfSalesPct`),
    ...line(8, 'Gross profit', (_i, c) => `=${c}6+${c}7`, 'currency0', bold),
    ...line(9, 'Gross margin', (_i, c) => `=IF(${c}6=0,0,${c}8/${c}6)`, 'percent', { italic: true }),
    ...line(11, 'Salaries', (i, c, p) => (i ? `=${p}11*(1+SalaryGrowth)` : '=-StartSalaries')),
    ...line(12, 'Marketing', (_i, c) => `=-${c}6*MarketingPct`),
    ...line(13, 'Rent and other overheads', (i, c, p) => (i ? `=${p}13*(1+Inflation)` : '=-StartOverheads')),
    ...line(14, 'Operating costs', (_i, c) => `=SUM(${c}11:${c}13)`, 'currency0', bold),
    ...line(16, 'EBITDA', (_i, c) => `=${c}8+${c}14`, 'currency0', bold),
    ...line(17, 'Depreciation', (i) => `=-Capex/5*${Math.min(i + 1, 5)}`),
    ...line(18, 'Profit before tax', (_i, c) => `=${c}16+${c}17`),
    ...line(19, 'Tax', (_i, c) => `=-MAX(0,${c}18)*TaxRate`),
    ...line(20, 'Net profit', (_i, c) => `=${c}18+${c}19`, 'currency0', bold),
    ...line(21, 'Net margin', (_i, c) => `=IF(${c}6=0,0,${c}20/${c}6)`, 'percent', { italic: true }),
    A23: { v: 'Cash', ...bold },
    ...line(24, 'Opening cash', (i, c, p) => (i ? `=${p}27` : '=StartCash')),
    ...line(25, 'Cash from operations', (_i, c) => `=${c}20-${c}17`),
    ...line(26, 'Investment in equipment', () => '=-Capex'),
    ...line(27, 'Closing cash', (_i, c) => `=SUM(${c}24:${c}26)`, 'currency0', bold),
  };
  const A = [['Starting customers', 400, 'integer', 'StartCustomers'], ['Customer growth per year', 0.35, 'percent', 'Growth'], ['Customers lost per year', 0.08, 'percent', 'Churn'], ['Price per customer per month', 49, 'currency', 'Price'], ['Yearly price rise', 0.03, 'percent', 'PriceRise'],
    ['Cost of sales (% of revenue)', 0.22, 'percent', 'CostOfSalesPct'], ['Salaries in year 1', 120000, 'currency0', 'StartSalaries'], ['Salary growth per year', 0.12, 'percent', 'SalaryGrowth'], ['Marketing (% of revenue)', 0.1, 'percent', 'MarketingPct'],
    ['Rent and overheads in year 1', 36000, 'currency0', 'StartOverheads'], ['Inflation', 0.03, 'percent', 'Inflation'], ['Equipment bought each year', 8000, 'currency0', 'Capex'], ['Tax rate', 0.2, 'percent', 'TaxRate'], ['Cash at the start', 50000, 'currency0', 'StartCash']];
  return { title: 'Financial model', names: A.map((a, i) => ({ name: a[3], ref: `Assumptions!$B$${4 + i}` })), sheets: [
    { name: 'Assumptions', cells: { A1: { v: 'Assumptions', bold: true, size: 16 }, A3: { v: 'Driver', bold: true }, B3: { v: 'Value', bold: true }, C3: { v: 'Name used in formulas', bold: true },
      ...Object.fromEntries(A.flatMap((a, i) => [[`A${4 + i}`, a[0]], [`B${4 + i}`, { v: a[1], format: a[2], color: '#0000FF', fill: '#FFF9E5' }], [`C${4 + i}`, { v: a[3], color: '#6B7280', italic: true }]])) },
      styles: [{ range: 'A3:C3', fill: '#1F3A5F', color: '#FFFFFF' }], widths: { A: 34, B: 16, C: 24 }, tabColor: '#FFC000' },
    { name: 'Forecast', cells: pl, widths: { A: 30, B: 14, C: 14, D: 14, E: 14, F: 14 }, freeze: 'B5',
      styles: [{ range: 'A4:F4', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'A8:F8', border: 'top' }, { range: 'A16:F16', border: 'top', fill: '#E3E8EF' }, { range: 'A20:F20', border: 'top', fill: '#E3E8EF' }, { range: 'A27:F27', border: 'top', fill: '#E3E8EF' }, { range: 'A23:F23', fill: '#1F3A5F', color: '#FFFFFF' }],
      conditional: [{ range: 'B20:F20', rule: 'lessThan', value: 0, color: '#C00000' }, { range: 'B27:F27', rule: 'lessThan', value: 0, color: '#C00000' }],
      charts: [{ type: 'column', title: 'Revenue, EBITDA and net profit', categories: 'B4:F4', series: [{ name: 'Revenue', values: 'B6:F6' }, { name: 'EBITDA', values: 'B16:F16' }, { name: 'Net profit', values: 'B20:F20' }], anchor: 'H4', width: 560, height: 300 }, { type: 'line', title: 'Closing cash', categories: 'B4:F4', series: [{ name: 'Closing cash', values: 'B27:F27' }], anchor: 'H20', width: 560, height: 260 }] },
  ] };
}

function dashboard() {
  const regions = ['North', 'South', 'East', 'West'], products = ['Starter', 'Plus', 'Pro'], reps = ['Amira', 'Jon', 'Priya', 'Leo', 'Sara'];
  const price = { Starter: 29, Plus: 79, Pro: 199 };
  const rows = [];
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let m = 0; m < 12; m++) for (let k = 0; k < 10; k++) { const p = products[Math.floor(rnd() * 3)]; rows.push([`${year()}-${String(m + 1).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`, regions[Math.floor(rnd() * 4)], reps[Math.floor(rnd() * 5)], p, 1 + Math.floor(rnd() * 12 + m / 3), price[p], null, null]); }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const cells = { A1: { v: 'Sales dashboard', bold: true, size: 18 }, A2: { v: 'Paste or type your own sales on the Sales sheet. Every number and chart here updates by itself.', italic: true, color: '#6B7280' },
    A4: { v: 'Revenue', color: '#6B7280' }, A5: { v: '=SUM(Sales!G:G)', format: 'currency0', bold: true, size: 20 }, C4: { v: 'Orders', color: '#6B7280' }, C5: { v: '=COUNTA(Sales!A:A)-1', format: 'integer', bold: true, size: 20 },
    E4: { v: 'Units', color: '#6B7280' }, E5: { v: '=SUM(Sales!E:E)', format: 'integer', bold: true, size: 20 }, G4: { v: 'Average order', color: '#6B7280' }, G5: { v: '=IF(C5=0,0,A5/C5)', format: 'currency', bold: true, size: 20 },
    A8: { v: 'Month', bold: true }, B8: { v: 'Revenue', bold: true }, D8: { v: 'Region', bold: true }, E8: { v: 'Revenue', bold: true }, F8: { v: 'Share', bold: true }, H8: { v: 'Product', bold: true }, I8: { v: 'Revenue', bold: true }, J8: { v: 'Units', bold: true } };
  MONTHS.forEach((m, i) => { cells[`A${9 + i}`] = m; cells[`B${9 + i}`] = { v: `=SUMIFS(Sales!G:G,Sales!H:H,${i + 1})`, format: 'currency0' }; });
  regions.forEach((r, i) => { cells[`D${9 + i}`] = r; cells[`E${9 + i}`] = { v: `=SUMIFS(Sales!G:G,Sales!B:B,D${9 + i})`, format: 'currency0' }; cells[`F${9 + i}`] = { v: `=IF($A$5=0,0,E${9 + i}/$A$5)`, format: 'percent' }; });
  products.forEach((p, i) => { cells[`H${9 + i}`] = p; cells[`I${9 + i}`] = { v: `=SUMIFS(Sales!G:G,Sales!D:D,H${9 + i})`, format: 'currency0' }; cells[`J${9 + i}`] = { v: `=SUMIFS(Sales!E:E,Sales!D:D,H${9 + i})`, format: 'integer' }; });
  return { title: 'Sales dashboard', sheets: [
    { name: 'Dashboard', cells, gridlines: false, widths: { A: 13, B: 14, C: 13, D: 13, E: 14, F: 10, G: 16, H: 13, I: 14, J: 10 },
      styles: [{ range: 'A8:B8', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'D8:F8', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'H8:J8', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'A4:H5', fill: '#F3F6FA' }],
      conditional: [{ range: 'B9:B20', rule: 'dataBar', fill: '#63A0E8' }, { range: 'E9:E12', rule: 'colorScale', colors: ['#FFFFFF', '#63BE7B'] }],
      charts: [{ type: 'column', title: 'Revenue by month', categories: 'A9:A20', series: [{ name: 'Revenue', values: 'B9:B20' }], anchor: 'A22', width: 560, height: 300 }, { type: 'pie', title: 'Revenue by region', categories: 'D9:D12', series: [{ values: 'E9:E12' }], anchor: 'H13', width: 420, height: 280 }, { type: 'bar', title: 'Revenue by product', categories: 'H9:H11', series: [{ name: 'Revenue', values: 'I9:I11' }], anchor: 'H28', width: 420, height: 240 }] },
    { name: 'Sales', columns: [{ header: 'Date', format: 'date', width: 13 }, { header: 'Region', width: 11 }, { header: 'Sales rep', width: 12 }, { header: 'Product', width: 11 }, { header: 'Units', format: 'integer', width: 8 }, { header: 'Unit price', format: 'currency', width: 11 }, { header: 'Revenue', format: 'currency', width: 13, formula: '=E{r}*F{r}' }, { header: 'Month no.', format: 'plain', width: 10, formula: '=MONTH(A{r})' }],
      rows, freeze: 'A2', filter: true, banded: true, validation: [{ range: 'B2:B5000', list: regions }, { range: 'D2:D5000', list: products }] },
  ] };
}

function invoice(theme) {
  const co = theme?.company || 'Your company name';
  const items = [['Design work', 12, 85], ['Development', 30, 95], ['Hosting (12 months)', 1, 240], ['', null, null], ['', null, null], ['', null, null]];
  const cells = { A1: { v: co, bold: true, size: 18 }, A2: theme?.address || 'Street, city, postcode', A3: [theme?.email, theme?.phone].filter(Boolean).join(' · ') || 'email@example.com · +00 000 000',
    E1: { v: 'INVOICE', bold: true, size: 22, align: 'right' }, D3: { v: 'Invoice no.', bold: true }, E3: 'INV-0001', D4: { v: 'Date', bold: true }, E4: { v: new Date().toISOString().slice(0, 10), format: 'date' }, D5: { v: 'Due', bold: true }, E5: { v: '=E4+30', format: 'date' },
    A6: { v: 'Bill to', bold: true }, A7: 'Client name', A8: 'Client address',
    A10: { v: 'Description', bold: true }, B10: { v: 'Qty', bold: true }, C10: { v: 'Unit price', bold: true }, D10: { v: 'Tax', bold: true }, E10: { v: 'Amount', bold: true } };
  items.forEach(([d, qn, p], i) => { const r = 11 + i; cells[`A${r}`] = d || null; cells[`B${r}`] = qn; cells[`C${r}`] = p == null ? null : { v: p, format: 'currency' }; cells[`D${r}`] = d ? { v: '=$E$20', format: 'percent0' } : null; cells[`E${r}`] = { v: `=IF(B${r}="","",B${r}*C${r})`, format: 'currency' }; });
  Object.assign(cells, { D18: 'Subtotal', E18: { v: '=SUM(E11:E16)', format: 'currency' }, D19: 'Tax', E19: { v: '=E18*E20', format: 'currency' }, D20: { v: 'Tax rate', color: '#6B7280' }, E20: { v: 0.2, format: 'percent0', color: '#0000FF' },
    D21: { v: 'Total due', bold: true, size: 13 }, E21: { v: '=E18+E19', format: 'currency', bold: true, size: 13 }, A23: { v: 'Payment details', bold: true }, A24: 'Bank: …   Account: …   Reference: invoice number', A26: { v: 'Thank you for your business.', italic: true } });
  for (const k of Object.keys(cells)) if (cells[k] == null) delete cells[k];
  return { title: 'Invoice', sheets: [{ name: 'Invoice', cells, gridlines: false, widths: { A: 38, B: 8, C: 13, D: 13, E: 15 }, styles: [{ range: 'A10:E10', fill: '#1F3A5F', color: '#FFFFFF' }, { range: 'A11:E16', border: 'bottom' }, { range: 'D21:E21', border: 'top', fill: '#E3E8EF' }] }] };
}

export const TEMPLATES = [
  { id: 'budget', label: 'Monthly budget', sub: 'Income, spending and savings for the year', build: budget },
  { id: 'tracker', label: 'Project tracker', sub: 'Tasks, owners, dates and status', build: tracker },
  { id: 'model', label: 'Financial model', sub: 'Five-year profit, loss and cash forecast', build: financialModel },
  { id: 'dashboard', label: 'Sales dashboard', sub: 'KPIs and charts from a sales list', build: dashboard },
  { id: 'invoice', label: 'Invoice', sub: 'Line items, tax and total', build: invoice },
];
