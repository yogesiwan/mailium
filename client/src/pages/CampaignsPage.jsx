import { useCallback, useState, useEffect, useMemo } from 'react';
import { Mail, BarChart2, Play, Pause, Edit3, Loader2, Copy, FileText, CheckCircle2, Clock, Search, Building2, UserRound, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';

const CampaignsPage = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [filters, setFilters] = useState({ companies: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');

  const fetchCampaigns = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (activeTab !== 'All') params.set('status', activeTab.toLowerCase());
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (companyFilter !== 'All') params.set('companyName', companyFilter);
      if (roleFilter !== 'All') params.set('roleName', roleFilter);

      const res = await api.get(`/campaigns?${params.toString()}`);
      setCampaigns(res.data.campaigns);
    } catch (err) {
      toast.error('Failed to load campaigns');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, companyFilter, roleFilter, searchTerm]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const res = await api.get('/campaigns/filters');
        setFilters({
          companies: res.data.companies || [],
          roles: res.data.roles || []
        });
      } catch (err) {
        console.error('Failed to load campaign filters:', err);
      }
    };

    fetchFilters();
  }, []);

  const getStatusIcon = (status) => {
    switch(status) {
      case 'sending': return <Play size={14} />;
      case 'paused': return <Pause size={14} />;
      case 'completed': return <CheckCircle2 size={14} />;
      case 'draft': return <FileText size={14} />;
      case 'scheduled': return <Clock size={14} />;
      default: return null;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700 border-gray-200',
      scheduled: 'bg-amber-100 text-amber-700 border-amber-200',
      sending: 'bg-blue-100 text-blue-700 border-blue-200',
      paused: 'bg-red-100 text-red-700 border-red-200',
      completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      failed: 'bg-red-100 text-red-800 border-red-200'
    };
    
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.draft} flex items-center gap-1 capitalize`}>
        {getStatusIcon(status)}
        {status}
      </span>
    );
  };

  const handleAction = async (campaignId, action) => {
    try {
      if (action === 'duplicate') {
        await api.post(`/campaigns/${campaignId}/duplicate`);
        toast.success('Campaign duplicated!');
      } else {
        await api.post(`/campaigns/${campaignId}/${action}`);
        toast.success(`Campaign ${action}d!`);
      }
      await fetchCampaigns();
    } catch {
      toast.error(`Failed to ${action} campaign`);
    }
  };

  const tabs = ['All', 'Draft', 'Scheduled', 'Sending', 'Paused', 'Completed'];

  const resetFilters = () => {
    setSearchTerm('');
    setCompanyFilter('All');
    setRoleFilter('All');
    setActiveTab('All');
  };

  const groupedCampaigns = useMemo(() => {
    if (companyFilter === 'All') return null;

    return campaigns.reduce((groups, campaign) => {
      const role = campaign.roleName || 'No targeted role';
      if (!groups[role]) groups[role] = [];
      groups[role].push(campaign);
      return groups;
    }, {});
  }, [campaigns, companyFilter]);

  const roleOptions = useMemo(() => {
    if (companyFilter === 'All') return filters.roles;
    const rolesForCompany = campaigns
      .map(campaign => campaign.roleName)
      .filter(Boolean);
    return Array.from(new Set([...filters.roles, ...rolesForCompany])).sort((a, b) => a.localeCompare(b));
  }, [filters.roles, campaigns, companyFilter]);

  const hasActiveFilters = searchTerm || companyFilter !== 'All' || roleFilter !== 'All' || activeTab !== 'All';

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        <Link to="/campaigns/new" className="btn-primary gap-2 shadow-sm">
          <Mail size={18} /> New Campaign
        </Link>
      </div>

      <div className="flex space-x-8 mb-6 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-item ${activeTab === tab ? 'tab-item-active' : 'tab-item-inactive'}`}
          >
            {tab}
            <span className="ml-2 text-xs py-0.5 px-2 rounded-full bg-gray-100 text-gray-600 font-normal">
              {tab === 'All' ? campaigns.length : campaigns.filter(c => c.status.toLowerCase() === tab.toLowerCase()).length}
            </span>
          </button>
        ))}
      </div>

      <div className="card p-4 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_220px_auto] gap-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search campaigns, companies, roles, subjects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <label className="relative">
            <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={companyFilter}
              onChange={(e) => {
                setCompanyFilter(e.target.value);
                setRoleFilter('All');
              }}
            >
              <option value="All">All companies</option>
              {filters.companies.map(company => (
                <option key={company} value={company}>{company}</option>
              ))}
            </select>
          </label>

          <label className="relative">
            <UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="All">All targeted roles</option>
              {roleOptions.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <button className="btn-outline text-sm gap-2" onClick={resetFilters}>
              <X size={16} /> Clear
            </button>
          )}
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Mail size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No campaigns found</h3>
          <p className="text-gray-500 mb-6">
            {hasActiveFilters ? 'No campaigns match the selected filters.' : `You don't have any ${activeTab !== 'All' ? activeTab.toLowerCase() : ''} campaigns yet.`}
          </p>
          {!hasActiveFilters && activeTab === 'All' && (
            <Link to="/campaigns/new" className="btn-primary">Create Campaign</Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {(groupedCampaigns ? Object.entries(groupedCampaigns) : [['All campaigns', campaigns]]).map(([groupName, groupCampaigns]) => (
            <div key={groupName} className="space-y-3">
              {groupedCampaigns && (
                <div className="flex items-center justify-between pt-2">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {groupName}
                  </h2>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                    {groupCampaigns.length} campaign{groupCampaigns.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}
              {groupCampaigns.map(camp => {
            const total = camp.stats?.totalRecipients || 0;
            const sent = camp.stats?.sent || 0;
            const progress = total > 0 ? Math.round((sent / total) * 100) : 0;
            
            return (
              <div key={camp._id} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md transition-shadow">
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      <Link to={`/campaigns/${camp._id}`} className="hover:text-blue-600 hover:underline">
                        {camp.name}
                      </Link>
                    </h3>
                    {getStatusBadge(camp.status)}
                  </div>
                  <div className="text-sm text-gray-500 truncate mb-1">
                    Subject: {camp.subject || <span className="italic">No subject</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {camp.companyName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        <Building2 size={12} /> {camp.companyName}
                      </span>
                    )}
                    {camp.roleName && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                        <UserRound size={12} /> {camp.roleName}
                      </span>
                    )}
                    <span>
                    Created on {new Date(camp.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="w-full sm:w-64 px-4 hidden md:block">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500 font-medium">Progress</span>
                    <span className="text-gray-900 font-semibold">{sent} / {total} sent</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${progress}%` }} 
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:ml-auto">
                  <button 
                    onClick={() => handleAction(camp._id, 'duplicate')} 
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Duplicate"
                  >
                    <Copy size={18} />
                  </button>
                  
                  {camp.status === 'draft' ? (
                    <Link to={`/campaigns/new?id=${camp._id}`} className="btn-outline text-sm gap-2">
                      <Edit3 size={16} /> Edit
                    </Link>
                  ) : (
                    <Link to={`/campaigns/${camp._id}`} className="btn-outline text-sm gap-2">
                      <BarChart2 size={16} /> Analytics
                    </Link>
                  )}
                  
                  {camp.status === 'sending' && (
                    <button 
                      className="p-2 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors" 
                      title="Pause" 
                      onClick={() => handleAction(camp._id, 'pause')}
                    >
                      <Pause size={18} />
                    </button>
                  )}
                  {camp.status === 'paused' && (
                    <button 
                      className="p-2 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors" 
                      title="Resume" 
                      onClick={() => handleAction(camp._id, 'resume')}
                    >
                      <Play size={18} />
                    </button>
                  )}
                </div>
              </div>
            );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CampaignsPage;
