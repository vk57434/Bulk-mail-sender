import { useState } from 'react'
import { Code2, Eye } from 'lucide-react'
import EmailPreview from './EmailPreview'

export default function EmailEditor({ value, onChange, error }) {
  const [mode, setMode] = useState('edit')
  return (
    <div className="editor-block">
      <div className="editor-heading"><div><label htmlFor="campaign-html">HTML email content</label><p>Personalize the message with <code>{'{{name}}'}</code> and <code>{'{{email}}'}</code>.</p></div>
        <div className="segmented" aria-label="Email editor mode">
          <button type="button" className={mode === 'edit' ? 'selected' : ''} onClick={() => setMode('edit')}><Code2 size={15} /> Edit</button>
          <button type="button" className={mode === 'preview' ? 'selected' : ''} onClick={() => setMode('preview')}><Eye size={15} /> Preview</button>
        </div>
      </div>
      {mode === 'edit' ? <textarea id="campaign-html" className={`code-editor${error ? ' input-error' : ''}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={'<h1>Hello {{name}}</h1>\n<p>Your message goes here.</p>'} spellCheck="false" /> : <EmailPreview html={value} />}
      {error && <span className="field-error">{error}</span>}
      <span className="helper-text">Available variables: <code>{'{{name}}'}</code> <code>{'{{email}}'}</code></span>
    </div>
  )
}