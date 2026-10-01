import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Edit2, Trash2, Send, X, RotateCw } from 'lucide-react'
import { templates, saveTemplate, updateTemplate, deleteTemplate } from '../services/mailflow.service'
import { formatDate } from '../lib/format'
import EmptyState from '../components/EmptyState'
import Loading from '../components/Loading'
import ConfirmDialog from '../components/ConfirmDialog'
import useToast from '../hooks/useToast'

const emptyForm = { name: '', subject: '', html: '' }

export default function TemplatesPage() {
  const navigate = useNavigate()
  const { notify } = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await templates()
      if (!Array.isArray(result)) {
        throw new Error('Invalid templates response.')
      }
      setItems(result)
    } catch (requestError) {
      console.error('Unable to load templates:', requestError)
      setError(requestError.message || 'Unable to load templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const result = await templates()
        if (cancelled) return
        if (!Array.isArray(result)) {
          throw new Error('Invalid templates response.')
        }
        setItems(result)
      } catch (requestError) {
        if (cancelled) return
        console.error('Unable to load templates:', requestError)
        setError(requestError.message || 'Unable to load templates.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (template) => {
    setEditingId(template._id)
    setForm({
      name: template.name || '',
      subject: template.subject || '',
      html: template.html || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    if (formBusy) return
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError('')
  }

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const validateForm = () => {
    if (!form.name.trim()) return 'Template name is required.'
    if (!form.subject.trim()) return 'Subject is required.'
    if (!form.html.trim()) return 'Message is required.'
    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setFormBusy(true)
    setFormError('')
    try {
      if (editingId) {
        await updateTemplate(editingId, form)
        notify('Template updated.', 'success')
      } else {
        await saveTemplate(form)
        notify('Template saved.', 'success')
      }
      closeModal()
      await load()
    } catch (requestError) {
      console.error('Unable to save template:', requestError)
      setFormError(requestError.message || 'Template could not be saved.')
    } finally {
      setFormBusy(false)
    }
  }

  const handleUse = (template) => {
    navigate('/send', {
      state: {
        templateId: template._id,
        subject: template.subject,
        html: template.html,
      },
    })
  }

  const confirmDelete = (template) => {
    setDeleteId(template._id)
  }

  const performDelete = async () => {
    if (!deleteId) return
    setDeleteBusy(true)
    try {
      await deleteTemplate(deleteId)
      notify('Template deleted.', 'success')
      setDeleteId(null)
      await load()
    } catch (requestError) {
      console.error('Unable to delete template:', requestError)
      notify('Could not delete template.', 'error')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="page-stack templates-page">
      <section className="page-intro">
        <div>
          <h1>Templates</h1>
          <p>Create reusable email templates for faster sending.</p>
        </div>
        <button className="button button-primary" onClick={openCreate} type="button">
          <Plus size={17} /> Create Template
        </button>
      </section>

      {loading ? (
        <section className="panel">
          <Loading label="Loading templates..." />
        </section>
      ) : error ? (
        <section className="panel">
          <div className="error-state" role="alert">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Unable to load this page.
            </span>
            <button className="button button-primary" onClick={load} type="button">
              <RotateCw size={16} /> Try Again
            </button>
          </div>
        </section>
      ) : items.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={FileText}
            title="No templates yet."
            description="Create your first template to reuse subject and message content."
            action={
              <button className="button button-primary" onClick={openCreate} type="button">
                <Plus size={16} /> Create Template
              </button>
            }
          />
        </section>
      ) : (
        <section className="template-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {items.map((template) => (
            <article className="panel template-card" key={template._id} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: 16 }}>{template.name}</strong>
                <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ fontWeight: 500 }}>Subject:</span> {template.subject || '—'}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontWeight: 500 }}>Updated:</span> {formatDate(template.updatedAt || template.createdAt)}
                  </div>
                </div>
                {template.html && (
                  <p style={{
                    fontSize: 13,
                    color: 'var(--color-muted)',
                    marginTop: 8,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.5,
                  }}>
                    {template.html}
                  </p>
                )}
              </div>
              <div className="template-actions" style={{
                display: 'flex',
                gap: 8,
                marginTop: 'auto',
                paddingTop: 8,
                flexWrap: 'wrap',
              }}>
                <button
                  className="button button-primary button-small"
                  onClick={() => handleUse(template)}
                  type="button"
                >
                  <Send size={14} /> Use
                </button>
                <button
                  className="button button-secondary button-small"
                  onClick={() => openEdit(template)}
                  type="button"
                >
                  <Edit2 size={14} /> Edit
                </button>
                <button
                  className="button button-destructive button-small"
                  onClick={() => confirmDelete(template)}
                  type="button"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {modalOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !formBusy) closeModal()
        }}>
          <section className="confirm-dialog template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-title" style={{
            maxWidth: 560,
            width: '90%',
            textAlign: 'left',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}>
              <div>
                <h2 id="template-title">{editingId ? 'Edit Template' : 'Create Template'}</h2>
              </div>
              <button
                className="icon-button"
                onClick={closeModal}
                aria-label="Close"
                type="button"
                disabled={formBusy}
              >
                <X size={18} />
              </button>
            </div>
            <form className="page-stack" onSubmit={handleSubmit} style={{ gap: 14 }}>
              <label>
                Template name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Welcome Email"
                  disabled={formBusy}
                />
              </label>
              <label>
                Subject
                <input
                  required
                  value={form.subject}
                  onChange={(e) => setField('subject', e.target.value)}
                  placeholder="Welcome to MailFlow"
                  disabled={formBusy}
                />
              </label>
              <label>
                Message
                <textarea
                  required
                  rows={8}
                  value={form.html}
                  onChange={(e) => setField('html', e.target.value)}
                  placeholder="Write your template message..."
                  disabled={formBusy}
                  style={{ resize: 'vertical' }}
                />
              </label>
              {formError && <p className="login-error">{formError}</p>}
              <div className="dialog-actions" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={closeModal}
                  disabled={formBusy}
                >
                  Cancel
                </button>
                <button className="button button-primary" disabled={formBusy} type="submit">
                  {formBusy ? 'Saving...' : editingId ? 'Save Changes' : 'Save Template'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this template?"
        description="This action cannot be undone. The template and its content will be permanently removed."
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onConfirm={performDelete}
        onClose={() => !deleteBusy && setDeleteId(null)}
      />
    </div>
  )
}
