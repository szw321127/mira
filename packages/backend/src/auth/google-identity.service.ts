import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export type GoogleIdentityProfile = {
  email: string;
  emailVerified: boolean;
  name: string;
  sub: string;
};

@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verifyCredential(credential: string): Promise<GoogleIdentityProfile> {
    const clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID') ??
      this.configService.get<string>('NEXT_PUBLIC_GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new UnauthorizedException('Google login is not configured.');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        audience: clientId,
        idToken: credential,
      });
      const payload = ticket.getPayload();

      if (!payload?.sub || !payload.email || !payload.email_verified) {
        throw new UnauthorizedException('Google email is not verified.');
      }

      return {
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name?.trim() || payload.email.split('@')[0],
        sub: payload.sub,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid Google credential.');
    }
  }
}
