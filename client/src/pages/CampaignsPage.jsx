import { useCallback, useState, useEffect, useMemo } from 'react';
import { Mail, BarChart2, Play, Pause, Edit3, Loader2, Copy, FileText, CheckCircle2, Clock, Search, Building2, UserRound, X, MoreVertical, Trash2, Check, Timer, Zap } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '../components/common/DropdownMenu';
import AlertDialog from '../components/common/AlertDialog';
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
  const [selectedCampaigns, setSelectedCampaigns] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, type: 'single' });

  const fetchCampaigns = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
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
  }, [companyFilter, roleFilter, searchTerm]);

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

  const getDerivedStatus = (c) => {
    if (c.status === 'sending') {
      if (c.autopilotState === 'paused_limit') return 'paused_limit';
      if (c.autopilotState === 'paused_window') return 'paused_window';
      return 'running';
    }
    return c.status;
  };

  const getStatusBadge = (camp) => {
    const derivedStatus = getDerivedStatus(camp);
    
    // Status mapping for simple icons without text
    switch(derivedStatus) {
      case 'running':
        return (
          <div className="relative group cursor-help text-green-500" title="Running">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
          </div>
        );
      case 'paused_limit':
        return (
          <div className="relative group cursor-help text-red-500" title="Paused (Daily limit reached)">
            <Pause size={18} fill="currentColor" strokeWidth={0} />
          </div>
        );
      case 'paused_window':
        return (
          <div className="relative group cursor-help text-red-500" title="Paused (Outside schedule)">
            <Pause size={18} fill="currentColor" strokeWidth={0} />
          </div>
        );
      case 'paused':
        return (
          <div className="relative group cursor-help text-red-500" title="Paused">
            <Pause size={18} fill="currentColor" strokeWidth={0} />
          </div>
        );
      case 'scheduled':
        return (
          <div className="relative group cursor-help text-amber-500" title="Scheduled">
            <Clock size={18} />
          </div>
        );
      case 'completed':
        return (
          <div className="relative group cursor-help text-emerald-500" title="Completed">
            <CheckCircle2 size={18} />
          </div>
        );
      case 'draft':
      default:
        return (
          <div className="relative group cursor-help text-gray-400" title="Draft">
            <FileText size={18} />
          </div>
        );
    }
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

  const confirmDelete = (id) => {
    setDeleteConfirm({ isOpen: true, id, type: 'single' });
  };

  const confirmBulkDelete = () => {
    if (selectedCampaigns.size === 0) return;
    setDeleteConfirm({ isOpen: true, id: null, type: 'bulk' });
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteConfirm.type === 'single') {
        await api.delete(`/campaigns/${deleteConfirm.id}`);
        toast.success('Campaign deleted!');
      } else {
        await Promise.all(Array.from(selectedCampaigns).map(id => api.delete(`/campaigns/${id}`)));
        toast.success(`${selectedCampaigns.size} campaigns deleted!`);
        setSelectedCampaigns(new Set());
      }
      await fetchCampaigns();
    } catch {
      toast.error('Failed to delete campaign(s)');
    } finally {
      setIsDeleting(false);
      setDeleteConfirm({ isOpen: false, id: null, type: 'single' });
    }
  };

  const toggleSelection = (campaignId) => {
    const newSelection = new Set(selectedCampaigns);
    if (newSelection.has(campaignId)) {
      newSelection.delete(campaignId);
    } else {
      newSelection.add(campaignId);
    }
    setSelectedCampaigns(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedCampaigns.size === filteredCampaigns.length && filteredCampaigns.length > 0) {
      setSelectedCampaigns(new Set());
    } else {
      setSelectedCampaigns(new Set(filteredCampaigns.map(c => c._id)));
    }
  };

  const tabs = ['All', 'Draft', 'Scheduled', 'Running', 'Paused', 'Completed'];

  const resetFilters = () => {
    setSearchTerm('');
    setCompanyFilter('All');
    setRoleFilter('All');
    setActiveTab('All');
  };

  const filteredCampaigns = useMemo(() => {
    if (activeTab === 'All') return campaigns;
    return campaigns.filter(c => {
      const derived = getDerivedStatus(c).toLowerCase();
      const tabStr = activeTab.toLowerCase();
      if (tabStr === 'paused' && derived.startsWith('paused')) return true;
      return derived === tabStr;
    });
  }, [campaigns, activeTab]);

  const groupedCampaigns = useMemo(() => {
    if (companyFilter === 'All') return null;

    return filteredCampaigns.reduce((groups, campaign) => {
      const role = campaign.roleName || 'No targeted role';
      if (!groups[role]) groups[role] = [];
      groups[role].push(campaign);
      return groups;
    }, {});
  }, [filteredCampaigns, companyFilter]);

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

      <div className="flex justify-between items-center mb-6 border-b border-gray-200">
        <div className="flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`tab-item ${activeTab === tab ? 'tab-item-active' : 'tab-item-inactive'}`}
            >
              {tab}
              <span className="ml-2 text-xs py-0.5 px-2 rounded-full bg-gray-100 text-gray-600 font-normal">
                {tab === 'All' ? campaigns.length : campaigns.filter(c => {
                  const derived = getDerivedStatus(c).toLowerCase();
                  const tabStr = tab.toLowerCase();
                  if (tabStr === 'paused' && derived.startsWith('paused')) return true;
                  return derived === tabStr;
                }).length}
              </span>
            </button>
          ))}
        </div>
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
          {(groupedCampaigns ? Object.entries(groupedCampaigns) : [['All campaigns', filteredCampaigns]]).map(([groupName, groupCampaigns]) => (
            <div key={groupName} className="space-y-3">
              {groupedCampaigns ? (
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    <div className="relative flex items-center justify-center ml-1">
                      <input 
                        type="checkbox" 
                        className={`peer appearance-none w-4 h-4 border-2 rounded transition-colors cursor-pointer ${
                          groupCampaigns.length > 0 && groupCampaigns.every(c => selectedCampaigns.has(c._id))
                            ? 'bg-blue-600 border-blue-600' 
                            : 'border-gray-300 bg-white hover:border-blue-400'
                        }`}
                        checked={groupCampaigns.length > 0 && groupCampaigns.every(c => selectedCampaigns.has(c._id))}
                        onChange={(e) => {
                          const newSelection = new Set(selectedCampaigns);
                          if (e.target.checked) {
                            groupCampaigns.forEach(c => newSelection.add(c._id));
                          } else {
                            groupCampaigns.forEach(c => newSelection.delete(c._id));
                          }
                          setSelectedCampaigns(newSelection);
                        }}
                      />
                      {groupCampaigns.length > 0 && groupCampaigns.every(c => selectedCampaigns.has(c._id)) && (
                        <Check className="absolute text-white pointer-events-none" size={12} strokeWidth={3} />
                      )}
                    </div>
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {groupName}
                    </h2>
                  </div>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                    {groupCampaigns.length} campaign{groupCampaigns.length === 1 ? '' : 's'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-1 pt-1 pb-2 border-b border-gray-100">
                  <div className="relative flex items-center justify-center ml-1">
                    <input 
                      type="checkbox" 
                      className={`peer appearance-none w-4 h-4 border-2 rounded transition-colors cursor-pointer ${
                        filteredCampaigns.length > 0 && selectedCampaigns.size === filteredCampaigns.length
                          ? 'bg-blue-600 border-blue-600' 
                          : 'border-gray-300 bg-white hover:border-blue-400'
                      }`}
                      checked={filteredCampaigns.length > 0 && selectedCampaigns.size === filteredCampaigns.length}
                      onChange={toggleAllSelection}
                    />
                    {filteredCampaigns.length > 0 && selectedCampaigns.size === filteredCampaigns.length && (
                      <Check className="absolute text-white pointer-events-none" size={12} strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-500">Select All</span>
                </div>
              )}

              {groupCampaigns.map(camp => {
            const total = camp.stats?.totalRecipients || 0;
            const sent = camp.stats?.sent || 0;
            const progress = total > 0 ? Math.round((sent / total) * 100) : 0;
            
            return (
              <div 
                key={camp._id} 
                className={`relative p-5 rounded-xl flex flex-col sm:flex-row sm:items-center gap-4 transition-all border-2 group ${
                  selectedCampaigns.has(camp._id) 
                    ? 'border-blue-500 bg-blue-50/20 shadow-sm' 
                    : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm hover:shadow-md'
                }`}
              >
                
                <div className="flex items-center self-start sm:self-center pt-1 sm:pt-0">
                  <div className="relative flex items-center justify-center">
                    <input 
                      type="checkbox" 
                      className={`peer appearance-none w-5 h-5 border-2 rounded transition-colors cursor-pointer ${
                        selectedCampaigns.has(camp._id) 
                          ? 'bg-blue-600 border-blue-600' 
                          : 'border-gray-300 bg-white hover:border-blue-400 opacity-0 group-hover:opacity-100'
                      }`}
                      checked={selectedCampaigns.has(camp._id)}
                      onChange={() => toggleSelection(camp._id)}
                    />
                    {selectedCampaigns.has(camp._id) && (
                      <Check className="absolute text-white pointer-events-none" size={14} strokeWidth={3} />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-gray-800 truncate" style={{ textShadow: '1px 1px 0px rgba(255,255,255,0.8)' }}>
                      <Link to={`/campaigns/${camp._id}`} className="hover:text-blue-600 hover:underline">
                        {camp.name}
                      </Link>
                    </h3>
                    {getStatusBadge(camp)}
                  </div>
                  <div className="text-sm text-gray-500 truncate mb-2 font-medium">
                    {camp.subject || <span className="italic">No subject</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-medium">
                    {camp.companyName && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-md shadow-sm border border-gray-200">
                        <Building2 size={12} /> {camp.companyName}
                      </span>
                    )}
                    {camp.roleName && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md shadow-sm border border-blue-100">
                        <UserRound size={12} /> {camp.roleName}
                      </span>
                    )}
                    {camp.status === 'scheduled' && camp.schedule?.sendAt && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-md shadow-sm border border-amber-100">
                        <Clock size={12} /> {new Date(camp.schedule.sendAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {camp.schedule?.autopilot?.enabled && (
                  <div className="hidden sm:flex flex-col items-center justify-center text-center px-6 border-l border-r border-gray-100 min-w-[140px]">
                    <div className="flex flex-col items-center justify-center text-gray-400" title="Time gap between emails">
                      {camp.schedule.autopilot.delayMinutes > 0 ? (
                        <>
                          <Clock size={16} />
                          <span className="text-[11px] leading-none mt-1.5 font-medium">{camp.schedule.autopilot.delayMinutes} min</span>
                        </>
                      ) : (
                        <>
                          <Zap size={16} className="text-amber-500" />
                          <span className="text-[11px] leading-none mt-1.5 font-medium text-amber-600">Burst</span>
                        </>
                      )}
                    </div>
                    {['paused_limit', 'paused_window'].includes(camp.autopilotState) && camp.autopilotNextRun && (
                      <div className="mt-2 text-[10px] text-red-500 font-medium leading-tight">
                        Will resume at:<br/>
                        {new Date(camp.autopilotNextRun).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    )}
                  </div>
                )}

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
                  {camp.status === 'draft' || camp.status === 'paused' ? (
                    <Link to={`/campaigns/new?id=${camp._id}`} className="btn-outline text-sm gap-2 bg-white">
                      <Edit3 size={16} /> Edit
                    </Link>
                  ) : (
                    <Link to={`/campaigns/${camp._id}`} className="btn-outline text-sm gap-2 bg-white">
                      <BarChart2 size={16} /> Analytics
                    </Link>
                  )}
                  
                  <DropdownMenu 
                    align="end"
                    trigger={
                      <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ml-1">
                        <MoreVertical size={18} />
                      </button>
                    }
                  >
                    <DropdownMenuItem onClick={() => handleAction(camp._id, 'duplicate')}>
                      <Copy size={16} /> Duplicate
                    </DropdownMenuItem>
                    
                    {camp.status === 'sending' && (
                      <DropdownMenuItem onClick={() => handleAction(camp._id, 'pause')}>
                        <Pause size={16} /> Pause
                      </DropdownMenuItem>
                    )}
                    {camp.status === 'paused' && (
                      <DropdownMenuItem onClick={() => handleAction(camp._id, 'resume')}>
                        <Play size={16} /> Resume
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem 
                      destructive
                      onClick={() => confirmDelete(camp._id)}
                    >
                      <Trash2 size={16} /> Delete
                    </DropdownMenuItem>
                  </DropdownMenu>
                </div>

                <div className="absolute bottom-1.5 right-3 text-[9px] font-medium text-gray-400 opacity-70">
                  Created {new Date(camp.createdAt).toLocaleDateString()}
                </div>
              </div>
            );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedCampaigns.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-6 py-3 bg-gray-900 text-white rounded-full shadow-2xl transition-all animate-in slide-in-from-bottom-8 duration-300">
          <span className="text-sm font-medium">{selectedCampaigns.size} selected</span>
          <div className="w-px h-4 bg-gray-600"></div>
          <button 
            onClick={confirmBulkDelete} 
            disabled={isDeleting}
            className="text-sm font-medium text-red-400 hover:text-red-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Trash2 size={16} /> Delete
          </button>
          <button 
            onClick={() => setSelectedCampaigns(new Set())}
            className="text-gray-400 hover:text-white p-1 ml-2 transition-colors rounded-full hover:bg-gray-800"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => !isDeleting && setDeleteConfirm({ isOpen: false, id: null, type: 'single' })}
        onConfirm={executeDelete}
        title={deleteConfirm.type === 'single' ? "Delete Campaign" : "Delete Selected Campaigns"}
        description={
          deleteConfirm.type === 'single'
            ? "Are you sure you want to delete this campaign? This action cannot be undone and all associated recipients and tracking data will be permanently removed."
            : `Are you sure you want to delete ${selectedCampaigns.size} campaigns? This action cannot be undone and will permanently remove all associated data.`
        }
        confirmText="Delete"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default CampaignsPage;
