import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import socket from '../utils/socket';
import Logo from '../components/Logo';

export default function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [notifications, setNotifications] = useState([]);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    const handleExpense = (data) => setNotifications(prev => [{ id: Date.now(), message: data.message, type: 'expense', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 20));
    const handleSettlement = (data) => setNotifications(prev => [{ id: Date.now(), message: data.message, type: 'settlement', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 20));
    const handleMember = (data) => setNotifications(prev => [{ id: Date.now(), message: data.message, type: 'member', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }, ...prev].slice(0, 20));
    socket.on('expense_added', handleExpense);
    socket.on('settlement_made', handleSettlement);
    socket.on('member_added', handleMember);
    return () => { socket.off('expense_added', handleExpense); socket.off('settlement_made', handleSettlement); socket.off('member_added', handleMember); };
  }, []);

  const TYPE_ICONS = { expense: '💸', settlement: '✅', member: '👤' };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white border-b-2 border-[#009B4D]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
      <button
  onClick={() => navigate('/dashboard')}
  className="hover:opacity-80 transition-opacity"
>
  <Logo size={32} />
</button>

        <div className="flex items-center gap-4">
          <div className="relative">
            <button onClick={() => setShowPanel(!showPanel)} className="relative p-2 rounded-lg hover:bg-[#F5F0E8] transition-colors">
              <Bell size={20} className="text-[#009B4D]" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-[#FFCC00] text-[#1a1a1a] text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            {showPanel && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span className="font-semibold text-[#1a1a1a] text-sm">Notifications</span>
                  <div className="flex items-center gap-2">
                    {notifications.length > 0 && <button onClick={() => setNotifications([])} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>}
                    <button onClick={() => setShowPanel(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-gray-400">
                      <Bell size={24} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  ) : notifications.map(n => (
                    <div key={n.id} className="px-4 py-3 border-b border-gray-50 hover:bg-[#F5F0E8] transition-colors">
                      <div className="flex items-start gap-3">
                        <span className="text-base mt-0.5">{TYPE_ICONS[n.type]}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#1a1a1a] leading-snug">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <span className="text-sm font-medium text-[#1a1a1a] hidden sm:block">{user.name}</span>
          <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login'); }}
            className="text-sm font-medium text-[#009B4D] hover:text-[#007A3D] transition-colors border border-[#009B4D] px-3 py-1.5 rounded-lg hover:bg-[#009B4D] hover:text-white">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}