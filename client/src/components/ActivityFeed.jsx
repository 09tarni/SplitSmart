import { useEffect, useState } from 'react';
import api from '../utils/api';

const TYPE_CONFIG = {
  expense: {
    icon: '💸',
    color: 'bg-purple-100',
    label: (item) => `${item.actor} added "${item.description}"`,
    amount: (item) => `₹${parseFloat(item.amount).toFixed(2)}`,
  },
  settlement: {
    icon: '✅',
    color: 'bg-green-100',
    label: (item) => item.description,
    amount: (item) => `₹${parseFloat(item.amount).toFixed(2)}`,
  },
  member: {
    icon: '👤',
    color: 'bg-blue-100',
    label: (item) => item.description,
    amount: () => null,
  },
};

const timeAgo = (dateStr) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function ActivityFeed({ groupId }) {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await api.get(`/groups/${groupId}/activity?limit=30`);
        setActivity(data.data || []);
      } catch {
        setActivity([]);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [groupId]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (activity.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <p className="text-lg font-medium">No activity yet</p>
      <p className="text-sm">Add expenses or members to see activity</p>
    </div>
  );

  return (
    <div className="space-y-1">
      {activity.map((item, i) => {
        const config = TYPE_CONFIG[item.type];
        if (!config) return null;
        return (
          <div key={`${item.type}-${item.id}-${i}`}
            className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center gap-4">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 ${config.color}`}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 truncate">{config.label(item)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.created_at)}</p>
            </div>
            {config.amount(item) && (
              <span className={`text-sm font-semibold flex-shrink-0 ${
                item.type === 'settlement' ? 'text-green-600' : 'text-purple-600'
              }`}>
                {config.amount(item)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}