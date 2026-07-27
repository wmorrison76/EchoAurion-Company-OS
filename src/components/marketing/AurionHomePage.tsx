'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import './aurion-home.css'

function Keystone({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M 30 36 A 40 40 0 0 1 90 36"
        fill="none"
        stroke="#B08D4F"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="60" cy="22.6" r="3.2" fill="#E8CD8C" />
      <polygon points="53,42 60,42 40,104 20,104" fill="#B08D4F" />
      <polygon points="67,42 60,42 80,104 100,104" fill="#B08D4F" />
      <rect x="44" y="78" width="32" height="8.5" fill="#E8CD8C" />
      <polygon points="51,30 69,30 67,42 53,42" fill="#E8CD8C" />
    </svg>
  )
}

/**
 * Public Aurion Holdings marketing homepage — adapted from
 * aurion-holdings-website_2.html (V&A brass / linen brand).
 */
export function AurionHomePage() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const els = document.querySelectorAll('.ah-rv')
    if (reduce) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="ah-root">
      <nav id="nav" className={scrolled ? 'scrolled' : ''} aria-label="Primary">
        <div className="ah-wrap ah-nav-in">
          <a className="ah-brand" href="#top" onClick={closeMenu}>
            <Keystone />
            <span className="ah-wm">AURION</span>
          </a>
          <div className={`ah-nav-links${menuOpen ? ' open' : ''}`}>
            <a href="#platform" onClick={closeMenu}>
              The Platform
            </a>
            <a href="#connect" onClick={closeMenu}>
              Connect
            </a>
            <a href="#flywheel" onClick={closeMenu}>
              Why we win
            </a>
            <a href="#company" onClick={closeMenu}>
              Company
            </a>
            <a href="#ir" onClick={closeMenu}>
              Investor Relations
            </a>
            <Link href="/login" className="ah-ghost" onClick={closeMenu}>
              Operator Login
            </Link>
          </div>
          <button
            type="button"
            className="ah-nav-toggle"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </nav>

      <div id="top" />

      <header className="ah-hero">
        <div className="ah-hero-amb" aria-hidden="true" />
        <div className="ah-wrap ah-hero-in">
          <p className="ah-eyebrow">Aurion Holdings · Hospitality Infrastructure</p>
          <h1>
            The source of truth
            <br />
            that <em>hospitality</em> runs on.
          </h1>
          <p className="ah-sub">
            For decades the industry was handed the same tired software while the people who run it
            worked the longest hours of their lives. Aurion is building the layer underneath all of
            it — <b>one source of truth</b> every property, vendor, and system connects to. Connect
            once. Run on the truth.
          </p>
          <div className="ah-cta-row">
            <a href="#connect" className="ah-btn ah-btn-primary">
              Connect your property
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <Link href="/login" className="ah-btn ah-btn-ghost">
              Operator Login → Dr. OS
            </Link>
          </div>
          <div className="ah-cred">
            <span>35 years on the line</span>
            <span>Delaware C-Corp</span>
            <span>Built on the pass</span>
            <span>Fort Lauderdale, FL</span>
          </div>
        </div>
      </header>

      <section className="ah-band">
        <div className="ah-wrap ah-rv">
          <div className="ah-sec-eyebrow">
            <span className="ah-ln" />
            <span className="ah-eyebrow">The problem worth solving</span>
          </div>
          <p className="ah-thesis">
            Every property runs a dozen systems that don&apos;t talk. There&apos;s no single truth —
            so there&apos;s no real intelligence. <b>Aurion builds the truth first</b>, and the
            intelligence follows.
          </p>
        </div>
      </section>

      <section className="ah-band" id="platform">
        <div className="ah-wrap">
          <div className="ah-rv" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="ah-sec-eyebrow">
              <span className="ah-ln" />
              <span className="ah-eyebrow">The architecture</span>
              <span className="ah-ln" />
            </div>
            <h2 className="ah-title" style={{ maxWidth: '24ch' }}>
              One foundation. <em>Everything connects to it.</em>
            </h2>
            <p className="ah-sec-lead" style={{ textAlign: 'center' }}>
              The holding company owns it. <b>Mise</b> is the source of truth — the layer every system
              plugs into. EchoAurion is the flagship that runs on top. You don&apos;t buy an app; you
              connect to the foundation.
            </p>
          </div>
          <div className="ah-stack ah-rv">
            <div className="ah-layer ah-owner">
              <div className="ah-l-tag">Tier 1 · The owner</div>
              <div className="ah-l-name">Aurion Holdings, Inc.</div>
              <div className="ah-l-desc">
                The keystone. A Delaware C-Corporation that owns the platform, the intellectual
                property, and the portfolio of products built on it.
              </div>
            </div>
            <div className="ah-stack-link" aria-hidden="true">
              ↓
            </div>
            <div className="ah-layer ah-platform">
              <div className="ah-l-tag">Tier 2 · The source of truth</div>
              <div className="ah-l-name">
                <em>Mise</em> — the platform
              </div>
              <div className="ah-mise-note">
                from <span>mise en place</span> — everything has a place, and everything in its place
              </div>
              <div className="ah-l-desc" style={{ marginTop: 10 }}>
                Mise takes every feed in hospitality and puts it where it belongs — ingested,
                normalized, reconciled into one trusted record, then opened through one set of
                connections.
              </div>
              <div className="ah-connectors">
                {['POS systems', 'Vendor catalogs', 'Invoices', 'Labor & scheduling', 'Inventory', 'Reservations', 'Banking · Plaid'].map(
                  (c) => (
                    <span key={c} className="ah-chip">
                      {c}
                    </span>
                  )
                )}
              </div>
              <div className="ah-apps">
                <div className="ah-app-pill">
                  <div className="ah-an">EchoAurion</div>
                  <div className="ah-ad">The flagship operating app — runs on Mise.</div>
                </div>
                <div className="ah-app-pill ah-future">
                  <div className="ah-an">Partner apps</div>
                  <div className="ah-ad">Third-party tools build on the same truth.</div>
                </div>
              </div>
            </div>
            <div className="ah-stack-link" aria-hidden="true">
              ↓
            </div>
            <div className="ah-layer">
              <div className="ah-l-tag">Tier 3 · Who connects</div>
              <div className="ah-l-name">Operators · Vendors · Groups</div>
              <div className="ah-l-desc">
                Single restaurants, multi-outlet resorts, vendor networks, and enterprise hospitality
                groups — each connects once and shares in the same source of truth.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ah-band" id="connect">
        <div className="ah-wrap">
          <div className="ah-rv">
            <div className="ah-sec-eyebrow">
              <span className="ah-ln" />
              <span className="ah-eyebrow">Connect to the truth</span>
            </div>
            <h2 className="ah-title">
              One on-ramp. <em>Three ways in.</em>
            </h2>
            <p className="ah-sec-lead">
              You don&apos;t migrate. You connect — once — and your operation joins the source of
              truth.
            </p>
          </div>
          <div className="ah-doors">
            {[
              {
                title: 'Operators',
                who: 'Restaurants · Resorts · Clubs',
                body: 'Run your floor, office, and ledger on EchoAurion — the flagship app on Mise.',
              },
              {
                title: 'Vendors',
                who: 'Suppliers · Distributors',
                body: 'Connect your catalog once and reach every operator on the network with clean, reconciled data.',
              },
              {
                title: 'Groups & Enterprise',
                who: 'Multi-property portfolios',
                body: 'Connect every property to one source of truth and see the whole portfolio benchmarked against itself — and against the network.',
              },
            ].map((d) => (
              <div key={d.title} className="ah-door ah-rv">
                <h3>{d.title}</h3>
                <div className="ah-who">{d.who}</div>
                <p>{d.body}</p>
                <a href="#contact" className="ah-go">
                  Get in touch →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ah-band" id="flywheel">
        <div className="ah-wrap ah-fly ah-rv">
          <div>
            <div className="ah-sec-eyebrow">
              <span className="ah-ln" />
              <span className="ah-eyebrow">Why we win</span>
            </div>
            <h2 className="ah-title">
              Every connection makes the <em>truth sharper</em>.
            </h2>
            <p className="ah-sec-lead">
              Each property that connects adds to an anonymized benchmark no single operator could
              ever build alone — the Aurion Knowledge Plane. The more of the industry that connects,
              the more valuable the truth becomes.
            </p>
            <p className="ah-sec-lead" style={{ marginTop: 14 }}>
              <b>Built by an operator who lived the problem</b> — through five back-to-back
              hurricanes, a flood recovery, and the nights that never make the brochure.
            </p>
          </div>
          <div className="ah-vis-box">
            <p className="ah-fly-core">MISE</p>
            <p className="ah-fly-caption">EVERY PROPERTY SHARPENS THE TRUTH FOR ALL</p>
          </div>
        </div>
      </section>

      <section className="ah-band" id="company">
        <div className="ah-wrap">
          <div className="ah-rv" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="ah-sec-eyebrow">
              <span className="ah-ln" />
              <span className="ah-eyebrow">The company</span>
              <span className="ah-ln" />
            </div>
            <h2 className="ah-title" style={{ maxWidth: '24ch' }}>
              Built to be <em>handed down</em>.
            </h2>
            <p className="ah-sec-lead" style={{ textAlign: 'center' }}>
              Aurion Holdings is a privately held Delaware C-Corporation, headquartered in Fort
              Lauderdale. Thirty-five years in hospitality — building deliberately now, to last
              beyond its founder.
            </p>
          </div>
          <div className="ah-facts ah-rv">
            {[
              ['Delaware', 'State of incorporation'],
              ['C-Corp', 'Entity type'],
              ['2026', 'Incorporated'],
              ['Fort Lauderdale', 'Headquarters'],
            ].map(([v, k]) => (
              <div key={k} className="ah-fact">
                <div className="ah-v">{v}</div>
                <div className="ah-k">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ah-band" id="ir">
        <div className="ah-wrap ah-rv">
          <div className="ah-ir">
            <p className="ah-eyebrow" style={{ marginBottom: 18 }}>
              Investor Relations
            </p>
            <h2>Privately held. Building deliberately.</h2>
            <p>
              For partnership, vendor, or investor-relations inquiries, reach the office directly.
            </p>
            <a
              href="mailto:hello@aurionholdings.com?subject=Aurion%20Holdings%20Inquiry"
              className="ah-btn ah-btn-ghost"
              style={{ margin: '0 auto' }}
            >
              Get in touch
            </a>
          </div>
        </div>
      </section>

      <footer id="contact">
        <div className="ah-wrap">
          <div className="ah-foot-grid">
            <div>
              <a className="ah-brand" href="#top" style={{ marginBottom: 16 }}>
                <Keystone />
                <span className="ah-wm">AURION</span>
              </a>
              <p className="ah-dim" style={{ fontSize: 14, maxWidth: '34ch' }}>
                The source of truth hospitality runs on. Built on the pass, in Fort Lauderdale.
              </p>
              <a
                href="mailto:hello@aurionholdings.com"
                className="ah-dim"
                style={{ display: 'inline-block', marginTop: 14, fontSize: 14, borderBottom: '1px solid var(--ah-hair)' }}
              >
                hello@aurionholdings.com
              </a>
            </div>
            <div>
              <h4>Platform</h4>
              <a href="#platform">Architecture</a>
              <a href="#flywheel">Why we win</a>
              <Link href="/login">Operator login</Link>
            </div>
            <div>
              <h4>Connect</h4>
              <a href="#connect">Operators</a>
              <a href="#connect">Vendors</a>
              <a href="#connect">Groups &amp; Enterprise</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="#company">About</a>
              <a href="#ir">Investor relations</a>
              <a href="#contact">Contact</a>
            </div>
          </div>
          <div className="ah-foot-bottom">
            <span>© 2026 AURION HOLDINGS, INC. · ALL RIGHTS RESERVED</span>
            <span>MISE™ WORKING NAME · DELAWARE C-CORP · FORT LAUDERDALE, FL</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
