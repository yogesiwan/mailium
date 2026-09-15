import { useEffect, useState } from 'react';
import { MailOpen, MousePointerClick, Reply, Clock, Loader2 } from 'lucide-react';
import api from '../../api';

const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: 'numeric',
  hour12: true,
  month: 'short',
  day: 'numeric'
});

const getEventIcon = (type) => {
  switch (type) {
    case 'open':
      return <div className="p-2 bg-amber-50 text-amber-600 rounded-full shadow-sm ring-1 ring-amber-100/50"><MailOpen size={16} /></div>;
    case 'click':
      return <div className="p-2 bg-blue-50 text-blue-600 rounded-full shadow-sm ring-1 ring-blue-100/50"><MousePointerClick size={16} /></div>;
    case 'reply':
      return <div className="p-2 bg-emerald-50 text-emerald-600 rounded-full shadow-sm ring-1 ring-emerald-100/50"><Reply size={16} /></div>;
    default:
      return <div className="p-2 bg-gray-50 text-gray-600 rounded-full shadow-sm ring-1 ring-gray-100/50"><Clock size={16} /></div>;
  }
};

const getEventText = (event) => {
  const name = event.recipientId?.data?.name || event.recipientId?.data?.Name || event.recipientId?.email || 'Unknown';
  switch (event.type) {
    case 'open': return <span><span className="font-semibold text-gray-900">{name}</span> opened your email</span>;
    case 'click': return <span><span className="font-semibold text-gray-900">{name}</span> clicked a link</span>;
    case 'reply': return <span><span className="font-semibold text-gray-900">{name}</span> replied</span>;
    default: return <span><span className="font-semibold text-gray-900">{name}</span> interacted</span>;
  }
};

const RecentActivityFeed = () => {
  const [timeframe, setTimeframe] = useState('today');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/analytics/recent-activity?timeframe=${timeframe}&limit=50`);
        if (res.data.success) {
          setEvents(res.data.events);
        }
      } catch (err) {
        console.error('Failed to fetch recent activity:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
    
    const intervalId = setInterval(fetchEvents, 30000); // Auto refresh every 30s
    return () => clearInterval(intervalId);
  }, [timeframe]);

  return (
    <div className="card bg-white shadow-sm border border-gray-100 mt-8 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </span>
            Live Activity Feed
          </h3>
          <p className="text-sm text-gray-500 mt-1">Real-time interactions from your campaigns</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {['15m', '1h', 'today', 'all'].map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${timeframe === tf ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tf === '15m' ? 'Last 15m' : tf === '1h' ? 'Last Hour' : tf === 'today' ? 'Today' : 'All-Time'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-50/30 p-2 min-h-[300px]">
        {loading && events.length === 0 ? (
          <div className="flex justify-center items-center h-48">
            <Loader2 className="animate-spin text-blue-500" size={24} />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Clock size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No activity found for this timeframe</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100/50">
            {events.map(event => (
              <div key={event._id} className="p-4 hover:bg-white transition-colors rounded-xl flex items-start gap-4">
                {getEventIcon(event.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    {getEventText(event)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    Campaign: <span className="font-medium text-gray-700">{event.campaignId?.name || 'Unknown'}</span>
                  </p>
                </div>
                <div className="text-xs text-gray-400 whitespace-nowrap pt-0.5 font-medium">
                  {timeFormat.format(new Date(event.createdAt))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentActivityFeed;
