import React from 'react';
import { Paperclip, FileText, Download } from 'lucide-react';

const AttachmentViewer = ({ attachments = [] }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="bg-gray-50/50 border-t border-gray-100 p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <Paperclip size={16} className="text-gray-400" />
        Attachments ({attachments.length})
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {attachments.map((att, idx) => {
          // Fallbacks for draft/unsaved files vs uploaded files
          const fileName = att.originalName || att.name || att.filename || 'Unknown File';
          const isUploaded = !!att.path;
          
          // Form absolute URL if possible
          let href = '#';
          if (isUploaded) {
            // Check if VITE_API_URL has a trailing slash or not
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const normalizedPath = att.path.startsWith('/') ? att.path : `/${att.path}`;
            href = `${baseUrl}${normalizedPath}`;
          }
          
          return (
            <a
              key={idx}
              href={href}
              target={isUploaded ? "_blank" : undefined}
              rel={isUploaded ? "noopener noreferrer" : undefined}
              className={`flex items-center p-3 bg-white hover:bg-indigo-50/50 border border-gray-200 hover:border-indigo-100 rounded-xl transition-all group ${!isUploaded ? 'cursor-not-allowed opacity-70' : ''}`}
              title={!isUploaded ? "Save draft to download" : `Download ${fileName}`}
              onClick={(e) => {
                if (!isUploaded) e.preventDefault();
              }}
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center mr-3 shrink-0">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate group-hover:text-indigo-700 transition-colors">
                  {fileName}
                </p>
                <p className="text-xs text-gray-400">
                  {att.size ? `${Math.round(att.size / 1024)} KB` : 'Unknown Size'}
                </p>
              </div>
              {isUploaded && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-indigo-100 hover:text-indigo-600 shrink-0">
                  <Download size={16} />
                </div>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default AttachmentViewer;
