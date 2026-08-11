import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

type OidcMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  userinfo_endpoint?: string;
};

@Controller()
export class PublicController {
  @Get('oidc/config')
  oidcConfig() {
    return {
      issuerUrl: process.env.OIDC_ISSUER_URL ?? '',
      clientId: process.env.OIDC_CLIENT_ID ?? '',
      redirectUri: process.env.OIDC_REDIRECT_URI ?? '',
    };
  }

  @Get('oidc/metadata')
  async oidcMetadata() {
    const issuer = (process.env.OIDC_ISSUER_URL ?? '').trim();
    if (!issuer) {
      throw new ServiceUnavailableException('OIDC_ISSUER_URL non configurato');
    }

    const endpoint = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new ServiceUnavailableException(`Impossibile leggere metadata OIDC (${response.status})`);
    }

    return (await response.json()) as OidcMetadata;
  }
}