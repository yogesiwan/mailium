import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Mail, LayoutTemplate, BarChart2, Settings, ChevronLeft, ChevronRight, Send } from 'lucide-react';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  const navItems = [
    { to: '/campaigns', icon: <Mail size={20} />, label: 'Campaigns' },
    { to: '/templates', icon: <LayoutTemplate size={20} />, label: 'Templates' },
  ];

  const productItems = [
    { to: '/analytics', icon: <BarChart2 size={20} />, label: 'Analytics' },
  ];

  return (
    <aside className={`flex flex-col bg-slate-900 text-white transition-all duration-300 ease-in-out border-r border-slate-800 ${collapsed ? 'w-16' : 'w-64'}`}>
      <div className="flex items-center h-16 px-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-600 shrink-0">
            <Send size={16} className="text-white ml-0.5" />
          </div>
          {!collapsed && <span className="font-semibold text-xl tracking-tight">Mailium</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
        {navItems.map((item) => (
          <NavLink 
            key={item.to} 
            to={item.to} 
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <div className="shrink-0">{item.icon}</div>
            {!collapsed && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}
          </NavLink>
        ))}

        {!collapsed && <div className="mt-6 mb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Products</div>}
        {collapsed && <div className="mt-4 mb-2 mx-2 border-t border-slate-700" />}

        {productItems.map((item) => (
          <NavLink 
            key={item.to} 
            to={item.to} 
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <div className="shrink-0">{item.icon}</div>
            {!collapsed && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}
          </NavLink>
        ))}
      </div>

      <div className="p-3 border-t border-slate-800 flex flex-col gap-1">
        <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
          <div className="shrink-0"><Settings size={20} /></div>
          {!collapsed && <span className="font-medium text-sm whitespace-nowrap">Settings</span>}
        </NavLink>
        
        <button 
          className="flex items-center gap-3 px-3 py-2 mt-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" 
          onClick={toggleSidebar}
        >
          <div className="shrink-0">
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </div>
          {!collapsed && <span className="font-medium text-sm whitespace-nowrap">Collapse</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
