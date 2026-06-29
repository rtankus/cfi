import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import nodemailer from "npm:nodemailer@6";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_SMTP_KEY = Deno.env.get("BREVO_SMTP_KEY")!;
const FROM_EMAIL = "tankusraina@gmail.com";
const FROM_NAME = "Raina CFI";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "b01b66001@smtp-brevo.com",
    pass: BREVO_SMTP_KEY,
  },
});

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: {
    id: string;
    student_email: string;
    record_type: string;
    data: Record<string, unknown>;
    updated_at: string;
  };
  old_record: null | Record<string, unknown>;
}

interface DirectPayload {
  direct: true;
  record_type: string;
  student_email: string;
  data: Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const payload = await req.json();

  // Direct invocation from client (schedule / checklist notifications)
  if (payload.direct) {
    const { record_type, student_email, data } = payload as DirectPayload;
    if (!record_type || !student_email || student_email === "shared") {
      return new Response("ok", { headers: CORS });
    }
    const built = buildEmail(record_type, data);
    if (!built) return new Response("ok", { headers: CORS });
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: student_email,
      subject: built.subject,
      html: built.html,
    });
    console.log("Email sent (direct):", info.messageId);
    return new Response(JSON.stringify({ ok: true, messageId: info.messageId }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Webhook path — emails are now sent via direct client invocation above; skip here.
  return new Response("ok", { headers: CORS });
});

