const Badge = ({ status, children }) => {
  const styles = {
    draft: 'bg-gray-100 text-gray-700',
    scheduled: 'bg-amber-100 text-amber-700',
    sending: 'bg-blue-100 text-blue-700',
    paused: 'bg-red-100 text-red-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-700',
    opened: 'bg-blue-100 text-blue-700',
    clicked: 'bg-emerald-100 text-emerald-700',
    replied: 'bg-purple-100 text-purple-700',
    bounced: 'bg-red-100 text-red-700',
    sent: 'bg-emerald-100 text-emerald-700'
  };

  const currentStyle = styles[status?.toLowerCase()] || styles.draft;

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border border-white/20 ${currentStyle}`}>
      {children || status}
    </span>
  );
};

export default Badge;
