import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Logo from '../components/Logo';

const GOOGLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'oauth_failed') toast.error('Google sign-in failed. Please try again.');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data } = await axios.post('http://localhost:5000/api/auth/login', form, { headers: { 'Content-Type': 'application/json' }, withCredentials: true });
      localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) { toast.error(err.response?.data?.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F5F0E8' }}>
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white" style={{ background: 'linear-gradient(145deg, #009B4D 0%, #007A3D 50%, #005C2E 100%)' }}>
      <div className="flex items-center mb-6">
        <Logo size={48} dark={true} />
      </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight mb-4">Split smarter,<br />settle faster.</h2>
          <p className="text-green-100 text-base mb-10">Track group expenses and settle debts with one click.</p>
          <div className="space-y-4">
            {['Debt simplification algorithm minimizes transactions', 'Real-time updates when group members add expenses', 'AI-powered insights on your spending patterns'].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#FFCC00] flex items-center justify-center flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="text-green-100 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-green-200 text-xs">© 2026 SplitSmart</p>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
        <div className="mb-10 lg:hidden">
  <Logo size={34} />
</div>
          <h1 className="text-3xl font-bold mb-1" style={{ color: '#1a1a1a' }}>Welcome back</h1>
          <p className="text-sm mb-8" style={{ color: '#6b7280' }}>Sign in to your account</p>

          <button onClick={() => { window.location.href = 'http://localhost:5000/api/auth/google'; }}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-5 shadow-sm">
            {GOOGLE_SVG} Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs font-medium" style={{ color: '#6b7280' }}>or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: '#1a1a1a' }}>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#009B4D] focus:border-transparent" required />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1.5 block" style={{ color: '#1a1a1a' }}>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#009B4D] focus:border-transparent" required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-60 hover:opacity-90 transition-opacity"
              style={{ background: '#009B4D' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: '#6b7280' }}>
            Don't have an account?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: '#009B4D' }}>Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}