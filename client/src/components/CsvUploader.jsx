import { useRef, useState } from 'react'
import { FileSpreadsheet, FileUp, UploadCloud } from 'lucide-react'

export default function CsvUploader({ onUpload, uploading = false, progress = 0, disabled = false, deferUpload = false }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)

  const chooseFile = (nextFile) => {
    if (nextFile && /\.csv$/i.test(nextFile.name)) setFile(nextFile)
  }
  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files[0])
  }

  return (
    <div className={`upload-zone${dragging ? ' upload-zone-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(event) => chooseFile(event.target.files[0])} aria-label="Choose recipient CSV" />
      <span className="upload-icon"><UploadCloud size={24} /></span>
      {file ? <div className="upload-file"><FileSpreadsheet size={17} /><span>{file.name}<small>{(file.size / 1024).toFixed(1)} KB</small></span></div> : <><strong>Drop your CSV file here</strong><span>or choose a file from your device</span></>}
      <button type="button" className="button button-secondary button-small" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}><FileUp size={15} /> Choose CSV</button>
      <span className="upload-format">CSV with <code>name</code> and <code>email</code> columns</span>
      {uploading && <div className="upload-progress"><div><span>Uploading recipients...</span><strong>{progress}%</strong></div><div className="progress-track"><span className="progress-fill" style={{ width: `${progress}%` }} /></div></div>}
      {file && !uploading && <button type="button" className="button button-primary" disabled={disabled} onClick={() => onUpload(file)}>{deferUpload ? 'Attach CSV' : 'Upload recipients'}</button>}
    </div>
  )
}