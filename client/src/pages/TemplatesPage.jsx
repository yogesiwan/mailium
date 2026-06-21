import React from 'react';
import { LayoutTemplate, Plus } from 'lucide-react';

const TemplatesPage = () => {
  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
        <button className="btn-primary gap-2 shadow-sm">
          <Plus size={18} /> New Template
        </button>
      </div>

      <div className="card p-12 text-center border-dashed border-2">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <LayoutTemplate size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No templates yet</h3>
        <p className="text-gray-500 mb-6 max-w-md mx-auto">Save your best performing emails as templates to reuse them later across multiple campaigns.</p>
        <button className="btn-primary">Create Template</button>
      </div>
    </div>
  );
};

export default TemplatesPage;
