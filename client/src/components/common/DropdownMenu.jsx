import { useState, useRef, useEffect } from 'react';

export const DropdownMenu = ({ trigger, children, align = 'end' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const alignmentClasses = {
    end: 'right-0 origin-top-right',
    start: 'left-0 origin-top-left',
    center: 'left-1/2 -translate-x-1/2 origin-top'
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        {trigger}
      </div>

      {isOpen && (
        <div 
          className={`absolute z-10 mt-2 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none transition-all duration-100 ease-out transform scale-100 opacity-100 py-1 ${alignmentClasses[align]}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export const DropdownMenuItem = ({ children, onClick, className = '', destructive = false }) => {
  return (
    <button
      className={`group flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors ${
        destructive 
          ? 'text-red-600 hover:bg-red-50 hover:text-red-700' 
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

export const DropdownMenuSeparator = () => (
  <div className="h-px bg-gray-100 my-1 w-full" />
);
