import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES: ReadonlySet<string> = new Set([
  "/login",
  "/register",
  "/forgot-password",
]);

// @supabase/ssr stores the session under `sb-<project-ref>-auth-token` as a
// JSON object that includes `expires_at` (unix seconds).
function authTokenExpiry(request: NextRequest): number | null {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token")) {
      try {
        const parsed = JSON.parse(cookie.value);
        return typeof parsed.expires_at === "number" ? parsed.expires_at : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function updateSession(request: NextRequest) {
  const url = request.nextUrl.clone();

  const isAuthRoute = AUTH_ROUTES.has(url.pathname);
  const isPublicPage =
    isAuthRoute ||
    url.pathname === "/account-banned" ||
    url.pathname === "/auth/confirm" ||
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/icons") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js" ||
    url.pathname === "/favicon.ico";

  // Guests have no session cookie — redirect without any Supabase call.
  const expiresAt = authTokenExpiry(request);
  const authenticated = expiresAt !== null && expiresAt - 30 > Math.floor(Date.now() / 1000);

  if (!authenticated && expiresAt === null) {
    if (!isPublicPage) {
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // Fresh access token: the JWT is still valid, so skip the Auth round-trip
  // entirely. getSessionUser re-validates profile state against the DB and
  // refreshes nearby expiry; PostgREST still verifies the JWT signature on
  // every data read.
  if (authenticated) {
    if (isAuthRoute) {
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Single Auth round-trip per authenticated request: validates the token and
  // refreshes it before Server Components read it. Profile-based guards (ban /
  // must-change-password) are enforced in getSessionUser instead, so guests pay
  // zero network cost and authenticated navigations pay exactly one Auth call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!isAuthRoute) {
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isAuthRoute) {
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}