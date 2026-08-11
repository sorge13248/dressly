import { Controller, Get, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

interface HttpRequest {
  headers: Record<string, string | undefined>;
}

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
}

interface HttpResponse {
  cookie(name: string, value: string, options?: CookieOptions): void;
  clearCookie(name: string, options?: CookieOptions): void;
  redirect(statusOrUrl: number | string, maybeUrl?: string): void;
}

const COOKIE_ACCESS_TOKEN = 'dressly_at';
const COOKIE_ID_TOKEN = 'dressly_it';
const COOKIE_REFRESH_TOKEN = 'dressly_rt';
const COOKIE_STATE = 'dressly_oidc_state';
const COOKIE_VERIFIER = 'dressly_oidc_verifier';
const COOKIE_NONCE = 'dressly_oidc_nonce';

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!key) {
        return acc;
      }

      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function base64UrlEncode(input: Uint8Array) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomString(length = 48) {
  return base64UrlEncode(randomBytes(length));
}

async function codeChallenge(verifier: string) {
  const digest = createHash('sha256').update(verifier).digest();
  return base64UrlEncode(digest);
}

@Controller('auth')
export class AuthController {
  private metadataCache: { value: OidcMetadata; fetchedAt: number } | null = null;

  @Get('login')
  async login(@Res({ passthrough: true }) response: HttpResponse) {
    const metadata = await this.getMetadata();
    const config = this.getOidcConfigOrThrow();

    const state = randomString(24);
    const nonce = randomString(24);
    const verifier = randomString(64);
    const challenge = await codeChallenge(verifier);

    response.cookie(COOKIE_STATE, state, this.pkceCookieOptions());
    response.cookie(COOKIE_NONCE, nonce, this.pkceCookieOptions());
    response.cookie(COOKIE_VERIFIER, verifier, this.pkceCookieOptions());

    const authorize = new URL(metadata.authorization_endpoint);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('client_id', config.clientId);
    authorize.searchParams.set('redirect_uri', config.redirectUri);
    authorize.searchParams.set('scope', 'openid profile email');
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('nonce', nonce);
    authorize.searchParams.set('code_challenge', challenge);
    authorize.searchParams.set('code_challenge_method', 'S256');

    response.redirect(authorize.toString());
  }

  @Get('callback')
  async callback(
    @Req() request: HttpRequest,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res({ passthrough: true }) response: HttpResponse,
  ) {
    const cookies = parseCookieHeader(request.headers.cookie);
    const expectedState = cookies[COOKIE_STATE];
    const verifier = cookies[COOKIE_VERIFIER];

    if (!code || !state || !expectedState || !verifier || state !== expectedState) {
      throw new UnauthorizedException('Invalid OIDC callback state');
    }

    const metadata = await this.getMetadata();
    const config = this.getOidcConfigOrThrow();

    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        code_verifier: verifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException(`OIDC token exchange failed (${tokenResponse.status})`);
    }

    const tokens = (await tokenResponse.json()) as TokenResponse;
    if (!tokens.access_token) {
      throw new UnauthorizedException('OIDC token response is missing access_token');
    }

    this.clearPkceCookies(response);
    response.cookie(COOKIE_ACCESS_TOKEN, tokens.access_token, this.sessionCookieOptions(tokens.expires_in));

    if (tokens.id_token) {
      response.cookie(COOKIE_ID_TOKEN, tokens.id_token, this.sessionCookieOptions(tokens.expires_in));
    } else {
      response.clearCookie(COOKIE_ID_TOKEN, this.sessionCookieOptions());
    }

    if (tokens.refresh_token) {
      response.cookie(COOKIE_REFRESH_TOKEN, tokens.refresh_token, this.refreshCookieOptions());
    } else {
      response.clearCookie(COOKIE_REFRESH_TOKEN, this.refreshCookieOptions());
    }

    response.redirect(this.frontendRedirectUrl('/auth/callback?status=ok'));
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: HttpResponse) {
    this.clearPkceCookies(response);
    response.clearCookie(COOKIE_ACCESS_TOKEN, this.sessionCookieOptions());
    response.clearCookie(COOKIE_ID_TOKEN, this.sessionCookieOptions());
    response.clearCookie(COOKIE_REFRESH_TOKEN, this.refreshCookieOptions());
    return { loggedOut: true };
  }

  private getOidcConfigOrThrow() {
    const issuerUrl = (process.env.OIDC_ISSUER_URL ?? '').trim();
    const clientId = (process.env.OIDC_CLIENT_ID ?? '').trim();
    const redirectUri = (process.env.OIDC_REDIRECT_URI ?? '').trim();
    const clientSecret = (process.env.OIDC_CLIENT_SECRET ?? '').trim();

    if (!issuerUrl || !clientId || !redirectUri || !clientSecret) {
      throw new UnauthorizedException('OIDC config incomplete for confidential client');
    }

    return {
      issuerUrl,
      clientId,
      redirectUri,
      clientSecret,
    };
  }

  private async getMetadata() {
    const now = Date.now();
    if (this.metadataCache && now - this.metadataCache.fetchedAt < 5 * 60_000) {
      return this.metadataCache.value;
    }

    const { issuerUrl } = this.getOidcConfigOrThrow();
    const endpoint = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new UnauthorizedException(`Unable to read OIDC metadata (${response.status})`);
    }

    const metadata = (await response.json()) as OidcMetadata;
    this.metadataCache = {
      value: metadata,
      fetchedAt: now,
    };

    return metadata;
  }

  private frontendRedirectUrl(path: string) {
    const explicit = (process.env.OIDC_FRONTEND_REDIRECT_BASE_URL ?? '').trim();
    if (explicit) {
      return `${explicit.replace(/\/$/, '')}${path}`;
    }

    const firstCorsOrigin = (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .find(Boolean);

    if (firstCorsOrigin) {
      return `${firstCorsOrigin.replace(/\/$/, '')}${path}`;
    }

    return path;
  }

  private clearPkceCookies(response: HttpResponse) {
    const options = this.pkceCookieOptions();
    response.clearCookie(COOKIE_STATE, options);
    response.clearCookie(COOKIE_VERIFIER, options);
    response.clearCookie(COOKIE_NONCE, options);
  }

  private isSecureCookie() {
    return process.env.NODE_ENV === 'production';
  }

  private pkceCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 10 * 60 * 1000,
    };
  }

  private sessionCookieOptions(expiresInSeconds?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: 'lax',
      path: '/api',
      maxAge: expiresInSeconds ? Math.max(60, expiresInSeconds) * 1000 : undefined,
    };
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
  }
}
