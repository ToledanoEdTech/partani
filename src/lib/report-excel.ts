import * as ExcelJSNamespace from 'exceljs';
import type {
  Alignment,
  Borders,
  CellValue,
  ConditionalFormattingRule,
  Fill,
  Font,
  Style,
  Workbook,
  Worksheet,
} from 'exceljs';
import type { ReportExportModel, TeacherExportRow } from './report-export-model';
import { complianceTone } from './report-export-model';

type ExcelJSModule = typeof import('exceljs');

/** CJS and the browser bundle expose Workbook either as a named export or on the default object. */
function loadExcelJS(): ExcelJSModule {
  const ns = ExcelJSNamespace as ExcelJSModule & { default?: ExcelJSModule };
  if (typeof ns.Workbook === 'function') return ns;
  if (ns.default && typeof ns.default.Workbook === 'function') return ns.default;
  throw new Error('ExcelJS לא נטען');
}

const INK = 'FF111827';
const WHITE = 'FFFFFFFF';
const MUTED = 'FF64748B';
const SLATE_BG = 'FFF8FAFC';
const CARD_BG = 'FFF8FAFC';
const HEADER_BG = 'FF1E293B';
const LINE = 'FFE2E8F0';
const AMBER = 'FFF59E0B';
const GREEN_BG = 'FFDCFCE7';
const GREEN_FG = 'FF166534';
const RED_BG = 'FFFEE2E2';
const RED_FG = 'FFB91C1C';
const AMBER_FG = 'FFB45309';
const INDIGO = 'FF4338CA';
const FONT = 'Arial';

const COLS = 8;

type Tone = 'good' | 'ok' | 'bad';

const TONE_FG: Record<Tone, string> = {
  good: GREEN_FG,
  ok: AMBER_FG,
  bad: RED_FG,
};

