import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const Combobox = ({ value, onChange, options, placeholder, icon: Icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const wrapperRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = query === '' 
    ? options 
    : options.filter((option) =>
        option.toLowerCase().includes(query.toLowerCase())
      );

  const showAddOption = query !== '' && !options.some(o => o.toLowerCase() === query.toLowerCase());

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          {Icon && <Icon size={16} />}
        </div>
        <input
          type="text"
          className={`w-full text-sm rounded-lg border border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors bg-white py-2.5 ${Icon ? 'pl-9' : 'pl-3'} pr-8 text-gray-900 placeholder-gray-400`}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
          <ChevronDown 
            size={16} 
            className={`text-gray-400 transition-transform cursor-pointer ${isOpen ? 'rotate-180' : ''}`} 
            onClick={() => setIsOpen(!isOpen)}
          />
        </div>
      </div>

      {isOpen && (options.length > 0 || showAddOption) && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {filteredOptions.length === 0 && !showAddOption ? (
            <li className="relative cursor-default select-none py-2 px-4 text-gray-500">
              Nothing found.
            </li>
          ) : (
            filteredOptions.map((option, idx) => (
              <li
                key={idx}
                className="relative cursor-pointer select-none py-2 pl-4 pr-4 text-gray-900 hover:bg-indigo-50 hover:text-indigo-900 transition-colors"
                onClick={() => {
                  setQuery(option);
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                {option}
              </li>
            ))
          )}
          {showAddOption && (
            <li
              className="relative cursor-pointer select-none py-2 pl-4 pr-4 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 transition-colors font-medium border-t border-indigo-100"
              onClick={() => {
                setQuery(query);
                onChange(query);
                setIsOpen(false);
              }}
            >
              Add "{query}"
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default Combobox;
