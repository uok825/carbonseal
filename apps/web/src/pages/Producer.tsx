// SPDX-License-Identifier: Apache-2.0

import {
  type AttestationView,
  CBAM_PRODUCTS,
  type StoredReport,
  buildReport,
  bytesToLabel,
  formatCnCode,
  formatIntensity,
  formatTonnes,
  intensityKgPerTonne,
  meetsThreshold,
  productName,
} from '@carbonseal/api';
import { Check, FilePlus2, Factory, Lock, PackageCheck, Send, Ship, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { encodeAuditPackage } from '../backend/audit-channel';
import type { Participant } from '../backend/types';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Hash,
  Meter,
  Modal,
  PageHead,
  PrivateTag,
  PublicTag,
  type StepState,
  Steps,
} from '../components/ui';
import {
  errorMessage,
  useAuditRequests,
  useBackend,
  usePrivateReports,
  usePublicKey,
  useSnapshot,
  useToast,
} from '../lib/app-state';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ReportStatus = { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' };

const statusOf = (attestation: AttestationView | undefined, pendingAudit: boolean): ReportStatus => {
  if (attestation?.revoked) return { label: 'Revoked', tone: 'danger' };
  if (attestation) return { label: 'Attested', tone: 'success' };
  if (pendingAudit) return { label: 'Awaiting audit', tone: 'warning' };
  return { label: 'Draft', tone: 'neutral' };
};

export const ProducerPage = () => {
  const backend = useBackend();
  const operator = backend.participants.operator;
  const snapshot = useSnapshot();
  const audits = useAuditRequests();
  const [reports, refreshReports] = usePrivateReports(operator.client);
  const [creating, setCreating] = useState(false);
  const [certifying, setCertifying] = useState<string | null>(null);

  const attestationFor = (commitment: string) => snapshot?.attestations.find((a) => a.commitment === commitment);
  const mine = new Set(reports.map((r) => r.commitment));
  const shipments = snapshot?.certificates.filter((c) => mine.has(c.reportCommitment)) ?? [];
  const certifiable = reports.filter((r) => {
    const a = attestationFor(r.commitment);
    return a !== undefined && !a.revoked;
  });

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <Factory size={13} /> Producer workspace
          </>
        }
        title={operator.name}
        description="Installation reports stay on this device. Send them to your verifier for audit, then certify each shipment against your buyer’s threshold."
        actions={
          <>
            <Button icon={<FilePlus2 size={15} />} onClick={() => setCreating(true)}>
              New report
            </Button>
            <Button
              variant="primary"
              icon={<PackageCheck size={15} />}
              disabled={certifiable.length === 0}
              onClick={() => setCertifying(certifiable[0]?.commitment ?? null)}
            >
              Certify shipment
            </Button>
          </>
        }
      />

      <section>
        <div className="section-head">
          <h2 className="section-title">Installation reports</h2>
          <PrivateTag>Figures are private · only commitments are public</PrivateTag>
        </div>
        {reports.length === 0 ? (
          <Empty icon={<FilePlus2 size={22} />} title="No reports yet">
            Create a report for an installation, product and period.
          </Empty>
        ) : (
          <div className="grid grid-2">
            {reports.map((stored) => (
              <ReportCard
                key={stored.commitment}
                stored={stored}
                attestation={attestationFor(stored.commitment)}
                pendingAudit={audits.some((a) => a.commitment === stored.commitment)}
                operator={operator}
                onCertify={() => setCertifying(stored.commitment)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Certified shipments</h2>
          <PublicTag />
        </div>
        {shipments.length === 0 ? (
          <Empty icon={<Ship size={22} />} title="No shipments certified yet" />
        ) : (
          <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Product</th>
                    <th>Buyer</th>
                    <th className="num">Quantity</th>
                    <th className="num">Threshold met</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((c) => (
                    <tr key={c.shipmentId}>
                      <td className="mono">{c.shipmentLabel ?? c.shipmentId.slice(0, 12)}</td>
                      <td>{productName(c.productCode)}</td>
                      <td className="mono">{c.buyerLabel ?? '—'}</td>
                      <td className="num">{formatTonnes(c.tonnes)}</td>
                      <td className="num">≤ {formatIntensity(c.thresholdKgPerTonne)}</td>
                      <td className="num">
                        <a className="btn btn-ghost btn-sm" href={`#/buyer/${encodeURIComponent(c.shipmentLabel ?? '')}`}>
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}
      </section>

      {creating && (
        <NewReportModal
          operator={operator}
          onClose={() => setCreating(false)}
          onSaved={refreshReports}
        />
      )}
      {certifying !== null && (
        <CertifyModal
          reports={certifiable}
          initial={certifying}
          attestationFor={attestationFor}
          operator={operator}
          onClose={() => setCertifying(null)}
        />
      )}
    </>
  );
};

const ReportCard = ({
  stored,
  attestation,
  pendingAudit,
  operator,
  onCertify,
}: {
  stored: StoredReport;
  attestation: AttestationView | undefined;
  pendingAudit: boolean;
  operator: Participant;
  onCertify: () => void;
}) => {
  const backend = useBackend();
  const operatorPk = usePublicKey(operator.client);
  const toast = useToast();
  const { report, commitment } = stored;
  const status = statusOf(attestation, pendingAudit);
  const claimed = attestation?.claimedTonnes ?? 0n;
  const [exported, setExported] = useState<string | null>(null);

  const sendForAudit = () => {
    if (operatorPk === undefined) return;
    const pkg = { commitment, operatorPk, operatorName: operator.name, report, submittedAt: Date.now() };
    if (backend.mode === 'demo') {
      backend.audits.submit(pkg);
      toast({ tone: 'success', title: 'Sent for audit', body: `${backend.participants.verifier.name} can now review it.` });
    } else {
      setExported(encodeAuditPackage(pkg));
    }
  };

  return (
    <Card>
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">{productName(report.productCode)}</div>
            <div className="card-sub">
              CN {formatCnCode(report.productCode)} · {report.period.toString()} ·{' '}
              {bytesToLabel(report.installationId) ?? 'Installation'}
            </div>
          </div>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>

        <div className="private-panel" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <PrivateTag />
          </div>
          <dl className="kv">
            <div>
              <dt>Emission intensity</dt>
              <dd className="tabular">{formatIntensity(intensityKgPerTonne(report))}</dd>
            </div>
            <div>
              <dt>Verified production</dt>
              <dd className="tabular">{formatTonnes(report.productionTonnes)}</dd>
            </div>
          </dl>
        </div>

        {attestation && (
          <div style={{ marginTop: 16 }}>
            <div className="check-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted">Certified so far</span>
              <span className="tabular">
                {formatTonnes(claimed)} <span className="subtle">of {formatTonnes(report.productionTonnes)}</span>
              </span>
            </div>
            <Meter value={claimed} max={report.productionTonnes} />
          </div>
        )}
      </div>
      <div className="card-foot">
        <Hash value={commitment} />
        {attestation && !attestation.revoked ? (
          <Button size="sm" variant="primary" onClick={onCertify}>
            Certify shipment
          </Button>
        ) : !attestation && !pendingAudit ? (
          <Button size="sm" icon={<Send size={13} />} onClick={sendForAudit}>
            Send for audit
          </Button>
        ) : null}
      </div>
      {exported && (
        <Modal
          title="Audit package"
          subtitle="Send this to your verifier over a secure channel. It contains your private report."
          onClose={() => setExported(null)}
          footer={
            <Button variant="primary" onClick={() => void navigator.clipboard?.writeText(exported)}>
              Copy package
            </Button>
          }
        >
          <textarea className="textarea" readOnly value={exported} rows={8} />
        </Modal>
      )}
    </Card>
  );
};

const NewReportModal = ({
  operator,
  onClose,
  onSaved,
}: {
  operator: Participant;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const toast = useToast();
  const [installationRef, setInstallationRef] = useState('');
  const [productCode, setProductCode] = useState(CBAM_PRODUCTS[0]!.code.toString());
  const [period, setPeriod] = useState('2026');
  const [direct, setDirect] = useState('');
  const [indirect, setIndirect] = useState('');
  const [production, setProduction] = useState('');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const p = Number(production);
    const total = Number(direct) + Number(indirect);
    return p > 0 && Number.isFinite(total) ? (total * 1000) / p : undefined;
  }, [direct, indirect, production]);

  const valid =
    installationRef.trim().length > 0 &&
    Number(production) > 0 &&
    Number.isInteger(Number(production)) &&
    direct !== '' &&
    indirect !== '';

  const save = async () => {
    setSaving(true);
    try {
      await operator.client.storeReport(
        buildReport({
          installationRef: installationRef.trim(),
          productCode: BigInt(productCode),
          period: BigInt(period),
          directEmissionsTonnes: Number(direct),
          indirectEmissionsTonnes: Number(indirect),
          productionTonnes: Number(production),
        }),
      );
      onSaved();
      toast({ tone: 'success', title: 'Report saved privately', body: 'Nothing was published. Send it for audit next.' });
      onClose();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not save report', body: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New installation report"
      subtitle={<PrivateTag>Stored only on this device</PrivateTag>}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void save()}>
            Save privately
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Installation reference" className="span-2">
          <input
            className="input"
            placeholder="e.g. KOC-EAF-02"
            maxLength={32}
            value={installationRef}
            onChange={(e) => setInstallationRef(e.target.value)}
          />
        </Field>
        <Field label="Product">
          <select className="select" value={productCode} onChange={(e) => setProductCode(e.target.value)}>
            {CBAM_PRODUCTS.map((p) => (
              <option key={p.code.toString()} value={p.code.toString()}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reporting period">
          <input className="input" inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Field label="Direct emissions">
          <div className="input-group">
            <input className="input" inputMode="decimal" value={direct} onChange={(e) => setDirect(e.target.value)} />
            <span className="suffix">t CO₂e</span>
          </div>
        </Field>
        <Field label="Indirect emissions">
          <div className="input-group">
            <input className="input" inputMode="decimal" value={indirect} onChange={(e) => setIndirect(e.target.value)} />
            <span className="suffix">t CO₂e</span>
          </div>
        </Field>
        <Field label="Production" className="span-2" hint="Whole tonnes of product in the period">
          <div className="input-group">
            <input
              className="input"
              inputMode="numeric"
              value={production}
              onChange={(e) => setProduction(e.target.value)}
            />
            <span className="suffix">t</span>
          </div>
        </Field>
      </div>
      <div className="private-panel">
        <div className="check-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Embedded emission intensity</span>
          <strong className="tabular">{preview === undefined ? '—' : formatIntensity(preview)}</strong>
        </div>
      </div>
    </Modal>
  );
};

const CertifyModal = ({
  reports,
  initial,
  attestationFor,
  operator,
  onClose,
}: {
  reports: readonly StoredReport[];
  initial: string;
  attestationFor: (commitment: string) => AttestationView | undefined;
  operator: Participant;
  onClose: () => void;
}) => {
  const backend = useBackend();
  const toast = useToast();
  const [commitment, setCommitment] = useState(initial);
  const [shipmentRef, setShipmentRef] = useState('');
  const [buyerRef, setBuyerRef] = useState('');
  const [tonnes, setTonnes] = useState('');
  const [threshold, setThreshold] = useState('1900');
  const [phase, setPhase] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const stored = reports.find((r) => r.commitment === commitment);
  const claimed = attestationFor(commitment)?.claimedTonnes ?? 0n;
  const remaining = stored ? stored.report.productionTonnes - claimed : 0n;
  const tonnesN = /^\d+$/.test(tonnes) ? BigInt(tonnes) : 0n;
  const thresholdN = /^\d+$/.test(threshold) ? BigInt(threshold) : 0n;
  const intensityOk = stored !== undefined && thresholdN > 0n && meetsThreshold(stored.report, thresholdN);
  const capacityOk = tonnesN > 0n && tonnesN <= remaining;
  const valid = shipmentRef.trim() !== '' && buyerRef.trim() !== '' && intensityOk && capacityOk;

  const labels =
    backend.mode === 'demo'
      ? ['Load private report as witness', 'Run certify circuit', 'Proof generation (skipped in demo)', 'Update ledger']
      : ['Load private report as witness', 'Run certify circuit', 'Generate proof & sign in wallet', 'Confirm on chain'];
  const steps = labels.map((label, i) => ({
    label,
    state: (phase > i ? 'done' : phase === i ? 'active' : 'pending') as StepState,
  }));

  const submit = async () => {
    setError(null);
    setPhase(0);
    await sleep(300);
    setPhase(1);
    await sleep(300);
    setPhase(2);
    try {
      await operator.client.certify({
        shipmentRef: shipmentRef.trim(),
        commitment,
        thresholdKgPerTonne: thresholdN,
        tonnes: tonnesN,
        buyerRef: buyerRef.trim(),
      });
      setPhase(3);
      await sleep(350);
      setPhase(4);
      toast({ tone: 'success', title: `Shipment ${shipmentRef.trim()} certified`, body: 'Your buyer can verify it now.' });
      await sleep(400);
      onClose();
    } catch (e) {
      setPhase(-1);
      setError(errorMessage(e));
    }
  };

  const busy = phase >= 0;

  return (
    <Modal
      title="Certify a shipment"
      subtitle="Prove this shipment meets the buyer’s threshold without revealing your report."
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={busy} onClick={() => void submit()}>
            Generate proof & certify
          </Button>
        </>
      }
    >
      {busy ? (
        <Steps steps={steps} />
      ) : (
        <>
          <Field label="Attested report">
            <select className="select" value={commitment} onChange={(e) => setCommitment(e.target.value)}>
              {reports.map((r) => (
                <option key={r.commitment} value={r.commitment}>
                  {productName(r.report.productCode)} · {r.report.period.toString()} ·{' '}
                  {bytesToLabel(r.report.installationId) ?? r.commitment.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Shipment reference">
              <input
                className="input mono"
                placeholder="TR-2026-0501"
                maxLength={32}
                value={shipmentRef}
                onChange={(e) => setShipmentRef(e.target.value)}
              />
            </Field>
            <Field label="Buyer EORI">
              <input
                className="input mono"
                placeholder="DE…"
                maxLength={32}
                value={buyerRef}
                onChange={(e) => setBuyerRef(e.target.value)}
              />
            </Field>
            <Field label="Quantity">
              <div className="input-group">
                <input className="input" inputMode="numeric" value={tonnes} onChange={(e) => setTonnes(e.target.value)} />
                <span className="suffix">t</span>
              </div>
            </Field>
            <Field label="Buyer’s threshold">
              <div className="input-group">
                <input
                  className="input"
                  inputMode="numeric"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
                <span className="suffix">kg/t</span>
              </div>
            </Field>
          </div>
          {stored && (
            <div className="private-panel">
              <div style={{ marginBottom: 10 }}>
                <PrivateTag>Checked locally · never published</PrivateTag>
              </div>
              <div className="steps">
                <CheckLine ok={intensityOk}>
                  Intensity {formatIntensity(intensityKgPerTonne(stored.report))}{' '}
                  {intensityOk ? '≤' : '>'} threshold {thresholdN > 0n ? formatIntensity(thresholdN) : ''}
                </CheckLine>
                <CheckLine ok={capacityOk}>
                  {formatTonnes(tonnesN)} requested · {formatTonnes(remaining)} of verified production remaining
                </CheckLine>
              </div>
            </div>
          )}
          {error && (
            <div className="banner danger">
              <X size={15} /> Rejected by the contract: {error}
            </div>
          )}
          <div className="check-row subtle" style={{ fontSize: 12.5 }}>
            <Lock size={13} /> Published: shipment, buyer, product, period, tonnes and threshold. Nothing else.
          </div>
        </>
      )}
    </Modal>
  );
};

const CheckLine = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <div className="check-row">
    {ok ? <Check size={15} className="ok" /> : <X size={15} className="bad" />}
    <span>{children}</span>
  </div>
);
