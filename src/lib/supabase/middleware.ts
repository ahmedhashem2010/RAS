import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
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

  // Refresh session if expired — required for Server Components.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();

  const isAuthRoute =
    url.pathname === "/login" ||
    url.pathname === "/register" ||
    url.pathname === "/forgot-password";

  const isBannedPage = url.pathname === "/account-banned";

  const isPublicAsset =
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/icons") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js" ||
    url.pathname === "/favicon.ico";

  // Profile status is the single source of truth for bans. The lookup is done
  // only when a session exists, and only on the PK, so it stays cheap.
  let banned = false;
  let mustChangePassword = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    banned = profile?.status === "banned";
    mustChangePassword = profile?.must_change_password === true;
  }

  // A banned user is confined to the suspension notice — even on auth routes —
  // and cannot reach any protected page.
  if (user && banned && !isBannedPage && !isPublicAsset && url.pathname !== "/auth/confirm") {
    url.pathname = "/account-banned";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Leaders bootstrapped with a temporary password must set a personal
  // password before using the system.
  const isChangePasswordPage =
    url.pathname === "/update-password" || url.pathname === "/logout";
  if (
    user &&
    !banned &&
    mustChangePassword &&
    !isChangePasswordPage &&
    !isPublicAsset &&
    url.pathname !== "/auth/confirm"
  ) {
    url.pathname = "/update-password";
    url.search = "?required=1";
    return NextResponse.redirect(url);
  }

  if (!user && !isAuthRoute && !isPublicAsset && !isBannedPage && url.pathname !== "/auth/confirm") {
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && !banned && isAuthRoute) {
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
