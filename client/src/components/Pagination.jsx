import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, pages, total, pageSize = 50, onPageChange }) {
  if (!pages || pages <= 1) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <div className="pagination">
      <span>Showing {first}–{last} of {total.toLocaleString()}</span>
      <div className="pagination-controls">
        <button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={17} /></button>
        <span className="page-count">{page} / {pages}</span>
        <button type="button" className="icon-button" aria-label="Next page" disabled={page >= pages} onClick={() => onPageChange(page + 1)}><ChevronRight size={17} /></button>
      </div>
    </div>
  )
}