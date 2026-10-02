// SPDX-License-Identifier: Apache-2.0

import {
  bytesToLabel,
  formatCnCode,
  formatIntensity,
  formatTonnes,
  intensityKgPerTonne,
  productName,
  toHex,
} from '@carbonseal/api';
import { pureCircuits } from '@carbonseal/contract';
import { AlertTriangle, BadgeCheck, ClipboardPaste, Inbox, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';

import { decodeAuditPackage } from '../backend/audit-channel';
import type { AuditPackage, Session } from '../backend/types';
import { ConnectPrompt } from '../components/ConnectPrompt';
import { Badge, Button, Card, Empty, Hash, Modal, PageHead, PublicTag } from '../components/ui';
import { errorMessage, useApp, useAuditRequests, useNameFor, useSnapshot, useToast } from '../lib/app-state';

const relativeTime = (ms: number): string => {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
};

const PAGE_DESCRIPTION =
  'Review installation reports shared with you off-chain. Attesting publishes only the report’s commitment, never its contents.';

export const VerifierPage = () => {
  const { session } = useApp();
  if (!session) {
    return (
      <>
        <PageHead
          eyebrow={
            <>
              <ShieldCheck size={13} /> Verifier console
            </>
          }
          title="Audit and attest"
          description={PAGE_DESCRIPTION}
        />
        <ConnectPrompt action="review and attest reports" />
      </>
    );
  }
  return <VerifierConsole session={session} />;
};

const VerifierConsole = ({ session }: { session: Session }) => {
  const { audits } = useApp();
  const nameFor = useNameFor();
  const snapshot = useSnapshot();
  const myPk = session.publicKey;
  const requests = useAuditRequests();
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const accredited = snapshot?.verifiers.includes(myPk) ?? false;
  const attestedByMe = snapshot?.attestations.filter((a) => a.verifier === myPk) ?? [];
  const alreadyAttested = new Set(snapshot?.attestations.map((a) => a.commitment));

  const attest = async (pkg: AuditPackage) => {
    setBusy(pkg.commitment);
    try {
      await session.client.attest({
        commitment: pkg.commitment,
        operatorPk: pkg.operatorPk,
        productCode: pkg.report.productCode,
        period: pkg.report.period,
      });
      audits.dismiss(pkg.commitment);
      toast({ tone: 'success', title: 'Report attested', body: `${pkg.operatorName} can now certify shipments.` });
    } catch (error) {
      toast({ tone: 'error', title: 'Attestation rejected', body: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (commitment: string) => {
    setBusy(commitment);
    try {
      await session.client.revoke(commitment);
      toast({ tone: 'success', title: 'Attestation revoked', body: 'No further shipments can be certified against it.' });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not revoke', body: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <ShieldCheck size={13} /> Verifier console
          </>
        }
        title="Audit and attest"
        description={
          <>
            {PAGE_DESCRIPTION}
            <span className="check-row subtle" style={{ marginTop: 10, fontSize: 12.5 }}>
              Your verifier key <Hash value={myPk} />
              {!accredited && <span>· send it to the registry authority to be accredited</span>}
            </span>
          </>
        }
        actions={
          <>
            {accredited ? (
              <Badge tone="success" dot>
                Accredited
              </Badge>
            ) : (
              <Badge tone="warning" dot>
                Not accredited
              </Badge>
            )}
            <Button icon={<ClipboardPaste size={15} />} onClick={() => setImporting(true)}>
              Import package
            </Button>
          </>
        }
      />

      <section>
        <div className="section-head">
          <h2 className="section-title">Audit requests</h2>
          <span className="section-meta">Shared with you for audit · not on-chain</span>
        </div>
        {requests.length === 0 ? (
          <Empty icon={<Inbox size={22} />} title="No pending requests">
            Operators send audit packages from their workspace.
          </Empty>
        ) : (
          <div className="grid grid-2">
            {requests.map((pkg) => (
              <AuditRequestCard
                key={pkg.commitment}
                pkg={pkg}
                accredited={accredited}
                attested={alreadyAttested.has(pkg.commitment)}
                busy={busy === pkg.commitment}
                onAttest={() => void attest(pkg)}
                onReject={() => audits.dismiss(pkg.commitment)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Your attestations</h2>
          <PublicTag />
        </div>
        {attestedByMe.length === 0 ? (
          <Empty icon={<BadgeCheck size={22} />} title="Nothing attested yet" />
        ) : (
          <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Commitment</th>
                    <th>Operator</th>
                    <th>Product</th>
                    <th className="num">Certified</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {attestedByMe.map((a) => (
                    <tr key={a.commitment}>
                      <td>
                        <Hash value={a.commitment} />
                      </td>
                      <td>{nameFor(a.operator) ?? <Hash value={a.operator} chars={4} />}</td>
                      <td>
                        {productName(a.productCode)} <span className="subtle">· {a.period.toString()}</span>
                      </td>
                      <td className="num">{formatTonnes(a.claimedTonnes)}</td>
                      <td>
                        {a.revoked ? (
                          <Badge tone="danger" dot>
                            Revoked
                          </Badge>
                        ) : (
                          <Badge tone="success" dot>
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className="num">
                        {!a.revoked && (
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<ShieldOff size={13} />}
                            loading={busy === a.commitment}
                            onClick={() => void revoke(a.commitment)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}
      </section>

      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImport={(pkg) => {
            audits.submit(pkg);
            setImporting(false);
          }}
        />
      )}
    </>
  );
};

const AuditRequestCard = ({
  pkg,
  accredited,
  attested,
  busy,
  onAttest,
  onReject,
}: {
  pkg: AuditPackage;
  accredited: boolean;
  attested: boolean;
  busy: boolean;
  onAttest: () => void;
  onReject: () => void;
}) => {
  const { report } = pkg;
  // The verifier never trusts the operator's claimed commitment: it is recomputed from the data audited.
  const matches = toHex(pureCircuits.reportCommitment(report)) === pkg.commitment;
  return (
    <Card>
      <div className="card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">{pkg.operatorName}</div>
            <div className="card-sub">
              {productName(report.productCode)} · CN {formatCnCode(report.productCode)} · {report.period.toString()} ·
              received {relativeTime(pkg.submittedAt)}
            </div>
          </div>
          {matches ? (
            <Badge tone="success">Commitment matches</Badge>
          ) : (
            <Badge tone="danger">Commitment mismatch</Badge>
          )}
        </div>
        <dl className="kv" style={{ marginTop: 18 }}>
          <div>
            <dt>Installation</dt>
            <dd className="mono">{bytesToLabel(report.installationId) ?? '—'}</dd>
          </div>
          <div>
            <dt>Direct emissions</dt>
            <dd className="tabular">{formatTonnes(Number(report.directEmissionsKg) / 1000)} CO₂e</dd>
          </div>
          <div>
            <dt>Indirect emissions</dt>
            <dd className="tabular">{formatTonnes(Number(report.indirectEmissionsKg) / 1000)} CO₂e</dd>
          </div>
          <div>
            <dt>Production</dt>
            <dd className="tabular">{formatTonnes(report.productionTonnes)}</dd>
          </div>
          <div>
            <dt>Intensity</dt>
            <dd className="tabular">{formatIntensity(intensityKgPerTonne(report))}</dd>
          </div>
        </dl>
      </div>
      <div className="card-foot">
        <Hash value={pkg.commitment} />
        <div className="actions">
          <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}>
            Dismiss
          </Button>
          <Button
            size="sm"
            variant="accent"
            icon={<BadgeCheck size={13} />}
            disabled={!matches || !accredited || attested}
            loading={busy}
            onClick={onAttest}
          >
            {attested ? 'Already attested' : 'Attest'}
          </Button>
        </div>
      </div>
    </Card>
  );
};

const ImportModal = ({ onClose, onImport }: { onClose: () => void; onImport: (pkg: AuditPackage) => void }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    try {
      onImport(decodeAuditPackage(text));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal
      title="Import audit package"
      subtitle="Paste the package an operator sent you."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={text.trim() === ''} onClick={submit}>
            Import
          </Button>
        </>
      }
    >
      <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="{ … }" />
      {error && (
        <div className="banner">
          <AlertTriangle size={15} /> {error}
        </div>
      )}
    </Modal>
  );
};
