import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  FileSpreadsheet,
  Loader2,
  Send,
  Users,
} from "lucide-react";
import { accounts } from "../services/mailflow.service";
import {
  createCampaign,
  removeCampaign,
  runCampaignAction,
  uploadRecipients,
  validateRecipients,
} from "../services/campaign.service";
import useToast from "../hooks/useToast";
import EmailEditor from "../components/EmailEditor";

export default function BulkSendPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [accountList, setAccountList] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form data
  const [csvFile, setCsvFile] = useState(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [validationResult, setValidationResult] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [form, setForm] = useState({
    accountId: "",
    campaignName: "",
    subject: "",
    html: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await accounts();
        if (cancelled) return;
        setAccountList(a);
        if (a.length) {
          setForm((f) => ({
            ...f,
            accountId: (a.find((x) => x.isDefault) || a[0])?.id || "",
          }));
        }
      } catch {
        // handled by UI fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function handleFileSelect(file) {
    if (!file) return;
    setCsvFile(file);
    setValidationResult(null);
    setRecipientCount(0);
    setValidationLoading(true);
    try {
      const result = await validateRecipients(file);
      setValidationResult(result);
      setRecipientCount(result.totalRows);
    } catch (error) {
      if (error.data) {
        setValidationResult(error.data);
        setRecipientCount(error.data.totalRows || 0);
      }
      notify(error.message || "CSV validation failed", "error");
    } finally {
      setValidationLoading(false);
    }
  }

  async function handleCreateCampaign(continueWithValid = false) {
    if (
      !form.campaignName.trim() ||
      !form.subject.trim() ||
      !form.html.trim()
    ) {
      notify("Please fill in all campaign details", "error");
      return;
    }
    if (!validationResult || validationLoading) {
      notify(
        "Wait for CSV validation to finish before creating the campaign.",
        "warning",
      );
      return;
    }
    const hasValidationIssues =
      validationResult.invalid > 0 ||
      validationResult.duplicates > 0 ||
      validationResult.suppressed > 0;
    if (hasValidationIssues && !continueWithValid) return;

    setIsLoading(true);
    let campaign;
    try {
      // Step 1: Create campaign
      campaign = await createCampaign({
        name: form.campaignName,
        subject: form.subject,
        html: form.html,
        emailAccountId: form.accountId || undefined,
      });

      // Step 2: Upload recipients
      if (csvFile) {
        await uploadRecipients(
          campaign._id,
          csvFile,
          setUploadProgress,
          continueWithValid,
        );
      }

      // Step 3: Start the campaign (only if all recipients are valid)
      await runCampaignAction(campaign._id, "start");

      notify("Campaign created and started successfully!");
      navigate(`/campaigns/${campaign._id}`);
    } catch (error) {
      if (campaign && error.code === "CSV_VALIDATION_FAILED") {
        await removeCampaign(campaign._id).catch(() => null);
        setValidationResult(error.data);
        setRecipientCount(error.data?.totalRows || 0);
      }
      notify(error.message || "Failed to create campaign", "error");
      setIsLoading(false);
    }
  }

  const hasValidationIssues = Boolean(
    validationResult &&
    (validationResult.invalid > 0 ||
      validationResult.duplicates > 0 ||
      validationResult.suppressed > 0),
  );

  if (!accountList.length) {
    return (
      <section className="panel empty-state">
        <h1>Connect an email account first</h1>
        <p>Once connected, you can send bulk emails.</p>
        <Link className="button button-primary" to="/email-accounts">
          Connect Email
        </Link>
      </section>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <h1>Send Bulk Email</h1>
          <p>Create a campaign and send to multiple recipients.</p>
        </div>
        <Link className="text-link" to="/send">
          Single Email
        </Link>
      </section>

      <section className="panel page-stack composer">
        <div className="bulk-steps">
          <span className={step >= 1 ? "active" : ""}>1. Upload CSV</span>
          <span className={step >= 2 ? "active" : ""}>2. Write Email</span>
          <span className={step >= 3 ? "active" : ""}>3. Review & Send</span>
        </div>

        {step === 1 && (
          <>
            <div className="form-group">
              <label>From Account</label>
              <select
                value={form.accountId}
                onChange={(e) => set("accountId", e.target.value)}
                className="form-select"
              >
                {accountList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.provider === "gmail" ? "Gmail" : "SMTP"} · {a.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Recipients CSV</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="file-input"
              />
              {csvFile && (
                <p className="file-info">
                  <FileSpreadsheet size={16} /> {csvFile.name} ·{" "}
                  {recipientCount} recipient
                  {recipientCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            <div className="csv-requirements">
              <h4>
                <AlertCircle size={16} /> CSV Format
              </h4>
              <p>
                Your CSV must have headers: <code>email</code> (required) and{" "}
                <code>name</code> (optional).
              </p>
              <pre>
                name,email John Doe,john@example.com Jane Smith,jane@example.com
              </pre>
            </div>

            <button
              className="button button-primary"
              disabled={!csvFile || validationLoading || !validationResult}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="form-group">
              <label>Campaign Name</label>
              <input
                type="text"
                value={form.campaignName}
                onChange={(e) => set("campaignName", e.target.value)}
                placeholder="e.g., March Newsletter"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="Enter subject"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Message</label>
              <EmailEditor
                value={form.html}
                onChange={(value) => set("html", value)}
                placeholder="Write your email..."
              />
            </div>

            <div className="template-variables">
              <h4>
                <Users size={16} /> Personalization
              </h4>
              <p>Use these variables in your subject and message:</p>
              <code>{"{{name}}"}</code> — Recipient name
              <br />
              <code>{"{{email}}"}</code> — Recipient email
              <br />
              <code>{"{{unsubscribe_url}}"}</code> — Auto-generated unsubscribe
              link
            </div>

            <div className="button-group">
              <button
                className="button button-secondary"
                onClick={() => setStep(1)}
              >
                <ChevronLeft size={16} /> Back
              </button>
              <button
                className="button button-primary"
                disabled={
                  !form.campaignName.trim() ||
                  !form.subject.trim() ||
                  !form.html.trim()
                }
                onClick={() => setStep(3)}
              >
                Review
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="review-section">
              <h2>
                <Check size={20} /> Review & Confirm
              </h2>

              <div className="review-card">
                <h3>Campaign</h3>
                <p>
                  <strong>Name:</strong> {form.campaignName}
                </p>
                <p>
                  <strong>Subject:</strong> {form.subject}
                </p>
                <p>
                  <strong>From:</strong>{" "}
                  {accountList.find((a) => a.id === form.accountId)?.email ||
                    "Default"}
                </p>
              </div>

              <div className="review-card">
                <h3>
                  <FileSpreadsheet size={16} /> Recipients
                </h3>
                <p>
                  <strong>CSV File:</strong> {csvFile?.name}
                </p>
                {validationLoading ? (
                  <p>Validating CSV rows…</p>
                ) : validationResult ? (
                  <>
                    <p>
                      <strong>Total Rows:</strong> {validationResult.totalRows}
                    </p>
                    <p>
                      <strong>Valid Recipients:</strong>{" "}
                      <span className="recipient-count valid">
                        {validationResult.valid}
                      </span>
                    </p>
                    <p>
                      <strong>Invalid:</strong>{" "}
                      <span
                        className={`recipient-count ${validationResult.invalid ? "invalid" : ""}`}
                      >
                        {validationResult.invalid}
                      </span>
                    </p>
                    {(validationResult.duplicates > 0 ||
                      validationResult.suppressed > 0) && (
                      <>
                        <p>
                          <strong>Duplicates:</strong>{" "}
                          <span className="recipient-count invalid">
                            {validationResult.duplicates}
                          </span>
                        </p>
                        <p>
                          <strong>Suppressed:</strong>{" "}
                          <span className="recipient-count invalid">
                            {validationResult.suppressed}
                          </span>
                        </p>
                      </>
                    )}
                    {validationResult.errors?.length > 0 && (
                      <div className="validation-errors">
                        <h4>Rows requiring review</h4>
                        <table className="error-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Name</th>
                              <th>Email</th>
                              <th>Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationResult.errors.map((err, idx) => (
                              <tr key={`${err.row}-${err.email}-${idx}`}>
                                <td>{err.row ?? "—"}</td>
                                <td>{err.name || "—"}</td>
                                <td>{err.email || "—"}</td>
                                <td className="error-cell">{err.error}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <p>
                    <strong>Estimated Recipients:</strong>{" "}
                    <span className="recipient-count">{recipientCount}</span>
                  </p>
                )}
              </div>

              <div className="review-card">
                <h3>Estimated Delivery</h3>
                <p>
                  At the configured rate (1 email every 10 seconds), sending{" "}
                  {validationResult ? validationResult.valid : recipientCount}{" "}
                  emails will take approximately{" "}
                  <strong>
                    {Math.ceil(
                      ((validationResult
                        ? validationResult.valid
                        : recipientCount) *
                        10) /
                        60,
                    )}{" "}
                    minutes
                  </strong>
                  .
                </p>
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="upload-progress">
                  <div
                    className="progress-bar"
                    style={{ width: `${uploadProgress}%` }}
                  />
                  <span>Uploading: {uploadProgress}%</span>
                </div>
              )}
            </div>

            <div className="button-group">
              <button
                className="button button-secondary"
                onClick={() => setStep(2)}
                disabled={isLoading}
              >
                <ChevronLeft size={16} /> Back
              </button>
              {hasValidationIssues ? (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setValidationResult(null);
                      setCsvFile(null);
                      setRecipientCount(0);
                      setValidationResult(null);
                      setStep(1);
                    }}
                    disabled={isLoading}
                  >
                    Fix CSV
                  </button>
                  <button
                    className="button button-primary button-large"
                    onClick={() => handleCreateCampaign(true)}
                    disabled={isLoading || validationResult.valid === 0}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={18} className="spin" /> Starting...
                      </>
                    ) : (
                      <>
                        <Send size={18} /> Continue with{" "}
                        {validationResult.valid} Valid
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  className="button button-primary button-large"
                  onClick={handleCreateCampaign}
                  disabled={
                    isLoading ||
                    validationLoading ||
                    !validationResult ||
                    validationResult.valid === 0
                  }
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <Send size={18} /> Start Campaign
                    </>
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
