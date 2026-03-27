import PDFDocument from 'pdfkit';
import { Response } from 'express';

// ── Colour palette (matches Laktic dark theme) ────────────────────────────────
const BRAND_GREEN = '#22c55e';
const TEXT_DARK   = '#0a0a0a';
const TEXT_MID    = '#4b5563';
const TEXT_LIGHT  = '#9ca3af';
const RULE_COLOR  = '#e5e7eb';

// ── Helpers ───────────────────────────────────────────────────────────────────

function header(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  doc
    .rect(0, 0, doc.page.width, 80)
    .fill(TEXT_DARK);

  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('LAKTIC', 40, 22, { continued: false });

  doc
    .fillColor('#ffffff')
    .font('Helvetica')
    .fontSize(10)
    .text(`${title}`, 40, 46);

  doc.fillColor(TEXT_DARK).moveDown(0);
  doc.y = 100;

  doc
    .fillColor(TEXT_DARK)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(subtitle, 40, doc.y);

  doc
    .fillColor(TEXT_LIGHT)
    .font('Helvetica')
    .fontSize(9)
    .text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 40);

  doc.moveDown(0.8);
  rule(doc);
  doc.moveDown(0.8);
}

function rule(doc: PDFKit.PDFDocument) {
  doc
    .moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .strokeColor(RULE_COLOR)
    .lineWidth(0.5)
    .stroke();
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.5);
  doc
    .fillColor(BRAND_GREEN)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(text.toUpperCase(), 40, doc.y, { characterSpacing: 1 });
  doc.moveDown(0.3);
}

function row(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc
    .fillColor(TEXT_MID)
    .font('Helvetica')
    .fontSize(9)
    .text(label, 40, y, { width: 160 });
  doc
    .fillColor(TEXT_DARK)
    .font('Helvetica')
    .fontSize(9)
    .text(value, 210, y, { width: 320 });
  doc.moveDown(0.45);
}

// ── Athlete Season Report ─────────────────────────────────────────────────────

interface AthletePdfInput {
  athlete: { name: string; weekly_volume_miles: number | null; primary_events: string | null };
  season: {
    created_at: string;
    race_calendar: Array<{ name: string; date: string; is_goal_race?: boolean; distance?: string; goal_time?: string }>;
    season_plan: Array<{ week_number: number; week_start: string; workouts?: any[]; notes?: string }>;
  } | null;
  weeklySummaries: Array<{
    week_start: string;
    total_distance_miles: number;
    run_count: number;
    avg_pace_per_mile: string | null;
    compliance_pct: number | null;
  }>;
  attendance: { present_count: number; total_events: number; attendance_pct: number | null } | null;
  botName: string | null;
}

export function buildAthletePdf(res: Response, input: AthletePdfInput) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="laktic-season-report.pdf"`);
  doc.pipe(res);

  header(doc, 'Athlete Season Report', `${input.athlete.name} — Season Report`);

  // Athlete overview
  sectionTitle(doc, 'Athlete Profile');
  row(doc, 'Name', input.athlete.name);
  if (input.athlete.primary_events) row(doc, 'Events', input.athlete.primary_events);
  if (input.athlete.weekly_volume_miles) row(doc, 'Weekly volume', `${input.athlete.weekly_volume_miles} miles`);
  if (input.botName) row(doc, 'Coach bot', input.botName);
  if (input.season) row(doc, 'Season started', new Date(input.season.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

  // Attendance
  if (input.attendance && input.attendance.total_events > 0) {
    rule(doc); doc.moveDown(0.4);
    sectionTitle(doc, 'Attendance');
    row(doc, 'Events attended', `${input.attendance.present_count} / ${input.attendance.total_events}`);
    if (input.attendance.attendance_pct != null)
      row(doc, 'Attendance rate', `${input.attendance.attendance_pct}%`);
  }

  // Race calendar
  if (input.season && input.season.race_calendar.length > 0) {
    rule(doc); doc.moveDown(0.4);
    sectionTitle(doc, 'Race Calendar');
    for (const race of input.season.race_calendar) {
      const label = race.is_goal_race ? `${race.name} [Goal]` : race.name;
      const detail = [
        new Date(race.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        race.distance,
        race.goal_time ? `Goal: ${race.goal_time}` : null
      ].filter(Boolean).join(' · ');
      row(doc, label, detail);
    }
  }

  // Weekly training summary (last 12 weeks)
  if (input.weeklySummaries.length > 0) {
    rule(doc); doc.moveDown(0.4);
    sectionTitle(doc, 'Training Summary (Last 12 Weeks)');

    // Table header
    const colX = [40, 130, 215, 300, 385];
    const headers = ['Week', 'Distance', 'Runs', 'Avg Pace', 'Compliance'];
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MID);
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: 80, lineBreak: false }));
    doc.moveDown(0.5);
    rule(doc); doc.moveDown(0.3);

    for (const w of input.weeklySummaries) {
      const y = doc.y;
      const weekLabel = new Date(w.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const cells = [
        weekLabel,
        `${w.total_distance_miles.toFixed(1)} mi`,
        String(w.run_count),
        w.avg_pace_per_mile || '—',
        w.compliance_pct != null ? `${w.compliance_pct}%` : '—'
      ];
      doc.font('Helvetica').fontSize(8).fillColor(TEXT_DARK);
      cells.forEach((c, i) => doc.text(c, colX[i], y, { width: 80, lineBreak: false }));
      doc.moveDown(0.5);
    }
  }

  // Footer on every page
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(TEXT_LIGHT)
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Laktic Season Report · ${input.athlete.name} · Page ${i + 1} of ${pages.count}`,
        40, doc.page.height - 30, { align: 'center', width: doc.page.width - 80 }
      );
  }

  doc.end();
}