function solid(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function font(size: number, bold: boolean, color: string): Partial<Font> {
  return { name: FONT, size, bold, color: { argb: color } };
}

const thinBorder: Partial<Borders> = {
  top: { style: 'thin', color: { argb: LINE } },
  left: { style: 'thin', color: { argb: LINE } },
  bottom: { style: 'thin', color: { argb: LINE } },
  right: { style: 'thin', color: { argb: LINE } },
};

function rtlText(horizontal: 'right' | 'center' = 'right'): Partial<Alignment> {
  return { horizontal, vertical: 'middle', readingOrder: 'rtl', wrapText: true };
}

function styleRange(
  sheet: Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  patch: Partial<Style> & { value?: CellValue },
) {
  for (let col = startCol; col <= endCol; col++) {
    const cell = sheet.getCell(row, col);
    if (patch.font) cell.font = patch.font;
    if (patch.fill) cell.fill = patch.fill;
    if (patch.alignment) cell.alignment = patch.alignment;
    if (patch.border) cell.border = patch.border;
    if (patch.numFmt) cell.numFmt = patch.numFmt;
  }
  if (patch.value !== undefined) sheet.getCell(row, startCol).value = patch.value;
}

function writeCard(
  sheet: Worksheet,
  row: number,
  startCol: number,
  label: string,
  value: CellValue,
  valueColor: string,
) {
  const endCol = startCol + 1;
  sheet.mergeCells(row, startCol, row, endCol);
  sheet.mergeCells(row + 1, startCol, row + 1, endCol);
  styleRange(sheet, row, startCol, endCol, {
    value: label,
    font: font(9, true, MUTED),
    fill: solid(CARD_BG),
    alignment: rtlText(),
    border: thinBorder,
  });
  styleRange(sheet, row + 1, startCol, endCol, {
    value,
    font: font(22, true, valueColor),
    fill: solid(WHITE),
    alignment: rtlText(),
    border: thinBorder,
  });
  sheet.getRow(row).height = 18;
  sheet.getRow(row + 1).height = 34;
}

function teacherDisplayName(row: TeacherExportRow): string {
  return row.active ? row.name : `${row.name} (לא פעיל)`;
}

function applyDataBar(sheet: Worksheet, col: number, startRow: number, endRow: number) {
  if (endRow < startRow) return;
  const letter = sheet.getColumn(col).letter;
  sheet.addConditionalFormatting({
    ref: `${letter}${startRow}:${letter}${endRow}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        gradient: true,
        showValue: true,
        direction: 'rightToLeft',
        cfvo: [
          { type: 'num', value: 0 },
          { type: 'num', value: 100 },
        ],
        color: { argb: 'FF6366F1' },
      } as ConditionalFormattingRule,
    ],
  });
}

function writeTeacherTable(
  sheet: Worksheet,
  model: ReportExportModel,
  startRow: number,
  options: { headerRowIsFrozen: boolean },
): number {
  const compliance = model.teacherTableMode === 'compliance';
  const headers = compliance
    ? ['מורה', 'צפויים', 'דווחו', 'התקיימו', 'בוטלו', 'חסר דיווח', 'אחוז היענות']
    : ['מורה', 'דיווחים', 'התקיימו', 'בוטלו'];

  headers.forEach((header, index) => {
    const cell = sheet.getCell(startRow, index + 1);
    cell.value = header;
    cell.font = font(11, true, WHITE);
    cell.fill = solid(HEADER_BG);
    cell.alignment = rtlText(index === 0 ? 'right' : 'center');
    cell.border = thinBorder;
  });
  sheet.getRow(startRow).height = 22;

  model.teachers.forEach((teacher, index) => {
    const rowNumber = startRow + 1 + index;
    const zebra = index % 2 === 1;
    const values: CellValue[] = compliance
      ? [
          teacherDisplayName(teacher),
          teacher.expected ?? 0,
          teacher.reported ?? 0,
          teacher.completed,
          teacher.missed,
          teacher.unreported ?? 0,
          teacher.compliancePct,
        ]
      : [teacherDisplayName(teacher), teacher.filteredCount, teacher.completed, teacher.missed];

    values.forEach((value, colIndex) => {
      const cell = sheet.getCell(rowNumber, colIndex + 1);
      const isPct = compliance && colIndex === headers.length - 1;
      const isGap = compliance && colIndex === 5 && typeof value === 'number' && value > 0;
      cell.value = isPct && value == null ? '—' : value;
      const valueColor = isGap
        ? RED_FG
        : isPct && typeof value === 'number'
          ? TONE_FG[complianceTone(value)]
          : INK;
      cell.font = font(11, colIndex === 0 || isPct || isGap, valueColor);
      cell.fill = solid(isGap ? RED_BG : !isPct && zebra ? SLATE_BG : WHITE);
      cell.alignment = rtlText(colIndex === 0 ? 'right' : 'center');
      cell.border = thinBorder;
      if (isPct && typeof value === 'number') cell.numFmt = '0"%"';
    });
    sheet.getRow(rowNumber).height = 20;
  });

  const lastDataRow = startRow + Math.max(model.teachers.length, 1);
  if (model.teachers.length === 0) {
    sheet.mergeCells(startRow + 1, 1, startRow + 1, headers.length);
    const empty = sheet.getCell(startRow + 1, 1);
    empty.value = 'אין מורים להצגה בסינון הזה';
    empty.font = font(11, false, MUTED);
    empty.alignment = rtlText();
    sheet.getRow(startRow + 1).height = 22;
  }

  if (compliance && model.teachers.some((t) => t.compliancePct != null)) {
    const first = startRow + 1;
    const last = startRow + model.teachers.length;
    applyDataBar(sheet, headers.length, first, last);
  }

  if (options.headerRowIsFrozen) {
    sheet.views = [{
      rightToLeft: true,
      state: 'frozen',
      ySplit: 1,
      activeCell: 'A2',
      showGridLines: false,
    }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(lastDataRow, 1), column: headers.length },
    };
    sheet.pageSetup.printTitlesRow = '1:1';
  }

  return startRow + Math.max(model.teachers.length, 1);
}

const GAP_HEADERS = ['מורה', 'שיעורים שלא הוזנו', 'צפויים', 'דווחו', 'התקיימו', 'בוטלו', 'אחוז היענות'];

function writeGapTeacherTable(sheet: Worksheet, rows: TeacherExportRow[], startRow: number): number {
  GAP_HEADERS.forEach((header, index) => {
    const cell = sheet.getCell(startRow, index + 1);
    cell.value = header;
    cell.font = font(11, true, WHITE);
    cell.fill = solid(index === 1 ? 'FF991B1B' : HEADER_BG);
    cell.alignment = rtlText(index === 0 ? 'right' : 'center');
    cell.border = thinBorder;
  });
  sheet.getRow(startRow).height = 22;

  if (rows.length === 0) {
    sheet.mergeCells(startRow + 1, 1, startRow + 1, GAP_HEADERS.length);
    const empty = sheet.getCell(startRow + 1, 1);
    empty.value = 'כל השיעורים שהיו אמורים להתקיים דווחו';
    empty.font = font(11, true, GREEN_FG);
    empty.fill = solid(GREEN_BG);
    empty.alignment = rtlText();
    empty.border = thinBorder;
    sheet.getRow(startRow + 1).height = 22;
    return startRow + 1;
  }

  rows.forEach((teacher, index) => {
    const rowNumber = startRow + 1 + index;
    const zebra = index % 2 === 1;
    const values: CellValue[] = [
      teacherDisplayName(teacher),
      teacher.unreported ?? 0,
      teacher.expected ?? 0,
      teacher.reported ?? 0,
      teacher.completed,
      teacher.missed,
      teacher.compliancePct,
    ];
    values.forEach((value, colIndex) => {
      const cell = sheet.getCell(rowNumber, colIndex + 1);
      const isGap = colIndex === 1;
      const isPct = colIndex === values.length - 1;
      cell.value = isPct && value == null ? '—' : value;
      cell.font = font(
        11,
        colIndex === 0 || isGap || isPct,
        isGap ? RED_FG : isPct && typeof value === 'number' ? TONE_FG[complianceTone(value)] : INK,
      );
      cell.fill = solid(isGap ? RED_BG : zebra ? SLATE_BG : WHITE);
      cell.alignment = rtlText(colIndex === 0 ? 'right' : 'center');
      cell.border = thinBorder;
      if (isPct && typeof value === 'number') cell.numFmt = '0"%"';
    });
    sheet.getRow(rowNumber).height = 20;
  });

  return startRow + rows.length;
}

function writeSummarySheet(workbook: Workbook, model: ReportExportModel) {
  const sheet = workbook.addWorksheet('סיכום', {
    views: [{ rightToLeft: true, showGridLines: false, state: 'normal' }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
    },
  });

  for (let col = 1; col <= COLS; col++) sheet.getColumn(col).width = col === 1 ? 24 : 16;

  sheet.mergeCells(1, 1, 1, COLS);
  styleRange(sheet, 1, 1, COLS, {
    value: model.title,
    font: font(22, true, WHITE),
    fill: solid(HEADER_BG),
    alignment: rtlText(),
    border: { bottom: { style: 'medium', color: { argb: AMBER } } },
  });
  sheet.getRow(1).height = 36;

  sheet.mergeCells(2, 1, 2, COLS);
  styleRange(sheet, 2, 1, COLS, {
    value: `${model.organization}   ·   הופק ${model.generatedOnLabel}`,
    font: font(11, false, MUTED),
    fill: solid(WHITE),
    alignment: rtlText(),
  });
  sheet.getRow(2).height = 20;

  sheet.mergeCells(4, 1, 4, COLS);
  styleRange(sheet, 4, 1, COLS, {
    value: 'סינון פעיל',
    font: font(12, true, INK),
    alignment: rtlText(),
  });

  const filterLine = model.filters.map((f) => `${f.label}: ${f.value}`).join('    ·    ');
  sheet.mergeCells(5, 1, 5, COLS);
  styleRange(sheet, 5, 1, COLS, {
    value: filterLine,
    font: font(11, false, INK),
    fill: solid(SLATE_BG),
    alignment: rtlText(),
    border: thinBorder,
  });
  sheet.getRow(5).height = 32;

  sheet.mergeCells(7, 1, 7, COLS);
  styleRange(sheet, 7, 1, COLS, {
    value: 'דיווחים בסינון',
    font: font(12, true, INK),
    alignment: rtlText(),
  });

  writeCard(sheet, 8, 1, 'דיווחים', model.filteredCount, INK);
  writeCard(sheet, 8, 3, 'התקיימו', model.completedCount, GREEN_FG);
  writeCard(sheet, 8, 5, 'בוטלו', model.missedCount, RED_FG);

  let nextRow = 11;
  if (model.analytics) {
    sheet.mergeCells(nextRow, 1, nextRow, COLS);
    styleRange(sheet, nextRow, 1, COLS, {
      value: `היענות לפי מערכת השעות  ·  ${model.analytics.rangeLabel}`,
      font: font(12, true, INK),
      alignment: rtlText(),
    });
    nextRow += 1;
    sheet.mergeCells(nextRow, 1, nextRow, COLS);
    styleRange(sheet, nextRow, 1, COLS, {
      value: model.analytics.note,
      font: font(9, false, MUTED),
      alignment: { ...rtlText(), vertical: 'top' },
    });
    sheet.getRow(nextRow).height = 32;
    nextRow += 1;

    const pctColor = TONE_FG[complianceTone(model.analytics.compliancePct)];
    writeCard(sheet, nextRow, 1, 'היו אמורים להתקיים', model.analytics.expected, INK);
    writeCard(sheet, nextRow, 3, 'דווחו', model.analytics.reported, INDIGO);
    writeCard(sheet, nextRow, 5, 'חסר דיווח', model.analytics.unreported, RED_FG);
    writeCard(sheet, nextRow, 7, 'אחוז היענות', `${model.analytics.compliancePct}%`, pctColor);
    nextRow += 3;

    const gapCount = model.missingTeachers.length;
    const gapTitle = gapCount === 0
      ? 'מורים שלא הזינו · אין חוסר דיווח בטווח'
      : `מורים שלא הזינו · ${gapCount} מורים · ${model.analytics.unreported} שיעורים`;
    sheet.mergeCells(nextRow, 1, nextRow, COLS);
    styleRange(sheet, nextRow, 1, COLS, {
      value: gapTitle,
      font: font(12, true, gapCount === 0 ? GREEN_FG : RED_FG),
      alignment: rtlText(),
    });
    nextRow += 1;
    nextRow = writeGapTeacherTable(sheet, model.missingTeachers, nextRow) + 2;
  }

  sheet.mergeCells(nextRow, 1, nextRow, COLS);
  styleRange(sheet, nextRow, 1, COLS, {
    value: 'לפי מורה',
    font: font(12, true, INK),
    alignment: rtlText(),
  });
  const lastRow = writeTeacherTable(sheet, model, nextRow + 1, { headerRowIsFrozen: false });
  sheet.pageSetup.printArea = `A1:H${lastRow}`;
}

function writeMissingTeacherSheet(workbook: Workbook, model: ReportExportModel) {
  const sheet = workbook.addWorksheet('חסר דיווח', {
    views: [{ rightToLeft: true, showGridLines: false, state: 'normal' }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:2',
    },
  });
  [28, 22, 14, 14, 14, 14, 18].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.mergeCells(1, 1, 1, GAP_HEADERS.length);
  styleRange(sheet, 1, 1, GAP_HEADERS.length, {
    value: `מורים שלא הזינו שיעורים  ·  ${model.analytics.rangeLabel}  ·  ${model.missingTeachers.length} מורים  ·  ${model.analytics.unreported} שיעורים`,
    font: font(14, true, WHITE),
    fill: solid(model.missingTeachers.length === 0 ? 'FF166534' : 'FF991B1B'),
    alignment: rtlText(),
  });
  sheet.getRow(1).height = 28;
  const lastRow = writeGapTeacherTable(sheet, model.missingTeachers, 2);
  sheet.views = [{
    rightToLeft: true,
    state: 'frozen',
    ySplit: 2,
    activeCell: 'A3',
    showGridLines: false,
  }];
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: Math.max(lastRow, 2), column: GAP_HEADERS.length },
  };
}

function writeMissingLessonSheet(workbook: Workbook, model: ReportExportModel) {
  const headers = ['תאריך', 'מורה', 'יום', 'שעה', 'מקצוע', 'תלמידים'];
  const sheet = workbook.addWorksheet('שיעורים חסרים', {
    views: [{ rightToLeft: true, showGridLines: false, state: 'normal' }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:2',
    },
  });
  [16, 24, 14, 12, 18, 36].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.mergeCells(1, 1, 1, headers.length);
  styleRange(sheet, 1, 1, headers.length, {
    value: `שיעורים שלא הוזנו  ·  ${model.analytics.rangeLabel}  ·  ${model.missingLessons.length}`,
    font: font(14, true, WHITE),
    fill: solid(model.missingLessons.length === 0 ? 'FF166534' : 'FF991B1B'),
    alignment: rtlText(),
  });
  sheet.getRow(1).height = 28;
  headers.forEach((header, index) => {
    const cell = sheet.getCell(2, index + 1);
    cell.value = header;
    cell.font = font(11, true, WHITE);
    cell.fill = solid(HEADER_BG);
    cell.alignment = rtlText(index === 0 || index === 1 ? 'right' : 'center');
    cell.border = thinBorder;
  });
  sheet.getRow(2).height = 22;

  model.missingLessons.forEach((lesson, index) => {
    const rowNumber = index + 3;
    const zebra = index % 2 === 1;
    const values = [lesson.dateLabel, lesson.teacherName, lesson.day, lesson.hour, lesson.subject, lesson.studentsLabel];
    values.forEach((value, colIndex) => {
      const cell = sheet.getCell(rowNumber, colIndex + 1);
      cell.value = value;
      cell.font = font(11, colIndex === 1, INK);
      cell.fill = solid(zebra ? SLATE_BG : WHITE);
      cell.alignment = rtlText(colIndex <= 1 || colIndex >= 4 ? 'right' : 'center');
      cell.border = thinBorder;
    });
    sheet.getRow(rowNumber).height = 20;
  });

  if (model.missingLessons.length === 0) {
    sheet.mergeCells(3, 1, 3, headers.length);
    const empty = sheet.getCell(3, 1);
    empty.value = 'אין שיעורים חסרים בטווח';
    empty.font = font(11, true, GREEN_FG);
    empty.fill = solid(GREEN_BG);
    empty.alignment = rtlText();
    empty.border = thinBorder;
  }

  const lastRow = Math.max(model.missingLessons.length + 2, 3);
  sheet.views = [{
    rightToLeft: true,
    state: 'frozen',
    ySplit: 2,
    activeCell: 'A3',
    showGridLines: false,
  }];
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: lastRow, column: headers.length },
  };
}

function writeTeacherSheet(workbook: Workbook, model: ReportExportModel) {
  const sheet = workbook.addWorksheet('לפי מורה', {
    views: [{ rightToLeft: true, state: 'normal', showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const widths = model.teacherTableMode === 'compliance'
    ? [28, 14, 14, 14, 14, 16, 18]
    : [28, 14, 14, 14];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  writeTeacherTable(sheet, model, 1, { headerRowIsFrozen: true });
}

function detailRowHeight(students: string, text: string): number {
  const linesOf = (value: string, chars: number) =>
    value.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / chars)), 0);
  const lines = Math.max(linesOf(students, 28), linesOf(text || ' ', 40));
  return Math.min(96, Math.max(20, lines * 15));
}

function writeReportsSheet(workbook: Workbook, model: ReportExportModel) {
  const sheet = workbook.addWorksheet('דיווחים', {
    views: [{
      rightToLeft: true,
      state: 'frozen',
      ySplit: 1,
      activeCell: 'A2',
      showGridLines: false,
    }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
    },
  });

  const headers = ['תאריך', 'מורה', 'תלמידים', 'מקצוע', 'סטטוס', 'פירוט'];
  const widths = [16, 22, 36, 18, 14, 55];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  headers.forEach((header, index) => {
    const cell = sheet.getCell(1, index + 1);
    cell.value = header;
    cell.font = font(11, true, WHITE);
    cell.fill = solid(HEADER_BG);
    cell.alignment = rtlText(index === 4 ? 'center' : 'right');
    cell.border = thinBorder;
  });
  sheet.getRow(1).height = 22;

  model.reports.forEach((report, index) => {
    const rowNumber = index + 2;
    const zebra = index % 2 === 1;
    const values = [
      report.dateLabel,
      report.teacherName,
      report.studentsLabel,
      report.subject,
      report.statusLabel,
      report.text,
    ];
    values.forEach((value, colIndex) => {
      const cell = sheet.getCell(rowNumber, colIndex + 1);
      cell.value = value;
      const isStatus = colIndex === 4;
      cell.font = font(11, isStatus || colIndex === 1, isStatus ? (report.status === 'completed' ? GREEN_FG : RED_FG) : INK);
      cell.fill = solid(
        isStatus
          ? (report.status === 'completed' ? GREEN_BG : RED_BG)
          : (zebra ? SLATE_BG : WHITE),
      );
      cell.alignment = {
        ...rtlText(isStatus ? 'center' : 'right'),
        vertical: colIndex === 5 ? 'top' : 'middle',
      };
      cell.border = thinBorder;
    });
    sheet.getRow(rowNumber).height = detailRowHeight(report.studentsLabel, report.text);
  });

  if (model.reports.length === 0) {
    sheet.mergeCells(2, 1, 2, headers.length);
    const empty = sheet.getCell(2, 1);
    empty.value = 'אין דיווחים בסינון הזה';
    empty.font = font(11, false, MUTED);
    empty.alignment = rtlText();
    sheet.getRow(2).height = 22;
  }

  const lastRow = Math.max(model.reports.length + 1, 2);
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: headers.length },
  };
}

export async function buildReportsWorkbook(model: ReportExportModel): Promise<Workbook> {
  const workbook = new (loadExcelJS()).Workbook();
  workbook.creator = model.title;
  workbook.created = new Date();
  workbook.title = model.title;
  writeSummarySheet(workbook, model);
  writeMissingTeacherSheet(workbook, model);
  writeMissingLessonSheet(workbook, model);
  writeTeacherSheet(workbook, model);
  writeReportsSheet(workbook, model);
  const summary = workbook.getWorksheet('סיכום');
  if (summary) {
    summary.views = [{
      ...(summary.views[0] ?? {}),
      rightToLeft: true,
      showGridLines: false,
      state: 'normal',
    }];
  }
  return workbook;
}

export async function downloadReportsWorkbook(model: ReportExportModel): Promise<void> {
  const workbook = await buildReportsWorkbook(model);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = model.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
