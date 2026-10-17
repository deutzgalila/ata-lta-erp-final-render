const { randomBytes, randomUUID } = require('crypto');

// Generated fixtures only: never use deployment keys, passwords, or JWTs here.
const mockServiceKey = randomBytes(32).toString('hex');
jest.mock('../../../src/config/env', () => ({
  supabase: { url: 'https://supabase.example.test', serviceKey: mockServiceKey },
}));

const makeToken = () => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      sub: randomUUID(),
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    randomBytes(32).toString('base64url'),
  ].join('.');
};

describe('Supabase admin transport identity', () => {
  let admin;
  let fetchMock;
  let accessToken;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    accessToken = makeToken();
    fetchMock = jest.fn(async (url, options) => {
      if (String(url).includes('/auth/v1/token')) {
        return new Response(
          JSON.stringify({
            access_token: accessToken,
            refresh_token: randomBytes(32).toString('hex'),
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: randomUUID() },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (String(url).includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: randomUUID() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const headers = new Headers(options.headers);
      const privileged = headers.get('Authorization') === `Bearer ${mockServiceKey}`;
      return new Response(
        JSON.stringify(
          privileged
            ? { comments: [] }
            : {
                code: '42501',
                message: 'permission denied for function mutate_document_comment',
              }
        ),
        { status: privileged ? 200 : 403, headers: { 'Content-Type': 'application/json' } }
      );
    });
    global.fetch = fetchMock;
    admin = require('../../../src/config/supabase').supabaseAdmin;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('still verifies the explicitly supplied user token', async () => {
    const result = await admin.auth.getUser(accessToken);
    expect(result.error).toBeNull();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/auth/v1/user'));
    expect(new Headers(call[1].headers).get('Authorization') === `Bearer ${accessToken}`).toBe(
      true
    );
  });

  it.each(['sign-in', 'refresh'])(
    'retains service-role RPC authorization after %s',
    async (operation) => {
      const before = await admin.rpc('mutate_document_comment', {});
      expect(before.error).toBeNull();
      const result =
        operation === 'sign-in'
          ? await admin.auth.signInWithPassword({
              email: `${randomUUID()}@example.test`,
              password: randomBytes(24).toString('hex'),
            })
          : await admin.auth.refreshSession({ refresh_token: randomBytes(32).toString('hex') });
      expect(result.error).toBeNull();
      expect(result.data.session.access_token).toBe(accessToken);
      const after = await admin.rpc('mutate_document_comment', {});
      // Compare booleans so a failing test never prints credential/header values.
      expect(after.error === null).toBe(true);
      const rpcCall = fetchMock.mock.calls
        .filter(([url]) => String(url).includes('/rest/v1/rpc/'))
        .pop();
      const headers = new Headers(rpcCall[1].headers);
      expect(headers.get('Authorization') === `Bearer ${mockServiceKey}`).toBe(true);
      expect(headers.get('Authorization') === `Bearer ${accessToken}`).toBe(false);
    }
  );
});
