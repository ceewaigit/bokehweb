import { NextResponse } from "next/server";

const MAILERLITE_BASE_URL = "https://connect.mailerlite.com/api";
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map<string, { count: number; ts: number }>();

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request: Request) {
  const apiKey = process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_GROUP_ID;
  const contentType = request.headers.get("content-type") || "";
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!apiKey) {
    return NextResponse.json(
      { error: "MailerLite API key is not configured." },
      { status: 500 }
    );
  }

  if (origin && host && !origin.includes(host)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  if (!contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Unsupported content type." },
      { status: 415 }
    );
  }

  let body: { email?: string; company?: string } | null = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const email = body?.email?.trim().toLowerCase() ?? "";
  const company = body?.company?.trim() ?? "";

  if (company) {
    return NextResponse.json({ ok: true });
  }

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const now = Date.now();
  const ipHeader =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ip = ipHeader.split(",")[0]?.trim() || "unknown";
  const entry = rateLimitStore.get(ip);
  const withinWindow = entry && now - entry.ts < RATE_LIMIT_WINDOW_MS;

  if (withinWindow && entry.count >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  rateLimitStore.set(ip, {
    count: withinWindow ? entry!.count + 1 : 1,
    ts: withinWindow ? entry!.ts : now,
  });

  const doubleOptIn = process.env.MAILERLITE_DOUBLE_OPT_IN === "true";

  const payload: {
    email: string;
    groups?: string[];
    status?: "active" | "unconfirmed";
  } = {
    email,
    status: doubleOptIn ? "unconfirmed" : "active",
  };

  if (groupId) {
    payload.groups = [groupId];
  }

  try {
    const response = await fetch(`${MAILERLITE_BASE_URL}/subscribers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to subscribe at the moment." },
        { status: response.status }
      );
    }

    return NextResponse.json({ ok: true, double_opt_in: doubleOptIn });
  } catch (error) {
    return NextResponse.json(
      { error: "MailerLite request failed. Please try again." },
      { status: 502 }
    );
  }
}
