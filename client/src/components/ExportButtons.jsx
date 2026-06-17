import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExportButtons({ groupId }) {
  const [loading, setLoading] = useState(null);

  const download = async (format) => {
    setLoading(format);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `http://localhost:5000/api/groups/${groupId}/report?format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error('Failed to generate report');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splitsmart-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded!`);
    } catch (err) {
      toast.error('Failed to generate report');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => download('pdf')}
        disabled={loading !== null}
        className="flex items-center gap-2 border border-purple-600 text-purple-600 px-3 py-2 rounded-xl text-xs font-medium hover:bg-purple-50 transition-colors disabled:opacity-50"
      >
        <Download size={14} />
        {loading === 'pdf' ? 'Generating...' : 'PDF'}
      </button>
      <button
        onClick={() => download('csv')}
        disabled={loading !== null}
        className="flex items-center gap-2 border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <Download size={14} />
        {loading === 'csv' ? 'Generating...' : 'CSV'}
      </button>
    </div>
  );
}