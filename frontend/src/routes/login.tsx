import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signIn, getMe } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertCircle, Lock, Mail, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useSessionStore((state) => state.setSession);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await signIn(email, password);
      const meData = await getMe();

      setSession({
        user: {
          id: meData.id,
          email: meData.email,
          name: meData.name,
          role: meData.role,
          departments: meData.departments || [],
          entities: meData.entities || ['ATA', 'LTA'],
          isActive: meData.isActive,
          avatarUrl: meData.avatarUrl,
        },
        permissions: meData.permissions || [],
        activeEntity: meData.activeEntity || (meData.entities?.[0] ?? 'ATA'),
        unreadCount: meData.unread_notifications ?? 0,
      });

      navigate(from, { replace: true });
    } catch (err) {
      console.error('[Login] Sign-in error:', err);
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (quickEmail: string) => {
    setEmail(quickEmail);
    setPassword('password123');
    setError(null);
  };

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-4 sm:p-6 bg-[#F4F4F0]"
      data-testid="login-page"
    >
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-none bg-[#0A0A0A] text-[#FAF9F5] font-black text-xl border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] mb-3">
            ERP
          </div>
          <h1 className="text-3xl font-black text-[#0A0A0A] uppercase tracking-tight font-display">
            ATA &amp; LTA ERP
          </h1>
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] mt-1">
            ENTERPRISE LEDGER &bull; AUTHENTICATION DOSSIER
          </p>
        </div>

        <Card className="border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] bg-[#FAF9F5] rounded-none p-0">
          <CardHeader className="space-y-1 p-6 border-b border-[#0A0A0A] bg-[#EAE8E3]">
            <CardTitle className="text-lg font-bold uppercase tracking-tight text-[#0A0A0A]">
              Security Access Control
            </CardTitle>
            <CardDescription className="font-mono text-xs text-[#4A4945]">
              ENTER AUTHORIZED CREDENTIALS TO INITIALIZE SESSION
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4 p-6">
              {error && (
                <div
                  data-testid="login-error"
                  className="flex items-center gap-2 rounded-none bg-[#FCE8E8] p-3 text-xs font-mono text-[#A81212] border border-[#E61919]"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-[#E61919]" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]" htmlFor="email">
                  Operator Identity (Email)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#4A4945]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@ata-lta.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 rounded-none border border-[#111111] bg-[#FFFFFF] font-mono text-xs"
                    data-testid="login-email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-xs font-semibold uppercase tracking-wider text-[#0A0A0A]" htmlFor="password">
                  Security Passkey
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#4A4945]" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10 rounded-none border border-[#111111] bg-[#FFFFFF] font-mono text-xs"
                    data-testid="login-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-2.5 text-[#4A4945] hover:text-[#0A0A0A] focus:outline-none focus:ring-1 focus:ring-[#E61919] transition-colors cursor-pointer"
                    data-testid="password-toggle-btn"
                    id="password-toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={0}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 p-6 pt-0">
              <Button
                type="submit"
                className="w-full gap-2 rounded-none bg-[#0A0A0A] text-[#FAF9F5] border border-[#0A0A0A] hover:bg-[#222220] font-mono uppercase tracking-wider text-xs font-bold h-10 cursor-pointer"
                disabled={loading}
                data-testid="login-submit"
              >
                {loading ? 'AUTHENTICATING...' : 'AUTHORIZE SESSION'}
                <ArrowRight className="h-4 w-4 text-[#E61919]" />
              </Button>

              {/* Dev quick-login buttons */}
              <div className="pt-2 text-center w-full border-t border-[#C8C5BC]">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] block mb-2">
                  DEVELOPMENT SEED KEYS
                </span>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => fillCredentials('dev-admin@ata-lta.ph')}
                    data-testid="dev-admin-btn"
                    className="font-mono text-xs"
                  >
                    Admin (Full)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => fillCredentials('dev-docs@ata-lta.ph')}
                    data-testid="dev-docs-btn"
                    className="font-mono text-xs"
                  >
                    Manager (Docs)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => fillCredentials('dev-accs@ata-lta.ph')}
                    data-testid="dev-accs-btn"
                    className="font-mono text-xs"
                  >
                    Accounting
                  </Button>
                </div>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