function buildEmail(
  type: string,
  data: Record<string, unknown>
): { subject: string; html: string } | null {
  if (type === "debrief") {
    const date = data.date ? fmtDate(String(data.date)) : null;
    const lesson = data.lesson ? String(data.lesson) : null;
    const rating = data.rating ? String(data.rating) : null;
    const wentWell = data.wentWell ? String(data.wentWell) : null;
    const needsWork = data.needsWork ? String(data.needsWork) : null;
    const nextTime = data.nextTime ? String(data.nextTime) : null;

    const detailRows = [
      date && `<tr><td style="color:#888;padding:4px 0;width:120px">Date</td><td style="padding:4px 0">${date}</td></tr>`,
      lesson && `<tr><td style="color:#888;padding:4px 0">Lesson</td><td style="padding:4px 0">${lesson}</td></tr>`,
      rating && `<tr><td style="color:#888;padding:4px 0">Rating</td><td style="padding:4px 0">${rating}</td></tr>`,
    ].filter(Boolean).join("");

    const sections = [
      wentWell && section("What went well", wentWell, "#22c55e"),
      needsWork && section("Needs work", needsWork, "#ef4444"),
      nextTime && section("Prep for next time", nextTime, "#3b82f6"),
    ].filter(Boolean).join("");

    return {
      subject: `New flight debrief${date ? ` — ${date}` : ""}`,
      html: layout(`
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Flight Debrief Posted</h2>
        <p style="margin:0 0 20px;color:#555">Your instructor has posted a new flight debrief.</p>
        ${detailRows ? `<table style="border-collapse:collapse;margin-bottom:20px;font-size:14px">${detailRows}</table>` : ""}
        ${sections}
      `),
    };
  }

  if (type === "invoice") {
    const invNum = data.invNum ? `#${data.invNum}` : null;
    const date = data.invDate ? fmtDate(String(data.invDate)) : null;
    const total = data.total != null ? `$${Number(data.total).toFixed(2)}` : null;

    const detailRows = [
      invNum && `<tr><td style="color:#888;padding:4px 0;width:120px">Invoice</td><td style="padding:4px 0">${invNum}</td></tr>`,
      date && `<tr><td style="color:#888;padding:4px 0">Date</td><td style="padding:4px 0">${date}</td></tr>`,
      total && `<tr><td style="color:#888;padding:4px 0;font-weight:600">Total</td><td style="padding:4px 0;font-weight:600">${total}</td></tr>`,
    ].filter(Boolean).join("");

    return {
      subject: `New invoice from your instructor${invNum ? ` ${invNum}` : ""}`,
      html: layout(`
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Invoice Posted</h2>
        <p style="margin:0 0 20px;color:#555">Your instructor has posted a new invoice.</p>
        ${detailRows ? `<table style="border-collapse:collapse;margin-bottom:20px;font-size:14px">${detailRows}</table>` : ""}
      `),
    };
  }

  if (type === "schedule") {
    const date = data.date ? fmtDate(String(data.date)) : null;
    const time = data.time ? fmt12(String(data.time)) : null;
    const topic = data.topic ? String(data.topic) : "Lesson";
    const aircraft = data.aircraft ? String(data.aircraft) : null;
    const notes = data.notes ? String(data.notes) : null;
    const lessonType = data.type === "ground" ? "Ground Lesson" : "Flight";

    const detailRows = [
      date && `<tr><td style="color:#888;padding:4px 0;width:120px">Date</td><td style="padding:4px 0">${date}</td></tr>`,
      time && `<tr><td style="color:#888;padding:4px 0">Time</td><td style="padding:4px 0">${time}</td></tr>`,
      `<tr><td style="color:#888;padding:4px 0">Type</td><td style="padding:4px 0">${lessonType}</td></tr>`,
      aircraft && `<tr><td style="color:#888;padding:4px 0">Aircraft</td><td style="padding:4px 0">${aircraft}</td></tr>`,
    ].filter(Boolean).join("");

    return {
      subject: `New lesson scheduled${date ? ` — ${date}` : ""}`,
      html: layout(`
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Lesson Scheduled: ${topic}</h2>
        <p style="margin:0 0 20px;color:#555">Your instructor has scheduled a new lesson for you.</p>
        ${detailRows ? `<table style="border-collapse:collapse;margin-bottom:20px;font-size:14px">${detailRows}</table>` : ""}
        ${notes ? section("Notes from your instructor", notes, "#3b82f6") : ""}
      `),
    };
  }

  if (type === "paid") {
    const invNum = data.invNum ? `#${data.invNum}` : null;
    const date = data.invDate ? fmtDate(String(data.invDate)) : null;
    const total = data.total != null ? `$${Number(data.total).toFixed(2)}` : null;

    const detailRows = [
      invNum && `<tr><td style="color:#888;padding:4px 0;width:120px">Invoice</td><td style="padding:4px 0">${invNum}</td></tr>`,
      date && `<tr><td style="color:#888;padding:4px 0">Date</td><td style="padding:4px 0">${date}</td></tr>`,
      total && `<tr><td style="color:#888;padding:4px 0;font-weight:600">Amount</td><td style="padding:4px 0;font-weight:600">${total}</td></tr>`,
    ].filter(Boolean).join("");

    return {
      subject: `Payment received — invoice${invNum ? ` ${invNum}` : ""} marked paid`,
      html: layout(`
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Payment Received</h2>
        <p style="margin:0 0 20px;color:#555">Your instructor has marked your invoice as paid. Thank you!</p>
        ${detailRows ? `<table style="border-collapse:collapse;margin-bottom:20px;font-size:14px">${detailRows}</table>` : ""}
      `),
    };
  }

  if (type === "checklist") {
    const text = data.text ? String(data.text) : "New task";
    const isFlightTask = data.listType === "flight";
    return {
      subject: isFlightTask ? "New prep task for your next lesson" : "New task from your instructor",
      html: layout(`
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">${isFlightTask ? "Prep for Next Lesson" : "New Assignment"}</h2>
        <p style="margin:0 0 20px;color:#555">${isFlightTask ? "Your instructor added a task to complete before your next lesson." : "Your instructor has added a new task for you."}</p>
        ${section("Task", text, "#3b82f6")}
      `),
    };
  }

  if (type === "checklist_done") {
    const text = data.text ? String(data.text) : "A task";
    const studentEmail = data.studentEmail ? String(data.studentEmail) : "Your student";
    return {
      subject: `Student completed a task`,
      html: layout(`
        <h2 style="margin:0 0 16px;font-size:18px;font-weight:600">Task Completed ✓</h2>
        <p style="margin:0 0 20px;color:#555">${studentEmail} marked a task as done.</p>
        ${section("Task", text, "#22c55e")}
      `),
    };
  }

  return null;
}

function fmtBody(text: string): string {
  return text.split("\n").map(line => {
    const t = line.trimStart();
    let out = (t.startsWith("* ") || t.startsWith("- ")) ? "• " + t.slice(2) : line;
    // Escape HTML
    out = out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Convert URLs to hyperlinks
    out = out.replace(/(https?:\/\/[^\s<>"&]+(?:&amp;[^\s<>"]*)*)/g,
      '<a href="$1" style="color:#3b82f6;word-break:break-all">$1</a>');
    return out;
  }).join("<br>");
}

function section(title: string, body: string, color: string): string {
  return `
    <div style="margin-bottom:16px;border-left:3px solid ${color};padding-left:12px">
      <div style="font-size:12px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${title}</div>
      <div style="font-size:14px;color:#333;line-height:1.5">${fmtBody(body)}</div>
    </div>`;
}

function layout(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <div style="background:#111;padding:20px 28px">
      <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:0.02em">✈️ CFI App</div>
    </div>
    <div style="padding:28px">
      ${body}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f0f0f0;font-size:12px;color:#aaa">
      You're receiving this because your instructor added a record for you.
    </div>
  </div>
</body>
</html>`;
}

function fmtDate(s: string): string {
  const d = new Date(s + (s.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
