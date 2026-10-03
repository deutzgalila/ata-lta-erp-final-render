import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signIn, getMe } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertCircle, Lock, Mail, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      className="flex min-h-screen w-full items-center justify-center p-4 bg-[#0f172a]"
      data-testid="login-page"
    >
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#2563eb] text-white font-bold text-xl shadow-lg mb-3">
            ERP
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ATA &amp; LTA ERP</h1>
          <p className="text-xs text-slate-400 mt-1">Enterprise Management System v2.0</p>
        </div>

        <Card className="border-0 shadow-2xl bg-white rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-bold text-[#1e293b]">Sign in to your account</CardTitle>
            <CardDescription className="text-xs text-[#9494a0]">
              Enter your corporate credentials to continue
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {error && (
                <div
                  data-testid="login-error"
                  className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#1e293b]" htmlFor="email">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#9494a0]" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@ata-lta.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    data-testid="login-email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#1e293b]" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#9494a0]" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9"
                    data-testid="login-password"
                    required
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-3 pt-2">
              <Button
                type="submit"
                className="w-full gap-2 bg-[#2563eb] hover:bg-[#1d4ed8]"
                disabled={loading}
                data-testid="login-submit"
              >
                {loading ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="h-4 w-4" />
              </Button>

              {/* Dev quick-login buttons */}
              <div className="pt-2 text-center w-full">
                <span className="text-[11px] font-medium text-[#9494a0] block mb-2">
                  Dev Seed Accounts (Click to fill)
                </span>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => fillCredentials('dev-admin@ata-lta.ph')}
                    data-testid="dev-admin-btn"
                  >
                    Admin (Full)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => fillCredentials('dev-docs@ata-lta.ph')}
                    data-testid="dev-docs-btn"
                  >
                    Manager (Docs)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => fillCredentials('dev-accs@ata-lta.ph')}
                    data-testid="dev-accs-btn"
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
