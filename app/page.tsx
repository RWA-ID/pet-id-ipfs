import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{--cream:#FBF5EC;--cream-2:#F5E6D0;--cream-3:#EFDCBE;--amber:#C87A2E;--amber-dark:#A35E1B;--amber-soft:#E8A962;--brown:#3D2817;--brown-2:#5C3E25;--brown-3:#8A6B4E;--line:#E5D3B6;--white:#FFFDF8;--radius:18px;--radius-lg:28px;--shadow-sm:0 1px 2px rgba(61,40,23,.06),0 2px 8px rgba(61,40,23,.04);--shadow-md:0 2px 4px rgba(61,40,23,.06),0 10px 30px rgba(61,40,23,.08);}
        *{box-sizing:border-box;}body{font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;background:var(--cream);color:var(--brown);-webkit-font-smoothing:antialiased;line-height:1.5;margin:0;}a{color:inherit;text-decoration:none;}
        .container{width:100%;max-width:1180px;margin:0 auto;padding:0 28px;}
        .nav{position:sticky;top:0;z-index:20;background:rgba(251,245,236,.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(229,211,182,.5);}
        .nav-inner{display:flex;align-items:center;justify-content:space-between;padding:18px 0;}
        .logo{display:inline-flex;align-items:center;gap:10px;font-family:'Fraunces',serif;font-weight:700;font-size:22px;letter-spacing:-0.01em;color:var(--brown);}
        .logo-mark{width:34px;height:34px;border-radius:10px;background:var(--amber);display:grid;place-items:center;box-shadow:inset 0 -2px 0 rgba(0,0,0,.08);}
        .nav-links{display:flex;gap:32px;font-size:15px;color:var(--brown-2);font-weight:500;}
        .nav-links a:hover{color:var(--amber-dark);}
        .nav-cta{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:var(--brown);color:var(--white);font-weight:600;font-size:14px;transition:transform .15s ease,background .15s ease;}
        .nav-cta:hover{background:var(--brown-2);transform:translateY(-1px);}
        .paw-field{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;}
        .paw{position:absolute;opacity:.08;color:var(--amber);}
        .hero{position:relative;padding:72px 0 84px;overflow:hidden;}
        .hero-grid{position:relative;z-index:1;display:grid;grid-template-columns:1.15fr 1fr;gap:72px;align-items:center;}
        .eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;background:var(--white);border:1px solid var(--line);border-radius:999px;font-size:13px;font-weight:500;color:var(--brown-2);box-shadow:var(--shadow-sm);}
        .eyebrow-dot{width:18px;height:18px;border-radius:50%;background:var(--amber);display:grid;place-items:center;font-size:10px;}
        .hero-title{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(44px,6vw,72px);line-height:1.02;letter-spacing:-0.025em;margin:20px 0 22px;color:var(--brown);}
        .hero-title em{font-style:italic;font-weight:500;color:var(--amber-dark);}
        .hero-sub{font-size:18px;line-height:1.55;color:var(--brown-2);max-width:540px;margin:0 0 32px;}
        .hero-sub code{font-family:'JetBrains Mono',monospace;font-size:14px;background:var(--cream-2);padding:2px 7px;border-radius:6px;color:var(--brown);}
        .cta-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
        .btn{display:inline-flex;align-items:center;gap:10px;padding:16px 24px;border-radius:14px;font-weight:600;font-size:15.5px;font-family:inherit;cursor:pointer;border:1.5px solid transparent;transition:transform .15s ease,box-shadow .15s ease,background .15s ease;white-space:nowrap;}
        .btn-primary{background:var(--amber);color:var(--white);box-shadow:0 1px 0 rgba(255,255,255,.2) inset,0 -2px 0 rgba(0,0,0,.1) inset,0 8px 20px rgba(200,122,46,.35);}
        .btn-primary:hover{background:var(--amber-dark);transform:translateY(-1px);}
        .btn-outline{background:transparent;color:var(--brown);border-color:var(--brown);}
        .btn-outline:hover{background:var(--brown);color:var(--white);}
        .btn-price{font-family:'JetBrains Mono',monospace;font-size:13px;opacity:.85;font-weight:500;}
        .btn-outline .btn-price{color:var(--brown-3);}
        .btn-outline:hover .btn-price{color:rgba(255,253,248,.8);}
        .coming-soon{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:var(--cream-2);border:1px solid var(--line);border-radius:999px;font-size:13px;color:var(--brown-3);font-weight:500;}
        .coming-soon-dot{width:6px;height:6px;border-radius:50%;background:var(--brown-3);opacity:.5;}
        .hero-meta{margin-top:28px;display:flex;gap:22px;flex-wrap:wrap;font-size:13.5px;color:var(--brown-3);}
        .hero-meta span{display:inline-flex;align-items:center;gap:6px;}
        .check{width:14px;height:14px;border-radius:50%;background:var(--amber-soft);color:var(--white);display:inline-grid;place-items:center;font-size:9px;font-weight:700;}
        .hero-visual{position:relative;aspect-ratio:4/4.6;max-width:460px;justify-self:end;width:100%;}
        .stack-card{position:absolute;background:var(--white);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-md);overflow:hidden;}
        .stack-profile{top:0;left:0;right:60px;bottom:80px;padding:22px;display:flex;flex-direction:column;transform:rotate(-2deg);}
        .profile-photo{width:100%;aspect-ratio:1.2;border-radius:14px;background-image:url('https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=600&q=80');background-size:cover;background-position:center;margin-bottom:14px;border:1px solid var(--line);}
        .profile-name{font-family:'Fraunces',serif;font-weight:700;font-size:26px;letter-spacing:-0.02em;line-height:1;margin:0 0 4px;}
        .profile-ens{font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--amber-dark);margin-bottom:12px;}
        .profile-rows{display:grid;gap:4px;font-size:12.5px;color:var(--brown-2);}
        .profile-row{display:flex;justify-content:space-between;padding:5px 0;border-top:1px dashed var(--line);}
        .profile-row:first-child{border-top:none;}
        .profile-row b{color:var(--brown);font-weight:600;}
        .stack-tag{right:0;bottom:0;width:200px;padding:18px;transform:rotate(6deg);text-align:center;}
        .tag-title{font-family:'Fraunces',serif;font-size:15px;font-weight:700;margin-bottom:2px;}
        .tag-sub{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--brown-3);margin-bottom:12px;}
        .qr-real{width:100%;aspect-ratio:1;border-radius:8px;display:grid;grid-template-columns:repeat(13,1fr);grid-template-rows:repeat(13,1fr);gap:1px;background:var(--white);padding:6px;box-sizing:border-box;border:1px solid var(--line);}
        .qr-real i{background:var(--brown);border-radius:1px;font-style:normal;}
        .qr-real i.off{background:transparent;}
        .collar-ring{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:40px;height:40px;border:4px solid var(--brown-3);border-radius:50%;background:var(--cream);}
        section{position:relative;}
        .section-head{text-align:center;max-width:640px;margin:0 auto 56px;}
        .section-kicker{font-family:'JetBrains Mono',monospace;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:var(--amber-dark);margin-bottom:14px;}
        .section-title{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(34px,4vw,48px);line-height:1.05;letter-spacing:-0.02em;margin:0 0 14px;}
        .section-title em{font-style:italic;color:var(--amber-dark);font-weight:500;}
        .section-lede{color:var(--brown-2);font-size:17px;}
        .how{padding:96px 0;background:var(--cream);position:relative;}
        .how::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--line),transparent);}
        .flows{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
        .flow{background:var(--white);border:1px solid var(--line);border-radius:var(--radius-lg);padding:32px 32px 28px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;}
        .flow-wallet{background:var(--brown);color:var(--cream);border-color:transparent;}
        .flow-soon{opacity:.55;pointer-events:none;position:relative;}
        .flow-soon-badge{position:absolute;top:16px;right:16px;background:var(--cream-2);color:var(--brown-3);font-family:'JetBrains Mono',monospace;font-size:10px;padding:4px 10px;border-radius:999px;letter-spacing:.05em;text-transform:uppercase;font-weight:500;}
        .flow-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:20px;border-bottom:1px solid var(--line);margin-bottom:22px;}
        .flow-wallet .flow-head{border-color:rgba(255,253,248,.12);}
        .flow-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:var(--cream-2);color:var(--brown);font-size:13px;font-weight:600;}
        .flow-wallet .flow-badge{background:var(--amber);color:var(--white);}
        .flow-meta{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--brown-3);}
        .flow-wallet .flow-meta{color:rgba(251,245,236,.6);}
        .flow-meta b{color:var(--brown);font-weight:600;}
        .flow-wallet .flow-meta b{color:var(--amber-soft);}
        .flow-steps{list-style:none;padding:0;margin:0;display:grid;gap:20px;}
        .flow-steps li{display:grid;grid-template-columns:40px 1fr;gap:16px;align-items:start;}
        .flow-num{font-family:'Fraunces',serif;font-weight:700;font-size:22px;letter-spacing:-0.02em;color:var(--amber-dark);line-height:1;padding-top:2px;}
        .flow-wallet .flow-num{color:var(--amber-soft);}
        .flow-body h4{font-family:'Fraunces',serif;font-size:19px;font-weight:600;letter-spacing:-0.01em;margin:0 0 4px;line-height:1.2;}
        .flow-body p{margin:0;color:var(--brown-2);font-size:14.5px;line-height:1.55;}
        .flow-wallet .flow-body p{color:rgba(251,245,236,.75);}
        .flow-body p code{font-family:'JetBrains Mono',monospace;font-size:12.5px;background:var(--cream-2);padding:1px 6px;border-radius:5px;color:var(--brown);}
        .flow-wallet .flow-body p code{background:rgba(232,169,98,.18);color:var(--amber-soft);}
        .get{padding:96px 0;background:var(--cream-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
        .features{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;}
        .feature{background:var(--white);border:1px solid var(--line);border-radius:var(--radius);padding:26px 24px 28px;display:flex;flex-direction:column;min-height:260px;}
        .feature-icon{width:44px;height:44px;border-radius:12px;background:var(--cream);border:1px solid var(--line);display:grid;place-items:center;color:var(--amber-dark);margin-bottom:18px;}
        .feature h4{font-family:'Fraunces',serif;font-size:19px;font-weight:600;letter-spacing:-0.01em;margin:0 0 8px;line-height:1.2;}
        .feature p{margin:0 0 14px;color:var(--brown-2);font-size:14px;line-height:1.5;}
        .feature-code{margin-top:auto;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:var(--brown);background:var(--cream);border:1px dashed var(--line);padding:8px 10px;border-radius:8px;align-self:stretch;text-align:center;}
        .domains{padding:96px 0;background:var(--cream);}
        .domain-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:900px;margin:0 auto;}
        .domain-card{position:relative;background:var(--white);border:1px solid var(--line);border-radius:var(--radius-lg);padding:40px 36px;display:flex;align-items:center;gap:28px;overflow:hidden;transition:transform .2s ease,box-shadow .2s ease;}
        .domain-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);}
        .domain-card.dog{background:linear-gradient(135deg,var(--white),#FEF3E5);}
        .domain-card.cat{background:linear-gradient(135deg,var(--white),#F7EBD9);}
        .domain-emoji{font-size:56px;line-height:1;}
        .domain-body h3{font-family:'Fraunces',serif;font-size:28px;font-weight:700;margin:0 0 4px;letter-spacing:-0.02em;color:var(--brown);}
        .domain-body .domain-url{font-family:'JetBrains Mono',monospace;font-size:14px;color:var(--amber-dark);margin-bottom:10px;}
        .domain-body p{margin:0;font-size:14px;color:var(--brown-2);}
        .domain-count{position:absolute;top:20px;right:24px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--brown-3);letter-spacing:0.05em;}
        .pricing{padding:110px 0 120px;background:var(--brown);color:var(--cream);position:relative;overflow:hidden;}
        .pricing .section-kicker{color:var(--amber-soft);}
        .pricing .section-title{color:var(--white);}
        .pricing .section-title em{color:var(--amber-soft);}
        .pricing .section-lede{color:rgba(251,245,236,.7);}
        .pricing .paw-field .paw{color:var(--amber-soft);opacity:.06;}
        .price-card{max-width:480px;margin:0 auto;background:var(--cream);color:var(--brown);border-radius:var(--radius-lg);padding:40px 36px;position:relative;box-shadow:0 30px 60px rgba(0,0,0,.25);}
        .price-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:var(--amber);color:var(--white);font-size:11.5px;font-family:'JetBrains Mono',monospace;padding:6px 14px;border-radius:999px;font-weight:500;letter-spacing:0.04em;white-space:nowrap;}
        .price-label{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--brown-3);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;text-align:center;}
        .price-row{display:flex;align-items:baseline;justify-content:center;gap:6px;margin-bottom:4px;}
        .price-amount{font-family:'Fraunces',serif;font-weight:700;font-size:64px;letter-spacing:-0.03em;line-height:1;color:var(--brown);}
        .price-unit{font-size:16px;color:var(--brown-3);font-weight:500;}
        .price-sub{text-align:center;font-size:13px;color:var(--brown-3);margin-bottom:26px;font-family:'JetBrains Mono',monospace;}
        .price-divider{height:1px;background:var(--line);margin:0 -36px 24px;}
        .price-list{list-style:none;padding:0;margin:0 0 28px;display:grid;gap:12px;}
        .price-list li{display:flex;align-items:flex-start;gap:12px;font-size:15px;color:var(--brown-2);}
        .price-list li svg{flex:0 0 auto;margin-top:2px;color:var(--amber-dark);}
        .price-list li b{color:var(--brown);font-weight:600;}
        .price-cta{width:100%;justify-content:center;}
        footer{background:var(--cream);padding:64px 0 40px;border-top:1px solid var(--line);}
        .foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:48px;}
        .foot-brand p{margin:16px 0 0;color:var(--brown-3);font-size:14px;max-width:280px;line-height:1.55;}
        .foot-col h5{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--brown-3);margin:0 0 16px;font-weight:500;}
        .foot-col ul{list-style:none;padding:0;margin:0;display:grid;gap:10px;}
        .foot-col a{font-size:14.5px;color:var(--brown-2);transition:color .15s ease;}
        .foot-col a:hover{color:var(--amber-dark);}
        .foot-bottom{display:flex;justify-content:space-between;align-items:center;padding-top:28px;border-top:1px solid var(--line);font-size:13px;color:var(--brown-3);}
        .foot-bottom-links{display:flex;gap:24px;}
        @media(max-width:960px){
          .hero{padding:48px 0 60px;}.hero-grid{grid-template-columns:1fr;gap:48px;}.hero-visual{justify-self:center;max-width:380px;}.nav-links{display:none;}.features{grid-template-columns:repeat(2,1fr);}.flows{grid-template-columns:1fr;}.domain-grid{grid-template-columns:1fr;}.foot-grid{grid-template-columns:1fr 1fr;gap:32px;}.how,.get,.domains,.pricing{padding:72px 0;}
        }
        @media(max-width:540px){
          .container{padding:0 20px;}.features{grid-template-columns:1fr;}.foot-grid{grid-template-columns:1fr;}.foot-bottom{flex-direction:column;gap:14px;}.cta-row{flex-direction:column;align-items:stretch;}.btn{justify-content:center;}.hero-meta{gap:14px;}.price-card{padding:36px 26px;}.price-divider{margin:0 -26px 24px;}.price-amount{font-size:54px;}.domain-card{padding:30px 24px;gap:20px;}.domain-emoji{font-size:44px;}
        }
      `}</style>

      <svg width="0" height="0" style={{position:"absolute"}} aria-hidden="true">
        <symbol id="paw" viewBox="0 0 40 40">
          <ellipse cx="20" cy="26" rx="9" ry="8" fill="currentColor"/>
          <ellipse cx="9" cy="16" rx="4" ry="5" fill="currentColor"/>
          <ellipse cx="31" cy="16" rx="4" ry="5" fill="currentColor"/>
          <ellipse cx="15" cy="8" rx="3.2" ry="4" fill="currentColor"/>
          <ellipse cx="25" cy="8" rx="3.2" ry="4" fill="currentColor"/>
        </symbol>
      </svg>

      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="logo">
            <span className="logo-mark"><svg width="20" height="20" aria-hidden="true"><use href="#paw" style={{color:"#FFFDF8"}}/></svg></span>
            PetID
          </Link>
          <nav className="nav-links" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#features">What you get</a>
            <a href="#domains">Domains</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <Link href="/register/" className="nav-cta">
            Connect Wallet
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="paw-field" aria-hidden="true">
          <svg className="paw" style={{top:"10%",left:"4%",width:"64px",height:"64px",transform:"rotate(-22deg)"}}><use href="#paw"/></svg>
          <svg className="paw" style={{top:"68%",left:"2%",width:"44px",height:"44px",transform:"rotate(18deg)",opacity:.06}}><use href="#paw"/></svg>
          <svg className="paw" style={{top:"85%",left:"44%",width:"36px",height:"36px",transform:"rotate(-8deg)",opacity:.06}}><use href="#paw"/></svg>
          <svg className="paw" style={{top:"6%",right:"38%",width:"28px",height:"28px",transform:"rotate(40deg)",opacity:.05}}><use href="#paw"/></svg>
        </div>
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-dot"><svg width="10" height="10" aria-hidden="true"><use href="#paw" style={{color:"#FFFDF8"}}/></svg></span>
              Now minting on Ethereum
            </span>
            <h1 className="hero-title">Give your pet a <em>permanent</em> website.</h1>
            <p className="hero-sub">
              PetID mints a readable ENS subdomain for your dog or cat — <code>name.dogid.eth</code> or <code>name.catid.eth</code> — pins a profile page to IPFS so it lives forever, and hands you a printable QR collar tag. One tap finds you if they wander.
            </p>
            <div className="cta-row">
              <Link href="/register/" className="btn btn-primary">
                Connect Wallet &amp; Mint <span className="btn-price">0.00825 ETH</span>
              </Link>
              <span className="coming-soon">
                <span className="coming-soon-dot"/>
                💳 Credit card — Coming Soon
              </span>
            </div>
            <div className="hero-meta">
              <span><span className="check">✓</span> No monthly fees</span>
              <span><span className="check">✓</span> Yours forever</span>
              <span><span className="check">✓</span> Instant on-chain</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="stack-card stack-profile">
              <div className="profile-photo" aria-label="Max, a golden retriever"></div>
              <div className="profile-name">Max</div>
              <div className="profile-ens">max.dogid.eth</div>
              <div className="profile-rows">
                <div className="profile-row"><span>Breed</span><b>Golden Retriever</b></div>
                <div className="profile-row"><span>Born</span><b>Mar 2022</b></div>
                <div className="profile-row"><span>Owner</span><b>alex.eth</b></div>
                <div className="profile-row"><span>Storage</span><b>IPFS · pinned</b></div>
              </div>
            </div>
            <div className="stack-card stack-tag">
              <div className="collar-ring"></div>
              <div className="tag-title">Scan if lost</div>
              <div className="tag-sub">max.dogid.eth</div>
              <div className="qr-real" aria-label="QR code">
                <i/><i/><i/><i/><i/><i/><i/><i className="off"/><i/><i/><i/><i/><i/>
                <i/><i className="off"/><i className="off"/><i className="off"/><i className="off"/><i className="off"/><i/><i className="off"/><i/><i className="off"/><i className="off"/><i className="off"/><i/>
                <i/><i className="off"/><i/><i/><i/><i className="off"/><i/><i/><i/><i className="off"/><i/><i className="off"/><i/>
                <i/><i className="off"/><i/><i/><i/><i className="off"/><i/><i className="off"/><i/><i className="off"/><i/><i className="off"/><i/>
                <i/><i className="off"/><i/><i/><i/><i className="off"/><i className="off"/><i/><i/><i className="off"/><i/><i className="off"/><i/>
                <i/><i className="off"/><i className="off"/><i className="off"/><i className="off"/><i className="off"/><i/><i className="off"/><i/><i className="off"/><i className="off"/><i className="off"/><i/>
                <i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/>
                <i/><i className="off"/><i/><i className="off"/><i/><i/><i className="off"/><i/><i className="off"/><i/><i/><i className="off"/><i/>
                <i/><i/><i/><i/><i/><i/><i/><i className="off"/><i/><i className="off"/><i/><i/><i className="off"/>
                <i/><i className="off"/><i className="off"/><i className="off"/><i className="off"/><i className="off"/><i/><i/><i className="off"/><i/><i/><i className="off"/><i/>
                <i/><i className="off"/><i/><i/><i/><i className="off"/><i/><i className="off"/><i/><i/><i className="off"/><i/><i/>
                <i/><i className="off"/><i/><i/><i/><i className="off"/><i/><i/><i className="off"/><i/><i/><i/><i className="off"/>
                <i/><i/><i/><i/><i/><i/><i/><i className="off"/><i/><i/><i className="off"/><i/><i/>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">How it works</div>
            <h2 className="section-title">Connect your wallet. Mint in <em>minutes</em>.</h2>
            <p className="section-lede">No middlemen, no custody — the ENS subdomain goes directly to your wallet the moment the transaction confirms.</p>
          </div>
          <div className="flows">
            <div className="flow flow-soon" aria-hidden="true" style={{position:"relative"}}>
              <div className="flow-soon-badge">Coming Soon</div>
              <div className="flow-head">
                <div className="flow-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>
                  Credit card
                </div>
                <div className="flow-meta"><b>$19.99</b> · no gas fees · claim later</div>
              </div>
              <ol className="flow-steps">
                <li><div className="flow-num">01</div><div className="flow-body"><h4>Fill out the profile</h4><p>Name, breed, photo, emergency contact. Pick a subdomain — <code>max.dogid.eth</code>.</p></div></li>
                <li><div className="flow-num">02</div><div className="flow-body"><h4>Pay $19.99 by card</h4><p>No wallet needed. We hold the ENS subdomain in custody and pin your profile to IPFS immediately.</p></div></li>
                <li><div className="flow-num">03</div><div className="flow-body"><h4>Claim to a wallet anytime</h4><p>Download the QR tag now. Later, connect any wallet to transfer ownership — we cover the claim.</p></div></li>
              </ol>
            </div>
            <div className="flow flow-wallet">
              <div className="flow-head">
                <div className="flow-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><circle cx="16" cy="13" r="1.3" fill="currentColor"/></svg>
                  Connect wallet
                </div>
                <div className="flow-meta"><b>0.00825 ETH</b> + gas · instant transfer</div>
              </div>
              <ol className="flow-steps">
                <li><div className="flow-num">01</div><div className="flow-body"><h4>Connect &amp; choose a name</h4><p>Pick <code>dogid.eth</code> or <code>catid.eth</code>. Check availability live — no surprises.</p></div></li>
                <li><div className="flow-num">02</div><div className="flow-body"><h4>Build the profile</h4><p>Photo, bio, health info, emergency contact. Choose a template for the IPFS profile page.</p></div></li>
                <li><div className="flow-num">03</div><div className="flow-body"><h4>Mint &amp; set contenthash</h4><p>One transaction registers the subdomain, uploads to IPFS, and sets the contenthash — all in one step.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section className="get" id="features">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">What's included</div>
            <h2 className="section-title">Everything your pet needs to be <em>found</em>.</h2>
            <p className="section-lede">One purchase. No renewals, no subscriptions, no lock-in.</p>
          </div>
          <div className="features">
            <div className="feature">
              <div className="feature-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4M3 17l9 4 9-4"/></svg></div>
              <h4>ENS subdomain</h4>
              <p>A readable, portable Ethereum name you own. Works in any wallet.</p>
              <div className="feature-code">max.dogid.eth</div>
            </div>
            <div className="feature">
              <div className="feature-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg></div>
              <h4>IPFS profile page</h4>
              <p>Photos, bio, vet &amp; emergency contacts — content-addressed, pinned, yours.</p>
              <div className="feature-code">ipfs://bafy...a4f2</div>
            </div>
            <div className="feature">
              <div className="feature-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-7-7.58-7-12a7 7 0 1 1 14 0c0 4.42-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></svg></div>
              <h4>Found Pet button</h4>
              <p>Finder taps once — owner contact shows instantly on the profile page.</p>
              <div className="feature-code">1-tap alert</div>
            </div>
          </div>
        </div>
      </section>

      <section className="domains" id="domains">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Pick a home</div>
            <h2 className="section-title">Two domains. <em>Infinite</em> good names.</h2>
            <p className="section-lede">Every PetID lives under one of these parents. Claim your pet's before someone else does.</p>
          </div>
          <div className="domain-grid">
            <Link href="/register/" className="domain-card dog">
              <div className="domain-count">12,847 claimed</div>
              <div className="domain-emoji">🐕</div>
              <div className="domain-body">
                <h3>dogid.eth</h3>
                <div className="domain-url">yourdog.dogid.eth</div>
                <p>For retrievers, mutts, corgis, and everyone in between.</p>
              </div>
            </Link>
            <Link href="/register/" className="domain-card cat">
              <div className="domain-count">8,214 claimed</div>
              <div className="domain-emoji">🐈</div>
              <div className="domain-body">
                <h3>catid.eth</h3>
                <div className="domain-url">yourcat.catid.eth</div>
                <p>For tabbies, tuxedos, and the occasional dignified tortie.</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="paw-field" aria-hidden="true">
          <svg className="paw" style={{top:"12%",left:"8%",width:"80px",height:"80px",transform:"rotate(-18deg)"}}><use href="#paw"/></svg>
          <svg className="paw" style={{bottom:"10%",right:"10%",width:"60px",height:"60px",transform:"rotate(22deg)"}}><use href="#paw"/></svg>
          <svg className="paw" style={{top:"60%",left:"14%",width:"34px",height:"34px",transform:"rotate(8deg)"}}><use href="#paw"/></svg>
        </div>
        <div className="container" style={{position:"relative",zIndex:1}}>
          <div className="section-head">
            <div className="section-kicker">Pricing</div>
            <h2 className="section-title">One price. <em>Forever</em>.</h2>
            <p className="section-lede">No renewals. No annual fees. The ENS name and IPFS pin are yours for as long as the internet exists.</p>
          </div>
          <div className="price-card">
            <span className="price-badge">CRYPTO · WALLET-NATIVE</span>
            <div className="price-label">PetID — Complete</div>
            <div className="price-row"><span className="price-amount">0.00825</span><span className="price-unit">ETH / one-time</span></div>
            <div className="price-sub">+ gas · credit card coming soon</div>
            <div className="price-divider"></div>
            <ul className="price-list">
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg><span><b>ENS subdomain</b> on dogid.eth or catid.eth</span></li>
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg><span><b>IPFS profile page</b> — pinned permanently, no renewals</span></li>
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg><span><b>Contenthash set on-chain</b> — resolves instantly via ENS</span></li>
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg><span><b>Found Pet button</b> with owner contact on every profile</span></li>
              <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg><span><b>Transferable</b> — move it to any wallet, anytime</span></li>
            </ul>
            <Link href="/register/" className="btn btn-primary price-cta">
              Connect Wallet &amp; Mint
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="container">
          <div className="foot-grid">
            <div className="foot-brand">
              <Link href="/" className="logo">
                <span className="logo-mark"><svg width="20" height="20" aria-hidden="true"><use href="#paw" style={{color:"#FFFDF8"}}/></svg></span>
                PetID
              </Link>
              <p>A permanent digital identity for your pet. Built on ENS, stored on IPFS, printed by you.</p>
            </div>
            <div className="foot-col">
              <h5>Product</h5>
              <ul>
                <li><a href="#how">How it works</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#domains">Domains</a></li>
                <li><a href="#pricing">Pricing</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h5>Resources</h5>
              <ul>
                <li><a href="#">FAQ</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h5>Connect</h5>
              <ul>
                <li><a href="https://twitter.com/petidentity" target="_blank" rel="noopener noreferrer">Twitter @petidentity</a></li>
                <li><a href="mailto:petid@onchain-id.id">petid@onchain-id.id</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 PetID Labs · Made with 🐾 for good boys &amp; girls.</span>
            <div className="foot-bottom-links">
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
