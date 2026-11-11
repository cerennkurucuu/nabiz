import type { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../../../../../packages/contracts/api.js';
import type { AuthConfig } from './auth.config.js';
import type { IdentityProvider } from './google.provider.js';
import {
  AuthError,
  csrfToken,
  equalTokens,
  hashToken,
  randomToken,
} from './auth.security.js';

export interface SessionContext {
  user: AuthUser;
  tokenHash: string;
  csrfToken: string;
}

export class AuthService {
  constructor(
    readonly config: AuthConfig,
    private readonly db: PrismaClient,
    private readonly provider: IdentityProvider,
    private readonly now = () => new Date(),
  ) {}

  get configured() {
    return Boolean(this.config.clientId);
  }

  async begin() {
    if (!this.configured)
      throw new AuthError(
        503,
        'AUTH_NOT_CONFIGURED',
        'Google girişi henüz yapılandırılmadı.',
      );
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken();
    const now = this.now();
    await this.db.oAuthAttempt.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    await this.db.session.deleteMany({ where: { expiresAt: { lte: now } } });
    await this.db.oAuthAttempt.create({
      data: {
        stateHash: hashToken(state),
        nonce,
        verifier,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
      },
    });
    return {
      state,
      nonce,
      clientId: this.config.clientId,
    };
  }

  async finish(
    state: string,
    browserState: string | undefined,
    credential: string,
    oldToken?: string,
  ) {
    if (
      !this.configured ||
      !browserState ||
      !equalTokens(state, browserState) ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !credential ||
      credential.length > 16384
    ) {
      throw new AuthError(
        401,
        'INVALID_LOGIN',
        'Giriş isteği geçersiz veya süresi dolmuş.',
      );
    }
    const stateHash = hashToken(state);
    // Delete is conditional and atomic: concurrent callbacks cannot reuse a login attempt.
    const attempt = await this.db.oAuthAttempt.findUnique({
      where: { stateHash },
    });
    const consumed = await this.db.oAuthAttempt.deleteMany({
      where: { stateHash, expiresAt: { gt: this.now() } },
    });
    if (!attempt || consumed.count !== 1)
      throw new AuthError(
        401,
        'INVALID_LOGIN',
        'Giriş isteği geçersiz veya süresi dolmuş.',
      );
    const identity = await this.provider.verify(credential, attempt.nonce);
    const token = randomToken();
    const now = this.now();
    const user = await this.db.$transaction(async (tx) => {
      // Google sub is the immutable identity. Never link accounts by email address.
      const row = await tx.user.upsert({
        where: { googleSub: identity.sub },
        create: {
          googleSub: identity.sub,
          email: identity.email,
          name: identity.name,
        },
        update: { email: identity.email, name: identity.name },
      });
      if (oldToken)
        await tx.session.deleteMany({
          where: { tokenHash: hashToken(oldToken) },
        });
      await tx.session.create({
        data: {
          tokenHash: hashToken(token),
          userId: row.id,
          expiresAt: new Date(
            now.getTime() + this.config.sessionSeconds * 1000,
          ),
        },
      });
      return { id: row.id, email: row.email, name: row.name };
    });
    return { token, user };
  }

  async session(token: string | undefined): Promise<SessionContext | null> {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const row = await this.db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row) return null;
    if (row.expiresAt <= this.now()) {
      await this.db.session.deleteMany({ where: { tokenHash } });
      return null;
    }
    return {
      user: { id: row.user.id, email: row.user.email, name: row.user.name },
      tokenHash,
      csrfToken: csrfToken(token),
    };
  }

  async logout(context: SessionContext) {
    await this.db.session.deleteMany({
      where: { tokenHash: context.tokenHash },
    });
  }

  profile(id: string, ownerId: string) {
    return this.db.user.findFirst({
      where: { AND: [{ id }, { id: ownerId }] },
      select: { id: true, email: true, name: true },
    });
  }
}
