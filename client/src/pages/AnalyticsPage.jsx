import { useEffect, useState } from 'react';
import api from '../api';
import { BarChart2, MousePointerClick, MailOpen, Reply } from 'lucide-react';

const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/analytics/overview');
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) return (
    <div className="flex justify-center items-center h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
  if (!data) return <div className="text-center mt-20 text-gray-500">Failed to load analytics</div>;

  const { stats, rates, byCompany, byRole } = data;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-8">Global Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
              <BarChart2 size={24} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Total Sent</div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalSent}</div>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-full">
              <MailOpen size={24} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Average Open Rate</div>
              <div className="text-2xl font-bold text-gray-900">{rates.openRate}%</div>
              <div className="text-xs text-gray-500">{stats.totalOpened} opened</div>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
              <MousePointerClick size={24} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Average Click Rate</div>
              <div className="text-2xl font-bold text-gray-900">{rates.clickRate}%</div>
              <div className="text-xs text-gray-500">{stats.totalClicked} clicked</div>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-full">
              <Reply size={24} />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Average Reply Rate</div>
              <div className="text-2xl font-bold text-gray-900">{rates.replyRate}%</div>
              <div className="text-xs text-gray-500">{stats.totalReplied} replied</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Companies</h3>
          {byCompany.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Company</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Opened</th>
                    <th className="px-4 py-3 rounded-r-lg">Replied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byCompany.map(c => (
                    <tr key={c._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{c._id}</td>
                      <td className="px-4 py-3">{c.sent}</td>
                      <td className="px-4 py-3">{c.opened}</td>
                      <td className="px-4 py-3">{c.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No data available</div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Roles</h3>
          {byRole.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Role</th>
                    <th className="px-4 py-3">Sent</th>
                    <th className="px-4 py-3">Opened</th>
                    <th className="px-4 py-3 rounded-r-lg">Replied</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {byRole.map(r => (
                    <tr key={r._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{r._id}</td>
                      <td className="px-4 py-3">{r.sent}</td>
                      <td className="px-4 py-3">{r.opened}</td>
                      <td className="px-4 py-3">{r.replied}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No data available</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
