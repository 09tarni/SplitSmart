import { useState } from 'react';
import api from '../utils/api';
import { Sparkles, RefreshCw } from 'lucide-react';

export default function AIInsights({ groupId }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/groups/${groupId}/insights`);
      setInsights(data.data.insights);
    } catch {
      setError('Failed to generate insights. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ICONS = ['📊', '💡', '🎯', '💰'];

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Sparkles size={16} className="text-purple-500" />
            AI Spending Insights
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Powered by Llama 3.3 (Groq)</p>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="flex items-center gap-2 bg-purple-600 text-white px-3 py-2 rounded-xl text-xs font-medium hover:bg-purple-700 transition-colors disabled:opacity-60"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Analyzing...' : insights ? 'Refresh' : 'Generate Insights'}
        </button>
      </div>

      {!insights && !loading && !error && (
        <div className="text-center py-8 text-gray-400">
          <Sparkles size={32} className="mx-auto mb-2 text-purple-200" />
          <p className="text-sm font-medium">Get AI-powered analysis</p>
          <p className="text-xs mt-1">Click Generate to analyze your group's spending patterns</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3 py-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-6 text-red-400">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {insights && !loading && (
        <div className="space-y-3">
          {insights.map((insight, i) => (
            <div key={i} className="flex gap-3 p-3 bg-purple-50 rounded-xl">
              <span className="text-lg flex-shrink-0 mt-0.5">{ICONS[i] || '💡'}</span>
              <p className="text-sm text-gray-700 leading-relaxed">{insight}</p>
            </div>
          ))}
          <p className="text-xs text-gray-400 text-center pt-1">
            AI insights are based on your group's expense history
          </p>
        </div>
      )}
    </div>
  );
}