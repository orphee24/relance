import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/env";
import { AUTH_PAGES, PROTECTED_PREFIXES } from "@/config/navigation";

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const config = supabaseConfig();

  // Sans configuration, les pages protégées affichent la page d'installation.
  if (!config) {
    if (matches(pathname, PROTECTED_PREFIXES) || matches(pathname, AUTH_PAGES)) {
      const url = request.nextUrl.clone();
      url.pathname = "/configuration";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Ne rien exécuter entre createServerClient et getUser() (rafraîchissement du jeton).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && matches(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    url.searchParams.set("next", pathname);
    return redirectWithCookies(url, response);
  }

  if (user && matches(pathname, AUTH_PAGES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/tableau-de-bord";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Conserve les cookies de session rafraîchis lors d'une redirection. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
