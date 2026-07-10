# Aurion Knowledge Plane

**Working name:** Aurion Knowledge Plane  
**Network metaphor:** Echo Resonance Network  
**Owner plane:** EchoAurion Company OS (this repo)  
**Edge:** Echo AI³ at each property  
**Status:** Scaffold in Company OS — product client not implemented

---

## One-sentence pitch

An AWS-like **control and learning plane for hospitality operations** — every Echo AI³ instance authenticates to a central hub that accumulates **anonymized, aggregated learning** so the network gets smarter without ever moving guest PII.

---

## How it differs from AWS

| AWS (IaaS / control plane) | Aurion Knowledge Plane |
|---|---|
| Compute, storage, networking primitives | Hospitality-ops **intelligence** primitives |
| You rent capacity and APIs | Properties contribute **patterns**; hub returns **insights** |
| Multi-tenant raw infrastructure | Multi-tenant **learning** with a hard PII wall |
| Peer regions optional | **No property-to-property peering** — hub-spoke only |
| IAM for cloud resources | Auth for Echo edge + future **vendor scrutiny gate** |

Company OS is the **super-admin** of this plane (Dr. OS). Vendors are a **future tenant type** with restricted, post-approval views — never raw tenant telemetry.

---

## Topology (hub-spoke, not mesh)

```
  Property A ──Echo AI³──┐
  Property B ──Echo AI³──┼──► Aurion Knowledge Plane (Company OS)
  Property C ──Echo AI³──┘         │
                                   ├─ KnowledgeSignal (allowlisted schemas)
                                   ├─ Aggregation (property → territory → network)
                                   ├─ KnowledgeInsight (Maestro / Perplexity seat)
                                   └─ VendorAccessRequest (second scrutiny gate)
```

- Each location **authenticates to the hub** (bearer / future mTLS).
- **No peer-to-peer** property links — avoids bottleneck and privacy leakage.
- Every Echo AI³ usage that emits allowlisted telemetry **compounds shared understanding**.

---

## Privacy tenets (non-negotiable)

1. **No guest / personal PII** — names, emails, phones, loyalty IDs, room numbers tied to identity, payment PANs, government IDs are **forbidden**.
2. **Telemetry and patterns only** — what Echo learned about operations, not who the guest was.
3. **Aggregation before insight** — prefer territory/network rollups over single-property dumps.
4. **Reject on ingest** — schemas that include PII-like keys are **rejected** (not silently stored).
5. **Vendors never see raw tenant streams** — only curated insights after a **second approval gate**.
6. **Super-admin (William / Dr. OS)** sees operational counts and assembled insights; still no guest PII by design.
7. **Audit** every mutating knowledge action (`knowledge.signal.ingest`, `knowledge.vendor.approve`, …).

---

## Data classes

### Allowed (examples)

| Class | Examples | Aggregation |
|---|---|---|
| Ops pattern | Cover-band demand shape, prep-time outliers, waste category frequencies | Property → territory |
| Menu / product hotspot | Anonymized category affinity, seasonal dish-family trends | Territory → network |
| Buying pattern | Category-level purchase rhythm (not SKU+price dumps as primary product) | Territory → network |
| System health | Echo AI³ version, queue depth, error class counts | Property |
| Knowledge meta | Insight confidence, sample size, time window | Network |

### Forbidden (reject)

- Guest name, email, phone, address, DOB
- Loyalty / membership identifiers
- Room / folio / reservation IDs when linkable to a person
- Payment card data, bank account numbers
- Staff PII beyond opaque role codes (if needed)
- Raw item-code + unit-price dumps as the **primary** learning product (expand thoughtfully later under stricter contracts)

---

## Aggregation levels

1. **Property** — single authenticated Echo edge; signals stored with opaque `clientKey` / property token, never guest keys.
2. **Territory** — geographic or brand cohort rollup (e.g. South Florida resorts).
3. **Network** — cross-territory patterns powering “what the industry is learning.”

Insights (e.g. territory food trends, product hotspots, buying patterns) are assembled by an AI seat (Perplexity / Maestro) from **aggregated** material — not from raw guest records.

---

## Vendor scrutiny gate

```
Vendor applies → VendorAccessRequest (PENDING)
        ↓
Dr. OS reviews scope (which insight classes, which territories)
        ↓
APPROVED (restricted view)  |  DENIED  |  REVOKED later
```

Vendors access **learning products**, not tenant databases. Company OS remains the only super-admin plane.

---

## Company OS surfaces (this scaffold)

| Surface | Role |
|---|---|
| `POST /api/knowledge/ingest` | Bearer `KNOWLEDGE_INGEST_SECRET` (or `SUPPORT_INGEST_SECRET`) — allowlisted signals only |
| `GET /api/knowledge/insights` | Admin session — list assembled insights |
| `GET /api/knowledge/signals` | Admin — **counts / meta only**, not raw dumps in UI |
| Vendor APIs | Approve / deny stubs for `VendorAccessRequest` |
| `/knowledge-plane` | Admin UI + privacy banner |

Product relay contracts (diagnostics, questions, work, knowledge-telemetry) live in `docs/RELAY_CONTRACTS.md`. **No product client is implemented in this repo.**

---

## Relation to Support / Fleet / Board Room

- **Support** — human + Knights gate for Q&A and change requests.
- **Fleet Nexus** — live health of Render + Support clients.
- **Board Room** — multi-AI counsel; can spawn Support work drafts.
- **Knowledge Plane** — long-horizon anonymized learning flywheel.

Together they form the hospitality control plane: operate today, learn continuously, never leak guest identity.
