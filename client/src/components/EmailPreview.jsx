function safePreview(html) {
  const parser = new DOMParser()
  const documentPreview = parser.parseFromString(html || '', 'text/html')
  documentPreview.querySelectorAll('script, iframe, object, embed, form, base').forEach((node) => node.remove())
  documentPreview.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || (['href', 'src', 'action', 'xlink:href'].includes(name) && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name)
      }
    })
  })
  return documentPreview.documentElement.outerHTML
    .replaceAll('{{name}}', 'Vivek')
    .replaceAll('{{email}}', 'vivek@example.com')
    .replaceAll('{{campaignName}}', 'Your campaign')
    .replaceAll('{{unsubscribe_url}}', '#unsubscribe')
}

export default function EmailPreview({ html }) {
  return <iframe className="email-preview-frame" title="Email preview" sandbox="" srcDoc={safePreview(html)} />
}