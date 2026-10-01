import { ArrowLeft, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import './PrivacyPolicyPage.css'

const sections = [
  { id: 'information', title: 'Information We Collect' },
  { id: 'google-access', title: 'Google Account and Gmail API Access' },
  { id: 'use', title: 'How We Use Information' },
  { id: 'campaign-data', title: 'Email Sending and Campaign Data' },
  { id: 'credentials', title: 'OAuth Tokens and Credential Security' },
  { id: 'sharing', title: 'Data Sharing and Third Parties' },
  { id: 'retention', title: 'Data Retention' },
  { id: 'deletion', title: 'Account and Data Deletion' },
  { id: 'security', title: 'Security' },
  { id: 'rights', title: 'User Rights' },
  { id: 'children', title: "Children's Privacy" },
  { id: 'changes', title: 'Changes to This Policy' },
  { id: 'contact', title: 'Contact Information' },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-header">
        <Link className="privacy-brand" to="/login" aria-label="MailFlow sign in">
          <span className="brand-mark"><Send size={16} /></span>
          <span>MailFlow</span>
        </Link>
        <Link className="privacy-back-link" to="/login"><ArrowLeft size={15} /> Sign in</Link>
      </header>

      <section className="privacy-hero">
        <span className="eyebrow"><span className="eyebrow-line" /> TRUST &amp; TRANSPARENCY</span>
        <h1>Privacy Policy</h1>
        <p>How MailFlow handles account, Gmail, campaign, and recipient information.</p>
        <span className="privacy-updated">Last updated October 1, 2026</span>
      </section>

      <div className="privacy-layout">
        <nav className="privacy-toc" aria-label="Privacy Policy sections">
          <span className="privacy-toc-title">ON THIS PAGE</span>
          <a href="#introduction">Introduction</a>
          {sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        </nav>

        <article className="privacy-content">
          <section id="introduction" className="privacy-section">
            <h2>Introduction</h2>
            <p>This Privacy Policy describes how MailFlow collects, uses, stores, and shares information when you use the MailFlow email campaign service. MailFlow lets you connect an email account, prepare campaigns, and send messages to recipients you select.</p>
            <p>In this policy, “we” refers to the operator of MailFlow. Before publishing, identify the legal person or business operating the service and add its verified contact details below.</p>
          </section>

          <section id="information" className="privacy-section">
            <h2>Information We Collect</h2>
            <ul>
              <li><strong>MailFlow account information:</strong> name, email address, and a password hash used to authenticate your account.</li>
              <li><strong>Connected email account information:</strong> provider, email address, display name, and the credentials needed to connect that account.</li>
              <li><strong>Campaign and recipient information:</strong> campaign name and subject, message content, recipient names and email addresses, delivery status, timestamps, provider message identifiers, and sending errors.</li>
              <li><strong>Individual email records:</strong> sender and recipient addresses, subject, message body, provider, delivery status, and related timestamps or errors.</li>
              <li><strong>Operational information:</strong> campaign and recipient identifiers, delivery status, and error details may appear in application logs used to operate and troubleshoot the service. The application does not define a separate log-retention period.</li>
            </ul>
          </section>

          <section id="google-access" className="privacy-section">
            <h2>Google Account and Gmail API Access</h2>
            <p>When you choose to connect Gmail, MailFlow uses Google OAuth. Google asks you to authorize the requested permissions. The current application requests permission to send email (<code>gmail.send</code>), read your Google account email and basic profile (<code>userinfo.email</code> and <code>userinfo.profile</code>), and use OpenID Connect (<code>openid</code>).</p>
            <p>MailFlow uses the Google profile response to identify the connected address and uses Gmail API access to send messages you initiate. The application does not request Gmail inbox, message-reading, or contacts permissions, and its Gmail sending integration does not read your inbox or contacts.</p>
            <p>You can remove a connected account from MailFlow. To revoke MailFlow’s authorization at Google, also remove its access in your Google Account security settings.</p>
          </section>

          <section id="use" className="privacy-section">
            <h2>How We Use Information</h2>
            <p>Information is used to create and authenticate your MailFlow account; connect and verify your chosen sender account; prepare and send messages and campaigns; show campaign history and delivery results; prevent duplicate or invalid sends; and diagnose service errors. MailFlow processes recipient information and message content according to the campaigns and messages you submit.</p>
          </section>

          <section id="campaign-data" className="privacy-section">
            <h2>Email Sending and Campaign Data</h2>
            <p>Campaign content, recipient details, and delivery records are stored by MailFlow so campaigns can be managed and their status can be shown. When you send, the message and necessary recipient information are transmitted to the connected Gmail account or configured SMTP provider. Those providers handle delivery under their own terms and privacy practices. MailFlow does not control what a recipient or email provider does with a message after delivery.</p>
            <p>You are responsible for having an appropriate basis and any required permissions to upload recipient information and send them email.</p>
          </section>

          <section id="credentials" className="privacy-section">
            <h2>OAuth Tokens and Credential Security</h2>
            <p>MailFlow stores the Google access and refresh tokens it receives, along with related token metadata, to maintain the Gmail connection and send authorized messages. SMTP connection credentials are also stored for accounts that use SMTP. The backend encrypts connected-account credentials before database storage using AES-256-GCM; the encryption key is derived from the server-side <code>CREDENTIAL_ENCRYPTION_KEY</code> configuration. These credentials are used by the backend and are excluded from the normal email-account response returned to the frontend.</p>
            <p>OAuth state used during the Google connection flow is stored temporarily in Redis, expires after 10 minutes, and is removed when the callback consumes it. Removing the connected account from MailFlow deletes its account record, but does not itself revoke authorization at Google.</p>
          </section>

          <section id="sharing" className="privacy-section">
            <h2>Data Sharing and Third Parties</h2>
            <p>Information is sent to Google when you authorize an account, retrieve the connected account’s basic profile, or send mail through Gmail. If you configure SMTP, the relevant message and recipient information are sent to that SMTP provider. MailFlow also relies on infrastructure providers for the deployed website, backend, database, and Redis services. Their identities and applicable terms depend on the deployment configuration; the current website is hosted on Vercel and the backend on Render.</p>
            <p>These providers process information to provide their services to MailFlow. Review Google’s, your email provider’s, and the configured infrastructure providers’ privacy terms for details about their handling of data.</p>
          </section>

          <section id="retention" className="privacy-section">
            <h2>Data Retention</h2>
            <p>The application does not currently set an automatic expiration period for MailFlow user accounts, campaigns, recipients, or email history. These records may remain in the configured database until deleted through an available feature or removed under the database operator’s maintenance practices. Operational log retention is determined by the hosting/logging configuration, not by a retention setting in the application.</p>
            <p>The temporary Google OAuth state is an exception: it expires after 10 minutes and is removed when used in the callback.</p>
          </section>

          <section id="deletion" className="privacy-section">
            <h2>Account and Data Deletion</h2>
            <p>You can delete a campaign that is not currently sending; MailFlow deletes that campaign’s recipient records with it. You can remove a connected email account, which deletes its MailFlow account record and stored encrypted credentials. The current application does not provide a self-service MailFlow user-account deletion feature, and removing a sender account does not revoke its authorization with Google.</p>
            <p>To request deletion of your MailFlow user account or other data that cannot be deleted in the product, contact us using the address below. Requests may require verification. You can separately revoke Google access in your Google Account settings.</p>
          </section>

          <section id="security" className="privacy-section">
            <h2>Security</h2>
            <p>The backend hashes account passwords and encrypts connected email credentials before storing them. Access to application records is scoped to the authenticated account in the relevant API operations. No method of storage or transmission is completely secure; do not upload information you are not authorized to process. Database, hosting, backup, and log protections may also depend on the services and settings used for deployment.</p>
          </section>

          <section id="rights" className="privacy-section">
            <h2>User Rights</h2>
            <p>Depending on where you live, you may have rights to request access to, correction of, or deletion of personal information, or to object to or restrict certain processing. You can update some account and campaign information in MailFlow, delete eligible campaigns, or remove connected email accounts. For other requests, contact us below. We may need to verify your identity and may retain information where required or permitted by law.</p>
          </section>

          <section id="children" className="privacy-section">
            <h2>Children’s Privacy</h2>
            <p>MailFlow is a business email service and is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal information to MailFlow, contact us so we can review the request.</p>
          </section>

          <section id="changes" className="privacy-section">
            <h2>Changes to This Policy</h2>
            <p>We may update this policy as the service or its data practices change. The “Last updated” date at the top indicates when this page was most recently revised. If a change materially affects how information is handled, the operator should provide an appropriate notice.</p>
          </section>

          <section id="contact" className="privacy-section privacy-contact">
            <h2>Contact Information</h2>
            <p>For privacy questions or data requests, contact:</p>
            <p><strong>Privacy contact:</strong> <span className="privacy-placeholder">REPLACE BEFORE PUBLISHING: your verified support/privacy email</span></p>
            <p><strong>Operator:</strong> Add the legal name and mailing address of the MailFlow operator before publishing this policy.</p>
          </section>
        </article>
      </div>

      <footer className="privacy-footer">
        <span>MailFlow <span aria-hidden="true">·</span> Privacy</span>
        <Link to="/login">Back to sign in</Link>
      </footer>
    </main>
  )
}