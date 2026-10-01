import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, FileSpreadsheet, MailPlus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createCampaign,
  getCampaign,
  removeCampaign,
  updateCampaign,
  uploadRecipients,
  validateRecipients,
} from "../services/campaign.service";
import useToast from "../hooks/useToast";
import { accounts } from "../services/mailflow.service";
import CsvUploader from "../components/CsvUploader";
import EmailEditor from "../components/EmailEditor";
import ErrorState from "../components/ErrorState";
import Loading from "../components/Loading";

export default function CampaignFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { notify } = useToast();
  const departmentValidationRef = useRef(0);
  const [form, setForm] = useState({ name: "", subject: "", html: "", emailAccountMode: "specific", emailAccountId: "" });
  const [accountList, setAccountList] = useState([]);
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [validatingDepartments, setValidatingDepartments] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    accounts()
      .then((items) => {
        if (!active) return;
        setAccountList(items);
        setForm((current) => ({
          ...current,
          emailAccountId: current.emailAccountId || (items.filter((item) => item.provider !== "gmail" || item.verificationStatus === "verified").find((item) => item.isDefault) || items.find((item) => item.provider !== "gmail" || item.verificationStatus === "verified"))?.id || "",
        }));
      })
      .catch((requestError) => active && setError(requestError.message));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    getCampaign(id)
      .then((campaign) => {
        if (active) {
          setForm({
            name: campaign.name || "",
            subject: campaign.subject || "",
            html: campaign.html || "",
            emailAccountMode: campaign.emailAccountMode || "specific",
            emailAccountId: campaign.emailAccountId?._id || campaign.emailAccountId || "",
          });
          if (campaign.status !== "draft")
            setError("Only draft campaigns can be edited.");
        }
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [editing, id]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function attachFile(nextFile) {
    const requestId = ++departmentValidationRef.current;
    setFile(nextFile);
    setSelectedDepartments([]);
    setValidationResult(null);
    setError("");
    if (nextFile) {
      setValidatingDepartments(true);
      validateRecipients(nextFile)
        .then((result) => {
          if (departmentValidationRef.current === requestId) {
            setValidationResult(result);
            setSelectedDepartments(result.hasDepartments ? result.departments.map((department) => department.name) : []);
          }
        })
        .catch((requestError) => {
          if (departmentValidationRef.current === requestId) setError(requestError.message);
        })
        .finally(() => {
          if (departmentValidationRef.current === requestId) setValidatingDepartments(false);
        });
    }
  }

  async function updateDepartmentSelection(nextSelection) {
    setSelectedDepartments(nextSelection);
    if (!file) return;
    if (!nextSelection.length) {
      const requestId = ++departmentValidationRef.current;
      setValidatingDepartments(true);
      try {
        const result = await validateRecipients(file);
        if (requestId === departmentValidationRef.current) setValidationResult(result);
      } catch (requestError) {
        if (requestId === departmentValidationRef.current) setError(requestError.message);
      } finally {
        if (requestId === departmentValidationRef.current) setValidatingDepartments(false);
      }
      return;
    }
    const requestId = ++departmentValidationRef.current;
    setValidatingDepartments(true);
    try {
      const result = await validateRecipients(file, nextSelection);
      if (requestId === departmentValidationRef.current) setValidationResult(result);
    } catch (requestError) {
      if (requestId === departmentValidationRef.current) setError(requestError.message);
    } finally {
      if (requestId === departmentValidationRef.current) setValidatingDepartments(false);
    }
  }

  async function uploadFile(campaignId, nextFile, allowInvalid) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const result = await uploadRecipients(
        campaignId,
        nextFile,
        setUploadProgress,
        allowInvalid,
        selectedDepartments,
      );
      notify(
        `Recipients uploaded: ${result.valid} valid, ${result.duplicates} duplicates, ${result.invalid} invalid, ${result.suppressed} suppressed`,
      );
      return true;
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const allowInvalid =
      event.nativeEvent.submitter?.dataset.allowInvalid === "true";
    if (!editing && !file) {
      setError("Choose a CSV recipient file before creating the campaign.");
      return;
    }
    setSaving(true);
    let campaign;
    try {
      if (file) {
        const result = await validateRecipients(
          file,
          selectedDepartments.length ? selectedDepartments : undefined,
        );
        setValidationResult(result);
        const hasIssues =
          result.invalid > 0 || result.duplicates > 0 || result.suppressed > 0;
        if (hasIssues && !allowInvalid) {
          setError(
            "Review the CSV validation results, then explicitly continue with valid recipients or replace the file.",
          );
          return;
        }
      }

      campaign = editing
        ? await updateCampaign(id, form)
        : await createCampaign(form);
      if (file) {
        try {
          await uploadFile(campaign._id, file, allowInvalid);
        } catch (uploadError) {
          if (["CSV_VALIDATION_FAILED", "DEPARTMENTS_REQUIRED", "INVALID_DEPARTMENT_SELECTION"].includes(uploadError.code)) {
            if (!editing) await removeCampaign(campaign._id).catch(() => null);
            setValidationResult(uploadError.data);
            setError(
              "CSV validation changed before upload. Review the returned rows before continuing.",
            );
            return;
          }
          notify(uploadError.message, "error");
          return;
        }
      }
      notify(
        editing ? "Draft campaign updated" : "Campaign created successfully",
      );
      navigate(`/campaigns/${campaign._id}`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const departmentOptions = validationResult?.departments || [];
  const selectedDepartmentCount = departmentOptions
    .filter((department) => selectedDepartments.length === 0 || selectedDepartments.includes(department.name))
    .reduce((total, department) => total + department.count, 0);
  const excludedDepartmentCount = Math.max(0, (validationResult?.totalRows || 0) - selectedDepartmentCount);
  const departmentSamples = (isSelected) => departmentOptions
    .filter((department) => selectedDepartments.length === 0 ? isSelected : selectedDepartments.includes(department.name) === isSelected)
    .flatMap((department) => department.samples || [])
    .slice(0, 5);

  if (loading) return <Loading label="Loading campaign..." />;
  return (
    <div className="page-stack form-page">
      <Link
        to={editing ? `/campaigns/${id}` : "/campaigns"}
        className="back-link"
      >
        <ArrowLeft size={16} />
        {editing ? "Back to campaign" : "All campaigns"}
      </Link>
      <section className="page-intro">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-line" />{" "}
            {editing ? "DRAFT CAMPAIGN" : "NEW CAMPAIGN"}
          </span>
          <h1>{editing ? "Refine your draft" : "Start with a message"}</h1>
          <p>
            Write clearly. Review the preview. Send only to people who expect to
            hear from you.
          </p>
        </div>
      </section>
      {error && <ErrorState message={error} />}
      <form onSubmit={handleSubmit} className="form-layout">
        <div className="form-main panel">
          <div className="form-section-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Campaign details</h2>
              <p>Give this send a clear name and subject.</p>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="campaign-name">
              Campaign name
            </label>
            <input
              id="campaign-name"
              className="text-input"
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="e.g. September product update"
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="campaign-subject">
              Email subject
            </label>
            <input
              id="campaign-subject"
              className="text-input"
              required
              maxLength={180}
              value={form.subject}
              onChange={(event) => updateField("subject", event.target.value)}
              placeholder="A thoughtful subject line"
            />
          </div>
          <div className="form-divider" />
          <div className="form-section-heading">
            <span className="step-number">02</span>
            <div>
              <h2>Write your email</h2>
              <p>HTML is supported. Preview runs in a restricted sandbox.</p>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="campaign-account-mode">Sending account</label>
              <select
                id="campaign-account-mode"
                className="text-input"
                value={form.emailAccountMode}
                onChange={(event) => updateField("emailAccountMode", event.target.value)}
              >
                <option value="specific">One connected account</option>
                <option value="round_robin" disabled={!accountList.some((item) => item.provider === "gmail" && item.verificationStatus === "verified")}>
                  Automatic round-robin across Gmail accounts
                </option>
              </select>
              {form.emailAccountMode === "specific" ? (
                <select
                  className="text-input"
                  aria-label="Select sending account"
                  value={form.emailAccountId}
                  onChange={(event) => updateField("emailAccountId", event.target.value)}
                >
                  {accountList.map((item) => (
                    <option key={item.id} value={item.id} disabled={item.provider === "gmail" && item.verificationStatus !== "verified"}>{item.provider === "gmail" ? `Gmail · ${item.verificationStatus === "verified" ? "Verified" : "Verification required"}` : "SMTP"} · {item.email}</option>
                  ))}
                </select>
              ) : (
                <p className="muted-cell">
                  {accountList.filter((item) => item.provider === "gmail" && item.verificationStatus === "verified").map((item) => `${item.email} · Verified`).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <EmailEditor
            value={form.html}
            onChange={(value) => updateField("html", value)}
          />
          <div className="form-divider" />
          <div className="form-section-heading">
            <span className="step-number">03</span>
            <div>
              <h2>Choose recipients</h2>
              <p>
                Upload a CSV with <code>name,email</code> columns.
              </p>
            </div>
          </div>
          {editing && (
            <p className="existing-recipient-note">
              <FileSpreadsheet size={15} /> Uploading another CSV adds new
              addresses to this draft. Existing recipients are kept.
            </p>
          )}
          <CsvUploader
            onUpload={attachFile}
            uploading={uploading}
            progress={uploadProgress}
            disabled={uploading || saving}
            deferUpload
          />
          {file && (
            <div className="selected-file-line">
              <Check size={15} /> {file.name} selected
            </div>
          )}
          {validatingDepartments && <p className="muted-cell">Checking CSV departments…</p>}
          {validationResult?.hasDepartments && (
            <div className="department-selector">
              <div className="panel-heading panel-heading-inline">
                <div>
                  <h3>Select recipients</h3>
                  <p>Choose departments to include. Clearing the selection includes all valid recipients.</p>
                </div>
                <div className="button-group">
                  <button className="button button-secondary button-small" type="button" onClick={() => void updateDepartmentSelection(departmentOptions.map((department) => department.name))} disabled={validatingDepartments || saving}>Select All</button>
                  <button className="button button-secondary button-small" type="button" onClick={() => void updateDepartmentSelection([])} disabled={validatingDepartments || saving}>Clear Selection</button>
                </div>
              </div>
              <div className="department-options">
                {departmentOptions.map((department) => (
                  <label className="department-option" key={department.key || "__no_department__"}>
                    <input
                      type="checkbox"
                      checked={selectedDepartments.includes(department.name)}
                      disabled={validatingDepartments || saving}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...selectedDepartments, department.name]
                          : selectedDepartments.filter((name) => name !== department.name);
                        void updateDepartmentSelection(next);
                      }}
                    />
                    <span>{department.label || department.name}</span>
                    <strong>{department.count}</strong>
                  </label>
                ))}
              </div>
              <p><strong>Selected recipients:</strong> {selectedDepartmentCount} <span className="muted-cell">·</span> <strong>Excluded recipients:</strong> {excludedDepartmentCount}</p>
              {departmentSamples(true).length > 0 && <p className="muted-cell">Selected preview: {departmentSamples(true).map((item) => item.email).join(", ")}</p>}
              {departmentSamples(false).length > 0 && <p className="muted-cell">Excluded preview: {departmentSamples(false).map((item) => item.email).join(", ")}</p>}
            </div>
          )}
          {validationResult && (
            <div className="validation-errors">
              <p>
                Total rows: {validationResult.totalRows} · Valid recipients:{" "}
                {validationResult.valid} · Invalid: {validationResult.invalid}
              </p>
              {validationResult.errors?.length > 0 && (
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
                    {validationResult.errors.map((item, index) => (
                      <tr key={`${item.row}-${item.email}-${index}`}>
                        <td>{item.row ?? "—"}</td>
                        <td>{item.name || "—"}</td>
                        <td>{item.email || "—"}</td>
                        <td className="error-cell">{item.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <aside className="form-aside">
          <div className="panel send-summary">
            <span className="section-kicker">READY WHEN YOU ARE</span>
            <span className="summary-icon">
              <MailPlus size={19} />
            </span>
            <h3>{editing ? "Save your draft" : "Create your campaign"}</h3>
            <p>
              {editing
                ? "Your changes will be saved to this draft."
                : "Your campaign will stay in draft until you choose to start it."}
            </p>
            <button
              className="button button-primary button-wide"
              type="submit"
              data-allow-invalid={
                validationResult &&
                (validationResult.invalid > 0 ||
                  validationResult.duplicates > 0 ||
                  validationResult.suppressed > 0)
                  ? "true"
                  : "false"
              }
              disabled={
                saving ||
                uploading ||
                validatingDepartments ||
                (validationResult && validationResult.valid === 0)
              }
            >
              {saving ? (
                "Saving campaign..."
              ) : validationResult &&
                (validationResult.invalid > 0 ||
                  validationResult.duplicates > 0 ||
                  validationResult.suppressed > 0) ? (
                `Continue with ${validationResult.valid} valid recipients`
              ) : (
                <>
                  {editing ? "Save draft" : "Create campaign"}{" "}
                  <ArrowLeft className="arrow-forward" size={16} />
                </>
              )}
            </button>
            <div className="summary-safe">
              <span /> Sending controls stay rate-limited
            </div>
          </div>
          <div className="tip-box">
            <strong>Personalization tip</strong>
            <p>
              Use <code>{"{{name}}"}</code> in your email to greet each
              recipient by name.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