// ── Coach Team Attendance Report ──────────────────────────────────────────────

interface TeamPdfInput {
  teamName: string;
  events: Array<{ id: string; title: string; event_type: string; event_date: string }>;
  athletes: Array<{
    athlete_name: string;
    present_count: number;
    total_events: number;
    attendance_pct: number | null;
    records: Record<string, string>;
  }>;
  from: string | null;
  to: string | null;
}

export function buildTeamPdf(res: Response, input: TeamPdfInput) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="laktic-team-attendance.pdf"`);
  doc.pipe(res);

  const dateRange = [
    input.from ? new Date(input.from + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
    input.to   ? new Date(input.to   + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
  ].filter(Boolean).join(' – ');

  header(doc, 'Team Attendance Report', input.teamName);

  if (dateRange) {
    doc.fillColor(TEXT_MID).font('Helvetica').fontSize(9).text(`Period: ${dateRange}`, 40);
    doc.moveDown(0.5);
  }

  sectionTitle(doc, `Attendance Summary (${input.events.length} event${input.events.length !== 1 ? 's' : ''})`);

  // Per-athlete summary rows
  if (input.athletes.length === 0) {
    doc.fillColor(TEXT_LIGHT).font('Helvetica').fontSize(9).text('No athletes found.', 40);
  } else {
    const colX = [40, 230, 310, 390];
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MID);
    ['Athlete', 'Present / Total', 'Rate', 'Status'].forEach((h, i) =>
      doc.text(h, colX[i], doc.y, { width: 180, lineBreak: false })
    );
    doc.moveDown(0.5);
    rule(doc); doc.moveDown(0.3);

    for (const a of input.athletes) {
      const pct = a.attendance_pct ?? 0;
      const statusColor = pct >= 80 ? BRAND_GREEN : pct >= 60 ? '#f59e0b' : '#ef4444';
      const status = pct >= 80 ? 'Good' : pct >= 60 ? 'Fair' : 'Low';
      const y = doc.y;
      doc.font('Helvetica').fontSize(8).fillColor(TEXT_DARK)
        .text(a.athlete_name, colX[0], y, { width: 180, lineBreak: false });
      doc.text(`${a.present_count} / ${a.total_events}`, colX[1], y, { width: 70, lineBreak: false });
      doc.text(a.attendance_pct != null ? `${a.attendance_pct}%` : '—', colX[2], y, { width: 70, lineBreak: false });
      doc.fillColor(statusColor).text(status, colX[3], y, { width: 70, lineBreak: false });
      doc.moveDown(0.55);
    }
  }

  // Event list
  if (input.events.length > 0) {
    rule(doc); doc.moveDown(0.4);
    sectionTitle(doc, 'Events Included');
    for (const ev of input.events) {
      const d = new Date(ev.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      row(doc, d, `${ev.title} (${ev.event_type})`);
    }
  }

  // Footer
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(TEXT_LIGHT)
      .font('Helvetica')
      .fontSize(7)
      .text(
        `Laktic Team Report · ${input.teamName} · Page ${i + 1} of ${pages.count}`,
        40, doc.page.height - 30, { align: 'center', width: doc.page.width - 80 }
      );
  }

  doc.end();
}
