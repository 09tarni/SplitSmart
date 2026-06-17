import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, X, ArrowRight, CheckCircle, Users, Repeat, Trash2, Pencil, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import api from '../utils/api';
import socket from '../utils/socket';
import ExportButtons from '../components/ExportButtons';
import ActivityFeed from '../components/ActivityFeed';
import AIInsights from '../components/AIInsights';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';

const PIE_COLORS = ['#009B4D','#FFCC00','#007A3D','#B4121B','#6b7280','#1a1a1a'];
const CATEGORY_COLORS = {
  food: 'bg-orange-100 text-orange-700', travel: 'bg-blue-100 text-blue-700',
  shopping: 'bg-pink-100 text-pink-700', utilities: 'bg-yellow-100 text-yellow-700',
  general: 'bg-gray-100 text-gray-600',
};
const FREQUENCY_COLORS = {
  daily: 'bg-red-100 text-red-700', weekly: 'bg-blue-100 text-blue-700',
  monthly: 'bg-green-100 text-green-700',
};
const INPUT = 'w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 text-sm bg-white';
const RING = 'focus:ring-[#009B4D]';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [simplified, setSimplified] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [recurring, setRecurring] = useState([]);
  const [activeTab, setActiveTab] = useState('expenses');
  const [showModal, setShowModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [settleTarget, setSettleTarget] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [splitValues, setSplitValues] = useState({});
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isFirstRender = useRef(true);
  const [form, setForm] = useState({ title: '', amount: '', split_type: 'equal', category: 'general', date: new Date().toISOString().split('T')[0], paid_by: '' });
  const [recurringForm, setRecurringForm] = useState({ title: '', amount: '', frequency: 'monthly', category: 'general', next_due: new Date().toISOString().split('T')[0] });

  const fetchAll = async () => {
    try {
      const [g, e, b, s, sl, r] = await Promise.all([
        api.get(`/groups/${id}`), api.get(`/groups/${id}/expenses`),
        api.get(`/groups/${id}/balances`), api.get(`/groups/${id}/simplify`),
        api.get(`/groups/${id}/settlements`), api.get(`/groups/${id}/recurring`),
      ]);
      setGroup(g.data.data.group); setMembers(g.data.data.members);
      setExpenses(e.data.data || []); setBalances(b.data.data || []);
      setSimplified(s.data.data || []); setSettlements(sl.data.data || []);
      setRecurring(r.data.data || []);
      try { const a = await api.get(`/groups/${id}/analytics`); setAnalytics(a.data.data); } catch { setAnalytics(null); }
    } catch { toast.error('Failed to load group data'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    socket.connect(); socket.emit('join_group', id);
    const handleExpenseAdded = (data) => { if (isFirstRender.current) return; toast(`💸 ${data.message}`, { style: { background: '#009B4D', color: '#fff', borderRadius: '12px' }, duration: 4000 }); fetchAll(); };
    const handleSettlement = (data) => { toast(`✅ ${data.message}`, { style: { background: '#007A3D', color: '#fff', borderRadius: '12px' }, duration: 4000 }); fetchAll(); };
    const handleMemberAdded = (data) => { toast(`👤 ${data.message}`, { style: { background: '#1a1a1a', color: '#fff', borderRadius: '12px' }, duration: 4000 }); fetchAll(); };
    socket.on('expense_added', handleExpenseAdded); socket.on('settlement_made', handleSettlement); socket.on('member_added', handleMemberAdded);
    return () => { socket.emit('leave_group', id); socket.off('expense_added', handleExpenseAdded); socket.off('settlement_made', handleSettlement); socket.off('member_added', handleMemberAdded); socket.disconnect(); };
  }, [id]); // eslint-disable-line

  useEffect(() => { fetchAll(); isFirstRender.current = false; }, [id]); // eslint-disable-line

  const openModal = () => { setForm({ title: '', amount: '', split_type: 'equal', category: 'general', date: new Date().toISOString().split('T')[0], paid_by: String(currentUser.id || '') }); setSplitValues({}); setShowModal(true); };
  const handleSplitTypeChange = (val) => { setForm(f => ({ ...f, split_type: val })); setSplitValues({}); };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!form.title || !form.amount) return toast.error('Title and amount are required');
    if (!form.paid_by) return toast.error('Please select who paid');
    const numericAmount = parseFloat(form.amount);
    if (form.split_type === 'percentage') { const total = Object.values(splitValues).reduce((sum, v) => sum + parseFloat(v || 0), 0); if (Math.abs(total - 100) > 0.01) return toast.error('Percentages must add up to 100%'); }
    if (form.split_type === 'exact') { const total = Object.values(splitValues).reduce((sum, v) => sum + parseFloat(v || 0), 0); if (Math.abs(total - numericAmount) > 0.01) return toast.error(`Exact amounts must add up to ₹${numericAmount}`); }
    setSubmitting(true);
    try {
      const payload = { title: form.title, amount: numericAmount, split_type: form.split_type, category: form.category, date: form.date, paid_by: parseInt(form.paid_by) };
      if (form.split_type === 'percentage') payload.splits = Object.entries(splitValues).map(([user_id, pct]) => ({ user_id: parseInt(user_id), owed_amount: Math.round((parseFloat(pct || 0) / 100) * numericAmount * 100) / 100 }));
      if (form.split_type === 'exact') payload.splits = Object.entries(splitValues).map(([user_id, amt]) => ({ user_id: parseInt(user_id), owed_amount: parseFloat(amt || 0) }));
      await api.post(`/groups/${id}/expenses`, payload);
      toast.success('Expense added!'); setShowModal(false); fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add expense'); }
    finally { setSubmitting(false); }
  };

  const openSettleModal = (txn) => { setSettleTarget(txn); setSettleAmount(txn.amount.toFixed(2)); setShowSettleModal(true); };
  const handleSettle = async (e) => {
    e.preventDefault(); const amt = parseFloat(settleAmount);
    if (!amt || amt <= 0) return toast.error('Enter a valid amount');
    if (amt > settleTarget.amount + 0.01) return toast.error(`Cannot pay more than ₹${settleTarget.amount.toFixed(2)}`);
    setSubmitting(true);
    try { await api.post(`/groups/${id}/settle`, { from_user_id: settleTarget.from, to_user_id: settleTarget.to, amount: amt }); toast.success(`₹${amt.toFixed(2)} payment recorded!`); setShowSettleModal(false); setSettleTarget(null); setSettleAmount(''); fetchAll(); }
    catch { toast.error('Failed to record settlement'); } finally { setSubmitting(false); }
  };

  const handleAddRecurring = async (e) => {
    e.preventDefault(); if (!recurringForm.title || !recurringForm.amount) return toast.error('Title and amount are required');
    setSubmitting(true);
    try { await api.post(`/groups/${id}/recurring`, { ...recurringForm, amount: parseFloat(recurringForm.amount) }); toast.success('Recurring expense created!'); setShowRecurringModal(false); setRecurringForm({ title: '', amount: '', frequency: 'monthly', category: 'general', next_due: new Date().toISOString().split('T')[0] }); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed to create recurring expense'); } finally { setSubmitting(false); }
  };

  const handleDeleteRecurring = async (rid) => { try { await api.delete(`/groups/${id}/recurring/${rid}`); toast.success('Recurring expense cancelled'); fetchAll(); } catch { toast.error('Failed to cancel'); } };

  const handleAddMember = async (e) => {
    e.preventDefault();
    try { const { data } = await api.get(`/auth/user-by-email?email=${memberEmail}`); await api.post(`/groups/${id}/members`, { user_id: data.data.id }); toast.success('Member added!'); setShowMemberModal(false); setMemberEmail(''); fetchAll(); }
    catch { toast.error('User not found or already a member'); }
  };

  const handleUpdateName = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await api.patch(`/groups/${id}`, { name: newGroupName.trim() });
      toast.success('Group name updated!');
      setEditingName(false);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update name'); }
  };

  const handleLeaveGroup = async () => {
    try {
      await api.post(`/groups/${id}/leave`);
      toast.success('You have left the group');
      navigate('/dashboard');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to leave group'); setShowLeaveConfirm(false); }
  };

  const handleDeleteGroup = async () => {
    try {
      await api.delete(`/groups/${id}`);
      toast.success('Group deleted');
      navigate('/dashboard');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete group'); setShowDeleteConfirm(false); }
  };

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#F5F0E8' }}><Navbar />
      <div className="pt-20 flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#009B4D', borderTopColor: 'transparent' }} />
      </div>
    </div>
  );

  const pctTotal = Object.values(splitValues).reduce((sum, v) => sum + parseFloat(v || 0), 0);
  const exactTotal = Object.values(splitValues).reduce((sum, v) => sum + parseFloat(v || 0), 0);
  const tabs = ['expenses', 'balances', 'settle up', 'analytics', 'activity'];
  const isCreator = group?.created_by === currentUser.id;

  return (
    <div className="min-h-screen" style={{ background: '#F5F0E8' }}>
      <Navbar />
      <div className="pt-20 px-6 max-w-4xl mx-auto pb-10">

        {/* Header */}
        <div className="flex justify-between items-start mb-6 pt-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-lg flex-shrink-0" style={{ background: 'linear-gradient(135deg, #009B4D, #007A3D)' }}>
              {group?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              {editingName ? (
                <form onSubmit={handleUpdateName} className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="text-xl font-bold border-b-2 border-[#009B4D] bg-transparent focus:outline-none"
                    style={{ color: '#1a1a1a' }}
                  />
                  <button type="submit" className="text-xs font-semibold text-white px-2 py-1 rounded-lg" style={{ background: '#009B4D' }}>Save</button>
                  <button type="button" onClick={() => setEditingName(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>{group?.name}</h1>
                  {isCreator && (
                    <button onClick={() => { setNewGroupName(group?.name || ''); setEditingName(true); }} className="text-gray-400 hover:text-[#009B4D] transition-colors">
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm" style={{ color: '#6b7280' }}>{members.length} members · {isCreator ? 'You are the creator' : 'Member'}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {/* Leave group — non-creators only */}
            {!isCreator && (
              <button onClick={() => setShowLeaveConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
                <LogOut size={14} /> Leave
              </button>
            )}
            {/* Delete group — creator only */}
            {isCreator && (
              <button onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button onClick={() => setShowMemberModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
              style={{ borderColor: '#009B4D', color: '#009B4D', background: 'white' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#009B4D'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#009B4D'; }}>
              <Users size={15} /> Add Member
            </button>
            <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: '#009B4D' }}>
              <Plus size={15} /> Add Expense
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium capitalize rounded-lg transition-all whitespace-nowrap"
              style={activeTab === tab ? { background: '#009B4D', color: 'white' } : { color: '#6b7280' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {expenses.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <p className="text-lg font-semibold text-gray-700">No expenses yet</p>
                <p className="text-sm text-gray-400 mt-1">Add your first expense to get started</p>
              </div>
            ) : expenses.map(exp => (
              <div key={exp.id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center border-l-4" style={{ borderLeftColor: '#009B4D' }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold" style={{ color: '#1a1a1a' }}>{exp.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.general}`}>{exp.category}</span>
                  </div>
                  <p className="text-xs" style={{ color: '#6b7280' }}>Paid by {exp.paid_by_name} · {new Date(exp.date || exp.created_at).toLocaleDateString('en-IN')}</p>
                </div>
                <span className="font-bold text-lg" style={{ color: '#009B4D' }}>₹{parseFloat(exp.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {/* BALANCES TAB */}
        {activeTab === 'balances' && (
          <div className="space-y-3">
            {balances.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm"><p className="text-lg font-semibold text-gray-700">No balances yet</p></div>
            ) : balances.map(b => (
              <div key={b.user_id} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ background: '#009B4D' }}>
                    {b.name?.[0]?.toUpperCase()}
                  </div>
                  <span className="font-medium" style={{ color: '#1a1a1a' }}>{b.name}</span>
                </div>
                <span className="font-semibold" style={{ color: parseFloat(b.balance) > 0 ? '#009B4D' : parseFloat(b.balance) < 0 ? '#B4121B' : '#6b7280' }}>
                  {parseFloat(b.balance) > 0 ? `Gets back ₹${parseFloat(b.balance).toFixed(2)}` : parseFloat(b.balance) < 0 ? `Owes ₹${Math.abs(parseFloat(b.balance)).toFixed(2)}` : 'Settled up'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* SETTLE UP TAB */}
        {activeTab === 'settle up' && (
          <div className="space-y-6">
            {simplified.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
                <CheckCircle size={48} className="mx-auto mb-4" style={{ color: '#009B4D' }} />
                <p className="text-lg font-semibold text-gray-700">All settled up!</p>
                <p className="text-sm text-gray-400">No pending transactions</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6b7280' }}>Pending</p>
                {simplified.map((txn, i) => (
                  <div key={i} className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#B4121B' }}>
                        {txn.from_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm" style={{ color: '#1a1a1a' }}>{txn.from_name}</span>
                          <ArrowRight size={14} style={{ color: '#6b7280' }} />
                          <span className="font-medium text-sm" style={{ color: '#1a1a1a' }}>{txn.to_name}</span>
                        </div>
                        <p className="text-xs" style={{ color: '#6b7280' }}>tap Pay to record full or partial payment</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold" style={{ color: '#B4121B' }}>₹{parseFloat(txn.amount).toFixed(2)}</span>
                      <button onClick={() => openSettleModal(txn)} className="text-sm text-white px-4 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-90" style={{ background: '#009B4D' }}>Pay</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {settlements.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#6b7280' }}>Payment history</p>
                <div className="space-y-2">
                  {settlements.map((s) => (
                    <div key={s.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#dcfce7' }}>
                          <CheckCircle size={14} style={{ color: '#009B4D' }} />
                        </div>
                        <div>
                          <p className="text-sm" style={{ color: '#1a1a1a' }}>
                            <span className="font-medium">{s.payer_name}</span>{' paid '}
                            <span className="font-medium">{s.receiver_name}</span>
                          </p>
                          <p className="text-xs" style={{ color: '#6b7280' }}>{new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                      </div>
                      <span className="font-semibold text-sm" style={{ color: '#009B4D' }}>₹{parseFloat(s.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-5">
            <AIInsights groupId={id} />
            <div className="bg-white rounded-xl p-4 shadow-sm flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Download Report</p>
                <p className="text-xs" style={{ color: '#6b7280' }}>Full expense history as PDF or CSV</p>
              </div>
              <ExportButtons groupId={id} />
            </div>
            {analytics && (
              <>
                {analytics.topSpender && (
                  <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #009B4D, #007A3D)' }}>
                      {analytics.topSpender.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#6b7280' }}>🏆 Top Spender</p>
                      <p className="text-xl font-bold" style={{ color: '#009B4D' }}>{analytics.topSpender.name}</p>
                      <p className="text-sm" style={{ color: '#6b7280' }}>₹{parseFloat(analytics.topSpender.total_paid).toFixed(2)} paid total</p>
                    </div>
                  </div>
                )}
                {analytics.byCategory?.length > 0 && (
                  <div className="bg-white rounded-xl p-5 shadow-sm">
                    <p className="text-sm font-semibold mb-4" style={{ color: '#1a1a1a' }}>Spending by Category</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={analytics.byCategory} dataKey="total" nameKey="category" cx="50%" cy="42%" outerRadius={85} innerRadius={40}>
                          {analytics.byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(val) => `₹${parseFloat(val).toFixed(2)}`} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>{value}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {analytics.byMonth?.length > 0 && (
                  <div className="bg-white rounded-xl p-5 shadow-sm">
                    <p className="text-sm font-semibold mb-4" style={{ color: '#1a1a1a' }}>Monthly Spending</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={analytics.byMonth} barSize={28}>
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(val) => `₹${parseFloat(val).toFixed(2)}`} contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="total" fill="#009B4D" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
            {!analytics && (
              <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
                <p className="text-base font-semibold text-gray-500">No analytics data yet</p>
                <p className="text-sm text-gray-400 mt-1">Add expenses to see insights</p>
              </div>
            )}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Recurring Expenses</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Auto-added on schedule</p>
                </div>
                <button onClick={() => setShowRecurringModal(true)} className="flex items-center gap-2 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:opacity-90" style={{ background: '#009B4D' }}>
                  <Repeat size={13} /> Add Recurring
                </button>
              </div>
              {recurring.length === 0 ? (
                <div className="text-center py-8">
                  <Repeat size={32} className="mx-auto mb-2 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">No recurring expenses</p>
                  <p className="text-xs text-gray-400">Set up automatic expenses like rent or subscriptions</p>
                </div>
              ) : recurring.map(rec => (
                <div key={rec.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm" style={{ color: '#1a1a1a' }}>{rec.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FREQUENCY_COLORS[rec.frequency]}`}>{rec.frequency}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[rec.category] || CATEGORY_COLORS.general}`}>{rec.category}</span>
                    </div>
                    <p className="text-xs" style={{ color: '#6b7280' }}>Next due: {new Date(rec.next_due).toLocaleDateString('en-IN')} · Paid by {rec.paid_by_name}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold" style={{ color: '#009B4D' }}>₹{parseFloat(rec.amount).toFixed(2)}</span>
                    <button onClick={() => handleDeleteRecurring(rec.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'activity' && <ActivityFeed groupId={id} />}
      </div>

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h2 className="text-lg font-bold text-center mb-1" style={{ color: '#1a1a1a' }}>Delete Group?</h2>
            <p className="text-sm text-center text-gray-500 mb-6">This will permanently delete <strong>{group?.name}</strong> and all its data. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteGroup} className="flex-1 py-3 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirm Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <LogOut size={22} className="text-gray-500" />
            </div>
            <h2 className="text-lg font-bold text-center mb-1" style={{ color: '#1a1a1a' }}>Leave Group?</h2>
            <p className="text-sm text-center text-gray-500 mb-6">You'll be removed from <strong>{group?.name}</strong>. You can only leave if your balance is ₹0.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLeaveConfirm(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleLeaveGroup} className="flex-1 py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90" style={{ background: '#1a1a1a' }}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Modal */}
      {showSettleModal && settleTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>Record Payment</h2>
              <button onClick={() => setShowSettleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="rounded-xl p-3 mb-4 flex justify-between items-center" style={{ background: '#F5F0E8' }}>
              <span className="text-sm text-gray-600">{settleTarget.from_name} → {settleTarget.to_name}</span>
              <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Owes ₹{parseFloat(settleTarget.amount).toFixed(2)}</span>
            </div>
            <form onSubmit={handleSettle} className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#6b7280' }}>Amount being paid now</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input type="number" min="0.01" step="0.01" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} className={`${INPUT} ${RING} pl-8`} required />
                </div>
                {parseFloat(settleAmount) > 0 && parseFloat(settleAmount) < parseFloat(settleTarget.amount) && (
                  <p className="text-xs text-amber-600 mt-1">Partial — ₹{(parseFloat(settleTarget.amount) - parseFloat(settleAmount)).toFixed(2)} remains</p>
                )}
                {parseFloat(settleAmount) >= parseFloat(settleTarget.amount) && parseFloat(settleAmount) > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#009B4D' }}>Full payment — clears this debt ✓</p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowSettleModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:opacity-90" style={{ background: '#009B4D' }}>
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>Add Expense</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddExpense} className="space-y-3">
              <input type="text" placeholder="Title *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`${INPUT} ${RING}`} required />
              <input type="number" placeholder="Amount (₹) *" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={`${INPUT} ${RING}`} required />
              <select value={form.paid_by} onChange={(e) => setForm({ ...form, paid_by: e.target.value })} className={`${INPUT} ${RING}`} required>
                <option value="">Who paid? *</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === currentUser.id ? ' (you)' : ''}</option>)}
              </select>
              <select value={form.split_type} onChange={(e) => handleSplitTypeChange(e.target.value)} className={`${INPUT} ${RING}`}>
                <option value="equal">Equal split</option>
                <option value="percentage">Percentage split</option>
                <option value="exact">Exact amounts</option>
              </select>
              {form.split_type === 'percentage' && (
                <div className="border border-gray-100 rounded-xl p-3 space-y-2" style={{ background: '#F5F0E8' }}>
                  <p className="text-xs font-medium text-gray-500">Enter percentage for each member</p>
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-28 truncate">{m.name}</span>
                      <input type="number" min="0" max="100" placeholder="0" value={splitValues[m.id] || ''} onChange={(e) => setSplitValues({ ...splitValues, [m.id]: e.target.value })} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#009B4D] bg-white" />
                      <span className="text-sm text-gray-400">%</span>
                    </div>
                  ))}
                  <p className={`text-xs font-medium ${Math.abs(pctTotal - 100) < 0.01 ? 'text-[#009B4D]' : 'text-[#B4121B]'}`}>Total: {pctTotal.toFixed(1)}% {Math.abs(pctTotal - 100) < 0.01 ? '✓' : '(must be 100%)'}</p>
                </div>
              )}
              {form.split_type === 'exact' && (
                <div className="border border-gray-100 rounded-xl p-3 space-y-2" style={{ background: '#F5F0E8' }}>
                  <p className="text-xs font-medium text-gray-500">Enter exact amount for each member</p>
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-28 truncate">{m.name}</span>
                      <span className="text-sm text-gray-400">₹</span>
                      <input type="number" min="0" placeholder="0" value={splitValues[m.id] || ''} onChange={(e) => setSplitValues({ ...splitValues, [m.id]: e.target.value })} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#009B4D] bg-white" />
                    </div>
                  ))}
                  <p className={`text-xs font-medium ${Math.abs(exactTotal - parseFloat(form.amount || 0)) < 0.01 ? 'text-[#009B4D]' : 'text-[#B4121B]'}`}>Total: ₹{exactTotal.toFixed(2)} {Math.abs(exactTotal - parseFloat(form.amount || 0)) < 0.01 ? '✓' : `(must be ₹${parseFloat(form.amount || 0).toFixed(2)})`}</p>
                </div>
              )}
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`${INPUT} ${RING}`}>
                <option value="general">General</option><option value="food">Food</option>
                <option value="travel">Travel</option><option value="shopping">Shopping</option><option value="utilities">Utilities</option>
              </select>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={`${INPUT} ${RING}`} />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:opacity-90" style={{ background: '#009B4D' }}>
                  {submitting ? 'Adding...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Recurring Modal */}
      {showRecurringModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>Add Recurring Expense</h2>
              <button onClick={() => setShowRecurringModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddRecurring} className="space-y-3">
              <input type="text" placeholder="Title *" value={recurringForm.title} onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })} className={`${INPUT} ${RING}`} required />
              <input type="number" placeholder="Amount (₹) *" value={recurringForm.amount} onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })} className={`${INPUT} ${RING}`} required />
              <select value={recurringForm.frequency} onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value })} className={`${INPUT} ${RING}`}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
              <select value={recurringForm.category} onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })} className={`${INPUT} ${RING}`}>
                <option value="general">General</option><option value="food">Food</option>
                <option value="travel">Travel</option><option value="shopping">Shopping</option><option value="utilities">Utilities</option>
              </select>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#6b7280' }}>First due date *</label>
                <input type="date" value={recurringForm.next_due} onChange={(e) => setRecurringForm({ ...recurringForm, next_due: e.target.value })} className={`${INPUT} ${RING}`} required />
              </div>
              <p className="text-xs rounded-xl p-3" style={{ background: '#F5F0E8', color: '#6b7280' }}>💡 Auto-added on the due date and split equally among all members.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowRecurringModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:opacity-90" style={{ background: '#009B4D' }}>
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showMemberModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>Add Member</h2>
              <button onClick={() => setShowMemberModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-4">
              <input type="email" placeholder="Enter member's email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} className={`${INPUT} ${RING}`} required />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowMemberModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 py-3 text-white rounded-xl text-sm font-semibold hover:opacity-90" style={{ background: '#009B4D' }}>Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}