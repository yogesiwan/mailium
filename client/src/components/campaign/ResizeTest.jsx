import React, { useState } from 'react';

export default function ResizeTest() {
  const [text, setText] = useState('');
  return (
    <div className="p-10">
      <div className="resize-y overflow-auto border bg-gray-100 min-h-[100px]">
        <textarea 
          value={text} 
          onChange={e => setText(e.target.value)} 
          className="w-full h-full bg-transparent"
        />
      </div>
    </div>
  );
}
