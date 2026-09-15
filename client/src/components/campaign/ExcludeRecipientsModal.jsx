import { useState } from 'react';
import { X, Search } from 'lucide-react';

const ExcludeRecipientsModal = ({ isOpen, onClose, recipientsData, excludedRecipients, onSave }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [localExcluded, setLocalExcluded] = useState(new Set(excludedRecipients));

  if (!isOpen) return null;

  const filteredRecipients = recipientsData.filter(r => {
    const email = r.email || r.Email || r.EMAIL || Object.values(r)[0];
    return email && email.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const toggleExclude = (email) => {
    const newExcluded = new Set(localExcluded);
    if (newExcluded.has(email)) {
      newExcluded.delete(email);
    } else {
      newExcluded.add(email);
    }
    setLocalExcluded(newExcluded);
  };

  const handleSave = () => {
    onSave(Array.from(localExcluded));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Exclude Recipients</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search recipients by email..." 
              className="input-field pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredRecipients.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No recipients found.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredRecipients.map((r, i) => {
                const email = r.email || r.Email || r.EMAIL || Object.values(r)[0];
                const isExcluded = localExcluded.has(email);
                return (
                  <label key={i} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isExcluded ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                      checked={isExcluded}
                      onChange={() => toggleExclude(email)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{email}</div>
                    </div>
                    {isExcluded && <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded-full">Excluded</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Exclusions ({localExcluded.size})</button>
        </div>
      </div>
    </div>
  );
};

export default ExcludeRecipientsModal;
