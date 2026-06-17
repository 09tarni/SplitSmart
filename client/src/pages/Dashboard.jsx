import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, X, ArrowRight, Wallet, TrendingUp, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import api from '../utils/api';

const AVATAR_COLORS = ['#009B4D','#007A3D','#FFCC00','#B4121B','#1a1a1a','#6b7280'];

const formatCurrency = (value) =>
  `₹${Math.abs(Number(value)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const getInitials = (name) => {
  const parts = (name || '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [groups, setGroups] = useState([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalSpend, setTotalSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const enrichGroups = useCallback(async (rawGroups) => {
    const enriched = await Promise.all(rawGroups.map(async (group) => {
      try {
        const [detailRes, expensesRes, balancesRes] = await Promise.all([
          api.get(`/groups/${group.id}`),
          api.get(`/groups/${group.id}/expenses`),
          api.get(`/groups/${group.id}/balances`),
        ]);
        const members = detailRes.data.data.members || [];
        const expenses = expensesRes.data.data || [];
        const balances = balancesRes.data.data || [];
        const spend = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const myBalance = Number(balances.find((b) => b.user_id === user.id)?.balance ?? 0);
        return { ...group, members, totalSpend: spend, expenseCount: expenses.length, myBalance };
      } catch {
        return { ...group, members: [], totalSpend: 0, expenseCount: 0, myBalance: 0 };
      }
    }));
    setTotalBalance(enriched.reduce((sum, g) => sum + g.myBalance, 0));
    setTotalSpend(enriched.reduce((sum, g) => sum + g.totalSpend, 0));
    return enriched;
  }, [user.id]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/groups');
      const enriched = await enrichGroups(data.data || []);
      setGroups(enriched);
    } catch { toast.error('Failed to load groups'); }
    finally { setLoading(false); }
  }, [enrichGroups]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Group name is required');
    setCreating(true);
    try {
      await api.post('/groups', form);
      toast.success('Group created!');
      setShowModal(false);
      setForm({ name: '', description: '' });
      fetchGroups();
    } catch { toast.error('Failed to create group'); }
    finally { setCreating(false); }
  };

  const balanceColor = totalBalance > 0 ? 'text-[#009B4D]' : totalBalance < 0 ? 'text-[#B4121B]' : 'text-gray-500';
  const balanceLabel = totalBalance > 0 ? 'You are owed' : totalBalance < 0 ? 'You owe' : 'All settled up';

  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8' }}>
      <Navbar />

      {/* Hero */}
      <section className="pt-16">
        <div className="px-6 pb-28 pt-10" style={{ background: 'linear-gradient(135deg, #009B4D 0%, #007A3D 60%, #005C2E 100%)' }}>
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-medium text-green-200">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
              Hey, {user.name || 'there'} 👋
            </h1>
            <p className="mt-2 max-w-lg text-green-100 text-sm">
              Track shared expenses, settle up faster, and stay on top of every group balance.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mx-auto -mt-20 max-w-6xl px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'NET BALANCE', icon: <Wallet size={18} />, value: totalBalance === 0 ? '₹0' : `${totalBalance > 0 ? '+' : '-'}${formatCurrency(totalBalance)}`, sub: balanceLabel, valueClass: balanceColor, iconBg: 'bg-green-100', iconColor: 'text-[#009B4D]' },
              { label: 'GROUPS', icon: <Layers size={18} />, value: groups.length, sub: 'Active workspaces', valueClass: 'text-[#1a1a1a]', iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600' },
              { label: 'TOTAL SPEND', icon: <TrendingUp size={18} />, value: formatCurrency(totalSpend), sub: 'Across all groups', valueClass: 'text-[#1a1a1a]', iconBg: 'bg-green-100', iconColor: 'text-[#009B4D]' },
            ].map((s, i) => (
              <div key={i} className="rounded-2xl bg-white p-5 shadow-lg border border-white">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.iconBg} ${s.iconColor}`}>{s.icon}</div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.valueClass}`}>{s.value}</p>
                    <p className="text-xs text-gray-400">{s.sub}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Groups */}
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#1a1a1a]">Your groups</h2>
            <p className="mt-0.5 text-sm text-gray-500">Open a group to add expenses and settle balances</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-95"
            style={{ background: '#009B4D' }}>
            <Plus size={16} /> New Group
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1,2,3].map(i => (
              <div key={i} className="animate-pulse rounded-2xl bg-white p-6">
                <div className="mb-4 h-4 w-2/3 rounded bg-gray-100" />
                <div className="mb-6 h-3 w-1/2 rounded bg-gray-100" />
                <div className="flex gap-2">{[1,2,3].map(j => <div key={j} className="h-8 w-8 rounded-full bg-gray-100" />)}</div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <Users size={48} className="mx-auto mb-4 text-gray-200" />
            <p className="text-lg font-semibold text-[#1a1a1a]">No groups yet</p>
            <p className="mt-1 text-sm text-gray-400">Create your first group to start splitting</p>
            <button onClick={() => setShowModal(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl"
              style={{ background: '#009B4D' }}>
              <Plus size={16} /> Create Group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group, i) => {
              const balance = Number(group.myBalance || 0);
              const visibleMembers = group.members.slice(0, 4);
              const extra = Math.max(group.members.length - 4, 0);
              return (
                <article key={group.id}
                  className="flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 overflow-hidden"
                  style={{ borderLeft: '4px solid #009B4D' }}>
                  <div className="p-5 flex-1">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-[#1a1a1a]">{group.name}</h3>
                        <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{group.description || 'No description'}</p>
                      </div>
                      <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 bg-[#F5F0E8]">
                        {group.expenseCount || 0} exp
                      </span>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex -space-x-2">
                        {visibleMembers.map((m, mi) => (
                          <span key={m.id} title={m.name}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                            style={{ background: AVATAR_COLORS[(i + mi) % AVATAR_COLORS.length] }}>
                            {getInitials(m.name)}
                          </span>
                        ))}
                        {extra > 0 && (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs font-medium text-gray-500">+{extra}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400">Total spend</p>
                        <p className="text-sm font-bold text-[#1a1a1a]">{formatCurrency(group.totalSpend)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-4" style={{ background: '#F5F0E8' }}>
                      <span className="text-xs font-medium text-gray-500">Your balance</span>
                      <span className={`text-sm font-bold ${balance > 0 ? 'text-[#009B4D]' : balance < 0 ? 'text-[#B4121B]' : 'text-gray-400'}`}>
                        {balance === 0 ? 'Settled' : `${balance > 0 ? '+' : '-'}${formatCurrency(balance)}`}
                      </span>
                    </div>
                  </div>

                  <button onClick={() => navigate(`/groups/${group.id}`)}
                    className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors border-t border-gray-100 hover:bg-[#009B4D] hover:text-white text-[#009B4D]">
                    View Group <ArrowRight size={15} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1a1a1a]">Create new group</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <input type="text" placeholder="Group name *" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009B4D]" required />
              <input type="text" placeholder="Description (optional)" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009B4D]" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={creating}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: '#009B4D' }}>
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}