import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { Link } from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, RemoveFormatting, Code, GripHorizontal } from 'lucide-react';

const MenuBar = ({ editor }) => {
  if (!editor) return null;

  const btnClass = "p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none";
  const activeBtnClass = "p-1.5 rounded bg-blue-100 text-blue-600 font-medium transition-colors focus:outline-none";
  const dividerClass = "w-[1px] h-5 bg-gray-200 mx-1";

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? activeBtnClass : btnClass}
        title="Bold"
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? activeBtnClass : btnClass}
        title="Italic"
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={editor.isActive('underline') ? activeBtnClass : btnClass}
        title="Underline"
      >
        <UnderlineIcon size={16} />
      </button>

      <div className={dividerClass} />

      <button
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={editor.isActive({ textAlign: 'left' }) ? activeBtnClass : btnClass}
        title="Align Left"
      >
        <AlignLeft size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={editor.isActive({ textAlign: 'center' }) ? activeBtnClass : btnClass}
        title="Align Center"
      >
        <AlignCenter size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        className={editor.isActive({ textAlign: 'right' }) ? activeBtnClass : btnClass}
        title="Align Right"
      >
        <AlignRight size={16} />
      </button>

      <div className={dividerClass} />

      <button
        onClick={() => {
          const url = window.prompt('URL');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          } else if (url === '') {
            editor.chain().focus().unsetLink().run();
          }
        }}
        className={editor.isActive('link') ? activeBtnClass : btnClass}
        title="Link"
      >
        <LinkIcon size={16} />
      </button>
      
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? activeBtnClass : btnClass}
        title="Code Block"
      >
        <Code size={16} />
      </button>

      <div className={dividerClass} />

      <button
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        className={btnClass}
        title="Clear Formatting"
      >
        <RemoveFormatting size={16} />
      </button>
    </div>
  );
};

import { Extension } from '@tiptap/core';

const CustomEnter = Extension.create({
  name: 'customEnter',
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
          return false; 
        }
        return editor.commands.setHardBreak();
      },
    };
  },
});

const ComposeEditor = ({ value, onChange, availablePlaceholders = [], isReadOnly = false }) => {
  const valueRef = useRef(value || '');
  const [editorHeight, setEditorHeight] = useState(400);
  const resizeRef = useRef(null);

  useEffect(() => {
    valueRef.current = value || '';
  }, [value]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
      }),
      TextStyle,
      Color,
      CustomEnter,
    ],
    content: value || '',
    editable: !isReadOnly,
    onUpdate: ({ editor }) => {
      const nextHtml = editor.getHTML();
      if (onChange && nextHtml !== valueRef.current) onChange(nextHtml);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-6 text-gray-800'
      }
    }
  });

  useEffect(() => {
    if (editor && value !== undefined) {
      if (editor.getHTML() !== value) {
        editor.commands.setContent(value || '', { emitUpdate: false });
      }
    }
  }, [editor, value]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  const insertPlaceholder = (placeholder) => {
    if (editor) {
      editor.chain().focus().insertContent(`{{${placeholder}}}`).run();
    }
  };

  const startResizing = (mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    const startY = mouseDownEvent.clientY;
    const startHeight = editorHeight;

    const onMouseMove = (mouseMoveEvent) => {
      const newHeight = startHeight + mouseMoveEvent.clientY - startY;
      setEditorHeight(Math.max(200, Math.min(newHeight, 1200)));

      // Auto-scroll logic when dragging near the bottom bounds
      if (resizeRef.current) {
        const handleRect = resizeRef.current.getBoundingClientRect();
        const scrollContainer = resizeRef.current.closest('.overflow-y-auto, .overflow-auto, .follow-up-list-scroll');
        
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          // If the handle is pushed below the visible area of its container
          if (handleRect.bottom > containerRect.bottom - 20) {
            scrollContainer.scrollTop += handleRect.bottom - containerRect.bottom + 20;
          }
        }
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div 
      className="flex flex-col relative bg-white rounded-b-xl border border-gray-200 shadow-sm"
      style={{ height: editorHeight ? `${editorHeight}px` : '100%' }}
    >
      {!isReadOnly && <MenuBar editor={editor} />}
      {availablePlaceholders.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 flex gap-2 items-center bg-blue-50/30 overflow-x-auto">
          <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Insert variable:</span>
          {availablePlaceholders.map(ph => (
            <button 
              key={ph} 
              onClick={() => insertPlaceholder(ph)}
              className="text-xs font-medium px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap shadow-sm"
            >
              {ph}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto cursor-text px-4 py-2">
        <EditorContent editor={editor} className="min-h-full" />
      </div>

      {/* Custom Resize Handle (Corner) */}
      {!isReadOnly && (
        <div 
          ref={resizeRef}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize text-gray-400 hover:text-blue-600 transition-colors z-10 flex items-end justify-end p-1"
          onMouseDown={startResizing}
          title="Drag to resize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0L0 12H12V0Z" fill="transparent" />
            <path d="M8 12L12 8V10L10 12H8Z" fill="currentColor" />
            <path d="M4 12L12 4V6L6 12H4Z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default ComposeEditor;
