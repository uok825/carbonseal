// SPDX-License-Identifier: Apache-2.0

import { formatIntensity, formatTonnes, productName } from '@carbonseal/api';
import { Landmark, Plus, UserMinus } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button, Card, Empty, Field, Hash, Modal, PageHead, PublicTag } from '../components/ui';
import { errorMessage, useBackend, usePublicKey, useSnapshot, useToast } from '../lib/app-state';

export const RegistryPage = () => {
  const backend = useBackend();
  const authority = backend.participants.authority;
  const snapshot = useSnapshot();
  const myPk = usePublicKey(authority.client);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const isAuthority = myPk !== undefined && snapshot?.authority === myPk;

  const remove = async (pk: string) => {
    setBusy(pk);
    try {
      await authority.client.removeVerifier(pk);
      toast({ tone: 'success', title: 'Verifier removed' });
    } catch (error) {
      toast({ tone: 'error', title: 'Could not remove verifier', body: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <Landmark size={13} /> Registry
          </>
        }
        title="Public ledger"
        description="This is the registry’s entire public state on Midnight. Emissions, production volumes and installation details never appear here."
        actions={
          isAuthority ? (
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => setAdding(true)}>
              Accredit verifier
            </Button>
          ) : undefined
        }
      />

      <section>
        <div className="section-head">
          <h2 className="section-title">Accredited verifiers</h2>
          <span className="section-meta">
            Authority: {backend.nameFor(snapshot?.authority ?? '') ?? (snapshot && <Hash value={snapshot.authority} />)}
          </span>
        </div>
        {snapshot?.verifiers.length ? (
          <Card>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Verifier</th>
                    <th>Public key</th>
                    <th className="num">Attestations</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {snapshot.verifiers.map((pk) => (
                    <tr key={pk}>
                      <td>{backend.nameFor(pk) ?? <span className="subtle">Unnamed</span>}</td>
                      <td>
                        <Hash value={pk} />
                      </td>
                      <td className="num">{snapshot.attestations.filter((a) => a.verifier === pk).length}</td>
                      <td className="num">
                        {isAuthority && (
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<UserMinus size={13} />}
                            loading={busy === pk}
                            onClick={() => void remove(pk)}
                          >
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Empty icon={<Landmark size={22} />} title="No accredited verifiers" />
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Attestations</h2>
          <PublicTag />
        </div>
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Report commitment</th>
                  <th>Product</th>
                  <th>Operator</th>
                  <th>Verifier</th>
                  <th className="num">Tonnes certified</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshot?.attestations.map((a) => (
                  <tr key={a.commitment}>
                    <td>
                      <Hash value={a.commitment} />
                    </td>
                    <td>
                      {productName(a.productCode)} <span className="subtle">· {a.period.toString()}</span>
                    </td>
                    <td>{backend.nameFor(a.operator) ?? <Hash value={a.operator} chars={4} />}</td>
                    <td>{backend.nameFor(a.verifier) ?? <Hash value={a.verifier} chars={4} />}</td>
                    <td className="num">{formatTonnes(a.claimedTonnes)}</td>
                    <td>
                      <Badge tone={a.revoked ? 'danger' : 'success'} dot>
                        {a.revoked ? 'Revoked' : 'Active'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Certificates</h2>
          <span className="section-meta">{snapshot?.certificateCount.toString() ?? 0} issued</span>
        </div>
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Buyer</th>
                  <th>Product</th>
                  <th className="num">Tonnes</th>
                  <th className="num">Threshold</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {snapshot?.certificates.map((c) => (
                  <tr key={c.shipmentId}>
                    <td className="mono">{c.shipmentLabel ?? <Hash value={c.shipmentId} />}</td>
                    <td className="mono">{c.buyerLabel ?? <Hash value={c.buyer} />}</td>
                    <td>{productName(c.productCode)}</td>
                    <td className="num">{formatTonnes(c.tonnes)}</td>
                    <td className="num">≤ {formatIntensity(c.thresholdKgPerTonne)}</td>
                    <td>
                      <Hash value={c.reportCommitment} chars={4} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {adding && <AddVerifierModal onClose={() => setAdding(false)} />}
    </>
  );
};

const AddVerifierModal = ({ onClose }: { onClose: () => void }) => {
  const backend = useBackend();
  const toast = useToast();
  const [pk, setPk] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = /^(0x)?[0-9a-f]{64}$/i.test(pk.trim());

  const submit = async () => {
    setSaving(true);
    try {
      await backend.participants.authority.client.addVerifier(pk.trim().replace(/^0x/, '').toLowerCase());
      toast({ tone: 'success', title: 'Verifier accredited' });
      onClose();
    } catch (error) {
      toast({ tone: 'error', title: 'Could not accredit verifier', body: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Accredit a verifier"
      subtitle="Only the registry authority can do this."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void submit()}>
            Accredit
          </Button>
        </>
      }
    >
      <Field label="Verifier public key" hint="32-byte hex key shown in the verifier’s console">
        <input className="input mono" value={pk} onChange={(e) => setPk(e.target.value)} placeholder="a1b2…" />
      </Field>
    </Modal>
  );
};
